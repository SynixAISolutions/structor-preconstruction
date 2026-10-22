import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { conceptEscalation, historyEscalation } from "../../lib/escalation";
import { generateConceptBudget, type BudgetHistory } from "../../lib/historical-budget";
import { sampleProjectRecords } from "../../lib/projects";
import { ConceptEscalation, EscalationApplication, EscalationResult, escalationSummary } from "./concept-escalation";

const applicationProps = { choice: "midpoint", onChoice: () => {}, factors: { locationIndex: 100, costIndex: 100, profileFactor: 1, basis: "" }, applied: false, stale: false, onApply: () => {}, onRemove: () => {} };

const fetchedAt = "2026-10-21T08:30:00Z";
const result = historyEscalation([{ name: "History <2022>", year: 2022, lines: [{ csiCode: "03", amount: 1000 }, { csiCode: "05", amount: 2000 }] }], { WPU1333: [{ month: "2022-07", value: 100 }, { month: "2025-09", value: 110 }, { month: "2026-09", value: 121 }] }, "2027-09");

test("trade cards identify actual values, measured change, assumption, weighting and missing divisions", () => {
  const html = renderToStaticMarkup(<EscalationResult result={result} target="2027-09" fetchedAt={fetchedAt}/>);
  for (const text of ["+33.1%", "1.3310×", "History &lt;2022&gt;", "Division 03", "Concrete", "Ready-mix concrete", "WPU1333", "2022-07", "2026-09", "100", "121", "+21.0%", "Projected part · an assumption", "+10.0%", "Missing divisions", "division 05", "excluded from the weighting", "Historical cost weight: $1,000", fetchedAt]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("https://data.bls.gov/timeseries/WPU1333"));
  assert.ok(html.includes("Source: " + result.rows[0].escalation.note));
});

test("summary preserves series IDs, months, source notes and excluded divisions for the basis note", () => {
  const text = escalationSummary("Target project", "Construction midpoint", "2027-09", result, fetchedAt);
  for (const value of ["Target project", "Construction midpoint (2027-09)", "+33.1%", "factor 1.3310×", "WPU1333", "From 2022-07: 100", "latest published 2026-09: 121", "Measured to latest: +21.0%", "Projected part (an assumption): +10.0%", "Missing divisions (excluded): History <2022> · division 05", result.rows[0].escalation.note, "no budget cost index changed"]) assert.ok(text.includes(value), value);
});

test("fresh project shows no selection, no dates, disabled copy and a project-information handoff", () => {
  const html = renderToStaticMarkup(<ConceptEscalation {...applicationProps} project={{ ...sampleProjectRecords[0], start: "", finish: "", due: "" }} history={[]} navigate={() => {}} notify={() => {}}/>);
  for (const text of ["No history selected", "No project dates for this target", "Open project information", "review and apply", "Bid date · not recorded"]) assert.ok(html.includes(text), text);
  assert.match(html, /disabled="">Copy summary/);
  assert.match(html, /disabled="">Apply escalation/);
  assert.ok(!html.includes("Cost-weighted change"));
});

test("application review shows per-record factors, exact basis and totals, including core's missing-factor warning", () => {
  const project = { ...sampleProjectRecords[0], squareFeet: 1000, estimateStage: "concept" as const };
  const record: BudgetHistory = { id: "older", name: "Older concrete", year: 2022, squareFeet: 1000, stage: "concept", location: project.location, type: project.type, workType: project.workType, taxStatus: project.taxStatus, certifications: project.certifications, locationIndex: 100, costIndex: 100, source: "Budget.csv", lines: [{ description: "Concrete", costCenter: "Building", classification: "direct", csiCode: "03", amount: 1000, byOwner: false }] };
  const newer = { ...record, id: "newer", name: "Newer concrete", year: 2025, lines: [{ ...record.lines[0], amount: 2000 }] };
  const missing = { ...record, id: "missing", name: "Missing index", lines: [{ ...record.lines[0], description: "Steel", csiCode: "05", amount: 500 }] };
  const history = [record, newer, missing];
  const candidate = conceptEscalation(historyEscalation(history, { WPU1333: [{ month: "2022-07", value: 100 }, { month: "2025-07", value: 110 }, { month: "2025-09", value: 110 }, { month: "2026-09", value: 121 }] }, "2027-09"))!;
  assert.equal(candidate.byRecord.older, 1.331);
  assert.equal(candidate.byRecord.newer, 1.21);
  const before = generateConceptBudget(project, history, applicationProps.factors);
  const after = generateConceptBudget(project, history, { ...applicationProps.factors, escalation: candidate });
  assert.equal(before.total, 2000);
  assert.equal(after.total, (1000 * 1.331 + 2000 * 1.21) / 2 + 500);
  const html = renderToStaticMarkup(<EscalationApplication {...applicationProps} history={history} candidate={candidate} preview={{ before: before.total, after: after.total, warnings: after.warnings }}/>);
  for (const text of ["Older concrete", "1.3310×", "Newer concrete", "1.2100×", "Missing index", "No factor · indexes alone", "Target month: 2027-09", candidate.basis.replaceAll("'", "&#x27;"), "Before · indexes alone", "$2,000.00", "$2,375.50", "After · if applied", "Missing index: no escalation applied (no price index data for its costs).", "Apply escalation"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("Remove escalation"));
});

test("applied and stale reviews have explicit removal and re-apply states; stale without data cannot apply", () => {
  const candidate = conceptEscalation(result)!;
  const props = { ...applicationProps, history: [], candidate, preview: { before: 1000, after: 1331, warnings: [] }, applied: true };
  const applied = renderToStaticMarkup(<EscalationApplication {...props}/>);
  assert.ok(applied.includes("Escalation applied. The preview and any new project budget include"));
  assert.ok(applied.includes("After · escalation applied"));
  assert.match(applied, /disabled="">Apply escalation/);
  assert.ok(applied.includes("Remove escalation"));
  const stale = renderToStaticMarkup(<EscalationApplication {...props} stale/>);
  assert.ok(stale.includes("Applied escalation is stale"));
  assert.ok(stale.includes("The preview uses indexes alone"));
  assert.ok(stale.includes("Re-apply escalation"));
  assert.ok(!stale.includes('disabled="">Re-apply escalation'));
  const noData = renderToStaticMarkup(<EscalationApplication {...props} stale candidate={null} preview={null}/>);
  assert.match(noData, /disabled="">Re-apply escalation/);
  assert.ok(noData.includes("Remove escalation"));
});

test("targets before latest publication label the measured endpoint accurately; no data never shows zero percent", () => {
  const earlier = renderToStaticMarkup(<EscalationResult result={result} target="2026-01" fetchedAt={fetchedAt}/>);
  assert.ok(earlier.includes("Measured to target"));
  const empty = renderToStaticMarkup(<EscalationResult result={{ factor: null, rows: [], missing: ["Old budget · division 03"] }} target="2027-09" fetchedAt={fetchedAt}/>);
  assert.ok(empty.includes("No index data covers this history"));
  assert.ok(empty.includes("Old budget · division 03"));
  assert.ok(!empty.includes("+0.0%"));
});
