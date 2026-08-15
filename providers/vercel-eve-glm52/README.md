# OpenMinis → Vercel Eve → GLM-5.2 provider bridge

This subproject makes the official Vercel **Eve** agent runtime available to **OpenMinis** as a Custom OpenAI-compatible provider.

## Why this architecture

The August 2026 Vercel changelog is titled **“GLM-5.2 free for Eve agents through August 27 via Blackbox on AI Gateway.”** The safest interpretation is that the model call must genuinely originate from an Eve agent. This bridge therefore does **not** spoof an Eve user-agent and does **not** send Minis directly to Blackbox.

Instead:

```text
OpenMinis (iPhone)
  └─ Custom OpenAI-compatible provider
      └─ POST /v1/chat/completions
          └─ official Eve runtime
              └─ model: zai/glm-5.2
                  └─ Vercel AI Gateway promotional routing
```

Eve's current official configuration accepts AI Gateway model IDs, and `zai/glm-5.2` is also Eve's current default model. The public AI Gateway GLM-5.2 catalog normally shows paid provider rates, so **the promotion must be treated as a separate, temporary Eve-specific benefit, not as a generally free GLM-5.2 endpoint.**

The bridge intentionally does not hard-code `providerOptions.gateway.only=["blackbox"]`: the normal public GLM-5.2 provider catalog may not expose Blackbox as a standard endpoint, while the promotion can apply special Eve-side routing. Hard-coding a provider slug could therefore disable the promotional path rather than enable it.

## Safety properties

- The upstream model is locked to `zai/glm-5.2`; a Minis client cannot switch this bridge to a paid model.
- `AI_GATEWAY_API_KEY` stays on the server. Minis receives only the separate `MINIS_BRIDGE_API_KEY`.
- The bridge fails closed after the configured promotion boundary unless `ALLOW_PAID_AFTER_PROMO=true` is set explicitly.
- Secrets are environment variables only and are ignored by Git.
- Both non-streaming Chat Completions and OpenAI-style SSE streaming are supported.
- `/v1/models` exposes only GLM-5.2.

## Current compatibility scope

This first version is a **text/chat compatibility bridge**. OpenAI-format `messages` are converted into a role-preserving transcript and run through Eve. Client-provided OpenAI `tools` schemas are not executed by this bridge yet. This choice keeps the first deployment small and, most importantly, keeps the actual inference call inside Eve for promotion eligibility.

Minis Skills/MCP can still be used outside this specific model-call compatibility layer, but OpenAI function-call round trips from Minis require a later v2 adapter.

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

## Vercel deployment

Create/import a Vercel project from this GitHub repository and set the project **Root Directory** to:

```text
providers/vercel-eve-glm52
```

Add `MINIS_BRIDGE_API_KEY` as a secret environment variable. If the deployment does not receive AI Gateway credentials from Vercel automatically, also configure `AI_GATEWAY_API_KEY` through Vercel's secret/environment UI.

Before using it heavily, make one tiny request and inspect **AI Gateway Observability / Usage**. Continue only when the GLM-5.2 Eve request is actually reported at **$0** under the promotion. The fail-closed date guard reduces accidental post-promotion spend but cannot independently prove billing status.

## OpenMinis configuration

In Minis, add a **Custom / OpenAI-compatible** provider:

```text
Name: Vercel Eve GLM-5.2
Base URL: https://<your-vercel-deployment>.vercel.app
Append /v1: ON
API Key: <MINIS_BRIDGE_API_KEY>
Model: zai/glm-5.2
```

Do not enter the Vercel AI Gateway key in Minis. The phone should know only the bridge key.

After saving, refresh/fetch models. If Minis does not populate the model list automatically, enter `zai/glm-5.2` manually.

## Verification checklist

1. `GET /health` returns `ok: true` and `runtime: "eve"`.
2. `GET /v1/models` returns only `zai/glm-5.2`.
3. A small non-streaming request returns an OpenAI `chat.completion` object.
4. A streaming request ends with `data: [DONE]`.
5. Vercel AI Gateway observability confirms the request came from the Eve deployment.
6. **Cost is $0 under the promotion before increasing usage.**
7. Leave `ALLOW_PAID_AFTER_PROMO=false` unless paid inference is intentionally approved.

## Promotion source

Official Vercel changelog URL supplied for this implementation:

`https://vercel.com/changelog/glm-5-2-free-for-eve-agents-through-august-27-via-blackbox-on-ai-gateway`
