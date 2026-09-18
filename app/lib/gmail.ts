import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const GMAIL_COOKIE = "structor_gmail";
export const GMAIL_STATE_COOKIE = "structor_gmail_state";

export type GmailTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

export function sealTokens(tokens: GmailTokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unsealTokens(value?: string) {
  if (!value) return null;
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length <= 28) return null;
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as GmailTokens;
  } catch {
    return null;
  }
}

export function gmailSettings(origin: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  return {
    clientId,
    clientSecret,
    redirectUri: `${process.env.APP_URL || origin}/api/gmail/callback`,
  };
}

export async function refreshGmailTokens(tokens: GmailTokens, origin: string) {
  if (tokens.expiresAt > Date.now() + 60_000) return tokens;
  if (!tokens.refreshToken) throw new Error("Gmail authorization expired. Connect Gmail again.");
  const settings = gmailSettings(origin);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Gmail authorization could not be refreshed. Connect Gmail again.");
  const fresh = await response.json() as { access_token: string; expires_in: number };
  return {
    accessToken: fresh.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + fresh.expires_in * 1000,
  };
}
