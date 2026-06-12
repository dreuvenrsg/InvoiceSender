# Handoff: RSG AI chat in RSG_Website (Admin page)

For the Claude session working in the **RSG_Website** repo. Written 2026-06-12.

## What RSG AI is

RSG AI is the company's internal AI assistant for the accounting, customer
service, and operations teams. Users ask questions in plain English (or upload
documents like remittance advices); a Claude-powered agent answers by calling
read-only tools against QuickBooks Online (accounting) and Fulcrum Pro (ERP —
orders, shipments, tracking, production). It behaves like an agentic CLI:
multiple tool calls per question, streamed progress, honest caveats.

Example questions it already answers (verified live):
- "How was MIRCOM's payment ref F9170 applied? Which invoices did it cover?"
- "What's our landed cost per part for the last 12 months including tariffs?"
- "What's the most recent shipment we sent, and what's the tracking number?"
- (with a PDF uploaded) "Check this remittance was applied correctly in QBO."

## Architecture: two repos, one HTTP contract

```
RSG_Website (this repo)                    RSG_AI_Tools (separate repo)
┌──────────────────────────┐               ┌─────────────────────────────┐
│ /admin "RSG AI" chat page│   Bearer      │ Agent API (Node, SSE)       │
│   └─ app/api/rsg-ai/...  ├──secret──────▶│  Claude tool loop           │──▶ Claude API
│      (server-side proxy, │   + user email│  tools: QBO + Fulcrum       │──▶ QBO / Fulcrum APIs
│       admin-gated)       │               │  knowledge + audit logging  │
└──────────────────────────┘               └─────────────────────────────┘
```

- **The authoritative API contract** (endpoints, SSE event types, message
  format, uploads, the Next.js route-handler sketch) is
  `RSG_AI_Tools/docs/rsg-ai-api.md` — read it before building. Locally:
  `/Users/dreuven/Projects/RSG/RSG_AI_Tools/docs/rsg-ai-api.md`.
- The backend is **stateless**: the website stores conversations and replays
  the full message history each turn (append `turn_complete.newMessages`).
- Tools/prompts/models are owned by RSG_AI_Tools and evolve independently —
  new tools appear with **zero website changes**.

## What the website session builds

1. **Server-side proxy route** (`app/api/rsg-ai/chat/route.ts`): verify
   better-auth session with `role === "admin"` (403 otherwise), forward the
   body to `${RSG_AI_URL}/api/chat` with `Authorization: Bearer
   ${RSG_AI_API_KEY}` and `user: session.user.email` injected, relay the SSE
   response stream unmodified. A second tiny proxy for `GET /api/tools` is
   optional (nice for a "what can I ask?" panel).
2. **Admin chat page** (under the existing Admin area, admin-gated like its
   siblings): streaming chat UI handling the SSE events —
   `request_accepted` (keep requestId for support), `text` (delta into the
   assistant bubble), `tool_use`/`tool_result` (status chips, e.g. "Checking
   Fulcrum shipments…"), `artifact` (offer CSV download), `error`,
   `turn_complete` (persist `newMessages`). Turns can take 10–90s — keep the
   stream open, show progress.
3. **File upload**: PDFs/images attach to the user turn as standard Anthropic
   `document`/`image` content blocks (base64), ≤30MB request. Primary use
   case: remittance advice reconciliation.
4. **Conversation persistence**: per-user conversation list (drizzle — match
   existing schema conventions). Store the full Anthropic message array
   verbatim (it contains tool_use/tool_result blocks the model needs).
5. **Env**: `RSG_AI_URL`, `RSG_AI_API_KEY` — server-side only, never
   `NEXT_PUBLIC_`. The browser must never see the agent API or its secret,
   and must never call Anthropic directly.

## Local development

```bash
# Terminal 1 — agent API (RSG_AI_Tools repo; needs AWS creds for SSM)
cd ~/Projects/RSG/RSG_AI_Tools
RSG_AI_API_KEY=<pick-a-dev-secret> npm run rsg-ai     # :8787

# Terminal 2 — website with matching env
RSG_AI_URL=http://localhost:8787 RSG_AI_API_KEY=<same-dev-secret> npm run dev
```

The Anthropic, QBO, and Fulcrum keys all resolve from SSM inside the agent
API — the website never touches them. Smoke test without the UI:
`curl -N $RSG_AI_URL/api/chat -H "Authorization: Bearer $RSG_AI_API_KEY" -H "Content-Type: application/json" -d '{"user":"dev@rsgsecurity.com","messages":[{"role":"user","content":"hello"}]}'`

## Status / decisions already made

- Backend is **feature-complete for v1** and verified live end-to-end
  (PR: https://github.com/dreuvenrsg/RSG_AI_Tools/pull/4). Tools: landed-cost
  report, cash-application lookup, generic read-only Fulcrum API access, and
  the agent's own learned-notes system. Audit logging (user, requestId,
  question, tool calls, timings, usage) is on the backend; the website just
  supplies the user identity.
- Model: `claude-opus-4-8` default (config knob; `claude-fable-5` available).
- The agent API is **not deployed yet** — develop against localhost:8787.
  Deployment target (likely small App Runner/EC2 in the us-west-1 account)
  is a pending decision; coordinate before shipping the admin page to prod.
  Generate a strong shared `RSG_AI_API_KEY` for prod at that point.

## Out of scope for the website session

Tool behavior, system prompts/knowledge files, QBO/Fulcrum access, logging —
all live in RSG_AI_Tools. If the agent answers wrong or needs a new
capability, that's an RSG_AI_Tools change.

## Suggested kickoff prompt

> Add an admin-only "RSG AI" chat feature. Read
> `/Users/dreuven/Projects/RSG/RSG_AI_Tools/docs/website-integration-handoff.md`
> and `/Users/dreuven/Projects/RSG/RSG_AI_Tools/docs/rsg-ai-api.md` first.
> Build the server-side proxy route gated on the better-auth admin role, a
> streaming chat page under the Admin area (SSE: text deltas, tool-status
> chips, CSV artifact downloads, requestId surfaced for support), PDF/image
> upload as Anthropic document blocks, and conversation persistence in
> drizzle. The agent API runs locally via `npm run rsg-ai` in RSG_AI_Tools on
> :8787 — env `RSG_AI_URL` + `RSG_AI_API_KEY` (server-side only).
