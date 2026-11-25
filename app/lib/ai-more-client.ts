"use client";

// Browser calls for the extra AI jobs (lib/ai-jobs-more.ts) and the steps built on them.

import type { DraftInput } from "./extraction";
import type { ConsolidatedLine, TitleBlock } from "./ai-jobs-more";
import { AI_REQUESTS_AT_ONCE, inAiPool, timed } from "./ai-pool";
import type { LineCheckRequest, LineFound } from "./memory-check";
import type { NotesSheet } from "./drawing-notes";
import type { RepeatGroup, RepeatLine } from "./repeated-lines";

export const aiJob = <T>(job: string, input: unknown, signal?: AbortSignal): Promise<T & { model: string }> => timed(job, async () => {
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, input }), signal });
  const body = await response.json().catch(() => ({ error: `The AI request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `The AI request failed (${response.status}).`);
  return body;
});

type ScopeDraft = Extract<DraftInput, { kind: "scope" }>;

/**
 * Merges a trade's paragraph-level scope findings into bid-form lines. Each line keeps the citations
 * of the findings it covers (up to four) and lists their sections as its source.
 */
export async function consolidateScope(trade: string, drafts: DraftInput[], signal?: AbortSignal, sectionTitles: Record<string, string> = {}, onProgress?: (done: number, total: number) => void): Promise<{ drafts: DraftInput[]; merged: number; dropped: number }> {
  const scopes = drafts.filter((d): d is ScopeDraft => d.kind === "scope");
  const others = drafts.filter(d => d.kind !== "scope");
  if (scopes.length <= 12) return { drafts, merged: 0, dropped: 0 };
  // Section by section, so every section keeps its own lines (one call for a whole trade ran out of
  // lines before reaching its last sections). About one line per four findings, 3 to 12 per section.
  const groups = [...Map.groupBy(scopes, d => d.source.split(" · ")[0]).entries()];
  const results: DraftInput[][] = new Array(groups.length);
  let next = 0, used = 0, answered = 0;
  const asked = groups.filter(([, items]) => items.length > 3).length;
  onProgress?.(0, asked);
  // Each section's request in a slot of the tab's shared pool (lib/ai-pool): a big trade finishing alone uses them all.
  await Promise.all(Array.from({ length: Math.min(AI_REQUESTS_AT_ONCE, groups.length) }, async () => {
    while (next < groups.length) {
      const i = next++;
      const [section, items] = groups[i];
      if (items.length <= 3) { results[i] = items; used += items.length; continue; }
      try {
        const { lines } = await inAiPool(() => aiJob<{ lines: ConsolidatedLine[] }>("scope-consolidate", { trade, section: `${section} ${sectionTitles[section] ?? ""}`.trim(), maxLines: Math.min(12, Math.max(3, Math.ceil(items.length / 4))), findings: items.map(d => ({ title: d.title, source: d.source })) }, signal));
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
      onProgress?.(++answered, asked);
    }
  }));
  return { drafts: [...results.flat(), ...others], merged: scopes.length, dropped: scopes.length - used };
}

/**
 * Looks for the contractor's lines on this project's pages (lib/memory-check): each request in a slot of the tab's
 * shared pool. Resolves to every answer that came back, the screened-out quotes, and how many requests failed.
 */
export async function checkMemoryLines(trade: { name: string; code: string }, requests: LineCheckRequest[], signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<{ answers: { request: LineCheckRequest; found: LineFound[] }[]; dropped: { what: string; reason: string }[]; failed: number }> {
  const answers: { request: LineCheckRequest; found: LineFound[] }[] = [], dropped: { what: string; reason: string }[] = [];
  let next = 0, done = 0, failed = 0;
  onProgress?.(0, requests.length);
  await Promise.all(Array.from({ length: Math.min(AI_REQUESTS_AT_ONCE, requests.length) }, async () => {
    while (next < requests.length && !signal?.aborted) {
      const request = requests[next++];
      try {
        const result = await inAiPool(() => aiJob<{ found: LineFound[]; dropped: { what: string; reason: string }[] }>("memory-check", {
          trade: trade.name, code: trade.code, document: request.document,
          pages: request.pages.map(p => ({ page: p.page, text: p.text, where: p.where })), lines: request.lines, existing: request.existing,
        }, signal));
        answers.push({ request, found: result.found });
        dropped.push(...result.dropped);
      } catch (error) {
        if (signal?.aborted) throw error;
        failed++;
      }
      onProgress?.(++done, requests.length);
    }
  }));
  // In page order, so a line found on two pages cites the first.
  answers.sort((a, b) => requests.indexOf(a.request) - requests.indexOf(b.request));
  return { answers, dropped, failed };
}

/**
 * A trade's bid-form lines from its notes on every drawing sheet (lib/drawing-notes), a few dozen sheets per request,
 * one request after another in the tab's pool: each is told the lines already on the bid form and those the earlier
 * requests wrote, so the same keynote on sheets in two requests isn't written twice. `failed`: requests that didn't
 * come back.
 */
export async function readDrawingNotes(pkg: { id: string; name: string; code: string }, document: string, batches: NotesSheet[][], existing: string[], memory: string | undefined, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<{ drafts: DraftInput[]; dropped: { what: string; reason: string }[]; failed: number; model: string }> {
  const answers: { drafts: DraftInput[] }[] = new Array(batches.length), dropped: { what: string; reason: string }[] = [];
  let next = 0, done = 0, failed = 0, model = "";
  const written = [...existing];
  onProgress?.(0, batches.length);
  await Promise.all(Array.from({ length: Math.min(1, batches.length) }, async () => {
    while (next < batches.length && !signal?.aborted) {
      const i = next++;
      try {
        const result = await inAiPool(() => aiJob<{ drafts: DraftInput[]; dropped: { what: string; reason: string }[] }>("drawing-notes", {
          pkg, document, sheets: batches[i], existing: written.slice(-150), ...(memory ? { memory } : {}),
        }, signal));
        answers[i] = { drafts: result.drafts.map(d => ({ ...d, key: `${d.key}@${i + 1}` })) };
        model = result.model;
        written.push(...result.drafts.flatMap(d => d.kind === "scope" ? [d.title] : []));
        dropped.push(...result.dropped);
      } catch (error) {
        if (signal?.aborted) throw error;
        failed++;
      }
      onProgress?.(++done, batches.length);
    }
  }));
  return { drafts: answers.flatMap(a => a?.drafts ?? []), dropped, failed, model };
}

/**
 * Asks the AI which of a trade's lines repeat one another (lib/repeated-lines), 200 lines per request, the alike ones
 * together. The groups it returned that hold up, the pairs left apart, and how many requests failed.
 */
export async function findRepeatedLines(pkg: { name: string; code: string }, batches: RepeatLine[][], signal?: AbortSignal): Promise<{ groups: RepeatGroup[]; dropped: { what: string; reason: string }[]; failed: number; model: string }> {
  const groups: RepeatGroup[] = [], dropped: { what: string; reason: string }[] = [];
  let failed = 0, model = "";
  for (const lines of batches) {
    try {
      const result = await inAiPool(() => aiJob<{ groups: RepeatGroup[]; dropped: { what: string; reason: string }[] }>("repeated-lines", { trade: pkg.name, code: pkg.code, lines }, signal));
      groups.push(...result.groups); dropped.push(...result.dropped); model = result.model;
    } catch (error) { if (signal?.aborted) throw error; failed++; }
  }
  return { groups, dropped, failed, model };
}

/** Reads one sheet's title block (a JPEG crop of its right-hand strip). */
export const readTitleBlock = (image: string, signal?: AbortSignal) => aiJob<TitleBlock>("title-block", { image }, signal);

/**
 * Marcel (22 Oct, Drawing Flip): highlight each scope item on the drawings. Reads each planned sheet once
 * (locatePlan) with its items and returns Drawing Flip region inputs, AI and waiting for review, for
 * importRegions. `pageIdFor` names the Drawing Flip page of a sheet (useDrawingFlip already has one for
 * every stored sheet).
 */
export async function locateScopes(args: {
  pkg: { id: string; name: string; code: string };
  plan: { row: import("./project-files").RegisterRow; items: import("./drawing-ai").LocateItem[] }[];
  pageIdFor: (sheet: string) => string | null;
  signal?: AbortSignal; onProgress?: (done: number, total: number) => void;
}): Promise<{ regions: import("./drawing-flip").RegionInput[]; dropped: import("./ai-jobs").Dropped[]; failures: { sheet: string; error: string }[] }> {
  const { renderStoredPage, readStoredText, readPageTextBoxes } = await import("./project-files-client");
  const { boxPolygon, findOnSheet } = await import("./text-anchor");
  const regions: import("./drawing-flip").RegionInput[] = [], dropped: import("./ai-jobs").Dropped[] = [], failures: { sheet: string; error: string }[] = [];
  for (const [i, { row, items }] of args.plan.entries()) {
    try {
      const pageId = args.pageIdFor(row.sheet);
      if (!pageId) throw new Error(`Sheet ${row.sheet} is not a Drawing Flip page.`);
      const [{ image }, text] = await Promise.all([renderStoredPage(row.doc, row.page, 2000, true), readStoredText(row.doc, { first: row.page, last: row.page }).then(p => p.find(x => x.page === row.page)?.text ?? "").catch(() => "")]);
      const result = await aiJob<{ regions: import("./drawing-ai").LocatedRegion[]; dropped: import("./ai-jobs").Dropped[] }>("scope-locate", { pkg: args.pkg, document: row.doc.name, sheet: row.sheet, page: row.page, text: text.slice(0, 60_000), image, items }, args.signal);
      // Each mark goes where its evidence is printed (every place, for a tag); otherwise the AI's outline, approximate.
      const boxes = await readPageTextBoxes(row.doc, row.page).catch(() => null);
      for (const r of result.regions) {
        const found = boxes && r.text ? findOnSheet(boxes, r.text, undefined, { loose: true, note: true }) : [];
        const base = { pageId, packageId: args.pkg.id, scopeIds: [r.scopeId], evidence: r.evidence, confidence: r.confidence, origin: "ai" as const };
        if (!found.length && r.polygon.length < 3) dropped.push({ what: r.label, reason: `"${r.text}" is not in the sheet's text, and no area was marked.` });
        else if (!found.length) regions.push({ ...base, label: r.label, polygon: r.polygon, anchor: "image" });
        else found.forEach((box, i) => regions.push({ ...base, label: found.length > 1 ? `${r.label} (${i + 1} of ${found.length})` : r.label, polygon: boxPolygon(box), anchor: "text" }));
      }
      dropped.push(...result.dropped);
    } catch (error) {
      failures.push({ sheet: row.sheet, error: error instanceof Error ? error.message : String(error) });
      if (args.signal?.aborted) break;
    }
    args.onProgress?.(i + 1, args.plan.length);
  }
  return { regions, dropped, failures };
}
