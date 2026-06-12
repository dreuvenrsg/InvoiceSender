// Tool registry for the RSG accounting tools.
// Each tool exports { definition, run } where `definition` is an Anthropic
// tool-use definition ({ name, description, input_schema }) and
// `run(input, ctx)` executes it. ctx carries shared clients: { qbo }.
// A future "RSG AI" can pass `toolDefinitions()` straight into a Claude
// `tools` array and dispatch tool_use blocks through `runTool()`.
import landedCost from "./landedCost.js";
import cashApplication from "./cashApplication.js";

export const tools = [landedCost, cashApplication];

export function toolDefinitions() {
  return tools.map((t) => t.definition);
}

export function getTool(name) {
  return tools.find((t) => t.definition.name === name);
}

export async function runTool(name, input, ctx) {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.run(input || {}, ctx);
}
