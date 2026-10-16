import type { BidProvenance, LevelingImport, LevelingBidder, LevelingScopeItem, LevelingProject } from "./leveling-import";

export type SavedTradeComparison = { project: LevelingProject; items: LevelingScopeItem[]; bidders: LevelingBidder[]; provenance: Record<string, BidProvenance> };

/** A review applies to one immutable submitted revision and one published form. */
export function refreshPortalComparison(next: LevelingImport, saved?: SavedTradeComparison): LevelingImport {
  if (!saved) return next;
  const sameRevision = (id: string) => {
    const before = saved.provenance[id], after = next.provenance[id];
    return before && after && !after.stale && !after.superseded && ["projectId", "packageId", "submissionId", "revisionNumber", "formVersion", "currentFormVersion", "submittedAt"].every(key => before[key as keyof BidProvenance] === after[key as keyof BidProvenance]);
  };
  const sameForm = Object.values(next.provenance).some(after => Object.values(saved.provenance).some(before => before.projectId === after.projectId && before.packageId === after.packageId && before.currentFormVersion === after.currentFormVersion));
  const items = sameForm ? [...next.items.map(item => saved.items.find(i => i.id === item.id) ?? item), ...saved.items.filter(item => !next.items.some(i => i.id === item.id))] : next.items;
  return { ...next, items, bidders: next.bidders.map(bidder => {
    const previous = sameRevision(bidder.id) && saved.bidders.find(b => b.id === bidder.id);
    // Keep estimator decisions, never a stored runtime VE adjustment or edited source price.
    if (!previous) return bidder;
    const clean = { ...previous } as typeof previous & { acceptedVeAdjustment?: number };
    delete clean.acceptedVeAdjustment;
    return { ...clean, baseBid: bidder.baseBid, sourceEligibility: bidder.sourceEligibility, responses: Object.fromEntries(items.map(item => [item.id, previous.responses[item.id] ?? bidder.responses[item.id] ?? { status: "", note: "", adjustment: 0, resolved: false, adjustmentApproved: false }])) };
  }) };
}
