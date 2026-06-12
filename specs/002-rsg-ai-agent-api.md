# 002 — RSG AI agent API

**Status:** shipped 2026-06-11; audit logging added 2026-06-12 (PR #4)

## Problem / Goal

Give the accounting/CS/ops teams a chat assistant with CLI-agent behavior
(autonomous multi-step tool use, streamed progress) behind RSG's own website
(admin-only), with every request attributable and debuggable. The website
(RSG_Website repo, Vercel) builds only the UI; this repo owns the agent.

## Approach

- Manual Claude tool-use loop (`src/server/agentLoop.js`): default
  `claude-opus-4-8` (env-switchable to `claude-fable-5`), adaptive thinking,
  effort high, streaming. Oversized tool results truncated before entering
  model context; report CSVs emitted to the UI as `artifact` events instead.
- Plain-Node HTTP layer (`src/server/index.js`): `POST /api/chat` (SSE),
  `GET /api/tools`, `/healthz`. Bearer-secret auth (fail closed), 30MB bodies
  for uploaded PDFs (standard Anthropic `document` blocks). Stateless — the
  website persists conversations and replays history.
- Contract-first: `docs/rsg-ai-api.md` is the integration boundary; the
  website never imports code from this repo.
- Audit logging (`src/server/log.js`): JSONL to stdout (+ optional file),
  records `chat_request` / `tool_call` / `tool_result` / `chat_response` /
  `request_error` correlated by `requestId`, carrying the authenticated
  user's email, timings, token usage, and truncated question/response.

## Tasks

- [x] Agent loop with streaming, pause_turn handling, iteration cap
- [x] Tool-result summarization + CSV artifact extraction
- [x] HTTP/SSE server with bearer auth and lazy shared clients
- [x] Anthropic key resolution: env → SSM `/rsg-ai/prod/anthropic-api-key`
- [x] API contract doc + website integration guide (Next.js/better-auth sketch)
- [x] Structured audit logging with user attribution and requestId
- [x] `request_accepted`/`turn_complete` carry requestId to the UI
- [x] Unit tests (SSE encoding, auth, summarization, log helpers)
- [x] Live end-to-end verification through the SSE API

## Verification

Live agent turns against production data (cash application, Fulcrum
shipments) through the HTTP API; log lines verified to reconstruct full
turns; 401/fail-closed auth checks; `npm test`.

## Follow-ups

- [ ] Mint a dedicated Anthropic API key for RSG AI (current one is shared
      with the FireAI repo) and overwrite the SSM param
- [ ] Consider per-user rate limiting once team usage patterns are known
      (currently the website's responsibility)
- [ ] MCP connector wrapper around the same registry if Claude/Cowork access
      is wanted alongside the website (deferred by decision 2026-06-11)
