// rsg_ai_log_search — search the agent API's own CloudWatch logs (group
// /rsg-ai/prod, where the EC2 containers stream stdout). Every chat turn
// logs JSONL records (chat_request, tool_call, tool_result, chat_response,
// request_error) tagged with the website's chatId, so this tool lets the
// agent — and the CLI — pull one conversation's full activity for debugging.
// Super-admin only: logs contain every user's questions and tool inputs.
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { REGION } from "../../qbo/config.js";

export const LOG_GROUP = process.env.RSG_AI_LOG_GROUP || "/rsg-ai/prod";
// Agent container's stream only — the Caddy container shares the group but
// its access-log noise is useless for chat debugging.
const AGENT_STREAM_PREFIX = "rsg-ai-rsg-ai";
const MAX_WINDOW_HOURS = 14 * 24;
const MAX_LIMIT = 200;
const MATCH_CAP = 2000; // stop scanning once this many records matched
const PAGE_CAP = 50;

let clientPromise = null;
function getClient() {
  return (clientPromise ??= Promise.resolve(new CloudWatchLogsClient({ region: REGION })));
}

/**
 * Server-side CloudWatch filter: each term is a quoted substring, multiple
 * terms AND together. Values are matched as bare substrings (not JSON
 * key:value) because exact field matching happens client-side in
 * recordMatches — this just shrinks what CloudWatch returns.
 */
export function buildFilterPattern({ chatId, requestId, user, type, text } = {}) {
  const terms = [chatId, requestId, user, type, text]
    .filter(Boolean)
    .map((t) => `"${String(t).replace(/"/g, "")}"`);
  return terms.length ? terms.join(" ") : undefined;
}

/** A log line is usually a JSONL record; plain lines (startup banner etc.) become { raw }. */
export function parseLine(message) {
  try {
    const rec = JSON.parse(message);
    return rec && typeof rec === "object" && !Array.isArray(rec) ? rec : { raw: message };
  } catch {
    return { raw: message };
  }
}

/** Exact field matching on parsed records; field filters never match raw lines. */
export function recordMatches(record, { chatId, requestId, user, type } = {}) {
  if ((chatId || requestId || user || type) && record.raw !== undefined) return false;
  if (chatId && record.chatId !== chatId) return false;
  if (requestId && record.requestId !== requestId) return false;
  if (user && record.user !== user) return false;
  if (type && record.type !== type) return false;
  return true;
}

export const definition = {
  name: "rsg_ai_log_search",
  description:
    "Search your own backend's logs (CloudWatch) for debugging. Every chat turn is logged as JSON " +
    "records — chat_request (the question), tool_call/tool_result (every tool invocation with inputs " +
    "and outcome), chat_response (duration, stop reason, usage), request_error — all tagged with the " +
    "website conversation's chatId and a per-turn requestId. Use this when asked to investigate why a " +
    "conversation failed, what a previous turn did, which tools were called, or recent errors. " +
    "Filters AND together; text is a case-sensitive substring over raw lines. Returns oldest-first, " +
    "keeping the most recent matches when over the limit.",
  input_schema: {
    type: "object",
    properties: {
      chatId: { type: "string", description: "Website conversation id — pulls every turn and tool call of one chat" },
      requestId: { type: "string", description: "One turn's requestId (from the request_accepted SSE event)" },
      user: { type: "string", description: "Exact user email, e.g. someone@rsgsecurity.com" },
      type: {
        type: "string",
        enum: ["chat_request", "tool_call", "tool_result", "chat_response", "request_error"],
        description: "Record type, e.g. request_error for recent failures",
      },
      text: { type: "string", description: "Free-text substring to search for (questions, error messages, tool inputs)" },
      hours: { type: "number", description: `How far back to search (default 24, max ${MAX_WINDOW_HOURS} = 14 days)` },
      limit: { type: "number", description: `Max records to return (default 50, max ${MAX_LIMIT})` },
    },
  },
};

export async function run(input = {}) {
  const hours = Math.min(Math.max(Number(input.hours) || 24, 1), MAX_WINDOW_HOURS);
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), MAX_LIMIT);
  const startTime = Date.now() - hours * 3600_000;
  const filterPattern = buildFilterPattern(input);
  const client = await getClient();

  const matches = [];
  let scanned = 0;
  let nextToken;
  for (let page = 0; page < PAGE_CAP; page++) {
    const res = await client.send(
      new FilterLogEventsCommand({
        logGroupName: LOG_GROUP,
        logStreamNamePrefix: AGENT_STREAM_PREFIX,
        startTime,
        filterPattern,
        nextToken,
      })
    );
    for (const ev of res.events || []) {
      scanned++;
      const rec = parseLine(ev.message);
      if (!recordMatches(rec, input)) continue;
      if (input.text && !ev.message.includes(input.text)) continue;
      matches.push(rec.ts ? rec : { ts: new Date(ev.timestamp).toISOString(), ...rec });
    }
    nextToken = res.nextToken;
    if (!nextToken || matches.length >= MATCH_CAP) break;
  }

  // `items` (not `events`) so the agent loop's standard >100-row truncation applies
  const items = matches.slice(-limit);
  return {
    logGroup: LOG_GROUP,
    windowHours: hours,
    scanned,
    matched: matches.length,
    returned: items.length,
    truncatedToMostRecent: matches.length > items.length,
    items,
  };
}

export default { definition, run };
