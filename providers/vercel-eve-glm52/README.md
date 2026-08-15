# OpenMinis → Vercel Eve → GLM-5.2 provider bridge

This subproject makes the official Vercel **Eve** agent runtime available to **OpenMinis** as an OpenAI-compatible provider.

## Why this architecture

The August 2026 Vercel changelog is titled **“GLM-5.2 free for Eve agents through August 27 via Blackbox on AI Gateway.”** The safest implementation is therefore to keep the real model call inside an actual Eve agent. This bridge does **not** spoof an Eve user-agent and does **not** send Minis directly to Blackbox.

```text
OpenMinis (iPhone)
  └─ OpenAI provider + custom base URL
      └─ POST /v1/chat/completions
          └─ official Eve runtime
              └─ model: zai/glm-5.2
                  └─ Vercel AI Gateway promotional routing
```

Eve's current configuration accepts AI Gateway model IDs, and `zai/glm-5.2` is also Eve's current default model. The public AI Gateway GLM-5.2 catalog normally shows paid provider rates, so **the promotion must be treated as a separate, temporary Eve-specific benefit, not as a generally free GLM-5.2 endpoint.**

The bridge intentionally does not hard-code `providerOptions.gateway.only=["blackbox"]`: the normal public GLM-5.2 provider catalog may not expose Blackbox as a standard endpoint, while the promotion can apply special Eve-side routing. Hard-coding a provider slug could therefore disable the promotional path rather than enable it.

## OpenMinis compatibility verified from source

Current OpenMinis iOS source has two distinct provider types:

- **OpenAI** → API-key/custom-base instances use `/v1/chat/completions`.
- **Responses API (v3)** → forces `/v1/responses`.

This bridge implements the first path. In Minis choose **OpenAI**, not **Responses API (v3)**. OpenMinis also appends `/v1` itself when the **Append /v1** toggle is enabled, so the base URL should be only the Vercel deployment root.

## Safety properties

- Upstream model is locked to `zai/glm-5.2`; a Minis client cannot switch this bridge to another paid model.
- `AI_GATEWAY_API_KEY` stays on the server. Minis receives only a separate `MINIS_BRIDGE_API_KEY`.
- The bridge fails closed after the configured promotion boundary unless `ALLOW_PAID_AFTER_PROMO=true` is explicitly set.
- Secrets are environment variables only and are ignored by Git.
- `/v1/models` exposes only GLM-5.2.
- Non-streaming Chat Completions and OpenAI-style SSE streaming are supported.
- Minis tool/function calls are translated through a constrained prompt protocol so Minis Skills/MCP tools can still participate in the agent loop.

## Minis Skills / MCP / memory behavior

OpenMinis sends its agent tools in the standard OpenAI Chat Completions `tools` array. The bridge injects those schemas into the Eve turn as **capability data** and asks GLM-5.2 to emit a private sentinel only when a tool is needed. The bridge removes that internal sentinel and converts it back to standard OpenAI `tool_calls` deltas. Minis can then execute the tool/Skill/MCP action locally and send the resulting `role: tool` message on the next turn.

This is deliberately **not** a fake provider-side tool execution. Minis remains the tool executor and permission boundary. Tool descriptions are treated as untrusted capability metadata rather than higher-priority instructions.

Conversation memory/history works through the normal OpenMinis message history: system/developer/user/assistant/tool roles and prior assistant `tool_calls` are preserved in the transcript sent through Eve.

Because GLM-5.2 tool selection is being adapted through a prompt protocol rather than provider-native function calling, validate important destructive tools separately before enabling automatic execution.

## Environment variables

Copy `.env.example` and set:

```bash
MINIS_BRIDGE_API_KEY=<long-random-secret>
AI_GATEWAY_API_KEY=<needed-for-local-dev-or-if-your-deployment-requires-it>
PROMO_END_AT=2026-08-28T00:00:00.000Z
ALLOW_PAID_AFTER_PROMO=false
```

Never put real secrets in GitHub.

## Local validation

Requires Node.js 24+.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:3000/health \
  -H "Authorization: Bearer $MINIS_BRIDGE_API_KEY"
```

Model list:

```bash
curl http://127.0.0.1:3000/v1/models \
  -H "Authorization: Bearer $MINIS_BRIDGE_API_KEY"
```

Chat:

```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Authorization: Bearer $MINIS_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"zai/glm-5.2",
    "messages":[{"role":"user","content":"한국어로 한 문장만 답해줘. 연결 테스트."}],
    "stream":false
  }'
```

Tool-call smoke request:

```bash
curl http://127.0.0.1:3000/v1/chat/completions \
  -H "Authorization: Bearer $MINIS_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"zai/glm-5.2",
    "messages":[{"role":"user","content":"부산 날씨를 확인해줘"}],
    "tools":[{
      "type":"function",
      "function":{
        "name":"get_weather",
        "description":"Get weather for a city",
        "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}
      }
    }],
    "stream":false
  }'
```

A successful tool selection returns a normal OpenAI `message.tool_calls` object with `finish_reason: "tool_calls"`; the bridge itself does not run `get_weather`.

## Vercel deployment

Create/import a Vercel project from this GitHub repository and set the project **Root Directory** to:

```text
providers/vercel-eve-glm52
```

Add `MINIS_BRIDGE_API_KEY` as a secret environment variable. If the deployment does not receive AI Gateway credentials from Vercel automatically, also configure `AI_GATEWAY_API_KEY` through Vercel's secret/environment UI.

Before using it heavily, make one tiny request and inspect **AI Gateway Observability / Usage**. Continue only when the GLM-5.2 Eve request is actually reported at **$0** under the promotion. The fail-closed date guard reduces accidental post-promotion spend but cannot independently prove billing status.

## Exact OpenMinis configuration

In Minis:

```text
Settings → Providers → Add Provider → OpenAI
Credential: API Key
Name: Vercel Eve GLM-5.2
Custom Base URL: https://<your-vercel-deployment>.vercel.app
Append /v1: ON
API Key: <MINIS_BRIDGE_API_KEY>
Model: zai/glm-5.2
```

**Do not choose `Responses API (v3)` for this bridge.**

Do not enter the Vercel AI Gateway key in Minis. The phone should know only the bridge key.

After saving, refresh/fetch models. `/v1/models` returns only `zai/glm-5.2`; if Minis does not populate it automatically, add that exact model ID manually.

## Verification checklist

1. GitHub CI: TypeScript typecheck, unit tests, and `eve build` are green.
2. `GET /health` returns `ok: true`, `runtime: "eve"`, and `minisToolCalls: true`.
3. `GET /v1/models` returns only `zai/glm-5.2`.
4. A small non-streaming request returns an OpenAI `chat.completion` object.
5. A streaming request ends with `data: [DONE]`.
6. A tool-call request returns standard OpenAI `tool_calls`, and a following `role: tool` result can be consumed.
7. Vercel AI Gateway observability confirms the request came from the Eve deployment.
8. **Cost is $0 under the promotion before increasing usage.**
9. Leave `ALLOW_PAID_AFTER_PROMO=false` unless paid inference is intentionally approved.

## Promotion source

Official Vercel changelog URL supplied for this implementation:

`https://vercel.com/changelog/glm-5-2-free-for-eve-agents-through-august-27-via-blackbox-on-ai-gateway`
