// Marcel's issues log, item 19 (18 Nov): "make sure we have quantity take offs next to every item in the detailed
// scopes especially for subcontractor view". A quantity on each bid-form line: its rules, publishing, the
// subcontractor's view, the AI drawing quantities someone accepted, and Quantity takeoffs lines.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const P = await import("../lib/procurement.ts");
const Q = await import("../lib/scope-quantity.ts");
const X = await import("../lib/extraction.ts");
const B = await import("../lib/bid-portal.ts");
const { sampleExtraction } = await import("../lib/data/extraction.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleDrawingFlip } = await import("../lib/data/drawing-flip.ts");

const freeze = v => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-11-20T10:00:00.000Z", by = "Marcel Khoury";
const fails = (fn, pattern) => assert.throws(fn, e => e instanceof P.ProcurementRuleError && pattern.test(e.message), `expected ${pattern}`);
const item = (id, o = {}) => ({ id, packageId: "demo", title: o.title ?? `Item ${id}`, detail: o.detail ?? "", source: "AD-101", origin: "ai", status: o.status ?? "approved", allTrades: false, history: [], ...(o.quantity !== undefined ? { quantity: o.quantity } : {}) });
const base = freeze({
  packages: [{ id: "demo", name: "Demolition", division: "02", code: "02 41 19", owner: "Sadie", due: "" }],
  scopes: [item("w", { title: "Remove aluminum windows, frames and sashes" }), item("p", { title: "Remove asphalt pavement, full depth" }), item("a", { title: "Acknowledge the bid documents" })],
  invitations: [], outreach: [], notifications: [],
});
const scope = (s, id) => s.scopes.find(x => x.id === id);

// ── The rules ──
const one = P.setScopeQuantity(base, "w", { value: 14, unit: "ea", basis: "  AD-101:  14 windows counted on the east elevation " }, by, at);
assert.deepEqual(scope(one, "w").quantity, { value: 14, unit: "EA", basis: "AD-101: 14 windows counted on the east elevation", origin: "estimator", ref: null, checked: true }, "An estimator's figure, unit in capitals, checked");
assert.deepEqual([scope(one, "w").status, scope(one, "w").history.at(-1)], ["approved", { kind: "quantity", at, by, quantity: "14 EA" }], "The item keeps its approval; the history says what was set");
assert.equal(P.quantityLabel({ value: 18650.456, unit: "SF" }), "18,650.46 SF");
assert.equal(scope(P.setScopeQuantity(base, "p", { value: "18650.456", unit: "SF", basis: "CIV0102" }, by, at), "p").quantity.value, 18650.46, "Two decimals at most");
fails(() => P.setScopeQuantity(base, "w", { value: 0, unit: "EA", basis: "x" }, by), /greater than 0/);
fails(() => P.setScopeQuantity(base, "w", { value: NaN, unit: "EA", basis: "x" }, by), /greater than 0/);
fails(() => P.setScopeQuantity(base, "w", { value: 2.5, unit: "EA", basis: "x" }, by), /whole number/);
fails(() => P.setScopeQuantity(base, "w", { value: 2, unit: "", basis: "x" }, by), /unit/);
fails(() => P.setScopeQuantity(base, "w", { value: 2, unit: "SF", basis: "  " }, by), /where the quantity comes from/);
assert.equal(P.setScopeQuantity(one, "w", { value: 14, unit: "EA", basis: "AD-101: 14 windows counted on the east elevation" }, by), one, "The same figure again changes nothing");
const removed = P.setScopeQuantity(one, "w", null, by, at);
assert.deepEqual([scope(removed, "w").quantity, scope(removed, "w").history.at(-1).quantity], [null, ""], "Removed, and the history says so");

// ── Publishing: bidders get the quantity; a quantity nobody checked holds the form ──
const published = P.publishPackage(one, "demo", by, at);
const form = published.packages[0].published;
assert.deepEqual(form.items.map(i => i.quantity ?? null), [{ value: 14, unit: "EA" }, null, null], "The published line carries value and unit only: where it comes from stays with the team");
assert.equal(P.packageStatus(published, "demo"), "published");
const changed = P.setScopeQuantity(published, "w", { value: 16, unit: "EA", basis: "Recounted" }, by, at);
assert.deepEqual([P.packageStatus(changed, "demo"), scope(changed, "w").status], ["revised", "approved"], "A new quantity is a revision to publish; the line stays approved");
// A form published before quantities existed is unchanged by them: it still reads as published.
const older = { ...base, packages: [{ ...base.packages[0], published: { version: 1, at, by, items: base.scopes.map(({ id, title, detail, source }) => ({ id, title, detail, source })) } }] };
assert.equal(P.packageStatus(older, "demo"), "published", "Lines without a quantity publish exactly as before");
const fromTakeoff = P.setScopeQuantity(one, "p", { value: 18650, unit: "SF", basis: "Quantity takeoffs: Asphalt", origin: "takeoff", ref: "q2", checked: false }, by, at);
assert.deepEqual(P.publishBlockers(fromTakeoff, "demo"), ["1 quantity needs an estimator's check."], "An unchecked quantity holds publishing");
const checked = P.checkScopeQuantity(fromTakeoff, "p", "Sadie", at);
assert.deepEqual([scope(checked, "p").quantity.checked, scope(checked, "p").history.at(-1).kind, P.publishBlockers(checked, "demo")], [true, "quantity-checked", []]);
fails(() => P.checkScopeQuantity(base, "w", by), /no quantity/);

// ── The subcontractor's page shows the published quantity ──
const portal = B.portalView({
  invite: { id: "inv", projectName: "Maple Street", company: "Capital Demolition", contact: "", email: "", issuedAt: at, issuedBy: by, revoked: false },
  procurement: { ...published, invitations: [{ id: "i1", packageId: "demo", bidderId: "b1", status: "invited", invitedAt: at, by }] },
  submissions: [], messages: [], documents: [], invitationId: "i1",
});
assert.deepEqual(portal.form.items.map(i => i.quantity ?? null), [{ value: 14, unit: "EA" }, null, null]);
assert(!JSON.stringify(portal).includes("counted on the east elevation"), "The basis never reaches the subcontractor");

// ── From Quantity takeoffs ──
const rows = [
  { id: "q1", packageId: "demo", division: "02", item: "Existing building demolition (perimeter)", unit: "LF", quantity: 1240, rate: 14, source: "CIV0102", reviewed: true },
  { id: "q2", packageId: "demo", division: "02", item: "Asphalt pavement removal, full depth", unit: "sf", quantity: 18650, rate: 2.75, source: "CIV0102", reviewed: false },
  { id: "q3", packageId: "demo", division: "02", item: "Windows priced from scope", unit: "EA", quantity: 12, rate: 90, source: "", reviewed: true, origin: { kind: "scope", draftId: "d", scopeId: "w" } },
  { id: "q4", packageId: "concrete", division: "03", item: "Asphalt pavement patching", unit: "SF", quantity: 300, rate: 9, source: "", reviewed: true },
  { id: "q5", packageId: "demo", division: "02", item: "Unmeasured line", unit: "SF", quantity: 0, rate: 0, source: "", reviewed: false },
];
assert.deepEqual(Q.takeoffChoices(rows, scope(base, "p"), "demo").map(r => r.id), ["q2", "q1", "q3"], "This trade's lines with a quantity, the most alike first");
assert.deepEqual(Q.takeoffChoices(rows, scope(base, "w"), "demo")[0].id, "q3", "The line priced from this very item comes first");
const taken = P.setScopeQuantity(base, "p", Q.quantityFromTakeoff(rows[1]), by, at);
assert.deepEqual(scope(taken, "p").quantity, { value: 18650, unit: "SF", basis: "Quantity takeoffs: Asphalt pavement removal, full depth · CIV0102", origin: "takeoff", ref: "q2", checked: false }, "From a takeoff line not reviewed yet: unchecked");
assert.equal(scope(P.setScopeQuantity(base, "p", Q.quantityFromTakeoff(rows[0]), by, at), "p").quantity.checked, true, "From a reviewed line: checked");
assert.equal(Q.takeoffDrift(scope(taken, "p"), rows), null, "Agrees with its line");
assert.deepEqual(Q.takeoffDrift(scope(taken, "p"), rows.map(r => r.id === "q2" ? { ...r, quantity: 19100 } : r)), { kind: "changed", row: { ...rows[1], quantity: 19100 } }, "Says when the takeoff line changes");
assert.deepEqual(Q.takeoffDrift(scope(taken, "p"), rows.filter(r => r.id !== "q2")), { kind: "gone" }, "and when it's deleted");
assert.equal(Q.takeoffDrift(scope(one, "w"), rows), null, "An estimator's own figure has no line to follow");

// ── AI drawing quantities: on the scope item once someone accepts both ──
const records = freeze({ extraction: structuredClone(sampleExtraction), procurement: structuredClone(sampleProcurement), flip: structuredClone(sampleDrawingFlip) });
const framing = records.extraction.drafts.find(d => d.kind === "scope" && d.title.startsWith("Provide metal stud"));
const quantity = records.extraction.drafts.find(d => d.kind === "quantity");
const scopeFirst = X.acceptDraft(X.acceptDraft(records, framing.id, "Sadie", at), quantity.id, "Sadie", at);
const framed = scopeFirst.procurement.scopes.at(-1);
assert.deepEqual(framed.quantity, { value: 6840, unit: "SF", basis: "Interior partitions, metal stud and gypsum board (A1.1 p.46): Partition length on the plan × height to the underside of structure", origin: "ai", ref: quantity.id, checked: true,
  citation: { document: quantity.citations[0].document, page: 46, sheet: "A1.1", quote: "LOCKERS / CHANGE", fromImage: false } }, "Accepted after its scope line: the line gets it, checked by whoever accepted it, with the sheet to open");
const pendingOnly = X.acceptDraft(records, framing.id, "Sadie", at);
assert.equal(pendingOnly.procurement.scopes.at(-1).quantity, undefined, "A quantity still waiting for review stays off the line");
const quantityFirst = X.acceptDraft(X.acceptDraft(records, quantity.id, "Sadie", at), framing.id, "Sadie", at);
assert.deepEqual(quantityFirst.procurement.scopes.at(-1).quantity?.value, 6840, "Accepted before its scope line: the line gets it when it's accepted");
const own = P.setScopeQuantity(pendingOnly.procurement, pendingOnly.procurement.scopes.at(-1).id, { value: 7000, unit: "SF", basis: "Our takeoff" }, "Sadie", at);
assert.equal(X.acceptDraft({ ...pendingOnly, procurement: own }, quantity.id, "Sadie", at).procurement.scopes.at(-1).quantity.value, 7000, "Never over a figure already there");

// ── Find quantities with AI: one sheet a request, only what the sheet prints, the app does the arithmetic ──
const A = await import("../lib/quantity-ai.ts");
const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const sheetText = "DOOR SCHEDULE 101 102 103 HM-1 3'-0\" x 7'-0\" EAST ELEVATION REMOVE EXISTING WINDOW W1 TYP. 12'-6\" ASPHALT PAVING REMOVAL AREA 18,650 SF";
const items = [{ id: "w", title: "Remove aluminum windows", detail: "", source: "AD-101 · Keynote D.3" }, { id: "p", title: "Remove asphalt pavement", detail: "", source: "CIV0102" }, { id: "d", title: "Remove doors", detail: "", source: "AD-101" }];
const job = A.parseQuantityJob({ pkg: { id: "demo", name: "Demolition", code: "02 41 19" }, document: "Drawings.pdf", sheet: "AD-101", page: 4, text: sheetText, image: jpeg, items });
assert.throws(() => A.parseQuantityJob({ ...job, items: [] }), /1 to 40 scope lines/);
assert.throws(() => A.parseQuantityJob({ ...job, items: [items[0], items[0]] }), /unique/);
const prompt = JSON.stringify(A.quantityMessages(job));
assert(prompt.includes("w: Remove aluminum windows") && prompt.includes("[source: AD-101 · Keynote D.3]") && prompt.includes("Never scale or measure from the image") && prompt.includes(jpeg), "Each line with its source, the sheet's text and image, and the rules");
const screened = A.screenQuantities({ sheet: "AD-101", quantities: [
  { id: "w", unit: "ea", formula: "7 + 7", quote: "REMOVE EXISTING WINDOW W1", basis: "Counted the W1 tags on the east elevation." },
  { id: "p", unit: "SF", formula: "18,650", quote: "18,650 SF", basis: "Area printed in the paving removal note." },
  { id: "d", unit: "LF", formula: "2 * (3 + 7)", quote: "3'-0\" x 7'-0\"", basis: "Perimeter of one door opening as printed." },
  { id: "d", unit: "EA", formula: "3", quote: "101 102 103", basis: "Three doors in the schedule." },
  { id: "x", unit: "EA", formula: "4", quote: "W1", basis: "Not a line that was sent." },
] }, job);
assert.deepEqual(screened.quantities.map(q => [q.scopeId, q.value, q.unit, q.printed]), [["w", 14, "EA", true], ["p", 18650, "SF", true], ["d", 20, "LF", true]], "Counts, printed areas and printed dimensions, worked out by the app; quotes found in the sheet's text");
assert.deepEqual(screened.dropped.map(d => d.reason), ["Only one quantity per line and sheet.", "Not one of the scope lines sent."]);
const bad = (q) => A.screenQuantities({ quantities: [{ id: "w", unit: "EA", formula: "14", quote: "REMOVE EXISTING WINDOW", basis: "Counted the W1 tags on the elevation.", ...q }] }, job);
assert.match(bad({ unit: "TON" }).dropped[0].reason, /isn't SF, SY, LF, EA or CY/);
assert.match(bad({ formula: "" }).dropped[0].reason, /No arithmetic/);
assert.match(bad({ formula: "about 14" }).dropped[0].reason, /No arithmetic/);
assert.match(bad({ formula: "0" }).dropped[0].reason, /No arithmetic/);
assert.match(bad({ formula: "29 / 2" }).dropped[0].reason, /whole number/);
assert.match(bad({ quote: "" }).dropped[0].reason, /No printed words/);
assert.match(bad({ basis: "W1" }).dropped[0].reason, /No basis/);
assert.equal(bad({ quote: "SALVAGE HARDWARE TO OWNER" }).quantities[0].printed, false, "A quote the sheet's text doesn't hold is marked as read from the image");
assert.equal(bad({ quote: "12'-6\"" }).quantities[0].printed, true, "A short printed dimension is found");
assert.equal(A.screenQuantities({ sheet: "Z-999", quantities: [] }, job).sheet, "AD-101", "The sheet number stays the one sent unless the AI reads the same sheet");

// Which sheets: a line's own sheet, else the trade's; the busiest kept, in register order.
const doc = { id: "d1", name: "Drawings.pdf", kind: "drawings" };
const sheetRegister = ["G-001", "CIV0102", "AD-101", "AD-102", "A1.1"].map((sheet, i) => ({ sheet, title: sheet.startsWith("AD") ? "DEMOLITION PLAN" : "SHEET", discipline: "", date: "", doc, page: i + 1, revisions: 1 }));
const plan = A.quantityPlan(items, sheetRegister, { code: "02 41 19", sheets: ["AD-102"] });
assert.deepEqual(plan.map(p => [p.row.sheet, p.items.map(i => i.id)]), [["CIV0102", ["p"]], ["AD-101", ["w", "d"]]], "Lines go to the sheets their sources name");
const unsourced = items.map(i => ({ ...i, source: "02 41 19 · §3.2" }));
assert.deepEqual(A.quantityPlan(unsourced, sheetRegister, { code: "02 41 19", sheets: ["AD-102"] }).map(p => p.row.sheet), ["AD-102"], "Lines citing the specification go to the trade's own sheets");
assert.deepEqual(A.quantityPlan(items, sheetRegister, { code: "02 41 19" }, 1).map(p => p.row.sheet), ["AD-101"], "With room for one sheet, the one carrying the most lines");

// Onto the lines, Not checked; the cited sheet wins; a figure already there stays.
const where = { document: "Drawings.pdf", page: 4, sheet: "AD-101" };
const proposals = [
  { ...screened.quantities[0], ...where },
  { ...screened.quantities[1], ...where },
  { scopeId: "p", value: 18000, unit: "SF", formula: "18000", quote: "PAVING 18000 SF", basis: "Area printed on the civil plan note.", printed: false, document: "Drawings.pdf", page: 2, sheet: "CIV0102" },
  { scopeId: "a", value: 1, unit: "EA", formula: "1", quote: "BID FORM", basis: "One acknowledgement of the documents.", printed: true, ...where },
];
const civil = { ...published, scopes: published.scopes.map(s => s.id === "p" ? { ...s, source: "CIV0102 · Keynote 6" } : s) };
const ai = A.applyAiQuantities(civil, proposals, "Structor AI", at);
assert.deepEqual([ai.added, ai.kept], [2, 1], "Two lines proposed; the windows line kept its estimator's 14 EA");
assert.deepEqual(scope(ai.state, "w").quantity.origin, "estimator", "Never over a figure already there");
const paving = scope(ai.state, "p").quantity;
assert.deepEqual([paving.value, paving.origin, paving.checked, paving.citation], [18000, "ai", false, { document: "Drawings.pdf", page: 2, sheet: "CIV0102", quote: "PAVING 18000 SF", fromImage: true }], "The sheet the line cites wins, Not checked, with its sheet and quote to open");
assert.match(paving.basis, /^CIV0102: Area printed on the civil plan note\. Worked out as 18000\. The quoted words were read from the sheet image; they aren't in its text layer\. Also quantified on AD-101: 18,650 SF: check whether these add up or repeat\.$/, "The basis says what was read, the arithmetic, and the other sheet's figure");
assert.deepEqual(P.publishBlockers(ai.state, "demo"), ["2 quantities need an estimator's check."], "AI quantities hold publishing until checked");
assert.equal(scope(ai.state, "a").quantity.unit, "EA");

console.log("Scope quantities checked: an estimator's figure with its unit and basis, publishing it to bidders (value and unit only) and a revision when it changes, unchecked quantities holding the form, the subcontractor's page, Quantity takeoffs lines (most alike first, changes and deletions flagged), accepted AI drawing quantities on their lines, and Find quantities with AI: its request, screening (units, the app's arithmetic, whole counts, quotes, basis), sheet plan, and proposals Not checked with the cited sheet first.");
