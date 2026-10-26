import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { addScope, approveScope, bidForm, editScope, moveScope, publishPackage } = await import("../lib/procurement.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const {
  MAX_ATTACHMENTS, SubmissionRuleError, addAttachment, bidExceptions, hasUnsubmittedChanges, invitationIssues, isStale, latestRevision,
  openSubmission, removeAttachment, revisionChanges, sanitizeBidContent, setResponse, submitBid, updateDraft, validateSubmission,
} = await import("../lib/submissions.ts");
const { attachmentStorageKey } = await import("../lib/submission-api.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-26T12:00:00.000Z";
const later = "2026-09-27T09:00:00.000Z";
const fields = (issues) => issues.map(i => i.field);
const rule = (fn, field, pattern) => assert.throws(fn, e => e instanceof SubmissionRuleError && e.issues.some(i => i.field === field && pattern.test(i.message)));
const approveAll = (s, pkg) => bidForm(s, pkg).reduce((acc, item) => approveScope(acc, item.id, "Sadie", at), s);

// Jelleff: publish demolition (inv-1, Capital Demolition, bidding). Structural steel stays unpublished; mechanical's invitee declined.
const proc = freeze(publishPackage(approveAll(structuredClone(sampleProcurement), "demolition"), "demolition", "Sadie", at));
const withMechanical = freeze(publishPackage(approveAll(proc, "mechanical"), "mechanical", "Victor", at));
const who = { name: "  Michael Brooks ", email: "michael@example.com " };
const input = { projectId: "jelleff", invitationId: "inv-1" };

// Which invitations may bid.
assert.deepEqual(invitationIssues(proc, "inv-1"), []);
rule(() => openSubmission([], proc, { ...input, invitationId: "inv-3" }), "form", /Structural steel bid form has not been published/);
rule(() => openSubmission([], withMechanical, { ...input, invitationId: "inv-4" }), "invitation", /declined/);
rule(() => openSubmission([], proc, { ...input, invitationId: "nope" }), "invitation", /no longer exists/);

// Opening creates one blank answer per bid-form item; opening again changes nothing.
let subs = freeze(openSubmission([], proc, input, at));
const [sub] = subs;
const form = bidForm(proc, "demolition");
assert.deepEqual([sub.projectId, sub.packageId, sub.invitationId, sub.bidderId, sub.status], ["jelleff", "demolition", "inv-1", "b1", "draft"]);
assert.deepEqual(sub.draft.responses, form.map(item => ({ scopeItemId: item.id, answer: null, note: "" })));
assert.equal(openSubmission(subs, proc, input, later), subs, "Reopening an up-to-date draft is a no-op");
assert.deepEqual(startingDraft("p2", "submissions", []), [], "A new project has no submissions");

// An empty draft fails on price, every answer, and the submitter — all reported at once.
const empty = validateSubmission(sub, proc, { name: "", email: "nope" });
assert.deepEqual([...new Set(fields(empty))].sort(), ["baseBid", "responses", "submitter"]);
assert.equal(empty.filter(i => i.field === "responses").length, form.length, "One issue per unanswered item, each naming its item");
assert(empty.every(i => i.field !== "responses" || form.some(item => item.id === i.scopeItemId)));
rule(() => submitBid(subs, proc, sub.id, who, at), "baseBid", /greater than zero/);

// Answers: P and N/A need a note; N does not. Unknown items are rejected.
const [a, b, c, d] = form.map(item => item.id);
subs = freeze([a, b].reduce((s, id) => setResponse(s, sub.id, id, "Y", "", at), subs));
subs = freeze(setResponse(subs, sub.id, c, "N", "", at));
subs = freeze(setResponse(subs, sub.id, d, "P", "  ", at));
rule(() => setResponse(subs, sub.id, "scope-x", "Y"), "form", /not in this bid form/);
subs = freeze(updateDraft(subs, sub.id, { baseBid: 498000, exclusions: ["  ", "Existing slab removal"], clarifications: ["Night work excluded."] }, at));
assert.deepEqual(subs[0].draft.exclusions, ["Existing slab removal"], "Blank lines are dropped");
let issues = validateSubmission(subs[0], proc, who);
assert.deepEqual(issues.map(i => [i.field, i.scopeItemId]), [["responses", d]]);
assert.match(issues[0].message, /Explain the partial answer/);
subs = freeze(setResponse(subs, sub.id, d, "P", "Salvage only; disposal by others.", at));
assert.deepEqual(validateSubmission(subs[0], proc, who), []);
assert(validateSubmission(setResponse(subs, sub.id, d, "N/A", "", at)[0], proc, who).some(i => /not applicable/.test(i.message)));
rule(() => updateDraft(subs, sub.id, { baseBid: -1 }), "baseBid", /negative/);

// Alternates need a description and a positive amount.
const alts = updateDraft(subs, sub.id, { alternates: [{ id: "alt-1", kind: "deduct", description: " ", amount: 0 }] }, at)[0];
assert.deepEqual(validateSubmission(alts, proc, who).map(i => [i.field, i.index]), [["alternates", 0], ["alternates", 0]]);

// Attachments: allowed types, size limits, count limit; details only (no bytes yet).
subs = freeze(addAttachment(subs, sub.id, { name: "Capital Demolition proposal.PDF", size: 2_400_000, type: "application/pdf" }, at));
assert.deepEqual([subs[0].draft.attachments[0].name, subs[0].draft.attachments[0].storageKey], ["Capital Demolition proposal.PDF", null]);
rule(() => addAttachment(subs, sub.id, { name: "setup.exe", size: 10, type: "" }), "attachments", /attach a PDF/);
rule(() => addAttachment(subs, sub.id, { name: "empty.pdf", size: 0, type: "" }), "attachments", /empty/);
rule(() => addAttachment(subs, sub.id, { name: "huge.pdf", size: 51 * 1024 * 1024, type: "" }), "attachments", /50 MB/);
let full = subs;
for (let i = full[0].draft.attachments.length; i < MAX_ATTACHMENTS; i++) full = addAttachment(full, sub.id, { name: `p${i}.pdf`, size: 1, type: "" }, at);
rule(() => addAttachment(full, sub.id, { name: "one-more.pdf", size: 1, type: "" }), "attachments", /up to 20/);
assert.equal(removeAttachment(full, sub.id, full[0].draft.attachments[1].id, at)[0].draft.attachments.length, MAX_ATTACHMENTS - 1);
assert.equal(removeAttachment(subs, sub.id, "missing", at), subs);

// First submission: revision 1 is a frozen copy, not a reference to the draft.
subs = freeze(submitBid(subs, proc, sub.id, who, at));
const rev1 = latestRevision(subs[0]);
assert.deepEqual([subs[0].status, rev1.number, rev1.formVersion, rev1.baseBid, rev1.submitter], ["submitted", 1, 1, 498000, { name: "Michael Brooks", email: "michael@example.com" }]);
assert(rev1.responses !== subs[0].draft.responses && rev1.attachments !== subs[0].draft.attachments);
assert.equal(hasUnsubmittedChanges(subs[0]), false);
rule(() => submitBid(subs, proc, sub.id, who, later), "revision", /Nothing has changed since revision 1/);
assert.deepEqual(bidExceptions(rev1).map(r => [r.scopeItemId, r.answer]), [[c, "N"], [d, "P"]], "The estimator sees every answer other than Y");

// A price change is revision 2, "revised", with the difference reported.
subs = freeze(updateDraft(subs, sub.id, { baseBid: 512000 }, later));
assert.equal(hasUnsubmittedChanges(subs[0]), true);
subs = freeze(setResponse(subs, sub.id, c, "Y", "", later));
subs = freeze(submitBid(subs, proc, sub.id, who, later));
assert.deepEqual([subs[0].status, subs[0].revisions.length], ["revised", 2]);
assert.equal(subs[0].revisions[0].baseBid, 498000, "Earlier revisions are never rewritten");
const changes = revisionChanges(subs[0].revisions[0], subs[0].revisions[1]);
assert.deepEqual([changes.baseBidDelta, changes.changedResponses, changes.exclusionsChanged, changes.attachmentsChanged], [14000, [c], false, false]);

// The GC revises the form: the submitted price is now stale; reopening aligns the draft.
let proc2 = addScope(proc, { packageId: "demolition", title: "Remove the existing ceiling grid." }, "Sadie", later);
proc2 = freeze(publishPackage(approveAll(proc2, "demolition"), "demolition", "Sadie", later));
assert.equal(isStale(subs[0], proc2), true);
const newItem = bidForm(proc2, "demolition").at(-1).id;
assert(validateSubmission(subs[0], proc2, who).some(i => i.scopeItemId === newItem), "The new item must be answered");
subs = freeze(openSubmission(subs, proc2, input, later));
assert.deepEqual(subs[0].draft.responses.map(r => r.scopeItemId), bidForm(proc2, "demolition").map(i => i.id), "Draft follows the new form; existing answers kept");
assert.equal(subs[0].draft.responses.find(r => r.scopeItemId === a).answer, "Y");
subs = freeze(submitBid(setResponse(subs, sub.id, newItem, "Y", "", later), proc2, sub.id, who, later));
assert.deepEqual([latestRevision(subs[0]).formVersion, isStale(subs[0], proc2)], [2, false]);
// Resubmitting identical content against a NEWER form version is allowed (it confirms the price).
const proc3 = freeze(publishPackage(approveAll(editScope(proc2, a, { detail: "Include mezzanine partitions." }, "Sadie", later), "demolition"), "demolition", "Sadie", later));
assert.equal(submitBid(subs, proc3, sub.id, who, later)[0].revisions.length, 4);
// An item moved out of the form leaves a stray answer until the draft is reopened.
const proc4 = freeze(publishPackage(approveAll(moveScope(proc3, d, "concrete", "Sadie", later), "demolition"), "demolition", "Sadie", later));
assert(validateSubmission(subs[0], proc4, who).some(i => i.field === "form" && /no longer in it/.test(i.message)));
assert(!openSubmission(subs, proc4, input, later)[0].draft.responses.some(r => r.scopeItemId === d));

// A submission that no longer matches its invitation is refused.
assert.deepEqual(fields(validateSubmission({ ...subs[0], bidderId: "b2" }, proc, who)), ["invitation"]);

// Untrusted input (request bodies) is reduced to a well-formed shape.
const clean = sanitizeBidContent({
  baseBid: "1000", exclusions: [" a ", 5, null, ""], clarifications: "not a list",
  responses: [{ scopeItemId: "x", answer: "MAYBE", note: 7 }, { scopeItemId: "x", answer: "Y" }, { answer: "Y" }],
  alternates: [{ kind: "weird", description: " d ", amount: "5" }],
  attachments: [{ name: "ok.pdf", size: 3, storageKey: 9 }, { name: "nosize.pdf" }], __proto__: { polluted: true },
});
assert.deepEqual({ ...clean, alternates: clean.alternates.map(({ id, ...rest }) => rest), attachments: clean.attachments.map(({ id, ...rest }) => rest) }, {
  baseBid: null, exclusions: ["a"], clarifications: [], responses: [{ scopeItemId: "x", answer: null, note: "" }],
  alternates: [{ kind: "add", description: "d", amount: 0 }], attachments: [{ name: "ok.pdf", size: 3, type: "", addedAt: "", storageKey: null }],
});
assert.equal({}.polluted, undefined);
assert.deepEqual(sanitizeBidContent(null).responses, []);

// Storage keys cannot escape their folder.
assert.equal(attachmentStorageKey("jelleff", "s1", { id: "a1", name: "../../etc/passwd Proposal (v2).pdf" }), "projects/jelleff/submissions/s1/a1-etc-passwd-Proposal-v2-.pdf");
assert.throws(() => attachmentStorageKey("../other", "s1", { id: "a1", name: "x.pdf" }), /unsafe id/);

console.log(`Submissions checked: invitation rules, per-item answers, notes for P and N/A, attachments, revisions and stale forms, untrusted input, storage keys.`);
