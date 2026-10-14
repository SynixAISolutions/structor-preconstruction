// DeepSeek's chat API (OpenAI-compatible), asked for JSON. Server only: the key comes from
// DEEPSEEK_API_KEY and never reaches the browser. The API "may occasionally return empty content",
// so an empty or unparsable answer is asked once more while time allows.

import type { ChatMessage } from "./ai-jobs";

export class DeepSeekError extends Error {
  constructor(message: string) { super(message); this.name = "DeepSeekError"; }
}

const ENDPOINT = "https://api.deepseek.com/chat/completions";
/** deepseek-flash: fast, cheap, JSON output. AI_TEXT_MODEL=deepseek-v4-pro switches to the stronger, slower model. */
export const textModel = () => process.env.AI_TEXT_MODEL?.trim() || "deepseek-flash";

export async function deepseekJson(key: string, messages: ChatMessage[], options: { model: string; maxTokens: number; budgetMs: number; fetchImpl?: typeof fetch }): Promise<unknown> {
  const deadline = Date.now() + options.budgetMs;
  const call = options.fetchImpl ?? fetch;
  let last = "DeepSeek gave no answer.";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    let response: Response;
    try {
      response = await call(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: options.model, messages, thinking: { type: "disabled" }, response_format: { type: "json_object" }, max_tokens: options.maxTokens, stream: false }),
        signal: AbortSignal.timeout(left),
      });
    } catch (error) {
      throw new DeepSeekError(error instanceof Error && error.name === "TimeoutError" ? "DeepSeek took too long. Try fewer pages at a time." : "DeepSeek could not be reached.");
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      last = `DeepSeek answered ${response.status}${detail ? `: ${detail}` : ""}`;
      if (response.status === 429 || response.status >= 500) continue;
      throw new DeepSeekError(last);
    }
    const data = await response.json().catch(() => null) as { choices?: { message?: { content?: string }; finish_reason?: string }[] } | null;
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === "length") throw new DeepSeekError("DeepSeek's answer was cut off. Try fewer pages at a time.");
    const content = choice?.message?.content?.trim();
    if (!content) { last = "DeepSeek returned an empty answer."; continue; }
    try { return JSON.parse(content); } catch { last = "DeepSeek's answer wasn't valid JSON."; }
  }
  throw new DeepSeekError(last);
}
