// save_operational_note — the agent's self-improvement loop. Durable
// discoveries about how RSG's systems behave get appended to the learned
// knowledge file, which is folded into the system prompt on every turn.
// Humans review/prune via git diff and promote stable entries into the
// curated knowledge files.
import fs from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "../../server/systemPrompt.js";

export function learnedNotesPath() {
  return process.env.RSG_AI_LEARNED_NOTES_FILE || path.join(KNOWLEDGE_DIR, "learned.md");
}

export const definition = {
  name: "save_operational_note",
  description:
    "Save a durable, non-obvious fact you discovered about how RSG's systems behave, so future " +
    "conversations benefit — e.g. an API quirk (ignored parameters, undocumented endpoints, paging " +
    "limits), a data-entry convention, or a reliable lookup path. The note is added to your own " +
    "system knowledge permanently. Do NOT save one-off facts about a single record, customer-specific " +
    "details from a conversation, or anything you were told rather than verified.",
  input_schema: {
    type: "object",
    properties: {
      topic: { type: "string", enum: ["fulcrum", "accounting", "general"], description: "Which system the note is about" },
      note: { type: "string", description: "The fact, stated precisely in 1-3 sentences, including how you verified it" },
    },
    required: ["topic", "note"],
  },
};

export async function run(input) {
  const file = learnedNotesPath();
  const date = new Date().toISOString().slice(0, 10);
  const line = `\n- [${date}] (${input.topic}) ${input.note.trim().replace(/\s*\n\s*/g, " ")}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + "\n");
  return { saved: true, file };
}

export default { definition, run };
