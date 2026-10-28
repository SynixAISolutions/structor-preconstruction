// What an AI reading costs (Danial, 28 Oct: "we have to be smart with how we use this limited credits"): Claude's
// prices, an estimate shown before a large reading starts, and what a finished request cost from its token counts.
// Pure; DeepSeek's cost is too small to show and isn't tracked.

/** US dollars per million tokens (Claude API prices, Oct 2026). */
export const CLAUDE_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
export type TokenUsage = { input: number; output: number; cacheWrite?: number; cacheRead?: number };

/** A request's cost in dollars from its usage, or null for a model without a listed price. */
export function costOf(model: string, usage: TokenUsage | undefined): number | null {
  const price = CLAUDE_PRICES[model];
  if (!price || !usage) return null;
  return (usage.input * price.input + (usage.cacheWrite ?? 0) * price.input * 1.25 + (usage.cacheRead ?? 0) * price.input * 0.1 + usage.output * price.output) / 1e6;
}

// For estimates: about 3.5 characters a token in specification and drawing text, a sheet image rendered at 2000 px
// about 4,000 tokens, and each request's thinking and answer about 2,500 tokens at low effort.
export const ESTIMATE = { charsPerToken: 3.5, imageTokens: 4_000, outputPerRequest: 2_500, promptPerRequest: 800 };

/** The estimated cost of `requests` requests carrying `chars` characters of text and `images` sheet images. */
export function estimateCost(model: string, work: { requests: number; chars: number; images?: number }): number | null {
  const price = CLAUDE_PRICES[model];
  if (!price || work.requests <= 0) return price ? 0 : null;
  const input = work.chars / ESTIMATE.charsPerToken + (work.images ?? 0) * ESTIMATE.imageTokens + work.requests * ESTIMATE.promptPerRequest;
  return (input * price.input + work.requests * ESTIMATE.outputPerRequest * price.output) / 1e6;
}

/** "$0.42", "under $0.01", "$12": dollars as people read a cost. */
export function dollars(amount: number): string {
  if (amount < 0.01) return "under $0.01";
  return amount < 10 ? `$${amount.toFixed(2)}` : `$${Math.round(amount)}`;
}
