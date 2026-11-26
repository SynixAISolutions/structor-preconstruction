// Marcel's issues log, item 16 (18 Nov): "Have the take off be very detailed like the scopes written for every trade, and
// make sure it divides them up by trade where could add unit prices and get a rough idea for plugs in leveling". A unit
// price on every bid-form line (never shown to bidders), each trade's takeoff from its own lines, the prices offered,
// a plug from the line itself, the unit cost database, and his ROM unit-pricing workbook, read back cell by cell.
import assert from "node:assert/strict";
import { register } from "node:module";
import { unzipSync, strFromU8 } from "fflate";
import XLSX from "xlsx";

register("./ts-resolver.mjs", import.meta.url);
const P = await import("../lib/procurement.ts");
const T = await import("../lib/takeoff-by-trade.ts");
const W = await import("../lib/takeoff-workbook.ts");
const U = await import("../lib/unit-costs.ts");
const R = await import("../lib/repeated-lines.ts");

const freeze = v => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-11-26T10:00:00.000Z", later = "2026-11-26T11:00:00.000Z", by = "Marcel Khoury";
const fails = (fn, pattern) => assert.throws(fn, e => e instanceof P.ProcurementRuleError && pattern.test(e.message), `expected ${pattern}`);
const item = (id, o = {}) => ({ id, packageId: o.packageId ?? "dry", title: o.title ?? `Item ${id}`, detail: "", source: o.source ?? "A-101", origin: "ai", status: o.status ?? "approved", allTrades: !!o.allTrades, history: [], ...(o.quantity ? { quantity: o.quantity } : {}) });
const qty = (value, unit, o = {}) => ({ value, unit, basis: "A-101: measured", origin: "estimator", ref: null, checked: true, ...o });
const base = freeze({
  packages: [
    { id: "dry", name: "Drywall", division: "09", code: "09 21 16", owner: "Sadie", due: "2026-12-10" },
    { id: "act", name: "Acoustical ceilings", division: "09", code: "09 51 13", owner: "Victor", due: "" },
  ],
  scopes: [
    item("walls", { title: "Unit demising partitions, Type 3A", quantity: qty(85000, "SF") }),
    item("shaft", { title: "Shaft wall at elevator and stairs", quantity: qty(2300, "SF", { checked: false, origin: "takeoff", ref: "q14" }) }),
    item("blocking", { title: "TV blocking 4 x 4", quantity: qty(108, "EA"), status: "draft" }),
    item("doors", { title: "Install drywall access doors", source: "09 29 00 · §3.4" }),
    item("clean", { title: "Clean up daily and remove debris", allTrades: true }),
    item("act1", { packageId: "act", title: "Common corridors ACT ceiling", quantity: qty(13000, "SF") }),
  ],
  invitations: [], outreach: [], notifications: [],
});
const scope = (s, id) => s.scopes.find(x => x.id === id);

// ── A unit price on a line ──
let s = P.setScopeUnitPrice(base, "walls", { rate: 6.255 }, by, at);
assert.deepEqual(scope(s, "walls").unitPrice, { rate: 6.26, unit: "SF", basis: "Entered by an estimator", origin: "estimator", by, at }, "Per the quantity's unit, to the cent, who and when");
assert.deepEqual(scope(s, "walls").history.at(-1), { kind: "unit-price", at, by, price: "$6.26 / SF" });
assert.equal(scope(s, "walls").status, "approved", "Pricing a line leaves its approval");
assert.equal(P.setScopeUnitPrice(s, "walls", { rate: 6.26 }, by, later), s, "The same price again changes nothing");
fails(() => P.setScopeUnitPrice(base, "doors", { rate: 40 }, by, at), /quantity first/);
fails(() => P.setScopeUnitPrice(base, "walls", { rate: 0 }, by, at), /greater than \$0/);
fails(() => P.setScopeUnitPrice(base, "walls", { rate: Number.NaN }, by, at), /greater than \$0/);
s = P.setScopeUnitPrice(s, "shaft", { rate: 16.5, origin: "estimate", basis: 'Rate of the Quantity takeoffs line "Shaft wall"' }, by, at);
s = P.setScopeUnitPrice(s, "blocking", { rate: 45 }, by, at);
s = P.setScopeUnitPrice(s, "act1", { rate: 4.1, origin: "benchmark" }, by, at);
assert.equal(scope(s, "act1").unitPrice.basis, "Unit cost database");
assert.equal(P.unitPriceLabel({ rate: 1250, unit: "EA" }), "$1,250 / EA");
const cleared = P.setScopeUnitPrice(s, "blocking", null, by, later);
assert.equal(scope(cleared, "blocking").unitPrice, null);
assert.deepEqual(scope(cleared, "blocking").history.at(-1), { kind: "unit-price", at: later, by, price: "" });
assert.equal(P.setScopeUnitPrice(base, "doors", null, by, at), base, "Nothing to clear, nothing changed");
freeze(s);

// Bidders never see it: the published form carries the quantity only.
const published = P.publishPackage(P.setScopeQuantity(s, "doors", { value: 40, unit: "EA", basis: "09 29 00 §3.4: 40 doors" }, by, at), "act", by, at);
const sent = published.packages.find(p => p.id === "act").published.items;
assert.deepEqual(sent.find(i => i.id === "act1"), { id: "act1", title: "Common corridors ACT ceiling", detail: "", source: "A-101", quantity: { value: 13000, unit: "SF" } });
assert.ok(!JSON.stringify(sent).includes("4.1"), "No unit price leaves with the form");
assert.equal(R.mergeable({ ...scope(s, "walls"), origin: "ai", status: "draft", history: [], quantity: null }), false, "A priced line is never merged away");

// ── The trade's takeoff ──
const dry = T.tradeTakeoff(s, "dry");
assert.deepEqual(dry.lines.map(l => [l.number, l.item.id, l.extended, l.issue]), [
  [1, "walls", 532100, null], [2, "shaft", 37950, null], [3, "blocking", 4860, null], [4, "doors", null, "no-quantity"],
], "Its own lines in order, not the lines for every trade; quantity × price to the cent");
assert.deepEqual([dry.total, dry.quantified, dry.priced, dry.unchecked, dry.approved], [574910, 3, 3, 1, 3]);
assert.deepEqual(T.tradeTakeoff(s, "dry", true).lines.map(l => l.item.id), ["walls", "shaft", "doors"], "Approved lines only, when asked");
const relabelled = P.setScopeQuantity(s, "walls", { value: 1200, unit: "LF", basis: "A-101: measured" }, by, later);
assert.deepEqual(T.lineExtended(scope(relabelled, "walls")), { extended: null, issue: "unit-changed" }, "A price per SF says nothing about LF");
assert.equal(T.tradeTakeoff(relabelled, "dry").total, 42810);
assert.equal(T.lineExtended({ quantity: qty(3, "EA"), unitPrice: { rate: 0.1, unit: "ea" } }).extended, 0.3, "Cents, not floating point");
assert.deepEqual(T.takeoffByTrade(s).map(t => [t.packageId, t.total]), [["dry", 574910], ["act", 53300]]);
assert.equal(T.tradeTakeoff(s, "gone").lines.length, 0);

// ── Prices offered, never filled in ──
const rows = [{ id: "q14", division: "09 · Finishes", packageId: "dry", item: "Shaft wall at elevator and stairs", unit: "sf", quantity: 2300, rate: 16.5, source: "A1.1", reviewed: false }];
const entry = (rate, projectId, project, date = "2026-03-01") => ({ id: `${projectId}-${rate}`, item: "Shaft wall at elevator and stairs", unit: "SF", rate, division: "09", project, projectId, location: "DC", taxStatus: null, certifications: [], date, by, source: "Estimate" });
const list = U.benchmarks([entry(15, "p1", "Jelleff"), entry(18, "p2", "Whittier"), entry(17, "p3", "Maple")]);
const offered = T.priceSuggestions(scope(base, "shaft"), "09", rows, list);
assert.deepEqual(offered.map(o => [o.origin, o.rate]), [["estimate", 16.5], ["benchmark", 17]]);
assert.match(offered[0].basis, /"Shaft wall at elevator and stairs" \(not reviewed yet\)/);
assert.match(offered[1].basis, /median of 3 prices from 3 jobs, \$15–\$18/);
assert.deepEqual(T.priceSuggestions(scope(base, "doors"), "09", rows, list), [], "No quantity, no price");
assert.deepEqual(T.priceSuggestions({ ...scope(base, "shaft"), quantity: qty(2300, "LF", { origin: "takeoff", ref: "q14" }) }, "09", rows, list), [], "Never a price per another unit");

// ── A plug from the line itself ──
const plug = T.linePlug(scope(s, "shaft"));
assert.deepEqual([plug.quantity, plug.unit, plug.rate, plug.checked], [2300, "SF", 16.5, false]);
assert.match(plug.source, /^This line's takeoff: 2,300 SF \(A-101: measured; not checked yet\) × \$16\.50 \/ SF \(Rate of/);
assert.deepEqual([T.linePlug(scope(base, "walls")).rate, T.linePlug(scope(relabelled, "walls")).rate], [null, null], "Unpriced, or priced per another unit: the quantity only");
assert.equal(T.linePlug(scope(base, "doors")), null);
assert.equal(T.linePlug(undefined), null);

// ── The unit cost database keeps the estimators' own prices ──
const project = { id: "penn", name: "2626 Penn Ave", location: "DC", taxStatus: null, certifications: ["CBE"] };
const two = P.setScopeUnitPrice(P.addScope(s, { packageId: "dry", title: "Unit demising partitions, type 3A" }, by, at), "walls", { rate: 6.4 }, by, later);
const kept = U.entriesFromTakeoff(two, project, "2026-11-26", by);
assert.deepEqual(kept.entries.map(e => [e.item, e.unit, e.rate, e.division]), [["Unit demising partitions, Type 3A", "SF", 6.4, "09"], ["TV blocking 4 x 4", "EA", 45, "09"]], "Typed prices only; the newest stands");
assert.equal(kept.picked, 2, "The benchmark and estimate-line prices are counted, not kept");
assert.equal(kept.entries[0].id, U.entriesFromEstimate([{ id: "x", division: "09", item: "Unit demising partitions, Type 3A", unit: "SF", quantity: 1, rate: 6, source: "", reviewed: true }], project, "2026-11-26", by).entries[0].id, "One price per job per item, whichever list it came from");

// ── His workbook ──
assert.equal(W.dueLabel("2026-12-10"), "Thursday, December 10, 2026");
assert.equal(W.dueLabel(" next week "), "next week");
assert.equal(W.laborBasisOf({ kickoff: { wageScale: true, wageScaleType: "Davis-Bacon wages" }, certifications: ["CBE", "First Source"], certificationTargets: { CBE: 35 } }), "Davis-Bacon wages rates apply; CBE 35% required; First Source required");
assert.equal(W.laborBasisOf({ kickoff: { wageScale: null, wageScaleType: "" }, certifications: [], certificationTargets: {} }), "", "Nothing said, nothing written");
const tricky = P.addScope(s, { packageId: "dry", title: 'Patch "existing" walls <A&B>\u0007 at level 2' }, by, at);
const input = { project: { name: "2626 Penn Ave", location: "Washington, DC" }, pricingDue: W.dueLabel("2026-12-10"), laborBasis: "No wage scale", trades: [T.tradeTakeoff(tricky, "dry"), T.tradeTakeoff(tricky, "act")] };
const forBidders = W.takeoffWorkbook({ ...input, includeRates: false });
const internal = W.takeoffWorkbook({ ...input, includeRates: true });
const book = XLSX.read(forBidders, { type: "array", cellFormula: true });
assert.deepEqual(book.SheetNames, ["START HERE", "09 21 16 Drywall", "09 51 13 Acoustical ceilings"]);
const cover = book.Sheets["START HERE"], tab = book.Sheets["09 21 16 Drywall"];
assert.equal(cover.A1.v, "2626 PENN AVE | ROM UNIT PRICING");
assert.deepEqual([cover.A3.v, cover.B3.v, cover.A4.v, cover.B4.v, cover.A8.v, cover.B8.v], ["PROJECT", "2626 Penn Ave · Washington, DC", "PRICING DUE", "Thursday, December 10, 2026", "LABOR BASIS", "No wage scale"]);
const rowsOf = sheet => XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
const coverRows = rowsOf(cover);
assert.deepEqual(coverRows.slice(-2).map(r => r.slice(0, 3)), [["09 21 16", "Drywall", 5], ["09 51 13", "Acoustical ceilings", 1]], "The trade tabs and their line counts");
assert.equal(tab.A1.v, "09 21 16 | DRYWALL");
assert.match(tab.A2.v, /^Enter yellow cells only/);
assert.deepEqual(rowsOf(tab)[3], ["#", "Scope Description", "GC Qty", "Unit", "Bidder Qty", "Unit Price ($)", "Extended ($)", "Scope Status", "Qualifications / Assumptions", "Reference"]);
assert.deepEqual(["A5", "B5", "C5", "D5", "E5", "F5", "H5", "J5"].map(c => tab[c]?.v ?? ""), [1, "Unit demising partitions, Type 3A", 85000, "SF", 85000, "", "Included", "A-101"], "The bidders' copy has no unit price");
assert.equal(tab.G5.f, 'IF(OR(E5="",F5=""),"",E5*F5)');
assert.deepEqual(["C8", "D8", "E8", "J8"].map(c => tab[c]?.v ?? ""), ["", "", "", "09 29 00 · §3.4"], "A line without a quantity is left for the bidder");
assert.equal(tab.B9.v, 'Patch "existing" walls <A&B> at level 2', "Quotes, brackets and ampersands survive; control characters don't");
assert.deepEqual([tab.B10.v, tab.G10.f], ["BASE SCOPE SUBTOTAL", "SUM(G5:G9)"]);
assert.deepEqual([tab.B12.v, tab.A13.v, tab.D13.v, tab.E13.v], ["ADDITIONAL ALLOWANCES / ALTERNATES (identify separately)", "ALT", "LS", 1]);
assert.deepEqual([tab.B17.v, tab.G17.f, tab.B18.v, tab.G18.f], ["ADDITIONAL ALLOWANCES TOTAL", "SUM(G13:G16)", "TOTAL INCLUDING ADDITIONAL ALLOWANCES", "G10+G17"]);
assert.equal(tab.B20.v, "Trade qualifications / exclusions:");
const inside = XLSX.read(internal, { type: "array", cellFormula: true }).Sheets["09 21 16 Drywall"];
assert.deepEqual([inside.F5.v, inside.G5.v, inside.F6.v, inside.G6.v, inside.G10.v], [6.26, 532100, 16.5, 37950, 574910], "The internal copy carries the prices, and the sums before Excel recalculates");
assert.match(inside.A2.v, /^INTERNAL COPY/);
// What the xlsx package doesn't read back: the yellow cells, the drop-down, Excel's recalculation, the frozen header.
const parts = unzipSync(forBidders), xml = strFromU8(parts["xl/worksheets/sheet2.xml"]), styles = strFromU8(parts["xl/styles.xml"]);
assert.match(styles, /<fgColor rgb="FFFFFF99"\/>/);
const fillOf = ref => { const s = Number(new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(xml)?.[1] ?? 0); return /fillId="(\d+)"/.exec([...styles.matchAll(/<xf numFmtId[^>]*>/g)].slice(1)[s]?.[0] ?? "")?.[1]; };
assert.deepEqual(["E5", "F5", "H5", "I5", "B13", "B3"].map(fillOf), ["2", "2", "2", "2", "2", "2"], "Bidder Qty, Unit Price, Scope Status, Qualifications, alternates and the bidder's name are yellow");
assert.deepEqual(["B5", "C5", "G5"].map(fillOf), ["0", "0", "0"], "The GC's columns and the formulas aren't");
assert.match(xml, /<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="H5:H9 H13:H16"><formula1>&quot;Included,Excluded,By Others,Clarify&quot;<\/formula1>/);
assert.match(xml, /<pane ySplit="4" topLeftCell="A5"/);
assert.match(strFromU8(parts["xl/workbook.xml"]), /fullCalcOnLoad="1"/);
assert.ok(!/\u0007/.test(xml));
assert.equal(W.workbookName("2626 Penn/Ave", true), "2626 Penn Ave takeoff by trade (internal, with unit prices).xlsx");
const empty = XLSX.read(W.takeoffWorkbook({ ...input, trades: [T.tradeTakeoff(base, "gone")], includeRates: false }), { type: "array" });
assert.equal(empty.Sheets[empty.SheetNames[1]].B5.v, "No detailed scope lines for this trade yet.");

console.log("Takeoff by trade checked: a unit price per line (per its quantity's unit, never sent to bidders), each trade's takeoff from its own lines to the cent, prices offered from the estimate line and the unit cost database, a plug from the line itself, typed prices kept in the database, and his ROM unit-pricing workbook with yellow cells, formulas, drop-downs and an internal copy.");
