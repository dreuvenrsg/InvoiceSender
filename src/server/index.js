#!/usr/bin/env node
// RSG AI agent API — the HTTP backend the website chat interface talks to.
// See docs/rsg-ai-api.md for the contract.
//
//   RSG_AI_API_KEY=<shared secret> ANTHROPIC_API_KEY=<key> node src/server/index.js
//
// Env: PORT (default 8787), RSG_AI_MODEL (default claude-opus-4-8),
//      RSG_AI_API_KEY (required outside dev), RSG_AI_CORS_ORIGIN (dev only).
import http from "node:http";
import { QboClient } from "../qbo/client.js";
import { FulcrumClient } from "../fulcrum/client.js";
import { toolDefinitions } from "../tools/index.js";
import { runAgentTurn, resolveAnthropicClient, DEFAULT_MODEL } from "./agentLoop.js";

const MAX_BODY_BYTES = 30 * 1024 * 1024; // remittance PDFs ride in as base64

export function isAuthorized(req, apiKey) {
  if (!apiKey) return false;
  return (req.headers.authorization || "") === `Bearer ${apiKey}`;
}

export function sseEncode(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, statusCode, body, corsOrigin) {
  const headers = { "Content-Type": "application/json" };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(body));
}

export function createServer({ apiKey = process.env.RSG_AI_API_KEY, corsOrigin = process.env.RSG_AI_CORS_ORIGIN } = {}) {
  if (!apiKey) {
    console.warn("[rsg-ai] WARNING: RSG_AI_API_KEY is not set — all requests will be rejected.");
  }
  // Lazy + shared: one Anthropic key resolution and one QBO token refresh per
  // process, reused across requests; reset on failure so the next request retries.
  let anthropicPromise = null;
  const getAnthropic = () => (anthropicPromise ??= resolveAnthropicClient().catch((err) => {
    anthropicPromise = null;
    throw err;
  }));
  let qboPromise = null;
  const getQbo = () => (qboPromise ??= QboClient.create().catch((err) => {
    qboPromise = null;
    throw err;
  }));
  let fulcrumPromise = null;
  const getFulcrum = () => (fulcrumPromise ??= FulcrumClient.create().catch((err) => {
    fulcrumPromise = null;
    throw err;
  }));

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "OPTIONS" && corsOrigin) {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        return res.end();
      }

      if (url.pathname === "/healthz") {
        return json(res, 200, { ok: true, model: DEFAULT_MODEL }, corsOrigin);
      }

      if (!isAuthorized(req, apiKey)) {
        return json(res, 401, { error: "Unauthorized" }, corsOrigin);
      }

      if (req.method === "GET" && url.pathname === "/api/tools") {
        return json(res, 200, { tools: toolDefinitions() }, corsOrigin);
      }

      if (req.method === "POST" && url.pathname === "/api/chat") {
        const body = JSON.parse(await readBody(req));
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return json(res, 400, { error: "messages[] is required" }, corsOrigin);
        }

        const headers = {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        };
        if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
        res.writeHead(200, headers);

        const [anthropic, qbo, fulcrum] = await Promise.all([getAnthropic(), getQbo(), getFulcrum()]);
        const { newMessages, stopReason, usage } = await runAgentTurn({
          client: anthropic,
          messages: body.messages,
          model: body.model || DEFAULT_MODEL,
          ctx: { qbo, fulcrum },
          onEvent: (event) => res.write(sseEncode(event)),
        });
        res.write(sseEncode({ type: "turn_complete", newMessages, stopReason, usage }));
        return res.end();
      }

      return json(res, 404, { error: "Not found" }, corsOrigin);
    } catch (err) {
      console.error("[rsg-ai]", err);
      if (res.headersSent) {
        res.write(sseEncode({ type: "error", error: err.message }));
        return res.end();
      }
      return json(res, err.statusCode || 500, { error: err.message }, corsOrigin);
    }
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const port = Number(process.env.PORT) || 8787;
  createServer().listen(port, () => {
    console.log(`[rsg-ai] agent API listening on :${port} (model: ${DEFAULT_MODEL})`);
  });
}
