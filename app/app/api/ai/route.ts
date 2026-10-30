import { AiJobError, parseProposalJob, parseScopeJob, proposalMessages, scopeMessages, screenProposal, screenScope } from "../../../lib/ai-jobs";
import { DeepSeekError, textModel } from "../../../lib/deepseek";
import { parseDrawingJob, drawingMessages, screenDrawing } from "../../../lib/drawing-ai";
import { contractScopeJob } from "../../../lib/contract-scope-ai";
import { veJob } from "../../../lib/ve-ai";
import { gapCostJob } from "../../../lib/gap-cost-ai";
import { EXTRA_JOBS } from "../../../lib/ai-jobs-more";
import { assistantStep } from "../../../lib/assistant-agent";
import { AI_BUDGET_MS, readJson, usesClaude } from "../../../lib/drawing-reader";
import { ClaudeError, claudeModel } from "../../../lib/claude";
import { bidPackagesJob } from "../../../lib/bid-package-ai";
import { sheetReferencesJob } from "../../../lib/sheet-reference-ai";
import { OpenAiError } from "../../../lib/openai";
import { CLAUDE_PRICES } from "../../../lib/ai-cost";

// Structor's AI: one fixed job per request (scope from specification pages, or a proposal reading),
// never free-form prompts. Ask Structor ("assistant-agent") is the one conversation: a question, then
// rounds of project tools the browser runs (reads, and changes it only proposes for the user to
// apply). The demo password (proxy.ts) guards this route like every page. Claude (lib/claude) thinks before it
// answers, so a job may take a few minutes.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY = 3_200_000;
const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Which AI the server reads with, for screens that show a reading's cost before it starts. With Claude, the run
 * after an upload sets the bid packages but leaves each trade's scope reading to the estimator (Danial, 28 Oct:
 * "be smart with how we use this limited credits"), unless CLAUDE_AUTO_SCOPES=on.
 */
export function GET() {
  const claude = usesClaude();
  return json({ reader: claude ? "claude" : "deepseek", model: claude ? claudeModel() : textModel(), models: claude ? Object.keys(CLAUDE_PRICES) : [], autoScopes: !claude || process.env.CLAUDE_AUTO_SCOPES?.trim().toLowerCase() === "on" });
}

export async function POST(request: Request) {
  const key = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  if (!key && !usesClaude()) return json({ error: "Structor's AI isn't set up on this server: add ANTHROPIC_API_KEY (Claude) or DEEPSEEK_API_KEY." }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Too much text in one request; send fewer pages." }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "Too much text in one request; send fewer pages." }, 413);
  let body: { job?: unknown; input?: unknown; model?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Choose an AI reading job and its input." }, 400);

  const model = body.job === "drawing" ? "deepseek-flash" : textModel(body.job === "proposal" ? "deepseek-v4-pro" : "deepseek-flash");
  // A request may name the Claude model to read with (Danial, 28 Oct: compare Haiku, Sonnet and Opus on the same
  // reading and use the cheapest that holds up); without it, CLAUDE_MODEL or Haiku 5.5 (lib/claude).
  let env: Record<string, string | undefined> = process.env;
  if (body.model !== undefined) {
    if (typeof body.model !== "string" || !Object.hasOwn(CLAUDE_PRICES, body.model)) return json({ error: `Choose a Claude model: ${Object.keys(CLAUDE_PRICES).join(", ")}.` }, 400);
    if (!usesClaude()) return json({ error: "Claude isn't set up on this server: ANTHROPIC_API_KEY is missing." }, 503);
    env = { ...process.env, CLAUDE_MODEL: body.model };
  }
  try {
    if (body.job === "assistant-agent") {
      if (!key) return json({ error: "Ask Structor still runs on DeepSeek: DEEPSEEK_API_KEY is missing on this server." }, 503);
      return json(await assistantStep(body.input, key, request.signal));
    }
    if (body.job === "bid-packages") return await bidPackagesJob(body.input, key, request.signal, env);
    if (body.job === "sheet-references") return await sheetReferencesJob(body.input, key, request.signal, env);
    if (body.job === "contract-scope") return await contractScopeJob(body.input, key, request.signal);
    if (body.job === "value-engineering") return await veJob(body.input, key, request.signal);
    if (body.job === "gap-cost") return await gapCostJob(body.input, key, request.signal);
    const extra = typeof body.job === "string" && Object.hasOwn(EXTRA_JOBS, body.job) ? EXTRA_JOBS[body.job] : null;
    // Jobs that send a drawing image go to the drawing reader the server is set to (lib/drawing-reader).
    if (extra) {
      const input = extra.parse(body.input);
      const { output, model: used, cost } = await readJson(extra.messages(input), { deepseekKey: key, model: extra.model, maxTokens: extra.maxTokens, budgetMs: AI_BUDGET_MS, signal: request.signal, env });
      return json({ model: used, cost, ...extra.screen(output, input) });
    }
    if (body.job === "drawing") {
      const job = parseDrawingJob(body.input);
      const { output, model: used, cost } = await readJson(drawingMessages(job), { deepseekKey: key, model, maxTokens: 6000, budgetMs: AI_BUDGET_MS, signal: request.signal, env });
      return json({ model: used, cost, ...screenDrawing(output, job) });
    }
    if (body.job === "scope") {
      const job = parseScopeJob(body.input);
      const { output, model: used, cost } = await readJson(scopeMessages(job), { deepseekKey: key, model, maxTokens: 6000, budgetMs: AI_BUDGET_MS, signal: request.signal, env });
      return json({ model: used, cost, ...screenScope(output, job) });
    }
    if (body.job === "proposal") {
      const job = parseProposalJob(body.input);
      const { output, model: used, cost } = await readJson(proposalMessages(job), { deepseekKey: key, model, maxTokens: 8000, budgetMs: AI_BUDGET_MS, signal: request.signal, env });
      return json({ model: used, cost, ...screenProposal(output, job) });
    }
    return json({ error: "Unknown AI job." }, 400);
  } catch (error) {
    if (error instanceof AiJobError) return json({ error: error.message }, 400);
    if (error instanceof DeepSeekError || error instanceof OpenAiError || error instanceof ClaudeError) return json({ error: error.message }, 502);
    console.error("AI route failed", error);
    return json({ error: "Structor's AI failed unexpectedly." }, 500);
  }
}
