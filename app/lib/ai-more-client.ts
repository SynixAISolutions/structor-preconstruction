"use client";

// Browser calls for the extra AI jobs (lib/ai-jobs-more.ts) and the steps built on them.

import type { DraftInput } from "./extraction";
import type { ConsolidatedLine, TitleBlock } from "./ai-jobs-more";

export async function aiJob<T>(job: string, input: unknown, signal?: AbortSignal): Promise<T & { model: string }> {
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, input }), signal });
  const body = await response.json().catch(() => ({ error: `The AI request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `The AI request failed (${response.status}).`);
  return body;
}

type ScopeDraft = Extract<DraftInput, { kind: "scope" }>;

/**
 * Merges a trade's paragraph-level scope findings into bid-form lines. Each line keeps the citations
 * of the findings it covers (up to four) and lists their sections as its source.
 */
export async function consolidateScope(trade: string, drafts: DraftInput[], signal?: AbortSignal, sectionTitles: Record<string, string> = {}): Promise<{ drafts: DraftInput[]; merged: number; dropped: number }> {
  const scopes = drafts.filter((d): d is ScopeDraft => d.kind === "scope");
  const others = drafts.filter(d => d.kind !== "scope");
  if (scopes.length <= 12) return { drafts, merged: 0, dropped: 0 };
  // Section by section, so every section keeps its own lines (one call for a whole trade ran out of
  // lines before reaching its last sections). About one line per four findings, 3 to 12 per section.
  const groups = [...Map.groupBy(scopes, d => d.source.split(" · ")[0]).entries()];
  const results: DraftInput[][] = new Array(groups.length);
  let next = 0, used = 0;
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, async () => {
    while (next < groups.length) {
      const i = next++;
      const [section, items] = groups[i];
      if (items.length <= 3) { results[i] = items; used += items.length; continue; }
      try {
        const { lines } = await aiJob<{ lines: ConsolidatedLine[] }>("scope-consolidate", { trade, section: `${section} ${sectionTitles[section] ?? ""}`.trim(), maxLines: Math.min(12, Math.max(3, Math.ceil(items.length / 4))), findings: items.map(d => ({ title: d.title, source: d.source })) }, signal);
        results[i] = lines.length ? lines.map((line, n) => {
          const members = line.members.map(m => items[m]);
          used += members.length;
          return { kind: "scope", key: `${members[0].key}~${n + 1}`, packageId: members[0].packageId, title: line.title, detail: line.detail, source: section, citations: members.flatMap(m => m.citations).slice(0, 4) };
        }) : items;
        if (!lines.length) used += items.length;
      } catch (error) {
        if (signal?.aborted) throw error;
        results[i] = items; used += items.length;
      }
    }
  }));
  return { drafts: [...results.flat(), ...others], merged: scopes.length, dropped: scopes.length - used };
}

/** Rewrites bid-form scope lines as Exhibit A Section 3 clauses, 25 lines per request, three at a time. */
export async function contractLanguage(trade: string, lines: string[], signal?: AbortSignal): Promise<string[]> {
  const chunks = Array.from({ length: Math.ceil(lines.length / 25) }, (_, i) => lines.slice(i * 25, i * 25 + 25));
  const out: string[][] = new Array(chunks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
    while (next < chunks.length) { const i = next++; out[i] = (await aiJob<{ clauses: string[] }>("contract-scope", { trade, lines: chunks[i] }, signal)).clauses; }
  }));
  return out.flat();
}

/** Reads one sheet's title block (a JPEG crop of its right-hand strip). */
export const readTitleBlock = (image: string, signal?: AbortSignal) => aiJob<TitleBlock>("title-block", { image }, signal);
