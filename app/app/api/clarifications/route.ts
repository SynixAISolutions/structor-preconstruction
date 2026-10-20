import { ClarificationError, cancelClarification, markLinesApplied, parseDraftRequest, sendClarification } from "../../../lib/clarifications";
import { StaleWriteError, listRequests, readRequest, writeRequest } from "../../../lib/clarification-store";
import { issuePortalToken } from "../../../lib/portal-links";

// The estimator's side of clarification requests (Close the gap): list a project's requests, send a
// draft (it is stored and a signed portal link comes back), record an apply done in leveling, cancel,
// or reissue the link. Behind the demo password (proxy.ts) like every GC route. Every change to a stored
// request names the version it was made from; an older one gets 409.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const SAFE = /^[A-Za-z0-9_-]{1,100}$/;
const portalLink = (request: Request, claim: { projectId: string; requestId: string; bidderId: string }) =>
  `${new URL(request.url).origin}/portal/clarify?t=${issuePortalToken(claim)}`;

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  if (!SAFE.test(projectId)) return json({ error: "Name the project." }, 400);
  try { return json({ requests: await listRequests(projectId) }); }
  catch { return json({ error: "Clarification requests could not be loaded. Please try again." }, 503); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const action = body.action, by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 120) : "Estimator", at = new Date().toISOString();
  try {
    if (action === "send") {
      const draft = parseDraftRequest(body.request);
      const sent = sendClarification(draft, (body.recipient ?? {}) as { name: string; email: string }, String(body.dueAt ?? ""), by, at);
      await writeRequest(sent, null);
      return json({ request: sent, link: portalLink(request, { projectId: sent.projectId, requestId: sent.id, bidderId: sent.bidderId }) });
    }
    const projectId = String(body.projectId ?? ""), id = String(body.id ?? "");
    if (!SAFE.test(projectId) || !SAFE.test(id)) return json({ error: "Name the project and the request." }, 400);
    const stored = await readRequest(projectId, id);
    if (!stored) return json({ error: "That request no longer exists." }, 404);
    if (action === "link") return json({ link: portalLink(request, { projectId, requestId: id, bidderId: stored.request.bidderId }) });
    if (body.version !== stored.request.version) return json({ error: "This request has changed since you loaded it. Reload and try again.", request: stored.request }, 409);
    const changed = action === "applied" ? markLinesApplied(stored.request, Array.isArray(body.applied) ? body.applied.map(String) : [], by, at)
      : action === "cancel" ? cancelClarification(stored.request, by, at)
      : null;
    if (!changed) return json({ error: "Unknown action." }, 400);
    if (changed !== stored.request) await writeRequest(changed, stored.etag);
    return json({ request: changed });
  } catch (error) {
    if (error instanceof ClarificationError) return json({ error: error.message }, 422);
    if (error instanceof StaleWriteError) return json({ error: error.message }, 409);
    return json({ error: "The request could not be saved. Please try again." }, 503);
  }
}
