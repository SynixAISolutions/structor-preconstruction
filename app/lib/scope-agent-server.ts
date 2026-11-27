// The server's half of a reading with tools (lib/scope-agent): one turn per request. The browser sends the
// conversation so far; the server adds its own instructions and tools (never the browser's), asks Claude for the
// next turn, and sends the reply back with what it cost. Each request is one short Claude call, so a reading takes
// as many turns as it needs without meeting the route's five-minute limit. Claude only: DeepSeek has no tool
// reading. Server only: the key comes from ANTHROPIC_API_KEY.

import type Anthropic from "@anthropic-ai/sdk";
import { costOf } from "./ai-cost";
import { claudeModel, claudeToolTurn } from "./claude";
import { AI_BUDGET_MS, usesClaude } from "./drawing-reader";
import { agentSystemPrompt, parseAgentJob, SCOPE_AGENT_TOOLS } from "./scope-agent";

type Env = Record<string, string | undefined>;

/** The answer to one turn: Claude's reply blocks, why it stopped, and its tokens and cost. */
export async function scopeAgentJob(raw: unknown, signal: AbortSignal, env: Env = process.env, fetchImpl?: typeof fetch): Promise<Response> {
  if (!usesClaude(env)) return Response.json({ error: "Reading with tools needs Claude on the server: ANTHROPIC_API_KEY is missing." }, { status: 503 });
  const job = parseAgentJob(raw);
  const model = claudeModel(env);
  const turn = await claudeToolTurn(env.ANTHROPIC_API_KEY!.trim(), {
    system: agentSystemPrompt(), tools: SCOPE_AGENT_TOOLS as Anthropic.Tool[], messages: job.messages as Anthropic.MessageParam[],
  }, { model, maxTokens: 8_000, budgetMs: AI_BUDGET_MS, effort: job.effort, signal, fetchImpl });
  return Response.json({ model, content: turn.content, stopReason: turn.stopReason, usage: turn.usage, cost: costOf(model, turn.usage) });
}
