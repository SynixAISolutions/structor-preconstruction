import { bidForm, type Procurement } from "./procurement";
import { addEstimateItem, type EstimateItemInput } from "./estimate";
import type { TakeoffRow } from "./data/preconstruction";

export type ScopeEstimateDraft = { id: string; scopeId: string; packageId: string; title: string; source: string; detail: string; by: string; at: string };

export function queueScopeEstimate(drafts: ScopeEstimateDraft[], procurement: Procurement, packageId: string, scopeId: string, by: string): ScopeEstimateDraft[] {
  const item = bidForm(procurement, packageId).find(s => s.id === scopeId);
  if (!item || item.status !== "approved") throw new Error("Approve this scope item before adding it to the estimate queue.");
  if (drafts.some(d => d.packageId === packageId && d.scopeId === scopeId)) throw new Error("This scope item is already in the estimate queue.");
  return [...drafts, { id: crypto.randomUUID(), scopeId, packageId, title: item.title, source: item.source, detail: item.detail, by, at: new Date().toISOString() }];
}

export function scopeDraftBlocker(draft: ScopeEstimateDraft, procurement: Procurement): string | null {
  const scope = bidForm(procurement, draft.packageId).find(s => s.id === draft.scopeId);
  if (!scope || scope.status !== "approved") return "The source scope was moved, removed or reopened. Review it in Scopes & bid forms.";
  if (scope.title !== draft.title || scope.source !== draft.source || scope.detail !== draft.detail) return "The source scope changed. Remove this draft and add the reviewed version again.";
  return null;
}

export function priceScopeDraft(rows: TakeoffRow[], procurement: Procurement, draft: ScopeEstimateDraft, input: EstimateItemInput): TakeoffRow[] {
  const blocker = scopeDraftBlocker(draft, procurement);
  if (blocker) throw new Error(blocker);
  if (input.packageId !== draft.packageId) throw new Error("Price the scope in its assigned trade.");
  if (rows.some(r => r.origin?.kind === "scope" && r.origin.draftId === draft.id)) throw new Error("This draft is already priced in the estimate.");
  const next = addEstimateItem(rows, procurement, { ...input, item: draft.title, source: draft.source });
  return next.map((r, i) => i === next.length - 1 ? { ...r, origin: { kind: "scope" as const, draftId: draft.id, scopeId: draft.scopeId } } : r);
}
