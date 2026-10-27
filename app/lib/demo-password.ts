// One shared password in front of the whole demo (Danial, 14 Oct): the site runs AI on our DeepSeek
// key and, once someone uploads project files, shows real project text in their browser. The password is
// DEMO_PASSWORD; no password set = no gate (local).
//
// Signing in (Danial, 27 Oct: "remove the Chrome log in … a proper in-page log in screen"): the Structor
// sign-in page posts the password to /api/login, which sets a signed session cookie. The browser's own
// "Basic" sign-in box is no longer asked for, but a Basic header still counts, for scripts and curl.

/** Same result for every wrong guess of the same length, so timing doesn't reveal the password. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const gateOff = (password: string | undefined) => !password || !password.trim();

/** Whether a request's Authorization header carries the demo password. */
export function passwordAccepted(authorization: string | null, password: string | undefined, required = false): boolean {
  if (gateOff(password)) return !required;
  const [scheme, encoded] = (authorization ?? "").trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;
  let decoded: string;
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))); } catch { return false; }
  const colon = decoded.indexOf(":");
  return colon >= 0 && sameText(decoded.slice(colon + 1), password!);
}

/** Whether what was typed on the sign-in page is the demo password. */
export const passwordMatches = (typed: unknown, password: string | undefined) => !gateOff(password) && typeof typed === "string" && sameText(typed, password!);

// ── Session cookie ──────────────────────────────────────────────────────────

export const SESSION_COOKIE = "structor_session";
/** How long a sign-in lasts on one browser. */
export const SESSION_DAYS = 30;

const base64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(expires: number, password: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`structor-session:${expires}`)));
}

/** A session that lasts SESSION_DAYS: its expiry and a signature only the password can make. Changing the password ends every session. */
export async function sessionToken(password: string, now = Date.now()): Promise<string> {
  const expires = now + SESSION_DAYS * 86_400_000;
  return `${expires}.${await sign(expires, password)}`;
}

/** Whether a session cookie was made with this password and hasn't expired. */
export async function sessionValid(token: string | undefined, password: string | undefined, now = Date.now()): Promise<boolean> {
  if (gateOff(password) || !token) return false;
  const [stamp, signature, extra] = token.split(".");
  const expires = Number(stamp);
  if (extra !== undefined || !signature || !/^\d{13}$/.test(stamp) || expires <= now) return false;
  return sameText(signature, await sign(expires, password!));
}

/** Where to go after signing in: a page of this site only, never another site ("//evil.com", "https://…"). */
export function afterSignIn(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : "/";
}
