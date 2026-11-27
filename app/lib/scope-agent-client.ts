"use client";

// The browser's half of a reading with tools (lib/scope-agent): each turn goes to /api/ai as the "scope-agent"
// job, and the tools read the project's stored page text (lib/project-files-client readStoredText, cached by
// chunk) and its text search (api/project-files/search), as every other reading does.

import { inAiPool } from "./ai-pool";
import { readStoredText } from "./project-files-client";
import { runToolReading, type AgentIo, type AgentReply, type ToolReadingArgs } from "./scope-agent";

async function turn(input: unknown, signal: AbortSignal, model?: string): Promise<AgentReply> {
  // `model`: a Claude model the server lists (lib/ai-cost CLAUDE_PRICES), to read with instead of its own (api/ai).
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job: "scope-agent", input, ...(model ? { model } : {}) }), signal });
  const body = await response.json().catch(() => ({ error: `The AI request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `The AI request failed (${response.status}).`);
  return body;
}

/** The reads a reading with tools uses in the browser, for the open project. */
export const browserIo = (projectId: string, model?: string): AgentIo => ({
  // A turn holds one of the tab's request slots (lib/ai-pool) while Claude answers, like any reading's request.
  turn: (request, signal) => inAiPool(() => turn(request, signal, model)),
  pageText: async (doc, page) => (await readStoredText(doc, { first: page, last: page })).find(p => p.page === page)?.text ?? "",
  search: async (query, category) => {
    const response = await fetch(`/api/project-files/search?project=${encodeURIComponent(projectId)}&q=${encodeURIComponent(query)}${category ? `&category=${encodeURIComponent(category)}` : ""}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `The search failed (${response.status}).`);
    return Array.isArray(body.results) ? body.results : [];
  },
});

/** Reads one trade with tools in this tab: the run to record, like lib/scope-reading readTradeScope. */
export const readTradeWithTools = (args: ToolReadingArgs & { projectId: string }) => runToolReading(args, browserIo(args.projectId, args.model));
