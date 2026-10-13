"use client";

// The browser side of Structor's AI: sends text to /api/ai in pieces small enough for one request
// and assembles the answers into the RunInput / ReadingInput the review queues record. No hooks —
// the screen records the result with the hook it already uses:
//
//   const result = await extractTradeScope({ pkg, manual, sections, onProgress });
//   run(s => recordRun(s, procurement, result.input));                    // useExtraction()
//
//   const result = await readProposal({ invitationId, form, proposal });
//   run(s => recordReading(s, procurement, result.input));                 // useProposals()

import { LIMITS, type Dropped } from "./ai-jobs";
import type { DraftInput, RunInput } from "./extraction";
import type { ManualSection, PageText } from "./manual-sections";
import type { PdfText } from "./pdf-text";
import type { PublishedForm, TradePackage } from "./procurement";
import type { ReadingInput } from "./proposal-extraction";

/** Pages per request: small enough to answer within the server's time limit. */
export const PAGES_PER_CALL = 5;

async function post<T>(job: "scope" | "proposal", input: unknown): Promise<T & { model: string }> {
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, input }) });
  const body = await response.json().catch(() => ({ error: `The AI request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `The AI request failed (${response.status}).`);
  return body;
}

/** Splits pages into requests: at most PAGES_PER_CALL pages and the character limit per request. */
export function chunkPages(pages: PageText[], perCall = PAGES_PER_CALL, maxChars = LIMITS.scopeChars): PageText[][] {
  const chunks: PageText[][] = [];
  let current: PageText[] = [], chars = 0;
  for (const page of pages) {
    const text = page.text.slice(0, maxChars);
    if (current.length && (current.length >= perCall || chars + text.length > maxChars)) { chunks.push(current); current = []; chars = 0; }
    current.push({ page: page.page, text }); chars += text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export type ScopeRunResult = { input: RunInput; dropped: Dropped[]; failures: { section: string; pages: string; error: string }[] };

/**
 * Reads the chosen specification sections for a trade, a few pages per request, and returns the run
 * to record. Keys are made unique across requests. If every request failed the run is a failed run.
 */
export async function extractTradeScope(args: { pkg: Pick<TradePackage, "id" | "name" | "code">; manual: Pick<PdfText, "name" | "pageCount">; sections: ManualSection[]; onProgress?: (done: number, total: number) => void }): Promise<ScopeRunResult> {
  const startedAt = new Date().toISOString();
  const jobs = args.sections.flatMap(section => chunkPages(section.pages).map(pages => ({ section, pages })));
  const drafts: DraftInput[] = [], dropped: Dropped[] = [], failures: ScopeRunResult["failures"] = [];
  let model = "";
  for (const [i, { section, pages }] of jobs.entries()) {
    try {
      const result = await post<{ drafts: DraftInput[]; dropped: Dropped[] }>("scope", { pkg: args.pkg, document: args.manual.name, section: { section: section.section, title: section.title }, pages });
      model = result.model;
      drafts.push(...result.drafts.map(d => ({ ...d, key: `${d.key}@${pages[0].page}` })));
      dropped.push(...result.dropped);
    } catch (error) {
      failures.push({ section: section.section, pages: `${pages[0].page}–${pages.at(-1)!.page}`, error: error instanceof Error ? error.message : String(error) });
    }
    args.onProgress?.(i + 1, jobs.length);
  }
  const finishedAt = new Date().toISOString();
  const base = { packageIds: [args.pkg.id], engine: { mode: "live" as const, model: model || "unknown" }, documents: [{ name: args.manual.name, pages: args.manual.pageCount }], startedAt, finishedAt };
  if (!drafts.length) return { input: { ...base, drafts: [], error: failures[0]?.error ?? "The AI found no scope items it could cite." }, dropped, failures };
  return { input: { ...base, drafts }, dropped, failures };
}

export type ProposalReadResult = { input: ReadingInput; dropped: Dropped[] };

/** Reads a proposal PDF's text against the published bid form and returns the reading to record. */
export async function readProposal(args: { invitationId: string; form: PublishedForm; proposal: PdfText }): Promise<ProposalReadResult> {
  const pages = args.proposal.pages.filter(p => p.text.trim());
  if (!pages.length) throw new Error(`${args.proposal.name} has no text layer to read (a scanned proposal needs OCR first).`);
  if (pages.length > LIMITS.proposalPages) throw new Error(`${args.proposal.name} has ${pages.length} pages with text; the AI reads proposals of up to ${LIMITS.proposalPages}.`);
  const result = await post<{ reading: Omit<ReadingInput, "invitationId" | "formVersion" | "document" | "engine" | "readAt">; dropped: Dropped[] }>("proposal", {
    form: { items: args.form.items.map(({ id, title, detail }) => ({ id, title, detail })) }, document: args.proposal.name, pages,
  });
  return {
    input: {
      ...result.reading, invitationId: args.invitationId, formVersion: args.form.version,
      document: { name: args.proposal.name, pages: args.proposal.pageCount, size: args.proposal.size },
      engine: { mode: "live", model: result.model }, readAt: new Date().toISOString(),
    },
    dropped: result.dropped,
  };
}
