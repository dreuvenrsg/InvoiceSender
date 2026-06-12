// fulcrum_api_request — a general-purpose, read-only window into the Fulcrum
// Pro ERP API. Instead of one narrow tool per question, the agent explores
// the API the way an engineer would: list/search endpoints, then drill into
// details. The read-only guard lives in the client (GET + POST .../list only).

const MAX_RESULT_CHARS = 35000;

/**
 * Shrink an API response to fit the model's context: arrays are cut to the
 * longest prefix that fits, anything else is JSON-truncated with a marker.
 * Exported for tests.
 */
export function fitForModel(data, maxChars = MAX_RESULT_CHARS) {
  const full = JSON.stringify(data);
  if (full.length <= maxChars) return { payload: data, truncated: false };

  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
  if (rows) {
    let keep = rows.length;
    while (keep > 1 && JSON.stringify(rows.slice(0, keep)).length > maxChars) {
      keep = Math.floor(keep / 2);
    }
    return {
      payload: {
        totalRowsReturnedByApi: rows.length,
        rowsShown: keep,
        note: `response truncated: showing ${keep} of ${rows.length} rows — use Skip/Take paging or tighter filters for the rest`,
        rows: rows.slice(0, keep),
      },
      truncated: true,
    };
  }
  return {
    payload: { note: "response truncated to fit context", json: full.slice(0, maxChars) },
    truncated: true,
  };
}

export const definition = {
  name: "fulcrum_api_request",
  description:
    "Make a READ-ONLY request to the Fulcrum Pro ERP API (manufacturing: sales orders, shipments, " +
    "invoices, customers, items, jobs/work orders, purchase orders). Call this for any question about " +
    "orders, shipping/tracking, production, or Fulcrum records. Only GET requests and POST to .../list " +
    "search endpoints are permitted — mutations are refused.\n" +
    "Conventions: list/search is POST /<entity>/list?Skip=<n>&Take=<n> (Take caps at 50) with an " +
    "optional JSON filter body (e.g. {\"salesOrderId\": \"...\"}); responses are an array or {data: [...]}. " +
    "Details are GET /<entity>/{id}. Known-good endpoints: POST /invoices/list, /shipments/list " +
    "(filter: salesOrderId), /shipment-line-items/list (filter: shipmentIds[]); GET /shipments/{id}, " +
    "/shipping-methods/{id}. Other entities follow the same pattern — explore: if an endpoint 404s, " +
    "try a different plural form, and page with Skip/Take rather than requesting everything. " +
    "Large responses are truncated; narrow your filters and iterate.",
  input_schema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST"], description: "GET for details, POST for /list searches" },
      endpoint: { type: "string", description: "Path under /api, e.g. /shipments/list?Skip=0&Take=20 or /shipments/abc123" },
      body: { type: "object", description: "JSON filter body for POST /list requests, e.g. {\"salesOrderId\": \"...\"}" },
    },
    required: ["method", "endpoint"],
  },
};

export async function run(input, { fulcrum }) {
  const data = await fulcrum.request(input.method, input.endpoint, input.body || null);
  return fitForModel(data).payload;
}

export default { definition, run };
