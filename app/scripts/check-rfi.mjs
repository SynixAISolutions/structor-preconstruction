import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/rfi.ts");
const { sampleStructorCheck } = await import("../lib/data/rfi.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { inviteBidder } = await import("../lib/procurement.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-30T16:00:00.000Z";
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof R.RfiRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const base = freeze(structuredClone(sampleStructorCheck));
const proc = freeze(inviteBidder(structuredClone(sampleProcurement), "openings", "b6", "Safi", at));
const byNumber = (s, n) => s.issues.find(i => i.number === n);
const architect = { name: "Matt D.", company: "Design team", email: "architect@example.com" };

// Sample and empty projects: two AI issues reviewed, two waiting for the contractor, one resolved.
assert.deepEqual(base.issues.map(i => [i.number, i.severity, i.status, i.origin, i.packageId, i.reviewedBy]), [
  ["SC-001", "high", "open", "ai", "thermal", "Safi"], ["SC-002", "high", "open", "ai", "openings", "Safi"], ["SC-003", "medium", "pending-review", "ai", "drywall", null],
  ["SC-004", "high", "pending-review", "ai", "mechanical", null], ["SC-005", "medium", "resolved", "ai", "thermal", "Safi"],
]);
assert.deepEqual(startingDraft("p2", "structor-check-state", sampleStructorCheck), R.EMPTY_STRUCTOR_CHECK, "A new project starts with an empty log");

// The table: filters, search, order.
assert.deepEqual(R.filterIssues(base, { trade: "08 · Openings" }).map(i => i.number), ["SC-002"]);
assert.deepEqual(R.filterIssues(base, { severity: "high" }).map(i => i.number).sort(), ["SC-001", "SC-002", "SC-004"]);
assert.deepEqual(R.filterIssues(base, { status: "pending-review" }).map(i => i.number).sort(), ["SC-003", "SC-004"]);
assert.deepEqual(R.filterIssues(base, { query: "d-104" }).map(i => i.number), ["SC-002"]);
assert.deepEqual(R.filterIssues(base, { origin: "team" }), []);
assert(R.filterIssues(base).every((i, n, all) => n === 0 || ({ high: 0, medium: 1, low: 2 })[all[n - 1].severity] <= ({ high: 0, medium: 1, low: 2 })[i.severity]), "Most severe first");
assert.deepEqual(R.issueTrades(base), ["07 · Envelope", "07 · Roofing", "08 · Openings", "09 · Finishes", "23 · HVAC"]);

// The team's own issues are reviewed as they are added; AI ones wait.
fails(() => R.addIssue(base, { title: " ", severity: "urgent" }, "Safi", at), "title", /Describe/);
fails(() => R.addIssue(base, { title: "x", severity: "urgent" }, "Safi", at), "severity", /high, medium, or low/);
let s = freeze(R.addIssue(base, { title: "  Confirm gym floor transition detail ", severity: "low", trade: "09 · Finishes", source: "A8.1" }, "Vijay", at));
const own = s.issues.at(-1);
assert.deepEqual([own.number, own.title, own.origin, own.raisedBy, own.category, own.status, own.reviewedBy], ["SC-006", "Confirm gym floor transition detail", "team", "Vijay", "Question", "open", "Vijay"]);
assert.equal(R.addIssue({ ...s, lastIssueNumber: 9 }, { title: "x", severity: "low" }, "Safi", at).issues.at(-1).number, "SC-010", "Numbers follow the counter, never reused");
const email = R.addIssue(s, { title: "From the architect's email", severity: "medium", origin: "email", raisedBy: "DLR" }, "Safi", at).issues.at(-1);
assert.deepEqual([email.origin, email.status, email.reviewedBy], ["email", "open", "Safi"], "The contractor entered it, so it is reviewed");
const ai = R.addIssue(s, { title: "Structor found a gap", severity: "low", origin: "ai", raisedBy: "Structor Check" }, "Structor Check", at).issues.at(-1);
assert.deepEqual([ai.status, ai.reviewedBy], ["pending-review", null]);
assert.equal(R.editIssue(s, own.id, { severity: "high" }, at).issues.at(-1).severity, "high");
fails(() => R.closeIssue(s, own.id, "resolved", " ", "Safi", at), "note", /Write the answer/);
const dismissed = R.closeIssue(s, own.id, "dismissed", "Shown on A-502", "Safi", at);
assert.deepEqual([dismissed.issues.at(-1).status, dismissed.issues.at(-1).resolution.note, dismissed.notifications.length], ["dismissed", "Shown on A-502", 0]);
fails(() => R.editIssue(dismissed, own.id, { title: "x" }, at), "issue", /dismissed/);
assert.equal(R.reopenIssue(dismissed, own.id, at).issues.at(-1).status, "open");

// Contractor review: a waiting issue can be edited (not its provenance), approved, or closed — nothing else.
const [sc1, sc2, sc3, sc4] = ["SC-001", "SC-002", "SC-003", "SC-004"].map(n => byNumber(s, n).id);
const touched = R.editIssue(s, sc4, { severity: "medium", origin: "team", raisedBy: "Safi" }, at);
assert.deepEqual([byNumber(touched, "SC-004").severity, byNumber(touched, "SC-004").origin, byNumber(touched, "SC-004").raisedBy, byNumber(touched, "SC-004").status], ["medium", "ai", "Structor Check", "pending-review"]);
fails(() => R.createRfi(s, { issueIds: [sc1, sc4], question: "q", to: architect }, "Safi", at), "issueIds", /SC-004 needs contractor review first/);
fails(() => R.combineIssues(s, sc1, [sc4], "Safi", at), "issueIds", /SC-004 needs contractor review first/);
fails(() => R.approveIssue(s, sc4, " ", at), "issue", /who reviewed/);
fails(() => R.approveIssue(s, sc1, "Safi", at), "issue", /not waiting for review/);
const skipped = R.closeIssue(s, sc3, "dismissed", "Finish is on A-702.", "Naija", at);
assert.deepEqual([byNumber(skipped, "SC-003").status, byNumber(skipped, "SC-003").reviewedBy], ["dismissed", "Naija"], "Dismissing is the contractor's review");
s = freeze(R.approveIssue(s, sc4, "Safi", at));
assert.deepEqual([byNumber(s, "SC-004").status, byNumber(s, "SC-004").reviewedBy, byNumber(s, "SC-004").reviewedAt], ["open", "Safi", at]);
const stale = { ...s, issues: s.issues.map(i => i.id === sc2 ? { ...i, reviewedBy: null } : i) };
fails(() => R.createRfi(stale, { issueIds: [sc2], question: "q", to: architect }, "Safi", at), "issueIds", /SC-002 needs contractor review/, "An unreviewed AI issue can't be packaged even if marked open");

// A subcontractor's question from the portal waits for review too; the package owner is told.
fails(() => R.raiseSubcontractorQuestion(base, proc, { invitationId: "inv-4", company: "Metro Mechanical", title: "x" }, at), "invitation", /active invitation/);
s = freeze(R.raiseSubcontractorQuestion(s, proc, { invitationId: "inv-1", company: "Capital Demolition", title: "Who removes the roof anchors?", source: "CIV0102" }, at));
const question = s.issues.at(-1);
assert.deepEqual([question.number, question.origin, question.status, question.bidderId, question.packageId, question.trade, question.raisedBy], ["SC-007", "subcontractor", "pending-review", "b1", "demolition", "02 · Demolition", "Capital Demolition"]);
assert.deepEqual(s.notifications.map(n => [n.kind, n.recipientType, n.recipient]), [["question-raised", "team", "Safi"]]);
assert.match(s.notifications[0].text, /waiting for your review/);
fails(() => R.createRfi(s, { issueIds: [question.id], question: "q", to: architect }, "Safi", at), "issueIds", /SC-007 needs contractor review first/);
const answered = R.closeIssue(s, question.id, "resolved", "Yes, per CIV0102 note 4.", "Safi", at);
assert.deepEqual([answered.notifications.at(-1).kind, answered.notifications.at(-1).recipientType, answered.notifications.at(-1).recipient], ["question-resolved", "bidder", "b1"], "The subcontractor gets the answer");

// Combining reviewed duplicates: the subcontractor's question folds into SC-001.
s = freeze(R.approveIssue(s, question.id, "Safi", at));
fails(() => R.combineIssues(s, sc1, [sc1], "Safi", at), "issueIds", /Choose the issues/);
const intoOwn = R.combineIssues(s, own.id, [question.id], "Safi", at);
assert.deepEqual([byNumber(intoOwn, "SC-006").severity, byNumber(intoOwn, "SC-006").source], ["medium", "A8.1; CIV0102"], "Takes the highest severity and every source");
assert.deepEqual(R.closeIssue(intoOwn, own.id, "resolved", "Roofing sub removes them.", "Safi", at).notifications.at(-1).recipient, "b1", "Resolving the kept issue answers the combined question");
assert.deepEqual(R.reopenIssue(intoOwn, question.id, at).issues.at(-1).status + "/" + R.reopenIssue(intoOwn, question.id, at).issues.at(-1).combinedInto, "open/null");
s = freeze(R.combineIssues(s, sc1, [question.id], "Safi", at));
assert.deepEqual([byNumber(s, "SC-007").status, byNumber(s, "SC-007").combinedInto, byNumber(s, "SC-007").resolution.note], ["combined", sc1, "Combined into SC-001."]);
assert.match(byNumber(s, "SC-001").detail, /SC-007: Who removes the roof anchors\?$/);
fails(() => R.combineIssues(s, sc2, [question.id], "Safi", at), "issueIds", /SC-007 is combined/);

// Packaging reviewed issues into an RFI.
fails(() => R.createRfi(s, { issueIds: [], question: "q", to: architect }, "Safi", at), "issueIds", /at least one/);
fails(() => R.createRfi(s, { issueIds: [byNumber(s, "SC-005").id], question: "q", to: architect }, "Safi", at), "issueIds", /SC-005 is resolved/);
fails(() => R.createRfi(s, { issueIds: [sc1], question: " ", to: architect }, "Safi", at), "question", /Write the question/);
fails(() => R.createRfi(s, { issueIds: [sc1], question: "q", to: { name: "", company: "", email: "" } }, "Safi", at), "to", /who the RFI goes to/);
fails(() => R.createRfi(s, { issueIds: [sc1], question: "q", to: { ...architect, email: "nope" } }, "Safi", at), "email", /valid email/);
fails(() => R.createRfi(s, { issueIds: [sc1], question: "q", to: architect, due: "Friday" }, "Safi", at), "due", /valid date/);
s = freeze(R.createRfi(s, { issueIds: [sc1, sc2, sc1], question: "Please detail roof anchors and confirm the D-104 rating.", to: architect, due: "2026-10-05" }, "Safi", at));
let rfi = s.rfis[0];
assert.deepEqual([rfi.number, rfi.status, rfi.issueIds.length, rfi.subject, rfi.discipline, s.designTeam.email], ["RFI-001", "draft", 2, byNumber(s, "SC-001").title, "07 · Roofing", "architect@example.com"]);
assert.deepEqual([byNumber(s, "SC-001").status, byNumber(s, "SC-001").rfiId], ["in-rfi", rfi.id]);
fails(() => R.createRfi(s, { issueIds: [sc1], question: "again", to: architect }, "Safi", at), "issueIds", /already in an RFI/);
fails(() => R.editIssue(s, sc1, { title: "x" }, at), "issue", /in an RFI/);
fails(() => R.closeIssue(s, sc1, "resolved", "x", "Safi", at), "issue", /not open/);

// Editing a draft moves issues in and out; discarding frees them and never reuses the number.
const edited = R.editRfi(s, rfi.id, { issueIds: [sc1, sc4] }, at);
assert.deepEqual([byNumber(edited, "SC-002").status, byNumber(edited, "SC-004").status], ["open", "in-rfi"]);
const discarded = R.discardRfi(s, rfi.id, at);
assert.deepEqual([discarded.rfis.length, byNumber(discarded, "SC-001").status], [0, "open"]);
assert.equal(R.createRfi(discarded, { issueIds: [sc1], question: "q", to: architect }, "Safi", at).rfis[0].number, "RFI-002", "RFI-001 is never reused");

// Only a contractor-approved RFI can be recorded as sent. Editing an approved one needs approval again.
fails(() => R.sendRfi(s, rfi.id, "Safi", at), "rfi", /must approve RFI-001/);
fails(() => R.approveRfi(R.editRfi(s, rfi.id, { to: { ...architect, email: "" } }, at), rfi.id, "Safi", at), "email", /email address before approving/);
fails(() => R.approveRfi(s, rfi.id, "", at), "rfi", /who approved/);
fails(() => R.approveRfi({ ...s, issues: s.issues.map(i => i.id === sc2 ? { ...i, reviewedBy: null } : i) }, rfi.id, "Safi", at), "issueIds", /SC-002 needs contractor review/);
assert.deepEqual(R.checkSummary(s, "2026-10-01"), { pendingReview: 1, open: 2, openHigh: 1, inRfi: 2, awaitingApproval: 1, readyToSend: 0, awaitingResponse: 0, overdue: 0, answeredNotShared: 0 });
s = freeze(R.approveRfi(s, rfi.id, "Marcel Khoury", at));
assert.deepEqual([s.rfis[0].status, s.rfis[0].approvedBy, s.rfis[0].approvedAt, s.notifications.length], ["approved", "Marcel Khoury", at, 1], "Approval sends nothing");
fails(() => R.approveRfi(s, rfi.id, "Safi", at), "rfi", /already approved/);
assert.deepEqual([R.rfiLog(s), R.checkSummary(s, "2026-10-01").readyToSend, R.portalRfis(s, "b1").questions[0].rfi], [[], 1, null], "Unsent RFIs stay internal");
const reworded = R.editRfi(s, rfi.id, { question: "Reworded." }, at);
assert.deepEqual([reworded.rfis[0].status, reworded.rfis[0].approvedBy], ["draft", null]);
fails(() => R.sendRfi(reworded, rfi.id, "Safi", at), "rfi", /must approve/);
assert.equal(R.discardRfi(s, rfi.id, at).rfis.length, 0, "An approved RFI can still be discarded before sending");

// Send (recorded), answer, share with the bidders of the affected trades and whoever asked, close.
fails(() => R.recordRfiResponse(s, proc, rfi.id, { text: "x", by: "DLR" }, at), "rfi", /Send the RFI/);
s = freeze(R.sendRfi(s, rfi.id, "Safi", at));
assert.deepEqual([s.rfis[0].status, s.rfis[0].sentBy, s.notifications.at(-1).recipientType, s.notifications.at(-1).recipient], ["sent", "Safi", "design-team", "architect@example.com"]);
fails(() => R.editRfi(s, rfi.id, { question: "x" }, at), "rfi", /has been sent/);
fails(() => R.approveRfi(s, rfi.id, "Safi", at), "rfi", /already sent/);
fails(() => R.sendRfi(s, rfi.id, "Safi", at), "rfi", /already sent/);
fails(() => R.discardRfi(s, rfi.id, at), "rfi", /stays in the log/);
assert.deepEqual(R.checkSummary(s, "2026-10-06"), { pendingReview: 1, open: 2, openHigh: 1, inRfi: 2, awaitingApproval: 0, readyToSend: 0, awaitingResponse: 1, overdue: 1, answeredNotShared: 0 });
const view = R.portalRfis(s, "b1").questions[0];
assert.deepEqual([view.issue.number, view.current.number, view.rfi.number], ["SC-007", "SC-001", "RFI-001"], "The asker follows its question into the RFI once sent");
fails(() => R.closeRfi(s, rfi.id, "Safi", at), "rfi", /Only an answered RFI/);
fails(() => R.shareRfiResponse(s, proc, rfi.id, at), "rfi", /Record the design team's answer/);
fails(() => R.recordRfiResponse(s, proc, rfi.id, { text: " ", by: "DLR" }, at), "response", /Enter the design team's answer/);
s = freeze(R.recordRfiResponse(s, proc, rfi.id, { text: "Anchors per new detail 5/A-503. D-104 is 45-minute rated.", by: "" }, at));
rfi = s.rfis[0];
assert.deepEqual([rfi.status, rfi.response.by, s.notifications.slice(-2).map(n => n.recipient).sort()], ["answered", "Matt D.", ["Safi", "Vijay"]], "Owners of the roofing and openings packages are told");
s = freeze(R.shareRfiResponse(s, proc, rfi.id, at));
assert.deepEqual(s.rfis[0].shares.map(x => [x.bidderId, x.packageId]), [["b6", "openings"], ["b1", "thermal"]], "The openings invitee, and Capital Demolition whose question was combined in");
fails(() => R.shareRfiResponse(s, proc, rfi.id, at), "rfi", /already has this answer/);
s = freeze(R.closeRfi(s, rfi.id, "Safi", at));
assert.deepEqual([s.rfis[0].status, byNumber(s, "SC-001").status, byNumber(s, "SC-002").resolution.note.startsWith("Answered in RFI-001: Anchors"), byNumber(s, "SC-007").status], ["closed", "resolved", true, "combined"]);
fails(() => R.closeRfi(s, rfi.id, "Safi", at), "rfi", /already closed/);

// A declined invitee is not told; the subcontractor who asked is, even after declining.
const sent = (st, id) => R.sendRfi(R.approveRfi(st, id, "Safi", at), id, "Safi", at);
const mech = R.createRfi(s, { issueIds: [sc4], question: "Confirm RTU-2 capacity.", to: architect }, "Safi", at);
const mid = mech.rfis.at(-1).id;
fails(() => R.shareRfiResponse(R.recordRfiResponse(sent(mech, mid), proc, mid, { text: "25 tons.", by: "" }, at), proc, mid, at), "rfi", /No subcontractors/);
let dq = R.raiseSubcontractorQuestion(s, proc, { invitationId: "inv-1", company: "Capital Demolition", title: "Is slab removal ours?" }, at);
dq = R.approveIssue(dq, dq.issues.at(-1).id, "Safi", at);
dq = R.createRfi(dq, { issueIds: [dq.issues.at(-1).id], question: "Slab removal?", to: architect }, "Safi", at);
const dqid = dq.rfis.at(-1).id;
const declined = { ...proc, invitations: proc.invitations.map(i => i.id === "inv-1" ? { ...i, status: "declined" } : i) };
dq = R.shareRfiResponse(R.recordRfiResponse(sent(dq, dqid), declined, dqid, { text: "Yes.", by: "" }, at), declined, dqid, at);
assert.deepEqual(dq.rfis.at(-1).shares.map(x => x.bidderId), ["b1"]);
assert.deepEqual(R.portalRfis(dq, "b1").shared.map(r => r.number), ["RFI-001", "RFI-002"]);

// Marcel's RFI log columns.
assert.deepEqual(R.rfiLog(s), [{ rfiId: rfi.id, number: "RFI-001", discipline: "07 · Roofing", question: "Please detail roof anchors and confirm the D-104 rating.", submittedBy: "Safi", dateSubmitted: "2026-09-30", response: "Anchors per new detail 5/A-503. D-104 is 45-minute rated.", responseDate: "2026-09-30", status: "closed" }]);
assert(R.markRfiNotificationsRead(s, s.notifications.map(n => n.id)).notifications.every(n => n.read));

console.log(`Structor Check & RFIs checked: ${base.issues.length} sample issues, filters, contractor review gate (issues + RFI approval), combine, team/email/subcontractor issues, RFI package-approve-send-answer-share-close, portal view, RFI log.`);
