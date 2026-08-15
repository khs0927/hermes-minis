import { randomUUID, timingSafeEqual } from "node:crypto";
import { defineChannel, GET, POST } from "eve/channels";

import {
  MODEL_ID,
  assertSafeToRun,
  buildEvePrompt,
  chunkEnvelope,
  completionEnvelope,
  openAIError,
  paidUseAllowed,
  promoEndAt,
  promoWindowOpen,
  type ChatCompletionsRequest,
  validateModel,
} from "../lib/openai-compat";

type EveStreamEvent = {
  type?: string;
  data?: Record<string, unknown>;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorize(request: Request): Response | null {
  const expected = process.env.MINIS_BRIDGE_API_KEY;
  if (!expected) {
    return Response.json(
      openAIError("Server is missing MINIS_BRIDGE_API_KEY.", "bridge_not_configured", "server_error"),
      { status: 503 },
    );
  }

  const supplied = bearerToken(request);
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return Response.json(openAIError("Invalid API key.", "invalid_api_key", "authentication_error"), {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    });
  }
  return null;
}

async function* decodeNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<EveStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as EveStreamEvent;
        } catch {
          // Ignore malformed/non-event lines rather than corrupting the client stream.
        }
      }
    }

    const tail = `${buffer}${decoder.decode()}`.trim();
    if (tail) {
      try {
        yield JSON.parse(tail) as EveStreamEvent;
      } catch {
        // Ignore trailing non-JSON text.
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function eventText(event: EveStreamEvent, key: "messageDelta" | "message"): string {
  const value = event.data?.[key];
  return typeof value === "string" ? value : "";
}

async function collectFinalText(stream: ReadableStream<Uint8Array>): Promise<string> {
  let appended = "";
  let completed = "";

  for await (const event of decodeNdjson(stream)) {
    if (event.type === "message.appended") appended += eventText(event, "messageDelta");
    if (event.type === "message.completed") {
      const finishReason = event.data?.finishReason;
      if (finishReason !== "tool-calls") completed = eventText(event, "message");
    }
    if (event.type === "session.failed") {
      const reason = typeof event.data?.error === "string" ? event.data.error : "Eve session failed";
      throw new Error(reason);
    }
    if (event.type === "session.waiting" || event.type === "session.completed") break;
  }

  return completed || appended;
}

function streamAsOpenAI(stream: ReadableStream<Uint8Array>, completionId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let emittedText = false;
      let finalText = "";

      const push = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        push(chunkEnvelope(completionId, { role: "assistant" }));

        for await (const event of decodeNdjson(stream)) {
          if (event.type === "message.appended") {
            const delta = eventText(event, "messageDelta");
            if (delta) {
              emittedText = true;
              push(chunkEnvelope(completionId, { content: delta }));
            }
          }

          if (event.type === "message.completed" && event.data?.finishReason !== "tool-calls") {
            finalText = eventText(event, "message");
          }

          if (event.type === "session.failed") {
            throw new Error("Eve session failed while streaming");
          }

          if (event.type === "session.waiting" || event.type === "session.completed") break;
        }

        if (!emittedText && finalText) {
          push(chunkEnvelope(completionId, { content: finalText }));
        }
        push(chunkEnvelope(completionId, {}, "stop"));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Eve stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(openAIError(message, "eve_stream_error", "server_error"))}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}

export default defineChannel({
  routes: [
    GET("/health", async (request) => {
      const denied = authorize(request);
      if (denied) return denied;

      return Response.json({
        ok: true,
        service: "minis-eve-glm52-provider",
        model: MODEL_ID,
        runtime: "eve",
        promoWindowOpen: promoWindowOpen(),
        promoEndAt: promoEndAt().toISOString(),
        paidUseAllowed: paidUseAllowed(),
      });
    }),

    GET("/v1/models", async (request) => {
      const denied = authorize(request);
      if (denied) return denied;

      return Response.json({
        object: "list",
        data: [
          {
            id: MODEL_ID,
            object: "model",
            created: 0,
            owned_by: "vercel-eve",
          },
        ],
      });
    }),

    POST("/v1/chat/completions", async (request, { from }) => {
      const denied = authorize(request);
      if (denied) return denied;

      try {
        assertSafeToRun();
        const body = (await request.json()) as ChatCompletionsRequest;
        validateModel(body.model);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const prompt = buildEvePrompt(messages);

        const sessionAddress = `openai-${randomUUID()}`;
        const session = await from(sessionAddress).send(prompt, {
          auth: {
            authenticator: "minis-bridge-key",
            principalType: "service",
            principalId: body.user || "minis",
            attributes: {
              requestedModel: body.model || MODEL_ID,
              client: "OpenMinis",
            },
          },
          turnPolicy: "queue",
        });

        const eveStream = (await session.getEventStream()) as ReadableStream<Uint8Array>;
        const completionId = `chatcmpl_${randomUUID().replaceAll("-", "")}`;

        if (body.stream) {
          return new Response(streamAsOpenAI(eveStream, completionId), {
            status: 200,
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              connection: "keep-alive",
              "x-eve-model": MODEL_ID,
            },
          });
        }

        const text = await collectFinalText(eveStream);
        return Response.json(completionEnvelope(completionId, text), {
          headers: { "x-eve-model": MODEL_ID },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const name = error instanceof Error ? error.name : "Error";
        const status = name === "PromotionExpiredError" ? 402 : name === "UnsupportedModelError" ? 400 : 500;
        const code =
          name === "PromotionExpiredError"
            ? "promotion_expired"
            : name === "UnsupportedModelError"
              ? "unsupported_model"
              : name === "InvalidRequestError"
                ? "invalid_request"
                : "eve_bridge_error";

        return Response.json(openAIError(message, code, status >= 500 ? "server_error" : "invalid_request_error"), {
          status,
        });
      }
    }),
  ],
});
