// Marcel's issues log, item 20 (the scope export) and item 18 (Exhibits under Contracts & procurement), 20 Nov.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const X = await import("../lib/scope-export.ts");
const EX = await import("../lib/exhibits.ts");
const XLSX = await import("xlsx");

const item = (id, packageId, title, o = {}) => ({ id, packageId, title, detail: o.detail ?? "", source: o.source ?? "", origin: "ai", status: o.status ?? "draft", allTrades: !!o.allTrades, history: [] });
const state = {
  packages: [
    { id: "demo", name: "Demolition", division: "02", code: "02 41 19", owner: "", due: "", published: { version: 1, at: "", by: "", items: [] },
      general: { lines: [{ id: "g1", text: "Selective demolition and removal", members: ["d1", "d2"] }], basis: "", at: "", by: "", model: "" } },
    { id: "steel", name: "Structural steel & miscellaneous metals", division: "05", code: "05 12 00", owner: "", due: "" },
    { id: "roof", name: "Roofing: PVC/membrane [main]", division: "07", code: "07 54 19", owner: "", due: "" },
  ],
  scopes: [
    item("all1", "demo", "Provide daily cleanup of your work", { allTrades: true, status: "approved" }),
    item("d1", "demo", "Remove aluminum windows, frames and sashes", { detail: "Keynote D.3", source: "AD-101", status: "approved" }),
    item("d2", "demo", "Remove doors and frames", { source: "AD-101" }),
    item("s1", "steel", "Furnish and erect structural steel", { source: "05 12 00" }),
  ],
  invitations: [], outreach: [], notifications: [],
};

// What the old CSV missed: the General scope, and the lines for every trade under each trade.
const sheets = X.scopeExportSheets(state, { packageIds: ["demo", "steel"], general: true, detailed: true }, "Maple Street");
assert.deepEqual(sheets.map(s => s.name), ["Summary", "02 41 19 Demolition", "05 12 00 Structural steel & mis"], "A Summary, then a tab per chosen trade, names cut to Excel's 31 characters");
const demo = sheets[1].rows.map(r => r.join(" | "));
assert(demo.includes("1 | Selective demolition and removal | 2"), "The General scope line, with how many detailed items it covers");
assert(demo.includes("1 | Provide daily cleanup of your work |  |  | Approved | Every trade"), "A line for every trade appears in this trade's tab");
assert(demo.includes("2 | Remove aluminum windows, frames and sashes | Keynote D.3 | AD-101 | Approved | Demolition"), "Detailed lines with their detail, source and status");
const steel = sheets[2].rows.map(r => r.join(" | "));
assert(steel.includes("1 | Provide daily cleanup of your work |  |  | Approved | Every trade"), "and in every other trade's tab too");
assert(steel.some(r => r.includes("No general scope written for this trade yet.")), "A trade without a General scope says so");
assert.deepEqual(sheets[0].rows.slice(3).map(r => r.slice(0, 6)), [["02 41 19", "Demolition", 1, 3, 2, "Published v1"], ["05 12 00", "Structural steel & miscellaneous metals", 0, 2, 1, "Not published"]], "The Summary counts each trade");
const detailedOnly = X.scopeExportSheets(state, { packageIds: ["demo"], general: false, detailed: true }, "Maple Street");
assert(!detailedOnly[1].rows.some(r => r[0] === "General scope"), "General scope left out when not chosen");
assert.throws(() => X.scopeExportSheets(state, { packageIds: [], general: true, detailed: true }, "M"), /at least one trade/);
assert.throws(() => X.scopeExportSheets(state, { packageIds: ["demo"], general: false, detailed: false }, "M"), /general scope, the detailed scope/);

// Tab names Excel accepts: no \ / ? * [ ] :, at most 31 characters, never twice.
const taken = new Set();
assert.equal(X.sheetName("07 54 19 Roofing: PVC/membrane [main]", taken), "07 54 19 Roofing PVC membrane m");
assert.equal(X.sheetName("07 54 19 Roofing: PVC/membrane [main]", taken), "07 54 19 Roofing PVC membra (2)");
assert.equal(X.scopeExportFileName("Maple Street: Rec/Center", "2026-11-20"), "Maple Street- Rec-Center scopes 2026-11-20.xlsx");

// A real workbook: written and read back, a tab per trade.
const all = X.scopeExportSheets(state, { packageIds: ["demo", "steel", "roof"], general: true, detailed: true }, "Maple Street");
const back = XLSX.read(XLSX.write(X.scopeWorkbook(all, XLSX), { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
assert.deepEqual(back.SheetNames, ["Summary", "02 41 19 Demolition", "05 12 00 Structural steel & mis", "07 54 19 Roofing PVC membrane m"]);
assert.equal(back.Sheets["02 41 19 Demolition"]["B1"]?.v ?? back.Sheets["02 41 19 Demolition"]["A1"]?.v, "Maple Street · 02 41 19 Demolition");

// ── Exhibits: every trade's Exhibit A and Exhibits B to G ──
const award = (packageId, o = {}) => ({
  id: `a-${packageId}`, packageId, cancelled: o.cancelled ?? null, leveling: { bidderName: o.company ?? "Capital Demolition" },
  exhibit: { status: o.status ?? "draft", revisions: [{ number: 1 }, ...(o.revised ? [{ number: 2 }] : [])], comments: [], agreement: null },
  contractFiles: o.files, subcontract: o.subcontract ?? null,
});
const asset = { id: "0123456789abcdef0123456789abcdef", name: "file.pdf" };
const rows = EX.exhibitRows(state.packages, { notifications: [], awards: [
  award("demo", { status: "agreed", revised: true, files: { company: { name: "MCN", form: asset }, b: { title: "B", sections: [{ heading: "Drawings", lines: ["AD-101"] }] }, files: { C: asset, D: asset } }, subcontract: { status: "signature-pending" } }),
  award("steel", { cancelled: { by: "x", at: "", reason: "" } }),
] });
assert.deepEqual(rows.map(r => [r.trade, r.company, r.exhibitA?.status ?? null, r.exhibitA?.revision ?? null, r.locked]), [
  ["Demolition", "Capital Demolition", "agreed", 2, true], ["Structural steel & miscellaneous metals", null, null, null, false], ["Roofing: PVC/membrane [main]", null, null, null, false],
], "Awarded trades with their Exhibit A; a cancelled award is no award");
assert.deepEqual(rows[0].others.map(m => `${m.code}${m.ready ? "+" : "-"}`), ["B+", "C+", "D+", "E-", "F-", "G-"], "Exhibits B to G, ready or to prepare");
const fresh = EX.exhibitRows([state.packages[0]], { notifications: [], awards: [award("demo", { status: "changes-requested" })] });
assert.deepEqual([fresh[0].exhibitA.status, fresh[0].others.every(m => !m.ready), fresh[0].locked], ["changes requested", true, false], "Nothing prepared yet: every one to prepare");

console.log("Scope export and Exhibits checked: a tab per chosen trade with its General and detailed scope, lines for every trade in each tab, the Summary, Excel's tab names, a workbook read back; every trade's Exhibit A and B to G.");
