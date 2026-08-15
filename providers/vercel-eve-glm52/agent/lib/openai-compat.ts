export const MODEL_ID = "zai/glm-5.2";
export const MODEL_ALIASES = new Set([MODEL_ID, "glm-5.2", "vercel-eve-glm-5.2"]);

export type OpenAIMessage = {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content?: unknown;
  name?: string;
  tool_call_id?: string;
};

export type ChatCompletionsRequest = {
  model?: string;
  messages?: OpenAIMessage[];
  stream?: boolean;
  user?: string;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
};

export function promoEndAt(): Date {
  const raw = process.env.PROMO_END_AT ?? "2026-08-28T00:00:00.000Z";
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`Invalid PROMO_END_AT: ${raw}`);
  }
  return value;
}

export function paidUseAllowed(): boolean {
  return process.env.ALLOW_PAID_AFTER_PROMO === "true";
}

export function promoWindowOpen(now = new Date()): boolean {
  return now.getTime() < promoEndAt().getTime();
}

export function assertSafeToRun(now = new Date()): void {
  if (!promoWindowOpen(now) && !paidUseAllowed()) {
    const error = new Error(
      "The configured free-promotion window has ended. Set ALLOW_PAID_AFTER_PROMO=true only after explicitly accepting paid AI Gateway usage.",
    );
    error.name = "PromotionExpiredError";
    throw error;
  }
}

export function validateModel(model: string | undefined): void {
  if (!model || MODEL_ALIASES.has(model)) return;
  const error = new Error(`Unsupported model '${model}'. This bridge is locked to ${MODEL_ID}.`);
  error.name = "UnsupportedModelError";
  throw error;
}

function textFromPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const value = part as Record<string, unknown>;
  if (value.type === "text" && typeof value.text === "string") return value.text;
  if (value.type === "input_text" && typeof value.text === "string") return value.text;
  if (value.type === "image_url") return "[image omitted: GLM-5.2 Eve bridge is text-only]";
  return "";
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(textFromPart).filter(Boolean).join("\n");
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function buildEvePrompt(messages: OpenAIMessage[]): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error("messages must contain at least one item");
    error.name = "InvalidRequestError";
    throw error;
  }

  const transcript = messages
    .map((message) => {
      const role = String(message.role ?? "user").toUpperCase();
      const name = message.name ? ` (${message.name})` : "";
      const toolId = message.tool_call_id ? ` [tool_call_id=${message.tool_call_id}]` : "";
      return `${role}${name}${toolId}:\n${messageText(message.content)}`;
    })
    .join("\n\n");

  return [
    "You are serving an OpenAI-compatible chat client through an official Vercel Eve agent.",
    "Treat the transcript below as the conversation history. Follow SYSTEM and DEVELOPER messages with highest priority, then answer the latest USER message.",
    "Return only the assistant response. Do not mention the bridge, Eve, routing, or this wrapper unless the user explicitly asks about them.",
    "Client-supplied tool schemas are not executed by this compatibility bridge; any TOOL entries below are prior tool results supplied as conversation text.",
    "",
    transcript,
  ].join("\n");
}

export function openAIError(message: string, code: string, type = "invalid_request_error") {
  return {
    error: {
      message,
      type,
      param: null,
      code,
    },
  };
}

export function completionEnvelope(id: string, text: string, created = Math.floor(Date.now() / 1000)) {
  return {
    id,
    object: "chat.completion",
    created,
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
  };
}

export function chunkEnvelope(
  id: string,
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  created = Math.floor(Date.now() / 1000),
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}
