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
| `RSG_AI_LOG_FILE` | no | Mirror the JSONL request log to a file (stdout always gets it) |
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
  "user": "sheffner@rsgsecurity.com",  // REQUIRED in practice: the authenticated admin's email, for audit logging
  "model": "claude-fable-5"            // optional per-request override
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
| `request_accepted` | `{ requestId }` | First event; keep the requestId for support/debugging |
| `text` | `{ text }` | Append delta to the assistant bubble |
| `tool_use` | `{ name, input }` | Show "Running landed cost report…" status chip |
| `tool_result` | `{ name, ok, error? }` | Resolve the status chip |
| `artifact` | `{ name, contentType, content }` | Offer as a download (e.g. report CSV); content is the raw text |
| `done` | `{ stopReason, usage }` | Final token usage for the turn |
| `turn_complete` | `{ requestId, newMessages, stopReason, usage }` | **Append `newMessages` to your stored conversation** and send the whole thing back on the next user turn (they contain the tool_use/tool_result blocks the model needs for context) |
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

## Logging & audit

Every chat turn emits JSON lines to stdout (and `RSG_AI_LOG_FILE` if set),
correlated by `requestId`:

- `chat_request` — ts, requestId, **user**, model, message count, the question (truncated)
- `tool_call` / `tool_result` — every tool invocation with inputs (truncated) and outcome
- `chat_response` — duration, stop reason, token usage, response text (truncated)
- `request_error` — failures, with path and message

The interface MUST send the authenticated admin's identity per request (body
`user` field, or `X-RSG-User` header) — otherwise logs show `user: "unknown"`.

## Integrating with RSG_Website (Next.js App Router + better-auth)

Keep the agent API private; the website talks to it only through a
server-side route handler that (1) verifies the better-auth session and
`role === "admin"`, (2) injects the bearer secret, (3) forwards the user's
email, and (4) relays the SSE stream. Sketch (`app/api/rsg-ai/chat/route.ts`):

```ts
import { auth } from "@/lib/auth"; // adjust to the project's better-auth server instance
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  const body = await req.json();
  const upstream = await fetch(`${process.env.RSG_AI_URL}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RSG_AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, user: session.user.email }),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

Website env: `RSG_AI_URL` (e.g. `http://localhost:8787` in dev) and
`RSG_AI_API_KEY` (server-side only — never `NEXT_PUBLIC_`). The admin chat
page consumes the proxied SSE stream per the event table above, stores the
conversation (append `turn_complete.newMessages`), and offers `artifact`
events as downloads. Conversation persistence and any per-user rate limiting
belong to the website.

## Deployment

The agent API ships as its own service — it is NOT bundled into the website's
Vercel deploy.

**Production host (current): tiny EC2** — t4g.nano + Elastic IP in us-west-1
(~$5/mo), agent container + Caddy (automatic Let's Encrypt HTTPS) via
docker compose. Scripts in `deploy/ec2/`:

```bash
bash deploy/ec2/launch.sh    # one-time provisioning (already run)
bash deploy/ec2/update.sh    # ship current code: build arm64 -> ECR -> restart on host
bash deploy/ec2/shell.sh 'docker logs --tail 100 rsg-ai-rsg-ai-1'   # remote debugging
bash deploy/ec2/shell.sh     # interactive shell (needs session-manager-plugin)
```

- Live instance: `i-092a6fc728d363339`, Elastic IP `52.52.177.16`,
  domain `rsg-ai.rsgsecurity.com` (A record -> the EIP; Caddy issues the cert).
- Shell access is SSM Session Manager (no SSH keys, no port 22, IAM-audited).
  One-shot mode needs nothing extra — ideal for Claude sessions debugging the box.
- The production bearer key is auto-generated at SSM `/rsg-ai/prod/api-key`:

```bash
aws ssm get-parameter --name /rsg-ai/prod/api-key --with-decryption \
  --region us-west-1 --query Parameter.Value --output text
```

Vercel env: `RSG_AI_URL=https://rsg-ai.rsgsecurity.com`, `RSG_AI_API_KEY=<value above>`.
The audit JSONL is the agent container's stdout: `docker logs rsg-ai-rsg-ai-1`.

**Graduation path: ECS Fargate + ALB** (~$35/mo, zero-ops) — template kept at
`deploy/rsg-ai-service.yaml`, deployed with `npm run rsg-ai:deploy`, for when
usage outgrows the single box.
