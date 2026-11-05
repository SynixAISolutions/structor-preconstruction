import { addBidMessage, attachBidFile, BID_MESSAGES_KEY, bidDocuments, declineInvitation, ensureSubmission, markBidding, ownSubmission, PortalConflict, PortalRuleError, portalView, recordBidSubmitted, removeBidFile, saveBidDraft, submitPortalBid, tellOwnerOfMessage, type BidDocument } from "../../../../lib/bid-portal";
import { readIndex } from "../../../../lib/project-files-store";
import { changeRow, NO_MESSAGES, readRow, startingProcurement, startingSubmissions } from "../../../../lib/portal-store";
import type { Procurement } from "../../../../lib/procurement";
import { submissionFor, SubmissionRuleError, type Submission } from "../../../../lib/submissions";
import { bidSession, json, type BidSession } from "./session";

// A subcontractor's side of a bid: the private link opens exactly one invitation, with no password and no access to
// anything else (proxy.ts lets /api/portal through; bidSession checks the link on every call). What they save goes
// into the project's shared drafts, so the estimator's screens bring it in as they do any shared change.
export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_BODY = 1_000_000;

async function documentsFor(projectId: string): Promise<BidDocument[]> {
  // Stored files are an extra: without them (or their store), the bid form still works.
  try { return bidDocuments((await readIndex(projectId)).documents); } catch { return []; }
}

const submissionsOf = (s: BidSession) => (change: (current: Submission[]) => Submission[]) => changeRow(s.store, s.claim.projectId, "submissions", startingSubmissions(s.claim.projectId), change);
const procurementOf = (s: BidSession) => (change: (current: Procurement) => Procurement) => changeRow(s.store, s.claim.projectId, "procurement", startingProcurement(s.claim.projectId), change);

async function view(s: BidSession) {
  const { projectId } = s.claim;
  const [messages, documents, submissions, { value: procurement }] = await Promise.all([
    readRow(s.store, projectId, BID_MESSAGES_KEY, NO_MESSAGES).then(r => r.value),
    documentsFor(projectId),
    // The first look opens their bid, and later ones line a draft up with a revised form.
    submissionsOf(s)(current => ensureSubmission(current, s.procurement, projectId, s.invitationId)),
    readRow(s.store, projectId, "procurement", startingProcurement(projectId)),
  ]);
  return portalView({ invite: s.invite, procurement, submissions, messages, documents, invitationId: s.invitationId });
}

export async function GET(request: Request) {
  try {
    const { session, error } = await bidSession(request);
    return error ?? json({ view: await view(session) });
  } catch { return json({ error: "Your bid could not be loaded. Please try again." }, 503); }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) return json({ error: "That's too much to save at once." }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Send JSON." }, 400); }
  try {
    const { session, error } = await bidSession(request);
    if (error) return error;
    const s = session, id = s.invitationId, at = new Date().toISOString();
    const submissions = submissionsOf(s), procurement = procurementOf(s);
    const own = (list: Submission[]) => ownSubmission(submissionFor(list, id));
    switch (body.action) {
      case "save": {
        const saved = await submissions(current => saveBidDraft(current, s.procurement, id, body.draft, body.expectedUpdatedAt, at));
        await procurement(current => markBidding(current, id));
        return json({ submission: own(saved) });
      }
      case "submit": {
        // Two rows: the bid first, because a bid with a stale invitation status is safer than a status with no bid.
        const { name, email } = (body.submitter ?? {}) as { name?: unknown; email?: unknown };
        const submitter = { name: String(name ?? "").slice(0, 120), email: String(email ?? "").slice(0, 200) };
        const saved = await submissions(current => submitPortalBid(current, s.procurement, id, submitter, at));
        const revision = submissionFor(saved, id)?.revisions.length ?? 1;
        await procurement(current => recordBidSubmitted(current, id, revision, s.invite.company, at));
        return json({ view: await view(s) });
      }
      case "message": {
        await changeRow(s.store, s.claim.projectId, BID_MESSAGES_KEY, NO_MESSAGES, current => addBidMessage(current, s.procurement, id, { from: "subcontractor", author: body.author, text: body.text }, at));
        await procurement(current => tellOwnerOfMessage(current, id, s.invite.company, at));
        return json({ view: await view(s) });
      }
      case "decline": {
        await procurement(current => declineInvitation(current, id, s.invite.company, at));
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";
        if (reason) await changeRow(s.store, s.claim.projectId, BID_MESSAGES_KEY, NO_MESSAGES, current => addBidMessage(current, s.procurement, id, { from: "subcontractor", author: body.author || s.invite.contact || s.invite.company, text: `Declined to bid: ${reason}` }, at));
        return json({ view: await view(s) });
      }
      case "attach": {
        const saved = await submissions(current => attachBidFile(current, s.claim.projectId, id, (body.file ?? {}) as Record<string, unknown>, at));
        return json({ submission: own(saved) });
      }
      case "remove-file": {
        const saved = await submissions(current => removeBidFile(current, id, String(body.id ?? ""), at));
        return json({ submission: own(saved) });
      }
      default: return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    if (error instanceof PortalConflict) return json({ error: error.message }, 409);
    if (error instanceof SubmissionRuleError) return json({ error: error.message, issues: error.issues }, 422);
    if (error instanceof PortalRuleError) return json({ error: error.message }, 422);
    return json({ error: "That could not be saved. Please try again." }, 503);
  }
}
