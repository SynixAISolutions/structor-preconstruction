// Ask Structor in the browser: send the question, run the tools the AI asks for on the open
// project's data, send the results back, and repeat until it answers (assistant-agent.ts).
// Proposed changes are only prepared here; they come back with the answer for the user to apply.

import { aiJob } from "./ai-more-client";
import { prepareProposal, type Proposal } from "./assistant-actions";
import { runAssistantTool, currentProject } from "./assistant-data";
import { assistantTool, isProposalTool, MAX_STEPS, toolResultText, type AssistantToolCall, type ProposalToolName } from "./assistant-tools";
import type { AssistantReply, AssistantStep } from "./assistant-agent";
import { getActiveProjectId } from "./project-scope";
import type { Screen } from "./screens";

export type AssistantAnswer = { answer: string; screens: Screen[]; tools: string[]; proposals: Proposal[] };
type Ask = { question: string; screen: Screen; history: { role: "user" | "assistant"; text: string }[] };
type Options = { onProgress?: (label: string) => void; signal?: AbortSignal; send?: (input: unknown) => Promise<AssistantReply>; run?: typeof runAssistantTool; prepare?: typeof prepareProposal };

export async function askStructor({ question, screen, history }: Ask, options: Options = {}): Promise<AssistantAnswer> {
  const projectId = getActiveProjectId();
  const today = new Date().toISOString().slice(0, 10);
  const send = options.send ?? (input => aiJob<AssistantReply>("assistant-agent", input, options.signal));
  const run = options.run ?? runAssistantTool;
  const prepare = options.prepare ?? prepareProposal;
  const steps: AssistantStep[] = [];
  const screens = new Set<Screen>();
  const tools: string[] = [];
  const proposals: Proposal[] = [];
  for (let round = 0; round <= MAX_STEPS; round++) {
    options.onProgress?.(round ? "Thinking it over" : "Reading your question");
    const reply = await send({ question, screen, history, projectName: currentProject(projectId)?.name ?? "", today, steps });
    if (reply.kind === "answer") return { answer: reply.answer, screens: [...screens].filter(s => s !== screen).slice(0, 3), tools, proposals };
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
      const result = await run(call, { projectId, today });
      result.screens.forEach(s => screens.add(s));
      results.push({ id: call.id, content: result.content });
    }
    steps.push({ calls: reply.calls, results });
  }
  throw new Error("Ask Structor took too many steps. Try a narrower question.");
}
