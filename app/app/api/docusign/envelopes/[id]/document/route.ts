import { isEnvelopeId } from "../../../../../../lib/docusign";
import { docusignConfig, DocusignError, signedPdf } from "../../../../../../lib/docusign-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The signed package with DocuSign's certificate of completion, behind the site's sign-in. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const config = docusignConfig();
  if (!config) return new Response("DocuSign isn't connected.", { status: 503 });
  if (!isEnvelopeId(id)) return new Response("That isn't a DocuSign envelope.", { status: 400 });
  try {
    return new Response(await signedPdf(config, id), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="signed-subcontract-${id}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return new Response(error instanceof DocusignError ? error.message : "DocuSign could not be reached.", { status: 502 });
  }
}
