import { acceptDraft, ExtractionRuleError, type Draft, type ExtractionState, type RegionDraft, type ReviewRecords } from "./extraction";
import { linkScope } from "./drawing-flip";
import { addScope, applyScopeToAllTrades, approveScope, type Procurement } from "./procurement";

export type GeneralScope = { id: string; title: string; detail: string; source: string };
/** The AI's proposals still to review in a trade's bid form: an accepted line or highlight now lives in the bid form or on Drawing Flip. */
export const inlineDrafts = (drafts: Draft[], packageId: string) => drafts.filter(d => d.packageId === packageId && !d.removed && !(d.kind !== "quantity" && d.status === "accepted"));

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
 * "Drawing region" proposals stayed behind in the list). A highlight whose sheet isn't on Drawing Flip stays for review.
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
  return next;
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
