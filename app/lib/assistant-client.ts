// Ask Structor in the browser: send the question, run the tools the AI asks for on the open
// project's data, send the results back, and repeat until it answers (assistant-agent.ts).
// Proposed changes are only prepared here; they come back with the answer for the user to apply.
// Saved tasks run here too, without the AI (runSavedTask).

import { aiJob } from "./ai-more-client";
import { prepareProposal, type Proposal } from "./assistant-actions";
import { runAssistantTool, currentProject, levelingPackages } from "./assistant-data";
import { assistantTool, isProposalTool, MAX_STEPS, toolResultText, type AssistantToolCall, type ProposalToolName, type SavedTask } from "./assistant-tools";
import type { AssistantReply, AssistantStep } from "./assistant-agent";
import type { BidPackageReport } from "./bid-package-report";
import { getActiveProjectId } from "./project-scope";
import type { Screen } from "./screens";

export type AssistantAnswer = { answer: string; screens: Screen[]; tools: string[]; proposals: Proposal[]; reports: BidPackageReport[] };
type Ask = { question: string; screen: Screen; history: { role: "user" | "assistant"; text: string }[] };
type Options = { onProgress?: (label: string) => void; signal?: AbortSignal; send?: (input: unknown) => Promise<AssistantReply>; run?: typeof runAssistantTool; prepare?: typeof prepareProposal };

const today = () => new Date().toISOString().slice(0, 10);

export async function askStructor({ question, screen, history }: Ask, options: Options = {}): Promise<AssistantAnswer> {
  const projectId = getActiveProjectId();
  const send = options.send ?? (input => aiJob<AssistantReply>("assistant-agent", input, options.signal));
  const run = options.run ?? runAssistantTool;
  const prepare = options.prepare ?? prepareProposal;
  const steps: AssistantStep[] = [];
  const screens = new Set<Screen>();
  const tools: string[] = [];
  const proposals: Proposal[] = [];
  const reports: BidPackageReport[] = [];
  for (let round = 0; round <= MAX_STEPS; round++) {
    options.onProgress?.(round ? "Thinking it over" : "Reading your question");
    const reply = await send({ question, screen, history, projectName: currentProject(projectId)?.name ?? "", today: today(), steps });
    if (reply.kind === "answer") return { answer: reply.answer, screens: [...screens].filter(s => s !== screen).slice(0, 3), tools, proposals, reports };
    const results = [];
    for (const call of reply.calls as AssistantToolCall[]) {
      options.signal?.throwIfAborted();
      options.onProgress?.(assistantTool(call.name).label(call.arguments));
      tools.push(call.name);
      if (isProposalTool(call.name)) {
        const prepared = prepare(call as AssistantToolCall & { name: ProposalToolName }, projectId);
        if ("proposal" in prepared) proposals.push(prepared.proposal);
        results.push({ id: call.id, content: toolResultText("proposal" in prepared
          ? { proposed: prepared.proposal.title, details: prepared.proposal.lines, status: "Shown to the user with Apply and Dismiss. Nothing has changed: it happens only if they click Apply." }
          : { error: prepared.error, note: "Nothing was proposed. Tell the user why, or ask them for what is missing; don't invent values." }) });
        continue;
      }
      const result = await run(call, { projectId, today: today() });
      result.screens.forEach(s => screens.add(s));
      // A report replaces an earlier one for the same trade in this answer.
      for (const r of result.reports ?? []) { const i = reports.findIndex(x => x.packageId === r.packageId && x.trade === r.trade); if (i >= 0) reports[i] = r; else reports.push(r); }
      results.push({ id: call.id, content: result.content });
    }
    steps.push({ calls: reply.calls, results });
  }
  throw new Error("Ask Structor took too many steps. Try a narrower question.");
}

/** What a saved task can be run on: for a trade task, the trades with bids. */
export async function savedTaskChoices(task: SavedTask): Promise<string[]> {
  return task.choose === "trade" ? [...new Set((await levelingPackages(getActiveProjectId())).map(p => p.trade))] : [];
}

/** A saved task run straight away, without the AI: its report, or why it couldn't run. */
export async function runSavedTask(task: SavedTask, choice: string, run: typeof runAssistantTool = runAssistantTool): Promise<AssistantAnswer> {
  const result = await run({ id: `task-${task.id}`, name: task.tool, arguments: { trade: choice } }, { projectId: getActiveProjectId(), today: today() });
  const reports = result.reports ?? [];
  let error = "";
  try { error = (JSON.parse(result.content) as { error?: string }).error ?? ""; } catch { /* a report's brief, not an error */ }
  return { answer: reports[0]?.summary ?? (error || "The task couldn't run."), screens: [], tools: [task.tool], proposals: [], reports };
}
