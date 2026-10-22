// DeepSeek's chat API (OpenAI-compatible), asked for JSON or, for Ask Structor, for text with tool
// calls (deepseekChat). Server only: the key comes from
// DEEPSEEK_API_KEY and never reaches the browser. The API "may occasionally return empty content",
// so an empty or unparsable answer is asked once more while time allows.

import type { ChatMessage } from "./ai-jobs";

export class DeepSeekError extends Error {
  constructor(message: string) { super(message); this.name = "DeepSeekError"; }
}

const ENDPOINT = "https://api.deepseek.com/chat/completions";
/** Flash for specification chunks; proposals pass Pro for better long-form coverage. The server override applies to both. */
export const textModel = (fallback = "deepseek-flash") => process.env.AI_TEXT_MODEL?.trim() || fallback;

export async function deepseekJson(key: string, messages: ChatMessage[], options: { model: string; maxTokens: number; budgetMs: number; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<unknown> {
  const deadline = Date.now() + options.budgetMs;
  const call = options.fetchImpl ?? fetch;
  let last = "DeepSeek gave no answer.";
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
        body: JSON.stringify({ model: options.model, messages, thinking: { type: "disabled" }, response_format: { type: "json_object" }, max_tokens: options.maxTokens, stream: false }),
        signal,
      });
    } catch (error) {
      throw new DeepSeekError(options.signal?.aborted ? "Reading canceled." : signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "The AI service timed out. Try again later or read fewer pages." : "DeepSeek could not be reached.");
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      last = `DeepSeek answered ${response.status}${detail ? `: ${detail}` : ""}`;
      if (response.status === 429 || response.status >= 500) continue;
      throw new DeepSeekError(last);
    }
    const data = await response.json().catch(error => {
      if (options.signal?.aborted) throw new DeepSeekError("Reading canceled.");
      if (signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new DeepSeekError("The AI service timed out. Try again later or read fewer pages.");
      return null;
    }) as { choices?: { message?: { content?: string }; finish_reason?: string }[] } | null;
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === "length") throw new DeepSeekError("DeepSeek's answer was cut off. Try fewer pages at a time.");
    const content = choice?.message?.content?.trim();
    if (!content) { last = "DeepSeek returned an empty answer."; continue; }
    try { return JSON.parse(content); } catch { last = "DeepSeek's answer wasn't valid JSON."; }
  }
  throw new DeepSeekError(last);
}

// ── Chat with tools (Ask Structor) ──
// Plain text answers rather than JSON: the AI either answers or asks for tools to be run. The tool
// results go back as "tool" messages answering the assistant message that asked for them.

export type ToolCallMessage = { id: string; type: "function"; function: { name: string; arguments: string } };
export type AgentMessage = ChatMessage
  | { role: "assistant"; content: string; tool_calls?: ToolCallMessage[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ChatReply = { content: string; toolCalls: { id: string; name: string; arguments: string }[] };

export async function deepseekChat(key: string, messages: AgentMessage[], options: { model: string; maxTokens: number; budgetMs: number; tools: unknown[]; toolChoice: "auto" | "none"; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<ChatReply> {
  const deadline = Date.now() + options.budgetMs;
  const call = options.fetchImpl ?? fetch;
  let last = "DeepSeek gave no answer.";
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
        body: JSON.stringify({ model: options.model, messages, thinking: { type: "disabled" }, tools: options.tools, tool_choice: options.toolChoice, max_tokens: options.maxTokens, stream: false }),
        signal,
      });
    } catch (error) {
      throw new DeepSeekError(options.signal?.aborted ? "Question canceled." : signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "The AI service timed out. Try again later." : "DeepSeek could not be reached.");
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      last = `DeepSeek answered ${response.status}${detail ? `: ${detail}` : ""}`;
      if (response.status === 429 || response.status >= 500) continue;
      throw new DeepSeekError(last);
    }
    const data = await response.json().catch(() => null) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCallMessage[] | null }; finish_reason?: string }[] } | null;
    const choice = data?.choices?.[0];
    const toolCalls = (choice?.message?.tool_calls ?? []).filter(c => c?.function?.name).map(c => ({ id: String(c.id ?? ""), name: c.function.name, arguments: String(c.function.arguments ?? "") }));
    const content = choice?.message?.content?.trim() ?? "";
    if (toolCalls.length) return { content, toolCalls };
    if (choice?.finish_reason === "length" && content) return { content: `${content}…`, toolCalls: [] };
    if (content) return { content, toolCalls: [] };
    last = "DeepSeek returned an empty answer.";
  }
  throw new DeepSeekError(last);
}
