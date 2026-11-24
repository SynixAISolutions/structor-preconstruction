import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-resolver.mjs",import.meta.url);
const E=await import("../lib/extraction.ts");
const S=await import("../lib/scope-review.ts");
const {sampleExtraction}=await import("../lib/data/extraction.ts");
const {sampleProcurement}=await import("../lib/data/procurement.ts");
const {sampleDrawingFlip}=await import("../lib/data/drawing-flip.ts");
const {bidForm}=await import("../lib/procurement.ts");
const review={extraction:structuredClone(sampleExtraction),procurement:structuredClone(sampleProcurement),flip:structuredClone(sampleDrawingFlip)};
const draft=review.extraction.drafts.find(d=>d.kind==='scope'&&d.status==='pending-review');assert.ok(draft);
let accepted=E.acceptDraft(review,draft.id,'Reviewer');
assert.ok(!S.inlineDrafts(accepted.extraction.drafts,draft.packageId).some(d=>d.id===draft.id),'accepted scope appears once as its bid-form line');
const id=accepted.extraction.drafts.find(d=>d.id===draft.id).acceptedId;
accepted=S.removeReviewedScope(accepted,id,'Reviewer');
assert.ok(!bidForm(accepted.procurement,draft.packageId).some(s=>s.id===id));
assert.ok(accepted.flip.regions.every(r=>!r.scopeIds.includes(id)),'removed scope is unlinked from drawing regions');
assert.throws(()=>S.removeReviewedScope(accepted,id,'Reviewer'));
const removed=E.deleteDraft(review.extraction,draft.id,'Reviewer');
assert.equal(removed.drafts.find(d=>d.id===draft.id).status,'rejected');
assert.ok(!S.inlineDrafts(removed.drafts,draft.packageId).some(d=>d.id===draft.id));
assert.ok(removed.drafts.find(d=>d.id===draft.id).citations.length,'deletion keeps source audit');
assert.throws(()=>E.acceptDraft({...review,extraction:removed},draft.id,'Reviewer'));
assert.ok(S.inlineDrafts(E.reopenDraft(removed,draft.id,'Reviewer').drafts,draft.packageId).some(d=>d.id===draft.id));
const to=review.procurement.packages.find(p=>p.id!==draft.packageId).id;
const moved=E.editDraft(review.extraction,review.procurement,draft.id,{packageId:to},'Reviewer');
assert.ok(S.inlineDrafts(moved.drafts,to).some(d=>d.id===draft.id));
assert.ok(!S.inlineDrafts(moved.drafts,draft.packageId).some(d=>d.id===draft.id));
const general=[{id:'synthetic-cleanup',title:'Synthetic cleanup requirement',detail:'For this test only',source:'Synthetic template p.1'}];
const all=S.addGeneralScopes(review.procurement,general,'Reviewer');
assert.ok(all.packages.every(p=>bidForm(all,p.id).filter(i=>i.title===general[0].title).length===1));
assert.equal(S.addGeneralScopes(all,general,'Reviewer').scopes.length,all.scopes.length,'repeated clicks never duplicate common requirements');
assert.ok(all.scopes.find(i=>i.title===general[0].title).status==='draft','general items require review before publication');
assert.throws(()=>S.parseGeneralScopes([{title:'missing fields'}]));
assert.throws(()=>S.addGeneralScopes({...review.procurement,packages:[]},general,'Reviewer'));
// Approving a line the AI read from a drawing places its highlight too (28 Oct: an approved line's "Drawing region"
// proposals stayed behind in the list).
{
  const sq = (x, y) => [{ x, y }, { x: x + 0.1, y }, { x: x + 0.1, y: y + 0.1 }, { x, y: y + 0.1 }];
  const cite = { document: "Drawings.pdf", page: 46, sheet: "A1.1", quote: "LOCKERS / CHANGE" };
  const title = "Provide gypsum board partitions at the locker rooms.";
  const input = { packageIds: ["drywall"], engine: { mode: "live", model: "claude-haiku-5-5" }, documents: [{ name: "Drawings.pdf", pages: 205 }], startedAt: "2026-10-28T10:00:00.000Z", finishedAt: "2026-10-28T10:05:00.000Z", drafts: [
    { kind: "scope", key: "lockers", packageId: "drywall", title, detail: "", source: "A1.1 · ai", citations: [cite] },
    { kind: "region", key: "lockers-region", packageId: "drywall", sheet: "A1.1", label: title, polygon: sq(0.5, 0.4), confidence: 0.8, scopeKeys: ["lockers"], citations: [cite] },
    { kind: "region", key: "unlinked-region", packageId: "drywall", sheet: "A1.1", label: title, polygon: sq(0.2, 0.2), confidence: 0.8, citations: [cite] },
  ] };
  const base = { extraction: structuredClone(sampleExtraction), procurement: structuredClone(sampleProcurement), flip: structuredClone(sampleDrawingFlip) };
  const extraction = E.recordRun(base.extraction, base.procurement, input);
  const run = extraction.runs.at(-1).id;
  const added = E.addRunToBidForms({ extraction, procurement: base.procurement }, run);
  const line = added.procurement.scopes.at(-1);
  assert.equal(line.title, title);
  assert.equal(line.status, "draft", "The run puts the line in the bid form for approval");
  const regions = S.regionsForScope(added.extraction, line.id);
  assert.equal(regions.length, 2, "Its highlights: the one linked to it, and one of the same run with its words");
  assert.equal(S.inlineDrafts(added.extraction.drafts, "drywall").filter(d => d.runId === run).length, 2, "Before approval the two highlights wait in the list");
  const approved = S.approveWithRegions({ ...base, extraction: added.extraction, procurement: added.procurement }, line.id, "Marcel Khoury", "2026-10-28T11:00:00.000Z");
  assert.equal(approved.procurement.scopes.find(s => s.id === line.id).status, "approved");
  assert.equal(S.inlineDrafts(approved.extraction.drafts, "drywall").filter(d => d.runId === run).length, 0, "Approving the line clears its highlights from the list");
  const placed = approved.extraction.drafts.filter(d => d.runId === run && d.kind === "region").map(d => approved.flip.regions.find(r => r.id === d.acceptedId));
  assert.ok(placed.every(r => r && r.scopeIds.includes(line.id) && r.status === "approved"), "Both highlights are on Drawing Flip, approved and linked to the line");
  assert.equal(S.approveWithRegions(approved, line.id, "Marcel Khoury").flip.regions.length, approved.flip.regions.length, "Approving again places nothing twice");
  // A highlight whose sheet isn't on Drawing Flip waits for review instead of failing the approval.
  const noSheet = { ...base, extraction: added.extraction, procurement: added.procurement, flip: { ...base.flip, pages: base.flip.pages.filter(p => p.sheet !== "A1.1") } };
  const kept = S.approveWithRegions(noSheet, line.id, "Marcel Khoury");
  assert.equal(kept.procurement.scopes.find(s => s.id === line.id).status, "approved");
  assert.equal(S.inlineDrafts(kept.extraction.drafts, "drywall").filter(d => d.runId === run).length, 2);

  // Danial, 24 Nov: the highlights go on Drawing Flip without waiting for each line's approval (Whittier: 837 drawn, 47 shown).
  const shown = E.placeHighlights({ ...base, extraction: added.extraction, procurement: added.procurement }, run, "2026-10-28T10:06:00.000Z");
  assert.deepEqual([shown.placed, shown.noPage], [2, 0]);
  const onFlip = shown.extraction.drafts.filter(d => d.runId === run && d.kind === "region").map(d => shown.flip.regions.find(r => r.id === d.acceptedId));
  assert.ok(onFlip.every(r => r && r.status === "pending-review" && r.origin === "ai" && r.packageId === "drywall" && r.scopeIds.includes(line.id)), "Each is a Structor proposal in its trade, awaiting review, linked to its line");
  assert.ok(onFlip.every(r => r.evidence.includes("LOCKERS / CHANGE")), "It carries the words it was drawn on");
  assert.equal(S.inlineDrafts(shown.extraction.drafts, "drywall").filter(d => d.runId === run && d.kind === "region").length, 0, "It now lives on Drawing Flip, not in the list");
  assert.equal(E.placeHighlights(shown, run).placed, 0, "Placing again adds nothing");
  const lineApproved = S.approveWithRegions(shown, line.id, "Marcel Khoury", "2026-10-28T11:00:00.000Z");
  assert.ok(onFlip.every(r => lineApproved.flip.regions.find(x => x.id === r.id).status === "approved") && lineApproved.flip.regions.length === shown.flip.regions.length, "Approving the line approves its highlights there, adding none");
  const missing = E.placeHighlights(noSheet, run);
  assert.deepEqual([missing.placed, missing.noPage], [0, 2], "A highlight on a sheet Drawing Flip doesn't have stays waiting");
  // A line accepted after its highlight was placed is linked to it then.
  const pendingRun = E.recordRun(base.extraction, base.procurement, { ...input, startedAt: "2026-10-29T10:00:00.000Z", finishedAt: "2026-10-29T10:05:00.000Z" });
  const later = E.placeHighlights({ ...base, extraction: pendingRun }, pendingRun.runs.at(-1).id);
  const scopeDraft = later.extraction.drafts.find(d => d.runId === pendingRun.runs.at(-1).id && d.kind === "scope");
  const regionDraft = later.extraction.drafts.find(d => d.runId === pendingRun.runs.at(-1).id && d.kind === "region" && d.scopeDraftIds.includes(scopeDraft.id));
  assert.deepEqual(later.flip.regions.find(r => r.id === regionDraft.acceptedId).scopeIds, [], "Its line isn't in the bid form yet");
  const acceptedLater = E.acceptDraft(later, scopeDraft.id, "Marcel Khoury");
  assert.deepEqual(acceptedLater.flip.regions.find(r => r.id === regionDraft.acceptedId).scopeIds, [acceptedLater.extraction.drafts.find(d => d.id === scopeDraft.id).acceptedId], "Accepting the line links it to the highlight already placed");
}
// Combining trades moves what the AI found for the trade removed: its waiting findings, the runs that read it, its highlights.
{
  const open = { ...sampleProcurement, invitations: [], packages: sampleProcurement.packages.map(p => ({ ...p, published: undefined })) };
  const records = { extraction: sampleExtraction, procurement: open, flip: sampleDrawingFlip };
  const into = open.packages.find(p => p.id !== "drywall" && p.division === "09").id;
  const counts = r => ({ drafts: r.extraction.drafts.filter(d => d.packageId === "drywall").length, regions: r.flip.regions.filter(x => x.packageId === "drywall").length, scopes: r.procurement.scopes.filter(x => x.packageId === "drywall").length });
  const before = counts(records), intoBefore = { drafts: records.extraction.drafts.filter(d => d.packageId === into).length, regions: records.flip.regions.filter(x => x.packageId === into).length };
  assert.ok(before.drafts && before.regions, "the sample has drywall findings and highlights to move");
  const combined = S.combineTrades(records, "drywall", into, "Marcel Khoury");
  assert.deepEqual(counts(combined), { drafts: 0, regions: 0, scopes: 0 }, "Nothing stays with the trade removed");
  assert.deepEqual([combined.extraction.drafts.filter(d => d.packageId === into).length, combined.flip.regions.filter(x => x.packageId === into).length], [intoBefore.drafts + before.drafts, intoBefore.regions + before.regions]);
  assert.ok(combined.extraction.runs.every(r => !r.packageIds.includes("drywall") && new Set(r.packageIds).size === r.packageIds.length), "Runs name the trade that now holds their findings, once");
  assert.equal(combined.procurement.packages.some(p => p.id === "drywall"), false);
  assert.throws(() => S.combineTrades({ ...records, procurement: sampleProcurement }, sampleProcurement.packages.find(p => p.published).id, into, "M"), /published|invited/);
}
// 23 Nov: a new reading's proposals come first, the rejected ones last, and the newest live reading is the one marked new.
{
  const d = (id, runId, status = "pending-review") => ({ id, runId, packageId: "drywall", kind: "scope", status, removed: false, title: id });
  const runs = [{ id: "sample", finishedAt: "2026-10-13T10:00:00Z", engine: { mode: "sample" } }, { id: "old", finishedAt: "2026-11-20T10:00:00Z", engine: { mode: "live" } }, { id: "new", finishedAt: "2026-11-23T08:20:00Z", engine: { mode: "live" } }];
  const drafts = [d("s1", "sample"), d("o1", "old"), d("o2", "old", "rejected"), d("n1", "new"), d("n2", "new"), d("x", "new", "accepted")];
  assert.deepEqual(S.inlineDrafts(drafts, "drywall", runs).map(x => x.id), ["n1", "n2", "o1", "s1", "o2"], "Newest reading first, in its own order; rejected last; accepted lines live in the bid form");
  assert.deepEqual(S.inlineDrafts(drafts, "drywall").map(x => x.id), ["s1", "o1", "o2", "n1", "n2"], "Without the runs, the stored order");
  assert.equal(S.newestRun(drafts, runs), "new");
  assert.equal(S.newestRun([d("s1", "sample")], runs), null, "The illustrative sample is never new");
}
console.log('Meeting scope checks passed: inline accept/move/reject/delete, approving a line places its highlights, the AI highlights placed on Drawing Flip before approval, audit, drawing unlinking, all-trade requirements and idempotency, combining trades.');
