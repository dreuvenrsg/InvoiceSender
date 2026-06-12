# 004 — Agent knowledge system (curated + self-written notes)

**Status:** shipped 2026-06-11 (PR #4)

## Problem / Goal

The agent should get smarter over time the way a CLI agent with memory does:
operational discoveries (API quirks, data conventions) must persist across
conversations, and humans need an obvious, reviewable place to teach it how
RSG's systems behave.

## Approach

- System prompt composed at runtime: base prompt (role/working style in
  `src/server/systemPrompt.js`) + every `src/server/knowledge/*.md`.
- Two knowledge classes: **curated** (`accounting.md`, `fulcrum.md` — humans
  edit, PR-reviewed) and **learned** (`learned.md` — the agent appends via
  its `save_operational_note` tool; reviewed/pruned via git diff, stable
  entries promoted into the curated files).
- The agent is instructed to save only durable, *verified*, non-record-specific
  facts. Prompt rebuilds each loop iteration so notes apply immediately.
- `RSG_AI_LEARNED_NOTES_FILE` env override for durable storage on ephemeral
  hosts (not needed on the EC2 deployment).

## Tasks

- [x] Runtime prompt composition from knowledge dir
- [x] Move domain knowledge out of code into `accounting.md` / `fulcrum.md`
- [x] Record the Fulcrum sort-ignored quirk in `fulcrum.md`
- [x] `save_operational_note` tool + guidance on what (not) to save
- [x] Unit tests (composition, note appending, env override)
- [x] Live verification that knowledge changes behavior

## Verification

The "most recent shipment" question dropped from 9 tool calls (sort
experiments) to 2 (straight to tail pages) after the quirk note — same
correct answer, agent cited the note in its reasoning.

## Follow-ups

- [ ] Periodic human review of `learned.md` (prune wrong/stale, promote stable)
- [ ] If the host ever becomes ephemeral/multi-instance, move learned notes to
      durable shared storage (S3/DynamoDB) behind the existing env override
