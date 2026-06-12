// qbo_cash_application_lookup — inspect how customer payments (cash receipts)
// were applied to AR invoices, so a payment can be compared line-by-line
// against the customer's remittance advice.
import { qboEscape } from "../../qbo/client.js";
import { toCents, fromCents } from "../../lib/allocation.js";

/** Pure: reshape a QBO Payment + invoice lookup map into a readable summary. */
export function summarizePayment(payment, invoicesById = new Map()) {
  const applications = [];
  for (const line of payment.Line || []) {
    for (const txn of line.LinkedTxn || []) {
      if (txn.TxnType !== "Invoice" && txn.TxnType !== "CreditMemo" && txn.TxnType !== "JournalEntry") continue;
      const inv = invoicesById.get(txn.TxnId);
      applications.push({
        txnType: txn.TxnType,
        txnId: txn.TxnId,
        docNumber: inv?.DocNumber || null,
        invoiceDate: inv?.TxnDate || null,
        invoiceTotal: inv ? Number(inv.TotalAmt) : null,
        invoiceBalance: inv ? Number(inv.Balance) : null,
        amountApplied: Number(line.Amount) || 0,
      });
    }
  }
  const appliedCents = applications.reduce((a, x) => a + toCents(x.amountApplied), 0);
  return {
    paymentId: payment.Id,
    date: payment.TxnDate,
    customer: payment.CustomerRef?.name || payment.CustomerRef?.value,
    referenceNumber: payment.PaymentRefNum || null,
    totalAmount: Number(payment.TotalAmt) || 0,
    unappliedAmount: Number(payment.UnappliedAmt) || 0,
    appliedAmount: fromCents(appliedCents),
    depositToAccount: payment.DepositToAccountRef?.name || null,
    paymentMethod: payment.PaymentMethodRef?.name || null,
    applications,
  };
}

export const definition = {
  name: "qbo_cash_application_lookup",
  description:
    "Look up customer payments (cash applications) in QuickBooks Online and show exactly which " +
    "AR invoices each payment was applied to, with per-invoice applied amounts, unapplied remainder, " +
    "deposit account, and reference (check/ACH) number. Call this when comparing a payment to a " +
    "customer remittance advice, or when asked how/where a customer's payment was applied. " +
    "Filter by customer name, reference number, amount, date range, payment id, or invoice number.",
  input_schema: {
    type: "object",
    properties: {
      customer: { type: "string", description: "Customer display name (exact QBO DisplayName)" },
      reference_number: { type: "string", description: "Check # / ACH reference (PaymentRefNum)" },
      amount: { type: "number", description: "Exact payment total to match" },
      date_from: { type: "string", description: "Payment date range start, YYYY-MM-DD" },
      date_to: { type: "string", description: "Payment date range end, YYYY-MM-DD" },
      payment_id: { type: "string", description: "QBO Payment Id, when already known" },
      invoice_number: { type: "string", description: "Invoice DocNumber — finds all payments applied to this invoice" },
      limit: { type: "integer", description: "Max payments to return (default 25)" },
    },
    required: [],
  },
};

async function fetchInvoicesById(qbo, ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const out = new Map();
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const list = `(${chunk.map((id) => `'${qboEscape(id)}'`).join(",")})`;
    const res = await qbo.query(`SELECT * FROM Invoice WHERE Id IN ${list}`);
    for (const inv of res.Invoice || []) out.set(inv.Id, inv);
  }
  return out;
}

export async function run(input, { qbo }) {
  const limit = input.limit || 25;
  let payments = [];

  if (input.payment_id) {
    const res = await qbo.query(`SELECT * FROM Payment WHERE Id = '${qboEscape(input.payment_id)}'`);
    payments = res.Payment || [];
  } else if (input.invoice_number) {
    // Find the invoice, then scan its customer's payments for links to it.
    const invRes = await qbo.query(
      `SELECT * FROM Invoice WHERE DocNumber = '${qboEscape(input.invoice_number)}'`
    );
    const invoices = invRes.Invoice || [];
    if (!invoices.length) return { matchCount: 0, payments: [], note: `No invoice with DocNumber ${input.invoice_number}` };
    const invoiceIds = new Set(invoices.map((i) => i.Id));
    const customerIds = [...new Set(invoices.map((i) => i.CustomerRef?.value).filter(Boolean))];
    for (const custId of customerIds) {
      const res = await qbo.queryAll("Payment", `CustomerRef = '${qboEscape(custId)}'`);
      payments.push(
        ...res.filter((p) =>
          (p.Line || []).some((l) => (l.LinkedTxn || []).some((t) => invoiceIds.has(t.TxnId)))
        )
      );
    }
  } else {
    const where = [];
    if (input.customer) {
      const custRes = await qbo.query(
        `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${qboEscape(input.customer)}'`
      );
      const cust = (custRes.Customer || [])[0];
      if (!cust) return { matchCount: 0, payments: [], note: `No customer named "${input.customer}"` };
      where.push(`CustomerRef = '${cust.Id}'`);
    }
    if (input.date_from) where.push(`TxnDate >= '${qboEscape(input.date_from)}'`);
    if (input.date_to) where.push(`TxnDate <= '${qboEscape(input.date_to)}'`);
    if (input.amount !== undefined) where.push(`TotalAmt = '${Number(input.amount)}'`);
    payments = await qbo.queryAll("Payment", where.join(" AND "), "TxnDate");
    // PaymentRefNum is not queryable server-side on all minorversions; filter here.
    if (input.reference_number) {
      payments = payments.filter((p) => (p.PaymentRefNum || "").trim() === input.reference_number.trim());
    }
  }

  const matchCount = payments.length;
  payments = payments.slice(0, limit);

  const linkedIds = payments.flatMap((p) =>
    (p.Line || []).flatMap((l) => (l.LinkedTxn || []).filter((t) => t.TxnType === "Invoice").map((t) => t.TxnId))
  );
  const invoicesById = await fetchInvoicesById(qbo, linkedIds);

  return {
    matchCount,
    returned: payments.length,
    payments: payments.map((p) => summarizePayment(p, invoicesById)),
  };
}

export default { definition, run };
