# 003 — Fulcrum ERP access for CS/ops

**Status:** shipped 2026-06-11 (PR #4)

## Problem / Goal

Customer service and operations need to ask open-ended questions about orders,
shipments/tracking, and production. Instead of one narrow tool per question
type, give the agent the same capability that makes a CLI agent effective: a
general-purpose, read-only window into the Fulcrum Pro API it can explore.

## Approach

- `fulcrum_api_request` tool: GET any endpoint, POST only to `.../list`
  search endpoints. The read-only guard is enforced in code
  (`src/fulcrum/client.js`), not by prompt — mutations are refused before any
  network call.
- API key from env or SSM `/rsg-ai/prod/fulcrum-api-key` (value sourced from
  the existing monolith config; no new hardcoded secrets).
- Responses truncated to fit model context (array-aware, with paging guidance
  in the truncation note).
- Tool description + knowledge file teach the conventions: POST
  `/<entity>/list?Skip=&Take=` (Take caps at 50), GET `/<entity>/{id}`,
  invoice→salesOrderId→shipments→tracking trail.

## Tasks

- [x] Read-only Fulcrum client with retries and the GET/POST-list guard
- [x] Fulcrum key into SSM
- [x] `fulcrum_api_request` tool with exploration guidance + truncation
- [x] Tools reorganized by domain (`src/tools/accounting|fulcrum|system`)
- [x] ctx extended to `{ qbo, fulcrum }` in server and CLI
- [x] Unit tests (guard matrix, truncation)
- [x] Live verification of exploratory behavior

## Verification

Live: "find the most recent shipment" — the agent paged 9.7k shipments,
probed three sort syntaxes, discovered sorting is ignored, jumped to the tail
pages, and returned the correct shipment + tracking number with caveats.

## Follow-ups

- [ ] Mint a dedicated read-scoped Fulcrum API key for RSG AI (current key is
      the invoice-sender's JWT) and overwrite the SSM param
- [ ] Curate more known-good endpoints into the knowledge file as the team's
      real questions reveal them (jobs/work orders, items, POs)
