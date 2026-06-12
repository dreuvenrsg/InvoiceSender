// Structured request/response logging for the RSG AI agent API.
// One JSON line per record to stdout (CloudWatch-friendly), optionally
// mirrored to RSG_AI_LOG_FILE. Every record carries the requestId so a full
// conversation turn (request -> tool calls -> response) can be reassembled
// when debugging.
import fs from "node:fs";

export function truncate(value, max = 2000) {
  if (value === null || value === undefined) return value;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…[+${s.length - max} chars]` : s;
}

/** Extract the latest human-written text from a messages array (skips tool_result turns). */
export function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const texts = m.content.filter((b) => b.type === "text").map((b) => b.text);
      if (texts.length) return texts.join("\n");
      if (m.content.some((b) => b.type === "document" || b.type === "image")) return "[document/image upload]";
      // tool_result-only turn — keep looking further back
    }
  }
  return "";
}

export function createLogger(logFile = process.env.RSG_AI_LOG_FILE) {
  return function log(record) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    console.log(line);
    if (logFile) {
      try {
        fs.appendFileSync(logFile, line + "\n");
      } catch (err) {
        console.error("[rsg-ai] log file write failed:", err.message);
      }
    }
  };
}
