import { afterEach, describe, expect, it } from "vitest";

import {
  MODEL_ID,
  TOOL_SENTINEL_CLOSE,
  TOOL_SENTINEL_OPEN,
  assertSafeToRun,
  buildEvePrompt,
  completionEnvelope,
  messageText,
  parseAssistantOutput,
  toolCompletionEnvelope,
  validateModel,
} from "../agent/lib/openai-compat";
import { minisSetupPage } from "../agent/lib/minis-setup-page";

const originalPromoEnd = process.env.PROMO_END_AT;
const originalAllowPaid = process.env.ALLOW_PAID_AFTER_PROMO;

afterEach(() => {
  if (originalPromoEnd === undefined) delete process.env.PROMO_END_AT;
  else process.env.PROMO_END_AT = originalPromoEnd;

  if (originalAllowPaid === undefined) delete process.env.ALLOW_PAID_AFTER_PROMO;
  else process.env.ALLOW_PAID_AFTER_PROMO = originalAllowPaid;
});

describe("model lock", () => {
  it("accepts only the GLM-5.2 bridge aliases", () => {
    expect(() => validateModel(MODEL_ID)).not.toThrow();
    expect(() => validateModel("glm-5.2")).not.toThrow();
    expect(() => validateModel("openai/gpt-5.6-sol")).toThrow(/locked to/);
  });
});

describe("promotion cost guard", () => {
  it("fails closed after the promotion window", () => {
    process.env.PROMO_END_AT = "2026-08-28T00:00:00.000Z";
    process.env.ALLOW_PAID_AFTER_PROMO = "false";
    expect(() => assertSafeToRun(new Date("2026-08-28T00:00:01.000Z"))).toThrow(/promotion window has ended/i);
  });

  it("allows an explicit paid override", () => {
    process.env.PROMO_END_AT = "2026-08-28T00:00:00.000Z";
    process.env.ALLOW_PAID_AFTER_PROMO = "true";
    expect(() => assertSafeToRun(new Date("2026-08-28T00:00:01.000Z"))).not.toThrow();
  });
});

describe("OpenAI compatibility", () => {
  it("flattens common content parts", () => {
    expect(messageText([{ type: "text", text: "hello" }, { type: "input_text", text: "world" }])).toBe(
      "hello\nworld",
    );
  });

  it("preserves conversation roles in the Eve prompt", () => {
    const prompt = buildEvePrompt([
      { role: "system", content: "Be precise." },
      { role: "user", content: "2+2?" },
    ]);
    expect(prompt).toContain("SYSTEM:\nBe precise.");
    expect(prompt).toContain("USER:\n2+2?");
  });

  it("adds Minis tool schemas without treating them as higher-priority instructions", () => {
    const prompt = buildEvePrompt(
      [{ role: "user", content: "What is the weather?" }],
      [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Return current weather",
            parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
          },
        },
      ],
      "auto",
    );
    expect(prompt).toContain("AVAILABLE_TOOLS=");
    expect(prompt).toContain("get_weather");
    expect(prompt).toContain(TOOL_SENTINEL_OPEN);
  });

  it("preserves prior assistant tool calls and tool results in transcript context", () => {
    const prompt = buildEvePrompt([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":\"x\"}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "result-x" },
    ]);
    expect(prompt).toContain("TOOL_CALLS:");
    expect(prompt).toContain("lookup");
    expect(prompt).toContain("TOOL [tool_call_id=call_1]:\nresult-x");
  });

  it("parses the sentinel tool protocol into standard OpenAI tool calls", () => {
    const raw = `${TOOL_SENTINEL_OPEN}{"tool_calls":[{"name":"get_weather","arguments":{"city":"Busan"}}]}${TOOL_SENTINEL_CLOSE}`;
    const parsed = parseAssistantOutput(raw, true);
    expect(parsed.kind).toBe("tool_calls");
    if (parsed.kind !== "tool_calls") throw new Error("expected tool calls");
    expect(parsed.toolCalls[0]?.function.name).toBe("get_weather");
    expect(JSON.parse(parsed.toolCalls[0]?.function.arguments ?? "{}")).toEqual({ city: "Busan" });
  });

  it("does not interpret tool-call text when client tool use is disabled", () => {
    const raw = `${TOOL_SENTINEL_OPEN}{"tool_calls":[{"name":"x","arguments":{}}]}${TOOL_SENTINEL_CLOSE}`;
    expect(parseAssistantOutput(raw, false)).toEqual({ kind: "text", text: raw });
  });

  it("returns an OpenAI-style completion envelope", () => {
    const response = completionEnvelope("chatcmpl_test", "four", 123);
    expect(response.model).toBe(MODEL_ID);
    expect(response.choices[0]?.message.content).toBe("four");
    expect(response.choices[0]?.finish_reason).toBe("stop");
  });

  it("returns an OpenAI-style tool-call envelope", () => {
    const parsed = parseAssistantOutput(
      `${TOOL_SENTINEL_OPEN}{"tool_calls":[{"name":"lookup","arguments":{"q":"abc"}}]}${TOOL_SENTINEL_CLOSE}`,
      true,
    );
    if (parsed.kind !== "tool_calls") throw new Error("expected tool calls");
    const response = toolCompletionEnvelope("chatcmpl_tool", parsed.toolCalls, 123);
    expect(response.choices[0]?.finish_reason).toBe("tool_calls");
    expect(response.choices[0]?.message.tool_calls[0]?.function.name).toBe("lookup");
  });
});

describe("mobile Minis setup page", () => {
  it("binds the provider template to the deployment origin and OpenAI protocol", () => {
    const html = minisSetupPage("https://minis-eve.example.com/setup?x=1");
    expect(html).toContain("https://minis-eve.example.com");
    expect(html).toContain("providerType: 'openAI'");
    expect(html).toContain("appendV1Suffix: true");
    expect(html).toContain(MODEL_ID);
    expect(html).toContain("Or Import Provider from File");
  });

  it("does not embed a configured bridge secret in the generated HTML", () => {
    process.env.MINIS_BRIDGE_API_KEY = "server-secret-that-must-not-appear";
    const html = minisSetupPage("https://minis-eve.example.com/setup");
    expect(html).not.toContain("server-secret-that-must-not-appear");
  });
});
