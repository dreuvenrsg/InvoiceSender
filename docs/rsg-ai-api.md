# RSG AI Agent API

HTTP contract between the **RSG AI backend** (this repo, `src/server/`) and the
**website chat interface** (separate repo). The backend owns all Claude and
QuickBooks access; the interface owns user auth, conversation storage, and UI.

```
interface backend  ──Bearer secret──▶  RSG AI agent API  ──▶  Claude API
        ▲                                   │
   browser (your admin UI)                  └──▶  QuickBooks Online (via SSM creds)
```

Call the agent API **server-to-server** from the interface backend. Do not ship
the bearer secret to the browser.

## Running it

```bash
RSG_AI_API_KEY=<shared secret> ANTHROPIC_API_KEY=<anthropic key> npm run rsg-ai
# listens on :8787 (PORT to override); needs AWS creds with SSM read access
```

| Env var | Required | Meaning |
|---|---|---|
| `RSG_AI_API_KEY` | yes | Shared bearer secret the interface backend sends |
| `ANTHROPIC_API_KEY` | yes* | Claude API key. *Falls back to SSM `/rsg-ai/prod/anthropic-api-key` (SecureString) if unset |
| `RSG_AI_MODEL` | no | `claude-opus-4-8` (default) or `claude-fable-5` |
| `PORT` | no | Default `8787` |
| `RSG_AI_CORS_ORIGIN` | no | Dev only — allows direct browser calls from one origin |
| AWS credentials | yes | SSM read for QBO creds (`/qbo-invoice-sender/prod/*`), region `us-west-1` |

## Endpoints

All endpoints except `/healthz` require `Authorization: Bearer <RSG_AI_API_KEY>`.

### `GET /healthz`
`{ "ok": true, "model": "claude-opus-4-8" }` — no auth.

### `GET /api/tools`
`{ "tools": [{ name, description, input_schema }, ...] }` — the agent's tool
list, useful for an "what can I ask?" UI.

### `POST /api/chat` → SSE stream

Request body:

```jsonc
{
  "messages": [ /* Anthropic MessageParam[] — see below */ ],
  "model": "claude-fable-5"   // optional per-request override
}
```

`messages` is the full conversation so far, ending with the new user turn. The
backend is **stateless** — the interface stores conversations and replays them.
Messages use the standard Anthropic content-block format:

```jsonc
// plain text turn
{ "role": "user", "content": "What did we pay per part for zinc alloy last quarter?" }

// turn with an uploaded document (remittance PDF etc.)
{ "role": "user", "content": [
  { "type": "document",
    "source": { "type": "base64", "media_type": "application/pdf", "data": "<base64>" },
    "title": "JCI remittance 6-9-26" },
  { "type": "text", "text": "Check this remittance was applied correctly." }
]}
```

Max request size 30 MB. Supported uploads: PDF (`document`), images (`image`),
plain text/CSV (send as a `text` block or `document` with `text/plain`).

### Response: Server-Sent Events

Each event is `event: <type>` + `data: <JSON>` (the JSON repeats `type`).
Event order: zero or more `text` / `tool_use` / `tool_result` / `artifact`
interleaved, then `done`, then exactly one `turn_complete`.

| `type` | Payload | UI treatment |
|---|---|---|
| `text` | `{ text }` | Append delta to the assistant bubble |
| `tool_use` | `{ name, input }` | Show "Running landed cost report…" status chip |
| `tool_result` | `{ name, ok, error? }` | Resolve the status chip |
| `artifact` | `{ name, contentType, content }` | Offer as a download (e.g. report CSV); content is the raw text |
| `done` | `{ stopReason, usage }` | Final token usage for the turn |
| `turn_complete` | `{ newMessages, stopReason, usage }` | **Append `newMessages` to your stored conversation** and send the whole thing back on the next user turn (they contain the tool_use/tool_result blocks the model needs for context) |
| `error` | `{ error }` | Show error state; stream ends |

### Example

```bash
curl -N http://localhost:8787/api/chat \
  -H "Authorization: Bearer $RSG_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"How was the MIRCOM payment ref F9170 applied?"}]}'
```

## Current tools

Organized by domain under `src/tools/`:

**accounting/**
- `qbo_landed_cost_report` — per-part purchasing spend with freight/tariff/fee/tax
  allocation; emits the full table as a CSV `artifact`.
- `qbo_cash_application_lookup` — how customer payments were applied to AR
  invoices (by customer, ref number, amount, date range, or invoice number).

**fulcrum/** (customer service & operations)
- `fulcrum_api_request` — general-purpose READ-ONLY access to the Fulcrum Pro
  ERP API (sales orders, shipments/tracking, invoices, customers, items, jobs).
  The agent explores endpoints and chains calls on its own; mutations are
  refused at the client layer (GET and POST .../list only). Requires SSM
  `/rsg-ai/prod/fulcrum-api-key` (or `FULCRUM_API_KEY` env).

**system/**
- `save_operational_note` — the agent's self-improvement loop: durable
  discoveries (API quirks, data conventions) are appended to
  `src/server/knowledge/learned.md` and folded into its system prompt on
  every subsequent turn.

New tools added to `src/tools/index.js` appear automatically — no interface
changes needed beyond whatever you render from `/api/tools`.

## Teaching the agent (operational knowledge)

The agent's system prompt is composed at runtime from `src/server/knowledge/*.md`:
`accounting.md` and `fulcrum.md` are human-curated (edit + PR to teach it
something), `learned.md` is agent-written. Review agent notes via git diff and
promote stable ones into the curated files. `RSG_AI_LEARNED_NOTES_FILE` can
point the learned notes at durable storage in deployments.

## Notes for the interface repo

- Conversation persistence, user login/roles, and rate limiting are yours.
- One agent turn can take 10–90s (QBO pagination over thousands of bills);
  keep the SSE connection open and show tool status chips for feedback.
- The model is instructed to ask a clarifying question when a request is
  ambiguous — render that as a normal assistant message.
