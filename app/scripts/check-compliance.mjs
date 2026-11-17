// Compliance (Marcel's feedback log, 7 Nov): awarded subcontractors against the wage scale and certification targets.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const C = await import("../lib/compliance.ts");
const { EMPTY_KICKOFF } = await import("../lib/projects.ts");

const project = (extra = {}) => ({ certifications: ["CBE", "First Source"], certificationTargets: { CBE: 35 }, kickoff: { ...EMPTY_KICKOFF, wageScale: true, wageScaleType: "Davis Bacon Wages" }, value: 100_000_000, ...extra });
const award = (id, bidderId, company, amount, trade = "Drywall", code = "09 20 00", cancelled = null) => ({ id, packageId: `pkg-${id}`, bidderId, amount, cancelled, snapshot: { packageName: trade, packageCode: code, company: { name: company } } });
const directory = [
  { id: "dc", company: "District Drywall", certifications: [{ program: "CBE", percent: 100 }] },
  { id: "jv", company: "Capital JV", certifications: [{ program: "cbe", percent: 40 }, { program: "First Source", percent: 100 }] },
  { id: "none", company: "Northern Steel" },
];

// Marcel's worked example: 35% CBE of $100M is $35M; a 100% CBE sub awarded $1,000,000 counts all of it, $34M to go.
const one = C.complianceReport({ project: project(), budgetTotal: null, awards: [award("a1", "dc", "District Drywall", 1_000_000)], directory, state: C.EMPTY_COMPLIANCE });
const cbe = one.programs.find(p => p.program === "CBE");
assert.deepEqual([one.base, one.baseSource], [100_000_000, "project value"], "Without a budget, targets are shares of the project value");
assert.deepEqual([cbe.target, cbe.required, cbe.counted, cbe.shortfall, cbe.met, cbe.share], [35, 35_000_000, 1_000_000, 34_000_000, false, 1], "Marcel's example: $34M still needed");
const fs = one.programs.find(p => p.program === "First Source");
assert.deepEqual([fs.target, fs.required, fs.shortfall, fs.met, fs.unknown], [null, null, null, null, 1], "A program without a % required has no target, and the company's share isn't recorded");

// A joint venture counts its percent of the contract; cancelled awards drop off; a company found by name when its id differs.
const many = C.complianceReport({
  project: project(), budgetTotal: 80_000_000, directory, state: C.EMPTY_COMPLIANCE,
  awards: [award("a1", "dc", "District Drywall", 1_000_000), award("a2", "jv", "Capital JV", 2_500_000, "Concrete", "03 30 00"), award("a3", "old-id", "district drywall", 500_000, "Doors", "08 10 00"), award("a4", "none", "Northern Steel", 3_000_000, "Steel", "05 12 00"), award("a5", "dc", "District Drywall", 9_000_000, "Paint", "09 90 00", { by: "x", at: "y", reason: "z" })],
});
assert.deepEqual([many.base, many.baseSource], [80_000_000, "budget"], "The budget summary's total wins over the project value");
assert.deepEqual(many.rows.map(r => r.trade), ["Concrete", "Steel", "Doors", "Drywall"], "Rows in CSI order; the cancelled Paint award is gone");
assert.deepEqual(many.rows.find(r => r.trade === "Concrete").programs, [{ program: "CBE", percent: 40, counted: 1_000_000 }, { program: "First Source", percent: 100, counted: 2_500_000 }], "40% of $2.5M counts $1M; program names match whatever their case");
assert.equal(many.rows.find(r => r.trade === "Doors").companyId, "dc", "A company is found by name when its id doesn't match");
assert.deepEqual(many.rows.find(r => r.trade === "Steel").programs[0], { program: "CBE", percent: null, counted: null }, "No certification recorded: nothing counted");
const many35 = many.programs[0];
assert.deepEqual([many35.required, many35.counted, many35.shortfall, many35.share, many35.unknown], [28_000_000, 2_500_000, 25_500_000, 3.13, 1]);
assert.equal(C.complianceReport({ project: project({ value: 0 }), budgetTotal: 0, awards: [], directory, state: C.EMPTY_COMPLIANCE }).base, null, "No budget and no value: no base");
const met = C.complianceReport({ project: project({ certificationTargets: { CBE: 1 } }), budgetTotal: null, awards: [award("a1", "dc", "District Drywall", 1_000_000)], directory, state: C.EMPTY_COMPLIANCE });
assert.deepEqual([met.programs[0].met, met.programs[0].shortfall], [true, 0], "Met once counted reaches required");

// Wage scale compliance per awarded contract.
let state = C.setWageScaleCompliance(C.EMPTY_COMPLIANCE, ["a1", "a2"], "a1", "compliant", "Certified payrolls in", "Marcel", "2026-11-17T10:00:00Z");
state = C.setWageScaleCompliance(state, ["a1", "a2"], "a2", "not-compliant", undefined, "Marcel");
state = C.setWageScaleCompliance(state, ["a1", "a2"], "a1", null, undefined, "Marcel");
assert.deepEqual(state.records.find(r => r.awardId === "a1"), { awardId: "a1", wageScale: null, note: "Certified payrolls in", updatedAt: state.records.find(r => r.awardId === "a1").updatedAt, updatedBy: "Marcel" }, "Clearing the status keeps the note");
assert.throws(() => C.setWageScaleCompliance(state, ["a1"], "zz", "compliant", undefined, "Marcel"), /isn't awarded/);
assert.throws(() => C.setWageScaleCompliance(state, ["a1"], "a1", "maybe", undefined, "Marcel"), /Choose compliant/);
const wage = C.complianceReport({ project: project(), budgetTotal: null, directory, state, awards: [award("a1", "dc", "District Drywall", 1), award("a2", "jv", "Capital JV", 1, "Concrete", "03"), award("a3", "none", "Northern Steel", 1, "Steel", "05")] }).wageScale;
assert.deepEqual(wage, { required: true, type: "Davis Bacon Wages", compliant: 0, notCompliant: 1, unconfirmed: 2 });

// A company's certification percent lives on the directory company.
let dir = C.setCompanyCertification(directory, "none", "CBE", 100);
assert.deepEqual(dir.find(c => c.id === "none").certifications, [{ program: "CBE", percent: 100 }]);
dir = C.setCompanyCertification(dir, "jv", "CBE", 51);
assert.deepEqual(dir.find(c => c.id === "jv").certifications, [{ program: "First Source", percent: 100 }, { program: "CBE", percent: 51 }], "Setting a program again replaces it, whatever its case");
dir = C.setCompanyCertification(dir, "jv", "First Source", null);
assert.deepEqual(dir.find(c => c.id === "jv").certifications, [{ program: "CBE", percent: 51 }], "null clears it");
assert.equal(dir.find(c => c.id === "dc"), directory.find(c => c.id === "dc"), "Other companies are untouched");
assert.throws(() => C.setCompanyCertification(directory, "dc", "CBE", 120), /percent from 0 to 100/);
assert.throws(() => C.setCompanyCertification(directory, "nobody", "CBE", 10), /isn't in the subcontractor directory/);
assert.throws(() => C.setCompanyCertification(directory, "dc", " ", 10), /Name the certification/);

// The directory's company form takes certifications as words.
assert.deepEqual(C.parseCertificationText("CBE 100, First Source; MBE 51%, cbe 20"), [{ program: "CBE", percent: 100 }, { program: "First Source", percent: 100 }, { program: "MBE", percent: 51 }], "A bare program is 100%; a repeat is ignored");
assert.deepEqual(C.parseCertificationText("  "), []);
assert.deepEqual(C.parseCertificationText("SBE: 12.5"), [{ program: "SBE", percent: 12.5 }]);
assert.throws(() => C.parseCertificationText("CBE 150"), /CBE: enter a percent from 0 to 100/);
assert.equal(C.certificationLabel([{ program: "CBE", percent: 100 }, { program: "SBE", percent: 12.5 }]), "CBE 100%, SBE 12.50%");
assert.deepEqual(C.parseCertificationText(C.certificationLabel([{ program: "CBE", percent: 100 }, { program: "SBE", percent: 12.5 }])), [{ program: "CBE", percent: 100 }, { program: "SBE", percent: 12.5 }], "The label reads back as it was");

// Export.
const rows = C.complianceRows(one);
assert.deepEqual(rows[0], ["Trade", "Code", "Subcontractor", "Contract value", "Wage scale", "CBE %", "CBE counted", "First Source %", "First Source counted", "Note"]);
assert.deepEqual(rows[1], ["Drywall", "09 20 00", "District Drywall", 1_000_000, "Not confirmed", 100, 1_000_000, "", "", ""]);
assert.deepEqual(rows.at(-2), ["CBE", 35, 35_000_000, 1_000_000, 1, 34_000_000]);

console.log(`Compliance checked: Marcel's 35% CBE example, joint ventures, cancelled awards, budget vs project value, wage scale, directory percents, export.`);
