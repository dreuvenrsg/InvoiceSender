// qbo_landed_cost_report — total spend per purchased part over a date range,
// with freight / tariff / fee / tax lines allocated onto part lines per bill.
//
// RSG's books put nearly all merchandise on a single QBO item ("COGS
// Purchasing"); the real part number lives in the line description as a
// "PART-NUMBER: description" prefix. Grouping therefore defaults to that
// prefix, falling back to the full description, then the QBO item name.
import { allocateCents, allocationWeights, toCents, fromCents } from "../lib/allocation.js";
import { toCsv } from "../lib/csv.js";

// Charges that are NOT merchandise overhead even though they say "fee"
// (professional services, rent, etc. — they go to non-item spend instead).
const NON_OVERHEAD = /professional|legal|attorney|consult|accounting|payroll|insurance|medical|subscription|software|rent\b|utilit|engineer|\bIT\b|bank/i;

// Overhead categories, matched against description prefixes, expense-account
// names, and item names. Order matters: tariff before fee so "tariff fee"
// lands in tariff.
export const OVERHEAD_CATEGORIES = [
  { key: "tariff", pattern: /tariff|dut(y|ies)|customs|broker/i },
  { key: "freight", pattern: /freight|shipping|ship\b|deliver|postage|courier/i },
  { key: "tax", pattern: /^tax\b|sales tax|use tax|\btax:/i },
  { key: "fee", pattern: /surcharge|handling|fuel charge|lot fee|lot charge|\bfees?\b/i },
];

export function classifyOverhead(text) {
  if (!text) return null;
  if (NON_OVERHEAD.test(text)) return null;
  for (const { key, pattern } of OVERHEAD_CATEGORIES) {
    if (pattern.test(text)) return key;
  }
  return null;
}

/** Extract the "PART-NUMBER: " prefix from a line description, if present. */
export function partFromDescription(description) {
  if (!description) return null;
  const m = /^(.{1,40}?):\s/.exec(description);
  return m ? m[1].trim() : null;
}

/** Normalize one QBO Bill/VendorCredit line into {kind, ...} */
export function parseLine(line) {
  const amountCents = toCents(line.Amount);
  const desc = (line.Description || "").trim();

  if (line.ItemBasedExpenseLineDetail) {
    const d = line.ItemBasedExpenseLineDetail;
    const itemName = d.ItemRef?.name || "";
    const prefix = partFromDescription(desc);
    const category =
      (prefix && classifyOverhead(prefix)) ||
      (!prefix && classifyOverhead(desc)) ||
      classifyOverhead(itemName);
    if (category) return { kind: "overhead", category, amountCents, label: prefix || desc || itemName };
    const part = prefix || desc.slice(0, 60) || itemName || `Item ${d.ItemRef?.value || "?"}`;
    return {
      kind: "item",
      part,
      description: desc || itemName,
      qboItem: itemName,
      qty: Number(d.Qty) || 0,
      amountCents,
    };
  }

  if (line.AccountBasedExpenseLineDetail) {
    const accountName = line.AccountBasedExpenseLineDetail.AccountRef?.name || "";
    const category = classifyOverhead(accountName) || classifyOverhead(desc);
    if (category) return { kind: "overhead", category, amountCents, label: accountName || desc };
    return { kind: "nonItem", accountName, amountCents };
  }

  return null; // subtotal/group/etc.
}

/**
 * Process one transaction (Bill or VendorCredit). `sign` is +1 for bills,
 * -1 for vendor credits. Mutates `agg` (Map part -> totals) and pushes
 * unallocatable overhead / non-item spend onto the provided arrays.
 */
export function processTxn(txn, { sign = 1, method = "value", agg, unallocated, nonItem }) {
  const itemLines = [];
  const overheadLines = [];
  for (const raw of txn.Line || []) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.kind === "item") itemLines.push(line);
    else if (line.kind === "overhead") overheadLines.push(line);
    else nonItem.push({ account: line.accountName, amountCents: sign * line.amountCents, vendor: txn.VendorRef?.name, date: txn.TxnDate, docNumber: txn.DocNumber });
  }

  const overheadByLine = new Map(); // line index -> {freight, tariff, fee, tax}
  for (const oh of overheadLines) {
    if (!itemLines.length) {
      unallocated.push({
        category: oh.category,
        amountCents: sign * oh.amountCents,
        label: oh.label,
        vendor: txn.VendorRef?.name,
        date: txn.TxnDate,
        docNumber: txn.DocNumber,
      });
      continue;
    }
    const parts = allocateCents(oh.amountCents, allocationWeights(itemLines, method));
    parts.forEach((cents, i) => {
      const slot = overheadByLine.get(i) || { freight: 0, tariff: 0, fee: 0, tax: 0 };
      slot[oh.category] += cents;
      overheadByLine.set(i, slot);
    });
  }

  itemLines.forEach((line, i) => {
    const cur = agg.get(line.part) || {
      part: line.part,
      description: line.description,
      qboItem: line.qboItem,
      qty: 0,
      directCents: 0,
      freightCents: 0,
      tariffCents: 0,
      feeCents: 0,
      taxCents: 0,
      lineCount: 0,
    };
    const oh = overheadByLine.get(i) || { freight: 0, tariff: 0, fee: 0, tax: 0 };
    cur.qty += sign * line.qty;
    cur.directCents += sign * line.amountCents;
    cur.freightCents += sign * oh.freight;
    cur.tariffCents += sign * oh.tariff;
    cur.feeCents += sign * oh.fee;
    cur.taxCents += sign * oh.tax;
    cur.lineCount += 1;
    agg.set(line.part, cur);
  });
}

function resolveRange(input) {
  if (input.start_date && input.end_date) return { start: input.start_date, end: input.end_date };
  const months = input.months || 12;
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export const definition = {
  name: "qbo_landed_cost_report",
  description:
    "Pull vendor bills from QuickBooks Online over a date range, group purchase lines by part number " +
    "(extracted from the 'PART-NUMBER: description' line convention), and allocate freight/tariff/fee/tax " +
    "lines onto parts (value-weighted by default) to produce a landed-cost report: total spend per part " +
    "including its share of overhead. Call this when asked what was paid per item/part, or about " +
    "freight/tariff cost per item.",
  input_schema: {
    type: "object",
    properties: {
      months: { type: "integer", description: "Lookback window in months (default 12). Ignored if start_date/end_date given." },
      start_date: { type: "string", description: "Range start, YYYY-MM-DD" },
      end_date: { type: "string", description: "Range end, YYYY-MM-DD" },
      paid_only: { type: "boolean", description: "Only include fully paid bills (Balance = 0). Default true." },
      allocation: { type: "string", enum: ["value", "quantity", "even"], description: "How to spread overhead across a bill's part lines. Default value (pro-rata by dollar amount)." },
      include_vendor_credits: { type: "boolean", description: "Net out vendor credits in the range. Default true." },
      vendor: { type: "string", description: "Optional: restrict to one vendor display name (matched client-side, case-insensitive)." },
    },
    required: [],
  },
};

export async function run(input, { qbo }) {
  const { start, end } = resolveRange(input);
  const method = input.allocation || "value";
  const paidOnly = input.paid_only !== false;

  const allBills = await qbo.queryAll("Bill", `TxnDate >= '${start}' AND TxnDate <= '${end}'`);
  let bills = paidOnly ? allBills.filter((b) => Number(b.Balance) === 0) : allBills;
  if (input.vendor) {
    const v = input.vendor.toLowerCase();
    bills = bills.filter((b) => (b.VendorRef?.name || "").toLowerCase().includes(v));
  }

  const credits = input.include_vendor_credits !== false
    ? await qbo.queryAll("VendorCredit", `TxnDate >= '${start}' AND TxnDate <= '${end}'`)
    : [];

  const agg = new Map();
  const unallocated = [];
  const nonItem = [];
  for (const bill of bills) processTxn(bill, { sign: 1, method, agg, unallocated, nonItem });
  for (const credit of credits) processTxn(credit, { sign: -1, method, agg, unallocated, nonItem });

  const rows = [...agg.values()]
    .map((r) => {
      const landedCents = r.directCents + r.freightCents + r.tariffCents + r.feeCents + r.taxCents;
      return {
        partNumber: r.part,
        description: r.description,
        qboItem: r.qboItem,
        qty: Math.round(r.qty * 100) / 100,
        direct: fromCents(r.directCents),
        freight: fromCents(r.freightCents),
        tariff: fromCents(r.tariffCents),
        fees: fromCents(r.feeCents),
        tax: fromCents(r.taxCents),
        landedCost: fromCents(landedCents),
        unitLandedCost: r.qty ? Math.round(landedCents / r.qty) / 100 : null,
        lineCount: r.lineCount,
      };
    })
    .sort((a, b) => b.landedCost - a.landedCost);

  const csv = toCsv(rows, [
    { key: "partNumber", header: "part_number" },
    { key: "description", header: "description" },
    { key: "qboItem", header: "qbo_item" },
    { key: "qty", header: "total_qty" },
    { key: "direct", header: "direct_spend" },
    { key: "freight", header: "freight_allocated" },
    { key: "tariff", header: "tariff_allocated" },
    { key: "fees", header: "fees_allocated" },
    { key: "tax", header: "tax_allocated" },
    { key: "landedCost", header: "total_landed_cost" },
    { key: "unitLandedCost", header: "unit_landed_cost" },
    { key: "lineCount", header: "line_count" },
  ]);

  const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
  return {
    range: { start, end },
    settings: { paidOnly, allocation: method, vendor: input.vendor || null },
    counts: {
      billsInRange: allBills.length,
      billsIncluded: bills.length,
      vendorCredits: credits.length,
      distinctParts: rows.length,
    },
    totals: {
      direct: Math.round(sum(rows, "direct") * 100) / 100,
      freight: Math.round(sum(rows, "freight") * 100) / 100,
      tariff: Math.round(sum(rows, "tariff") * 100) / 100,
      fees: Math.round(sum(rows, "fees") * 100) / 100,
      tax: Math.round(sum(rows, "tax") * 100) / 100,
      unallocatedOverhead: fromCents(unallocated.reduce((a, u) => a + u.amountCents, 0)),
      nonItemSpend: fromCents(nonItem.reduce((a, n) => a + n.amountCents, 0)),
    },
    items: rows,
    unallocatedOverhead: unallocated.map((u) => ({ ...u, amount: fromCents(u.amountCents), amountCents: undefined })),
    nonItemSpend: summarizeNonItem(nonItem),
    csv,
  };
}

function summarizeNonItem(nonItem) {
  const byAccount = new Map();
  for (const n of nonItem) {
    byAccount.set(n.account, (byAccount.get(n.account) || 0) + n.amountCents);
  }
  return [...byAccount.entries()]
    .map(([account, cents]) => ({ account, amount: fromCents(cents) }))
    .sort((a, b) => b.amount - a.amount);
}

export default { definition, run };
