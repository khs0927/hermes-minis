import { defineAgent } from "eve";

/**
 * Keep the model call inside the official Eve runtime.
 *
 * The August 2026 Vercel promotion is described as applying to GLM-5.2 for
 * Eve agents via Blackbox on AI Gateway. We intentionally do NOT spoof a
 * client User-Agent or call Blackbox directly. Eve owns the AI Gateway model
 * call, which is the safest way to remain eligible for Eve-specific routing.
 */
export default defineAgent({
  model: "zai/glm-5.2",
  reasoning: "medium",
  limits: {
    maxInputTokensPerSession: 1_000_000,
    maxOutputTokensPerSession: 128_000,
    sessionTimeoutMs: 60 * 60 * 1_000,
  },
});
