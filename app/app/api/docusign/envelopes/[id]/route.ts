import { isEnvelopeId, readEnvelope } from "../../../../../lib/docusign";
import { docusignConfig, DocusignError, fetchEnvelope, voidEnvelope } from "../../../../../lib/docusign-server";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const failed = (error: unknown) => json({ error: error instanceof DocusignError ? error.message : "DocuSign could not be reached." }, 502);

/** Where an envelope stands. The browser keeps to DocuSign's limit of one read per envelope every 15 minutes (lib/docusign canCheck). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const config = docusignConfig();
  if (!config) return json({ error: "DocuSign isn't connected." }, 503);
  if (!isEnvelopeId(id)) return json({ error: "That isn't a DocuSign envelope." }, 400);
  try { return json(readEnvelope(await fetchEnvelope(config, id))); }
  catch (error) { return failed(error); }
}

/** Voids an envelope, so nobody can sign it once its award is cancelled. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) throw new Error(); } catch { return json({ error: "Void the envelope from the Structor page." }, 403); } }
  const config = docusignConfig();
  if (!config) return json({ error: "DocuSign isn't connected." }, 503);
  if (!isEnvelopeId(id)) return json({ error: "That isn't a DocuSign envelope." }, 400);
  const reason = await request.json().then(body => typeof body?.reason === "string" ? body.reason.trim() : "").catch(() => "");
  if (!reason) return json({ error: "Say why the envelope is voided." }, 400);
  try { await voidEnvelope(config, id, reason); return json({ ok: true }); }
  catch (error) { return failed(error); }
}
