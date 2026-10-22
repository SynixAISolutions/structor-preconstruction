import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { basisOfEstimate } = await import("../lib/basis-of-estimate.ts");
const { normalizeProject } = await import("../lib/projects.ts");

const project = normalizeProject({ id: "r", name: "Riverside Library", location: "Arlington, VA", squareFeet: 40000, workType: "new", estimateStage: "dd" });
const doc = (o) => ({ projectId: "r", series: o.id, revision: 1, size: 1, pageCount: 4, uploadedAt: "2026-10-15T09:00:00Z", sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: 1, sheets: [], sections: [], category: "Other", ...o });
const documents = [
  doc({ id: "d", name: "Set.pdf", kind: "drawings", category: "Drawings", sheets: [{ page: 1, sheet: "A1.1", title: "PLAN", date: "" }, { page: 2, sheet: "A1.2", title: "PLAN", date: "" }] }),
  doc({ id: "m", name: "Manual.pdf", kind: "manual", category: "Specifications", sections: [{ section: "09 29 00", title: "GYPSUM BOARD", first: 1, last: 2 }] }),
  doc({ id: "a", name: "Addendum 01.pdf", kind: "other", category: "Addenda", uploadedAt: "2026-10-18T09:00:00Z" }),
];
const line = (id, classification, description, budget, extra = {}) => ({ id, costCenter: "New construction", classification, csiCode: null, description, owner: "", budget, forecast: null, committed: 0, byOwner: false, status: "draft", approval: null, source: { kind: "manual" }, forecastSource: null, updatedAt: "", ...extra });
const budget = {
  lines: [line("1", "direct", "Drywall", 1_000_000), line("2", "indirect", "Construction contingency", 50_000), line("3", "indirect", "Design-build fee", 80_000), line("4", "indirect", "Permits", 25_000, { byOwner: true }), line("5", "indirect", "Design contingency", 0)],
  allowances: [
    { id: "a1", name: "Public art", amount: 100000, costCenter: "", owner: "", source: "RFP p. 12", status: "included" },
    { id: "a2", name: "Signage", amount: 52052, costCenter: "", owner: "", source: "", status: "review" },
    { id: "a3", name: "FF&E", amount: 0, costCenter: "", owner: "", source: "Owner", status: "excluded" },
  ],
  costCenters: [],
};
const setup = { decisions: [
  { target: "reports:survey", kind: "not-applicable", reason: "existing building, no site work.", by: "M", at: "", responsible: "", followUp: "", workType: null, estimateStage: null },
  { target: "reports:geotech", kind: "waiting", reason: "", by: "M", at: "", responsible: "Owner", followUp: "2026-10-27", workType: null, estimateStage: null },
], reviews: [] };
const out = basisOfEstimate({ project, documents, budget, setup, notCarried: [{ trade: "Drywall", item: "Firestopping", section: "07 84 00" }] });
const by = Object.fromEntries(out.sections.map(s => [s.heading, s.lines]));
assert.deepEqual(out.sections.map(s => s.heading), ["Basis", "Allowances included", "Contingency and fee", "Excluded or carried by the owner", "Assumptions", "Clarifications", "Open items"]);
assert.match(by.Basis[0], /^Riverside Library, Arlington, VA: 40,000 SF, new construction, documents at design development\.$/);
assert.equal(by.Basis[1], "Direct cost $1,000,000; indirect cost $130,000.", "Owner-carried lines are not in the totals");
assert.deepEqual(by.Basis.slice(2), ["Drawings: Set.pdf, 2 sheets, uploaded 2026-10-15.", "Project manual: Manual.pdf, 1 section, uploaded 2026-10-15.", "Addendum: Addendum 01.pdf, uploaded 2026-10-18."]);
assert.deepEqual(by["Allowances included"], ["Public art: $100,000 (RFP p. 12)."]);
assert.deepEqual(by["Contingency and fee"], ["Construction contingency, New construction: $50,000.", "Design-build fee, New construction: $80,000."], "Zero lines and owner lines left out");
assert.deepEqual(by["Excluded or carried by the owner"], ["Permits: carried by the owner.", "FF&E (Owner): not included."]);
assert.deepEqual(by.Assumptions, ["Site survey: not applicable to this project, existing building, no site work."]);
assert.deepEqual(by.Clarifications, ["Firestopping (Section 07 84 00) is not included in the Drywall price."]);
assert.deepEqual(by["Open items"], ["Geotechnical report: waiting on Owner, follow-up 2026-10-27.", "Allowance to confirm: Signage, $52,052."]);
assert.match(out.markdown, /^# Basis of estimate: Riverside Library\n\n## Basis\n\n- Riverside Library/);
const bare = basisOfEstimate({ project, documents: [], budget: { lines: [], allowances: [], costCenters: [] }, setup: { decisions: [], reviews: [] } });
assert.deepEqual(bare.sections.map(s => s.heading), ["Basis"], "Empty sections are left out");
const escalated = basisOfEstimate({ project, documents: [], budget: { lines: [], allowances: [], costCenters: [], conceptSource: { records: [], factors: { escalation: { byRecord: {}, target: "2027-03", basis: "Escalated to 2027-03 with BLS producer price indexes (WPU101)." } } } }, setup: { decisions: [], reviews: [] } });
assert.ok(escalated.sections[0].lines.includes("Concept budget price escalation: Escalated to 2027-03 with BLS producer price indexes (WPU101)."), "An applied escalation is part of the basis");

console.log("Basis of estimate checked: documents, totals without owner lines, allowances, contingency and fee, owner exclusions, assumptions from setup, clarifications, open items, applied price escalation.");
