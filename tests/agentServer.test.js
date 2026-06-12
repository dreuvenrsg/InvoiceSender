import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeForModel, extractArtifacts, DEFAULT_MODEL } from "../src/server/agentLoop.js";
import { isAuthorized, sseEncode } from "../src/server/index.js";
import { buildSystemPrompt } from "../src/server/systemPrompt.js";
const SYSTEM_PROMPT = buildSystemPrompt();

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

test("system prompt includes knowledge files and the fulcrum sorting quirk", () => {
  assert.ok(SYSTEM_PROMPT.includes("IGNORE server-side sorting"));
  assert.ok(SYSTEM_PROMPT.includes("Learned notes (agent-written)"));
  assert.ok(SYSTEM_PROMPT.includes("save_operational_note"));
});

test("save_operational_note appends to the learned notes file", async (t) => {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { run, learnedNotesPath } = await import("../src/tools/system/saveNote.js");
  const tmp = path.join(os.tmpdir(), `learned-test-${process.pid}.md`);
  process.env.RSG_AI_LEARNED_NOTES_FILE = tmp;
  t.after(() => { delete process.env.RSG_AI_LEARNED_NOTES_FILE; fs.rmSync(tmp, { force: true }); });

  assert.equal(learnedNotesPath(), tmp);
  const res = await run({ topic: "fulcrum", note: "Take caps at 50\neven when asking for more." });
  assert.equal(res.saved, true);
  const content = fs.readFileSync(tmp, "utf8");
  assert.match(content, /- \[\d{4}-\d{2}-\d{2}\] \(fulcrum\) Take caps at 50 even when asking for more\./);
});

test("log helpers: truncate and lastUserText", async () => {
  const { truncate, lastUserText, createLogger } = await import("../src/server/log.js");
  assert.equal(truncate("short"), "short");
  const t = truncate("x".repeat(3000), 100);
  assert.ok(t.startsWith("x".repeat(100)) && t.includes("[+2900 chars]"));
  assert.equal(truncate({ a: 1 }, 100), '{"a":1}');

  assert.equal(lastUserText([{ role: "user", content: "hi" }]), "hi");
  assert.equal(
    lastUserText([
      { role: "user", content: "real question" },
      { role: "assistant", content: [{ type: "tool_use", id: "1", name: "t", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "{}" }] },
    ]),
    "real question"
  );
  assert.equal(
    lastUserText([{ role: "user", content: [{ type: "document", source: {} }] }]),
    "[document/image upload]"
  );

  // createLogger writes JSONL to the file sink
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const tmp = path.join(os.tmpdir(), `rsgai-log-${process.pid}.jsonl`);
  const log = createLogger(tmp);
  log({ type: "chat_request", requestId: "r1", user: "test@rsgsecurity.com" });
  const rec = JSON.parse(fs.readFileSync(tmp, "utf8").trim());
  assert.equal(rec.user, "test@rsgsecurity.com");
  assert.ok(rec.ts);
  fs.rmSync(tmp, { force: true });
});
