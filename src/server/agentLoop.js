// The RSG AI agent loop: a manual Claude tool-use loop over the accounting
// tool registry. Each turn streams events to `onEvent` (text deltas, tool
// activity, artifacts) so an HTTP layer can relay them to a chat UI.
import Anthropic from "@anthropic-ai/sdk";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { REGION } from "../qbo/config.js";
import { toolDefinitions, getTool } from "../tools/index.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

export const DEFAULT_MODEL = process.env.RSG_AI_MODEL || "claude-opus-4-8";
export const ANTHROPIC_KEY_PARAM = "/rsg-ai/prod/anthropic-api-key";
export const MAX_AGENT_ITERATIONS = 15;
const MAX_ITEMS_FOR_MODEL = 100;

/** Anthropic key from env, falling back to SSM (repo convention for secrets). */
export async function resolveAnthropicClient() {
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic();
  try {
    const ssm = new SSMClient({ region: REGION });
    const res = await ssm.send(
      new GetParameterCommand({ Name: ANTHROPIC_KEY_PARAM, WithDecryption: true })
    );
    return new Anthropic({ apiKey: res.Parameter.Value });
  } catch (err) {
    throw new Error(
      `No Anthropic API key: set ANTHROPIC_API_KEY or store one in SSM at ${ANTHROPIC_KEY_PARAM} (${err.message})`
    );
  }
}

/**
 * Shrink a tool result before it enters the model's context: drop bulk CSV
 * payloads (they go to the UI as artifacts instead) and cap long row lists.
 */
export function summarizeForModel(result) {
  if (!result || typeof result !== "object") return result;
  const { csv, ...rest } = result;
  if (Array.isArray(rest.items) && rest.items.length > MAX_ITEMS_FOR_MODEL) {
    rest.itemsOmitted = rest.items.length - MAX_ITEMS_FOR_MODEL;
    rest.items = rest.items.slice(0, MAX_ITEMS_FOR_MODEL);
    rest.note = `items truncated to top ${MAX_ITEMS_FOR_MODEL} by value; the full table was attached to the conversation as a CSV artifact for the user.`;
  }
  return rest;
}

/** Pull downloadable artifacts (e.g. report CSVs) out of a tool result. */
export function extractArtifacts(toolName, result) {
  if (result && typeof result.csv === "string") {
    return [{ name: `${toolName.replace(/^qbo_/, "")}.csv`, contentType: "text/csv", content: result.csv }];
  }
  return [];
}

/**
 * Run one agent turn. `messages` is standard Anthropic MessageParam[] history
 * ending in a user message (document content blocks allowed for uploads).
 * Returns { newMessages, stopReason, usage } where newMessages are the turns
 * appended during this run — the caller persists them for follow-ups.
 */
export async function runAgentTurn({ client, messages, ctx, onEvent = () => {}, model = DEFAULT_MODEL }) {
  const convo = [...messages];
  const baseLength = convo.length;
  let usage = null;

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: SYSTEM_PROMPT,
      tools: toolDefinitions(),
      messages: convo,
    });
    stream.on("text", (delta) => onEvent({ type: "text", text: delta }));
    const message = await stream.finalMessage();
    usage = message.usage;
    convo.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      onEvent({ type: "done", stopReason: message.stop_reason, usage });
      return { newMessages: convo.slice(baseLength), stopReason: message.stop_reason, usage };
    }

    const results = [];
    for (const tu of toolUses) {
      onEvent({ type: "tool_use", name: tu.name, input: tu.input });
      try {
        const tool = getTool(tu.name);
        if (!tool) throw new Error(`Unknown tool: ${tu.name}`);
        const result = await tool.run(tu.input || {}, ctx);
        for (const artifact of extractArtifacts(tu.name, result)) {
          onEvent({ type: "artifact", ...artifact });
        }
        onEvent({ type: "tool_result", name: tu.name, ok: true });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(summarizeForModel(result)),
        });
      } catch (err) {
        onEvent({ type: "tool_result", name: tu.name, ok: false, error: err.message });
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Tool failed: ${err.message}`,
          is_error: true,
        });
      }
    }
    convo.push({ role: "user", content: results });
  }

  onEvent({ type: "error", error: `Agent exceeded ${MAX_AGENT_ITERATIONS} iterations` });
  return { newMessages: convo.slice(baseLength), stopReason: "max_iterations", usage };
}
