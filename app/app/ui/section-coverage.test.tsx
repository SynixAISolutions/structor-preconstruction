import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProcurement } from "../../lib/data/procurement";
import { assignmentWarnings, sectionCoverage, type CoverageRow } from "../../lib/section-coverage";
require.extensions[".css"] = () => {};
const { CoverageList, CoverageActionForm, ScopeViewTabs } = require("./section-coverage") as typeof import("./section-coverage");
const procurement = { ...sampleProcurement, packages: sampleProcurement.packages.filter(p => p.division !== "10") };
const manual = { id: "manual", name: "Project manual.pdf", revision: 2 };
const coverage = sectionCoverage({ manual, sections: [
  { section: "10 44 16", title: "Fire extinguishers", first: 580, last: 584 },
  { section: "10 28 00", title: "Toilet accessories", first: 542, last: 550 },
  { section: "03 30 00", title: "Concrete suggestion", first: 60, last: 80 },
] }, procurement);
const row = coverage.rows.find(r => r.section === "10 28 00")!;
const list = (rows = coverage.rows) => renderToStaticMarkup(<CoverageList coverage={{ ...coverage, rows }} procurement={procurement} onAction={() => {}} onSource={() => {}} onUndo={() => {}} onBidForm={() => {}}/>);
const form = (kind: "assign" | "not-applicable" | "split", selected = row) => renderToStaticMarkup(<CoverageActionForm action={{ kind, row: selected }} procurement={procurement} warningsFor={id => assignmentWarnings(procurement, id, { awarded: true })} onClose={() => {}} onSave={() => null}/>);

test("coverage opens on questions, with expandable sections and manual page references", () => {
  const html = list();
  for (const text of ["Open questions", "Unassigned, Multiple trades and conflicts", "check whether it applies", "<details", "<summary", "10 44 16", "Fire extinguishers", "pp. 542–550", "revision 2", "Assign to a trade", "Record split", "Mark not applicable"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Concrete suggestion"));
  assert.ok(!html.toLowerCase().includes("omission"));
  assert.ok(!html.includes("<table"));
});

test("conflicts stay in the opening list and distinguish approved and draft lines", () => {
  const conflict: CoverageRow = { ...row, status: "not-applicable", conflict: "Drywall still cites it.", decision: { section: row.section, kind: "not-applicable", reason: "Owner supplied", by: "Reviewer", at: "2026-10-20T10:00:00Z" }, carriedBy: [{ packageId: "drywall", published: true, scopes: [{ id: "a", title: "Reviewed line", approved: true }, { id: "b", title: "Unreviewed line", approved: false }] }] };
  const html = list([conflict]);
  for (const text of ["Conflict", "Drywall still cites it.", "Approved", "Draft", "In published form", "Undo decision", "Decision by Reviewer", "Review bid form"]) assert.ok(html.includes(text), text);
});

test("suggested ownership is identified separately from coverage", () => {
  const html = list([{ ...row, expected: "drywall", conflict: "Check the previous decision", status: "expected" }]);
  assert.match(html, /Suggested: Drywall/);
  assert.match(html, /Suggested ownership: Drywall/);
  assert.match(html, /it is not approved coverage/);
});

test("assignment shows published and awarded warnings before its explicit confirmation", () => {
  const published = procurement.packages.find(p => p.published)!;
  const html = form("assign", { ...row, expected: published.id });
  for (const text of ["Before confirming", "bid form is published", "already awarded", "Exhibit A does not change", "no duplicate is added", "Confirm assignment"]) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf("Before confirming") < html.indexOf("Confirm assignment"));
});

test("not-applicable requires a bounded reason; split starts with two named trade portions", () => {
  assert.match(form("not-applicable"), /textarea required="" minLength="3" maxLength="500"/);
  assert.match(form("not-applicable"), /Save not applicable/);
  const html = form("split");
  for (const text of ["Trade 1", "Trade 2", "Part of the work 1", "Part of the work 2", "Save split", "Add another trade", "use Assign to a trade to add any missing draft lines"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/<textarea required/g) ?? []).length, 2);
});

test("scope views have a single keyboard tab stop and name their content panel", () => {
  const html = renderToStaticMarkup(<ScopeViewTabs value="Section coverage" onChange={() => {}}/>);
  assert.match(html, /aria-label="Scope views"/);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
  assert.match(html, /id="scope-tab-1" role="tab" aria-controls="scope-tab-panel" aria-selected="true" tabindex="0"/);
});
