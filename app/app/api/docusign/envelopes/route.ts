import { envelopeBody, parseEnvelopeRequest, type EnvelopeRequest } from "../../../../lib/docusign";
import { contractPdf } from "../../../../lib/docusign-pdf";
import { createEnvelope, docusignConfig, DocusignError, loadAsset } from "../../../../lib/docusign-server";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// Sends a subcontract package for signature. The site's sign-in (proxy.ts) protects this route.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) throw new Error(); } catch { return json({ error: "Send the subcontract from the Structor page." }, 403); } }
  const config = docusignConfig();
  if (!config) return json({ error: "DocuSign isn't connected." }, 503);
  let input: EnvelopeRequest;
  try { input = parseEnvelopeRequest(await request.json()); }
  catch (error) { return json({ error: error instanceof SyntaxError ? "The request could not be read." : error instanceof Error ? error.message : "The request could not be read." }, 400); }
  try {
    const attachments = await Promise.all(input.assets.map(loadAsset));
    const contract = Buffer.from(await contractPdf(input)).toString("base64");
    const created = await createEnvelope(config, envelopeBody(input, contract, attachments));
    return json({ envelopeId: created.envelopeId, status: created.status }, 201);
  } catch (error) {
    return json({ error: error instanceof DocusignError ? error.message : "The subcontract could not be sent. Nothing went out." }, 502);
  }
}
