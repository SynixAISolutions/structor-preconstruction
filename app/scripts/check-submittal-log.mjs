import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/submittals.ts");
const { sampleSubmittals } = await import("../lib/data/submittals.ts");
const { sampleAwards } = await import("../lib/data/sample-award.ts");
const { awardStage } = await import("../lib/award.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { initialSpecs } = await import("../lib/data/preconstruction.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof S.SubmittalRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const proc = freeze(structuredClone(sampleProcurement));
const base = freeze(structuredClone(sampleSubmittals));
const today = "2026-10-02", at = "2026-10-01T15:00:00.000Z";
const by = (s, number) => s.submittals.find(x => x.number === number);
const idOf = (s, number) => by(s, number).id;
const pdf = (name, size = 1000) => ({ name, size, type: "application/pdf" });
const architect = { name: "Project architect", company: "DLR Group", email: "architect@example.com" };
const b2 = { bidderId: "b2", company: "District Concrete", contact: "Sarah Chen", email: "sarah@example.com", awardId: null };

// ── Sample: 14 spec-matrix requirements + 2 more for concrete, the one awarded trade ──
assert.deepEqual([...base.submittals].sort((x, y) => x.number.localeCompare(y.number)).map(s => [s.number, s.status]), [
  ["03 30 00-01", "contractor-review"], ["03 30 00-02", "requested"], ["03 30 00-03", "with-architect"], ["03 30 00-04", "closed"],
  ["04 22 00-01", "draft"], ["04 22 00-02", "draft"], ["07 54 23-01", "draft"], ["07 54 23-02", "draft"],
  ["08 11 13-01", "draft"], ["08 11 13-02", "draft"], ["09 29 00-01", "draft"], ["09 29 00-02", "draft"],
  ["09 65 19-01", "draft"], ["09 65 19-02", "draft"], ["23 73 13-01", "draft"], ["23 73 13-02", "draft"],
]);
// Coherent with the award records: every assigned submittal belongs to the executed Concrete award, and was requested after it.
const concreteAward = sampleAwards.awards[0];
assert.deepEqual([concreteAward.packageId, concreteAward.bidderId, awardStage(concreteAward)], ["concrete", "b2", "executed"]);
const assigned = base.submittals.filter(x => x.subcontractor);
assert.deepEqual(assigned.map(x => x.number), ["03 30 00-01", "03 30 00-02", "03 30 00-03", "03 30 00-04"]);
assert(assigned.every(x => x.subcontractor.awardId === concreteAward.id && x.subcontractor.bidderId === concreteAward.bidderId && x.subcontractor.company === concreteAward.snapshot.company.name));
assert(assigned.every(x => x.history.filter(e => e.kind !== "created").every(e => e.at > concreteAward.subcontract.executedAt)), "Nothing happens before the subcontract is executed");
assert(base.submittals.every(s => /^sub-\d{6}-\d\d$/.test(s.id)) && base.notifications.every((n, i) => n.id === `sn-${i + 1}`), "Fixed sample ids");
assert.equal(new Set(base.submittals.flatMap(s => s.revisions.flatMap(r => r.files.map(f => f.id)))).size, 4, "Fixed, unique file ids");
assert.deepEqual(by(base, "03 30 00-01").revisions.map(r => [r.number, r.response?.action ?? null, !!r.returned]), [[0, "revise-and-resubmit", true], [1, null, false]], "The mix design went round once");
assert.deepEqual([base.architect, base.sequences.length], [architect, 7]);
assert.deepEqual(startingDraft("p2", "submittal-log", sampleSubmittals), S.EMPTY_SUBMITTALS, "A new project starts with an empty log and no architect");

// ── Log, holder, next action, due state ──
const log = S.submittalLog(base, proc, today);
const row = (n) => log.find(r => r.number === n);
assert.deepEqual(row("03 30 00-01"), {
  id: "sub-033000-01", number: "03 30 00-01", specSection: "03 30 00", title: "Mix design", packageId: "concrete", packageName: "Concrete",
  subcontractor: "District Concrete", bidderId: "b2", status: "contractor-review", revision: 1, party: "contractor", nextAction: "Review revision 1",
  due: "", overdue: false, daysOverdue: 0, architectAction: "revise-and-resubmit", updatedAt: "2026-10-01T15:00:00.000Z",
});
assert.deepEqual([row("03 30 00-02").party, row("03 30 00-02").nextAction, row("03 30 00-02").overdue, row("03 30 00-02").daysOverdue], ["subcontractor", "Submit", true, 2]);
assert.deepEqual([row("03 30 00-03").party, row("03 30 00-03").due, row("03 30 00-03").overdue], ["architect", "2026-10-13", false]);
assert.deepEqual([row("03 30 00-04").party, row("03 30 00-04").nextAction, row("03 30 00-04").architectAction], [null, "Complete", "approved-as-noted"]);
assert.deepEqual([row("04 22 00-01").party, row("04 22 00-01").nextAction, row("04 22 00-01").subcontractor], ["contractor", "Assign the awarded subcontractor", ""]);
assert.equal(S.isOverdue(by(base, "03 30 00-02"), "2026-09-30"), false, "Due today is not overdue");
assert.deepEqual(S.submittalSummary(base, today), { total: 16, needsAssignment: 12, withContractor: 13, withSubcontractor: 1, withArchitect: 1, overdue: 1, closed: 1 });
assert.equal(S.submittalSummary(base, "2026-10-14").overdue, 2, "The architect is late too after 10-13");
const numbers = (rows) => rows.map(r => r.number);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { party: "subcontractor" }, today)), ["03 30 00-02"]);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { party: "none" }, today)), ["03 30 00-04"]);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { overdue: true }, today)), ["03 30 00-02"]);
const concrete4 = ["03 30 00-01", "03 30 00-02", "03 30 00-03", "03 30 00-04"];
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { packageId: "concrete" }, today)), concrete4);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { packageId: "electrical" }, today)), []);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { bidderId: "b2", status: "requested" }, today)), ["03 30 00-02"]);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { bidderId: "b2" }, today)), concrete4);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { bidderId: "b5" }, today)), []);
assert.deepEqual(numbers(S.submittalLog(S.addRequirement(base, proc, { specSection: "03 30 00", title: "Curing compound data", packageId: "concrete" }, "Vijay", at), proc, today)).slice(0, 6), ["03 30 00-01", "03 30 00-02", "03 30 00-03", "03 30 00-04", "03 30 00-05", "04 22 00-01"], "The log is in number order");
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { specSection: "09 29 00" }, today)), ["09 29 00-01", "09 29 00-02"]);
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { query: "district" }, today)), concrete4, "Searches the subcontractor");
assert.deepEqual(numbers(S.filterSubmittals(base, proc, { query: "drywall" }, today)), ["09 29 00-01", "09 29 00-02"], "Searches the trade");

// ── Requirements from the spec matrix and by hand ──
const fresh = S.requirementsFromSpecs(S.EMPTY_SUBMITTALS, proc, initialSpecs, "Vijay", at);
assert.equal(fresh.submittals.length, 14, "Mix design · Test reports → two requirements, for each of 7 rows");
assert.deepEqual((({ specSection, title, packageId, owner, specItemId, description, status }) => ({ specSection, title, packageId, owner, specItemId, description, status }))(fresh.submittals[0]),
  { specSection: "03 30 00", title: "Mix design", packageId: "concrete", owner: "Vijay", specItemId: "p1", description: "Cast-in-place concrete: 4,000 PSI normal-weight concrete", status: "draft" });
assert.equal(S.requirementsFromSpecs(fresh, proc, initialSpecs, "Vijay", at).submittals.length, 14, "Importing again adds nothing");
fails(() => S.requirementsFromSpecs(S.EMPTY_SUBMITTALS, proc, [{ ...initialSpecs[0], section: "10 14 00" }], "Vijay", at), "packageId", /10 14 00/);
fails(() => S.addRequirement(base, proc, { specSection: "3300", title: "x", packageId: "concrete" }, "Vijay", at), "specSection", /like 03 30 00/);
fails(() => S.addRequirement(base, proc, { specSection: "03 30 00", title: " ", packageId: "concrete" }, "Vijay", at), "title", /what must be submitted/);
fails(() => S.addRequirement(base, proc, { specSection: "03 30 00", title: "x", packageId: "nope" }, "Vijay", at), "packageId", /trade package/);
fails(() => S.addRequirement(base, proc, { specSection: "03 30 00", title: "mix DESIGN", packageId: "concrete" }, "Vijay", at), "title", /already required/);
fails(() => S.addRequirement(base, proc, { specSection: "03 30 00", title: "x", packageId: "concrete" }, " ", at), "by", /who/);
let s = freeze(S.addRequirement(base, proc, { specSection: "04 22 00", title: "  Mortar color samples ", packageId: "masonry" }, "Naija", at));
assert.deepEqual([s.submittals.at(-1).number, s.submittals.at(-1).title, s.submittals.at(-1).owner], ["04 22 00-03", "Mortar color samples", "Naija"]);
const removed = S.removeRequirement(s, s.submittals.at(-1).id);
assert.equal(S.addRequirement(removed, proc, { specSection: "04 22 00", title: "Grout mix", packageId: "masonry" }, "Naija", at).submittals.at(-1).number, "04 22 00-04", "Numbers are never reused");
fails(() => S.removeRequirement(base, idOf(base, "03 30 00-02")), "submittal", /stays in the log/);

// ── Assigning the awarded subcontractor ──
const keystone = { bidderId: "b7", company: "Keystone Masonry", contact: "Ana Ruiz", email: "ana@example.com", awardId: null };
fails(() => S.assignSubcontractor(s, "masonry", { ...keystone, company: " " }, "Naija", at), "subcontractor", /awarded subcontractor/);
fails(() => S.assignSubcontractor(s, "masonry", { ...keystone, email: "ana@" }, "Naija", at), "email", /valid email/);
fails(() => S.assignSubcontractor(s, "steel", keystone, "Naija", at), "submittal", /no submittals waiting/);
fails(() => S.assignSubcontractor(base, "concrete", keystone, "Naija", at), "submittal", /no submittals waiting/, "Requested submittals keep their subcontractor");
s = freeze(S.assignSubcontractor(s, "masonry", keystone, "Naija", at));
assert.deepEqual(s.submittals.filter(x => x.packageId === "masonry").map(x => [x.subcontractor.company, x.history.at(-1).kind]), [["Keystone Masonry", "assigned"], ["Keystone Masonry", "assigned"], ["Keystone Masonry", "assigned"]]);
assert.equal(by(s, "07 54 23-01").subcontractor, null, "Other trades untouched");
const award = { id: "aw-1", packageId: "thermal", bidderId: "b8", cancelled: null, snapshot: { company: { name: "Tri-State Roofing", contact: "Lee Park", email: "lee@example.com" } } };
const fromAward = S.assignFromAward(s, award, "Vijay", at);
assert.deepEqual(by(fromAward, "07 54 23-01").subcontractor, { bidderId: "b8", company: "Tri-State Roofing", contact: "Lee Park", email: "lee@example.com", awardId: "aw-1" });
assert.deepEqual(S.portalSubmittals(fromAward, "b8"), [], "Assigned but not requested yet: nothing in the portal");
fails(() => S.assignFromAward(s, { ...award, cancelled: { by: "Vijay", at, reason: "x" } }, "Vijay", at), "award", /cancelled/);

// ── Requesting ──
fails(() => S.requestSubmittal(s, idOf(s, "07 54 23-01"), "2026-10-15", "Vijay", at), "subcontractor", /Assign/);
fails(() => S.requestSubmittal(s, idOf(s, "04 22 00-01"), "next week", "Naija", at), "due", /due date/);
fails(() => S.requestSubmittal(s, idOf(s, "04 22 00-01"), "2026-11-31", "Naija", at), "due", /Choose a due date/);
fails(() => S.requestSubmittal(s, idOf(s, "04 22 00-01"), "2026-13-01", "Naija", at), "due", /Choose a due date/);
fails(() => S.requestSubmittal(s, idOf(s, "04 22 00-01"), "2026-09-30", "Naija", at), "due", /past/);
fails(() => S.requestSubmittal(s, idOf(s, "03 30 00-02"), "2026-10-15", "Vijay", at), "submittal", /already requested/);
fails(() => S.requestPackage(s, "thermal", "2026-10-15", "Vijay", at), "submittal", /Nothing in this package/);
s = freeze(S.requestPackage(s, "masonry", "2026-10-15", "Naija", at));
const masonry = s.submittals.filter(x => x.packageId === "masonry");
assert(masonry.every(x => x.status === "requested" && x.due === "2026-10-15"));
assert.deepEqual(s.notifications.slice(-3).map(n => [n.kind, n.recipientType, n.recipient]), [["requested", "bidder", "b7"], ["requested", "bidder", "b7"], ["requested", "bidder", "b7"]]);
assert.match(s.notifications.at(-1).text, /Please submit 04 22 00-03 Mortar color samples by 2026-10-15/);

// ── Submitting ──
const m1 = idOf(s, "04 22 00-01");
fails(() => S.submitRevision(fresh, fresh.submittals[0].id, { files: [pdf("a.pdf")] }, "Ana", at), "submittal", /isn't waiting for a submission/);
fails(() => S.submitRevision(s, m1, { files: [] }, "Ana Ruiz", at), "files", /at least one/);
fails(() => S.submitRevision(s, m1, { files: Array.from({ length: 21 }, (_, i) => pdf(`f${i}.pdf`)) }, "Ana Ruiz", at), "files", /at most 20/);
fails(() => S.submitRevision(s, m1, { files: [pdf(" ")] }, "Ana Ruiz", at), "files", /needs a name/);
fails(() => S.submitRevision(s, m1, { files: [pdf("big.pdf", 51 * 1024 * 1024)] }, "Ana Ruiz", at), "files", /under 50 MB/);
fails(() => S.submitRevision(s, m1, { files: [pdf("a.pdf", -1)] }, "Ana Ruiz", at), "files", /under 50 MB/);
s = freeze(S.submitRevision(s, m1, { files: [pdf(" CMU data.pdf ")], note: " Type 1 units. " }, "Ana Ruiz", at));
const sub1 = by(s, "04 22 00-01");
assert.deepEqual([sub1.status, sub1.due, sub1.revisions[0].number, sub1.revisions[0].files[0].name, sub1.revisions[0].note, sub1.revisions[0].submittedBy], ["contractor-review", "", 0, "CMU data.pdf", "Type 1 units.", "Ana Ruiz"]);
assert.deepEqual([s.notifications.at(-1).kind, s.notifications.at(-1).recipientType, s.notifications.at(-1).recipient], ["submitted", "team", "Naija"]);

// ── The contractor reviews before the architect ──
fails(() => S.sendToArchitect(s, m1, { to: architect, due: "2026-10-15" }, "Naija", at), "submittal", /must review/);
fails(() => S.sendToArchitect(s, idOf(s, "04 22 00-02"), { to: architect, due: "2026-10-15" }, "Naija", at), "submittal", /isn't ready to send/);
fails(() => S.reviewSubmittal(s, m1, "maybe", {}, "Naija", at), "decision", /Approve/);
fails(() => S.reviewSubmittal(s, m1, "return", { due: "2026-10-08" }, "Naija", at), "note", /what the subcontractor must correct/);
fails(() => S.reviewSubmittal(s, m1, "return", { note: "Wrong unit type." }, "Naija", at), "due", /due date/);
const back = freeze(S.reviewSubmittal(s, m1, "return", { note: " Wrong unit type. ", due: "2026-10-08" }, "Naija", at));
assert.deepEqual([by(back, "04 22 00-01").status, by(back, "04 22 00-01").due, by(back, "04 22 00-01").revisions[0].review.decision], ["resubmit", "2026-10-08", "return"]);
assert.match(back.notifications.at(-1).text, /needs changes before it goes to the architect: Wrong unit type\. Resubmit by 2026-10-08/);
assert.equal(S.portalSubmittals(back, "b7").find(p => p.number === "04 22 00-01").revisions[0].contractorNote, "Wrong unit type.");
const resubmitted = S.submitRevision(back, m1, { files: [pdf("CMU data rev 1.pdf")] }, "Ana Ruiz", at);
assert.deepEqual(by(resubmitted, "04 22 00-01").revisions[0], by(back, "04 22 00-01").revisions[0], "Earlier revisions never change");
assert.equal(by(resubmitted, "04 22 00-01").revisions[1].number, 1);
s = freeze(S.reviewSubmittal(s, m1, "approve", { note: "OK" }, "Naija", at));
assert.equal(by(s, "04 22 00-01").status, "ready-to-send");
fails(() => S.reviewSubmittal(s, m1, "approve", {}, "Naija", at), "submittal", /isn't waiting for the contractor/);

// ── The architect ──
fails(() => S.sendToArchitect({ ...s, architect: null }, m1, { due: "2026-10-15" }, "Naija", at), "to", /who the architect is/);
fails(() => S.sendToArchitect(s, m1, { to: { ...architect, email: "nope" }, due: "2026-10-15" }, "Naija", at), "email", /architect's email/);
fails(() => S.sendToArchitect(s, m1, { due: "" }, "Naija", at), "due", /due date/);
s = freeze(S.sendToArchitect(s, m1, { due: "2026-10-15" }, "Naija", at));
assert.deepEqual([by(s, "04 22 00-01").status, by(s, "04 22 00-01").due, by(s, "04 22 00-01").revisions[0].sent.to.email], ["with-architect", "2026-10-15", "architect@example.com"], "Defaults to the project's architect");
assert.deepEqual([s.notifications.at(-1).recipientType, s.notifications.at(-1).recipient], ["architect", "architect@example.com"]);
const newArchitect = S.sendToArchitect(S.reviewSubmittal(S.submitRevision(s, idOf(s, "04 22 00-02"), { files: [pdf("x.pdf")] }, "Ana", at), idOf(s, "04 22 00-02"), "approve", {}, "Naija", at), idOf(s, "04 22 00-02"), { to: { name: "DLR Group", company: "DLR", email: " dlr@example.com " }, due: "2026-10-15" }, "Naija", at);
assert.deepEqual(newArchitect.architect, { name: "DLR Group", company: "DLR", email: "dlr@example.com" }, "The last architect used becomes the default");
fails(() => S.recordArchitectResponse(s, idOf(s, "04 22 00-03"), { action: "approved" }, "Naija", at), "submittal", /isn't with the architect/);
fails(() => S.recordArchitectResponse(s, m1, { action: "fine" }, "Naija", at), "action", /architect's action/);
fails(() => S.recordArchitectResponse(s, m1, { action: "rejected", comments: " " }, "Naija", at), "comments", /comments/);
const approved = S.recordArchitectResponse(s, m1, { action: "approved" }, "Naija", at);
assert.deepEqual([by(approved, "04 22 00-01").revisions[0].response.by, by(approved, "04 22 00-01").revisions[0].response.comments], ["Project architect", ""], "Approved needs no comments; by defaults to the addressee");
s = freeze(S.recordArchitectResponse(s, m1, { action: "revise-and-resubmit", comments: "Use split-face units.", files: [pdf("markup.pdf")], by: "DLR" }, "Naija", at));
assert.deepEqual([by(s, "04 22 00-01").status, by(s, "04 22 00-01").due, s.notifications.at(-1).recipient], ["response-received", "", "Naija"]);
assert.equal(S.portalSubmittals(s, "b7").find(p => p.number === "04 22 00-01").revisions[0].response, null, "Not shown to the subcontractor until it is returned");
fails(() => S.returnResponse(s, m1, {}, "Naija", at), "due", /due date/);
fails(() => S.returnResponse(s, idOf(s, "04 22 00-02"), {}, "Naija", at), "submittal", /no architect response/);
s = freeze(S.returnResponse(s, m1, { due: "2026-10-10" }, "Naija", at));
assert.deepEqual([by(s, "04 22 00-01").status, by(s, "04 22 00-01").due, by(s, "04 22 00-01").revisions[0].returned.by], ["resubmit", "2026-10-10", "Naija"]);
assert.match(s.notifications.at(-1).text, /revise and resubmit\. Use split-face units\. Resubmit by 2026-10-10/);
const portalRev = S.portalSubmittals(s, "b7").find(p => p.number === "04 22 00-01");
assert.deepEqual([portalRev.yourTurn, portalRev.status, portalRev.due, portalRev.revisions[0].response.action, portalRev.revisions[0].response.files[0].name], [true, "to-resubmit", "2026-10-10", "revise-and-resubmit", "markup.pdf"]);
const closed = S.returnResponse(approved, m1, {}, "Naija", at);
assert.deepEqual([by(closed, "04 22 00-01").status, by(closed, "04 22 00-01").due, S.nextStep(by(closed, "04 22 00-01"))], ["closed", "", { party: null, action: "Complete" }]);
let round2 = S.submitRevision(s, m1, { files: [pdf("r1.pdf")] }, "Ana", at);
round2 = S.reviewSubmittal(round2, m1, "approve", {}, "Naija", at);
round2 = S.sendToArchitect(round2, m1, { due: "2026-10-20" }, "Naija", at);
round2 = S.recordArchitectResponse(round2, m1, { action: "approved-as-noted", comments: "Seal joints." }, "Naija", at);
round2 = S.returnResponse(round2, m1, {}, "Naija", at);
assert.deepEqual([by(round2, "04 22 00-01").status, by(round2, "04 22 00-01").revisions.map(r => r.response.action)], ["closed", ["revise-and-resubmit", "approved-as-noted"]], "Approved as noted closes after the second round; both rounds kept");
assert.equal(S.submittalLog(round2, proc, today).find(r => r.number === "04 22 00-01").architectAction, "approved-as-noted", "The log shows the latest architect action");

// ── Reminders and overdue ──
fails(() => S.sendReminder(base, idOf(base, "03 30 00-01"), "Vijay", at), "submittal", /isn't waiting on the subcontractor or the architect/);
const toSub = S.sendReminder(base, idOf(base, "03 30 00-02"), "Vijay", at);
assert.deepEqual([toSub.notifications.at(-1).recipient, toSub.notifications.at(-1).text], ["b2", "Reminder: please submit 03 30 00-02 Test reports. It was due 2026-09-30."]);
const toArch = S.sendReminder(base, idOf(base, "03 30 00-03"), "Vijay", at);
assert.deepEqual([toArch.notifications.at(-1).recipientType, toArch.notifications.at(-1).recipient, toArch.notifications.at(-1).text], ["architect", "architect@example.com", "Reminder: please review 03 30 00-03 Shop drawings. It is due 2026-10-13."]);
const atToday = "2026-10-02T15:00:00.000Z";
const nudged = freeze(S.remindOverdue(base, today, "Structor", atToday));
assert.deepEqual(nudged.notifications.slice(base.notifications.length).map(n => [n.kind, n.recipient]), [["reminder", "b2"]], "Only the overdue one");
assert.equal(S.remindOverdue(nudged, today, "Structor", atToday), nudged, "Not twice the same day");
assert.equal(S.remindOverdue(base, "2026-10-01", "Structor", "2026-10-01T18:00:00.000Z"), base, "Already reminded that day");
assert.equal(S.remindOverdue(base, "2026-09-30", "Structor", "2026-09-30T18:00:00.000Z"), base, "Not overdue yet");
assert.deepEqual(S.remindOverdue(base, "2026-10-14", "Structor", "2026-10-14T15:00:00.000Z").notifications.slice(base.notifications.length).map(n => n.recipient), ["b2", "architect@example.com"]);
assert.equal(S.daysOverdue(by(base, "03 30 00-02"), "2026-10-11"), 11);

// ── Next action at every status ──
assert.deepEqual(S.nextStep({ ...by(base, "04 22 00-01"), subcontractor: b2 }), { party: "contractor", action: "Request from District Concrete" });
assert.deepEqual(S.nextStep(by(s, "04 22 00-01")), { party: "subcontractor", action: "Resubmit as revision 1" });
assert.deepEqual(S.nextStep(by(s, "04 22 00-03")), { party: "subcontractor", action: "Submit" });
assert.deepEqual(S.nextStep(by(base, "03 30 00-03")), { party: "architect", action: "Review revision 0" });
assert.deepEqual(S.nextStep(by(approved, "04 22 00-01")), { party: "contractor", action: "Return the architect's response to Keystone Masonry" });
assert.deepEqual(S.nextStep({ ...by(base, "03 30 00-01"), status: "ready-to-send" }), { party: "contractor", action: "Send to the architect" });

// ── The subcontractor's portal ──
const portal = S.portalSubmittals(base, "b2");
assert.deepEqual(portal.map(p => [p.number, p.status, p.yourTurn, p.due]), [["03 30 00-01", "in-review", false, ""], ["03 30 00-02", "to-submit", true, "2026-09-30"], ["03 30 00-03", "in-review", false, ""], ["03 30 00-04", "closed", false, ""]], "The architect's due date is not the subcontractor's");
assert.deepEqual(portal[0].revisions.map(r => r.response?.action ?? null), ["revise-and-resubmit", null]);
assert.deepEqual([portal[2].revisions[0].response, portal[3].revisions[0].response.action], [null, "approved-as-noted"], "Only returned responses are shown");
assert.deepEqual(S.portalSubmittals(base, "b1"), [], "Drafts and other companies' submittals are not shown");

// ── Notifications ──
assert.equal(base.notifications.length, 16);
assert.deepEqual([...new Set(base.notifications.map(n => n.kind))].sort(), ["architect-responded", "reminder", "requested", "response-returned", "sent-to-architect", "submitted"]);
assert(S.markSubmittalNotificationsRead(base, base.notifications.map(n => n.id)).notifications.every(n => n.read));

console.log(`Submittal log checked: ${base.submittals.length} sample submittals; spec-matrix requirements, assignment from award, request, submit, contractor review, architect send/response/return, revisions, reminders, overdue, log, filters, portal.`);
