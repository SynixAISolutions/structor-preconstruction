// Which AI reads (21 Oct, Danial: "deepseek flash isn't going to be as good as ChatGPT"; 28 Oct: "Use Claude
// Opus 5.5"). With ANTHROPIC_API_KEY set, Claude (lib/claude) reads everything: specification text, proposals,
// drawing images and the bid packages. When Claude is busy or down (not when it refuses the key or the request)
// the job goes to DeepSeek instead, and the answer names the model that gave it. Without the key, every job runs
// on DeepSeek, except that DRAWING_AI_PROVIDER=openai moves the jobs that send a drawing image (title blocks,
// plan outlines and tags, level markers, scales, partition schedules, revision comparisons, drawing scope) to
// OpenAI. Geometry never comes from the AI either way: walls, doors and rooms are read from the drawings' own
// lines (wall-detection, door-detection, room-detection). scripts/score-drawing-ai.mjs scores each reader
// against the Jelleff hand trace.
//
//   ANTHROPIC_API_KEY        Claude for every job (CLAUDE_MODEL, CLAUDE_EFFORT: lib/claude)
//   AI_PROVIDER              "deepseek" to keep DeepSeek even with the Anthropic key set
//   DRAWING_AI_PROVIDER      "deepseek" (default) or "openai", for drawing images without Claude
//   OPENAI_API_KEY           needed for "openai"
//   OPENAI_DRAWING_MODEL     default gpt-6.1-sol
//   OPENAI_REASONING_EFFORT  default "low"; empty to leave it to the model

import type { ChatMessage } from "./ai-jobs";
import { claudeEffort, ClaudeError, claudeJson, claudeModel } from "./claude";
import { costOf } from "./ai-cost";
import { deepseekJson, DeepSeekError } from "./deepseek";
import { OpenAiError, openaiJson } from "./openai";

export type DrawingReader = { provider: "deepseek" | "openai" | "claude"; model: string };
type Env = Record<string, string | undefined>;

export const DEFAULT_OPENAI_DRAWING_MODEL = "gpt-6.1-sol";

/** The reader the server is set to use for drawing images; `jobModel` is the job's own DeepSeek model. */
export function drawingReader(jobModel: string, env: Env = process.env): DrawingReader {
  return env.DRAWING_AI_PROVIDER?.trim().toLowerCase() === "openai"
    ? { provider: "openai", model: env.OPENAI_DRAWING_MODEL?.trim() || DEFAULT_OPENAI_DRAWING_MODEL }
    : { provider: "deepseek", model: jobModel };
}

export const sendsImages = (messages: ChatMessage[]) =>
  messages.some(m => Array.isArray(m.content) && m.content.some(part => part.type === "image_url"));

/** Time one AI job may take, inside the AI route's maxDuration: Claude thinks before it answers. */
export const AI_BUDGET_MS = 270_000;

/** Whether the server reads with Claude: its key is set and AI_PROVIDER doesn't keep DeepSeek. */
export const usesClaude = (env: Env = process.env) => !!env.ANTHROPIC_API_KEY?.trim() && env.AI_PROVIDER?.trim().toLowerCase() !== "deepseek";

/**
 * A job's JSON answer: from Claude when its key is set, else from DeepSeek for text and the drawing reader when
 * the job sends an image. `model` is the job's own DeepSeek model, used without Claude and as its fallback.
 * `reader` overrides the server's setting (the scoring script compares readers this way).
 */
export async function readJson(messages: ChatMessage[], options: { deepseekKey: string; model: string; maxTokens: number; budgetMs: number; signal?: AbortSignal; fetchImpl?: typeof fetch; env?: Env; reader?: DrawingReader }): Promise<{ output: unknown; model: string; cost?: number | null }> {
  const env = options.env ?? process.env;
  if (options.reader?.provider === "claude" || !options.reader && usesClaude(env)) {
    const model = options.reader?.model ?? claudeModel(env), started = Date.now();
    try {
      const { output, usage } = await claudeJson(env.ANTHROPIC_API_KEY?.trim() ?? "", messages, { model, maxTokens: options.maxTokens, budgetMs: options.budgetMs, effort: claudeEffort(env), signal: options.signal, fetchImpl: options.fetchImpl });
      return { output, model, cost: costOf(model, usage) };
    } catch (error) {
      // Busy or down: DeepSeek answers in the time that is left, if it can.
      const left = options.budgetMs - (Date.now() - started);
      if (!(error instanceof ClaudeError && error.busy) || !options.deepseekKey || left < 20_000 || options.signal?.aborted) throw error;
      return readJson(messages, { ...options, reader: undefined, budgetMs: left, env: { ...env, ANTHROPIC_API_KEY: "" } });
    }
  }
  const reader = sendsImages(messages) ? options.reader ?? drawingReader(options.model, env) : { provider: "deepseek" as const, model: options.model };
  const common = { model: reader.model, maxTokens: options.maxTokens, budgetMs: options.budgetMs, signal: options.signal, fetchImpl: options.fetchImpl };
  if (reader.provider === "deepseek") {
    if (!options.deepseekKey) throw new DeepSeekError("Structor's AI isn't set up on this server: add ANTHROPIC_API_KEY (Claude) or DEEPSEEK_API_KEY.");
    return { output: await deepseekJson(options.deepseekKey, messages, common), model: reader.model };
  }
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiError("Drawings are set to be read by OpenAI, but OPENAI_API_KEY is missing on the server.");
  const effort = env.OPENAI_REASONING_EFFORT === undefined ? "low" : env.OPENAI_REASONING_EFFORT.trim();
  return { output: await openaiJson(key, messages, { ...common, reasoningEffort: effort || undefined }), model: reader.model };
}
