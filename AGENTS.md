# AGENTS.md

## Project Overview

RSG Invoice Processor is an AWS Lambda/SAM project that automates invoice processing in two stages:

1. `fulcrumProcessor.js`: Puppeteer-based Fulcrum browser automation
2. `V2_emailSender.js`: Lambda handler for QBO processing, SES summary emails, and orchestration

The deployed Lambda is defined in `template.yaml` with handler `V2_emailSender.handler`.

## Current Source of Truth

- Treat the codebase as the source of truth over the README files.
- `README.md` and `QUICKSTART.md` still mention `index.js`, but the active entrypoint is `V2_emailSender.js`.
- `template.yaml` currently targets Node.js 22 on AWS SAM in `us-west-1`.

## Important Files

- `V2_emailSender.js`: main Lambda handler, QBO logic, email reporting
- `fulcrumProcessor.js`: Fulcrum browser automation
- `template.yaml`: SAM stack, schedule, memory, IAM permissions, layer ARN
- `samconfig.toml`: local SAM deployment config
- `CLAUDE.md`: deeper repo notes and historical guidance

## Working Rules

- Check existing docs before changing behavior: start with `README.md`, then `CLAUDE.md` for implementation details.
- Prefer small, targeted edits. This repo is effectively a two-file application plus SAM config.
- Do not edit generated or dependency directories unless explicitly required:
  - `.aws-sam/`
  - `node_modules/`
- Keep credentials out of commits and diffs. Be especially careful around:
  - `.env`
  - `.refresh-token-prod.txt`
  - hardcoded tokens or secrets already present in `V2_emailSender.js`
- If touching auth or token handling, prefer moving toward environment variables or AWS SSM rather than introducing new hardcoded secrets.
- When changing invoice send flows, include a way to check and validate where invoices were sent once sent. Do not stop at "send attempted" if the actual destination can be observed or recorded.

## Common Commands

Install dependencies:

```bash
npm install
```

Run locally:

```bash
node V2_emailSender.js
```

Build with SAM:

```bash
npm run build
```

Deploy:

```bash
npm run deploy
```

Invoke locally with SAM:

```bash
npm run invoke-local
```

Tail Lambda logs:

```bash
npm run logs
```

## Validation Expectations

- There is a regression test suite for summary-email reporting and invoice recipient routing.
- For code changes, run the narrowest useful validation:
  - `npm test` before marking a code change complete
  - `npm run build` for SAM/package validation
  - `node V2_emailSender.js` for local behavior when safe and credentials are available
  - `npm run invoke-local` for Lambda-path changes when the local event/config is set up
- If a change affects Fulcrum browser automation, note whether local interactive verification was or was not performed.
- When a change affects invoice sending, validate not only that invoices were sent, but where they were sent, using real observable outputs when available.
- If a change affects summary emails or recipient routing, verify that `npm test` covers the scenario and passes before saying the work is complete.

## Testing Principle

Use this testing model when adding or changing behavior:

1. Define a small set of real, observable primitives.
2. Force higher-level behavior to flow through those primitives.
3. Verify behavior through those primitives instead of only through mocked intent.
4. Treat mismatches, ambiguities, and operator corrections as structured inputs that improve the system.

In practice for this repo, prefer validations tied to real outputs such as QBO results, Fulcrum state changes, SES payloads, logs, and recorded send destinations over tests that only prove a function was called.
Use the regression tests to protect:
- excluded-customer visibility in summary emails
- HLI ship-to routing
- default customer-primary-email recipient selection

## Deployment Notes

- The Lambda schedule is defined in `template.yaml` and currently runs daily at 5:00 PM `America/Los_Angeles`.
- Chromium is provided via a public Lambda layer ARN in `template.yaml`; update it if the deploy region changes.
- Browser automation requires high memory and long timeout; preserve those settings unless the user explicitly asks to change them.

## Preferred Change Areas

- Business rules and QBO behavior: `V2_emailSender.js`
- Fulcrum selectors, waits, pagination, invoice creation flow: `fulcrumProcessor.js`
- Infra, runtime, schedule, IAM, Lambda config: `template.yaml`
- Documentation corrections: `README.md`, `QUICKSTART.md`, and this file
