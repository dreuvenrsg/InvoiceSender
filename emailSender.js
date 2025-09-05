/**
 * QBO Email & Send Flow (modular, with override logic)
 * ----------------------------------------------------
 * - Query invoices with EmailStatus = 'NeedToSend' AND Balance > 0
 * - For each invoice:
 *    a) read fresh (get SyncToken)
 *    b) call external API (placeholder)
 *    c) update BillEmail, TrackingNum, ShipMethodRef
 *    d) send the invoice via QBO
 */

const BASE = `https://quickbooks.api.intuit.com/v3/company`;
const realmId = "9341455274031163";
// const token   = process.env.QBO_ACCESS_TOKEN;
const client_id = "ABXwL9InXkQm2O8wAGHygNnKyb91FsWRcNuFDNoAAutFVVNgu7";
const token = "DvfQ3Xtak9ETP2ElSiVl7LRlDsetGU9xaaWynPKA";
// ---------- HTTP helpers ----------
async function qboGET(pathAndQuery) {
  const r = await fetch(`${BASE}/${realmId}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (!r.ok) throw new Error(`${pathAndQuery} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function qboPOST(pathAndQuery, body) {
  const r = await fetch(`${BASE}/${realmId}${pathAndQuery}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`${pathAndQuery} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function qboQuery(q) {
  const resp = await qboGET(`/query?minorversion=65&query=${encodeURIComponent(q)}`);
  return resp.QueryResponse || {};
}

// ---------- Data fetchers ----------
async function getUnsentUnpaidInvoices() {
  // Get invoices that haven’t been emailed yet and still have a balance
  const q = `
    SELECT Id, DocNumber, Balance, EmailStatus, CustomerRef, BillEmail
    FROM Invoice
    WHERE EmailStatus = 'NeedToSend' AND Balance > 0
    ORDER BY TxnDate DESC
  `;
  const { Invoice = [] } = await qboQuery(q);
  return Invoice;
}

async function getCustomersMap(invoices) {
  // Build a map of customerId -> {DisplayName, PrimaryEmail}
  const ids = [...new Set(invoices.map(i => i.CustomerRef?.value).filter(Boolean))];
  if (!ids.length) return {};

  const q = `SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE Id IN (${ids.map(id => `'${id}'`).join(',')})`;
  const { Customer = [] } = await qboQuery(q);
  const result = {};
  for (const c of Customer) {
    result[c.Id] = {
      DisplayName: c.DisplayName,
      PrimaryEmail: c.PrimaryEmailAddr?.Address || null
    };
  }
  return result;
}

async function readInvoiceById(id) {
  // Get the latest invoice with SyncToken
  const { Invoice } = await qboGET(`/invoice/${id}?minorversion=65`);
  return Invoice;
}

async function resolveShipMethodRefByName(name) {
  // Convert ship method name -> reference object
  if (!name) return null;
  const q = `SELECT Name, Id FROM ShipMethod WHERE Name = '${name.replace(/'/g,"''")}'`;
  const { ShipMethod = [] } = await qboQuery(q);
  if (!ShipMethod.length) return null;
  return { value: ShipMethod[0].Id, name: ShipMethod[0].Name };
}

// ---------- Updaters ----------
async function updateInvoiceSparse(invoiceId, syncToken, fieldsToUpdate) {
  // Perform sparse update with only the changed fields
  const body = {
    Invoice: {
      Id: invoiceId,
      SyncToken: syncToken,
      sparse: true,
      ...fieldsToUpdate
    }
  };
  const { Invoice } = await qboPOST(`/invoice?minorversion=65`, body);
  return Invoice;
}

async function sendInvoice(invoiceId) {
  // Trigger QBO to send invoice email
  await qboPOST(`/invoice/${invoiceId}/send?minorversion=65`, null);
  return true;
}

// ---------- Utilities ----------
function normalizeEmails(input) {
  // Normalize array/string of emails into "a@x.com, b@y.com" format
  if (!input) return '';
  const raw = Array.isArray(input) ? input.join(',') : String(input);
  const tokens = raw.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const unique = [...new Set(tokens.filter(isEmail).map(s => s.toLowerCase()))];
  return unique.join(', ');
}

// ---------- Placeholder for YOUR external call ----------
async function fetchExternalDataForInvoice({ invoice, customer }) {
  // Replace with your actual API call
  // Return { additionalEmails: [], trackingNumber: '', shipMethodName: '' }
  return {
    // Example:
    // additionalEmails: ['ops@example.com', 'ap@example.com'],
    // trackingNumber: '1Z999AA10123456784',
    // shipMethodName: 'UPS Ground'
  };
}

// ---------- Core flow for a single invoice ----------
async function processSingleInvoice(invoice, customersMap) {
  // 1. Read full invoice with SyncToken
  const full = await readInvoiceById(invoice.Id);
  const customer = customersMap[full.CustomerRef?.value] || {};

  // 2. Get extra data from external API
  const external = await fetchExternalDataForInvoice({ invoice: full, customer });

  // 3. Build email recipients
  let recipients = '';
  if (external?.additionalEmails?.length) {
    // OVERRIDE: external emails win entirely
    recipients = normalizeEmails(external.additionalEmails);
  } else {
    // Otherwise fall back to invoice + customer + optional fallback
    const fallbackEmail = process.env.DEFAULT_FALLBACK_EMAIL || '';
    recipients = normalizeEmails([
      full.BillEmail?.Address,
      customer.PrimaryEmail,
      fallbackEmail
    ]);
  }

  // 4. Pick tracking number
  const tracking = external?.trackingNumber || full.TrackingNum || null;

  // 5. Pick ship method (by resolving name if given)
  let shipMethodRef = full.ShipMethodRef || null;
  const desiredShipName = external?.shipMethodName || process.env.DEFAULT_SHIP_METHOD || null;
  if (desiredShipName) {
    const resolved = await resolveShipMethodRefByName(desiredShipName);
    if (resolved) shipMethodRef = resolved;
  }

  // 6. Update invoice if needed
  const fields = {};
  if (recipients) fields.BillEmail = { Address: recipients };
  if (tracking)  fields.TrackingNum = tracking;
  if (shipMethodRef?.value) fields.ShipMethodRef = shipMethodRef;

  let updated = full;
  if (Object.keys(fields).length) {
    updated = await updateInvoiceSparse(full.Id, full.SyncToken, fields);
    console.log(`Updated #${updated.DocNumber}: to="${updated.BillEmail?.Address}"`);
  }

  // 7. Send invoice from QBO
  // await sendInvoice(updated.Id);
  console.log(`Sent invoice #${updated.DocNumber}`);
}

// ---------- Orchestrator ----------
async function main() {
  if (!realmId || !token) {
    console.error('Missing QBO_REALM_ID or QBO_ACCESS_TOKEN');
    process.exit(1);
  }

  // a) Find unsent/unpaid invoices
  const invoices = await getUnsentUnpaidInvoices();
  if (!invoices.length) {
    console.log('No invoices to process.');
    return;
  }

  // b) Fetch customers linked to those invoices
  const customersMap = await getCustomersMap(invoices);

  // c) Process each invoice one by one
  for (const inv of invoices) {
    try {
      await processSingleInvoice(inv, customersMap);
    } catch (err) {
      console.error(`Error processing invoice Id=${inv.Id}:`, err.message);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
