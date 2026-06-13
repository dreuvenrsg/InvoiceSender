# 005 — Agent API deployment

**Status:** shipped 2026-06-12 (PR #4) — live on EC2

## Problem / Goal

Host the agent API as its own service (never bundled into the website's
Vercel deploy): credentials stay in RSG's AWS account, long SSE turns (up to
minutes inside one tool call) are supported, and cost fits an internal tool
with a handful of users.

## Approach

- **Primary: tiny EC2** (~$5/mo): t4g.nano (arm64, AL2023) + Elastic IP,
  docker compose running the agent container + Caddy (automatic Let's Encrypt
  HTTPS for `rsg-ai.rsgsecurity.com`). No SSH — port 22 closed; shell access
  via SSM Session Manager (IAM-audited): one-shot remote commands for agent
  debugging, interactive sessions for humans.
- Instance IAM role scoped to exactly the SSM paths the agent uses, including
  `PutParameter` on the QBO refresh token (rotation stays coordinated with
  the invoice Lambda). IMDS hop limit 2 so containers reach instance creds.
- Bearer key auto-generated at SSM `/rsg-ai/prod/api-key`; injected at
  container start by `run.sh` on the host.
- **Graduation path: ECS Fargate + ALB** (~$35/mo, zero-ops) kept as
  `deploy/rsg-ai-service.yaml` (`npm run rsg-ai:deploy`) for when usage
  outgrows one box. ALB idle timeout 900s for the long-turn problem.
- Rejected: Vercel/App Runner (timeout caps kill long turns), Lambda
  (learned-notes persistence + cold starts, for ~$4/mo savings).

## Tasks

- [x] Dockerfile (node:22-slim, prod deps, non-root; build verified, 366MB)
- [x] Fargate CloudFormation template (validated) + deploy script
- [x] EC2 launch script: IAM role/profile, SG 80/443, AMI via SSM param,
      Elastic IP, user-data bootstrap (docker, compose, configs, first run)
- [x] `update.sh`: arm64 build → ECR → SSM command syncs configs + restarts +
      health-checks
- [x] `shell.sh`: SSM one-shot remote commands (agent debugging) +
      interactive session mode
- [x] Compose binds 8787 host-local only (health checks/debugging)
- [x] Launch + live verification (containers healthy, /healthz, Caddy
      answering externally)

## Verification

Launched `i-092a6fc728d363339` (us-west-1, EIP 52.52.177.16); on-box
`/healthz` OK; Caddy 308→HTTPS externally; `update.sh` round-trip deployed a
config fix and health-checked green; `shell.sh` one-shot verified.

## Follow-ups

- [ ] DNS A record `rsg-ai.rsgsecurity.com` → 52.52.177.16 (Doron; Caddy
      then issues the cert automatically) — verify HTTPS end-to-end after
- [ ] Set Vercel env (`RSG_AI_URL`, `RSG_AI_API_KEY` from SSM)
- [ ] Install session-manager-plugin locally for interactive shells (needs sudo)
- [ ] Patch cadence for the box (dnf update / AMI refresh every few months)
- [ ] CloudWatch alarm on instance/container health (currently none)
