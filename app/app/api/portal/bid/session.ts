import { PORTAL_INVITES_KEY, type PortalInvite } from "../../../../lib/bid-portal";
import { verifyPortalToken, type PortalClaim } from "../../../../lib/portal-links";
import { NO_INVITES, readRow, startingProcurement } from "../../../../lib/portal-store";
import type { Procurement } from "../../../../lib/procurement";
import { sharedStore, type SharedStore } from "../../../../lib/shared-store";

export type BidSession = { store: SharedStore; claim: PortalClaim; invite: PortalInvite; procurement: Procurement; invitationId: string };

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Who a portal request is from. The signed link says which invitation it's for, and it's checked on every call against
 * the link still being on (the estimator can turn it off) and the invitation still being that company's.
 */
export async function bidSession(request: Request): Promise<{ session: BidSession; error?: undefined } | { session?: undefined; error: Response }> {
  const store = sharedStore();
  if (!store) return { error: json({ error: "The bid portal isn't available yet. Contact the estimator." }, 503) };
  const claim = verifyPortalToken(new URL(request.url).searchParams.get("t"));
  if (!claim) return { error: json({ error: "This link isn't valid or has expired. Ask the estimator for a new one." }, 401) };
  const invite = (await readRow(store, claim.projectId, PORTAL_INVITES_KEY, NO_INVITES)).value.find(i => i.id === claim.requestId);
  if (!invite || invite.revoked) return { error: json({ error: "This link has been turned off. Ask the estimator for a new one." }, 401) };
  const { value: procurement } = await readRow(store, claim.projectId, "procurement", startingProcurement(claim.projectId));
  const invitation = procurement.invitations.find(i => i.id === claim.requestId && i.bidderId === claim.bidderId);
  if (!invitation) return { error: json({ error: "This invitation is no longer open. Contact the estimator." }, 404) };
  return { session: { store, claim, invite, procurement, invitationId: invitation.id } };
}
