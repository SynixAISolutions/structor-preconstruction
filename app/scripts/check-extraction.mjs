import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const X = await import("../lib/extraction.ts");
const { sampleExtraction } = await import("../lib/data/extraction.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleDrawingFlip } = await import("../lib/data/drawing-flip.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-13T11:00:00.000Z";
const fails = (fn, pattern) => assert.throws(fn, e => e instanceof X.ExtractionRuleError && pattern.test(e.message), `expected ${pattern}`);
const proc = freeze(structuredClone(sampleProcurement));
const flip = freeze(structuredClone(sampleDrawingFlip));
const base = freeze(structuredClone(sampleExtraction));
const records = freeze({ extraction: base, procurement: proc, flip });
const draft = (s, prefix) => s.drafts.find(d => (d.title ?? d.label ?? d.item).startsWith(prefix));
const [framing, finish, ceilings, doors] = ["Provide metal stud", "Finish gypsum board", "Provide acoustical", "Provide sound-rated"].map(p => draft(base, p));
const region = base.drafts.find(d => d.kind === "region"), quantity = base.drafts.find(d => d.kind === "quantity");

// ── Sample: one illustrative drywall run, every state the review queue shows ──
assert.deepEqual(base.runs.map(r => [r.id, r.packageIds, r.engine.mode, r.status, r.by]), [["ext-1", ["drywall"], "sample", "complete", "Structor AI"]]);
assert.deepEqual(base.drafts.map(d => [d.kind, d.status]), [["scope", "pending-review"], ["scope", "pending-review"], ["scope", "pending-review"], ["scope", "rejected"], ["region", "pending-review"], ["quantity", "pending-review"]]);
assert(base.drafts.every(d => /^ext-\d+$/.test(d.id) && d.runId === "ext-1" && d.citations.length && d.history[0].by === "Structor AI" && d.history[0].at === base.runs[0].finishedAt), "Fixed ids, cited, proposed by Structor AI when the run finished");
assert.deepEqual([finish.original.title, finish.title, finish.history.at(-1).fields], ["Finish all gypsum board to Level 5.", "Finish gypsum board to Level 4 where exposed to view.", ["title"]], "The edit keeps the AI's wording");
assert.deepEqual([doors.rejection, doors.reviewedBy], [{ reason: "wrong-trade", note: "Doors are in the Openings package; drywall only frames the opening." }, "Safi"]);
assert.deepEqual([region.scopeDraftIds, quantity.scopeDraftId], [[framing.id], framing.id]);
assert(sampleDrawingFlip.pages.some(p => p.sheet === region.sheet), "The sample region's sheet is a Drawing Flip page");
assert.deepEqual(startingDraft("another-project", "extraction", sampleExtraction), { runs: [], drafts: [] }, "Other projects start empty");

// ── Recording a run: validated, all or nothing ──
const ARCH = "Architectural drawing set.pdf";
const cite = { document: ARCH, page: 3, sheet: "A-101", quote: "Wall type tag" };
const scopeIn = (over = {}) => ({ kind: "scope", key: "s", packageId: "drywall", title: "Frame partitions.", detail: "", source: "09 22 16", citations: [cite], ...over });
const run = (drafts, over = {}) => X.recordRun(X.EMPTY_EXTRACTION, proc, { packageIds: ["drywall"], engine: { mode: "offline", model: "m" }, documents: [{ name: ARCH, pages: 12 }], startedAt: "2026-10-13T08:00:00.000Z", finishedAt: "2026-10-13T08:05:00.000Z", drafts, ...over });
const one = run([scopeIn()]);
assert.deepEqual([one.runs.length, one.drafts.length, one.drafts[0].status, one.drafts[0].citations], [1, 1, "pending-review", [cite]]);
fails(() => run([scopeIn({ citations: [] })]), /Finding 1 \(scope\): Every finding needs at least one citation/);
fails(() => run([scopeIn(), scopeIn({ key: "t", citations: [{ ...cite, page: 13 }] })]), /Finding 2 \(scope\): .*has 12 pages, not 13/);
fails(() => run([scopeIn({ citations: [{ ...cite, page: 0 }] })]), /whole number from 1/);
fails(() => run([scopeIn({ citations: [{ ...cite, document: "Other.pdf" }] })]), /not one of the run's documents/);
fails(() => run([scopeIn({ citations: [{ ...cite, quote: " " }] })]), /quoted words is missing/);
fails(() => run([scopeIn({ citations: [{ ...cite, quote: "x".repeat(601) }] })]), /longer than 600/);
fails(() => run([scopeIn({ packageId: "flooring" })]), /isn't one the run read for/);
fails(() => run([scopeIn()], { packageIds: ["nope"] }), /doesn't exist/);
fails(() => run([scopeIn()], { packageIds: [] }), /which trade packages/);
fails(() => run([scopeIn(), scopeIn()]), /own key/);
fails(() => run([scopeIn({ title: "" })]), /scope item is missing/);
fails(() => run([scopeIn()], { finishedAt: "2026-10-13T07:00:00.000Z" }), /finishing after it starts/);
fails(() => run([scopeIn()], { engine: { mode: "guess", model: "m" } }), /sample, offline or live/);
fails(() => run([scopeIn()], { documents: [] }), /which documents/);
fails(() => run([]), /no findings/);
const regionIn = (over = {}) => ({ kind: "region", key: "r", packageId: "drywall", sheet: "A-101", label: "Partitions", polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }], confidence: 0.6, scopeKeys: ["s"], citations: [cite], ...over });
const quantityIn = (over = {}) => ({ kind: "quantity", key: "q", packageId: "drywall", item: "Partitions", quantity: 100, unit: "SF", basis: "Length × height", scopeKey: "s", citations: [cite], ...over });
const three = run([scopeIn(), regionIn(), quantityIn()]);
assert.deepEqual([three.drafts[1].scopeDraftIds, three.drafts[2].scopeDraftId], [[three.drafts[0].id], three.drafts[0].id], "Keys become links");
fails(() => run([scopeIn(), regionIn({ scopeKeys: ["q"] }), quantityIn()]), /q is not a scope finding/);
fails(() => run([scopeIn(), quantityIn({ scopeKey: "zz" })]), /zz is not a scope finding/);
fails(() => run([scopeIn({ packageId: "flooring" }), regionIn()], { packageIds: ["drywall", "flooring"] }), /s belongs to another trade/);
fails(() => run([regionIn({ scopeKeys: [], polygon: [{ x: 0.1, y: 0.1 }, { x: 1.2, y: 0.1 }, { x: 0.2, y: 0.2 }] })]), /0 to 1/);
fails(() => run([regionIn({ scopeKeys: [], polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }] })]), /three points/);
fails(() => run([regionIn({ scopeKeys: [], confidence: 1.5 })]), /confidence from 0 to 1/);
fails(() => run([quantityIn({ scopeKey: null, quantity: 0 })]), /above 0/);
fails(() => run([quantityIn({ scopeKey: null, unit: "TON" })]), /SF, LF, EA, CY/);
fails(() => run([quantityIn({ scopeKey: null, basis: "" })]), /How it was measured is missing/);
const failed = run([], { error: "The model timed out." });
assert.deepEqual([failed.runs[0].status, failed.runs[0].error, failed.drafts], ["failed", "The model timed out.", []], "A failed run is recorded without findings");
fails(() => run([scopeIn()], { error: "Stopped." }), /failed run can't carry findings/);

// ── Accepting ──
const scopeAccepted = X.acceptDraft(records, framing.id, "Safi", at);
const newScope = scopeAccepted.procurement.scopes.at(-1);
assert.deepEqual([newScope.packageId, newScope.title, newScope.source, newScope.origin, newScope.status], ["drywall", framing.title, framing.source, "ai", "approved"]);
assert.deepEqual(newScope.history.map(h => [h.kind, h.by, h.at]), [["created", "Structor AI", "2026-10-13T09:06:00.000Z"], ["approved", "Safi", at]], "Created by the AI at the run, approved by the reviewer");
const acceptedFraming = scopeAccepted.extraction.drafts.find(d => d.id === framing.id);
assert.deepEqual([acceptedFraming.status, acceptedFraming.acceptedId, acceptedFraming.reviewedBy, acceptedFraming.history.at(-1).kind], ["accepted", newScope.id, "Safi", "accepted"]);
assert.equal(scopeAccepted.flip, flip, "No region accepted yet: Drawing Flip untouched");

const bothAccepted = X.acceptDraft(scopeAccepted, region.id, "Safi", at);
const newRegion = bothAccepted.flip.regions.at(-1);
assert.deepEqual([newRegion.origin, newRegion.status, newRegion.reviewedBy, newRegion.packageId, newRegion.scopeIds, newRegion.confidence, newRegion.label],
  ["ai", "approved", "Safi", "drywall", [newScope.id], 0.7, region.label]);
assert.equal(newRegion.pageId, flip.pages.find(p => p.sheet === "A-101").id);
assert(newRegion.evidence.includes(region.citations[0].quote) && newRegion.evidence.startsWith("A-101 p.3"), "The citation becomes the region's evidence");
assert.equal(bothAccepted.extraction.drafts.find(d => d.id === region.id).acceptedId, newRegion.id);
// The other order links too: region first, then its scope finding.
const regionFirst = X.acceptDraft(X.acceptDraft(records, region.id, "Safi", at), framing.id, "Safi", at);
assert.deepEqual(regionFirst.flip.regions.at(-1).scopeIds, [regionFirst.procurement.scopes.at(-1).id], "Accepting the scope later links the already-accepted region");
assert.deepEqual(X.acceptDraft(records, region.id, "Safi", at).flip.regions.at(-1).scopeIds, [], "A region accepted before its scope starts unlinked");

const quantityAccepted = X.acceptDraft(records, quantity.id, "Safi", at);
assert.deepEqual([quantityAccepted.extraction.drafts.find(d => d.id === quantity.id).status, quantityAccepted.procurement, quantityAccepted.flip], ["accepted", proc, flip], "A quantity is only marked accepted");
fails(() => X.acceptDraft(scopeAccepted, framing.id, "Safi", at), /Only a finding waiting/);
fails(() => X.acceptDraft(records, doors.id, "Safi", at), /Only a finding waiting/);
fails(() => X.acceptDraft(records, framing.id, " ", at), /who reviewed/);
fails(() => X.acceptDraft(records, "nope", "Safi", at), /no longer exists/);
const noSheet = freeze({ ...records, flip: { ...flip, pages: flip.pages.filter(p => p.sheet !== "A-101") } });
fails(() => X.acceptDraft(noSheet, region.id, "Safi", at), /Add sheet A-101 to Drawing Flip/);
const noPackage = freeze({ ...records, procurement: { ...proc, packages: proc.packages.filter(p => p.id !== "drywall") } });
fails(() => X.acceptDraft(noPackage, framing.id, "Safi", at), /trade package no longer exists/);

// ── Editing, rejecting, reopening ──
const edited = X.editDraft(base, proc, finish.id, { title: "Level 4 finish where exposed to view." }, "Vijay", at);
assert.equal(edited.drafts.find(d => d.id === finish.id).original.title, "Finish all gypsum board to Level 5.", "A second edit keeps the AI's first version");
assert.equal(X.editDraft(base, proc, framing.id, { title: framing.title }, "Safi", at), base, "No change, same state");
const editedOnce = X.editDraft(base, proc, framing.id, { detail: "Deflection track at the top." }, "Safi", at).drafts.find(d => d.id === framing.id);
assert.deepEqual([editedOnce.original.detail, editedOnce.detail, editedOnce.history.at(-1).fields], [framing.detail, "Deflection track at the top.", ["detail"]]);
fails(() => X.editDraft(base, proc, framing.id, { title: " " }, "Safi", at), /scope item is missing/);
fails(() => X.editDraft(base, proc, quantity.id, { quantity: -1 }, "Safi", at), /above 0/);
fails(() => X.editDraft(base, proc, doors.id, { title: "x" }, "Safi", at), /Only a finding waiting/);
fails(() => X.editDraft(base, proc, framing.id, { packageId: "nope" }, "Safi", at), /doesn't exist/);
const moved = X.editDraft(base, proc, framing.id, { packageId: "flooring" }, "Safi", at);
assert.deepEqual([moved.drafts.find(d => d.id === region.id).scopeDraftIds, moved.drafts.find(d => d.id === quantity.id).scopeDraftId], [[], null], "Moving a scope finding unlinks findings of the old trade");
const regionMoved = X.editDraft(base, proc, region.id, { packageId: "flooring" }, "Safi", at).drafts.find(d => d.id === region.id);
assert.deepEqual([regionMoved.packageId, regionMoved.scopeDraftIds, regionMoved.original.label], ["flooring", [], region.label], "A moved region drops its links to the old trade's scope");

fails(() => X.rejectDraft(base, ceilings.id, "other", "", "Safi", at), /note is missing/);
fails(() => X.rejectDraft(base, ceilings.id, "bogus", "", "Safi", at), /why it is rejected/);
const rejectedCeilings = X.rejectDraft(base, ceilings.id, "duplicate", "", "Safi", at);
assert.deepEqual(rejectedCeilings.drafts.find(d => d.id === ceilings.id).rejection, { reason: "duplicate", note: "" });
const reopened = X.reopenDraft(base, doors.id, "Safi", at).drafts.find(d => d.id === doors.id);
assert.deepEqual([reopened.status, reopened.rejection, reopened.reviewedBy, reopened.history.at(-1).kind], ["pending-review", null, null, "reopened"]);
fails(() => X.reopenDraft(base, framing.id, "Safi", at), /already waiting/);
fails(() => X.reopenDraft(scopeAccepted.extraction, framing.id, "Safi", at), /changed where it now lives/);

// ── Reading: the run's accuracy picture ──
const reviewed = X.acceptDraft(X.acceptDraft(records, framing.id, "Safi", at), finish.id, "Safi", at);
assert.equal(reviewed.procurement.scopes.at(-1).title, "Finish gypsum board to Level 4 where exposed to view.", "The corrected wording reaches the bid form");
assert.deepEqual(X.runSummary(reviewed.extraction, "ext-1"), {
  findings: 6, pending: 3, acceptedAsProposed: 1, acceptedEdited: 1, rejected: 1,
  rejectedBy: { "not-required": 0, "wrong-trade": 1, duplicate: 0, "misread-source": 0, other: 0 }, byKind: { scope: 4, region: 1, quantity: 1 },
});
assert.deepEqual(X.filterDrafts(base, { kind: "scope", status: "pending-review" }).map(d => d.id), [framing.id, finish.id, ceilings.id]);
assert.deepEqual(X.filterDrafts(base, { packageId: "flooring" }), []);
assert.deepEqual([X.isEdited(finish), X.isEdited(framing)], [true, false]);

console.log(`Extraction checked: sample run (${base.drafts.length} findings), run validation, citations, links, accept into Scopes and Drawing Flip in either order, edit/move/reject/reopen, run summary.`);
