// What Structor's AI proposes for a trade, and the contractor's review of it, for ONE project.
//
// Marcel (7 Oct): "run one division and have the AI workflow start working so it can start
// properly reading" — drywall first, from A to Z. An extraction run reads the project's drawings
// and project manual and proposes three kinds of finding for a trade package:
//
//   scope     a bid-form item          → on accept: a Scopes & bid forms item (origin "ai"), approved
//   region    where it is on a sheet   → on accept: a Drawing Flip region (origin "ai"), approved
//   quantity  how much of it           → on accept: kept here until per-trade estimates exist (Wave 3)
//
// Every finding must cite where it was read (document, page, the words relied on). Nothing reaches
// the bid form, the drawings or the estimate until a person accepts it; a rejection keeps its reason,
// and an edit keeps the AI's original wording, so a run's accuracy can be measured afterwards.
//
// The run itself (offline script or live server route — undecided) only has to produce `RunInput`;
// this module validates it and owns everything after. AI output is untrusted: text is trimmed,
// length-capped and rejected rather than silently cut, so a citation is never misquoted.

import { addRegion, approveRegion, linkScope, DrawingFlipRuleError, type DrawingFlipState, type Point } from "./drawing-flip";
import { addScope, approveScope, ProcurementRuleError, type Procurement } from "./procurement";
import type { QuantityUnit } from "./model";

/** Who the history names for the AI's own steps. */
export const AI_ACTOR = "Structor AI";

export type Citation = {
  /** The project file, e.g. "Project manual & specifications.pdf". */
  document: string;
  /** 1-based page of that file. */
  page: number;
  /** Drawing sheet number when the page is a sheet ("A8.1"); null for the project manual. */
  sheet: string | null;
  /** The words on the page the finding relies on, as read. */
  quote: string;
};

export type DraftKind = "scope" | "region" | "quantity";
export type DraftStatus = "pending-review" | "accepted" | "rejected";
/** Why a finding was rejected — the accuracy signal for the run. */
export type RejectReason = "not-required" | "wrong-trade" | "duplicate" | "misread-source" | "other";
export const REJECT_REASONS: Record<RejectReason, string> = {
  "not-required": "Not required by the documents",
  "wrong-trade": "Belongs to another trade",
  "duplicate": "Already covered",
  "misread-source": "Misread the drawing or specification",
  "other": "Other",
};

export type DraftEvent =
  | { kind: "proposed" | "accepted" | "reopened"; at: string; by: string }
  | { kind: "edited"; at: string; by: string; fields: string[] }
  | { kind: "rejected"; at: string; by: string; reason: RejectReason; note: string };

type DraftBase = {
  id: string;
  runId: string;
  packageId: string;
  citations: Citation[];
  status: DraftStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Set when rejected. */
  rejection: { reason: RejectReason; note: string } | null;
  history: DraftEvent[];
};
export type ScopeFields = { title: string; detail: string; source: string };
export type RegionFields = { sheet: string; label: string; polygon: Point[] };
export type QuantityFields = { item: string; quantity: number; unit: QuantityUnit; basis: string };

/** `source` reads like a Scopes reference: "09 29 00 · §3.6" or "A8.1 · Partition schedule". */
export type ScopeDraft = DraftBase & ScopeFields & { kind: "scope"; original: ScopeFields | null; acceptedId: string | null };
/** `polygon` is 0–1 from the sheet's top-left, as in Drawing Flip. `confidence` is the extractor's own 0–1 score, which Drawing Flip requires. */
export type RegionDraft = DraftBase & RegionFields & { kind: "region"; confidence: number; scopeDraftIds: string[]; original: RegionFields | null; acceptedId: string | null };
export type QuantityDraft = DraftBase & QuantityFields & { kind: "quantity"; scopeDraftId: string | null; original: QuantityFields | null };
export type Draft = ScopeDraft | RegionDraft | QuantityDraft;

/** "sample" marks the built-in illustrative run; "offline" and "live" are real reads. */
export type RunEngine = { mode: "sample" | "offline" | "live"; model: string };
export type ExtractionRun = {
  id: string;
  packageIds: string[];
  engine: RunEngine;
  documents: { name: string; pages: number }[];
  startedAt: string;
  finishedAt: string;
  by: string;
  status: "complete" | "failed";
  /** Why a failed run stopped. */
  error: string | null;
};

export type ExtractionState = { runs: ExtractionRun[]; drafts: Draft[] };
export const EMPTY_EXTRACTION: ExtractionState = { runs: [], drafts: [] };

/** The three records an accept touches. */
export type ReviewRecords = { extraction: ExtractionState; procurement: Procurement; flip: DrawingFlipState };

// ── Run input (what the extractor hands over) ────────────────────────────────

/** `key` lets findings in one run refer to each other before they have ids. */
export type DraftInput =
  | ({ kind: "scope"; key: string; packageId: string; citations: Citation[] } & ScopeFields)
  | ({ kind: "region"; key: string; packageId: string; citations: Citation[]; confidence: number; scopeKeys?: string[] } & RegionFields)
  | ({ kind: "quantity"; key: string; packageId: string; citations: Citation[]; scopeKey?: string | null } & QuantityFields);

export type RunInput = {
  packageIds: string[];
  engine: RunEngine;
  documents: { name: string; pages: number }[];
  startedAt: string;
  finishedAt: string;
  drafts: DraftInput[];
  /** A run that stopped: recorded with no findings. */
  error?: string;
};

export class ExtractionRuleError extends Error {
  constructor(message: string) { super(message); this.name = "ExtractionRuleError"; }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (message: string): never => { throw new ExtractionRuleError(message); };
const UNITS: QuantityUnit[] = ["SF", "LF", "EA", "CY"];
const LIMITS = { title: 300, detail: 2000, source: 120, quote: 600, label: 200, item: 300, basis: 600, sheet: 40, document: 200, note: 600, error: 600 };

/** Trimmed text, required unless `optional`, refused when over its limit. */
function text(value: unknown, field: keyof typeof LIMITS, what: string, optional = false): string {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t && !optional) fail(`${what} is missing.`);
  if (t.length > LIMITS[field]) fail(`${what} is longer than ${LIMITS[field]} characters.`);
  return t;
}

export function cleanCitations(citations: unknown, documents: { name: string; pages: number }[] | null): Citation[] {
  if (!Array.isArray(citations) || !citations.length) fail("Every finding needs at least one citation.");
  return (citations as Citation[]).map((c, i) => {
    const what = `Citation ${i + 1}`;
    const document = text(c?.document, "document", `${what}: the document`);
    const page = c?.page;
    if (!Number.isInteger(page) || page < 1) fail(`${what}: the page must be a whole number from 1.`);
    if (documents) {
      const doc = documents.find(d => d.name === document) ?? fail(`${what}: ${document} is not one of the run's documents.`);
      if (page > doc.pages) fail(`${what}: ${document} has ${doc.pages} pages, not ${page}.`);
    }
    const sheet = text(c?.sheet ?? "", "sheet", `${what}: the sheet`, true) || null;
    return { document, page, sheet, quote: text(c?.quote, "quote", `${what}: the quoted words`) };
  });
}

const needPackage = (procurement: Procurement, id: string) => procurement.packages.some(p => p.id === id) || fail("That trade package doesn't exist.");

function cleanScope(input: Partial<ScopeFields>): ScopeFields {
  return { title: text(input.title, "title", "The scope item"), detail: text(input.detail ?? "", "detail", "The detail", true), source: text(input.source ?? "", "source", "The source reference", true) };
}
function cleanRegion(input: Partial<RegionFields>): RegionFields {
  const polygon = input.polygon;
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(p => p && [p.x, p.y].every(v => typeof v === "number" && v >= 0 && v <= 1)))
    fail("A region needs at least three points, each 0 to 1 from the sheet's top-left.");
  return { sheet: text(input.sheet, "sheet", "The sheet"), label: text(input.label, "label", "What the region shows"), polygon: polygon!.map(({ x, y }) => ({ x, y })) };
}
function cleanQuantity(input: Partial<QuantityFields>): QuantityFields {
  const quantity = input.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) fail("The quantity must be a number above 0.");
  if (!UNITS.includes(input.unit as QuantityUnit)) fail(`The unit must be one of ${UNITS.join(", ")}.`);
  return { item: text(input.item, "item", "The quantity item"), quantity: quantity!, unit: input.unit as QuantityUnit, basis: text(input.basis, "basis", "How it was measured") };
}
const cleanConfidence = (c: unknown): number => (typeof c === "number" && c >= 0 && c <= 1 ? c : fail("A region needs the extractor's confidence from 0 to 1."));

// ── Reading ─────────────────────────────────────────────────────────────────

export type DraftFilter = { runId?: string; packageId?: string; kind?: DraftKind; status?: DraftStatus };

/** Findings matching every filter given, in the order the run proposed them. */
export const filterDrafts = (state: ExtractionState, filter: DraftFilter = {}): Draft[] =>
  state.drafts.filter(d => (!filter.runId || d.runId === filter.runId) && (!filter.packageId || d.packageId === filter.packageId)
    && (!filter.kind || d.kind === filter.kind) && (!filter.status || d.status === filter.status));

/** A finding's original AI version differs from what was accepted or is pending. */
export const isEdited = (draft: Draft): boolean => draft.original !== null;

export type RunSummary = {
  findings: number; pending: number; acceptedAsProposed: number; acceptedEdited: number; rejected: number;
  rejectedBy: Record<RejectReason, number>; byKind: Record<DraftKind, number>;
};

/** How a run's findings fared in review: the accuracy picture for that run. */
export function runSummary(state: ExtractionState, runId: string): RunSummary {
  const drafts = filterDrafts(state, { runId });
  const count = (fn: (d: Draft) => boolean) => drafts.filter(fn).length;
  const accepted = drafts.filter(d => d.status === "accepted");
  return {
    findings: drafts.length,
    pending: count(d => d.status === "pending-review"),
    acceptedAsProposed: accepted.filter(d => !isEdited(d)).length,
    acceptedEdited: accepted.filter(isEdited).length,
    rejected: count(d => d.status === "rejected"),
    rejectedBy: Object.fromEntries(Object.keys(REJECT_REASONS).map(r => [r, count(d => d.rejection?.reason === r)])) as Record<RejectReason, number>,
    byKind: { scope: count(d => d.kind === "scope"), region: count(d => d.kind === "region"), quantity: count(d => d.kind === "quantity") },
  };
}

// ── Recording a run ─────────────────────────────────────────────────────────

/**
 * Records a finished run and its findings, all pending review. All or nothing: the first problem
 * is reported with the finding's number. A run with `error` is recorded as failed, with no findings.
 */
export function recordRun(state: ExtractionState, procurement: Procurement, input: RunInput): ExtractionState {
  const documents = (input.documents ?? []).map((d, i) => {
    if (!Number.isInteger(d?.pages) || d.pages < 1) fail(`Document ${i + 1}: the page count must be a whole number from 1.`);
    return { name: text(d?.name, "document", `Document ${i + 1}: the name`), pages: d.pages };
  });
  const packageIds = [...new Set(input.packageIds ?? [])];
  if (!packageIds.length) fail("Say which trade packages the run read for.");
  packageIds.forEach(id => needPackage(procurement, id));
  if (!input.engine?.model?.trim() || !["sample", "offline", "live"].includes(input.engine.mode)) fail("Say how the run was made: sample, offline or live, and the model.");
  if (!input.startedAt || !input.finishedAt || input.finishedAt < input.startedAt) fail("The run needs a start and a finish time, finishing after it starts.");
  const run: ExtractionRun = {
    id: newId(), packageIds, engine: { mode: input.engine.mode, model: input.engine.model.trim() }, documents,
    startedAt: input.startedAt, finishedAt: input.finishedAt, by: AI_ACTOR, status: input.error ? "failed" : "complete", error: null,
  };
  if (input.error) {
    if (input.drafts?.length) fail("A failed run can't carry findings.");
    return { ...state, runs: [...state.runs, { ...run, error: text(input.error, "error", "The error") }] };
  }
  if (!documents.length) fail("Say which documents the run read.");
  if (!input.drafts?.length) fail("The run has no findings.");

  const ids = new Map<string, { id: string; kind: DraftKind; packageId: string }>();
  for (const d of input.drafts) {
    const key = typeof d?.key === "string" ? d.key.trim() : "";
    if (!key || ids.has(key)) fail("Every finding needs its own key.");
    ids.set(key, { id: newId(), kind: d.kind, packageId: d.packageId });
  }
  const scopeRef = (key: string, packageId: string) => {
    const ref = ids.get(key);
    if (!ref || ref.kind !== "scope") fail(`${key} is not a scope finding in this run.`);
    if (ref!.packageId !== packageId) fail(`${key} belongs to another trade.`);
    return ref!.id;
  };

  const drafts = input.drafts.map((d, i): Draft => {
    try {
      if (!packageIds.includes(d.packageId)) fail("Its trade isn't one the run read for.");
      const base = {
        id: ids.get(d.key.trim())!.id, runId: run.id, packageId: d.packageId, citations: cleanCitations(d.citations, documents),
        status: "pending-review" as const, reviewedBy: null, reviewedAt: null, rejection: null,
        history: [{ kind: "proposed" as const, at: input.finishedAt, by: AI_ACTOR }],
      };
      if (d.kind === "scope") return { ...base, kind: "scope", ...cleanScope(d), original: null, acceptedId: null };
      if (d.kind === "region") return {
        ...base, kind: "region", ...cleanRegion(d), confidence: cleanConfidence(d.confidence),
        scopeDraftIds: [...new Set(d.scopeKeys ?? [])].map(k => scopeRef(k, d.packageId)), original: null, acceptedId: null,
      };
      if (d.kind === "quantity") return { ...base, kind: "quantity", ...cleanQuantity(d), scopeDraftId: d.scopeKey ? scopeRef(d.scopeKey, d.packageId) : null, original: null };
      return fail("Unknown kind of finding.");
    } catch (error) {
      if (error instanceof ExtractionRuleError) fail(`Finding ${i + 1} (${d?.kind ?? "?"}): ${error.message}`);
      throw error;
    }
  });
  return { runs: [...state.runs, run], drafts: [...state.drafts, ...drafts] };
}

// ── Review ──────────────────────────────────────────────────────────────────

const needBy = (by: string) => by?.trim() || fail("Say who reviewed it.");
function findDraft(state: ExtractionState, id: string): Draft {
  return state.drafts.find(d => d.id === id) ?? fail("That finding no longer exists.");
}
const putDraft = (state: ExtractionState, draft: Draft): ExtractionState => ({ ...state, drafts: state.drafts.map(d => d.id === draft.id ? draft : d) });
const pending = (draft: Draft) => draft.status === "pending-review" || fail("Only a finding waiting for review can be changed.");

export type DraftChanges = Partial<ScopeFields & Omit<RegionFields, "polygon"> & Omit<QuantityFields, "basis"> & { packageId: string }>;

/**
 * Corrects a finding before accepting it. The AI's first version is kept in `original`. Moving a
 * finding to another trade unlinks it from findings of the old trade.
 */
export function editDraft(state: ExtractionState, procurement: Procurement, draftId: string, changes: DraftChanges, by: string, at = now()): ExtractionState {
  needBy(by);
  const draft = findDraft(state, draftId);
  pending(draft);
  const packageId = changes.packageId ?? draft.packageId;
  needPackage(procurement, packageId);
  let next: Draft;
  if (draft.kind === "scope") next = { ...draft, ...cleanScope({ title: changes.title ?? draft.title, detail: changes.detail ?? draft.detail, source: changes.source ?? draft.source }) };
  else if (draft.kind === "region") next = { ...draft, ...cleanRegion({ sheet: changes.sheet ?? draft.sheet, label: changes.label ?? draft.label, polygon: draft.polygon }) };
  else next = { ...draft, ...cleanQuantity({ item: changes.item ?? draft.item, quantity: changes.quantity ?? draft.quantity, unit: changes.unit ?? draft.unit, basis: draft.basis }) };
  next = { ...next, packageId };
  const fields = (Object.keys(changes) as (keyof DraftChanges)[]).filter(k => k in next && (next as Record<string, unknown>)[k] !== (draft as Record<string, unknown>)[k]);
  if (!fields.length) return state;
  const original = draft.original ?? pick(draft);
  let drafts = state.drafts.map(d => d.id === draft.id ? { ...next, original, history: [...draft.history, { kind: "edited" as const, at, by: by.trim(), fields }] } as Draft : d);
  if (packageId !== draft.packageId) drafts = drafts.map(d => unlinkMoved(d, draft, packageId));
  return { ...state, drafts };
}

function pick(draft: Draft): Draft["original"] {
  if (draft.kind === "scope") return { title: draft.title, detail: draft.detail, source: draft.source };
  if (draft.kind === "region") return { sheet: draft.sheet, label: draft.label, polygon: draft.polygon };
  return { item: draft.item, quantity: draft.quantity, unit: draft.unit, basis: draft.basis };
}

/** After `moved` changes trade, links between it and findings of a different trade are dropped. */
function unlinkMoved(d: Draft, moved: Draft, packageId: string): Draft {
  if (d.id === moved.id && d.kind === "region") return { ...d, scopeDraftIds: [] };
  if (d.id === moved.id && d.kind === "quantity") return { ...d, scopeDraftId: null };
  if (moved.kind !== "scope" || d.packageId === packageId) return d;
  if (d.kind === "region" && d.scopeDraftIds.includes(moved.id)) return { ...d, scopeDraftIds: d.scopeDraftIds.filter(id => id !== moved.id) };
  if (d.kind === "quantity" && d.scopeDraftId === moved.id) return { ...d, scopeDraftId: null };
  return d;
}

export function rejectDraft(state: ExtractionState, draftId: string, reason: RejectReason, note: string, by: string, at = now()): ExtractionState {
  needBy(by);
  const draft = findDraft(state, draftId);
  pending(draft);
  if (!(reason in REJECT_REASONS)) fail("Choose why it is rejected.");
  const n = text(note ?? "", "note", "The note", reason !== "other");
  return putDraft(state, { ...draft, status: "rejected", reviewedBy: by.trim(), reviewedAt: at, rejection: { reason, note: n }, history: [...draft.history, { kind: "rejected", at, by: by.trim(), reason, note: n }] });
}

/** Puts a rejected finding back in the review queue. An accepted one can't come back: change it where it now lives. */
export function reopenDraft(state: ExtractionState, draftId: string, by: string, at = now()): ExtractionState {
  needBy(by);
  const draft = findDraft(state, draftId);
  if (draft.status !== "rejected") fail(draft.status === "accepted" ? "An accepted finding is changed where it now lives, not here." : "This finding is already waiting for review.");
  return putDraft(state, { ...draft, status: "pending-review", reviewedBy: null, reviewedAt: null, rejection: null, history: [...draft.history, { kind: "reopened", at, by: by.trim() }] });
}

/**
 * Accepts a finding. A scope finding becomes an approved Scopes & bid forms item (origin "ai",
 * created by Structor AI at the run's time, approved by `by`) and is linked to any of its regions
 * already accepted. A region becomes an approved Drawing Flip region on the sheet's page, linked
 * to its accepted scope items; the sheet must already be a Drawing Flip page. A quantity is marked
 * accepted. Links only join findings of the same trade.
 */
export function acceptDraft(records: ReviewRecords, draftId: string, by: string, at = now()): ReviewRecords {
  needBy(by);
  const { extraction } = records;
  const draft = findDraft(extraction, draftId);
  pending(draft);
  const run = extraction.runs.find(r => r.id === draft.runId) ?? fail("The run that proposed this finding is missing.");
  let { procurement, flip } = records;
  let acceptedId: string | null = null;
  try {
    if (draft.kind === "scope") {
      procurement = addScope(procurement, { packageId: draft.packageId, title: draft.title, detail: draft.detail, source: draft.source, origin: "ai" }, AI_ACTOR, run.finishedAt);
      acceptedId = procurement.scopes.at(-1)!.id;
      procurement = approveScope(procurement, acceptedId, by.trim(), at);
      for (const r of extraction.drafts) {
        if (r.kind === "region" && r.acceptedId && r.packageId === draft.packageId && r.scopeDraftIds.includes(draft.id)) flip = linkScope(flip, procurement, r.acceptedId, acceptedId, by.trim(), at);
      }
    } else if (draft.kind === "region") {
      const page = flip.pages.find(p => p.sheet === draft.sheet) ?? fail(`Add sheet ${draft.sheet} to Drawing Flip before accepting this region.`);
      const scopeIds = draft.scopeDraftIds
        .map(id => extraction.drafts.find(d => d.id === id))
        .filter((d): d is ScopeDraft => d?.kind === "scope" && !!d.acceptedId && d.packageId === draft.packageId)
        .map(d => d.acceptedId!);
      const evidence = draft.citations.map(c => `${c.sheet ?? c.document} p.${c.page}: “${c.quote}”`).join(" ").slice(0, 2000);
      flip = addRegion(flip, procurement, { pageId: page!.id, label: draft.label, polygon: draft.polygon, packageId: draft.packageId, scopeIds, evidence, confidence: draft.confidence, origin: "ai" }, AI_ACTOR, run.finishedAt);
      acceptedId = flip.regions.at(-1)!.id;
      flip = approveRegion(flip, acceptedId, by.trim(), at);
    }
  } catch (error) {
    if (error instanceof ProcurementRuleError) fail(error.message);
    if (error instanceof DrawingFlipRuleError) fail(Object.values(error.errors).join(" "));
    throw error;
  }
  const accepted = { ...draft, status: "accepted", reviewedBy: by.trim(), reviewedAt: at, history: [...draft.history, { kind: "accepted", at, by: by.trim() }], ...(draft.kind === "quantity" ? {} : { acceptedId }) } as Draft;
  return { extraction: putDraft(extraction, accepted), procurement, flip };
}
