// Drawing Flip for ONE project (demo, browser-only).
//
// Marcel (20 Sep, 26:15–28:16): flip through the actual drawing pages with every region colour-
// coded by the trade responsible for it; selecting a scope item highlights where it is on the
// drawings; the estimators correct the AI's trade calls during the review, so nothing is missed
// and no two trades carry the same work. Danial (30 Sep): its own Preconstruction page, linked to
// and from Scopes & bid forms.
//
// Trades are the project's bid packages (lib/procurement.ts). A region belongs to one package and
// links only to that package's scope items (or all-trades items). Colours are the UI's choice.
//
// COORDINATES: every point is normalised to its page — 0 to 1, origin at the TOP-LEFT corner,
// x to the right, y downward — so regions don't depend on zoom, resolution or image size. A region
// is a polygon of at least three points; rectangle() builds the usual four-point box. Values are
// kept to 4 decimals.
//
// As in Structor Check, a region Structor's AI proposes waits for contractor review; an estimator's
// own region counts as reviewed when it is drawn. Every change appends to the region's history, so
// reassignments (corrections) are never lost.
//
// Pure functions; rule violations throw DrawingFlipRuleError with field-level errors. Nothing is
// extracted from real drawings: pages and regions are entered or imported as data.

import type { Procurement, ScopeItem, TradePackage } from "./procurement";

export type Point = { x: number; y: number };

export type DrawingPage = {
  id: string;
  /** Sheet number as on the List of drawings, e.g. "A-101". */
  sheet: string;
  title: string;
  discipline: string;
  revision: string;
  /** The project file the page comes from (Project files id) and its name. */
  documentId: string;
  documentName: string;
  /** 1-based page within that file. */
  pageNumber: number;
  /** Sheet width ÷ height (ARCH D landscape is 1.5), so the viewer can lay out a page without an image. */
  aspect: number;
  /** A rendered image of the page, when there is one. None in the demo. */
  image: string | null;
  /** Runtime PDF pages require their original file; never substitute sample linework. */
  source?: "uploaded";
};

export type RegionOrigin = "ai" | "estimator";
export type RegionStatus = "pending-review" | "approved";

export type RegionEvent =
  | { kind: "created"; at: string; by: string; packageId: string }
  | { kind: "approved"; at: string; by: string }
  /** A correction. `unlinked`: scope items of the old trade that the region no longer shows. */
  | { kind: "reassigned"; at: string; by: string; from: string; to: string; reason: string; unlinked: string[] }
  | { kind: "linked" | "unlinked"; at: string; by: string; scopeId: string }
  | { kind: "notes"; at: string; by: string; text: string };

export type FlipRegion = {
  id: string;
  /** "R-001", never reused. */
  number: string;
  pageId: string;
  label: string;
  polygon: Point[];
  /** The responsible trade: a bid package id. */
  packageId: string;
  scopeIds: string[];
  /** What on the drawing supports the trade call, e.g. "Hatched per demolition legend; keynote 01". */
  evidence: string;
  /** The AI's confidence in its trade call, 0–1. Null for an estimator's region. */
  confidence: number | null;
  origin: RegionOrigin;
  status: RegionStatus;
  reviewedBy: string | null; reviewedAt: string | null;
  notes: string;
  history: RegionEvent[];
  createdAt: string; createdBy: string;
};

export type DrawingFlipState = { pages: DrawingPage[]; regions: FlipRegion[]; lastRegionNumber: number };
export const EMPTY_DRAWING_FLIP: DrawingFlipState = { pages: [], regions: [], lastRegionNumber: 0 };

export type PageInput = {
  source?: "uploaded";
  sheet: string; title?: string; discipline?: string; revision?: string;
  documentId: string; documentName?: string; pageNumber: number; aspect?: number; image?: string | null;
};
export type RegionInput = {
  pageId: string; label: string; polygon: Point[]; packageId: string; scopeIds?: string[];
  evidence?: string; confidence?: number | null; origin?: RegionOrigin; notes?: string;
};
/** `division` is the CSI trade ("09"), `packageId` one package within it. `corrected`: reassigned at least once. */
export type RegionFilter = { pageId?: string; division?: string; packageId?: string; status?: RegionStatus; origin?: RegionOrigin; corrected?: boolean; query?: string };

export type DrawingFlipErrors = Partial<Record<
  "sheet" | "document" | "pageNumber" | "aspect" | "page" | "label" | "polygon" | "packageId" | "scopeIds" | "evidence" | "confidence" | "region" | "by", string>>;

export class DrawingFlipRuleError extends Error {
  readonly errors: DrawingFlipErrors;
  constructor(errors: DrawingFlipErrors) {
    super(Object.values(errors).join(" "));
    this.name = "DrawingFlipRuleError";
    this.errors = errors;
  }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: DrawingFlipErrors): never => { throw new DrawingFlipRuleError(errors); };
const check = (errors: DrawingFlipErrors) => { if (Object.keys(errors).length) fail(errors); };
const pad = (n: number) => String(n).padStart(3, "0");
const round = (v: number) => Math.round(v * 10000) / 10000;
/** Smallest region worth keeping: 0.0001 of the page, a box 1% of the page each way (0.36 × 0.24 in on ARCH D). */
const MIN_AREA = 0.0001;

// ── Geometry ────────────────────────────────────────────────────────────────

/** The four corners of a box, clockwise from the top-left. */
export const rectangle = (x: number, y: number, width: number, height: number): Point[] =>
  [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }].map(p => ({ x: round(p.x), y: round(p.y) }));

/** Share of the page a polygon covers (shoelace formula). */
export function polygonArea(polygon: Point[]): number {
  let twice = 0;
  polygon.forEach((p, i) => { const q = polygon[(i + 1) % polygon.length]; twice += p.x * q.y - q.x * p.y; });
  return Math.abs(twice) / 2;
}

/** The box around a polygon, for zooming to or highlighting a region. */
export function bounds(polygon: Point[]): { x: number; y: number; width: number; height: number } {
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: round(Math.max(...xs) - x), height: round(Math.max(...ys) - y) };
}

function cleanPolygon(polygon: Point[] | undefined, errors: DrawingFlipErrors): Point[] {
  if (!Array.isArray(polygon) || polygon.length < 3) { errors.polygon = "Mark at least three points."; return []; }
  const onPage = (v: unknown) => typeof v === "number" && v >= 0 && v <= 1;
  if (!polygon.every(p => p && onPage(p.x) && onPage(p.y))) { errors.polygon = "Every point must be on the page: 0 to 1 from the top-left corner."; return []; }
  const points = polygon.map(p => ({ x: round(p.x), y: round(p.y) }));
  if (polygonArea(points) < MIN_AREA) errors.polygon = "The region is too small to see.";
  return points;
}

// ── Reading ─────────────────────────────────────────────────────────────────

const packageOf = (procurement: Procurement, id: string): TradePackage | undefined => procurement.packages.find(p => p.id === id);
const corrected = (r: FlipRegion) => r.history.some(e => e.kind === "reassigned");
const pageOrder = (state: DrawingFlipState) => new Map(state.pages.map((p, i) => [p.id, i]));
const byPage = (state: DrawingFlipState) => {
  const order = pageOrder(state);
  return (a: FlipRegion, b: FlipRegion) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || a.number.localeCompare(b.number);
};

/** The regions on screen: by page, trade, package, review state, origin, correction, or text. In page order. */
export function filterRegions(state: DrawingFlipState, procurement: Procurement, filter: RegionFilter = {}): FlipRegion[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return state.regions.filter(r => {
    const pkg = packageOf(procurement, r.packageId);
    return (!filter.pageId || r.pageId === filter.pageId) && (!filter.division || pkg?.division === filter.division)
      && (!filter.packageId || r.packageId === filter.packageId) && (!filter.status || r.status === filter.status)
      && (!filter.origin || r.origin === filter.origin) && (filter.corrected === undefined || corrected(r) === filter.corrected)
      && (!q || `${r.number} ${r.label} ${r.evidence} ${r.notes} ${pkg?.name ?? ""}`.toLowerCase().includes(q));
  }).sort(byPage(state));
}

/** Where a scope item is on the drawings — what to highlight when it is selected in Scopes & bid forms. */
export const regionsForScope = (state: DrawingFlipState, scopeId: string): FlipRegion[] =>
  state.regions.filter(r => r.scopeIds.includes(scopeId)).sort(byPage(state));

/** Scope items not located on any drawing yet: possible missing or unchecked scope. */
export const unlocatedScopes = (state: DrawingFlipState, procurement: Procurement): ScopeItem[] =>
  procurement.scopes.filter(s => !state.regions.some(r => r.scopeIds.includes(s.id)));

/** The trades on a page (or the whole set), for the colour legend. Ordered by division, then name. */
export function tradeLegend(state: DrawingFlipState, procurement: Procurement, pageId?: string) {
  const regions = state.regions.filter(r => !pageId || r.pageId === pageId);
  return procurement.packages
    .map(p => ({ packageId: p.id, name: p.name, division: p.division, regions: regions.filter(r => r.packageId === p.id).length }))
    .filter(t => t.regions)
    .sort((a, b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name));
}

export type FlipSummary = { regions: number; pendingReview: number; approved: number; corrected: number; withoutScope: number };

/** Headline counts for the whole set or one page. */
export function flipSummary(state: DrawingFlipState, pageId?: string): FlipSummary {
  const regions = state.regions.filter(r => !pageId || r.pageId === pageId);
  return {
    regions: regions.length,
    pendingReview: regions.filter(r => r.status === "pending-review").length,
    approved: regions.filter(r => r.status === "approved").length,
    corrected: regions.filter(corrected).length,
    withoutScope: regions.filter(r => !r.scopeIds.length).length,
  };
}

/** Every trade reassignment, newest first: the correction log. */
export function corrections(state: DrawingFlipState) {
  return state.regions.flatMap(r => r.history.flatMap(e => e.kind === "reassigned"
    ? [{ regionId: r.id, number: r.number, pageId: r.pageId, from: e.from, to: e.to, reason: e.reason, unlinked: e.unlinked, by: e.by, at: e.at }] : []))
    .sort((a, b) => b.at.localeCompare(a.at));
}

// ── Pages ───────────────────────────────────────────────────────────────────

/** Adds a drawing page: a sheet at a page of a project file. */
export function addPage(state: DrawingFlipState, input: PageInput): DrawingFlipState {
  const errors: DrawingFlipErrors = {};
  const sheet = input.sheet?.trim() ?? "", revision = input.revision?.trim() ?? "";
  if (!sheet) errors.sheet = "Enter the sheet number.";
  else if (state.pages.some(p => p.sheet === sheet && p.revision === revision)) errors.sheet = `${sheet}${revision ? ` revision ${revision}` : ""} is already in the set.`;
  if (!input.documentId?.trim()) errors.document = "Choose the project file the page comes from.";
  if (!Number.isInteger(input.pageNumber) || input.pageNumber < 1) errors.pageNumber = "Use a page number from 1.";
  else if (state.pages.some(p => p.documentId === input.documentId && p.pageNumber === input.pageNumber)) errors.pageNumber = `Page ${input.pageNumber} of that file is already a sheet.`;
  if (input.aspect !== undefined && !(Number.isFinite(input.aspect) && input.aspect > 0)) errors.aspect = "The page shape must be a positive width ÷ height.";
  check(errors);
  const page: DrawingPage = {
    id: newId(), sheet, title: input.title?.trim() ?? "", discipline: input.discipline?.trim() ?? "", revision,
    documentId: input.documentId.trim(), documentName: input.documentName?.trim() ?? "", pageNumber: input.pageNumber,
    aspect: input.aspect ?? 1.5, image: input.image ?? null, ...(input.source ? { source: input.source } : {}),
  };
  return { ...state, pages: [...state.pages, page] };
}

// ── Regions ─────────────────────────────────────────────────────────────────

function findRegion(state: DrawingFlipState, id: string): FlipRegion {
  return state.regions.find(r => r.id === id) ?? fail({ region: "That region no longer exists." });
}
const putRegion = (state: DrawingFlipState, region: FlipRegion): DrawingFlipState =>
  ({ ...state, regions: state.regions.map(r => r.id === region.id ? region : r) });
const needBy = (by: string) => { if (!by?.trim()) fail({ by: "Say who made the change." }); };

/** Why a scope item can't be shown by a region of this package, or null if it can. */
function scopeProblem(procurement: Procurement, packageId: string, scopeId: string): string | null {
  const scope = procurement.scopes.find(s => s.id === scopeId);
  if (!scope) return "A linked scope item no longer exists.";
  if (scope.packageId !== packageId && !scope.allTrades) {
    return `"${scope.title}" belongs to ${packageOf(procurement, scope.packageId)?.name ?? "another trade"}; reassign the region or move the item first.`;
  }
  return null;
}

/**
 * A new region. Origin "ai" (Structor's proposal) needs evidence and a 0–1 confidence and waits
 * for review; origin "estimator" (the default) is reviewed by `by` as it is drawn.
 */
export function addRegion(state: DrawingFlipState, procurement: Procurement, input: RegionInput, by: string, at = now()): DrawingFlipState {
  needBy(by);
  const errors: DrawingFlipErrors = {};
  const origin = input.origin ?? "estimator";
  const ai = origin === "ai";
  if (!state.pages.some(p => p.id === input.pageId)) errors.page = "Choose the drawing page.";
  if (!input.label?.trim()) errors.label = "Name what the region shows.";
  const polygon = cleanPolygon(input.polygon, errors);
  if (!packageOf(procurement, input.packageId)) errors.packageId = "Choose the responsible trade.";
  const scopeIds = [...new Set(input.scopeIds ?? [])];
  if (!errors.packageId) for (const id of scopeIds) { const problem = scopeProblem(procurement, input.packageId, id); if (problem) { errors.scopeIds = problem; break; } }
  if (ai && !input.evidence?.trim()) errors.evidence = "Say what on the drawing supports this trade.";
  const c = input.confidence;
  if (ai && !(typeof c === "number" && c >= 0 && c <= 1)) errors.confidence = "Structor's regions need a confidence from 0 to 1.";
  check(errors);
  const n = Math.max(state.lastRegionNumber || 0, ...state.regions.map(r => Number(r.number.replace(/\D/g, "")) || 0)) + 1;
  const region: FlipRegion = {
    id: newId(), number: `R-${pad(n)}`, pageId: input.pageId, label: input.label.trim(), polygon, packageId: input.packageId, scopeIds,
    evidence: input.evidence?.trim() ?? "", confidence: ai ? c! : null, origin,
    status: ai ? "pending-review" : "approved", reviewedBy: ai ? null : by, reviewedAt: ai ? null : at,
    notes: input.notes?.trim() ?? "", createdAt: at, createdBy: by,
    history: [{ kind: "created", at, by, packageId: input.packageId }, ...scopeIds.map(scopeId => ({ kind: "linked" as const, at, by, scopeId }))],
  };
  return { ...state, lastRegionNumber: n, regions: [...state.regions, region] };
}

/** Adds several regions at once (e.g. Structor's proposals for a page). All or nothing; errors name the region. */
export function importRegions(state: DrawingFlipState, procurement: Procurement, inputs: RegionInput[], by: string, at = now()): DrawingFlipState {
  if (!inputs?.length) fail({ region: "There are no regions to import." });
  return inputs.reduce((next, input, i) => {
    try { return addRegion(next, procurement, input, by, at); } catch (error) {
      if (!(error instanceof DrawingFlipRuleError)) throw error;
      const named = Object.fromEntries(Object.entries(error.errors).map(([k, v]) => [k, `Region ${i + 1}: ${v}`]));
      throw new DrawingFlipRuleError(named);
    }
  }, state);
}

/** Shows a scope item of the region's trade (or an all-trades item) on the region. */
export function linkScope(state: DrawingFlipState, procurement: Procurement, regionId: string, scopeId: string, by: string, at = now()): DrawingFlipState {
  needBy(by);
  const region = findRegion(state, regionId);
  if (region.scopeIds.includes(scopeId)) return state;
  const problem = scopeProblem(procurement, region.packageId, scopeId);
  if (problem) fail({ scopeIds: problem });
  return putRegion(state, { ...region, scopeIds: [...region.scopeIds, scopeId], history: [...region.history, { kind: "linked", at, by, scopeId }] });
}

export function unlinkScope(state: DrawingFlipState, regionId: string, scopeId: string, by: string, at = now()): DrawingFlipState {
  needBy(by);
  const region = findRegion(state, regionId);
  if (!region.scopeIds.includes(scopeId)) return state;
  return putRegion(state, { ...region, scopeIds: region.scopeIds.filter(id => id !== scopeId), history: [...region.history, { kind: "unlinked", at, by, scopeId }] });
}

/** The contractor agrees with Structor's trade call. */
export function approveRegion(state: DrawingFlipState, regionId: string, by: string, at = now()): DrawingFlipState {
  needBy(by);
  const region = findRegion(state, regionId);
  if (region.status !== "pending-review") fail({ region: `${region.number} is already approved.` });
  return putRegion(state, { ...region, status: "approved", reviewedBy: by.trim(), reviewedAt: at, history: [...region.history, { kind: "approved", at, by }] });
}

/**
 * Corrects the trade. The region counts as reviewed by `by`; scope items of the old trade are
 * unlinked (all-trades items stay), and the correction is kept in its history.
 */
export function reassignRegion(state: DrawingFlipState, procurement: Procurement, regionId: string, packageId: string, by: string, reason = "", at = now()): DrawingFlipState {
  needBy(by);
  const region = findRegion(state, regionId);
  const target = packageOf(procurement, packageId);
  if (!target) fail({ packageId: "Choose the responsible trade." });
  if (packageId === region.packageId) fail({ packageId: `${region.number} is already ${target!.name}.` });
  const unlinked = region.scopeIds.filter(id => scopeProblem(procurement, packageId, id) !== null);
  return putRegion(state, {
    ...region, packageId, scopeIds: region.scopeIds.filter(id => !unlinked.includes(id)),
    status: "approved", reviewedBy: by.trim(), reviewedAt: at,
    history: [...region.history, { kind: "reassigned", at, by, from: region.packageId, to: packageId, reason: reason.trim(), unlinked }],
  });
}

/** Replaces the region's notes; each change is kept in its history. */
export function editRegionNotes(state: DrawingFlipState, regionId: string, notes: string, by: string, at = now()): DrawingFlipState {
  needBy(by);
  const region = findRegion(state, regionId);
  const text = notes?.trim() ?? "";
  if (text === region.notes) return state;
  return putRegion(state, { ...region, notes: text, history: [...region.history, { kind: "notes", at, by, text }] });
}
