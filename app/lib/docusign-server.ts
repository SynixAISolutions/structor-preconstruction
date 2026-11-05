// The calls to DocuSign (server only). The app signs in as one DocuSign user with a JWT, so the keys stay on the server
// and nobody has to log in to DocuSign to send. Keys come from Vercel's environment variables; without them the app
// keeps its recorded signatures and never calls DocuSign.
//
// DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_PRIVATE_KEY (the RSA key, "\n" for line
// breaks is fine). DOCUSIGN_OAUTH_URL picks the environment: the developer sandbox unless it's set to
// https://account.docusign.com for production.

import { createSign } from "node:crypto";
import { get } from "@vercel/blob";
import { assetId, type DocumentAsset } from "./document-assets";

export type DocusignConfig = { integrationKey: string; userId: string; accountId: string; privateKey: string; oauthUrl: string; audience: string };

export function docusignConfig(env: Record<string, string | undefined> = process.env): DocusignConfig | null {
  const integrationKey = env.DOCUSIGN_INTEGRATION_KEY?.trim(), userId = env.DOCUSIGN_USER_ID?.trim(), accountId = env.DOCUSIGN_ACCOUNT_ID?.trim(), key = env.DOCUSIGN_PRIVATE_KEY?.trim();
  if (!integrationKey || !userId || !accountId || !key) return null;
  const oauthUrl = (env.DOCUSIGN_OAUTH_URL?.trim() || "https://account-d.docusign.com").replace(/\/+$/, "");
  return { integrationKey, userId, accountId, privateKey: key.replace(/\\n/g, "\n"), oauthUrl, audience: new URL(oauthUrl).host };
}

/** `consent` means someone has to grant the app access once, at consentUrl. Messages are fit to show. */
export class DocusignError extends Error {
  readonly kind: "consent" | "request";
  constructor(message: string, kind: "consent" | "request" = "request") { super(message); this.name = "DocusignError"; this.kind = kind; }
}

export const consentUrl = (config: DocusignConfig, redirectUri: string) =>
  `${config.oauthUrl}/oauth/auth?response_type=code&scope=${encodeURIComponent("signature impersonation")}&client_id=${encodeURIComponent(config.integrationKey)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** The signed request for an access token. */
export function jwtAssertion(config: DocusignConfig, seconds = Math.floor(Date.now() / 1000)): string {
  const body = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: config.integrationKey, sub: config.userId, aud: config.audience, iat: seconds, exp: seconds + 3600, scope: "signature impersonation" })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(config.privateKey, "base64url")}`;
}

// A token lasts an hour; DocuSign advises renewing 15 minutes before it ends. Kept per server instance.
let session: { key: string; token: string; until: number; base: string } | null = null;
export const forgetDocusignSession = () => { session = null; };

async function connect(config: DocusignConfig): Promise<{ token: string; base: string }> {
  if (session?.key === config.integrationKey && Date.now() < session.until) return session;
  let response: Response;
  try {
    response = await fetch(`${config.oauthUrl}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwtAssertion(config) }), signal: AbortSignal.timeout(20_000) });
  } catch { throw new DocusignError("DocuSign could not be reached. Try again."); }
  const answer = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (answer.error === "consent_required") throw new DocusignError("DocuSign needs one-time permission for this app.", "consent");
  if (!response.ok || !answer.access_token) throw new DocusignError("DocuSign refused the app's sign-in. Check the DocuSign settings in Vercel.");
  const info = await fetch(`${config.oauthUrl}/oauth/userinfo`, { headers: { Authorization: `Bearer ${answer.access_token}` }, signal: AbortSignal.timeout(20_000) }).then(r => r.json()).catch(() => null) as { accounts?: { account_id: string; base_uri: string }[] } | null;
  const account = info?.accounts?.find(a => a.account_id === config.accountId);
  if (!account) throw new DocusignError("That DocuSign account isn't on this DocuSign user. Check DOCUSIGN_ACCOUNT_ID.");
  session = { key: config.integrationKey, token: answer.access_token, until: Date.now() + (Number(answer.expires_in) || 3600) * 1000 - 15 * 60_000, base: `${account.base_uri.replace(/\/+$/, "")}/restapi/v2.1/accounts/${config.accountId}` };
  return session;
}

/** Whether DocuSign accepts the app's keys. Throws DocusignError when it doesn't. */
export const checkConnection = async (config: DocusignConfig) => { await connect(config); };

async function call(config: DocusignConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const { token, base } = await connect(config);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) }, signal: AbortSignal.timeout(50_000) });
  } catch { throw new DocusignError("DocuSign could not be reached. Try again."); }
  if (response.ok) return response;
  const problem = await response.json().catch(() => ({})) as { errorCode?: string; message?: string };
  throw new DocusignError(problem.message ? `DocuSign: ${problem.message}` : `DocuSign refused the request (${response.status}).`);
}

export const createEnvelope = async (config: DocusignConfig, body: unknown): Promise<{ envelopeId: string; status: string }> =>
  (await call(config, "/envelopes", { method: "POST", body: JSON.stringify(body) })).json();

export const fetchEnvelope = async (config: DocusignConfig, id: string): Promise<unknown> =>
  (await call(config, `/envelopes/${id}?include=recipients`)).json();

export const voidEnvelope = async (config: DocusignConfig, id: string, reason: string): Promise<void> => {
  await call(config, `/envelopes/${id}`, { method: "PUT", body: JSON.stringify({ status: "voided", voidedReason: reason.slice(0, 200) }) });
};

/** Every document in the envelope as one PDF, signed, with DocuSign's certificate of completion. */
export const signedPdf = async (config: DocusignConfig, id: string): Promise<ArrayBuffer> =>
  (await call(config, `/envelopes/${id}/documents/combined?certificate=true`)).arrayBuffer();

/** A stored contract file, as DocuSign takes it. */
export async function loadAsset(asset: DocumentAsset): Promise<{ name: string; extension: string; base64: string }> {
  const missing = () => new DocusignError(`${asset.name} could not be read. Upload it again.`);
  if (!assetId(asset.id)) throw missing();
  const meta = await get(`document-assets/${asset.id}.json`, { access: "private", useCache: false }).catch(() => null);
  if (!meta || meta.statusCode !== 200) throw missing();
  const saved = await new Response(meta.stream).json() as { id: string; path: string };
  const extension = new RegExp(`^document-assets/${asset.id}\\.(pdf|docx)$`).exec(saved.path)?.[1];
  if (saved.id !== asset.id || !extension) throw new DocusignError(`${asset.name} isn't a PDF or Word file, so it can't go in the envelope.`);
  const file = await get(saved.path, { access: "private", useCache: false }).catch(() => null);
  if (!file || file.statusCode !== 200) throw missing();
  return { name: asset.name, extension, base64: Buffer.from(await new Response(file.stream).arrayBuffer()).toString("base64") };
}
