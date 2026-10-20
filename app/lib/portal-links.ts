// Signed links for the subcontractor portal (Close the gap, 20 Oct): a sub opens one clarification
// request from a link, with no account and no access to anything else. The token carries the project,
// the request and the bidder, with an expiry, signed with HMAC-SHA256; the server checks it on every
// read and write. Server only (node:crypto).
//
// The key is PORTAL_LINK_SECRET when set. Until Danial adds it in Vercel, it is derived from the
// project's existing server-only Blob token, so links work without a new resource; setting
// PORTAL_LINK_SECRET later invalidates links issued before it.

import { createHmac, timingSafeEqual } from "node:crypto";

export type PortalClaim = { projectId: string; requestId: string; bidderId: string; expiresAt: string };

function key(): Buffer {
  const own = process.env.PORTAL_LINK_SECRET?.trim();
  if (own) return Buffer.from(own);
  const blob = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blob) throw new Error("Portal links are not configured on this server.");
  return createHmac("sha256", blob).update("structor portal links v1").digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** A link token for one request, valid for `days`. */
export function issuePortalToken(claim: Omit<PortalClaim, "expiresAt">, days = 30, now = new Date()): string {
  for (const id of [claim.projectId, claim.requestId, claim.bidderId]) if (!ID.test(id)) throw new Error(`Refusing to sign the unsafe id "${id}".`);
  const expiresAt = new Date(now.getTime() + days * 864e5).toISOString();
  const payload = Buffer.from(JSON.stringify({ p: claim.projectId, r: claim.requestId, b: claim.bidderId, e: expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The claim in a token, or null when it is malformed, tampered with or expired. */
export function verifyPortalToken(token: string | null | undefined, now = new Date()): PortalClaim | null {
  if (!token || token.length > 600) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const claim = { projectId: String(o.p), requestId: String(o.r), bidderId: String(o.b), expiresAt: String(o.e) };
    if (![claim.projectId, claim.requestId, claim.bidderId].every(id => ID.test(id))) return null;
    if (!(Date.parse(claim.expiresAt) > now.getTime())) return null;
    return claim;
  } catch { return null; }
}
