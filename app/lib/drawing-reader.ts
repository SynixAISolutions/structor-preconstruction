// Which AI reads drawing images (21 Oct, Danial: "deepseek flash isn't going to be as good as ChatGPT").
// Every AI job runs on DeepSeek, except that DRAWING_AI_PROVIDER=openai moves the jobs that send a drawing
// image (title blocks, plan outlines and tags, level markers, scales, partition schedules, revision
// comparisons, drawing scope) to OpenAI. Geometry never comes from the AI either way: walls, doors and
// rooms are read from the drawings' own lines (wall-detection, door-detection, room-detection).
// scripts/score-drawing-ai.mjs scores each reader against the Jelleff hand trace.
//
//   DRAWING_AI_PROVIDER      "deepseek" (default) or "openai"
//   OPENAI_API_KEY           needed for "openai"
//   OPENAI_DRAWING_MODEL     default gpt-6.1-sol
//   OPENAI_REASONING_EFFORT  default "low"; empty to leave it to the model

import type { ChatMessage } from "./ai-jobs";
import { deepseekJson } from "./deepseek";
import { OpenAiError, openaiJson } from "./openai";

export type DrawingReader = { provider: "deepseek" | "openai"; model: string };
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

/**
 * A job's JSON answer: from DeepSeek for text, from the drawing reader when the job sends an image.
 * `reader` overrides the server's setting (the scoring script compares readers this way).
 */
export async function readJson(messages: ChatMessage[], options: { deepseekKey: string; model: string; maxTokens: number; budgetMs: number; signal?: AbortSignal; fetchImpl?: typeof fetch; env?: Env; reader?: DrawingReader }): Promise<{ output: unknown; model: string }> {
  const env = options.env ?? process.env;
  const reader = sendsImages(messages) ? options.reader ?? drawingReader(options.model, env) : { provider: "deepseek" as const, model: options.model };
  const common = { model: reader.model, maxTokens: options.maxTokens, budgetMs: options.budgetMs, signal: options.signal, fetchImpl: options.fetchImpl };
  if (reader.provider === "deepseek") return { output: await deepseekJson(options.deepseekKey, messages, common), model: reader.model };
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new OpenAiError("Drawings are set to be read by OpenAI, but OPENAI_API_KEY is missing on the server.");
  const effort = env.OPENAI_REASONING_EFFORT === undefined ? "low" : env.OPENAI_REASONING_EFFORT.trim();
  return { output: await openaiJson(key, messages, { ...common, reasoningEffort: effort || undefined }), model: reader.model };
}
