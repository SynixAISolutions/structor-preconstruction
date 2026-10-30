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

import { LIMITS, parseProposalJob, proposalBatches, mergeProposalReadings, type ProposalReadingOutput, type Dropped } from "./ai-jobs";
import { AI_REQUESTS_AT_ONCE, inAiPool } from "./ai-pool";
import type { DraftInput, RunInput } from "./extraction";
import type { ManualSection, PageText } from "./manual-sections";
import type { PdfText } from "./pdf-text";
import type { PublishedForm, TradePackage } from "./procurement";
import type { ReadingInput } from "./proposal-extraction";

/** Pages per request: small enough to answer within the server's time limit. */
export const PAGES_PER_CALL = 5;
/** Sheets one trade renders and sends at once: each is a large image. */
const SHEETS_AT_ONCE = 3;

async function post<T>(job: "scope" | "proposal" | "drawing", input: unknown, signal?: AbortSignal): Promise<T & { model: string }> {
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job, input }), signal });
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

export type ScopeRunResult = { input: RunInput; dropped: Dropped[]; failures: { section: string; pages: string; error: string }[]; drawingPages?: (PageText & { sheet: string })[] };

/**
 * Reads the chosen specification sections for a trade, a few pages per request, and returns the run
 * to record. Keys are made unique across requests. If every request failed the run is a failed run.
 */
export async function extractTradeScope(args: { pkg: Pick<TradePackage, "id" | "name" | "code">; manual: Pick<PdfText, "name" | "pageCount">; sections: ManualSection[]; brief?: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<ScopeRunResult> {
  const startedAt = new Date().toISOString();
  const jobs = args.sections.flatMap(section => chunkPages(section.pages).map(pages => ({ section, pages })));
  const drafts: DraftInput[] = [], dropped: Dropped[] = [], failures: ScopeRunResult["failures"] = [];
  let model = "";
  // Several requests at once (30 Oct: "at least 90% faster"), each in a slot of the tab's shared pool (lib/ai-pool), so
  // a trade read alone uses every slot; answers are put back in page order below.
  const answers: ({ drafts: DraftInput[]; dropped: Dropped[] } | { error: string } | undefined)[] = new Array(jobs.length);
  let next = 0, finished = 0, consecutiveFailures = 0, stop = false;
  await Promise.all(Array.from({ length: Math.min(AI_REQUESTS_AT_ONCE, jobs.length) }, async () => {
    while (!stop && next < jobs.length) await inAiPool(async () => {
      if (stop || next >= jobs.length) return;
      const i = next++, { section, pages } = jobs[i];
      try {
        const result = await post<{ drafts: DraftInput[]; dropped: Dropped[] }>("scope", { pkg: args.pkg, document: args.manual.name, section: { section: section.section, title: section.title }, pages, ...(args.brief ? { brief: args.brief } : {}) }, args.signal);
        consecutiveFailures = 0;
        model = result.model;
        answers[i] = result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        answers[i] = { error: message };
        if (++consecutiveFailures >= 3 || /missing|401|402|not configured/i.test(message)) stop = true;
      }
      args.onProgress?.(++finished, jobs.length);
      if (args.signal?.aborted) stop = true;
    });
  }));
  for (const [i, { section, pages }] of jobs.entries()) {
    const answer = answers[i], where = { section: section.section, pages: `${pages[0].page}–${pages.at(-1)!.page}` };
    if (!answer) failures.push({ ...where, error: "Not attempted: reading canceled or stopped after repeated service failures. Retry the missing pages." });
    else if ("error" in answer) failures.push({ ...where, error: answer.error });
    else { drafts.push(...answer.drafts.map(d => ({ ...d, key: `${d.key}@${pages[0].page}` }))); dropped.push(...answer.dropped); }
  }
  const finishedAt = new Date().toISOString();
  const base = { packageIds: [args.pkg.id], engine: { mode: "live" as const, model: model || "unknown" }, documents: [{ name: args.manual.name, pages: args.manual.pageCount }], startedAt, finishedAt };
  if (!drafts.length) return { input: { ...base, drafts: [], error: failures[0]?.error ?? "The AI found no scope items it could cite." }, dropped, failures };
  return { input: { ...base, drafts }, dropped, failures };
}

export type ProposalReadResult = { input: ReadingInput; dropped: Dropped[] };

/** Reads selected sheets as images and text; review remains mandatory for geometry and measurements. */
export async function extractDrawingScope(args: { pkg: Pick<TradePackage, "id" | "name" | "code">; document: string; pageCount: number; pages: (PageText & { sheet: string })[]; render: (page: number) => Promise<{ image: string }>; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<ScopeRunResult> {
  const startedAt = new Date().toISOString(), drafts: DraftInput[] = [], dropped: Dropped[] = [], failures: ScopeRunResult["failures"] = [];
  const drawingPages: (PageText & { sheet: string })[] = [];
  let model = "";
  // A few sheets at once, each request in a slot of the shared pool (lib/ai-pool); answers are put back in sheet order below.
  const answers: ({ sheet: string; drafts: DraftInput[]; dropped: Dropped[]; model: string } | { error: string } | undefined)[] = new Array(args.pages.length);
  let next = 0, finished = 0, consecutiveFailures = 0, stop = false;
  await Promise.all(Array.from({ length: Math.min(SHEETS_AT_ONCE, args.pages.length) }, async () => {
    while (!stop && next < args.pages.length) {
      const i = next++, page = args.pages[i];
      try {
        const { image } = await args.render(page.page);
        args.signal?.throwIfAborted();
        answers[i] = await inAiPool(() => post<{ sheet: string; drafts: DraftInput[]; dropped: Dropped[] }>("drawing", { pkg: args.pkg, document: args.document, sheet: page.sheet, page: page.page, text: page.text, image }, args.signal));
        consecutiveFailures = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        answers[i] = { error: message };
        if (++consecutiveFailures >= 3 || /missing|401|402|not configured/i.test(message)) stop = true;
      }
      args.onProgress?.(++finished, args.pages.length);
      if (args.signal?.aborted) stop = true;
    }
  }));
  for (const [i, page] of args.pages.entries()) {
    const answer = answers[i], where = { section: page.sheet, pages: String(page.page) };
    if (!answer) failures.push({ ...where, error: "Not attempted: reading canceled or stopped after repeated service failures. Retry this sheet." });
    else if ("error" in answer) failures.push({ ...where, error: answer.error });
    else { drawingPages.push({ ...page, sheet: answer.sheet }); drafts.push(...answer.drafts); dropped.push(...answer.dropped); model = answer.model; }
  }
  const input: RunInput = { packageIds: [args.pkg.id], engine: { mode: "live", model: model || "unknown" }, documents: [{ name: args.document, pages: args.pageCount }], startedAt, finishedAt: new Date().toISOString(), drafts };
  if (!drafts.length) input.error = failures[0]?.error ?? "No cited requirements were found on the selected drawings.";
  return { input, dropped, failures, drawingPages };
}

/** Reads a proposal PDF's text against the published bid form and returns the reading to record. */
export async function readProposal(args: { invitationId: string; form: PublishedForm; proposal: PdfText; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<ProposalReadResult> {
  const pages = args.proposal.pages.filter(p => p.text.trim());
  if (!pages.length) throw new Error(`${args.proposal.name} has no text layer to read (a scanned proposal needs OCR first).`);
  if (pages.length > LIMITS.proposalPages) throw new Error(`${args.proposal.name} has ${pages.length} pages with text; the AI reads proposals of up to ${LIMITS.proposalPages}.`);
  const jobs = proposalBatches(parseProposalJob({
    form: { items: args.form.items.map(({ id, title, detail }) => ({ id, title, detail })) }, document: args.proposal.name, pages,
  }));
  const parts: { reading: ProposalReadingOutput; dropped: Dropped[] }[] = [];
  let model = "";
  for (const [i, job] of jobs.entries()) {
    args.signal?.throwIfAborted();
    const part = await post<{ reading: ProposalReadingOutput; dropped: Dropped[] }>("proposal", job, args.signal);
    args.signal?.throwIfAborted();
    parts.push(part); model = part.model; args.onProgress?.(i + 1, jobs.length);
  }
  const result = mergeProposalReadings(parts);
  return {
    input: {
      ...result.reading, invitationId: args.invitationId, formVersion: args.form.version,
      document: { name: args.proposal.name, pages: args.proposal.pageCount, size: args.proposal.size },
      engine: { mode: "live", model }, readAt: new Date().toISOString(),
    },
    dropped: result.dropped,
  };
}
