import { levelingCandidates } from "./budget";
import { buildLevelingImport, type BidProvenance, type LevelingImportInput } from "./leveling-import";
import { refreshPortalComparison, type SavedTradeComparison } from "./leveling-sync";
import type { VeState } from "./value-engineering";
import { veLevelingBidders } from "./ve-bids";

/** Refresh sources before using saved reviews in the budget; VE is derived exactly once. */
export function portalComparisonCandidates(input: Omit<LevelingImportInput, "packageId" | "revisions" | "budget"> & { comparisons: Record<string, SavedTradeComparison>; ve: VeState }) {
  return Object.entries(input.comparisons).flatMap(([packageId, saved]) => {
    const fresh = refreshPortalComparison(buildLevelingImport({ ...input, packageId }), saved);
    return levelingCandidates({ packageId, items: fresh.items, bidders: veLevelingBidders(fresh.bidders, fresh.provenance, input.ve, input.submissions), provenance: fresh.provenance });
  });
}

/**
 * Every leveled bid the budget can use, as the Budget page reads them (use-leveling-comparison): the
 * saved trade comparisons, the open Bid leveling workspace in place of its trade's saved copy, and an
 * open workbook not tied to a trade (packageId null). `workspace` is the open comparison, or null.
 */
export function openComparisonCandidates(input: Omit<LevelingImportInput, "packageId" | "revisions" | "budget" | "projectName"> & {
  workspace: Omit<SavedTradeComparison, "provenance"> | null;
  packageId: string; provenance: Record<string, BidProvenance>; comparisons: Record<string, SavedTradeComparison>; ve: VeState;
}) {
  const { workspace, packageId, provenance, comparisons, ...rest } = input;
  const current = workspace && packageId && !Object.values(provenance).some(p => p.superseded) ? { [packageId]: { ...workspace, provenance } } : {};
  const candidates = portalComparisonCandidates({ ...rest, projectName: workspace?.project.name ?? "", comparisons: { ...comparisons, ...current } });
  if (workspace && !packageId) candidates.push(...levelingCandidates({ packageId: null, items: workspace.items, bidders: veLevelingBidders(workspace.bidders, provenance, input.ve, input.submissions), provenance }));
  return candidates;
}
