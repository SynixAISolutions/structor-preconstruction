import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { historyEscalation } from "../../lib/escalation";
import { sampleProjectRecords } from "../../lib/projects";
import { ConceptEscalation, EscalationResult, escalationSummary } from "./concept-escalation";

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
  const html = renderToStaticMarkup(<ConceptEscalation project={{ ...sampleProjectRecords[0], start: "", finish: "", due: "" }} history={[]} navigate={() => {}} notify={() => {}}/>);
  for (const text of ["No history selected", "No project dates for this target", "Open project information", "read-only", "Bid date · not recorded"]) assert.ok(html.includes(text), text);
  assert.match(html, /disabled="">Copy summary/);
  assert.ok(!html.includes("Cost-weighted change"));
});

test("targets before latest publication label the measured endpoint accurately; no data never shows zero percent", () => {
  const earlier = renderToStaticMarkup(<EscalationResult result={result} target="2026-01" fetchedAt={fetchedAt}/>);
  assert.ok(earlier.includes("Measured to target"));
  const empty = renderToStaticMarkup(<EscalationResult result={{ factor: null, rows: [], missing: ["Old budget · division 03"] }} target="2027-09" fetchedAt={fetchedAt}/>);
  assert.ok(empty.includes("No index data covers this history"));
  assert.ok(empty.includes("Old budget · division 03"));
  assert.ok(!empty.includes("+0.0%"));
});
