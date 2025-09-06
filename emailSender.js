/**
 * QBO Email & Send Flow (with hardcoded credentials + auto refresh)
 * -----------------------------------------------------------------
 * - Refreshes access token before each call
 * - Rotates refresh token (logs it for you)
 * - Gets unsent/unpaid invoices
 * - Updates BillEmail, TrackingNum, ShipMethodRef
 * - Sends the invoice
 */

import fetch from "node-fetch";

// --------------------
// Hardcoded credentials
// --------------------
//SANDBOX
const CLIENT_ID = "ABXwL9InXkQm2O8wAGHygNnKyb91FsWRcNuFDNoAAutFVVNgu7";
const CLIENT_SECRET = "DvfQ3Xtak9ETP2ElSiVl7LRlDsetGU9xaaWynPKA"
const REFRESH_TOKEN = "RT1-122-H0-17659241134a484oqup2plo8ptb5fc";
const ACCESS_TOKEN = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..sxA-sWtvbC4KV377uS_MFw.RGqvmGpHNCaHpTZMTueCGu1QfJknd0FlW8oHFjKhd8gBEbDDF97uRQQ_L6M5gIvPp-FFdXYgJ9uJ4vtL0elJOhmScnPobIqvsKV0gSiXeyDbyZrr6_kg7CBW_3iPlQEDTeoGrNRXRXB943-xoA5eNACAuqGjgkbmkfAmR8H7RJaJx7kyFtYcwsaGtp7rru_mQJ6_W6Actr-wAzeROpfzB-c90mUAhZyTreqj5pBejqPC-cn6GDjOdimmIRoKKWBTC0lBNQYJ9fhOvBiRIuEYk3PD6HdXU8f99VxqPNF_lOy6Dn2ZSxQWVIDkFvI9nrS9DlyDd-fZPGUvaU57hW8NLBirmh8ZPr3HRiO-aO73eLnU0ZgF3yuAo7zvlToc4cYE_IpoF6_oZm_kkniJHCMWSpbwEoxpm6qn5QsoeNjquBrW5L-KIdg1bhliNMyBWAnSJBBlJ3CCrUBVnv3yPC-r_Sz9YR591i6vQO89nSFxbd6QN5FZ9xnjGpNREBbSdsTwE7PNo5JCBkpWfQp43PjEVOipasT4F_aT4E9chz4cbr3maF2CuXaQDZ6BNa12-h5zCMRfVs5133sDTO-92DxM9bsn1FcIkJTYX9TlL5rlwcDU0qbXxl_WpKrumFF_ZAAn.18X9z7GHpVQdjQQZh80qTw";
const ID_TOKEN = "eyJraWQiOiJPUElDUFJEMDUxMDIwMjMiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOlsiQUJYd0w5SW5Ya1FtMk84d0FHSHlnTm5LeWI5MUZzV1JjTnVGRE5vQUF1dEZWVk5ndTciXSwic3ViIjoiZTRlYjIxYTgtYzRjZS0zZjBhLWJhNmEtYWFhYTAyZGI1YTgxIiwicmVhbG1pZCI6IjkzNDE0NTUyNzQwMzExNjMiLCJhdXRoX3RpbWUiOjE3NTcxOTc3MDQsImlzcyI6Imh0dHBzOi8vb2F1dGgucGxhdGZvcm0uaW50dWl0LmNvbS9vcC92MSIsImV4cCI6MTc1NzIwMTMxMywiaWF0IjoxNzU3MTk3NzEzfQ.C8HPxTuyv_ox7IVV5dH2jnEABnhF8NOqRWSQ5rXeY9B1ygPhsHMX27ES6ShXL3Eqw4tn9jjTsufkOhxBoxD4cR9Q_SiWJwwELtemluSYpTvCXz3ucvBdEyY3wQGbCPUG4kS9ltD35Eqn_0ICMFrE58aODRGa01VvhNM4gfVyuM62-rFdDmSYPqeSkeDtxFzgWff5rfyegAkfaFQAmOGhABE-hZBG1oZe5OSBmYtyYtZNYxww1co5U2_8aLxfxUL2AM8X-treMk5rt3qcelmNzX7Gse9TYSq9DcBebJ30SIBzcxwnGW2EwYB_31BjNOy743h_6HWUQxr8crCh4n7NNw";
//PRODUCTION
// const CLIENT_ID     = "ABFEj4xs3FW9f1oCAEXrH0Ww04eFdJAbQSQwbq03imSVrkXLY4";
// const CLIENT_SECRET = "5sYuOuGpVmHWErATqsUk4jmIrDfIu2GtnHy5sWfc";
// let   REFRESH_TOKEN = "YOUR_REFRESH_TOKEN";    // Replace with latest each run
const REALM_ID      = "YOUR_REALM_ID";         // company ID
//END PROD VARS
const HOST          = "https://quickbooks.api.intuit.com/v3/company"; 
// Use https://sandbox-quickbooks.api.intuit.com/v3/company if sandbox

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

// --------------------
// Refresh Access Token
// --------------------
async function refreshAccessToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();

  // ⚠️ Intuit rotates refresh tokens every time
  console.log("⚠️ NEW REFRESH TOKEN (replace in code for next run):", json.refresh_token);
  REFRESH_TOKEN = json.refresh_token; // use for this run

  return json.access_token;
}

// --------------------
// QBO GET/POST helpers
// --------------------
async function qboGET(pathAndQuery) {
  const at = await refreshAccessToken();
  const url = `${HOST}/${REALM_ID}${pathAndQuery}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${at}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${pathAndQuery} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function qboPOST(pathAndQuery, body) {
  const at = await refreshAccessToken();
  const url = `${HOST}/${REALM_ID}${pathAndQuery}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${at}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${pathAndQuery} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function qboQuery(q) {
  const resp = await qboGET(`/query?minorversion=65&query=${encodeURIComponent(q)}`);
  return resp.QueryResponse || {};
}

// --------------------
// Data fetchers
// --------------------
async function getUnsentUnpaidInvoices() {
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
  const ids = [...new Set(invoices.map(i => i.CustomerRef?.value).filter(Boolean))];
  if (!ids.length) return {};
  const q = `SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE Id IN (${ids.map(id => `'${id}'`).join(',')})`;
  const { Customer = [] } = await qboQuery(q);
  const result = {};
  for (const c of Customer) {
    result[c.Id] = { DisplayName: c.DisplayName, PrimaryEmail: c.PrimaryEmailAddr?.Address || null };
  }
  return result;
}

async function readInvoiceById(id) {
  const { Invoice } = await qboGET(`/invoice/${id}?minorversion=65`);
  return Invoice;
}

async function resolveShipMethodRefByName(name) {
  if (!name) return null;
  const q = `SELECT Name, Id FROM ShipMethod WHERE Name = '${name.replace(/'/g,"''")}'`;
  const { ShipMethod = [] } = await qboQuery(q);
  if (!ShipMethod.length) return null;
  return { value: ShipMethod[0].Id, name: ShipMethod[0].Name };
}

// --------------------
// Updaters
// --------------------
async function updateInvoiceSparse(invoiceId, syncToken, fieldsToUpdate) {
  const body = { Invoice: { Id: invoiceId, SyncToken: syncToken, sparse: true, ...fieldsToUpdate } };
  const { Invoice } = await qboPOST(`/invoice?minorversion=65`, body);
  return Invoice;
}

async function sendInvoice(invoiceId) {
  await qboPOST(`/invoice/${invoiceId}/send?minorversion=65`, null);
  return true;
}

// --------------------
// Utilities
// --------------------
function normalizeEmails(input) {
  if (!input) return '';
  const raw = Array.isArray(input) ? input.join(',') : String(input);
  const tokens = raw.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return [...new Set(tokens.filter(isEmail).map(s => s.toLowerCase()))].join(', ');
}

// --------------------
// External API placeholder
// --------------------
async function fetchExternalDataForInvoice({ invoice, customer }) {
  return {
    // Example: fill these from your external system
    // additionalEmails: ['ops@example.com', 'ap@example.com'],
    // trackingNumber: '1Z999AA10123456784',
    // shipMethodName: 'UPS Ground'
  };
}

// --------------------
// Process a single invoice
// --------------------
async function processSingleInvoice(invoice, customersMap) {
  const full = await readInvoiceById(invoice.Id);
  const customer = customersMap[full.CustomerRef?.value] || {};
  const external = await fetchExternalDataForInvoice({ invoice: full, customer });

  // Emails: external overrides, otherwise invoice/customer/fallback
  let recipients = '';
  if (external?.additionalEmails?.length) {
    recipients = normalizeEmails(external.additionalEmails);
  } else {
    recipients = normalizeEmails([ full.BillEmail?.Address, customer.PrimaryEmail ]);
  }

  const tracking = external?.trackingNumber || full.TrackingNum || null;
  let shipMethodRef = full.ShipMethodRef || null;
  if (external?.shipMethodName) {
    const resolved = await resolveShipMethodRefByName(external.shipMethodName);
    if (resolved) shipMethodRef = resolved;
  }

  const fields = {};
  if (recipients) fields.BillEmail = { Address: recipients };
  if (tracking) fields.TrackingNum = tracking;
  if (shipMethodRef?.value) fields.ShipMethodRef = shipMethodRef;

  let updated = full;
  if (Object.keys(fields).length) {
    updated = await updateInvoiceSparse(full.Id, full.SyncToken, fields);
    console.log(`Updated #${updated.DocNumber}: to="${updated.BillEmail?.Address}"`);
  }

  await sendInvoice(updated.Id);
  console.log(`Sent invoice #${updated.DocNumber}`);
}

// --------------------
// Orchestrator
// --------------------
async function main() {
  const invoices = await getUnsentUnpaidInvoices();
  if (!invoices.length) {
    console.log("No invoices to process.");
    return;
  }

  const customersMap = await getCustomersMap(invoices);
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
