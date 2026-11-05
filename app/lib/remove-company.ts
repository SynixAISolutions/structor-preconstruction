// Taking a company back off a bid package, and out of the directory. Screens name a company by looking up its id, so a
// company stays in the directory while any project still invites it, and an awarded company keeps its invitation.
// Files a sub uploaded stay in storage: only the records that point at them go. Pure; used by the remove dialogs.

import type { BidMessage } from "./bid-portal";
import type { BidProvenance } from "./leveling-import";
import type { SavedTradeComparison } from "./leveling-sync";
import type { Invitation, Procurement } from "./procurement";
import type { Submission } from "./submissions";

/** Why this invitation can't be removed; null when it can. */
export function removalBlocker(invitation: Invitation, awards: { packageId: string; bidderId: string; cancelled: unknown }[]): string | null {
  const awarded = awards.some(a => !a.cancelled && a.packageId === invitation.packageId && a.bidderId === invitation.bidderId);
  return awarded ? "This company has been awarded this trade. Cancel the award first." : null;
}

/** The invitation, plus the notes and notices about this company on this trade. Other trades aren't touched. */
export function removeInvitation(state: Procurement, invitationId: string): Procurement {
  const invitation = state.invitations.find(i => i.id === invitationId);
  if (!invitation) return state;
  const { packageId, bidderId } = invitation;
  return {
    ...state,
    invitations: state.invitations.filter(i => i.id !== invitationId),
    outreach: state.outreach.filter(o => !(o.packageId === packageId && o.bidderId === bidderId)),
    notifications: state.notifications.filter(n => !(n.recipientType === "bidder" && n.recipient === bidderId && n.packageId === packageId)),
  };
}

export const withoutBid = (submissions: Submission[], invitationId: string): Submission[] =>
  submissions.some(s => s.invitationId === invitationId) ? submissions.filter(s => s.invitationId !== invitationId) : submissions;

export const withoutThread = (messages: BidMessage[], invitationId: string): BidMessage[] =>
  messages.some(m => m.invitationId === invitationId) ? messages.filter(m => m.invitationId !== invitationId) : messages;

/** A bid loaded into Bid leveling, out of its provenance. The same object comes back when it wasn't there. */
export function withoutProvenance(provenance: Record<string, BidProvenance>, submissionId: string): Record<string, BidProvenance> {
  const kept = Object.entries(provenance).filter(([, p]) => p.submissionId !== submissionId);
  return kept.length === Object.keys(provenance).length ? provenance : Object.fromEntries(kept);
}

/** A bid out of a trade's saved comparison, its row included. The same object comes back when it wasn't there. */
export function withoutComparisonBid(comparisons: Record<string, SavedTradeComparison>, packageId: string, submissionId: string): Record<string, SavedTradeComparison> {
  const saved = comparisons[packageId];
  if (!saved) return comparisons;
  const provenance = withoutProvenance(saved.provenance, submissionId);
  if (provenance === saved.provenance) return comparisons;
  const gone = new Set(Object.keys(saved.provenance).filter(id => !(id in provenance)));
  return { ...comparisons, [packageId]: { ...saved, provenance, bidders: saved.bidders.filter(b => !gone.has(b.id)) } };
}

/** The projects that still invite this company, each named once. */
export function projectsInviting(companyId: string, projects: { name: string; procurement: Pick<Procurement, "invitations"> }[]): string[] {
  return [...new Set(projects.filter(p => p.procurement.invitations.some(i => i.bidderId === companyId)).map(p => p.name))];
}
