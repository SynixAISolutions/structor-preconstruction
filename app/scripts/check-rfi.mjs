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

// Sample and empty projects.
assert.deepEqual(base.issues.map(i => [i.number, i.severity, i.status, i.origin, i.packageId]), [
  ["SC-001", "high", "open", "ai", "thermal"], ["SC-002", "high", "open", "ai", "openings"], ["SC-003", "medium", "open", "ai", "drywall"],
  ["SC-004", "high", "open", "ai", "mechanical"], ["SC-005", "medium", "resolved", "ai", "thermal"],
]);
assert.deepEqual(startingDraft("p2", "structor-check-state", sampleStructorCheck), R.EMPTY_STRUCTOR_CHECK, "A new project starts with an empty log");

// The table: filters, search, order.
assert.deepEqual(R.filterIssues(base, { trade: "08 · Openings" }).map(i => i.number), ["SC-002"]);
assert.deepEqual(R.filterIssues(base, { severity: "high" }).map(i => i.number).sort(), ["SC-001", "SC-002", "SC-004"]);
assert.deepEqual(R.filterIssues(base, { status: "resolved" }).map(i => i.number), ["SC-005"]);
assert.deepEqual(R.filterIssues(base, { query: "d-104" }).map(i => i.number), ["SC-002"]);
assert.deepEqual(R.filterIssues(base, { origin: "team" }), []);
assert(R.filterIssues(base).every((i, n, all) => n === 0 || ({ high: 0, medium: 1, low: 2 })[all[n - 1].severity] <= ({ high: 0, medium: 1, low: 2 })[i.severity]), "Most severe first");
assert.deepEqual(R.issueTrades(base), ["07 · Envelope", "07 · Roofing", "08 · Openings", "09 · Finishes", "23 · HVAC"]);

// The team's own issues; editing, resolving, dismissing, reopening.
fails(() => R.addIssue(base, { title: " ", severity: "urgent" }, "Safi", at), "title", /Describe/);
fails(() => R.addIssue(base, { title: "x", severity: "urgent" }, "Safi", at), "severity", /high, medium, or low/);
let s = freeze(R.addIssue(base, { title: "  Confirm gym floor transition detail ", severity: "low", trade: "09 · Finishes", source: "A-501" }, "Vijay", at));
const own = s.issues.at(-1);
assert.deepEqual([own.number, own.title, own.origin, own.raisedBy, own.category, own.status], ["SC-006", "Confirm gym floor transition detail", "team", "Vijay", "Question", "open"]);
assert.equal(R.addIssue({ ...s, lastIssueNumber: 9 }, { title: "x", severity: "low" }, "Safi", at).issues.at(-1).number, "SC-010", "Numbers follow the counter, never reused");
assert.equal(R.addIssue(s, { title: "From the architect's email", severity: "medium", origin: "email", raisedBy: "DLR" }, "Safi", at).issues.at(-1).origin, "email");
assert.equal(R.editIssue(s, own.id, { severity: "high" }, at).issues.at(-1).severity, "high");
fails(() => R.closeIssue(s, own.id, "resolved", " ", "Safi", at), "note", /Write the answer/);
const dismissed = R.closeIssue(s, own.id, "dismissed", "Shown on A-502", "Safi", at);
assert.deepEqual([dismissed.issues.at(-1).status, dismissed.issues.at(-1).resolution.note, dismissed.notifications.length], ["dismissed", "Shown on A-502", 0]);
fails(() => R.editIssue(dismissed, own.id, { title: "x" }, at), "issue", /dismissed/);
assert.equal(R.reopenIssue(dismissed, own.id, at).issues.at(-1).status, "open");

// A subcontractor's question from the portal joins the same log; the package owner is told.
fails(() => R.raiseSubcontractorQuestion(base, proc, { invitationId: "inv-4", company: "Metro Mechanical", title: "x" }, at), "invitation", /active invitation/);
s = freeze(R.raiseSubcontractorQuestion(s, proc, { invitationId: "inv-1", company: "Capital Demolition", title: "Is slab removal in our scope?", source: "AD-101" }, at));
const question = s.issues.at(-1);
assert.deepEqual([question.number, question.origin, question.bidderId, question.packageId, question.trade, question.raisedBy], ["SC-007", "subcontractor", "b1", "demolition", "02 · Demolition", "Capital Demolition"]);
assert.deepEqual(s.notifications.map(n => [n.kind, n.recipientType, n.recipient]), [["question-raised", "team", "Safi"]]);
const answered = R.closeIssue(s, question.id, "resolved", "Yes, per AD-101 note 4.", "Safi", at);
assert.deepEqual([answered.notifications.at(-1).kind, answered.notifications.at(-1).recipientType, answered.notifications.at(-1).recipient], ["question-resolved", "bidder", "b1"], "The subcontractor gets the answer");

// Packaging issues into an RFI.
const [sc1, sc2, sc4] = ["SC-001", "SC-002", "SC-004"].map(n => byNumber(s, n).id);
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

// Send (recorded), answer, share with the bidders of the affected trades, close.
fails(() => R.recordRfiResponse(s, proc, rfi.id, { text: "x", by: "DLR" }, at), "rfi", /Send the RFI/);
fails(() => R.sendRfi(R.editRfi(s, rfi.id, { to: { ...architect, email: "" } }, at), rfi.id, "Safi", at), "email", /email address before sending/);
s = freeze(R.sendRfi(s, rfi.id, "Safi", at));
assert.deepEqual([s.rfis[0].status, s.rfis[0].sentBy, s.notifications.at(-1).recipientType, s.notifications.at(-1).recipient], ["sent", "Safi", "design-team", "architect@example.com"]);
fails(() => R.editRfi(s, rfi.id, { question: "x" }, at), "rfi", /has been sent/);
fails(() => R.sendRfi(s, rfi.id, "Safi", at), "rfi", /already sent/);
fails(() => R.discardRfi(s, rfi.id, at), "rfi", /stays in the log/);
assert.deepEqual(R.checkSummary(s, "2026-10-06"), { open: 4, openHigh: 1, inRfi: 2, awaitingResponse: 1, overdue: 1, answeredNotShared: 0 });
fails(() => R.closeRfi(s, rfi.id, "Safi", at), "rfi", /Only an answered RFI/);
fails(() => R.shareRfiResponse(s, proc, rfi.id, at), "rfi", /Record the design team's answer/);
fails(() => R.recordRfiResponse(s, proc, rfi.id, { text: " ", by: "DLR" }, at), "response", /Enter the design team's answer/);
s = freeze(R.recordRfiResponse(s, proc, rfi.id, { text: "Anchors per new detail 5/A-503. D-104 is 45-minute rated.", by: "" }, at));
rfi = s.rfis[0];
assert.deepEqual([rfi.status, rfi.response.by, s.notifications.slice(-2).map(n => n.recipient).sort()], ["answered", "Matt D.", ["Safi", "Vijay"]], "Owners of the roofing and openings packages are told");
s = freeze(R.shareRfiResponse(s, proc, rfi.id, at));
assert.deepEqual(s.rfis[0].shares.map(x => [x.bidderId, x.packageId]), [["b6", "openings"]], "Only the active invitee of an affected trade");
fails(() => R.shareRfiResponse(s, proc, rfi.id, at), "rfi", /already has this answer/);
s = freeze(R.closeRfi(s, rfi.id, "Safi", at));
assert.deepEqual([s.rfis[0].status, byNumber(s, "SC-001").status, byNumber(s, "SC-002").resolution.note.startsWith("Answered in RFI-001: Anchors")], ["closed", "resolved", true]);
fails(() => R.closeRfi(s, rfi.id, "Safi", at), "rfi", /already closed/);

// A subcontractor's question inside an RFI: they receive the shared answer too.
let q = R.createRfi(s, { issueIds: [question.id], question: "Is slab removal in the demolition scope?", to: architect }, "Safi", at);
const qid = q.rfis.at(-1).id;
q = R.shareRfiResponse(R.recordRfiResponse(R.sendRfi(q, qid, "Safi", at), proc, qid, { text: "Yes.", by: "DLR" }, at), proc, qid, at);
assert(q.rfis.at(-1).shares.some(x => x.bidderId === "b1"), "Capital Demolition asked, so it is told");
// A declined invitee is not told; the subcontractor who asked is, even after declining.
const mech = R.createRfi(s, { issueIds: [byNumber(s, "SC-004").id], question: "Confirm RTU-2 capacity.", to: architect }, "Safi", at);
const mid = mech.rfis.at(-1).id;
fails(() => R.shareRfiResponse(R.recordRfiResponse(R.sendRfi(mech, mid, "Safi", at), proc, mid, { text: "25 tons.", by: "" }, at), proc, mid, at), "rfi", /No subcontractors/);
const declined = { ...proc, invitations: proc.invitations.map(i => i.id === "inv-1" ? { ...i, status: "declined" } : i) };
let dq = R.createRfi(s, { issueIds: [question.id], question: "Slab removal?", to: architect }, "Safi", at);
const dqid = dq.rfis.at(-1).id;
dq = R.shareRfiResponse(R.recordRfiResponse(R.sendRfi(dq, dqid, "Safi", at), declined, dqid, { text: "Yes.", by: "" }, at), declined, dqid, at);
assert.deepEqual(dq.rfis.at(-1).shares.map(x => x.bidderId), ["b1"]);
const portal = R.portalRfis(q, "b1");
assert.deepEqual([portal.questions.length, portal.questions[0].rfi.number, portal.shared.map(r => r.number)], [1, "RFI-002", ["RFI-002"]]);

// Marcel's RFI log columns.
assert.deepEqual(R.rfiLog(s), [{ rfiId: rfi.id, number: "RFI-001", discipline: "07 · Roofing", question: "Please detail roof anchors and confirm the D-104 rating.", submittedBy: "Safi", dateSubmitted: "2026-09-30", response: "Anchors per new detail 5/A-503. D-104 is 45-minute rated.", responseDate: "2026-09-30", status: "closed" }]);
assert(R.markRfiNotificationsRead(s, s.notifications.map(n => n.id)).notifications.every(n => n.read));

console.log(`Structor Check & RFIs checked: ${base.issues.length} sample issues, filters, team/email/subcontractor issues, RFI package-send-answer-share-close, portal view, RFI log.`);
