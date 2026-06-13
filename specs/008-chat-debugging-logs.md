# 008 — Chat debugging: chatId-tagged logs, CloudWatch durability, log-search tool

**Status:** shipped (2026-06-12)

## Problem / Goal

Debugging an RSG AI conversation meant SSH-less spelunking through `docker
logs` on the EC2 box, with no way to correlate a user's report ("my chat
broke") to backend activity — log records carried only a per-turn requestId,
and the container's logs were erased on every deploy. We need: (1) every log
record tied to the website's conversation id, (2) logs that survive deploys
and are queryable, (3) an easy tool to search them — for humans and for the
agent itself.

## Approach

- **chatId tagging.** The website sends its conversation id (`chatId` body
  field / `X-RSG-Chat-Id` header) with every `/api/chat` turn; the server
  stamps it on every JSONL record (chat_request, tool_call, tool_result,
  chat_response, request_error) and echoes it in `request_accepted` /
  `turn_complete` SSE events. The website's proxy verifies the caller owns
  the conversation before forwarding (its `lib/rsg-ai-log.ts` prefixes the
  website's own logs with the same id).
- **CloudWatch durability.** Both EC2 containers switched from the default
  json-file driver (history lost on each deploy, unbounded growth) to the
  `awslogs` driver: group `/rsg-ai/prod`, 90-day retention, stream per
  container name (stable across deploys). Group pre-created, instance role
  carries the logs grant — no `awslogs-create-group`, so a missing grant
  fails loudly at container start. `docker logs` still works on-box via
  Docker's dual-logging cache.
- **Search tool.** `rsg_ai_log_search` (`src/tools/system/logSearch.js`)
  filters the group by chatId / requestId / user / record type / free text
  over a bounded window. Server-side substring pre-filter (CloudWatch filter
  pattern) plus client-side exact field matching. Registered like any agent
  tool, so it works from the agent (super_admin only — logs contain every
  user's questions) and the CLI (`node src/cli.js rsg_ai_log_search ...`).

## Tasks

- [x] `/api/chat` accepts chatId (body or header); all log records + SSE
      events carry it; CORS preflight allows the `X-RSG-*` headers
- [x] Website: chat UI sends conversation id; proxy validates ownership and
      forwards it (committed in RSG_Website)
- [x] Compose: `awslogs` driver for rsg-ai + caddy, stable stream names
- [x] IAM: instance-role logs grant (write + read), applied live and in
      `launch.sh`; log group `/rsg-ai/prod` pre-created, 90-day retention
- [x] `rsg_ai_log_search` tool: registry, super_admin-only permission,
      CLI lazy client init so system tools need no QBO/Fulcrum creds
- [x] Docs: `docs/rsg-ai-api.md` (request field, SSE payloads, logging
      section, role matrix, tools list), CLAUDE.md, index.md
- [x] Tests: chatId end-to-end through the chat route (SSE echo + every log
      line tagged), log-search pure functions, permissions matrix

## Verification

- `npm test` — 52 passing, including a live-server test that posts a chat
  turn with a chatId and asserts every JSONL record and SSE event carries it.
- Prod: sent a `chatId: "cw-verify-001"` request to rsg-ai.rsgsecurity.com,
  pulled both records back out of CloudWatch by chatId via the AWS CLI, then
  via `node src/cli.js rsg_ai_log_search '{"chatId":"cw-verify-001"}'`.

## Follow-ups

- [ ] Agent-side verification on the EC2 host (ask RSG AI as super_admin to
      search logs) once a super_admin exercises the tool in chat
- [ ] Consider a CloudWatch metric filter + alarm on `request_error` volume
- [ ] Website conversation UI could surface "debug this chat" (deep link +
      requestId display) for support workflows
