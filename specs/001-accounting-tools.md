# 001 — Modular accounting tools (QBO)

**Status:** shipped 2026-06-11 (PR #4)

## Problem / Goal

The repo was a single-purpose invoice sender. RSG needs accounting analyses
against QuickBooks Online — starting with (a) what we paid per part including
freight/tariff overhead, and (b) how customer payments were applied to AR
invoices — built modularly so they can back an AI assistant ("RSG AI") and
future surfaces without entangling the invoice pipeline.

## Approach

- New `src/` layer fully independent of the `V2_emailSender.js` monolith (no
  puppeteer imports). Each capability is an Anthropic tool-use definition +
  handler: `{ definition, run }`, registered in `src/tools/index.js`.
- Standalone read-focused QBO client (`src/qbo/`) sharing the Lambda's
  refresh-token SSM parameter so OAuth rotation stays coordinated; client
  id/secret moved to SSM (no new hardcoded secrets).
- Landed cost: part numbers come from the `PART-NUMBER: description` bill-line
  convention (ItemRef is useless — almost everything is "COGS Purchasing");
  freight/tariff/fee/tax lines allocate across part lines value-weighted
  (largest-remainder, integer cents); unallocatable overhead and non-item
  spend reported separately, never silently dropped.
- Cash application: QBO `Payment` entities with LinkedTxn resolution to
  invoice numbers; queryable by customer / ref / amount / dates / invoice.

## Tasks

- [x] QBO client: SSM-backed OAuth with rotation write-back, paginated queryAll
- [x] Client credentials into SSM (`/qbo-invoice-sender/prod/client-id|client-secret`)
- [x] Allocation math (value/quantity/even weights, exact-sum largest remainder)
- [x] `qbo_landed_cost_report` with part-prefix grouping + overhead categories
- [x] Overhead classifier exclusions (professional/legal fees ≠ landed cost)
- [x] `qbo_cash_application_lookup` (customer/ref/amount/date/invoice filters)
- [x] CSV output; CLI runner (`node src/cli.js`)
- [x] Unit tests for all pure logic
- [x] Live verification against production QBO

## Verification

`npm test` (allocation, classification, payment summarization); live 12-month
report over 3,057 paid bills (1,076 parts, CSV in `artifacts/`); live payment
lookups (e.g. MIRCOM ref F9170).

## Follow-ups

- [ ] Allocate the ~$214k tariffs / ~$141k freight on item-less broker/carrier
      bills by matching them to goods bills (PO/vendor/date)
- [ ] Part-alias map to merge vendor-specific names for the same material
      (e.g. "ZN-#3-ALLOY" vs "#3 ZINC ALLOY INGOT")
- [ ] Remittance-advice vs cash-application automated comparison tool
      (currently done conversationally by the agent via document upload)
