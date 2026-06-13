// Read-only Fulcrum Pro API client for the RSG AI tools.
// API key resolves from env (FULCRUM_API_KEY) or SSM — no hardcoded secrets.
// Mirrors the retry behavior of the monolith's fulcrumRequest without
// importing it.
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { REGION } from "../qbo/config.js";

export const FULCRUM_BASE_URL = "https://api.fulcrumpro.com/api";
export const FULCRUM_KEY_PARAM = "/rsg-ai/prod/fulcrum-api-key";

/**
 * Read-only guard: GET is always allowed; POST only to "/list" search
 * endpoints (Fulcrum's list/search convention). Everything else is refused —
 * the agent must never mutate ERP data.
 */
export function isReadOnlyRequest(method, endpoint) {
  const m = String(method || "").toUpperCase();
  if (m === "GET") return true;
  if (m === "POST") return /\/list$/.test(String(endpoint).split("?")[0]);
  return false;
}

export class FulcrumClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  static async create() {
    if (process.env.FULCRUM_API_KEY) return new FulcrumClient(process.env.FULCRUM_API_KEY);
    const ssm = new SSMClient({ region: REGION });
    const res = await ssm.send(
      new GetParameterCommand({ Name: FULCRUM_KEY_PARAM, WithDecryption: true })
    );
    return new FulcrumClient(res.Parameter.Value);
  }

  async request(method, endpoint, body = null, { maxAttempts = 3, baseDelayMs = 600 } = {}) {
    if (!isReadOnlyRequest(method, endpoint)) {
      throw new Error(
        `Refused: only GET requests and POST to .../list endpoints are allowed (got ${method} ${endpoint})`
      );
    }
    const url = `${FULCRUM_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const options = {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    };
    if (body && method !== "GET") options.body = JSON.stringify(body);

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res, txt;
      try {
        res = await fetch(url, options);
        txt = await res.text();
      } catch (networkErr) {
        lastErr = networkErr;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
          continue;
        }
        throw networkErr;
      }
      if (res.ok) return txt ? JSON.parse(txt) : {};
      lastErr = new Error(`Fulcrum API ${res.status} for ${method} ${endpoint}: ${txt.slice(0, 500)}`);
      if (res.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
        continue;
      }
      throw lastErr;
    }
    throw lastErr;
  }
}
