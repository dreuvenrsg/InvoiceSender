// Tool registry for the RSG AI tools, organized by domain:
//   accounting/ — QBO analyses (AP landed cost, AR cash application)
//   fulcrum/    — Fulcrum Pro ERP access (orders, shipments, production)
// Each tool exports { definition, run } where `definition` is an Anthropic
// tool-use definition ({ name, description, input_schema }) and
// `run(input, ctx)` executes it. ctx carries shared clients: { qbo, fulcrum }.
// The RSG AI agent (src/server/) and any future surface (MCP connector,
// website) consume this same registry.
import landedCost from "./accounting/landedCost.js";
import cashApplication from "./accounting/cashApplication.js";
import fulcrumApiRequest from "./fulcrum/apiRequest.js";

export const tools = [landedCost, cashApplication, fulcrumApiRequest];

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
