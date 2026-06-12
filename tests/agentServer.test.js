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

test("attachment normalization: images, pdf, text, xlsx", async () => {
  const { normalizeMessages, xlsxToCsvText } = await import("../src/server/attachments.js");
  const ExcelJS = (await import("exceljs")).default;

  // Build a real workbook fixture
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Remit");
  ws.addRow(["Invoice", "Amount"]);
  ws.addRow(["F1001", 496.3]);
  ws.addRow(["F1004, partial", 48.8]); // comma forces CSV quoting
  const xlsxB64 = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");

  const [msg] = await normalizeMessages([
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpg", data: "abc" } },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: "abc" }, title: "remit.pdf" },
        { type: "document", source: { type: "base64", media_type: "text/csv", data: Buffer.from("a,b\n1,2").toString("base64") }, title: "data.csv" },
        { type: "document", source: { type: "base64", media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data: xlsxB64 }, title: "remit.xlsx" },
        { type: "text", text: "check this" },
      ],
    },
  ]);

  const [jpg, png, pdf, csv, xlsx, text] = msg.content;
  assert.equal(jpg.source.media_type, "image/jpeg"); // repaired ("abc" sniffs as nothing -> declared type fixed)
  assert.equal(png.source.media_type, "image/png"); // untouched
  assert.equal(pdf.source.media_type, "application/pdf"); // native passthrough
  assert.equal(csv.source.type, "text"); // decoded
  assert.ok(csv.source.data.includes("a,b"));
  assert.equal(xlsx.source.type, "text"); // converted
  assert.ok(xlsx.source.data.includes("## Sheet: Remit"));
  assert.ok(xlsx.source.data.includes("F1001,496.3"));
  assert.ok(xlsx.source.data.includes('"F1004, partial"')); // CSV quoting
  assert.equal(text.text, "check this"); // untouched

  // Garbage spreadsheet degrades to a note, not a throw
  const [bad] = await normalizeMessages([
    { role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/vnd.ms-excel", data: Buffer.from("not a workbook").toString("base64") }, title: "old.xls" }] },
  ]);
  assert.equal(bad.content[0].source.type, "text");
  assert.match(bad.content[0].source.data, /could not be parsed/);

  // Truncation cap honored
  const big = new ExcelJS.Workbook();
  const s2 = big.addWorksheet("Big");
  for (let i = 0; i < 500; i++) s2.addRow([`row-${i}`, "x".repeat(100)]);
  const out = await xlsxToCsvText(Buffer.from(await big.xlsx.writeBuffer()), { maxChars: 5000 });
  assert.ok(out.length < 6000);
  assert.match(out, /truncated/);

  // String-content messages pass through untouched
  const [plain] = await normalizeMessages([{ role: "user", content: "hello" }]);
  assert.equal(plain.content, "hello");
});

test("attachment normalization sniffs real bytes over the declared type", async () => {
  const { normalizeMessages, sniffBase64Type } = await import("../src/server/attachments.js");
  const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  assert.equal(sniffBase64Type(pngB64), "image/png");
  assert.equal(sniffBase64Type("JVBERi0xLjQ="), "application/pdf");
  assert.equal(sniffBase64Type("zzzz"), null);

  // PNG bytes labeled image/jpeg -> corrected to image/png
  const [msg] = await normalizeMessages([
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: pngB64 } }] },
  ]);
  assert.equal(msg.content[0].source.media_type, "image/png");
});
