import { ClarificationError, answerClarification, portalView, type AnswerInput } from "../../../../lib/clarifications";
import { StaleWriteError, readRequest, writeRequest } from "../../../../lib/clarification-store";
import { verifyPortalToken } from "../../../../lib/portal-links";

// The subcontractor's side (Close the gap): the signed link from the estimator opens exactly one request
// for one bidder, with no password and no access to anything else (proxy.ts lets /api/portal through;
// this route checks the token on every call). GET shows the request; POST saves answers, made from the
// version the sub loaded (an older one gets 409).
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function open(request: Request) {
  const claim = verifyPortalToken(new URL(request.url).searchParams.get("t"));
  if (!claim) return { error: json({ error: "This link is not valid or has expired. Ask the estimator for a new one." }, 401) };
  const stored = await readRequest(claim.projectId, claim.requestId);
  if (!stored || stored.request.bidderId !== claim.bidderId || stored.request.status === "draft") return { error: json({ error: "This request is not available." }, 404) };
  if (stored.request.status === "cancelled") return { error: json({ error: "The estimator withdrew this request." }, 410) };
  return { stored };
}

export async function GET(request: Request) {
  try {
    const { stored, error } = await open(request);
    return error ?? json({ request: portalView(stored!.request) });
  } catch { return json({ error: "The request could not be loaded. Please try again." }, 503); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  try {
    const { stored, error } = await open(request);
    if (error) return error;
    if (body.version !== stored!.request.version) return json({ error: "This request changed since you opened it. Reload the page and check your answers.", request: portalView(stored!.request) }, 409);
    const answered = answerClarification(stored!.request, (Array.isArray(body.answers) ? body.answers : []) as AnswerInput[], String(body.by ?? ""), new Date().toISOString());
    await writeRequest(answered, stored!.etag);
    return json({ request: portalView(answered) });
  } catch (error) {
    if (error instanceof ClarificationError) return json({ error: error.message }, 422);
    if (error instanceof StaleWriteError) return json({ error: error.message }, 409);
    return json({ error: "Your answers could not be saved. Please try again." }, 503);
  }
}
