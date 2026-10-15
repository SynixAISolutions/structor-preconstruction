import { AiJobError, parseProposalJob, parseScopeJob, proposalMessages, scopeMessages, screenProposal, screenScope } from "../../../lib/ai-jobs";
import { deepseekJson, DeepSeekError, textModel } from "../../../lib/deepseek";
import { parseDrawingJob, drawingMessages, screenDrawing } from "../../../lib/drawing-ai";

// Structor's AI: one fixed job per request (scope from specification pages, or a proposal reading),
// never free-form prompts. The demo password (proxy.ts) guards this route like every page.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 3_200_000;
const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return json({ error: "Structor's AI isn't set up on this server: DEEPSEEK_API_KEY is missing." }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Too much text in one request; send fewer pages." }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "Too much text in one request; send fewer pages." }, 413);
  let body: { job?: unknown; input?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Choose an AI reading job and its input." }, 400);

  const model = body.job === "drawing" ? "deepseek-flash" : textModel(body.job === "proposal" ? "deepseek-v4-pro" : "deepseek-flash");
  try {
    if (body.job === "drawing") {
      const job = parseDrawingJob(body.input);
      const output = await deepseekJson(key, drawingMessages(job), { model, maxTokens: 6000, budgetMs: 55_000, signal: request.signal });
      return json({ model, ...screenDrawing(output, job) });
    }
    if (body.job === "scope") {
      const job = parseScopeJob(body.input);
      const output = await deepseekJson(key, scopeMessages(job), { model, maxTokens: 6000, budgetMs: 55_000, signal: request.signal });
      return json({ model, ...screenScope(output, job) });
    }
    if (body.job === "proposal") {
      const job = parseProposalJob(body.input);
      const output = await deepseekJson(key, proposalMessages(job), { model, maxTokens: 8000, budgetMs: 55_000, signal: request.signal });
      return json({ model, ...screenProposal(output, job) });
    }
    return json({ error: "Unknown AI job." }, 400);
  } catch (error) {
    if (error instanceof AiJobError) return json({ error: error.message }, 400);
    if (error instanceof DeepSeekError) return json({ error: error.message }, 502);
    console.error("AI route failed", error);
    return json({ error: "Structor's AI failed unexpectedly." }, 500);
  }
}
