# Hermes Minis — iOS AI Agent

**Run the NousResearch Hermes Agent entirely on an iPhone (Minis + iSH), with Telegram gateway and web dashboard — no VPS required.**

Hermes Minis ports the full Hermes Agent v0.19.1 stack to iSH (Alpine Linux, aarch64) inside the Minis LLM app. A Telegram bot becomes the command interface; a web dashboard on `http://127.0.0.1:9119` gives you a visual UI. For 24/7 uptime, a one-click VPS bootstrap script is included.

---

## Architecture

```
iPhone (Minis + iSH)
├── Hermes Agent v0.19.1 (Nous Research)
│   ├── NVIDIA NIM (86 chat models, 16 specialists)
│   ├── AeroLink GPT-5.6 Luna + Claude Opus verification
│   └── Korean natural-language sub-agent orchestrator
├── Telegram Gateway (hermes-minis CLI)
├── Web Dashboard (port 9119)
├── 73 Minis Skills (auto-loaded)
└── MCP Servers: khs0927 toolbox, Google Drive, complete-agent
```

## Quick Start

```bash
# 1. Validate
hermes-minis check

# 2. Configure Telegram
hermes-minis configure-telegram

# 3. Start the gateway
hermes-minis start

# 4. (Optional) Web dashboard
hermes-dashboard start
# → http://127.0.0.1:9119
```

## CLI Reference

| Command | Purpose |
|---------|---------|
| `hermes-minis status` | Gateway + credential status |
| `hermes-minis start` | Start Telegram gateway with PID tracking |
| `hermes-minis stop` | Stop gateway |
| `hermes-minis restart` | Restart gateway |
| `hermes-minis logs` | View gateway logs |
| `hermes-minis configure-telegram` | Interactive Telegram bot config |
| `hermes-minis check` | Validate python, Hermes, config, network |
| `hermes-dashboard start/stop/status/logs` | Web dashboard management |

## AI Commands

```bash
# Quick request (auto-routed via Korean orchestrator)
hermes "한국어 요청"

# Explicit role routing
hermes-ai "prompt" --role code
hermes-ai "prompt" --role expert

# Explicit model
hermes-ai "prompt" --model z-ai/glm-5.2

# List available models
hermes-ai --list-models
hermes-ai --roles
```

## Sub-Agent Architecture (Korean Orchestrator)

Requests are automatically routed through 5 specialized workers:

| Role | Responsibility | Default Model |
|------|---------------|---------------|
| `planner` | Request decomposition and task ordering | `openai/gpt-oss-120b` |
| `sys-agent` | iOS/Minis native functions, device/files | `openai/gpt-oss-20b` |
| `coder-agent` | Code writing, execution, debugging | `deepseek-ai/deepseek-v4-flash` |
| `fetch-agent` | Web/browser/external data collection | `openai/gpt-oss-120b` + `meta/llama-3.1-70b` |
| `reviewer` | Independent fact-checking and final synthesis | `z-ai/glm-5.2` + `deepseek-ai/deepseek-v4-pro` |

**Recovery policy**: Luna (gpt-5.6-luna) first → Claude Opus (claude-opus-5) final verification.

## Model Fallback — Hybrid Orchestrator

87 models across 3 providers with automatic fallback:
- **5 ensemble strategies**: FAST_TO_EXPERT_TO_MERGE, INDEPENDENT_EXPERT_PANEL, CODER_TO_ARCHITECT_TO_TEST, LONG_CONTEXT_PANEL, ADVERSARIAL_REVIEW
- **4 task importance levels**: ROUTINE → STANDARD → IMPORTANT → CRITICAL
- **Health tracking**: per-model latency, error count, HEALTHY/SLOW/DEAD status

## Prerequisites

1. **Telegram Bot Token**: Create with [@BotFather](https://t.me/BotFather) (`/newbot`)
2. **Telegram User ID**: Find with [@userinfobot](https://t.me/userinfobot) (`/start`)
3. **API Keys**: NVIDIA NIM (`NVIDIA_API_KEY`), AeroLink (`AEROLINK_API_KEY`), Smithery (`SMITHERY_API_KEY`) — all as env variables only

## Limitations

- **iOS suspend**: background processes suspended by iOS → 24/7 keeping requires VPS or Apple Shortcuts automation
- **iSH constraints**: no Docker daemon (use `podman`), no OpenCV (musl ABI bug), no Dart SDK (ARM64 compatibility)
- **Secrets**: API keys are env-var only, never stored in files or memory

## VPS Deployment (optional)

```bash
# Bootstrap script for Ubuntu VPS (root)
bash scripts/vps_bootstrap.sh
```

The VPS bootstrap copies this repo to `/var/minis/shared/hermes-minis/repo`, installs the CLI files to `/root/.hermes/bin`, and registers a systemd unit for 24/7 uptime. Without a Telegram token it provisions only and prints the start steps.

## File Map

```
/root/.hermes/hermes-agent/         Upstream Hermes v0.19.1 source
/root/.hermes/.venv/               Python 3.12 venv (uv-managed)
/root/.hermes/config.yaml           NVIDIA + Minis skill config
/root/.hermes/hermes_orchestrator.py  Korean sub-agent dispatcher
/root/.hermes/hermes_run.py         Direct model runner
/usr/local/bin/hermes               Global orchestrator CLI
/usr/local/bin/hermes-ai            Model-aware runner CLI
/usr/local/bin/hermes-minis         Gateway lifecycle CLI
/usr/local/bin/hermes-dashboard     Dashboard lifecycle CLI
/var/minis/skills/hermes-minis/    Minis skill definition
```

## Security

- API keys are **environment variables only** — never in code, memory, or trace
- Provider auth uses `$$ENV_VAR` placeholders resolved at runtime
- Claude Opus verification gate before marking any task "complete"

## Model Ecosystem

| Provider | Models | Notes |
|----------|--------|-------|
| NVIDIA NIM | 102 total (86 chat + 16 specialist) | OpenAI-compatible | 
| AeroLink GPT-5.6 | `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra` | Primary recovery |
| AeroLink Claude | `claude-opus-5`, `claude-opus-4-8` | Final verifier |

---

## Status

**Verified**: All gateway/dashboard/hermes-ai/hermes-mcp commands confirmed working on iOS iSH (2026-08-03).

**Origin**: Ported from [tutorial video](https://youtu.be/LMBX5qZ-DuA) (Hostinger VPS → Hermes Agent).