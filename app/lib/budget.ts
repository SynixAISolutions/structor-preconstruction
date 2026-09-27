// Budget and allowances for ONE project (demo, browser-only).
//
// Marcel (20 Sep, 14:51–17:15): budget values come from the user, not from nowhere; lines are
// split into direct construction costs and indirect costs (insurance, contingency, the GC's
// fee); the forecast should reflect the lowest sub after leveling; allowances are a simple
// editable list. Which leveled value becomes the forecast is NOT decided yet, so this module
// never picks one: applyLevelingValue makes the caller choose base, provisional or reviewed.
//
// Money is summed in cents. Variance = budget − forecast: negative means over budget (the
// Budget summary convention). A line with no forecast yet counts at its budget.
// An allowance linked to a budget line is already inside that line's budget, so it is never
// added to the totals a second time.

import { CSI_DIVISIONS, csiDivision } from "./csi";
import { bidderTotals } from "./leveling.mjs";
import type { BidProvenance, LevelingBidder, LevelingScopeItem } from "./leveling-import";

export type BudgetClass = "direct" | "indirect";
export type ReviewStatus = "draft" | "approved";
export type LevelingBasis = "base" | "provisional" | "reviewed";

export type LineSource = { kind: "sample" } | { kind: "manual"; by: string; at: string };
/** Set when a forecast came from bid leveling; cleared when the forecast is edited by hand. */
export type ForecastSource = {
  kind: "leveling"; basis: LevelingBasis; value: number;
  packageId: string | null; levelingBidderId: string; bidderName: string; submissionId: string | null; revisionNumber: number | null;
  appliedAt: string; appliedBy: string;
};

export type BudgetLine = {
  id: string;
  costCenter: string;
  classification: BudgetClass;
  /** CSI division ("03") or section ("03 30 00"); null for lines without one (most indirect costs). */
  csiCode: string | null;
  /** Trade or indirect item, e.g. "Concrete" or "General liability insurance". */
  description: string;
  owner: string;
  /** The approved budget amount. */
  budget: number;
  /** Expected cost; null until known. */
  forecast: number | null;
  /** Contracted value (0 until a subcontract is awarded). */
  committed: number;
  status: ReviewStatus;
  approval: { by: string; at: string } | null;
  source: LineSource;
  forecastSource: ForecastSource | null;
  updatedAt: string;
};

export type AllowanceStatus = "review" | "included" | "excluded";
export type BudgetAllowance = {
  id: string;
  name: string;
  amount: number;
  costCenter: string;
  owner: string;
  /** Where the allowance is stated, e.g. "Division 32 · Exterior improvements". */
  source: string;
  status: AllowanceStatus;
  /** The budget line that already carries this money, if any. */
  budgetLineId: string | null;
  updatedAt: string;
};

export type BudgetState = { lines: BudgetLine[]; allowances: BudgetAllowance[] };

export type BudgetLineInput = {
  costCenter: string; classification: BudgetClass; csiCode?: string | null; description: string; owner?: string;
  budget: number; forecast?: number | null; committed?: number;
};
export type AllowanceInput = { name: string; amount: number; costCenter: string; owner?: string; source?: string; status?: AllowanceStatus; budgetLineId?: string | null };

/** Field name → message, for showing beside the form input. */
export type BudgetErrors = Partial<Record<keyof BudgetLineInput | keyof AllowanceInput | "line" | "allowance", string>>;

export class BudgetRuleError extends Error {
  readonly errors: BudgetErrors;
  constructor(errors: BudgetErrors) {
    super(Object.values(errors).join(" "));
    this.name = "BudgetRuleError";
    this.errors = errors;
  }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: BudgetErrors): never => { throw new BudgetRuleError(errors); };
const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;
const sum = (values: number[]) => dollars(values.reduce((total, v) => total + cents(v), 0));

/** "$1,250,000.50" → 1250000.5; null when it is not an amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const amountError = (value: unknown, label: string, allowZero = true): string | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return `Enter the ${label} as a number.`;
  if (value < 0 || (!allowZero && value === 0)) return `The ${label} must be ${allowZero ? "zero or more" : "greater than zero"}.`;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return `The ${label} can have at most two decimal places.`;
  if (value > 1e12) return `The ${label} is too large.`;
  return undefined;
};

const csiError = (code: string | null | undefined): string | undefined => {
  const value = (code ?? "").trim();
  if (!value) return undefined;
  return (/^\d{2}$/.test(value) && value in CSI_DIVISIONS) || csiDivision(value) ? undefined : "Use a CSI division such as 03 or a section such as 03 30 00.";
};

export function validateLineInput(input: BudgetLineInput): BudgetErrors {
  const errors: BudgetErrors = {};
  if (!input.description?.trim()) errors.description = "Describe the trade or cost.";
  if (!input.costCenter?.trim()) errors.costCenter = "Choose a cost center.";
  if (input.classification !== "direct" && input.classification !== "indirect") errors.classification = "Choose direct or indirect.";
  const csi = csiError(input.csiCode);
  if (csi) errors.csiCode = csi;
  const budget = amountError(input.budget, "budget");
  if (budget) errors.budget = budget;
  if (input.forecast !== null && input.forecast !== undefined) { const e = amountError(input.forecast, "forecast"); if (e) errors.forecast = e; }
  if (input.committed !== undefined) { const e = amountError(input.committed, "committed value"); if (e) errors.committed = e; }
  return errors;
}

export function validateAllowanceInput(input: AllowanceInput, state: BudgetState): BudgetErrors {
  const errors: BudgetErrors = {};
  if (!input.name?.trim()) errors.name = "Name the allowance.";
  const amount = amountError(input.amount, "amount", false);
  if (amount) errors.amount = amount;
  if (!input.costCenter?.trim()) errors.costCenter = "Choose a cost center.";
  if (input.status !== undefined && !["review", "included", "excluded"].includes(input.status)) errors.status = "Choose review, included, or excluded.";
  if (input.budgetLineId) {
    const line = state.lines.find(l => l.id === input.budgetLineId);
    if (!line) errors.budgetLineId = "That budget line no longer exists.";
    else if (line.costCenter !== input.costCenter?.trim()) errors.budgetLineId = `That budget line is in ${line.costCenter}; link a line in the same cost center.`;
  }
  return errors;
}

/** Every non-excluded allowance linked to a line must fit inside that line's budget. */
function linkErrors(state: BudgetState): BudgetErrors {
  for (const line of state.lines) {
    const linked = state.allowances.filter(a => a.budgetLineId === line.id && a.status !== "excluded");
    const total = sum(linked.map(a => a.amount));
    if (total > line.budget) return { budgetLineId: `${line.description} (${line.costCenter}) has a budget of ${line.budget.toLocaleString("en-US")} but carries ${total.toLocaleString("en-US")} of allowances.` };
    if (linked.some(a => a.costCenter !== line.costCenter)) return { costCenter: `An allowance linked to ${line.description} must stay in ${line.costCenter}.` };
  }
  return {};
}
const checked = (state: BudgetState): BudgetState => {
  const errors = linkErrors(state);
  return Object.keys(errors).length ? fail(errors) : state;
};

function findLine(state: BudgetState, id: string): BudgetLine {
  return state.lines.find(l => l.id === id) ?? fail({ line: "That budget line no longer exists." });
}
function findAllowance(state: BudgetState, id: string): BudgetAllowance {
  return state.allowances.find(a => a.id === id) ?? fail({ allowance: "That allowance no longer exists." });
}
const clean = (input: BudgetLineInput) => ({
  costCenter: input.costCenter.trim(), classification: input.classification, csiCode: input.csiCode?.trim() || null,
  description: input.description.trim(), owner: input.owner?.trim() ?? "", budget: input.budget, forecast: input.forecast ?? null, committed: input.committed ?? 0,
});

// ── Budget lines ────────────────────────────────────────────────────────────

export function addBudgetLine(state: BudgetState, input: BudgetLineInput, by: string, at = now()): BudgetState {
  const errors = validateLineInput(input);
  if (Object.keys(errors).length) fail(errors);
  const line: BudgetLine = { id: newId(), ...clean(input), status: "draft", approval: null, source: { kind: "manual", by, at }, forecastSource: null, updatedAt: at };
  return { ...state, lines: [...state.lines, line] };
}

/**
 * Changes a line. Changing what was approved (cost center, classification, CSI code,
 * description or budget) sends it back to draft. Editing the forecast by hand clears its
 * leveling source. Forecast and committed changes keep the approval.
 */
export function editBudgetLine(state: BudgetState, id: string, patch: Partial<BudgetLineInput>, by: string, at = now()): BudgetState {
  const line = findLine(state, id);
  const merged: BudgetLineInput = { ...line, ...patch };
  const errors = validateLineInput(merged);
  if (Object.keys(errors).length) fail(errors);
  const next = { ...line, ...clean(merged), updatedAt: at };
  const approvedFieldsChanged = (["costCenter", "classification", "csiCode", "description", "budget"] as const).some(k => next[k] !== line[k]);
  const forecastEdited = "forecast" in patch && next.forecast !== line.forecast;
  if (!approvedFieldsChanged && !forecastEdited && next.owner === line.owner && next.committed === line.committed) return state;
  const updated: BudgetLine = {
    ...next,
    ...(approvedFieldsChanged ? { status: "draft" as const, approval: null } : {}),
    ...(forecastEdited ? { forecastSource: null } : {}),
    source: line.source.kind === "sample" ? line.source : { kind: "manual", by, at },
  };
  return checked({ ...state, lines: state.lines.map(l => l.id === id ? updated : l) });
}

export function approveBudgetLine(state: BudgetState, id: string, by: string, at = now()): BudgetState {
  const line = findLine(state, id);
  if (line.status === "approved") return state;
  return { ...state, lines: state.lines.map(l => l.id === id ? { ...l, status: "approved" as const, approval: { by, at }, updatedAt: at } : l) };
}

export function reopenBudgetLine(state: BudgetState, id: string, at = now()): BudgetState {
  const line = findLine(state, id);
  if (line.status === "draft") return state;
  return { ...state, lines: state.lines.map(l => l.id === id ? { ...l, status: "draft" as const, approval: null, updatedAt: at } : l) };
}

/** Refused while allowances are linked to the line, so their money is never silently dropped. */
export function removeBudgetLine(state: BudgetState, id: string): BudgetState {
  const line = findLine(state, id);
  const linked = state.allowances.filter(a => a.budgetLineId === id);
  if (linked.length) fail({ line: `${line.description} carries ${linked.length} allowance${linked.length === 1 ? "" : "s"} (${linked.map(a => a.name).join(", ")}). Unlink ${linked.length === 1 ? "it" : "them"} first.` });
  return { ...state, lines: state.lines.filter(l => l.id !== id) };
}

// ── Allowances ──────────────────────────────────────────────────────────────

export function addAllowance(state: BudgetState, input: AllowanceInput, at = now()): BudgetState {
  const errors = validateAllowanceInput(input, state);
  if (Object.keys(errors).length) fail(errors);
  const allowance: BudgetAllowance = {
    id: newId(), name: input.name.trim(), amount: input.amount, costCenter: input.costCenter.trim(), owner: input.owner?.trim() ?? "",
    source: input.source?.trim() ?? "", status: input.status ?? "review", budgetLineId: input.budgetLineId || null, updatedAt: at,
  };
  return checked({ ...state, allowances: [...state.allowances, allowance] });
}

export function editAllowance(state: BudgetState, id: string, patch: Partial<AllowanceInput>, at = now()): BudgetState {
  const allowance = findAllowance(state, id);
  const merged: AllowanceInput = { ...allowance, ...patch };
  const errors = validateAllowanceInput(merged, state);
  if (Object.keys(errors).length) fail(errors);
  const next: BudgetAllowance = {
    ...allowance, name: merged.name.trim(), amount: merged.amount, costCenter: merged.costCenter.trim(), owner: merged.owner?.trim() ?? "",
    source: merged.source?.trim() ?? "", status: merged.status ?? allowance.status, budgetLineId: merged.budgetLineId || null, updatedAt: at,
  };
  return checked({ ...state, allowances: state.allowances.map(a => a.id === id ? next : a) });
}

export const setAllowanceStatus = (state: BudgetState, id: string, status: AllowanceStatus, at = now()) => editAllowance(state, id, { status }, at);
/** Pass null to unlink. A linked allowance is counted inside its line, not added again. */
export const linkAllowance = (state: BudgetState, id: string, budgetLineId: string | null, at = now()) => editAllowance(state, id, { budgetLineId }, at);

export function removeAllowance(state: BudgetState, id: string): BudgetState {
  findAllowance(state, id);
  return { ...state, allowances: state.allowances.filter(a => a.id !== id) };
}

// ── Calculations ────────────────────────────────────────────────────────────

export type BudgetTotals = {
  /** Budget lines only. */
  budget: number; direct: number; indirect: number;
  /** Lines without a forecast count at their budget; see unforecastLines. */
  forecast: number; committed: number;
  /** budget − committed. */
  remaining: number;
  /** budget − forecast; negative = over budget. */
  variance: number;
  unforecastLines: number;
  /** Included allowances NOT carried by a line: added to budget and forecast below. */
  allowancesAdded: number;
  /** Included allowances already inside a line's budget: shown, never added again. */
  allowancesInLines: number;
  allowancesPending: number;
  allowancesExcluded: number;
  totalBudget: number;
  totalForecast: number;
};

export function budgetTotals(state: BudgetState, costCenter?: string): BudgetTotals {
  const lines = costCenter === undefined ? state.lines : state.lines.filter(l => l.costCenter === costCenter);
  const allowances = costCenter === undefined ? state.allowances : state.allowances.filter(a => a.costCenter === costCenter);
  const lineIds = new Set(state.lines.map(l => l.id));
  const budget = sum(lines.map(l => l.budget));
  const forecast = sum(lines.map(l => l.forecast ?? l.budget));
  const committed = sum(lines.map(l => l.committed));
  const included = allowances.filter(a => a.status === "included");
  const added = sum(included.filter(a => !a.budgetLineId || !lineIds.has(a.budgetLineId)).map(a => a.amount));
  return {
    budget, direct: sum(lines.filter(l => l.classification === "direct").map(l => l.budget)), indirect: sum(lines.filter(l => l.classification === "indirect").map(l => l.budget)),
    forecast, committed, remaining: dollars(cents(budget) - cents(committed)), variance: dollars(cents(budget) - cents(forecast)),
    unforecastLines: lines.filter(l => l.forecast === null).length,
    allowancesAdded: added,
    allowancesInLines: sum(included.filter(a => a.budgetLineId && lineIds.has(a.budgetLineId)).map(a => a.amount)),
    allowancesPending: sum(allowances.filter(a => a.status === "review").map(a => a.amount)),
    allowancesExcluded: sum(allowances.filter(a => a.status === "excluded").map(a => a.amount)),
    totalBudget: dollars(cents(budget) + cents(added)),
    totalForecast: dollars(cents(forecast) + cents(added)),
  };
}

/** Totals per cost center, in first-seen order (lines, then allowance-only centers). */
export function totalsByCostCenter(state: BudgetState): { costCenter: string; totals: BudgetTotals }[] {
  const centers = [...new Set([...state.lines.map(l => l.costCenter), ...state.allowances.map(a => a.costCenter)])];
  return centers.map(costCenter => ({ costCenter, totals: budgetTotals(state, costCenter) }));
}

/** Direct lines grouped by CSI division, ascending; lines without a code are grouped last under "". */
export function totalsByDivision(state: BudgetState): { division: string; name: string; budget: number; forecast: number; committed: number; variance: number; lines: number }[] {
  const groups = new Map<string, BudgetLine[]>();
  for (const line of state.lines.filter(l => l.classification === "direct")) {
    const division = line.csiCode ? line.csiCode.slice(0, 2) : "";
    groups.set(division, [...(groups.get(division) ?? []), line]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([division, lines]) => {
      const budget = sum(lines.map(l => l.budget)), forecast = sum(lines.map(l => l.forecast ?? l.budget));
      return { division, name: CSI_DIVISIONS[division] ?? "No CSI division", budget, forecast, committed: sum(lines.map(l => l.committed)), variance: dollars(cents(budget) - cents(forecast)), lines: lines.length };
    });
}

// ── Leveling roll-up ────────────────────────────────────────────────────────

/** One leveled bidder, with all three values a forecast could use. Nothing is chosen here. */
export type LevelingCandidate = {
  levelingBidderId: string; bidderName: string;
  packageId: string | null; bidderId: string | null; submissionId: string | null; revisionNumber: number | null; formVersion: number | null;
  stale: boolean; eligible: boolean; eligibilityReasons: string[];
  baseBid: number | null; provisionalTotal: number | null; reviewedTotal: number | null;
};

type WorkspaceBidder = LevelingBidder & { bondRate?: number; zeroPriceApproved?: boolean };

/**
 * Candidates from the CURRENT leveling workspace (with the estimator's resolutions and
 * adjustments), using the leveling engine's own totals. Bidders without portal provenance
 * (Excel or demo) are included with null package/submission fields unless packageId is given.
 */
export function levelingCandidates(input: { packageId: string | null; items: LevelingScopeItem[]; bidders: WorkspaceBidder[]; provenance?: Record<string, BidProvenance> }): LevelingCandidate[] {
  return input.bidders.map(bidder => {
    const totals = bidderTotals(bidder, input.items);
    const p = input.provenance?.[bidder.id];
    return {
      levelingBidderId: bidder.id, bidderName: bidder.name,
      packageId: p?.packageId ?? input.packageId, bidderId: p?.bidderId ?? null, submissionId: p?.submissionId ?? null,
      revisionNumber: p?.revisionNumber ?? null, formVersion: p?.formVersion ?? null, stale: p?.stale ?? false,
      eligible: totals.eligible, eligibilityReasons: totals.eligibilityReasons,
      baseBid: typeof bidder.baseBid === "number" && Number.isFinite(bidder.baseBid) ? bidder.baseBid : null,
      provisionalTotal: totals.provisionalTotal, reviewedTotal: totals.reviewedTotal,
    };
  });
}

const BASIS_LABEL: Record<LevelingBasis, string> = { base: "base bid", provisional: "provisional total", reviewed: "reviewed total" };

/**
 * Sets a direct line's forecast from one leveled bidder, using the value the caller chose.
 * Refuses stale bids and missing values (a bid still under review has no reviewed total).
 * The budget, approval and committed value are not touched.
 */
export function applyLevelingValue(state: BudgetState, lineId: string, candidate: LevelingCandidate, basis: LevelingBasis, by: string, at = now()): BudgetState {
  const line = findLine(state, lineId);
  if (line.classification !== "direct") fail({ forecast: "Leveled bids apply to direct construction lines only." });
  if (!(basis in BASIS_LABEL)) fail({ forecast: "Choose base bid, provisional total, or reviewed total." });
  if (candidate.stale) fail({ forecast: `${candidate.bidderName} priced an older bid form; ask them to resubmit before using their number.` });
  const value = basis === "base" ? candidate.baseBid : basis === "provisional" ? candidate.provisionalTotal : candidate.reviewedTotal;
  if (value === null) {
    fail({ forecast: basis === "reviewed"
      ? `${candidate.bidderName} has no reviewed total yet (${candidate.eligibilityReasons.join(", ") || "review incomplete"}). Finish the review or choose another value.`
      : `${candidate.bidderName} has no ${BASIS_LABEL[basis]}.` });
  }
  const error = amountError(value, "forecast");
  if (error) fail({ forecast: error });
  const forecastSource: ForecastSource = {
    kind: "leveling", basis, value: value as number, packageId: candidate.packageId, levelingBidderId: candidate.levelingBidderId,
    bidderName: candidate.bidderName, submissionId: candidate.submissionId, revisionNumber: candidate.revisionNumber, appliedAt: at, appliedBy: by,
  };
  return { ...state, lines: state.lines.map(l => l.id === lineId ? { ...l, forecast: value as number, forecastSource, updatedAt: at } : l) };
}
