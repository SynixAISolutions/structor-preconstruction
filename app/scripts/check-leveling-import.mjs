import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { addScope, applyScopeToAllTrades, approveScope, bidForm, inviteBidder, moveScope, publishPackage } = await import("../lib/procurement.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { addAttachment, openSubmission, setResponse, submitBid, updateDraft } = await import("../lib/submissions.ts");
const { STALE_SOURCE_ELIGIBILITY, buildLevelingImport } = await import("../lib/leveling-import.ts");
const { bidderTotals, rankedBidders } = await import("../lib/leveling.mjs");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-26T12:00:00.000Z";
const approveAll = (s, pkg) => bidForm(s, pkg).reduce((acc, item) => approveScope(acc, item.id, "Safi", at), s);
const codes = (result) => result.issues.map(i => i.code);

// Demolition: dust control applied to all trades, one item without a source, published v1.
// Invited: b1 (from the sample), b6 and b2.
let proc = structuredClone(sampleProcurement);
proc = applyScopeToAllTrades(proc, proc.scopes.find(s => s.title.includes("dust-control")).id, "Safi", at);
proc = addScope(proc, { packageId: "demolition", title: "Cap and make safe abandoned services." }, "Safi", at);
proc = ["b6", "b2"].reduce((s, b) => inviteBidder(s, "demolition", b, "Safi", at), proc);
proc = freeze(publishPackage(approveAll(proc, "demolition"), "demolition", "Safi", at));
const form = bidForm(proc, "demolition");
const inv = (bidderId) => proc.invitations.find(i => i.packageId === "demolition" && i.bidderId === bidderId).id;

// Three submissions: b1 all Y; b6 with N and P plus extras; b2 draft only.
const answerAll = (subs, id, answers) => form.reduce((s, item, i) => setResponse(s, id, item.id, answers[i] ?? "Y", answers[i] && answers[i] !== "Y" && answers[i] !== "N" ? "Partial: see proposal." : "", at), subs);
let subs = [];
for (const b of ["b1", "b6", "b2"]) subs = openSubmission(subs, proc, { projectId: "jelleff", invitationId: inv(b) }, at);
const idOf = (b) => subs.find(s => s.bidderId === b).id;
subs = answerAll(subs, idOf("b1"), []);
subs = updateDraft(subs, idOf("b1"), { baseBid: 498000 }, at);
subs = submitBid(subs, proc, idOf("b1"), { name: "Michael Brooks", email: "michael@example.com" }, at);
subs = answerAll(subs, idOf("b6"), ["Y", "N", "P"]);
subs = updateDraft(subs, idOf("b6"), { baseBid: 450000, exclusions: ["Hazardous materials abatement"], clarifications: ["Work hours 7–5."], alternates: [{ id: "alt-1", kind: "deduct", description: "Reuse crushed concrete on site", amount: 12000 }] }, at);
subs = addAttachment(subs, idOf("b6"), { name: "Greenline proposal.pdf", size: 1200, type: "application/pdf" }, at);
subs = submitBid(subs, proc, idOf("b6"), { name: "Jordan Davis", email: "jordan@example.com" }, at);
subs = freeze(subs);
const input = freeze({ projectId: "jelleff", projectName: "Jelleff Recreation Center", packageId: "demolition", procurement: proc, submissions: subs, directory: initialBidders, budget: 520000 });

// Package problems return nothing to level, with a clear reason.
assert.deepEqual(codes(buildLevelingImport({ ...input, packageId: "nope" })), ["package-missing"]);
const unpublished = buildLevelingImport({ ...input, packageId: "steel" });
assert.deepEqual([codes(unpublished), unpublished.items.length, unpublished.bidders.length], [["package-unpublished"], 0, 0]);
assert.deepEqual(codes(buildLevelingImport({ ...input, submissions: subs.filter(s => s.bidderId === "b2") })), ["no-submitted-bids"], "Drafts alone are not bids");

const result = buildLevelingImport(input);
assert.deepEqual(result.issues, []);
assert.deepEqual(result.project, { name: "Jelleff Recreation Center", trade: "Demolition", budget: 520000, isDemo: false });

// Scope items are the current published form, in order.
assert.deepEqual(result.items.map(i => i.id), form.map(i => i.id));
assert.deepEqual(result.items.map(i => i.number), form.map((_, i) => String(i + 1)));
assert(result.items.every(i => i.required === true));
assert.equal(result.items[0].section, "All trades", "The all-trades item is labelled as such");
assert.equal(result.items[1].section, "02 41 19 · Demolition");
assert.equal(result.items.at(-1).source, "Not linked yet");
assert.equal(result.items[1].description, form[1].title);
assert.equal(result.items[1].estimatorNote, form[1].detail);

// Bidders: submitted only (b2's draft excluded), mapped from the latest revision.
assert.deepEqual(result.bidders.map(b => [b.name, b.contact, b.baseBid]), [["Capital Demolition", "Michael Brooks", 498000], ["Greenline Civil", "Jordan Davis", 450000]]);
const green = result.bidders[1];
assert.deepEqual([green.responses[form[1].id].status, green.responses[form[2].id].status, green.responses[form[2].id].note], ["N", "P", "Partial: see proposal."]);
for (const bidder of result.bidders) {
  assert.equal(bidder.sourceEligibility, undefined, "Current bids carry no eligibility override");
  for (const response of Object.values(bidder.responses)) {
    assert.deepEqual([response.adjustment, response.resolved, response.adjustmentApproved], [0, false, false], "No invented adjustments or approvals, and explicit flags so the workspace cannot default them to approved");
  }
}

// Provenance and review extras.
const p = result.provenance[green.id];
assert.deepEqual([p.projectId, p.packageId, p.invitationId, p.bidderId, p.submissionId], ["jelleff", "demolition", inv("b6"), "b6", idOf("b6")]);
assert.deepEqual([p.revisionNumber, p.revisionCount, p.formVersion, p.currentFormVersion, p.stale, p.submitter.email], [1, 1, 1, 1, false, "jordan@example.com"]);
assert.deepEqual([p.exclusions, p.clarifications, p.alternates[0].amount, p.attachments[0].name], [["Hazardous materials abatement"], ["Work hours 7–5."], 12000, "Greenline proposal.pdf"]);

// Through the real leveling engine: N and P stay open, so only the all-Y bid ranks...
let ranked = rankedBidders(result.bidders, result.items);
assert.deepEqual(ranked.map(r => r.bidder.name), ["Capital Demolition"]);
assert.equal(ranked[0].reviewedTotal, 507960, "498,000 plus the 2% demo bond");
assert(bidderTotals(green, result.items).eligibilityReasons.includes("open-scope-review"));
// ...until the estimator resolves them — then the cheaper bid ranks first.
const resolved = { ...green, responses: Object.fromEntries(Object.entries(green.responses).map(([k, r]) => [k, { ...r, resolved: true }])) };
assert.deepEqual(rankedBidders([result.bidders[0], resolved], result.items).map(r => r.bidder.name), ["Greenline Civil", "Capital Demolition"]);

// The GC revises the form (v2). Capital Demolition priced v1: shown, flagged, never ranked.
const proc2 = freeze(publishPackage(approveAll(addScope(proc, { packageId: "demolition", title: "Remove the existing ceiling grid.", source: "AD-102" }, "Safi", at), "demolition"), "demolition", "Safi", at));
const v2 = buildLevelingImport({ ...input, procurement: proc2 });
const capital = v2.bidders.find(b => b.name === "Capital Demolition");
const newItem = v2.items.at(-1).id;
assert.deepEqual([v2.provenance[capital.id].stale, capital.sourceEligibility, capital.responses[newItem].status], [true, STALE_SOURCE_ELIGIBILITY, ""]);
assert(v2.issues.some(i => i.code === "stale-form" && i.submissionId === idOf("b1") && /version 1; the current version is 2/.test(i.message)));
const everythingResolved = { ...capital, responses: Object.fromEntries(Object.entries(capital.responses).map(([k, r]) => [k, { ...r, status: "Y", resolved: true }])) };
assert(bidderTotals(everythingResolved, v2.items).eligibilityReasons.includes("source-ineligible"), "A stale revision cannot be ranked even with every row resolved");
assert.equal(rankedBidders([everythingResolved], v2.items).length, 0);
// After resubmitting against v2 it is current again.
let subs2 = openSubmission(subs, proc2, { projectId: "jelleff", invitationId: inv("b1") }, at);
subs2 = setResponse(subs2, idOf("b1"), newItem, "Y", "", at);
subs2 = submitBid(subs2, proc2, idOf("b1"), { name: "Michael Brooks", email: "michael@example.com" }, at);
const fresh = buildLevelingImport({ ...input, procurement: proc2, submissions: subs2 });
const capital2 = fresh.bidders.find(b => b.name === "Capital Demolition");
assert.deepEqual([fresh.provenance[capital2.id].stale, fresh.provenance[capital2.id].revisionNumber, capital2.sourceEligibility], [false, 2, undefined]);

// An item removed from the form: the stale revision's answer is kept aside, not in the grid.
const removed = form[1].id;
const proc3 = freeze(publishPackage(approveAll(moveScope(proc, removed, "concrete", "Safi", at), "demolition"), "demolition", "Safi", at));
const moved = buildLevelingImport({ ...input, procurement: proc3 });
const greenMoved = moved.bidders.find(b => b.name === "Greenline Civil");
assert.equal(greenMoved.responses[removed], undefined);
assert.deepEqual(moved.provenance[greenMoved.id].droppedResponses, [{ scopeItemId: removed, answer: "N", note: "" }]);

// Choosing an earlier revision; a missing one is left out with a reason.
const earlier = buildLevelingImport({ ...input, procurement: proc2, submissions: subs2, revisions: { [idOf("b1")]: 1 } });
assert.deepEqual([earlier.provenance[`submission-${idOf("b1")}`].revisionNumber, earlier.provenance[`submission-${idOf("b1")}`].stale], [1, true]);
const missing = buildLevelingImport({ ...input, revisions: { [idOf("b1")]: 9 } });
assert.deepEqual([codes(missing), missing.bidders.map(b => b.name)], [["revision-missing"], ["Greenline Civil"]]);

// Records that do not add up are left out, each with its own reason.
const [s1, s6] = [subs.find(s => s.bidderId === "b1"), subs.find(s => s.bidderId === "b6")];
const bad = buildLevelingImport({ ...input, submissions: [
  { ...s1, projectId: "whittier" },
  { ...s6, invitationId: "gone" },
  { ...s6, id: "x2", bidderId: "b3" },
  s6, { ...s6, id: "dup" },
] });
assert.deepEqual(codes(bad), ["submission-mismatch", "submission-mismatch", "submission-mismatch", "submission-mismatch"]);
assert.deepEqual(bad.bidders.map(b => b.name), ["Greenline Civil"]);
const none = buildLevelingImport({ ...input, submissions: [{ ...s1, projectId: "whittier" }] });
assert.equal(none.issues[0].code, "no-submitted-bids");
assert.match(none.issues[0].message, /could be used/);

// A company missing from the directory still levels, under its id.
const orphan = buildLevelingImport({ ...input, directory: initialBidders.filter(b => b.id !== "b6") });
assert.deepEqual([orphan.bidders[1].name, codes(orphan)], ["b6", ["unknown-bidder"]]);

console.log(`Leveling import checked: ${result.items.length} items, ${result.bidders.length} submitted bids (drafts excluded), open answers, stale forms, revisions, mismatches, ranking through the real engine.`);
