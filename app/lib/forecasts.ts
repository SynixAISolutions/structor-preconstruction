// Budget forecasts, worked out (Danial, 22 Oct: automate the forecast). A direct line's forecast is,
// in order:
//   1. a forecast set on the line by hand: typed, or a bidder or estimate chosen in "Override
//      forecast" (budget.ts applyLevelingValue / applyEstimateValue). The override wins.
//   2. the award: the subcontract sum of the trade's active award at any stage, the line's share as
//      lib/commitments places it.
//   3. the leveled low: the lowest reviewed total among the trade's current leveled bids
//      (lowestTradeBid, the Budget page's "Lowest sub budget"), the line's share by the estimator's split.
//   4. the in-house estimate, once every one of its lines is priced and reviewed, shared the same way.
// Otherwise there is none and the line counts at its budget, as before. A trade on several budget
// lines with no split, or an awarded trade whose award sits on another line, is not guessed. Indirect
// and owner-carried lines only take a forecast set by hand. Nothing is written into the budget:
// costPlan gives every page the same numbers, and a change upstream changes them by itself.

import { activeAward, type AwardState } from "./award";
import type { BudgetLine, BudgetState, LevelingBasis, LevelingCandidate } from "./budget";
import { lowestSubLineValue, lowestTradeBid, tradeForBudgetLine } from "./budget-comparison";
import { budgetCommitments, withCommitments, type Commitments } from "./commitments";
import { budgetLinesForTrade, type TradeEstimate } from "./estimate";
import { usd } from "./format";
import type { Procurement } from "./procurement";
import type { Submission } from "./submissions";
import { EMPTY_VE, type VeState } from "./value-engineering";

export type AutoForecastKind = "award" | "leveled-low" | "estimate";
export type ForecastKind = "manual" | AutoForecastKind | "none";
export type AutoForecast = { value: number; kind: AutoForecastKind; detail: string };
export type LineForecast = {
  /** The forecast every total uses; null = none yet, the line counts at its budget. */
  value: number | null;
  kind: ForecastKind;
  /** Where the value comes from: "Capitol Wall Systems · executed", "Typed", … */
  detail: string;
  /** What the automatic order gives: shown beside an override so it can be switched back. */
  automatic: AutoForecast | null;
  /** Why an automatic source isn't used yet, e.g. "Bids not leveled yet". */
  note: string | null;
};
export type Forecasts = Record<string, LineForecast>;
export type CostPlanInput = {
  awards: AwardState; procurement: Procurement; submissions: Submission[];
  /** Leveled bids as the Budget page reads them (useLevelingComparison, openComparisonCandidates). */
  candidates: LevelingCandidate[];
  directory: { id: string; company: string }[]; ve?: VeState;
  /** The in-house estimate by trade (estimateByTrade). */
  estimates: TradeEstimate[];
};

export const FORECAST_LABEL: Record<ForecastKind, string> = { manual: "Override", award: "Award", "leveled-low": "Leveled low", estimate: "In-house estimate", none: "Budget baseline" };
const BASIS: Record<LevelingBasis, string> = { base: "base bid", provisional: "provisional total", reviewed: "reviewed total" };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The automatic forecast for one line, or why there is none. */
function automatic(budget: BudgetState, line: BudgetLine, commitments: Commitments, input: CostPlanInput): { auto: AutoForecast | null; note: string | null } {
  if (line.classification !== "direct" || line.byOwner) return { auto: null, note: null };
  const placed = commitments.lines[line.id];
  if (placed?.sources.length) {
    const value = placed.sources.reduce((n, s) => n + Math.round(s.amount * 100), 0) / 100;
    return { auto: { value, kind: "award", detail: placed.sources.map(s => `${s.company} · ${s.stage}`).join("; ") }, note: null };
  }
  const pkg = tradeForBudgetLine(budget, input.procurement, line);
  if (!pkg) return { auto: null, note: null };
  const shareNeeded = (what: string) => ({ auto: null, note: `Split ${pkg.name} between its ${budgetLinesForTrade(budget, pkg).lines.length} budget lines to use the ${what}` });
  // An awarded trade forecasts from its award only: a bid or estimate beside it would count the trade twice.
  if (activeAward(input.awards, pkg.id)) return placed?.splitNeeded.length ? shareNeeded("award") : { auto: null, note: `${pkg.name}'s award is on another budget line` };
  const low = lowestTradeBid(input.procurement, input.submissions, pkg.id, input.candidates, input.directory, input.ve ?? EMPTY_VE);
  if (low?.basis === "reviewed") {
    const value = lowestSubLineValue(budget, pkg, line.id, low.value);
    if (value === null) return shareNeeded("leveled low");
    return { auto: { value, kind: "leveled-low", detail: `${low.name} · reviewed total` }, note: null };
  }
  const estimate = input.estimates.find(t => t.packageId === pkg.id);
  const waiting = low ? "Bids not leveled yet" : null;
  if (!estimate?.items.length || !(estimate.total > 0)) return { auto: null, note: waiting };
  const open = [estimate.unreviewed && plural(estimate.unreviewed, "unreviewed line"), estimate.unpriced && plural(estimate.unpriced, "unpriced line")].filter(Boolean);
  if (open.length) return { auto: null, note: [waiting, `In-house estimate has ${open.join(" and ")}`].filter(Boolean).join(" · ") };
  const value = lowestSubLineValue(budget, pkg, line.id, estimate.total);
  if (value === null) return shareNeeded("estimate");
  return { auto: { value, kind: "estimate", detail: `${plural(estimate.items.length, "line")}, all reviewed` }, note: waiting };
}

/** How each line was set by hand, in words. */
function overrideDetail(line: BudgetLine): string {
  if (line.forecastSource) return `${line.forecastSource.bidderName} · ${BASIS[line.forecastSource.basis]}`;
  if (line.estimateSource) return `In-house estimate of ${usd(line.estimateSource.value)}`;
  return "Typed";
}

export function budgetForecasts(budget: BudgetState, commitments: Commitments, input: CostPlanInput): Forecasts {
  const forecasts: Forecasts = {};
  for (const line of budget.lines) {
    const { auto, note } = automatic(budget, line, commitments, input);
    forecasts[line.id] = line.forecast !== null
      ? { value: line.forecast, kind: "manual", detail: overrideDetail(line), automatic: auto, note: null }
      : auto ? { value: auto.value, kind: auto.kind, detail: auto.detail, automatic: auto, note }
      : { value: null, kind: "none", detail: "Budget baseline", automatic: null, note };
  }
  return forecasts;
}

/** The budget as every page reads it: each line's forecast as worked out above. */
export function withForecasts(budget: BudgetState, forecasts: Forecasts): BudgetState {
  return { ...budget, lines: budget.lines.map(l => forecasts[l.id] && forecasts[l.id].value !== l.forecast ? { ...l, forecast: forecasts[l.id].value } : l) };
}

/** Committed (lib/commitments) and forecast together: what the Budget page, to-do and Ask Structor total. */
export function costPlan(budget: BudgetState, input: CostPlanInput) {
  const commitments = budgetCommitments(budget, input.awards, input.procurement);
  const forecasts = budgetForecasts(budget, commitments, input);
  return { commitments, forecasts, budget: withForecasts(withCommitments(budget, commitments), forecasts) };
}
