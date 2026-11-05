import { checkConnection, consentUrl, docusignConfig, DocusignError } from "../../../lib/docusign-server";
import type { DocusignSetup } from "../../../lib/docusign";

export const runtime = "nodejs";

// Whether subcontracts can go out through DocuSign. Says nothing about the keys themselves.
export async function GET(request: Request) {
  const answer = (setup: DocusignSetup) => Response.json(setup, { headers: { "Cache-Control": "private, no-store" } });
  const config = docusignConfig();
  if (!config) return answer({ configured: false, ready: false });
  try {
    await checkConnection(config);
    return answer({ configured: true, ready: true });
  } catch (error) {
    if (error instanceof DocusignError && error.kind === "consent") return answer({ configured: true, ready: false, consentUrl: consentUrl(config, new URL(request.url).origin), problem: error.message });
    return answer({ configured: true, ready: false, problem: error instanceof DocusignError ? error.message : "DocuSign could not be reached." });
  }
}
