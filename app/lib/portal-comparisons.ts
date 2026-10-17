import { levelingCandidates } from "./budget";
import { buildLevelingImport, type LevelingImportInput } from "./leveling-import";
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
