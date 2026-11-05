import { PORTAL_INVITES_KEY, PORTAL_LINK_DAYS, type PortalInvite } from "../../../../lib/bid-portal";
import { issuePortalToken } from "../../../../lib/portal-links";
import { changeRow, NO_INVITES, readRow, startingProcurement } from "../../../../lib/portal-store";
import { sharedStore } from "../../../../lib/shared-store";

// The estimator's side of a private bid link, behind the site's sign-in (proxy.ts): make one for an invitation, or turn
// it off. The link's details come from the estimator, because the portal has no other way to know the company's name.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const SAFE = /^[A-Za-z0-9_-]{1,100}$/;
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) throw new Error(); } catch { return json({ error: "Make the link from the Structor page." }, 403); } }
  const store = sharedStore();
  if (!store) return json({ error: "Private links need shared saving, which isn't connected." }, 503);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const projectId = text(body.projectId, 100), invitationId = text(body.invitationId, 100);
  if (!SAFE.test(projectId) || !SAFE.test(invitationId)) return json({ error: "Name the project and the invitation." }, 400);
  try {
    if (body.action === "revoke") {
      await changeRow<PortalInvite[]>(store, projectId, PORTAL_INVITES_KEY, NO_INVITES, current => current.some(i => i.id === invitationId && !i.revoked) ? current.map(i => i.id === invitationId ? { ...i, revoked: true } : i) : current, text(body.by, 80));
      return json({ revoked: true });
    }
    const { value: procurement } = await readRow(store, projectId, "procurement", startingProcurement(projectId));
    const invitation = procurement.invitations.find(i => i.id === invitationId);
    // The invitation is saved a few seconds after it's made here; the page asks again.
    if (!invitation) return json({ error: "The invitation is still saving. Try again in a few seconds.", saving: true }, 409);
    const company = text(body.company, 200);
    if (!company) return json({ error: "Name the company." }, 400);
    const invite: PortalInvite = { id: invitationId, projectName: text(body.projectName, 200) || "Your invitation to bid", company, contact: text(body.contact, 120), email: text(body.email, 200), issuedAt: new Date().toISOString(), issuedBy: text(body.by, 80), revoked: false };
    await changeRow<PortalInvite[]>(store, projectId, PORTAL_INVITES_KEY, NO_INVITES, current => [...current.filter(i => i.id !== invitationId), invite], invite.issuedBy);
    const token = issuePortalToken({ projectId, requestId: invitationId, bidderId: invitation.bidderId }, PORTAL_LINK_DAYS);
    // A path: the page adds the address it's on, because behind a proxy this server can't be sure of its own.
    return json({ path: `/portal/bid?t=${token}` });
  } catch (error) {
    return json({ error: error instanceof Error && /not configured/.test(error.message) ? "Private links aren't set up on this server yet." : "The link could not be made. Try again." }, 503);
  }
}
