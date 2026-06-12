# 007 — Role-scoped tools (purchasing/QC + sales) and permissions

**Status:** shipped 2026-06-12 (PR #4)

## Problem / Goal

Different teams get different capabilities: quality control asks about POs,
receiving (packing slips, received dates, line items), and vendors; customer
service asks about sales orders, quotes, and shipments; finance gets the QBO
tools. The website passes the user's admin role per request; the backend
grants only that role's tools. Invalid/missing roles get a friendly "talk to
your manager" message, never a stack trace.

## Approach

- **Roles hardcoded here, mirrored from RSG_Website `lib/roles.ts`** —
  deliberate duplication to keep the repos decoupled. Worst case on drift: a
  user with a new role gets the talk-to-your-manager message until this
  repo's copy is updated. Roles: `super_admin`, `customer_service`,
  `quality_control`, `finance`, `finance_manager`, `admin` (legacy).
- **Scoped Fulcrum tools** built from the same base as the generic explorer,
  each with a namespace allowlist verified against Fulcrum's official
  OpenAPI spec (`api.fulcrumpro.com/swagger/v1/swagger.json`):
  - `fulcrum_purchasing_request` — purchase-orders (+ part/fee line items),
    receiving/receipts (+ line items), vendors, items, materials, inventory,
    capas (quality)
  - `fulcrum_sales_request` — sales-orders (+ line items), quotes, customers,
    shipments, invoices, jobs/work-orders (production status), reporting
    sales-order-lines
  - `fulcrum_api_request` (unrestricted explorer) — super_admin/admin only
- **Enforcement is server-side, twice**: the tool list given to Claude is
  filtered per role (disallowed tools are invisible to the model), and tool
  dispatch re-checks (defense in depth). The read-only guard is unchanged
  underneath everything.
- Invalid/missing role: the turn returns a normal assistant message telling
  the user to speak with their manager about permissions — no Claude call,
  no error state.
- Role logged on every audit record.

## Tasks

- [x] `src/server/permissions.js`: role enum mirror + role→tool matrix +
      invalid-role message
- [x] Refactor fulcrum tool into a factory; add purchasing + sales scoped
      tools with namespace allowlists
- [x] Knowledge file updated with verified endpoint map (receiving/receipts,
      PO/SO line items, reporting lines)
- [x] `runAgentTurn` accepts an allowed-tool subset; dispatch re-checks
- [x] `/api/chat` role validation (body.role / X-RSG-Role) + friendly denial
      turn; `/api/tools?role=` filtering; role in audit logs
- [x] Unit tests (matrix, invalid role, namespace guards, factory)
- [x] Live verification per role (QC purchasing question; CS denied QBO tool)
- [x] Contract doc + handoff updated (role field required)

## Verification

`npm test`; live SSE turns with different `role` values exercising allowed,
denied, and invalid-role paths.

## Follow-ups

- [ ] Revisit the role→tool matrix with Doron once teams actually use it
      (e.g. should CS see cash application?)
- [ ] If RSG_Website adds roles, update `permissions.js` + this spec
