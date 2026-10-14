// One shared password in front of the whole demo (Danial, 14 Oct): the site runs AI on our DeepSeek
// key and, once someone uploads project files, shows real project text in their browser. Browser
// "Basic" sign-in: any user name, the password from DEMO_PASSWORD. No password set = no gate (local).

/** Same result for every wrong guess of the same length, so timing doesn't reveal the password. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Whether a request's Authorization header carries the demo password. */
export function passwordAccepted(authorization: string | null, password: string | undefined): boolean {
  if (!password) return true;
  const [scheme, encoded] = (authorization ?? "").trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;
  let decoded: string;
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))); } catch { return false; }
  const colon = decoded.indexOf(":");
  return colon >= 0 && sameText(decoded.slice(colon + 1), password);
}

export const PASSWORD_CHALLENGE = 'Basic realm="Structor demo", charset="UTF-8"';
