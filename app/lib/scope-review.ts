import { acceptDraft, ExtractionRuleError, type Draft, type ExtractionRun, type ExtractionState, type RegionDraft, type ReviewRecords } from "./extraction";
import { addRegion, approveRegion, linkScope, type Point } from "./drawing-flip";
import { addScope, applyScopeToAllTrades, approveScope, combinePackages, type Procurement } from "./procurement";

export type GeneralScope = { id: string; title: string; detail: string; source: string };
/**
 * The AI's proposals still to review in a trade's bid form: an accepted line or highlight now lives in the bid form or on
 * Drawing Flip. With the runs, the ones waiting come before the rejected ones and the newest reading's first, in the
 * order it found them (Danial, 23 Nov: "even after the run finished it just stayed on same screen doesn't show new things
 * it scanned": a new reading's lines sat below the older ones).
 */
export function inlineDrafts(drafts: Draft[], packageId: string, runs?: Pick<ExtractionRun, "id" | "finishedAt">[]): Draft[] {
  const shown = drafts.filter(d => d.packageId === packageId && !d.removed && !(d.kind !== "quantity" && d.status === "accepted"));
  if (!runs) return shown;
  const finished = new Map(runs.map(r => [r.id, r.finishedAt]));
  const at = (d: Draft) => finished.get(d.runId) ?? "";
  return shown.map((d, i) => ({ d, i })).sort((a, b) => Number(a.d.status === "rejected") - Number(b.d.status === "rejected") || at(b.d).localeCompare(at(a.d)) || a.i - b.i).map(x => x.d);
}

/** The run that read last, among those with proposals in this trade: its lines are marked new. */
export function newestRun(drafts: Draft[], runs: Pick<ExtractionRun, "id" | "finishedAt" | "engine">[]): string | null {
  const live = runs.filter(r => r.engine.mode !== "sample" && drafts.some(d => d.runId === r.id && d.status === "pending-review"));
  return live.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0]?.id ?? null;
}

/**
 * The highlights proposed with a bid-form line the AI read from a drawing: the region findings of the line's own
 * finding, or, when the reading didn't link them, those of the same run and trade with the line's words.
 */
export function regionsForScope(extraction: ExtractionState, scopeId: string): RegionDraft[] {
  const source = extraction.drafts.find(d => d.kind === "scope" && d.acceptedId === scopeId);
  if (!source || source.kind !== "scope") return [];
  const words = source.title.trim().toLowerCase();
  return extraction.drafts.filter((d): d is RegionDraft => d.kind === "region" && d.status === "pending-review" && !d.removed && d.packageId === source.packageId
    && (d.scopeDraftIds.includes(source.id) || d.runId === source.runId && d.label.trim().toLowerCase() === words));
}

/**
 * Approves a bid-form line and places its highlights on Drawing Flip, linked to it (Danial, 28 Oct: an approved line's
 * "Drawing region" proposals stayed behind in the list), approving the ones already there. A highlight whose sheet isn't
 * on Drawing Flip stays for review.
 */
export function approveWithRegions(records: ReviewRecords, scopeId: string, by: string, at = new Date().toISOString()): ReviewRecords {
  let next: ReviewRecords = { ...records, procurement: records.procurement.scopes.find(s => s.id === scopeId)?.status === "approved" ? records.procurement : approveScope(records.procurement, scopeId, by, at) };
  for (const region of regionsForScope(next.extraction, scopeId)) {
    try {
      next = acceptDraft(next, region.id, by, at);
      const placed = next.extraction.drafts.find(d => d.id === region.id);
      const regionId = placed?.kind === "region" ? placed.acceptedId : null;
      if (regionId && !next.flip.regions.find(r => r.id === regionId)?.scopeIds.includes(scopeId)) next = { ...next, flip: linkScope(next.flip, next.procurement, regionId, scopeId, by, at) };
    } catch (error) { if (!(error instanceof ExtractionRuleError)) throw error; }
  }
  // Highlights already on Drawing Flip for this line (lib/extraction placeHighlights) are approved with it.
  for (const region of next.flip.regions) if (region.status === "pending-review" && region.scopeIds.includes(scopeId)) next = { ...next, flip: approveRegion(next.flip, region.id, by, at) };
  return next;
}

/**
 * Combines one trade into another everywhere it is recorded: the bid forms (lib/procurement combinePackages), the AI's
 * findings still waiting for review and the runs that read it, and its Drawing Flip highlights, so nothing the AI
 * found for the removed trade is lost (the AI's packages are a starting point; Marcel buys some trades together).
 */
export function combineTrades(records: ReviewRecords, fromId: string, toId: string, by: string, at = new Date().toISOString()): ReviewRecords {
  const procurement = combinePackages(records.procurement, fromId, toId, by, at);
  const swap = (id: string) => id === fromId ? toId : id;
  return {
    procurement,
    extraction: {
      runs: records.extraction.runs.map(r => r.packageIds.includes(fromId) ? { ...r, packageIds: [...new Set(r.packageIds.map(swap))] } : r),
      drafts: records.extraction.drafts.map(d => d.packageId === fromId ? { ...d, packageId: toId } : d),
    },
    flip: { ...records.flip, regions: records.flip.regions.map(r => r.packageId === fromId ? { ...r, packageId: toId } : r) },
  };
}

/**
 * A bid-form line an estimator marks on a sheet (Danial, 24 Nov: right-click the drawing, highlight an area with a
 * rectangle, choose the trade, and it goes into that trade's scopes). The line goes in the trade's bid form approved by
 * whoever wrote it, with the sheet as its source, and its highlight goes on Drawing Flip in that trade, linked to it.
 */
export function addScopeOnSheet(records: Pick<ReviewRecords, "procurement" | "flip">, input: { pageId: string; polygon: Point[]; packageId: string; title: string; detail?: string }, by: string, at = new Date().toISOString()): Pick<ReviewRecords, "procurement" | "flip"> & { scopeId: string; regionId: string } {
  if (!by.trim()) throw new ExtractionRuleError("Say who added the line.");
  const page = records.flip.pages.find(p => p.id === input.pageId);
  if (!page) throw new ExtractionRuleError("Choose the drawing sheet.");
  const title = input.title.trim();
  if (!title) throw new ExtractionRuleError("Write the scope line.");
  let procurement = addScope(records.procurement, { packageId: input.packageId, title, detail: input.detail, source: `${page.sheet} · marked on the drawing`, origin: "estimator" }, by, at);
  const scopeId = procurement.scopes.at(-1)!.id;
  procurement = approveScope(procurement, scopeId, by, at);
  const flip = addRegion(records.flip, procurement, { pageId: page.id, label: title, polygon: input.polygon, packageId: input.packageId, scopeIds: [scopeId], origin: "estimator" }, by, at);
  return { procurement, flip, scopeId, regionId: flip.regions.at(-1)!.id };
}

export function removeReviewedScope(records: ReviewRecords, scopeId: string, by: string, at = new Date().toISOString()): ReviewRecords {
  if (!by.trim()) throw new ExtractionRuleError("Say who removed the item.");
  if (!records.procurement.scopes.some(s => s.id === scopeId)) throw new ExtractionRuleError("This scope item no longer exists.");
  return { ...records, procurement: { ...records.procurement, scopes: records.procurement.scopes.filter(s => s.id !== scopeId) },
    flip: { ...records.flip, regions: records.flip.regions.map(r => r.scopeIds.includes(scopeId) ? { ...r, scopeIds: r.scopeIds.filter(id => id !== scopeId), history: [...r.history, { kind: "unlinked" as const, at, by, scopeId }] } : r) } };
}

export function parseGeneralScopes(value: unknown): GeneralScope[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("The standard scope list could not be read.");
  return value.map(item => {
    if (!item || typeof item !== "object" || ["id", "title", "detail", "source"].some(k => typeof item[k] !== "string") || !item.id || !item.title.trim() || !item.source.trim() || item.title.length > 500 || item.detail.length > 2000 || item.source.length > 300) throw new Error("A standard scope item is incomplete.");
    return { id: item.id, title: item.title.trim(), detail: item.detail.trim(), source: item.source.trim() };
  });
}

/** One shared item appears in every bid form; repeated clicks never duplicate it. */
export function addGeneralScopes(state: Procurement, items: GeneralScope[], by: string): Procurement {
  const packageId = state.packages[0]?.id;
  if (!packageId) throw new ExtractionRuleError("Create a trade package first.");
  let next = state;
  for (const item of parseGeneralScopes(items)) {
    if (next.scopes.some(s => s.allTrades && s.title.trim().toLowerCase() === item.title.toLowerCase())) continue;
    next = addScope(next, { packageId, title: item.title, detail: item.detail, source: item.source, origin: "estimator" }, by);
    next = applyScopeToAllTrades(next, next.scopes.at(-1)!.id, by);
  }
  return next;
}
