import { addVeIdea, decideVeIdea, VeRuleError, type VeIdeaInput, type VeState } from "./value-engineering";
import { latestRevision, type Submission } from "./submissions";
import type { Procurement } from "./procurement";
import type { DocumentAsset } from "./document-assets";
import type { BidProvenance } from "./leveling-import";
export type VeBid = { submissionId: string; bidderId: string; packageId: string; revisionNumber: number; formVersion: number };
export function veBid(submission: Submission, procurement: Procurement): VeBid {
  const r = latestRevision(submission), invite = procurement.invitations.find(i => i.id === submission.invitationId);
  if (!r || submission.status === "draft" || !invite || invite.status === "declined" || procurement.packages.find(p => p.id === submission.packageId)?.published?.version !== r.formVersion) throw new VeRuleError({ decision: "Choose a current submitted bid on the published form." });
  return { submissionId: submission.id, bidderId: submission.bidderId, packageId: submission.packageId, revisionNumber: r.number, formVersion: r.formVersion };
}
export function submitBidVe(state: VeState, input: VeIdeaInput, submission: Submission, procurement: Procurement, productData: DocumentAsset, by: string): VeState {
  if (productData.type !== "application/pdf") throw new VeRuleError({ idea: "Upload the product-data PDF." });
  const bid = veBid(submission, procurement), next = addVeIdea(state, { ...input, origin: "subcontractor", packageId: bid.packageId }, by);
  return { ...next, ideas: next.ideas.map((i, n) => n === next.ideas.length - 1 ? { ...i, bid, productData } : i) };
}
export function acceptOwnerVe(state: VeState, id: string, submission: Submission, procurement: Procurement, impact: number, owner: string, note: string): VeState {
  if (!owner.trim()) throw new VeRuleError({ decision: "Record the owner's name." });
  const bid = veBid(submission, procurement), idea = state.ideas.find(i => i.id === id);
  if (!idea || idea.packageId && idea.packageId !== bid.packageId || idea.bid && (Object.keys(bid) as (keyof VeBid)[]).some(k => idea.bid![k] !== bid[k])) throw new VeRuleError({ decision: "This option belongs to a different bid or an older revision. Reprice it against the current bid." });
  if (!Number.isFinite(impact) || Math.abs(impact) > 1e12) throw new VeRuleError({ decision: "Enter a cost impact below $1 trillion." });
  const next = decideVeIdea(state, id, "accepted", { acceptedImpact: impact, note }, owner);
  const proposed = { ...next, ideas: next.ideas.map(i => i.id === id ? { ...i, bid, decision: { ...i.decision!, ownerApproved: true } } : i) };
  if (Math.round((latestRevision(submission)!.baseBid! + acceptedBidVe(proposed, bid)) * 100) < 0) throw new VeRuleError({ decision: "Accepted savings exceed this bid. Check the amount and other accepted options." });
  return proposed;
}
/** Only owner decisions on this exact submitted revision count; reopen removes the adjustment. */
export function acceptedBidVe(state: VeState, bid: VeBid): number {
  return state.ideas.reduce((sum, i) => sum + (i.decision?.outcome === "accepted" && i.decision.ownerApproved && i.bid && (["submissionId", "bidderId", "packageId", "revisionNumber", "formVersion"] as const).every(k => i.bid![k as keyof VeBid] === bid[k as keyof VeBid]) ? Math.round((i.decision.acceptedImpact || 0) * 100) : 0), 0) / 100;
}
export function veLevelingBidders<T extends { id: string }>(bidders: T[], provenance: Record<string, BidProvenance>, state: VeState, submissions: Submission[]): (T & { acceptedVeAdjustment: number })[] {
  return bidders.map(b => { const p = provenance[b.id], sub = p && submissions.find(s => s.id === p.submissionId), latest = sub && latestRevision(sub); return { ...b, acceptedVeAdjustment: p && !p.stale && latest?.number === p.revisionNumber && latest.formVersion === p.formVersion ? acceptedBidVe(state, p) : 0 }; });
}
