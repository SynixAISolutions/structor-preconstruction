// Value engineering for ONE project (demo, browser-only).
//
// Marcel (20 Sep, 28:16–30:31): set a target reduction ("the budget is 30 million and we need to
// be at 28"), list ideas to get there — AI suggestions and the team's own — send individual items
// to subcontractors for pricing, and record the quoted saving and the decision. Ideas stay
// proposals until the team decides: VE can change design, performance and contract scope.
//
// Shape follows his budget template's VE Report: numbered items (VE-01…) under headings, each with
// a signed COST IMPACT (negative = saving) and a WEIGHTED cost impact = cost impact × the project's
// markup factor (general conditions, fee, insurance, bond, contingency ride on top of trade cost).
//
// Nothing here changes the budget. Pure functions; rule violations throw VeRuleError with
// field-level errors. Pricing requests are recorded as notifications, never sent.

import type { DirectoryCompany } from "./procurement";

export type VeOrigin = "team" | "ai" | "subcontractor";
export type VeStatus = "idea" | "pricing" | "priced" | "accepted" | "rejected";

export type VePricingRequest = {
  id: string; bidderId: string; company: string; requestedAt: string; requestedBy: string;
  status: "requested" | "quoted" | "declined";
  /** Signed like the idea's cost impact: negative = the subcontractor's saving. */
  quotedImpact: number | null; answeredAt: string | null; note: string;
};

export type VeIdea = {
  id: string;
  /** "VE-01", in the order ideas were added. */
  number: string;
  /** Heading it sits under, e.g. "MEP reductions". */
  category: string;
  description: string;
  csiCode: string | null;
  packageId: string | null;
  /** Drawing or specification reference the idea comes from. */
  source: string;
  origin: VeOrigin;
  /** The team's estimate. Negative = saving, positive = added cost. */
  costImpact: number;
  notes: string;
  status: VeStatus;
  pricing: VePricingRequest[];
  decision: { outcome: "accepted" | "rejected"; by: string; at: string; note: string; acceptedImpact: number | null } | null;
  createdAt: string; createdBy: string; updatedAt: string;
};

export type VeNotification = { id: string; ideaId: string; recipientType: "bidder"; recipient: string; text: string; at: string; read: boolean };

export type VeState = {
  /** Either the owner's budget (target = estimate − owner budget) or a reduction entered directly; the reduction wins when both are set. */
  target: { ownerBudget: number | null; reduction: number | null };
  /** Weighted impact = cost impact × this (1 = no markups). */
  markupFactor: number;
  /** Highest VE number ever issued here, so a removed idea's number is never reused. */
  lastNumber: number;
  ideas: VeIdea[];
  notifications: VeNotification[];
};

export const EMPTY_VE: VeState = { target: { ownerBudget: null, reduction: null }, markupFactor: 1, lastNumber: 0, ideas: [], notifications: [] };

export type VeIdeaInput = { description: string; category?: string; csiCode?: string | null; packageId?: string | null; source?: string; origin?: VeOrigin; costImpact: number; notes?: string };
export type VeErrors = Partial<Record<"description" | "costImpact" | "ownerBudget" | "reduction" | "markupFactor" | "bidders" | "quote" | "decision" | "idea", string>>;

export class VeRuleError extends Error {
  readonly errors: VeErrors;
  constructor(errors: VeErrors) {
    super(Object.values(errors).join(" "));
    this.name = "VeRuleError";
    this.errors = errors;
  }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: VeErrors): never => { throw new VeRuleError(errors); };
const cents = (n: number) => Math.round(n * 100);
const money = (value: unknown, label: string, allowZero = true): string | undefined =>
  typeof value !== "number" || !Number.isFinite(value) ? `Enter the ${label} as a number.`
    : Math.abs(value * 100 - Math.round(value * 100)) > 1e-6 ? `The ${label} can have at most two decimal places.`
    : !allowZero && value === 0 ? `The ${label} cannot be zero.` : undefined;

function findIdea(state: VeState, id: string): VeIdea {
  return state.ideas.find(i => i.id === id) ?? fail({ idea: "That idea no longer exists." });
}
const replace = (state: VeState, idea: VeIdea): VeState => ({ ...state, ideas: state.ideas.map(i => i.id === idea.id ? idea : i) });
const open = (idea: VeIdea) => (idea.decision ? fail({ decision: `${idea.number} is ${idea.decision.outcome}; reopen it first.` }) : idea);

// ── Target and markups ──────────────────────────────────────────────────────

export function setVeTarget(state: VeState, target: { ownerBudget?: number | null; reduction?: number | null }): VeState {
  const next = { ...state.target, ...target };
  const errors: VeErrors = {};
  if (next.ownerBudget !== null) { const e = money(next.ownerBudget, "owner budget", false) ?? (next.ownerBudget < 0 ? "The owner budget must be positive." : undefined); if (e) errors.ownerBudget = e; }
  if (next.reduction !== null) { const e = money(next.reduction, "target reduction", false) ?? (next.reduction < 0 ? "Enter the reduction as a positive amount." : undefined); if (e) errors.reduction = e; }
  if (Object.keys(errors).length) fail(errors);
  return { ...state, target: { ownerBudget: next.ownerBudget ?? null, reduction: next.reduction ?? null } };
}

export function setMarkupFactor(state: VeState, factor: number): VeState {
  if (!(typeof factor === "number" && factor >= 1 && factor <= 3)) fail({ markupFactor: "Use a markup factor between 1 and 3 (e.g. 1.25 for 25% of markups)." });
  return { ...state, markupFactor: Math.round(factor * 10000) / 10000 };
}

// ── Ideas ───────────────────────────────────────────────────────────────────

const lastNumber = (state: VeState) => Math.max(state.lastNumber || 0, ...state.ideas.map(i => Number(i.number.slice(3)) || 0));
/** The number the next idea gets: one past the highest ever issued, so removed numbers are never reused. */
export const nextVeNumber = (state: VeState): string => `VE-${String(lastNumber(state) + 1).padStart(2, "0")}`;

export function addVeIdea(state: VeState, input: VeIdeaInput, by: string, at = now()): VeState {
  const errors: VeErrors = {};
  if (!input.description?.trim()) errors.description = "Describe the idea.";
  const impact = money(input.costImpact, "cost impact", false);
  if (impact) errors.costImpact = impact;
  if (Object.keys(errors).length) fail(errors);
  const idea: VeIdea = {
    id: newId(), number: nextVeNumber(state), category: input.category?.trim() ?? "", description: input.description.trim(),
    csiCode: input.csiCode?.trim() || null, packageId: input.packageId || null, source: input.source?.trim() ?? "", origin: input.origin ?? "team",
    costImpact: input.costImpact, notes: input.notes?.trim() ?? "", status: "idea", pricing: [], decision: null, createdAt: at, createdBy: by, updatedAt: at,
  };
  return { ...state, lastNumber: lastNumber(state) + 1, ideas: [...state.ideas, idea] };
}

/** Allowed until a decision is made. */
export function editVeIdea(state: VeState, id: string, patch: Partial<VeIdeaInput>, at = now()): VeState {
  const idea = open(findIdea(state, id));
  const merged = { ...idea, ...patch };
  const errors: VeErrors = {};
  if (!merged.description?.trim()) errors.description = "Describe the idea.";
  const impact = money(merged.costImpact, "cost impact", false);
  if (impact) errors.costImpact = impact;
  if (Object.keys(errors).length) fail(errors);
  return replace(state, {
    ...idea, category: merged.category?.trim() ?? "", description: merged.description.trim(), csiCode: merged.csiCode?.trim() || null,
    packageId: merged.packageId || null, source: merged.source?.trim() ?? "", origin: merged.origin ?? idea.origin, costImpact: merged.costImpact, notes: merged.notes?.trim() ?? "", updatedAt: at,
  });
}

/** Removal is refused for accepted ideas: an accepted saving must be reopened first. */
export function removeVeIdea(state: VeState, id: string): VeState {
  const idea = findIdea(state, id);
  if (idea.decision?.outcome === "accepted") fail({ decision: `${idea.number} is accepted; reopen it before removing it.` });
  return { ...state, ideas: state.ideas.filter(i => i.id !== id), notifications: state.notifications.filter(n => n.ideaId !== id) };
}

// ── Pricing from subcontractors ─────────────────────────────────────────────

/** Asks directory companies to price one idea. Each company is asked once per idea. */
export function requestVePricing(state: VeState, id: string, bidders: DirectoryCompany[], by: string, at = now()): VeState {
  const idea = open(findIdea(state, id));
  if (!bidders.length) fail({ bidders: "Choose at least one company." });
  const already = new Set(idea.pricing.map(p => p.bidderId));
  const fresh = bidders.filter(b => !already.has(b.id));
  if (!fresh.length) fail({ bidders: "Those companies were already asked to price this idea." });
  const requests: VePricingRequest[] = fresh.map(b => ({ id: newId(), bidderId: b.id, company: b.company, requestedAt: at, requestedBy: by, status: "requested", quotedImpact: null, answeredAt: null, note: "" }));
  const next = replace(state, { ...idea, status: idea.status === "idea" ? "pricing" : idea.status, pricing: [...idea.pricing, ...requests], updatedAt: at });
  return { ...next, notifications: [...next.notifications, ...fresh.map(b => ({
    id: newId(), ideaId: id, recipientType: "bidder" as const, recipient: b.id, at, read: false,
    text: `Please price value-engineering item ${idea.number}: ${idea.description}`,
  }))] };
}

/** Records a subcontractor's priced saving (negative) or added cost (positive). */
export function recordVeQuote(state: VeState, id: string, requestId: string, quote: { quotedImpact: number; note?: string }, at = now()): VeState {
  const idea = open(findIdea(state, id));
  if (!idea.pricing.some(p => p.id === requestId)) fail({ quote: "That pricing request no longer exists." });
  const e = money(quote.quotedImpact, "quoted cost impact", false);
  if (e) fail({ quote: e });
  const pricing = idea.pricing.map(p => p.id === requestId ? { ...p, status: "quoted" as const, quotedImpact: quote.quotedImpact, answeredAt: at, note: quote.note?.trim() ?? "" } : p);
  return replace(state, { ...idea, pricing, status: "priced", updatedAt: at });
}

export function declineVePricing(state: VeState, id: string, requestId: string, note: string, at = now()): VeState {
  const idea = open(findIdea(state, id));
  if (!idea.pricing.some(p => p.id === requestId)) fail({ quote: "That pricing request no longer exists." });
  const pricing = idea.pricing.map(p => p.id === requestId ? { ...p, status: "declined" as const, quotedImpact: null, answeredAt: at, note: note?.trim() ?? "" } : p);
  const status: VeStatus = pricing.some(p => p.status === "quoted") ? "priced" : pricing.some(p => p.status === "requested") ? "pricing" : "idea";
  return replace(state, { ...idea, pricing, status, updatedAt: at });
}

// ── Decisions ───────────────────────────────────────────────────────────────

/**
 * Accept or reject an idea. Accepting needs the cost impact being accepted — the estimate or a
 * quote — chosen explicitly by the caller; nothing is picked automatically.
 */
export function decideVeIdea(state: VeState, id: string, outcome: "accepted" | "rejected", details: { acceptedImpact?: number; note?: string }, by: string, at = now()): VeState {
  const idea = open(findIdea(state, id));
  if (outcome !== "accepted" && outcome !== "rejected") fail({ decision: "Accept or reject the idea." });
  let acceptedImpact: number | null = null;
  if (outcome === "accepted") {
    const e = money(details.acceptedImpact, "accepted cost impact", false);
    if (e) fail({ decision: e });
    acceptedImpact = details.acceptedImpact!;
  }
  return replace(state, { ...idea, status: outcome, decision: { outcome, by, at, note: details.note?.trim() ?? "", acceptedImpact }, updatedAt: at });
}

export function reopenVeIdea(state: VeState, id: string, at = now()): VeState {
  const idea = findIdea(state, id);
  if (!idea.decision) return state;
  const status: VeStatus = idea.pricing.some(p => p.status === "quoted") ? "priced" : idea.pricing.some(p => p.status === "requested") ? "pricing" : "idea";
  return replace(state, { ...idea, decision: null, status, updatedAt: at });
}

// ── Reading ─────────────────────────────────────────────────────────────────

export const weightedImpact = (costImpact: number, factor: number): number => Math.round(costImpact * factor * 100) / 100;

/** The best known cost impact of an undecided idea: the lowest quote if any, else the estimate. */
export function bestKnownImpact(idea: VeIdea): number {
  const quotes = idea.pricing.filter(p => p.status === "quoted" && p.quotedImpact !== null).map(p => p.quotedImpact!);
  return quotes.length ? Math.min(...quotes) : idea.costImpact;
}

export type VeSummary = {
  /** Reduction still needed; null when no target is set. */
  targetReduction: number | null;
  /** Sum of accepted cost impacts (negative = saving), raw and with markups. */
  accepted: number; acceptedWeighted: number;
  /** Undecided ideas at their best known impact, with markups. */
  pendingWeighted: number;
  /** targetReduction − accepted saving (weighted); ≤ 0 means the target is met. */
  gap: number | null;
  percentOfTarget: number | null;
  /** estimate + accepted weighted impact; null without an estimate. */
  projectedEstimate: number | null;
  counts: Record<VeStatus, number>;
};

/** `estimate` is the current project estimate (e.g. budgetTotals(budget).totalBudget). */
export function veSummary(state: VeState, estimate: number | null): VeSummary {
  const f = state.markupFactor;
  const sum = (xs: number[]) => xs.reduce((t, x) => t + cents(x), 0) / 100;
  const acceptedIdeas = state.ideas.filter(i => i.decision?.outcome === "accepted");
  const accepted = sum(acceptedIdeas.map(i => i.decision!.acceptedImpact!));
  const acceptedWeighted = sum(acceptedIdeas.map(i => weightedImpact(i.decision!.acceptedImpact!, f)));
  const pendingWeighted = sum(state.ideas.filter(i => !i.decision).map(i => weightedImpact(bestKnownImpact(i), f)));
  const target = state.target.reduction ?? (state.target.ownerBudget !== null && estimate !== null ? Math.max(0, (cents(estimate) - cents(state.target.ownerBudget)) / 100) : null);
  const saved = -acceptedWeighted;
  const counts = { idea: 0, pricing: 0, priced: 0, accepted: 0, rejected: 0 } as Record<VeStatus, number>;
  for (const i of state.ideas) counts[i.status]++;
  return {
    targetReduction: target, accepted, acceptedWeighted, pendingWeighted,
    gap: target === null ? null : (cents(target) - cents(saved)) / 100,
    percentOfTarget: target ? Math.round((saved / target) * 1000) / 10 : null,
    projectedEstimate: estimate === null ? null : (cents(estimate) + cents(acceptedWeighted)) / 100,
    counts,
  };
}
