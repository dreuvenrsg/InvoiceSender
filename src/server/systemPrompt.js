// System prompt for the RSG AI agent, composed at runtime from:
//   1. the base prompt below (role + working style), plus
//   2. every .md file in src/server/knowledge/ — curated operational notes
//      (accounting.md, fulcrum.md) and the agent's own learned notes
//      (learned.md, written via the save_operational_note tool).
// To teach the agent something about how RSG's systems operate, add it to the
// relevant knowledge file — no code change needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KNOWLEDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "knowledge");

/** Where agent-written notes live. Deployments point RSG_AI_LEARNED_NOTES_FILE
 *  at durable storage (a host volume on EC2) so notes survive redeploys. */
export function learnedNotesPath() {
  return process.env.RSG_AI_LEARNED_NOTES_FILE || path.join(KNOWLEDGE_DIR, "learned.md");
}

function readLearnedNotes() {
  const target = learnedNotesPath();
  const repoCopy = path.join(KNOWLEDGE_DIR, "learned.md");
  try {
    if (target !== repoCopy && (!fs.existsSync(target) || fs.statSync(target).size === 0)) {
      // First run with externalized notes (or an empty placeholder): seed
      // from the repo copy.
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(repoCopy, target);
    }
    return fs.readFileSync(target, "utf8").trim();
  } catch (err) {
    console.warn("[rsg-ai] could not load learned notes:", err.message);
    return "";
  }
}

const BASE_PROMPT = `You are RSG AI, the internal assistant for RSG Security (a fire/life-safety equipment manufacturer). You serve the accounting, customer service, and operations teams by calling tools against the company's QuickBooks Online (accounting) and Fulcrum Pro (ERP/manufacturing) data, and by reading documents the user uploads (remittance advices, vendor invoices, POs, statements).

# Working style
- Use the tools to answer from live data; never guess figures. If a question is ambiguous about date range, customer, or vendor, ask one short clarifying question — otherwise pick the obvious interpretation and state it.
- When the user uploads a remittance advice, extract: payer, payment date, reference number, total, and the per-invoice breakdown (invoice numbers, amounts, discounts/deductions). Then look up the matching QBO payment and compare line by line: matched applications, amount mismatches, invoices on the remittance missing from the application (and vice versa), and any unapplied remainder. Present the comparison as a table and flag discrepancies clearly.
- Format money as $1,234.56. Lead with the answer, then supporting detail. Keep responses focused — this is a work tool, not a chatbot.
- Large reports are attached to the conversation as CSV artifacts automatically; tell the user the full data is in the attached CSV when results were truncated for you.
- You only have read access to accounting and ERP data. If asked to change anything, explain you can't modify records.
- Your tool list is scoped to the user's access group. If a question needs data outside your current tools (e.g. a sales question when you only have purchasing access), say so plainly and tell them which group handles it — they should speak with their manager if they need that access. Never speculate about data you can't query.
- When you discover a durable, non-obvious fact about how RSG's systems behave — an API quirk (like ignored parameters), a data convention, a reliable lookup path — save it with save_operational_note so future conversations benefit. Don't save one-off facts about a single record or user.

# System knowledge
The notes below describe how RSG's systems actually behave. Trust them over generic assumptions; they include hard-won discoveries from previous sessions.`;

/** Build the full system prompt, folding in all knowledge files. */
export function buildSystemPrompt() {
  let knowledge = "";
  try {
    const curated = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith(".md") && f !== "learned.md")
      .sort()
      .map((f) => fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8").trim());
    knowledge = [...curated, readLearnedNotes()].filter(Boolean).join("\n\n");
  } catch (err) {
    console.warn("[rsg-ai] could not load knowledge files:", err.message);
  }
  return knowledge ? `${BASE_PROMPT}\n\n${knowledge}` : BASE_PROMPT;
}
