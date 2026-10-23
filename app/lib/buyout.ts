// Scope review & buyout (Marcel, 22 Oct, Bid packages): "after we finish bid leveling … we set up scope
// review meetings … I need to take meeting minutes … they send me their best and final offer … we choose …
// I send out the Exhibit A and the subcontract … we need something that shows contract sent out, ball in
// court … to track every single trade, buying it out." Columns follow MCN's Owner Buyout Log template
// (Trade, Rec sub for award, Target subs, Anticipated / Drop-dead / Actual award date, Buyout delta,
// Scope review week, Status, Notes).
//
// Stored per project under "buyout": the plan, the scope review, its minutes and the best and final
// offers. Everything after the award (Exhibit A, subcontract, signatures) is read from lib/award, never
// stored twice.

import { activeAward, awardStage, type AwardState } from "./award";
import { tradeBids, tradeForBudgetLine } from "./budget-comparison";
import type { BudgetState, LevelingCandidate } from "./budget";
import type { Procurement } from "./procurement";
import type { Submission } from "./submissions";

export type Minute = { id: string; text: string; at: string; by: string };
export type Bafo = { id: string; bidderId: string | null; company: string; amount: number; note: string; receivedAt: string; by: string };
export type ScopeReview = { date: string; attendees: string; held: { at: string; by: string } | null; minutes: Minute[] };
export type BuyoutEntry = {
  packageId: string;
  /** Recommended subcontractor for award and the other companies still in the running (directory ids or names). */
  recommended: string; targets: string[];
  anticipatedAward: string; dropDeadAward: string;
  notes: string;
  scopeReview: ScopeReview | null;
  bafos: Bafo[];
  updatedAt: string; updatedBy: string;
};
export type BuyoutState = { entries: BuyoutEntry[] };
export const EMPTY_BUYOUT: BuyoutState = { entries: [] };

export type BuyoutStatus = "awaiting-bids" | "ready-for-review" | "review-scheduled" | "negotiating" | "awarded" | "contract-out" | "executed";
export const BUYOUT_STATUS_LABEL: Record<BuyoutStatus, string> = {
  "awaiting-bids": "Awaiting bids", "ready-for-review": "Ready for scope review", "review-scheduled": "Scope review scheduled",
  negotiating: "Negotiating", awarded: "Awarded", "contract-out": "Contract out", executed: "Executed",
};
/** Whose move it is: ours, the subcontractor's, or nobody's yet. */
export type BallInCourt = "contractor" | "subcontractor" | null;

export type BuyoutRow = {
  packageId: string; trade: string; code: string; owner: string;
  status: BuyoutStatus; ballInCourt: BallInCourt;
  /** What the ball-in-court is waiting for, in words. */
  next: string;
  bids: number; low: { name: string; value: number } | null;
  bestAndFinal: Bafo | null;
  award: { company: string; amount: number; at: string } | null;
  /** The trade's in-house budget (its own budget lines) minus the award, else the best and final, else the low bid. Positive = under budget. */
  budget: number | null; delta: number | null;
  entry: BuyoutEntry | null;
};

export class BuyoutRuleError extends Error {
  constructor(message: string) { super(message); this.name = "BuyoutRuleError"; }
}
const fail = (message: string): never => { throw new BuyoutRuleError(message); };
const isDate = (v: string) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);
const newId = () => Math.random().toString(36).slice(2, 10);
const cents = (v: number) => Math.round(v * 100) / 100;

const blank = (packageId: string, by: string, at: string): BuyoutEntry =>
  ({ packageId, recommended: "", targets: [], anticipatedAward: "", dropDeadAward: "", notes: "", scopeReview: null, bafos: [], updatedAt: at, updatedBy: by });

function change(state: BuyoutState, procurement: Procurement, packageId: string, by: string, at: string, apply: (entry: BuyoutEntry) => BuyoutEntry): BuyoutState {
  if (!procurement.packages.some(p => p.id === packageId)) fail("Choose a trade package.");
  const current = state.entries.find(e => e.packageId === packageId) ?? blank(packageId, by, at);
  const next = { ...apply(current), updatedAt: at, updatedBy: by };
  return { entries: [...state.entries.filter(e => e.packageId !== packageId), next] };
}

/** The buyout plan for a trade: recommended sub, other targets, award dates and notes. */
export function setBuyoutPlan(state: BuyoutState, procurement: Procurement, packageId: string, plan: Partial<Pick<BuyoutEntry, "recommended" | "targets" | "anticipatedAward" | "dropDeadAward" | "notes">>, by: string, at = new Date().toISOString()): BuyoutState {
  if (plan.anticipatedAward !== undefined && !isDate(plan.anticipatedAward)) fail("Use a date for the anticipated award.");
  if (plan.dropDeadAward !== undefined && !isDate(plan.dropDeadAward)) fail("Use a date for the drop-dead award.");
  if (plan.notes !== undefined && plan.notes.length > 4000) fail("Keep the notes under 4,000 characters.");
  return change(state, procurement, packageId, by, at, e => ({
    ...e, ...plan,
    recommended: plan.recommended?.trim() ?? e.recommended,
    targets: plan.targets ? [...new Set(plan.targets.map(t => t.trim()).filter(Boolean))] : e.targets,
    notes: plan.notes?.trim() ?? e.notes,
  }));
}

/** Schedules (or moves) the scope review meeting. Minutes already taken stay. */
export function scheduleScopeReview(state: BuyoutState, procurement: Procurement, packageId: string, input: { date: string; attendees?: string }, by: string, at = new Date().toISOString()): BuyoutState {
  if (!input.date || !isDate(input.date)) fail("Choose the scope review date.");
  return change(state, procurement, packageId, by, at, e => ({ ...e, scopeReview: { date: input.date, attendees: input.attendees?.trim() ?? e.scopeReview?.attendees ?? "", held: e.scopeReview?.held ?? null, minutes: e.scopeReview?.minutes ?? [] } }));
}

/** Adds a note to the scope review's minutes. */
export function addMinutes(state: BuyoutState, procurement: Procurement, packageId: string, text: string, by: string, at = new Date().toISOString()): BuyoutState {
  const body = text.trim();
  if (!body) fail("Write the minute before adding it.");
  if (body.length > 4000) fail("Keep each minute under 4,000 characters.");
  return change(state, procurement, packageId, by, at, e => {
    if (!e.scopeReview) fail("Schedule the scope review first.");
    return { ...e, scopeReview: { ...e.scopeReview!, minutes: [...e.scopeReview!.minutes, { id: newId(), text: body, at, by }] } };
  });
}

/** Records that the scope review took place; the ball moves to the subcontractor's best and final. */
export function markScopeReviewHeld(state: BuyoutState, procurement: Procurement, packageId: string, by: string, at = new Date().toISOString()): BuyoutState {
  return change(state, procurement, packageId, by, at, e => {
    if (!e.scopeReview) fail("Schedule the scope review first.");
    return { ...e, scopeReview: { ...e.scopeReview!, held: { at, by } } };
  });
}

/** Records a company's best and final offer. A later offer from the same company replaces its earlier one. */
export function recordBafo(state: BuyoutState, procurement: Procurement, packageId: string, input: { bidderId?: string | null; company: string; amount: number; note?: string }, by: string, at = new Date().toISOString()): BuyoutState {
  const company = input.company.trim() || fail("Name the company.");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e10 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 1e-6) fail("Enter the best and final amount in dollars and cents.");
  const bafo: Bafo = { id: newId(), bidderId: input.bidderId ?? null, company, amount: input.amount, note: input.note?.trim() ?? "", receivedAt: at, by };
  const same = (b: Bafo) => (bafo.bidderId && b.bidderId === bafo.bidderId) || b.company.toLowerCase() === company.toLowerCase();
  return change(state, procurement, packageId, by, at, e => ({ ...e, bafos: [...e.bafos.filter(b => !same(b)), bafo] }));
}

export type BuyoutInput = {
  procurement: Procurement; submissions: Submission[]; candidates: LevelingCandidate[]; directory: { id: string; company: string }[];
  budget: BudgetState; awards: AwardState; buyout: BuyoutState;
};

/** One row per trade, in procurement order: where its buyout stands and whose move it is. */
export function buyoutRows(input: BuyoutInput): BuyoutRow[] {
  const { procurement, budget } = input;
  const direct = budget.lines.filter(l => l.classification === "direct" && !l.byOwner);
  const lineOwner = new Map(direct.map(l => [l.id, tradeForBudgetLine(budget, procurement, l)?.id ?? null]));
  return procurement.packages.map(pkg => {
    const entry = input.buyout.entries.find(e => e.packageId === pkg.id) ?? null;
    const bids = tradeBids(procurement, input.submissions, pkg.id, input.candidates, input.directory);
    const award = activeAward(input.awards, pkg.id);
    const stage = award ? awardStage(award) : null;
    const bestAndFinal = entry?.bafos.length ? [...entry.bafos].sort((a, b) => a.amount - b.amount)[0] : null;
    const review = entry?.scopeReview ?? null;
    let status: BuyoutStatus, ballInCourt: BallInCourt, next: string;
    if (stage === "executed") [status, ballInCourt, next] = ["executed", null, "Bought out"];
    else if (stage && stage !== "exhibit-draft" && stage !== "exhibit-agreed" && stage !== "cancelled") {
      const theirs = stage === "exhibit-shared" || stage === "signature-pending";
      [status, ballInCourt, next] = ["contract-out", theirs ? "subcontractor" : "contractor", {
        "exhibit-shared": "Subcontractor reviewing Exhibit A", "exhibit-changes-requested": "Answer the Exhibit A comments",
        "subcontract-draft": "Send the subcontract for signature", "signature-pending": "Subcontractor to sign",
        "subcontractor-signed": "Countersign the subcontract", countersigned: "Execute the subcontract",
      }[stage as string] ?? "Contract in progress"];
    } else if (award && stage !== "cancelled") [status, ballInCourt, next] = ["awarded", "contractor", stage === "exhibit-agreed" ? "Generate the subcontract" : "Send Exhibit A"];
    else if (!bids.length) [status, ballInCourt, next] = ["awaiting-bids", "subcontractor", "Bids due"];
    else if (!review) [status, ballInCourt, next] = ["ready-for-review", "contractor", "Schedule the scope review"];
    else if (!review.held) [status, ballInCourt, next] = ["review-scheduled", "contractor", `Scope review ${review.date}`];
    else if (!bestAndFinal) [status, ballInCourt, next] = ["negotiating", "subcontractor", "Waiting for best and final"];
    else [status, ballInCourt, next] = ["negotiating", "contractor", "Choose the subcontractor"];
    const lines = direct.filter(l => lineOwner.get(l.id) === pkg.id);
    const own = lines.length ? cents(lines.reduce((s, l) => s + l.budget, 0)) : null;
    const awarded = award && stage !== "cancelled" ? { company: award.snapshot.company.name, amount: award.amount, at: award.createdAt } : null;
    const basis = awarded?.amount ?? bestAndFinal?.amount ?? bids[0]?.value ?? null;
    return {
      packageId: pkg.id, trade: pkg.name, code: pkg.code, owner: pkg.owner, status, ballInCourt, next,
      bids: bids.length, low: bids[0] ? { name: bids[0].name, value: bids[0].value } : null, bestAndFinal, award: awarded,
      budget: own, delta: own !== null && basis !== null ? cents(own - basis) : null, entry,
    };
  });
}
