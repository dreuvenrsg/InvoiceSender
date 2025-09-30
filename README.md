
# QBO Email & Send Flow

Automates sending QuickBooks Online (QBO) invoices to customers. Pulls shipment and PO data from Fulcrum, updates the invoice in QBO, and emails it via AWS SES. Excludes Siemens and Honeywell customers by design.

> **Region:** Deployed in **us-east-2**  
> **Common command:** `npm run deploy-all`

---

## Features
- OAuth2 token refresh for QBO (stores refresh token in SSM Parameter Store).
- Fetches unsent & unpaid invoices, enriches with Fulcrum shipment data (tracking, ship date, ship method, PO).
- Updates invoice fields (BillEmail, TrackingNum, ShipDate, CustomerMemo, PO custom field).
- Sends invoice via QBO API and emails a summary via SES.
- **Excludes** customers that include `siemens` or `honeywell` (case-insensitive) unless they’re explicitly whitelisted in `INCLUDED_CUSTOMERS`.

---

## Project Structure (modules)
- **config** – Environment credentials, business rules, region, QBO constants.
- **oauth** – Refreshes QBO access token; persists refresh token in SSM (`/qbo-invoice-sender/{env}/refresh-token`).
- **qboAPI** – Thin GET/POST client for QBO with minor versioning + helpful error logs.
- **invoiceModule** – Queries invoices, updates fields, sends invoices.
- **customerModule** – Loads customer display name & primary email; exclusion/inclusion logic.
- **shippingModule** – Discovers `ShipMethodRef` by scanning recent transactions (read-only).
- **externalDataModule** – Fulcrum v3 integration; finds matching invoice, selects the best shipment, extracts tracking/ship date/method/PO.
- **invoiceProcessor** – Orchestrates per-invoice enrichment and sending.
- **emailModule** – Sends a text summary email via SES (aggregates customers on errors; hides Siemens/Honeywell).
- **app.run()** – Main program flow; returns a `results` summary.
- **handler** – AWS Lambda entrypoint that wraps `app.run()` and always emails a summary.

---

## Prerequisites
- Node 18+
- AWS account with:
  - **SES** (in `us-east-2`) verified identities for `FROM_EMAIL` and recipients or domain.
  - **SSM Parameter Store** permission to read/write the refresh token.
- QBO app credentials (Client ID/Secret) and an initial **refresh token**.
- Fulcrum API key with access to invoices/shipments.

---

## Environment Variables
Configure via your deployment system or a local `.env` (if you use one).

- `AWS_REGION` (default: `us-east-2`)
- `FROM_EMAIL` (default: `dreuven@rsgsecurity.com`)
- `TO_EMAILS` (comma-separated; default: `ar@rsgsecurity.com`)

> **Note:** The QBO refresh token is persisted to SSM:
> `/qbo-invoice-sender/prod/refresh-token` or `/qbo-invoice-sender/sandbox/refresh-token`

---

## Install
```bash
npm install
```

---

## Running Locally
> Local runs will use whichever `activeConfig` you set (`config.production` or `config.sandbox`).

```bash
node index.js
# or
node path/to/your/file.js
```

### What happens
1. OAuth token refresh (writes any new refresh token to SSM).
2. Pulls recent invoices and filters to **unsent + unpaid**.
3. Loads customers; excludes by business rules.
4. Enriches each invoice from Fulcrum (tracking, ship date, ship method, PO).
5. Updates the invoice in QBO and **sends** it via QBO API.
6. Emails a summary via SES.

---

## Deployment (AWS, us-east-2)
This project is designed to run as an AWS Lambda.

Typical workflow:
```bash
npm run build
npm run deploy-all    # commonly used
```
- Ensure your deployment targets **us-east-2** (SES & SSM are in that region).
- After deploy, invoke on a schedule (e.g., EventBridge rule) or manually.

---

## Business Rules
- **Excluded customers:** names containing `siemens` or `honeywell` (case-insensitive).
- **Included customers:** explicit safelist in `INCLUDED_CUSTOMERS` (must match a substring of the display name).
- If excluded → invoice is **skipped**; reason is recorded in the summary.

---

## Email Summary
Subject example:
```
QBO Invoice Processing Summary on 2025-09-29 - 12 sent, 3 skipped, 2 errors
```

Includes sections:
- Successfully Sent
- Skipped (excluded)
- Errors → shows **unique customer names only**, excludes Siemens/Honeywell.
- System Errors (fatal/logical errors outside individual invoices).

---

## Fulcrum Matching Highlights
- Finds the Fulcrum invoice by QBO links in `externalReferences` (id/number/doc).
- Picks the **best shipment**:
  - Prefers shipments explicitly linked to the Fulcrum invoice.
  - Otherwise scores by line-item overlap + date proximity.
  - Throws if multiple most-recent shipments share the same date (to avoid ambiguity).
- Extracts: `trackingNumber`, `shippedDate`, `shippingMethod.name`, and `customerPONumber`.

---

## Troubleshooting
- **Refresh token isn’t updating:** confirm Lambda role has `ssm:PutParameter` for the configured path.
- **SES sending fails:** verify domain/addresses in SES (in `us-east-2`), and check out of Sandbox if needed.
- **No PO/Tracking detected:** the processor raises errors to surface missing data; those invoices will show in the summary.
- **Ship method not found:** code logs a warning; `CustomerMemo` still notes the ship method text.

---

## Safety Notes
- Don’t commit live credentials or tokens. Prefer environment variables and SSM.
- Ensure least-privilege IAM for SES/SSM access.

---

## Scripts (examples)
These depend on your project’s `package.json`:
```json
{
  "scripts": {
    "build": "esbuild index.js --bundle --platform=node --outfile=dist/index.cjs",
    "deploy-all": "your-deploy-script-here",
    "start": "node index.js"
  }
}
```
> Replace `your-deploy-script-here` with your infra tool (SAM, CDK, Serverless, Terraform, etc.).

---

## License
Internal use at RSG.
