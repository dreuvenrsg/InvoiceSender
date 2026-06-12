// Read-focused QBO API client for the accounting tools.
// Mirrors the OAuth flow in V2_emailSender.js (SSM-backed refresh token with
// rotation written back to the same parameter) without importing the Lambda
// pipeline or its browser-automation dependencies.
import {
  HOST,
  REALM_ID,
  TOKEN_URL,
  MINOR_VERSION,
  loadClientCredentials,
  loadRefreshToken,
  saveRefreshToken,
} from "./config.js";

const QBO_PAGE_SIZE = 1000;

export class QboClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  /** Refresh the OAuth token (rotating the SSM refresh token) and return a ready client. */
  static async create() {
    const { clientId, clientSecret } = await loadClientCredentials();
    const refreshToken = await loadRefreshToken();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`QBO token refresh failed: ${res.status} - ${text}`);
    }
    const json = JSON.parse(text);
    if (json.refresh_token && json.refresh_token !== refreshToken) {
      await saveRefreshToken(json.refresh_token);
    }
    return new QboClient(json.access_token);
  }

  async get(pathAndQuery) {
    const url = `${HOST}/${REALM_ID}${pathAndQuery}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`QBO GET ${pathAndQuery} failed: ${res.status} - ${text}`);
    }
    return JSON.parse(text);
  }

  /** Run one QBO SQL-ish query; returns the QueryResponse object. */
  async query(queryString) {
    const res = await this.get(
      `/query?minorversion=${MINOR_VERSION}&query=${encodeURIComponent(queryString)}`
    );
    return res.QueryResponse || {};
  }

  /**
   * Fetch every row of an entity matching `where` (QBO caps pages at 1000).
   * Example: queryAll("Bill", "TxnDate >= '2025-06-01'")
   */
  async queryAll(entity, where = "", orderBy = "Id") {
    const rows = [];
    let start = 1;
    for (;;) {
      const clause = where ? ` WHERE ${where}` : "";
      const q = `SELECT * FROM ${entity}${clause} ORDERBY ${orderBy} STARTPOSITION ${start} MAXRESULTS ${QBO_PAGE_SIZE}`;
      const page = (await this.query(q))[entity] || [];
      rows.push(...page);
      if (page.length < QBO_PAGE_SIZE) return rows;
      start += QBO_PAGE_SIZE;
    }
  }
}

/** Escape a string literal for a QBO query (single quotes double up). */
export function qboEscape(value) {
  return String(value).replace(/'/g, "\\'");
}
