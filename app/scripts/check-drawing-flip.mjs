import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const F = await import("../lib/drawing-flip.ts");
const { sampleDrawingFlip } = await import("../lib/data/drawing-flip.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { initialDrawings, sampleFiles } = await import("../lib/data/preconstruction.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-01T15:00:00.000Z";
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof F.DrawingFlipRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const base = freeze(structuredClone(sampleDrawingFlip));
const proc = freeze(structuredClone(sampleProcurement));
const numbers = (regions) => regions.map(r => r.number);
const byNumber = (s, n) => s.regions.find(r => r.number === n);
const box = F.rectangle(0.2, 0.2, 0.1, 0.1);

// Sample: eight real sheets from the project files, twelve regions on trades and scope items that exist.
assert.deepEqual(base.pages.map(p => p.sheet), ["AD-101", "A-101", "A-102", "A-601", "S-101", "M-101", "P-101", "E-101"]);
for (const p of base.pages) {
  assert(initialDrawings.some(d => d.id === p.sheet), `${p.sheet} is on the List of drawings`);
  assert(sampleFiles.some(f => f.id === p.documentId && f.name === p.documentName), `${p.sheet} comes from a project file`);
}
assert.equal(base.regions.length, 12);
for (const r of base.regions) {
  assert(base.pages.some(p => p.id === r.pageId), `${r.number}: page`);
  assert(r.polygon.length >= 3 && r.polygon.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) && F.polygonArea(r.polygon) >= 0.0001, `${r.number}: polygon`);
  assert(proc.packages.some(p => p.id === r.packageId), `${r.number}: trade`);
  assert(r.scopeIds.every(id => proc.scopes.find(s => s.id === id)?.packageId === r.packageId), `${r.number}: scope items of its trade`);
  assert.equal(r.history[0].kind, "created", `${r.number}: history starts at creation`);
  assert.equal(r.status === "approved", !!r.reviewedBy, `${r.number}: approved means reviewed`);
}
assert.deepEqual(startingDraft("p2", "drawing-flip", sampleDrawingFlip), F.EMPTY_DRAWING_FLIP, "A new project starts with no pages or regions");

// Geometry: normalised 0–1 from the top-left corner.
assert.deepEqual(F.rectangle(0.1, 0.2, 0.3, 0.4), [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.6 }, { x: 0.1, y: 0.6 }]);
assert.equal(F.polygonArea(F.rectangle(0, 0, 0.5, 0.5)), 0.25);
assert.equal(F.polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), 0.5);
assert.equal(F.polygonArea([...F.rectangle(0, 0, 0.5, 0.5)].reverse()), 0.25, "Either winding direction");
assert.deepEqual(F.bounds(byNumber(base, "R-010").polygon), { x: 0.1, y: 0.4, width: 0.76, height: 0.4 });

// Reading: filters, scope highlight, missing scope, legend, counts, correction log.
assert.deepEqual(numbers(F.filterRegions(base, proc, { pageId: "pg-ad-101" })), ["R-001", "R-002", "R-003"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { division: "09" })), ["R-005", "R-006"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { packageId: "drywall" })), ["R-005"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { status: "pending-review" })), ["R-002", "R-004", "R-006", "R-007", "R-008", "R-010", "R-011"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { origin: "estimator" })), ["R-012"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { corrected: true })), ["R-003"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { query: "tpo" })), ["R-007"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { query: "masonry" })), ["R-004"], "Searches the trade name");
assert.deepEqual(numbers(F.filterRegions(base, proc)), base.regions.map(r => r.number), "Page order, then number");
assert.deepEqual(numbers(F.regionsForScope(base, "scope-4")), ["R-003"]);
assert.deepEqual(F.unlocatedScopes(base, proc).map(s => s.id), ["scope-3", "scope-6", "scope-8", "scope-9", "scope-10"]);
assert.deepEqual(F.tradeLegend(base, proc, "pg-ad-101"), [{ packageId: "demolition", name: "Demolition", division: "02", regions: 3 }]);
assert.deepEqual(F.tradeLegend(base, proc, "pg-a-101").map(t => t.packageId), ["masonry", "drywall", "flooring"], "By division, then name");
assert.deepEqual(F.flipSummary(base), { regions: 12, pendingReview: 7, approved: 5, corrected: 1, withoutScope: 1 });
assert.deepEqual(F.flipSummary(base, "pg-ad-101"), { regions: 3, pendingReview: 1, approved: 2, corrected: 1, withoutScope: 0 });
assert.deepEqual(F.corrections(base).map(c => [c.number, c.from, c.to, c.by]), [["R-003", "openings", "demolition", "Safi"]]);

// Pages.
fails(() => F.addPage(base, { sheet: " ", documentId: "d1", pageNumber: 9 }), "sheet", /sheet number/);
fails(() => F.addPage(base, { sheet: "A-101", revision: "02", documentId: "d1", pageNumber: 9 }), "sheet", /A-101 revision 02 is already/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "", pageNumber: 9 }), "document", /project file/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 0 }), "pageNumber", /from 1/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 1.5 }), "pageNumber", /from 1/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 3 }), "pageNumber", /Page 3 of that file/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 9, aspect: -1 }), "aspect", /positive/);
const paged = F.addPage(base, { sheet: " A-101 ", revision: "03", documentId: "d9", documentName: "Addendum 1.pdf", pageNumber: 1 });
assert.deepEqual((({ id, ...p }) => p)(paged.pages.at(-1)), { sheet: "A-101", title: "", discipline: "", revision: "03", documentId: "d9", documentName: "Addendum 1.pdf", pageNumber: 1, aspect: 1.5, image: null }, "A new revision of a sheet is its own page");

// Adding regions: an estimator's is reviewed as drawn; Structor's waits for review.
const input = { pageId: "pg-a-102", label: "  Roof hatch and ladder ", polygon: [{ x: 0.700004, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.2 }], packageId: "steel", scopeIds: ["scope-9", "scope-9"] };
fails(() => F.addRegion(base, proc, input, " ", at), "by", /who/);
fails(() => F.addRegion(base, proc, { ...input, pageId: "nope" }, "Naija", at), "page", /drawing page/);
fails(() => F.addRegion(base, proc, { ...input, label: " " }, "Naija", at), "label", /Name what/);
fails(() => F.addRegion(base, proc, { ...input, polygon: input.polygon.slice(0, 2) }, "Naija", at), "polygon", /three points/);
fails(() => F.addRegion(base, proc, { ...input, polygon: [...input.polygon.slice(1), { x: 1.2, y: 0.5 }] }, "Naija", at), "polygon", /on the page/);
fails(() => F.addRegion(base, proc, { ...input, polygon: [{ x: Infinity, y: 0 }, ...input.polygon.slice(1)] }, "Naija", at), "polygon", /on the page/);
fails(() => F.addRegion(base, proc, { ...input, polygon: [{ x: NaN, y: 0 }, ...input.polygon.slice(1)] }, "Naija", at), "polygon", /on the page/);
fails(() => F.addRegion(base, proc, { ...input, polygon: [{ x: "0.1", y: 0 }, ...input.polygon.slice(1)] }, "Naija", at), "polygon", /on the page/);
fails(() => F.addRegion(base, proc, { ...input, polygon: F.rectangle(0.5, 0.5, 0.005, 0.005) }, "Naija", at), "polygon", /too small/);
fails(() => F.addRegion(base, proc, { ...input, polygon: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }] }, "Naija", at), "polygon", /too small/);
fails(() => F.addRegion(base, proc, { ...input, packageId: "glazing" }, "Naija", at), "packageId", /responsible trade/);
fails(() => F.addRegion(base, proc, { ...input, scopeIds: ["scope-1"] }, "Naija", at), "scopeIds", /belongs to Demolition/);
fails(() => F.addRegion(base, proc, { ...input, scopeIds: ["scope-99"] }, "Naija", at), "scopeIds", /no longer exists/);
let s = freeze(F.addRegion(base, proc, { ...input, confidence: 0.4 }, "Naija", at));
const drawn = s.regions.at(-1);
assert.deepEqual([drawn.number, drawn.label, drawn.origin, drawn.status, drawn.reviewedBy, drawn.reviewedAt, drawn.confidence, drawn.scopeIds, drawn.polygon[0]],
  ["R-013", "Roof hatch and ladder", "estimator", "approved", "Naija", at, null, ["scope-9"], { x: 0.7, y: 0.1 }], "Estimator's region: reviewed, no confidence, 4-decimal points");
assert.deepEqual(drawn.history.map(e => e.kind), ["created", "linked"]);
assert.deepEqual(numbers(F.filterRegions(s, proc)), ["R-001", "R-002", "R-003", "R-004", "R-005", "R-006", "R-007", "R-013", "R-008", "R-009", "R-010", "R-011", "R-012"], "A later region sorts with its page");
assert.equal(F.addRegion(base, proc, { ...input, polygon: [...input.polygon].reverse() }, "Naija", at).regions.at(-1).polygon.length, 3, "Counter-clockwise points are fine");
assert.equal(F.addRegion({ ...base, lastRegionNumber: 20 }, proc, input, "Naija", at).regions.at(-1).number, "R-021", "Numbers follow the counter, never reused");
const aiInput = { pageId: "pg-p-101", label: "Floor drains", polygon: box, packageId: "plumbing", origin: "ai", evidence: "FD-1 tags", confidence: 0.58 };
fails(() => F.addRegion(base, proc, { ...aiInput, evidence: " " }, "Structor AI", at), "evidence", /supports this trade/);
fails(() => F.addRegion(base, proc, { ...aiInput, confidence: undefined }, "Structor AI", at), "confidence", /0 to 1/);
fails(() => F.addRegion(base, proc, { ...aiInput, confidence: 1.5 }, "Structor AI", at), "confidence", /0 to 1/);
const proposal = F.addRegion(base, proc, aiInput, "Structor AI", at).regions.at(-1);
assert.deepEqual([proposal.origin, proposal.status, proposal.reviewedBy, proposal.confidence], ["ai", "pending-review", null, 0.58]);

// Importing: all or nothing, errors name the region.
fails(() => F.importRegions(base, proc, [], "Structor AI", at), "region", /no regions/);
fails(() => F.importRegions(base, proc, [aiInput, { ...aiInput, packageId: "glazing" }], "Structor AI", at), "packageId", /^Region 2: Choose the responsible trade/);
const imported = F.importRegions(base, proc, [aiInput, { ...aiInput, label: "Hose bibbs" }], "Structor AI", at);
assert.deepEqual(numbers(imported.regions.slice(-2)), ["R-013", "R-014"]);

// Linking scope items: only the region's trade, or an all-trades item.
const r2 = byNumber(s, "R-002").id;
fails(() => F.linkScope(s, proc, r2, "scope-5", "Safi", at), "scopeIds", /belongs to Concrete/);
fails(() => F.linkScope(s, proc, "nope", "scope-3", "Safi", at), "region", /no longer exists/);
assert.equal(F.linkScope(s, proc, r2, "scope-2", "Safi", at), s, "Linking twice changes nothing");
s = freeze(F.linkScope(s, proc, r2, "scope-3", "Safi", at));
assert.deepEqual([byNumber(s, "R-002").scopeIds, byNumber(s, "R-002").history.at(-1)], [["scope-2", "scope-3"], { kind: "linked", at, by: "Safi", scopeId: "scope-3" }]);
assert.deepEqual(numbers(F.regionsForScope(s, "scope-3")), ["R-002"]);
const allTrades = freeze({ ...proc, scopes: proc.scopes.map(x => x.id === "scope-3" ? { ...x, allTrades: true } : x) });
assert.deepEqual(byNumber(F.linkScope(s, allTrades, byNumber(s, "R-004").id, "scope-3", "Safi", at), "R-004").scopeIds, ["scope-7", "scope-3"], "An all-trades item can sit on any trade");
const unlinked = F.unlinkScope(s, r2, "scope-3", "Safi", at);
assert.deepEqual([byNumber(unlinked, "R-002").scopeIds, byNumber(unlinked, "R-002").history.at(-1).kind], [["scope-2"], "unlinked"]);
assert.equal(F.unlinkScope(unlinked, r2, "scope-3", "Safi", at), unlinked, "Unlinking twice changes nothing");

// Contractor review: approve Structor's call.
fails(() => F.approveRegion(s, r2, "", at), "by", /who/);
s = freeze(F.approveRegion(s, r2, "Safi", at));
assert.deepEqual([byNumber(s, "R-002").status, byNumber(s, "R-002").reviewedBy, byNumber(s, "R-002").history.at(-1)], ["approved", "Safi", { kind: "approved", at, by: "Safi" }]);
fails(() => F.approveRegion(s, r2, "Safi", at), "region", /already approved/);

// Corrections: reassigning keeps the audit trail and drops scope items of the old trade.
const r5 = byNumber(s, "R-005").id;
fails(() => F.reassignRegion(s, proc, r5, "drywall", "Safi", "", at), "packageId", /already Drywall/);
fails(() => F.reassignRegion(s, proc, r5, "glazing", "Safi", "", at), "packageId", /responsible trade/);
fails(() => F.reassignRegion(s, proc, r5, "flooring", " ", "", at), "by", /who/);
const r6 = byNumber(s, "R-006").id;
s = freeze(F.reassignRegion(s, proc, r6, "carpentry", "Vijay", "  Wood base is carpentry.  ", "2026-10-01T16:00:00.000Z"));
const moved = byNumber(s, "R-006");
assert.deepEqual([moved.packageId, moved.scopeIds, moved.status, moved.reviewedBy, moved.confidence], ["carpentry", [], "approved", "Vijay", 0.77], "Reviewed by the correction; Structor's confidence stays on record");
assert.deepEqual(moved.history.at(-1), { kind: "reassigned", at: "2026-10-01T16:00:00.000Z", by: "Vijay", from: "flooring", to: "carpentry", reason: "Wood base is carpentry.", unlinked: ["scope-13"] });
assert.deepEqual(F.corrections(s).map(c => [c.number, c.from, c.to]), [["R-006", "flooring", "carpentry"], ["R-003", "openings", "demolition"]], "Newest first");
const keepsAll = F.reassignRegion(F.linkScope(s, allTrades, r5, "scope-3", "Safi", at), allTrades, r5, "flooring", "Safi", "", at);
assert.deepEqual(byNumber(keepsAll, "R-005").scopeIds, ["scope-3"], "All-trades items stay linked");
assert.deepEqual(byNumber(keepsAll, "R-005").history.at(-1).unlinked, ["scope-12"]);
assert.deepEqual(F.unlocatedScopes(s, proc).map(x => x.id), ["scope-6", "scope-8", "scope-10", "scope-13"], "R-006's old scope item is unlocated again; scope-3 and scope-9 now are");

// Notes.
const noted = F.editRegionNotes(s, r5, "  Check wall type 2 height. ", "Safi", at);
assert.deepEqual([byNumber(noted, "R-005").notes, byNumber(noted, "R-005").history.at(-1)], ["Check wall type 2 height.", { kind: "notes", at, by: "Safi", text: "Check wall type 2 height." }]);
assert.equal(F.editRegionNotes(noted, r5, "Check wall type 2 height.", "Safi", at), noted, "Unchanged notes add nothing");
assert.equal(byNumber(F.editRegionNotes(noted, r5, "", "Safi", at), "R-005").history.at(-1).text, "", "Clearing notes is recorded too");

console.log(`Drawing Flip checked: ${base.pages.length} pages, ${base.regions.length} regions; geometry, filters, scope highlight, missing scope, legend, pages, add/import, links, review, corrections, notes.`);
