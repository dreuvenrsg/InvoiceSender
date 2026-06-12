import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeForModel, extractArtifacts, DEFAULT_MODEL } from "../src/server/agentLoop.js";
import { isAuthorized, sseEncode } from "../src/server/index.js";
import { SYSTEM_PROMPT } from "../src/server/systemPrompt.js";

test("summarizeForModel strips csv and truncates long item lists", () => {
  const items = Array.from({ length: 250 }, (_, i) => ({ partNumber: `P-${i}` }));
  const out = summarizeForModel({ csv: "a,b\n1,2\n", items, totals: { direct: 5 } });
  assert.equal(out.csv, undefined);
  assert.equal(out.items.length, 100);
  assert.equal(out.itemsOmitted, 150);
  assert.ok(out.note.includes("CSV artifact"));
  assert.deepEqual(out.totals, { direct: 5 });
});

test("summarizeForModel passes small results through untouched (minus csv)", () => {
  const out = summarizeForModel({ csv: "x", items: [{ a: 1 }], matchCount: 1 });
  assert.equal(out.items.length, 1);
  assert.equal(out.itemsOmitted, undefined);
  assert.equal(out.matchCount, 1);
  assert.equal(summarizeForModel(null), null);
});

test("extractArtifacts emits CSVs as named artifacts", () => {
  const arts = extractArtifacts("qbo_landed_cost_report", { csv: "a,b\n" });
  assert.deepEqual(arts, [{ name: "landed_cost_report.csv", contentType: "text/csv", content: "a,b\n" }]);
  assert.deepEqual(extractArtifacts("qbo_cash_application_lookup", { matchCount: 0 }), []);
});

test("isAuthorized requires exact bearer match and a configured key", () => {
  assert.equal(isAuthorized({ headers: { authorization: "Bearer s3cret" } }, "s3cret"), true);
  assert.equal(isAuthorized({ headers: { authorization: "Bearer wrong" } }, "s3cret"), false);
  assert.equal(isAuthorized({ headers: {} }, "s3cret"), false);
  // no key configured -> nothing is authorized (fail closed)
  assert.equal(isAuthorized({ headers: { authorization: "Bearer " } }, ""), false);
  assert.equal(isAuthorized({ headers: { authorization: "Bearer undefined" } }, undefined), false);
});

test("sseEncode produces valid SSE frames", () => {
  const frame = sseEncode({ type: "text", text: "hi\nthere" });
  assert.equal(frame, 'event: text\ndata: {"type":"text","text":"hi\\nthere"}\n\n');
});

test("system prompt carries the bookkeeping conventions the tools depend on", () => {
  assert.ok(SYSTEM_PROMPT.includes("COGS Purchasing"));
  assert.ok(SYSTEM_PROMPT.includes("PART-NUMBER"));
  assert.ok(SYSTEM_PROMPT.includes("unallocatedOverhead"));
  assert.ok(/remittance/i.test(SYSTEM_PROMPT));
});

test("default model is a current Claude model id", () => {
  assert.match(DEFAULT_MODEL, /^claude-(opus-4-8|fable-5)$/);
});
