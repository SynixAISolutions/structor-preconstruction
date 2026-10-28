// Anthropic's Claude, asked for JSON: the AI that reads the project's specifications and drawings and decides its
// bid packages. Danial chose Claude Opus 5.5 (28 Oct), then Haiku 5.5 for everything once it read Project 1 as well
// as Sonnet and Opus at a twentieth of Opus's cost ("if sonnet gets the same ... then use haikuu for all"; compared
// on the bid packages, Tile's scope and the packages on two sheets). Server only: the key comes from
// ANTHROPIC_API_KEY and never reaches the browser. Claude thinks before it answers; `effort` sets how long, and
// max_tokens counts that thinking, so the answer's budget gets room on top. A busy service is retried by the SDK;
// an empty or unparsable answer is asked once more while time allows, like deepseekJson.
//
//   ANTHROPIC_API_KEY  turns Claude on for every AI job (lib/drawing-reader readJson)
//   CLAUDE_MODEL       default claude-haiku-5-5; claude-sonnet-5-5 or claude-opus-5-5 to read with a larger model
//   CLAUDE_EFFORT      default "low": the jobs are many small readings that must answer within the route's time

import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "./ai-jobs";
import type { TokenUsage } from "./ai-cost";

export class ClaudeError extends Error {
  /** `busy` errors (overloaded, rate limited, timed out, unreachable) may be handed to the fallback reader. */
  readonly busy: boolean;
  constructor(message: string, busy = false) { super(message); this.name = "ClaudeError"; this.busy = busy; }
}

export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: ClaudeEffort[] = ["low", "medium", "high", "xhigh", "max"];
type Env = Record<string, string | undefined>;
export const claudeModel = (env: Env = process.env) => env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
export const claudeEffort = (env: Env = process.env): ClaudeEffort => EFFORTS.find(e => e === env.CLAUDE_EFFORT?.trim().toLowerCase()) ?? "low";
/** Thinking room on top of the answer's own max_tokens. */
const THINKING_ROOM = 16_000;

/** The JSON object in Claude's answer, which may come in a code fence or after a sentence. Throws when there is none. */
export function jsonFromText(text: string): unknown {
  const bare = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(bare); } catch { /* look for the object inside */ }
  const start = bare.indexOf("{"), end = bare.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("No JSON object in the answer.");
  return JSON.parse(bare.slice(start, end + 1));
}

/** Structor's chat messages as a Claude request: system messages become `system`, data-URL images base64 blocks. */
export function claudeRequest(messages: ChatMessage[]): { system: string; messages: Anthropic.MessageParam[] } {
  const system = messages.filter(m => m.role === "system").map(m => typeof m.content === "string" ? m.content : m.content.map(p => p.type === "text" ? p.text : "").join("\n")).join("\n\n");
  const turns = messages.filter(m => m.role === "user").map((m): Anthropic.MessageParam => ({
    role: "user",
    content: typeof m.content === "string" ? m.content : m.content.map((part): Anthropic.ContentBlockParam => {
      if (part.type === "text") return { type: "text", text: part.text };
      const data = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(part.image_url.url);
      return data
        ? { type: "image", source: { type: "base64", media_type: data[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: data[2] } }
        : { type: "image", source: { type: "url", url: part.image_url.url } };
    }),
  }));
  return { system, messages: turns };
}

/** Claude's JSON answer and the tokens every attempt used (what the reading cost, lib/ai-cost). */
export async function claudeJson(key: string, messages: ChatMessage[], options: { model: string; maxTokens: number; budgetMs: number; effort?: ClaudeEffort; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<{ output: unknown; usage: TokenUsage }> {
  const deadline = Date.now() + options.budgetMs;
  const client = new Anthropic({ apiKey: key, maxRetries: 2, ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}) });
  const request = claudeRequest(messages);
  let last = "Claude gave no answer.";
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    const deadlineSignal = AbortSignal.timeout(left);
    const signal = options.signal ? AbortSignal.any([options.signal, deadlineSignal]) : deadlineSignal;
    let message: Anthropic.Message;
    try {
      message = await client.messages.stream({
        model: options.model, max_tokens: options.maxTokens + THINKING_ROOM, system: request.system, messages: request.messages,
        output_config: { effort: options.effort ?? "low" },
      }, { signal, timeout: left }).finalMessage();
    } catch (error) {
      if (options.signal?.aborted) throw new ClaudeError("Reading canceled.");
      if (signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError) throw new ClaudeError("Claude timed out. Try again later or read fewer pages.", true);
      if (error instanceof Anthropic.AuthenticationError) throw new ClaudeError("Claude refused the API key: check ANTHROPIC_API_KEY on the server.");
      if (error instanceof Anthropic.RateLimitError) throw new ClaudeError("Claude is rate limited right now. Try again in a minute.", true);
      if (error instanceof Anthropic.APIConnectionError) throw new ClaudeError("Claude could not be reached.", true);
      if (error instanceof Anthropic.APIError) throw new ClaudeError(`Claude answered ${error.status ?? "an error"}: ${error.message.slice(0, 200)}`, (error.status ?? 0) >= 500);
      throw error;
    }
    usage.input += message.usage.input_tokens; usage.output += message.usage.output_tokens;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0; usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    if (message.stop_reason === "refusal") throw new ClaudeError("Claude declined to read this.");
    if (message.stop_reason === "max_tokens") throw new ClaudeError("Claude's answer was cut off. Try fewer pages at a time.");
    const text = message.content.flatMap(b => b.type === "text" ? [b.text] : []).join("").trim();
    if (!text) { last = "Claude returned an empty answer."; continue; }
    try { return { output: jsonFromText(text), usage }; } catch { last = "Claude's answer wasn't valid JSON."; }
  }
  throw new ClaudeError(last);
}
