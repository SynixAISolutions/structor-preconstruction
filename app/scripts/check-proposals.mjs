import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/proposal-extraction.ts");
const P = await import("../lib/procurement.ts");
const S = await import("../lib/submissions.ts");
const { sampleProposals } = await import("../lib/data/proposals.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleSubmissions } = await import("../lib/data/sample-award.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-13T15:00:00.000Z";
const fails = (fn, pattern) => assert.throws(fn, e => e instanceof R.ProposalRuleError && pattern.test(e.message), `expected ${pattern}`);
const proc = freeze(structuredClone(sampleProcurement));
const subs = freeze(structuredClone(sampleSubmissions));
const base = freeze(structuredClone(sampleProposals));
const records = freeze({ proposals: base, submissions: subs, procurement: proc });
const reading = base.readings[0];
const FILE = "District Concrete revised proposal.pdf";

// ── Sample: District Concrete's revised proposal, read and waiting ──
assert.deepEqual([base.readings.length, reading.id, reading.invitationId, reading.packageId, reading.bidderId, reading.formVersion, reading.status, reading.engine.mode, reading.original],
  [1, "prop-1", "inv-2", "concrete", "b2", 1, "pending-review", "sample", null]);
assert.deepEqual(reading.content.responses.map(r => [r.scopeItemId, r.answer, r.citations.length > 0]), [["scope-5", "Y", true], ["scope-6", "P", true]]);
assert.deepEqual([reading.content.baseBid, reading.content.submitter, reading.history], [1768000, { name: "Sarah Chen", email: "sarah@example.com" }, [{ kind: "read", at: "2026-10-13T14:00:00.000Z", by: "Structor AI" }]]);
assert.equal(R.readingFor(base, "inv-2"), reading);
assert.deepEqual(startingDraft("another-project", "proposal-readings", sampleProposals), { readings: [] }, "Other projects start empty");

// ── Recording: mapped onto the published form, every stated value cited ──
const cite = (page = 1, quote = "Base bid") => [{ document: "Proposal.pdf", page, sheet: null, quote }];
const input = (over = {}) => ({
  invitationId: "inv-2", formVersion: 1, document: { name: "Proposal.pdf", pages: 3, size: 1000 }, engine: { mode: "offline", model: "m" }, readAt: at,
  baseBid: 1700000, baseBidCitations: cite(), responses: [{ scopeItemId: "scope-5", answer: "Y", citations: cite(2) }], submitter: { name: "A", email: "a@b.co" }, ...over,
});
const record = (over, state = R.EMPTY_PROPOSALS, procurement = proc) => R.recordReading(state, procurement, input(over));
const one = record({}).readings[0];
assert.deepEqual(one.content.responses, [{ scopeItemId: "scope-5", answer: "Y", note: "", citations: cite(2) }, { scopeItemId: "scope-6", answer: null, note: "", citations: [] }], "Items the proposal doesn't address stay unanswered");
assert.deepEqual([one.content.exclusions, one.content.alternates, one.content.clarifications], [[], [], []]);
assert.equal(record({ baseBid: null, baseBidCitations: [] }).readings[0].content.baseBid, null, "No price found is allowed; applying will ask for it");
fails(() => record({ invitationId: "nope" }), /invitation no longer exists/);
fails(() => record({ invitationId: "inv-4" }), /declined/);
fails(() => record({ invitationId: "inv-1" }), /Demolition bid form isn't published/);
fails(() => record({ formVersion: 2 }), /at version 1; the proposal was mapped onto version 2/);
fails(() => record({}, base), /already has a reading waiting/);
fails(() => record({ responses: [{ scopeItemId: "scope-1", answer: "Y", citations: cite() }] }), /scope-1 isn't an item of the published bid form/);
fails(() => record({ responses: [{ scopeItemId: "scope-5", answer: "Y", citations: cite() }, { scopeItemId: "scope-5", answer: "N", citations: cite() }] }), /answered twice/);
fails(() => record({ responses: [{ scopeItemId: "scope-5", answer: "Maybe", citations: cite() }] }), /Y, N, P or N\/A/);
fails(() => record({ responses: [{ scopeItemId: "scope-5", answer: "Y" }] }), /scope-5: Every finding needs at least one citation/);
fails(() => record({ responses: [{ scopeItemId: "scope-5", answer: "Y", citations: cite(4) }] }), /has 3 pages, not 4/);
fails(() => record({ responses: [{ scopeItemId: "scope-5", answer: "Y", citations: [{ ...cite()[0], document: "Other.pdf" }] }] }), /not one of the run's documents/);
fails(() => record({ baseBid: 0 }), /base bid must be an amount above 0/);
fails(() => record({ baseBid: 10.555 }), /two decimals/);
fails(() => record({ baseBidCitations: [] }), /base bid: Every finding needs at least one citation/);
fails(() => record({ exclusions: [{ text: "Winter heat", citations: [] }] }), /Exclusion 1: Every finding/);
fails(() => record({ exclusions: [{ text: " ", citations: cite() }] }), /Exclusion 1 is missing/);
fails(() => record({ alternates: [{ kind: "swap", description: "x", amount: 1, citations: cite() }] }), /add or deduct/);
fails(() => record({ alternates: [{ kind: "add", description: "x", amount: 0, citations: cite() }] }), /Alternate 1: the amount/);
fails(() => record({ submitter: { name: "A", email: "nope" } }), /valid address/);
assert.equal(record({ submitter: { name: " ", email: "" } }).readings[0].content.submitter, null);
fails(() => record({ document: { name: "Proposal.pdf", pages: 0, size: 1 } }), /page count/);
fails(() => record({ document: { name: "Proposal.pdf", pages: 1, size: 0 } }), /larger than 0/);
fails(() => record({ document: { name: "Proposal.pdf", pages: 1, size: 50 * 1024 * 1024 + 1 } }), /at most 50 MB/);
fails(() => record({ engine: { mode: "guess", model: "m" } }), /sample, offline or live/);

// ── Correcting ──
const priced = R.editReading(base, reading.id, { baseBid: 1770000, exclusions: ["Testing and inspection (by owner)", "Dewatering"] }, "Victor", at);
const p1 = priced.readings[0];
assert.deepEqual([p1.content.baseBid, p1.content.baseBidCitations, p1.original, p1.history.at(-1)], [1770000, [], reading.content, { kind: "edited", at, by: "Victor", fields: ["baseBid", "exclusions"] }]);
assert.deepEqual(p1.content.exclusions.map(l => [l.text, l.citations.length > 0]), [["Testing and inspection (by owner)", true], ["Dewatering", false]], "A kept line keeps its citation; an added one has none");
assert.equal(R.editReading(base, reading.id, { baseBid: 1768000 }, "Victor", at), base, "No change, same state");
const twice = R.editReading(priced, reading.id, { baseBid: 1771000 }, "Victor", at).readings[0];
assert.equal(twice.original, reading.content, "A second correction keeps the AI's first reading");
const kept = R.editReading(base, reading.id, { alternates: [{ kind: "deduct", description: "Delete housekeeping pads (by mechanical)", amount: 18500 }, { kind: "add", description: "Sealer", amount: 4000 }] }, "Victor", at).readings[0];
assert.deepEqual(kept.content.alternates.map(a => a.citations.length > 0), [true, false]);
const answered = R.setReadAnswer(base, reading.id, "scope-6", "Y", "", "Victor", at).readings[0];
assert.deepEqual([answered.content.responses[1].answer, answered.content.responses[1].citations], ["Y", []], "A changed answer is the estimator's, not the proposal's");
assert.equal(R.setReadAnswer(base, reading.id, "scope-6", "P", "Gym slab only.", "Victor", at).readings[0].content.responses[1].citations.length, 1, "A clarified note keeps the citation");
fails(() => R.setReadAnswer(base, reading.id, "scope-1", "Y", "", "Victor", at), /isn't on the bid form/);
fails(() => R.setReadAnswer(base, reading.id, "scope-6", "Q", "", "Victor", at), /Y, N, P or N\/A/);
fails(() => R.editReading(base, reading.id, { baseBid: -5 }, "Victor", at), /above 0/);
fails(() => R.editReading(base, reading.id, { baseBid: 1 }, " ", at), /who reviewed/);
assert.deepEqual(R.readingCorrections(reading), { baseBid: false, answers: [], exclusions: false, clarifications: false, alternates: false, submitter: false });
const corrected = R.setReadAnswer(priced, reading.id, "scope-6", "Y", "", "Victor", at).readings[0];
assert.deepEqual(R.readingCorrections(R.setReadAnswer(base, reading.id, "scope-6", "P", "Gym slab only.", "Victor", at).readings[0]).answers, ["scope-6"], "A reworded note is a correction too");
assert.deepEqual(R.readingCorrections(corrected), { baseBid: true, answers: ["scope-6"], exclusions: true, clarifications: false, alternates: false, submitter: false });

const discarded = R.discardReading(base, reading.id, "Superseded by the phone call.", "Victor", at);
assert.deepEqual([discarded.readings[0].status, discarded.readings[0].discardReason], ["discarded", "Superseded by the phone call."]);
fails(() => R.discardReading(base, reading.id, " ", "Victor", at), /Why it is discarded is missing/);
fails(() => R.editReading(discarded, reading.id, { baseBid: 1 }, "Victor", at), /discarded/);
assert.equal(record({}, discarded).readings.length, 2, "A discarded reading doesn't block a new one");

// ── Applying: the reading becomes the company's next revision ──
assert.deepEqual(R.applyBlockers(records, reading.id, "jelleff"), []);
const applied = R.applyReading(records, reading.id, "jelleff", "Victor", at);
const s1 = applied.submissions.find(s => s.invitationId === "inv-2");
const rev2 = s1.revisions.at(-1);
assert.deepEqual([s1.revisions.length, s1.status, rev2.number, rev2.formVersion, rev2.baseBid, rev2.submitter, rev2.submittedAt], [2, "revised", 2, 1, 1768000, { name: "Sarah Chen", email: "sarah@example.com" }, at]);
assert.deepEqual(rev2.responses, [{ scopeItemId: "scope-5", answer: "Y", note: "" }, { scopeItemId: "scope-6", answer: "P", note: "States FF35/FL25 for the gym slab only; other areas to standard tolerance." }]);
assert.deepEqual([rev2.exclusions, rev2.clarifications, rev2.alternates.map(a => [a.kind, a.description, a.amount])], [["Testing and inspection (by owner)"], ["Winter heat and enclosures now included through March 2027."], [["deduct", "Delete housekeeping pads (by mechanical)", 18500]]]);
assert(rev2.attachments.some(a => a.name === FILE && a.size === 412000), "The proposal file is attached to the revision");
assert.deepEqual(s1.revisions[0], subs.find(s => s.invitationId === "inv-2").revisions[0], "Revision 1 is untouched");
assert.equal(applied.procurement.invitations.find(i => i.id === "inv-2").status, "submitted");
const done = applied.proposals.readings[0];
assert.deepEqual([done.status, done.applied, done.reviewedBy, done.history.at(-1).kind], ["applied", { submissionId: s1.id, revisionNumber: 2 }, "Victor", "applied"]);
fails(() => R.applyReading(applied, reading.id, "jelleff", "Victor", at), /already applied/);
fails(() => R.setReadAnswer(applied.proposals, reading.id, "scope-6", "Y", "", "Victor", at), /already applied/);

// What blocks applying: the submission's own rules, the contact, and a revised form.
const blockers = (proposals, procurement = proc) => R.applyBlockers({ proposals, submissions: subs, procurement }, reading.id, "jelleff");
assert.deepEqual(blockers(R.setReadAnswer(base, reading.id, "scope-6", "P", "", "Victor", at)), ["Explain the partial answer for \"Prepare concrete slab surfaces to the specified floor-flatness tolerance.\"."]);
assert.deepEqual(blockers(R.setReadAnswer(base, reading.id, "scope-5", null, "", "Victor", at)), ["Answer \"Provide cast-in-place concrete foundations, slabs, and housekeeping pads.\"."]);
assert.deepEqual(blockers(R.editReading(base, reading.id, { baseBid: null }, "Victor", at)), ["Enter a base bid greater than zero."]);
assert.match(blockers(R.editReading(base, reading.id, { submitter: null }, "Victor", at))[0], /contact name and email/);
const republished = P.publishPackage(P.approveScope(P.editScope(proc, "scope-5", { detail: "Include vapor retarder." }, "Victor", at), "scope-5", "Victor", at), "concrete", "Victor", at);
assert.match(blockers(base, republished)[0], /revised \(version 1 → 2\) after this proposal was read/);
const issues = (() => { try { R.applyReading({ proposals: R.setReadAnswer(base, reading.id, "scope-6", "N/A", "", "Victor", at), submissions: subs, procurement: proc }, reading.id, "jelleff", "Victor", at); } catch (e) { return e.issues; } })();
assert.deepEqual(issues.map(i => [i.field, i.scopeItemId]), [["responses", "scope-6"]], "The submission's field issues come through for the UI");

// A company with no submission yet: the reading opens one and becomes revision 1.
const demo = P.publishPackage(["scope-1", "scope-2", "scope-3", "scope-4"].reduce((s, id) => P.approveScope(s, id, "Sadie", at), proc), "demolition", "Sadie", at);
const demoReading = R.recordReading(R.EMPTY_PROPOSALS, demo, input({ invitationId: "inv-1", responses: ["scope-1", "scope-2", "scope-3", "scope-4"].map(id => ({ scopeItemId: id, answer: "Y", citations: cite(2) })) }));
const first = R.applyReading({ proposals: demoReading, submissions: subs, procurement: demo }, demoReading.readings[0].id, "jelleff", "Sadie", at);
const newSub = first.submissions.find(s => s.invitationId === "inv-1");
assert.deepEqual([first.submissions.length, newSub.status, newSub.revisions.length, newSub.revisions[0].baseBid, newSub.revisions[0].attachments.map(a => a.name), first.procurement.invitations.find(i => i.id === "inv-1").status],
  [subs.length + 1, "submitted", 1, 1700000, ["Proposal.pdf"], "submitted"]);
assert.deepEqual(S.bidExceptions(newSub.revisions[0]), [], "All Y: nothing open for the estimator in leveling");

console.log(`Proposals checked: sample reading, recording rules and citations, corrections and accuracy, discard, apply into a new or next revision, blockers incl. a revised bid form.`);
