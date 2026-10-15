import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sampleProcurement } from "../../lib/data/procurement";
import { initialTakeoffs } from "../../lib/data/preconstruction";
import { sampleBudget } from "../../lib/data/budget";
import { applyEstimateValue, type BudgetState } from "../../lib/budget";
import { estimateByTrade, placeRows, varianceReport, type VarianceRow } from "../../lib/estimate";
import { estimateMoney, unitRate } from "./estimate-format";

require.extensions[".css"] = () => {};
const { TradeEstimateList } = require("./trade-estimates") as typeof import("./trade-estimates");
const { EstimateBudgetChoice, EstimateBasisLabel, estimateForecastError } = require("./estimate-budget-choice") as typeof import("./estimate-budget-choice");
const { TradeVarianceTable } = require("./trade-variance") as typeof import("./trade-variance");
const trades = estimateByTrade(initialTakeoffs, sampleProcurement).trades;
const pkg = (id: string) => sampleProcurement.packages.find(p => p.id === id)!;
const trade = (id: string) => trades.find(t => t.packageId === id)!;
const line = (id: string) => sampleBudget.lines.find(l => l.id === id)!;

test("estimate amounts retain cents and unit rates retain fractional precision", () => {
  assert.equal(estimateMoney(623.09), "$623.09");
  assert.equal(estimateMoney(.49), "$0.49");
  assert.equal(unitRate(2.75), "$2.75");
  assert.equal(unitRate(.0075), "$0.0075");
});

test("trade list retains empty trades and distinguishes unpriced from not started", () => {
  const shown = trades.map(t => t.packageId === "drywall" ? { ...t, total: 0, unpriced: 1 } : t);
  const html = renderToStaticMarkup(<TradeEstimateList trades={shown} unassigned={2} onOpen={() => {}}/>);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 12);
  assert.match(html, /Carpentry/); assert.match(html, /Not started/);
  assert.match(html, /\$0/); assert.match(html, /1 unpriced/);
  assert.match(html, /2 saved items need a trade assignment/);
});

test("legacy Finishes items remain unassigned rather than becoming drywall or flooring", () => {
  const legacy = initialTakeoffs.filter(r => r.packageId === "drywall").map(({ packageId: _package, ...row }) => row);
  const byTrade = estimateByTrade(placeRows(legacy, sampleProcurement.packages), sampleProcurement);
  assert.equal(byTrade.unassigned.length, legacy.length);
  const html = renderToStaticMarkup(<TradeEstimateList trades={byTrade.trades} unassigned={legacy.length} onOpen={() => {}}/>);
  assert.match(html, /Review unassigned items/);
});

test("budget choice previews the authoritative action without mutating the budget", () => {
  const before = JSON.stringify(sampleBudget);
  assert.equal(estimateForecastError(sampleBudget, line("nc-09200"), pkg("drywall"), trade("drywall"), false), null);
  const html = renderToStaticMarkup(<EstimateBudgetChoice budget={sampleBudget} line={line("nc-09200")} packages={sampleProcurement.packages} trades={trades} packageId="drywall" onPackage={() => {}} link={false} onLink={() => {}}/>);
  assert.match(html, /Matched by CSI code/); assert.match(html, new RegExp(`${trade("drywall").unreviewed} unreviewed`));
  assert.ok(!html.includes('type="checkbox"'));
  assert.equal(JSON.stringify(sampleBudget), before);
});

test("multi-cost-center estimate cannot be applied and does not offer a shortcut link", () => {
  const html = renderToStaticMarkup(<EstimateBudgetChoice budget={sampleBudget} line={line("nc-05000")} packages={sampleProcurement.packages} trades={trades} packageId="steel" onPackage={() => {}} link={false} onLink={() => {}}/>);
  assert.match(html, /budgeted on 2 lines/); assert.match(html, /New construction/); assert.match(html, /Sitework/);
  assert.ok(!html.includes('type="checkbox"'));
});

test("an ambiguous CSI match requires an explicit budget-line link", () => {
  const steel = { ...pkg("steel"), code: "05 50 00" };
  const target = { ...line("nc-05500"), id: "test-05400", csiCode: "05400" };
  const budget: BudgetState = { ...sampleBudget, lines: [...sampleBudget.lines.filter(l => l.csiCode !== "05500"), target, { ...target, id: "test-05600", csiCode: "05600" }] };
  assert.match(estimateForecastError(budget, target, steel, trade("steel"), false)!, /Link Structural steel/);
  assert.equal(estimateForecastError(budget, target, steel, trade("steel"), true), null);
  const html = renderToStaticMarkup(<EstimateBudgetChoice budget={budget} line={target} packages={[steel]} trades={[trade("steel")]} packageId="steel" onPackage={() => {}} link={false} onLink={() => {}}/>);
  assert.match(html, /type="checkbox"/); assert.match(html, /Link this budget line to Structural steel/);
});

test("Contractor basis label exposes its snapshot, reviewer and later estimate changes", () => {
  const applied = applyEstimateValue(sampleBudget, "nc-09200", pkg("drywall"), trade("drywall"), "Safi", "2026-10-14T08:00:00Z");
  const html = renderToStaticMarkup(<EstimateBasisLabel line={applied.lines.find(l => l.id === "nc-09200")!} trades={trades.map(t => t.packageId === "drywall" ? { ...t, total: t.total + 100 } : t)}/>);
  assert.match(html, /In-house estimate/); assert.match(html, /Safi/); assert.match(html, new RegExp(`${trade("drywall").unreviewed} unreviewed at application`));
  assert.match(html, /Estimate changed since application/);
  assert.equal(applied.lines.find(l => l.id === "nc-09200")!.budget, line("nc-09200").budget);
});

test("missing estimates and bids stay unavailable, not zero-valued comparisons", () => {
  const row = varianceReport({ rows: [], procurement: sampleProcurement, budget: sampleBudget }).find(r => r.packageId === "carpentry")!;
  const html = renderToStaticMarkup(<TradeVarianceTable rows={[row]}/>);
  assert.match(html, /Not estimated/); assert.match(html, /No eligible bid/); assert.match(html, /Not comparable/);
  assert.ok(!html.includes("+0%"));
});

test("variance labels expose direction, percent and an applied provisional bid's provenance", () => {
  const row: VarianceRow = { packageId: "drywall", name: "Drywall", owner: "Safi", estimate: 100, estimateLines: 1, estimateUnreviewed: 0, bid: { bidderName: "Test bidder", value: 125, basis: "provisional", from: "budget-forecast" }, budget: 90, forecast: 125, budgetBasis: "linked", bidOverEstimate: { amount: 25, percent: 25 }, budgetOverEstimate: -10 };
  const html = renderToStaticMarkup(<TradeVarianceTable rows={[row]}/>);
  assert.match(html, /\+\$25/); assert.match(html, /\+25%/); assert.match(html, /Bid above In-house estimate/);
  assert.match(html, /Estimate above budget/); assert.match(html, /Provisional total/); assert.match(html, /Applied budget forecast snapshot/);
});
