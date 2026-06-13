# 006 — File uploads of all common types

**Status:** shipped 2026-06-12 (PR #4)

## Problem / Goal

The interface must let users upload the files they actually have — remittance
PDFs, screenshots (.png/.jpg), and Excel workbooks — and the agent must read
them. PDFs and images are native Claude content blocks; **Excel is not** (the
Messages API has no spreadsheet type), so the backend must normalize uploads
rather than blindly forwarding.

## Approach

- New `src/server/attachments.js`: `normalizeMessages()` runs on every
  incoming `/api/chat` body before the agent loop. The interface keeps sending
  standard Anthropic blocks; the backend fixes what Claude would reject:
  - images: pass through; repair common media-type mistakes (`image/jpg` →
    `image/jpeg`)
  - `application/pdf`: pass through (native)
  - `text/*` sent as base64 documents: decode to text-source document blocks
  - Excel (`.xlsx`, and mislabeled `.xls` that are really xlsx): parse
    server-side (exceljs) and replace the block with per-sheet CSV text,
    capped with a truncation note; true legacy `.xls` gets a readable
    in-conversation note asking for `.xlsx` instead of a hard error
- Conversion failures degrade to text notes inside the turn (the agent tells
  the user), not 500s.

## Tasks

- [x] `attachments.js` normalization (images, pdf, text, xlsx→CSV)
- [x] Magic-byte sniffing: actual bytes win over declared media type
      (browsers mislabel; Claude rejects mismatches)
- [x] exceljs dependency; cell-value handling (dates, formulas, rich text)
- [x] Per-file CSV cap with truncation note
- [x] Wire into `/api/chat` before logging + agent loop
- [x] Unit tests (media-type repair, text decode, xlsx fixture round-trip,
      legacy-xls degradation, cap)
- [x] Live verification: xlsx and png through the running API
- [x] Contract doc updated (supported types table)

## Verification

`npm test`; live SSE turns with a generated .xlsx (agent reads values) and a
.png (agent describes content) through the local server.

## Follow-ups

- [ ] If users start uploading huge workbooks, consider summarizing sheets
      (row/col counts + head rows) instead of full CSV
- [ ] .docx support if the team ever asks (same conversion pattern)
