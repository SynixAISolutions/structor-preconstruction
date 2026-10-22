// OpenAI's Chat Completions API, asked for JSON: the other reader of drawing images (drawing-reader.ts).
// Server only: the key comes from OPENAI_API_KEY and never reaches the browser. Retries like
// deepseekJson: a busy service or an empty or unparsable answer is asked once more while time allows.

import type { ChatMessage } from "./ai-jobs";

export class OpenAiError extends Error {
  constructor(message: string) { super(message); this.name = "OpenAiError"; }
}

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
/**
 * max_completion_tokens counts the model's hidden reasoning as well as its answer, so the answer's
 * budget gets this much room on top.
 */
const REASONING_ROOM = 16_000;

export async function openaiJson(key: string, messages: ChatMessage[], options: { model: string; maxTokens: number; budgetMs: number; reasoningEffort?: string; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<unknown> {
  const deadline = Date.now() + options.budgetMs;
  const call = options.fetchImpl ?? fetch;
  let last = "OpenAI gave no answer.";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    const deadlineSignal = AbortSignal.timeout(left);
    const signal = options.signal ? AbortSignal.any([options.signal, deadlineSignal]) : deadlineSignal;
    let response: Response;
    try {
      response = await call(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: options.model, messages, response_format: { type: "json_object" }, max_completion_tokens: options.maxTokens + REASONING_ROOM, ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}) }),
        signal,
      });
    } catch (error) {
      throw new OpenAiError(options.signal?.aborted ? "Reading canceled." : signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "The AI service timed out. Try again later or read fewer pages." : "OpenAI could not be reached.");
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      last = `OpenAI answered ${response.status}${detail ? `: ${detail}` : ""}`;
      if (response.status === 429 || response.status >= 500) continue;
      throw new OpenAiError(last);
    }
    const data = await response.json().catch(() => null) as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] } | null;
    const choice = data?.choices?.[0];
    if (choice?.message?.refusal) throw new OpenAiError(`OpenAI declined: ${choice.message.refusal.slice(0, 200)}`);
    if (choice?.finish_reason === "length") throw new OpenAiError("OpenAI's answer was cut off. Try fewer pages at a time.");
    const content = choice?.message?.content?.trim();
    if (!content) { last = "OpenAI returned an empty answer."; continue; }
    try { return JSON.parse(content); } catch { last = "OpenAI's answer wasn't valid JSON."; }
  }
  throw new OpenAiError(last);
}
