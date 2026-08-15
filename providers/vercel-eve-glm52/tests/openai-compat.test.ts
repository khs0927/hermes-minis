import { afterEach, describe, expect, it } from "vitest";

import {
  MODEL_ID,
  assertSafeToRun,
  buildEvePrompt,
  completionEnvelope,
  messageText,
  validateModel,
} from "../agent/lib/openai-compat";

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

  it("returns an OpenAI-style completion envelope", () => {
    const response = completionEnvelope("chatcmpl_test", "four", 123);
    expect(response.model).toBe(MODEL_ID);
    expect(response.choices[0]?.message.content).toBe("four");
    expect(response.choices[0]?.finish_reason).toBe("stop");
  });
});
