// Fulcrum Pro ERP API tools. One factory, three tools:
//   fulcrum_api_request        — unrestricted explorer (super admins)
//   fulcrum_purchasing_request — purchasing/receiving/QC namespaces only
//   fulcrum_sales_request      — sales/shipping/customer namespaces only
// All are READ-ONLY (GET + POST .../list, enforced in src/fulcrum/client.js);
// the scoped variants additionally restrict which entity namespaces the
// agent may touch, which is what makes per-role access meaningful.
// Endpoint names verified against the official OpenAPI spec
// (api.fulcrumpro.com/swagger/v1/swagger.json).

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

/** First path segment(s) check against a namespace allowlist. Exported for tests. */
export function endpointAllowed(endpoint, namespaces) {
  if (!namespaces) return true; // unrestricted variant
  const path = String(endpoint).split("?")[0].replace(/^\/+/, "");
  return namespaces.some((ns) => path === ns || path.startsWith(`${ns}/`));
}

const SHARED_CONVENTIONS =
  "Conventions: list/search is POST /<entity>/list?Skip=<n>&Take=<n> (Take caps at 50) with an " +
  "optional JSON filter body; responses are an array or {data: [...]}. Details are GET /<entity>/{id}. " +
  "Sub-resources follow the same shape (e.g. POST /purchase-orders/{id}/part-line-items/list). " +
  "Large responses are truncated; narrow filters and page with Skip/Take. Read-only: GET and " +
  "POST .../list only — mutations are refused.";

export function makeFulcrumTool({ name, description, namespaces = null, scopeNote = "" }) {
  return {
    definition: {
      name,
      description: `${description}\n${SHARED_CONVENTIONS}${scopeNote ? `\n${scopeNote}` : ""}`,
      input_schema: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST"], description: "GET for details, POST for /list searches" },
          endpoint: { type: "string", description: "Path under /api, e.g. /receiving/receipts/list?Skip=0&Take=20" },
          body: { type: "object", description: "JSON filter body for POST /list requests" },
        },
        required: ["method", "endpoint"],
      },
    },
    async run(input, { fulcrum }) {
      if (!endpointAllowed(input.endpoint, namespaces)) {
        throw new Error(
          `Endpoint outside this tool's scope (allowed namespaces: ${namespaces.join(", ")}). ` +
            `If the user's question genuinely needs other data, tell them which team's access it requires.`
        );
      }
      const data = await fulcrum.request(input.method, input.endpoint, input.body || null);
      return fitForModel(data).payload;
    },
  };
}

// ---- the three tools ----

export const generalTool = makeFulcrumTool({
  name: "fulcrum_api_request",
  description:
    "Make a READ-ONLY request to ANY endpoint of the Fulcrum Pro ERP API (manufacturing: sales " +
    "orders, shipments, purchase orders, receiving, invoices, customers, vendors, items, jobs). " +
    "Unrestricted explorer for administrators.",
});

export const purchasingTool = makeFulcrumTool({
  name: "fulcrum_purchasing_request",
  description:
    "READ-ONLY Fulcrum ERP access for PURCHASING, RECEIVING, and QUALITY questions: purchase " +
    "orders and their line items, receiving receipts (the packing-slip records: received dates, " +
    "quantities, line items), vendors and their contacts, items/materials, inventory, and CAPAs. " +
    "Key endpoints: POST /purchase-orders/list (fields incl. receivingStatus, expectedReceiveDate); " +
    "POST /purchase-orders/{id}/part-line-items/list; POST /receiving/receipts/list and " +
    "POST /receiving/receipts/{receiptId}/line-items/list; POST /vendors/list, GET /vendors/{id}; " +
    "POST /items/list; POST /capas/list.",
  namespaces: [
    "purchase-orders",
    "receiving",
    "vendors",
    "items",
    "materials",
    "v2/material-vendors",
    "inventory",
    "inventory-lots",
    "inventory-transactions",
    "inventory-events",
    "capas",
    "item-categories",
    "item-classes",
    "accounting-codes",
  ],
  scopeNote: "Scope: purchasing/receiving/quality entities only — sales orders, quotes, and customer data are outside this tool.",
});

export const salesTool = makeFulcrumTool({
  name: "fulcrum_sales_request",
  description:
    "READ-ONLY Fulcrum ERP access for SALES and CUSTOMER-SERVICE questions: sales orders and " +
    "their line items, quotes, customers and contacts, shipments/tracking, Fulcrum invoices, and " +
    "production status (jobs/work orders). Key endpoints: POST /sales-orders/list; " +
    "POST /sales-orders/{id}/part-line-items/list (and /line-items/list); POST /quotes/list; " +
    "POST /customers/list; POST /shipments/list (filter salesOrderId; trackingNumber lives here); " +
    "POST /shipment-line-items/list; POST /invoices/list; POST /jobs/list (filter salesOrderId); " +
    "POST /reporting/sales-order-lines/list (flat line-level report across orders).",
  namespaces: [
    "sales-orders",
    "quotes",
    "quote",
    "customers",
    "shipments",
    "shipment-line-items",
    "invoices",
    "jobs",
    "work-orders",
    "reporting/sales-order-lines",
    "reporting/quote",
    "customer-tiers",
  ],
  scopeNote: "Scope: sales/customer/shipping/production entities only — purchasing, receiving, and vendor data are outside this tool.",
});

export default { definition: generalTool.definition, run: generalTool.run };
