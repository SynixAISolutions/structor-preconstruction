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
}
console.log('Meeting scope checks passed: inline accept/move/reject/delete, approving a line places its highlights, audit, drawing unlinking, all-trade requirements and idempotency.');
