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

// Sample: nine sheets from the project files, sixteen regions on trades and scope items that exist.
assert.deepEqual(base.pages.map(p => p.sheet), ["CIV0102", "A1.1", "A1.3", "A3.1", "A8.2", "S101", "M101", "P2.1", "E1.1"]);
for (const p of base.pages) {
  assert(initialDrawings.some(d => d.id === p.sheet), `${p.sheet} is on the List of drawings`);
  assert(sampleFiles.some(f => f.id === p.documentId && f.name === p.documentName), `${p.sheet} comes from a project file`);
}
assert.equal(base.regions.length, 16);
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
assert.deepEqual(F.bounds(byNumber(base, "R-010").polygon), { x: 0.47, y: 0.3, width: 0.15, height: 0.25 });

// Reading: filters, scope highlight, missing scope, legend, counts, correction log.
assert.deepEqual(numbers(F.filterRegions(base, proc, { pageId: "pg-civ0102" })), ["R-001", "R-002", "R-003"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { division: "09" })), ["R-005", "R-006", "R-013", "R-014", "R-015", "R-016"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { packageId: "drywall" })), ["R-005", "R-013", "R-014", "R-015", "R-016"], "Drywall on the plan and the reflected ceiling plan");
assert.deepEqual(numbers(F.filterRegions(base, proc, { status: "pending-review" })), ["R-002", "R-004", "R-006", "R-014", "R-007", "R-016", "R-008", "R-010", "R-011"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { origin: "estimator" })), ["R-012"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { corrected: true })), ["R-003"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { query: "pv array" })), ["R-007"]);
assert.deepEqual(numbers(F.filterRegions(base, proc, { query: "masonry" })), ["R-004"], "Searches the trade name");
assert.deepEqual(numbers(F.filterRegions(base, proc)), ["R-001", "R-002", "R-003", "R-004", "R-005", "R-006", "R-013", "R-014", "R-007", "R-015", "R-016", "R-008", "R-009", "R-010", "R-011", "R-012"], "Page order, then number");
assert.deepEqual(numbers(F.regionsForScope(base, "scope-4")), ["R-003"]);
assert.deepEqual(F.unlocatedScopes(base, proc).map(s => s.id), ["scope-3", "scope-6", "scope-8", "scope-9", "scope-10", "scope-22", "scope-23", "scope-24"], "Illustrative leveling-only scopes have no fabricated drawing regions");
assert.deepEqual(F.tradeLegend(base, proc, "pg-civ0102"), [{ packageId: "demolition", name: "Demolition", division: "02", regions: 3 }]);
assert.deepEqual(F.tradeLegend(base, proc, "pg-a1.1").map(t => t.packageId), ["masonry", "drywall", "flooring"], "By division, then name");
assert.deepEqual(F.flipSummary(base), { regions: 16, pendingReview: 9, approved: 7, corrected: 1, withoutScope: 1 });
assert.deepEqual(F.tradeLegend(base, proc, "pg-a3.1"), [{ packageId: "drywall", name: "Drywall", division: "09", regions: 2 }], "The reflected ceiling plan carries drywall ceilings");
assert(proc.scopes.filter(x => x.packageId === "drywall").every(x => F.regionsForScope(base, x.id).length), "Every drywall bid-form item is located on a drawing");
assert.deepEqual(F.flipSummary(base, "pg-civ0102"), { regions: 3, pendingReview: 1, approved: 2, corrected: 1, withoutScope: 0 });
assert.deepEqual(F.corrections(base).map(c => [c.number, c.from, c.to, c.by]), [["R-003", "concrete", "demolition", "Sadie"]]);

// Pages.
fails(() => F.addPage(base, { sheet: " ", documentId: "d1", pageNumber: 9 }), "sheet", /sheet number/);
fails(() => F.addPage(base, { sheet: "A1.1", revision: "GMP 12-09-2025", documentId: "d1", pageNumber: 9 }), "sheet", /A1.1 revision GMP 12-09-2025 is already/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "", pageNumber: 9 }), "document", /project file/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 0 }), "pageNumber", /from 1/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 1.5 }), "pageNumber", /from 1/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "jrc-drawings-251209", pageNumber: 46 }), "pageNumber", /Page 46 of that file/);
fails(() => F.addPage(base, { sheet: "A-201", documentId: "d1", pageNumber: 9, aspect: -1 }), "aspect", /positive/);
const paged = F.addPage(base, { sheet: " A1.1 ", revision: "03", documentId: "d9", documentName: "Addendum 1.pdf", pageNumber: 1 });
assert.deepEqual((({ id, ...p }) => p)(paged.pages.at(-1)), { sheet: "A1.1", title: "", discipline: "", revision: "03", documentId: "d9", documentName: "Addendum 1.pdf", pageNumber: 1, aspect: 1.5, image: null }, "A new revision of a sheet is its own page");

// Adding regions: an estimator's is reviewed as drawn; Structor's waits for review.
const input = { pageId: "pg-a1.3", label: "  Roof hatch and ladder ", polygon: [{ x: 0.700004, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.2 }], packageId: "steel", scopeIds: ["scope-9", "scope-9"] };
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
fails(() => F.addRegion(base, proc, { ...input, packageId: "no-such-trade" }, "Naija", at), "packageId", /responsible trade/);
fails(() => F.addRegion(base, proc, { ...input, scopeIds: ["scope-1"] }, "Naija", at), "scopeIds", /belongs to Demolition/);
fails(() => F.addRegion(base, proc, { ...input, scopeIds: ["scope-99"] }, "Naija", at), "scopeIds", /no longer exists/);
let s = freeze(F.addRegion(base, proc, { ...input, confidence: 0.4 }, "Naija", at));
const drawn = s.regions.at(-1);
assert.deepEqual([drawn.number, drawn.label, drawn.origin, drawn.status, drawn.reviewedBy, drawn.reviewedAt, drawn.confidence, drawn.scopeIds, drawn.polygon[0]],
  ["R-017", "Roof hatch and ladder", "estimator", "approved", "Naija", at, null, ["scope-9"], { x: 0.7, y: 0.1 }], "Estimator's region: reviewed, no confidence, 4-decimal points");
assert.deepEqual(drawn.history.map(e => e.kind), ["created", "linked"]);
assert.deepEqual(numbers(F.filterRegions(s, proc)), ["R-001", "R-002", "R-003", "R-004", "R-005", "R-006", "R-013", "R-014", "R-007", "R-017", "R-015", "R-016", "R-008", "R-009", "R-010", "R-011", "R-012"], "A later region sorts with its page");
assert.equal(F.addRegion(base, proc, { ...input, polygon: [...input.polygon].reverse() }, "Naija", at).regions.at(-1).polygon.length, 3, "Counter-clockwise points are fine");
assert.equal(F.addRegion({ ...base, lastRegionNumber: 20 }, proc, input, "Naija", at).regions.at(-1).number, "R-021", "Numbers follow the counter, never reused");
const aiInput = { pageId: "pg-p2.1", label: "Floor drains", polygon: box, packageId: "plumbing", origin: "ai", evidence: "FD-1 tags", confidence: 0.58 };
fails(() => F.addRegion(base, proc, { ...aiInput, evidence: " " }, "Structor AI", at), "evidence", /supports this trade/);
fails(() => F.addRegion(base, proc, { ...aiInput, confidence: undefined }, "Structor AI", at), "confidence", /0 to 1/);
fails(() => F.addRegion(base, proc, { ...aiInput, confidence: 1.5 }, "Structor AI", at), "confidence", /0 to 1/);
const proposal = F.addRegion(base, proc, aiInput, "Structor AI", at).regions.at(-1);
assert.deepEqual([proposal.origin, proposal.status, proposal.reviewedBy, proposal.confidence], ["ai", "pending-review", null, 0.58]);

// Importing: all or nothing, errors name the region.
fails(() => F.importRegions(base, proc, [], "Structor AI", at), "region", /no regions/);
fails(() => F.importRegions(base, proc, [aiInput, { ...aiInput, packageId: "no-such-trade" }], "Structor AI", at), "packageId", /^Region 2: Choose the responsible trade/);
const imported = F.importRegions(base, proc, [aiInput, { ...aiInput, label: "Hose bibbs" }], "Structor AI", at);
assert.deepEqual(numbers(imported.regions.slice(-2)), ["R-017", "R-018"]);

// Linking scope items: only the region's trade, or an all-trades item.
const r2 = byNumber(s, "R-002").id;
fails(() => F.linkScope(s, proc, r2, "scope-5", "Sadie", at), "scopeIds", /belongs to Concrete/);
fails(() => F.linkScope(s, proc, "nope", "scope-3", "Sadie", at), "region", /no longer exists/);
assert.equal(F.linkScope(s, proc, r2, "scope-2", "Sadie", at), s, "Linking twice changes nothing");
s = freeze(F.linkScope(s, proc, r2, "scope-3", "Sadie", at));
assert.deepEqual([byNumber(s, "R-002").scopeIds, byNumber(s, "R-002").history.at(-1)], [["scope-2", "scope-3"], { kind: "linked", at, by: "Sadie", scopeId: "scope-3" }]);
assert.deepEqual(numbers(F.regionsForScope(s, "scope-3")), ["R-002"]);
const allTrades = freeze({ ...proc, scopes: proc.scopes.map(x => x.id === "scope-3" ? { ...x, allTrades: true } : x) });
assert.deepEqual(byNumber(F.linkScope(s, allTrades, byNumber(s, "R-004").id, "scope-3", "Sadie", at), "R-004").scopeIds, ["scope-7", "scope-3"], "An all-trades item can sit on any trade");
const unlinked = F.unlinkScope(s, r2, "scope-3", "Sadie", at);
assert.deepEqual([byNumber(unlinked, "R-002").scopeIds, byNumber(unlinked, "R-002").history.at(-1).kind], [["scope-2"], "unlinked"]);
assert.equal(F.unlinkScope(unlinked, r2, "scope-3", "Sadie", at), unlinked, "Unlinking twice changes nothing");

// Contractor review: approve Structor's call.
fails(() => F.approveRegion(s, r2, "", at), "by", /who/);
s = freeze(F.approveRegion(s, r2, "Sadie", at));
assert.deepEqual([byNumber(s, "R-002").status, byNumber(s, "R-002").reviewedBy, byNumber(s, "R-002").history.at(-1)], ["approved", "Sadie", { kind: "approved", at, by: "Sadie" }]);
fails(() => F.approveRegion(s, r2, "Sadie", at), "region", /already approved/);

// Corrections: reassigning keeps the audit trail and drops scope items of the old trade.
const r5 = byNumber(s, "R-005").id;
fails(() => F.reassignRegion(s, proc, r5, "drywall", "Sadie", "", at), "packageId", /already Drywall/);
fails(() => F.reassignRegion(s, proc, r5, "no-such-trade", "Sadie", "", at), "packageId", /responsible trade/);
fails(() => F.reassignRegion(s, proc, r5, "flooring", " ", "", at), "by", /who/);
const r6 = byNumber(s, "R-006").id;
s = freeze(F.reassignRegion(s, proc, r6, "carpentry", "Victor", "  Wood base is carpentry.  ", "2026-10-01T16:00:00.000Z"));
const moved = byNumber(s, "R-006");
assert.deepEqual([moved.packageId, moved.scopeIds, moved.status, moved.reviewedBy, moved.confidence], ["carpentry", [], "approved", "Victor", 0.77], "Reviewed by the correction; Structor's confidence stays on record");
assert.deepEqual(moved.history.at(-1), { kind: "reassigned", at: "2026-10-01T16:00:00.000Z", by: "Victor", from: "flooring", to: "carpentry", reason: "Wood base is carpentry.", unlinked: ["scope-13"] });
assert.deepEqual(F.corrections(s).map(c => [c.number, c.from, c.to]), [["R-006", "flooring", "carpentry"], ["R-003", "concrete", "demolition"]], "Newest first");
const keepsAll = F.reassignRegion(F.linkScope(s, allTrades, r5, "scope-3", "Sadie", at), allTrades, r5, "flooring", "Sadie", "", at);
assert.deepEqual(byNumber(keepsAll, "R-005").scopeIds, ["scope-3"], "All-trades items stay linked");
assert.deepEqual(byNumber(keepsAll, "R-005").history.at(-1).unlinked, ["scope-12"]);
assert.deepEqual(F.unlocatedScopes(s, proc).map(x => x.id), ["scope-6", "scope-8", "scope-10", "scope-13", "scope-22", "scope-23", "scope-24"], "Moved scope and illustrative leveling items stay unlocated");

// Redraw: a new outline keeps the region's number, trade, scope links and review state; the old one stays in its history.
const r1 = s.regions.find(r => r.status === "pending-review" && r.scopeIds.length);
assert(r1, "Fixture: a pending region with scope links");
const tight = [{ x: 0.21, y: 0.2 }, { x: 0.33333, y: 0.2 }, { x: 0.3, y: 0.31 }];
const redrawn = freeze(F.redrawRegion(s, r1.id, tight, "Sadie", "  Tighter around the curb. ", at));
const after = redrawn.regions.find(r => r.id === r1.id);
assert.deepEqual(after.polygon, [{ x: 0.21, y: 0.2 }, { x: 0.3333, y: 0.2 }, { x: 0.3, y: 0.31 }], "Rounded to 4 decimals");
assert.deepEqual([after.number, after.packageId, after.scopeIds, after.status, after.reviewedBy, after.confidence], [r1.number, r1.packageId, r1.scopeIds, r1.status, r1.reviewedBy, r1.confidence], "Only the outline changes");
assert.deepEqual(after.history.slice(0, -1), r1.history, "Earlier history kept");
assert.deepEqual(after.history.at(-1), { kind: "redrawn", at, by: "Sadie", from: r1.polygon, reason: "Tighter around the curb." });
assert.equal(redrawn.regions.filter(r => r.id !== r1.id).every((r, i) => r === s.regions.filter(x => x.id !== r1.id)[i]), true, "Other regions untouched");
assert.equal(F.redrawRegion(redrawn, r1.id, after.polygon, "Sadie", "", at), redrawn, "Same outline adds nothing");
assert.equal(F.filterRegions(redrawn, proc, { corrected: true }).some(r => r.id === r1.id), F.filterRegions(s, proc, { corrected: true }).some(r => r.id === r1.id), "A redraw is not a trade correction");
fails(() => F.redrawRegion(s, r1.id, tight, " ", "", at), "by", /who/);
fails(() => F.redrawRegion(s, r1.id, tight.slice(0, 2), "Sadie", "", at), "polygon", /three points/);
fails(() => F.redrawRegion(s, r1.id, [{ x: 0.1, y: 0.1 }, { x: 1.2, y: 0.1 }, { x: 0.1, y: 0.5 }], "Sadie", "", at), "polygon", /on the page/);
fails(() => F.redrawRegion(s, r1.id, F.rectangle(0.5, 0.5, 0.001, 0.001), "Sadie", "", at), "polygon", /too small/);
fails(() => F.redrawRegion(s, "gone", tight, "Sadie", "", at), "region", /no longer exists/);

// Notes.
const noted = F.editRegionNotes(s, r5, "  Check wall type 2 height. ", "Sadie", at);
assert.deepEqual([byNumber(noted, "R-005").notes, byNumber(noted, "R-005").history.at(-1)], ["Check wall type 2 height.", { kind: "notes", at, by: "Sadie", text: "Check wall type 2 height." }]);
assert.equal(F.editRegionNotes(noted, r5, "Check wall type 2 height.", "Sadie", at), noted, "Unchanged notes add nothing");
assert.equal(byNumber(F.editRegionNotes(noted, r5, "", "Sadie", at), "R-005").history.at(-1).text, "", "Clearing notes is recorded too");

// Marcel, 22 Oct: every stored sheet is a page. New sheets come in at their current version; a page without
// regions follows its sheet to the current version; a page with regions stays on the version they were drawn on.
const reg = (sheet, docId, page, revisions = 1, title = sheet) => ({ sheet, title, discipline: "Architectural", date: "", doc: { id: docId, name: `${docId}.pdf` }, page, revisions });
const jrc = base.pages.find(p => p.sheet === "A1.1");
const stored = [reg("A1.1", "asi01", 1, 2), reg("A3.1", "asi01", 2, 2, "Reflected ceiling plan"), reg("A-201", "asi01", 3), reg("CIV0102", jrc.documentId, base.pages.find(p => p.sheet === "CIV0102").pageNumber)];
const a31 = base.pages.find(p => p.sheet === "A3.1");
const bare = { ...base, regions: base.regions.filter(r => r.pageId !== a31.id) };
assert(bare.regions.some(r => r.pageId === jrc.id), "Fixture: A1.1 keeps its regions, A3.1 has none");
const all = F.withStoredPages(bare, stored);
const pageOf = (s, sheet) => s.pages.find(p => p.sheet === sheet);
assert.deepEqual([all.pages.length, pageOf(all, "A-201").id, pageOf(all, "A-201").revision, pageOf(all, "A-201").documentId, pageOf(all, "A-201").source], [bare.pages.length + 1, "sheet-a201", "V1", "asi01", "uploaded"], "A stored sheet missing from Drawing Flip becomes a page");
assert.deepEqual([pageOf(all, "A3.1").documentId, pageOf(all, "A3.1").pageNumber, pageOf(all, "A3.1").revision, pageOf(all, "A3.1").id], ["asi01", 2, "V2", a31.id], "A page without regions moves to the current version, keeping its id");
assert.deepEqual(pageOf(all, "A1.1"), jrc, "A page with regions stays on the version they were drawn on");
assert.equal(F.withStoredPages(all, stored), all, "Nothing to add: the same state");
assert.equal(F.withStoredPages(base, []), base, "No stored drawings: the sample pages as they are");
const onNew = F.addRegion(all, proc, { pageId: "sheet-a201", label: "New partitions", polygon: F.rectangle(0.2, 0.2, 0.2, 0.2), packageId: "drywall" }, "Sadie", at);
assert.equal(onNew.regions.at(-1).pageId, "sheet-a201", "Regions go on any stored sheet");
console.log(`Drawing Flip checked: ${base.pages.length} pages, ${base.regions.length} regions; geometry, filters, scope highlight, missing scope, legend, pages, add/import, links, review, corrections, redraw, notes.`);
