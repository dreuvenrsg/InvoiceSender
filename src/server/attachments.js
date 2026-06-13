// Upload normalization: the interface sends standard Anthropic content
// blocks; this layer fixes what Claude's API would reject before the agent
// loop sees the conversation.
//   - images (png/jpeg/gif/webp): pass through; repair "image/jpg" etc.
//   - application/pdf: pass through (native document support)
//   - text/* sent as base64: decode into text-source document blocks
//   - Excel .xlsx: no native API support — converted to per-sheet CSV text
// Conversion problems become readable text notes inside the turn (the agent
// explains to the user) rather than hard request failures.
import ExcelJS from "exceljs";

const IMAGE_TYPE_FIXES = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};
const SPREADSHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls — often actually xlsx from modern exporters; we try
  "application/octet-stream+xlsx",
]);
const MAX_SHEET_CSV_CHARS = 150_000; // per uploaded workbook

// Magic-byte prefixes in base64 — browsers/interfaces routinely mislabel
// uploads, and Claude rejects a media_type that contradicts the bytes, so
// the sniffed type wins over the declared one.
const BASE64_MAGIC = [
  ["iVBOR", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
  ["JVBER", "application/pdf"],
  ["UEsDB", "zip"], // xlsx/docx are zip containers
];

export function sniffBase64Type(data) {
  if (typeof data !== "string") return null;
  for (const [prefix, type] of BASE64_MAGIC) {
    if (data.startsWith(prefix)) return type;
  }
  return null;
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.richText) return value.richText.map((r) => r.text).join("");
    if (value.result !== undefined) return cellText(value.result); // formula
    if (value.text) return value.text; // hyperlink
    if (value.error) return String(value.error);
  }
  return String(value);
}

/** Render an .xlsx buffer as per-sheet CSV text (capped). Exported for tests. */
export async function xlsxToCsvText(buffer, { maxChars = MAX_SHEET_CSV_CHARS } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const parts = [];
  let used = 0;
  let truncated = false;
  for (const ws of wb.worksheets) {
    if (used >= maxChars) { truncated = true; break; }
    const lines = [`## Sheet: ${ws.name}`];
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values is 1-indexed (index 0 is empty) — drop it
      lines.push(row.values.slice(1).map(cellText).map(csvCell).join(","));
    });
    let chunk = lines.join("\n");
    if (used + chunk.length > maxChars) {
      chunk = chunk.slice(0, maxChars - used) + "\n[...sheet truncated]";
      truncated = true;
    }
    parts.push(chunk);
    used += chunk.length;
  }
  let out = parts.join("\n\n");
  if (truncated) out += "\n\n[Workbook truncated to fit the conversation — ask for specific sheets/ranges if something is missing.]";
  return out;
}

function textDocumentBlock(title, text) {
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: text },
    title: title || undefined,
  };
}

async function normalizeBlock(block) {
  if (!block || typeof block !== "object") return block;

  if (block.type === "image" && block.source?.media_type) {
    const sniffed = block.source.type === "base64" ? sniffBase64Type(block.source.data) : null;
    const declared = IMAGE_TYPE_FIXES[block.source.media_type] || block.source.media_type;
    // Bytes win over the label (browsers mislabel uploads all the time).
    const mt = sniffed && sniffed.startsWith("image/") ? sniffed : declared;
    return mt === block.source.media_type ? block : { ...block, source: { ...block.source, media_type: mt } };
  }

  if (block.type !== "document" || !block.source) return block;
  const { media_type: mt, type: srcType, data } = block.source;

  if (mt === "application/pdf") return block; // native

  // Plain text family sent as base64 (csv, txt, md, json...) → text source
  if (typeof mt === "string" && (mt.startsWith("text/") || mt === "application/json") && srcType === "base64") {
    return textDocumentBlock(block.title, Buffer.from(data, "base64").toString("utf8"));
  }

  if (SPREADSHEET_TYPES.has(mt) && srcType === "base64") {
    const name = block.title || "uploaded workbook";
    try {
      const csv = await xlsxToCsvText(Buffer.from(data, "base64"));
      return textDocumentBlock(block.title, `Spreadsheet "${name}" converted to CSV:\n\n${csv}`);
    } catch (err) {
      // Likely a true legacy .xls binary — degrade to a note the agent relays.
      return textDocumentBlock(
        block.title,
        `[The uploaded spreadsheet "${name}" could not be parsed (${err.message}). ` +
          `It may be a legacy .xls file — ask the user to re-save it as .xlsx and upload again.]`
      );
    }
  }

  return block; // anything else: let the Claude API be the validator
}

/** Normalize every content block in an incoming messages array. */
export async function normalizeMessages(messages) {
  return Promise.all(
    messages.map(async (m) => {
      if (!Array.isArray(m.content)) return m;
      return { ...m, content: await Promise.all(m.content.map(normalizeBlock)) };
    })
  );
}
