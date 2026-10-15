import { ExtractionRuleError, type Draft, type ReviewRecords } from "./extraction";
import { addScope, applyScopeToAllTrades, type Procurement } from "./procurement";

export type GeneralScope = { id: string; title: string; detail: string; source: string };
export const inlineDrafts = (drafts: Draft[], packageId: string) => drafts.filter(d => d.packageId === packageId && !d.removed && !(d.kind === "scope" && d.status === "accepted"));

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
