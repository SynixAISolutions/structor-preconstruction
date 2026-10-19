import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { draftEstimateQueue, EstimateComparison, EstimateDraftCard } from "./estimate-ai-review";
import { addAiEstimateLines, estimateByTrade, varianceReport } from "../../lib/estimate";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleBudget } from "../../lib/data/budget";
import type { EstimateDraftLine } from "../../lib/estimate-ai";

const line: EstimateDraftLine = { item: "QA drywall", quantity: 3, unit: "SF", rate: .1633, amount: .49, quantityBasis: "Area allowance, drawing A1.1", rateSource: "assumption", rateNote: "Estimator assumption; verify", flags: ["Assumed rate"] };
test("estimate queue caps concurrency at three and stops before queued trades, preserving completions", async () => {
  const abort = new AbortController(), finished: number[] = [], started: number[] = [];
  let active = 0, peak = 0;
  await draftEstimateQueue([0, 1, 2, 3, 4, 5], abort.signal, async item => {
    started.push(item); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, item === 0 ? 5 : 20));
    finished.push(item); active--; if (item === 0) abort.abort();
  });
  assert.equal(peak, 3); assert.deepEqual(started, [0, 1, 2]); assert.deepEqual(finished.sort(), [0, 1, 2]);
});
test("AI review preserves basis, assumptions and cents; acceptance is unreviewed and idempotent", () => {
  const html = renderToStaticMarkup(<EstimateDraftCard line={line}/>);
  assert.match(html, /Quantity basis/); assert.match(html, /drawing A1.1/); assert.match(html, /Rate source/); assert.match(html, /Assumed rate/);
  const rows = addAiEstimateLines([], sampleProcurement, "drywall", [line]);
  assert.equal(rows[0].reviewed, false); assert.equal(rows[0].origin?.kind, "ai-estimate");
  assert.equal(estimateByTrade(rows, sampleProcurement).total, .49);
  assert.equal(addAiEstimateLines(rows, sampleProcurement, "drywall", [line]).length, 1);
  const row = varianceReport({ rows, procurement: sampleProcurement, budget: sampleBudget }).find(r => r.packageId === "drywall")!;
  const chart = renderToStaticMarkup(<EstimateComparison row={{ ...row, budget: null, bid: null }} ai={.49}/>);
  assert.match(chart, /\$0.49/); assert.equal((chart.match(/Unavailable/g) ?? []).length, 2);
});
