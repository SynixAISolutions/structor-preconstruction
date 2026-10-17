// Project setup for ONE project (18 Oct, Danial; shaped with the UI dev's review): a step-by-step
// guide from an empty project to AI-written scopes, then the documents a project usually needs.
//
// The opening route is Documents → Project details → Trades → Scopes; nothing else blocks reading
// drawings or drafting scopes. Every status is WORKED OUT from the project's real state (stored
// files, project record, trades, scope items), never ticked by hand. Only two things are decisions
// a person saves: "not applicable" (with a reason; reconsidered when the work type or estimate stage
// changes) and "waiting" (on whom, optionally until when; still outstanding). A reviewed RFP is
// recorded per document version, so a new revision needs reviewing again.
//
// Warnings stay honest: a recommended item says why it is suggested, and nothing is called missing
// that the rules can't confirm. Pure functions; rule violations throw SetupRuleError.

import { drawingRegister, latestDocuments, type StoredDocument } from "./project-files";
import type { Procurement } from "./procurement";
import { suggestTrades } from "./project-scopes";
import type { EstimateStage, Project, WorkType } from "./projects";
import type { Screen } from "./screens";
import { missingProjectFacts } from "./todo";

export type SetupStepId = "documents" | "details" | "trades" | "scopes" | "contracts" | "reports" | "budget" | "schedule" | "team";
export type SetupLevel = "required" | "recommended";
export type SetupStatus = "missing" | "needs-review" | "in-progress" | "ready" | "failed" | "waiting" | "not-applicable";

export type SetupDecision = {
  /** "reports" for a step, "reports:geotech" for one item of it. */
  target: string;
  kind: "not-applicable" | "waiting";
  reason: string;
  by: string;
  at: string;
  /** Waiting: who has to provide it, and an optional follow-up date. */
  responsible: string;
  followUp: string;
  /** The project's work type and estimate stage when it was decided; a change asks to reconsider "not applicable". */
  workType: WorkType | null;
  estimateStage: EstimateStage | null;
};
export type SetupState = { decisions: SetupDecision[]; reviews: { docId: string; by: string; at: string }[] };
export const EMPTY_SETUP: SetupState = { decisions: [], reviews: [] };

export type SetupItem = {
  id: string; label: string; level: SetupLevel; status: SetupStatus; note: string;
  /** Why a recommended item is suggested for this project. */
  why: string;
  /** Upload category in Project files, when the item is a document. */
  category: string;
  decision: SetupDecision | null;
  /** A "not applicable" decision made under another work type or estimate stage. */
  reconsider: boolean;
};
export type SetupStep = {
  id: SetupStepId; title: string; detail: string; level: SetupLevel;
  /** Part of the opening route to AI-written scopes. */
  route: boolean;
  status: SetupStatus; screen: Screen; items: SetupItem[]; decision: SetupDecision | null; reconsider: boolean;
};
export type SetupSummary = { steps: SetupStep[]; progress: { done: number; total: number; percent: number }; next: SetupStep | null };

export type SetupInput = {
  project: Project;
  documents: StoredDocument[];
  procurement: Procurement;
  /** AI scope proposals waiting for review (extraction drafts pending-review). */
  pendingProposals: number;
  budgetLines: number;
  scheduleActivities: number;
  state: SetupState;
};

export class SetupRuleError extends Error {
  constructor(message: string) { super(message); this.name = "SetupRuleError"; }
}
const fail = (message: string): never => { throw new SetupRuleError(message); };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DONE = new Set<SetupStatus>(["ready", "not-applicable"]);
const ROUTE: SetupStepId[] = ["documents", "details", "trades", "scopes"];

/** Whether a stored file can be used: its pages were read, and (for drawings and manuals) its sheets or sections were found. */
export function documentReadiness(doc: StoredDocument): { status: "ready" | "needs-review" | "failed"; note: string } {
  if (!doc.pageCount || !doc.textChunks) return { status: "failed", note: `No pages of ${doc.name} could be read. Upload it again or check the PDF.` };
  if (doc.kind === "drawings") {
    const named = doc.sheets.filter(s => s.sheet).length;
    return named >= doc.pageCount / 2 ? { status: "ready", note: `${plural(named, "sheet")} read from the title blocks.` } : { status: "needs-review", note: `Sheet numbers were read on ${named} of ${doc.pageCount} pages; check the title blocks.` };
  }
  if (doc.kind === "manual") return doc.sections.length ? { status: "ready", note: `${plural(doc.sections.length, "specification section")} found.` } : { status: "needs-review", note: "No specification sections were found; check that this is the project manual." };
  return { status: "ready", note: `${plural(doc.pageCount, "page")} read.` };
}

const worst = (statuses: SetupStatus[]): SetupStatus =>
  (["failed", "needs-review", "missing", "in-progress", "waiting"] as SetupStatus[]).find(s => statuses.includes(s)) ?? "ready";
const docsMatching = (docs: StoredDocument[], re: RegExp) => docs.filter(d => re.test(d.name) || re.test(d.category));

/** The guide for this project: every step and item with its status, progress, and the next thing to do. */
export function projectSetup(input: SetupInput): SetupSummary {
  const { project, procurement, state } = input;
  const docs = latestDocuments(input.documents);
  const decisionFor = (target: string) => state.decisions.find(d => d.target === target) ?? null;
  const item = (step: string, id: string, label: string, level: SetupLevel, status: SetupStatus, note: string, extra: Partial<Pick<SetupItem, "why" | "category">> = {}): SetupItem => {
    const decision = decisionFor(`${step}:${id}`);
    return withDecision({ id, label, level, status, note, why: extra.why ?? "", category: extra.category ?? "", decision, reconsider: false }, decision, project);
  };
  const fromDocs = (list: StoredDocument[]) => list.length ? worst(list.map(d => documentReadiness(d).status)) : "missing";

  // ── Documents ──
  const drawings = docs.filter(d => d.kind === "drawings"), manuals = docs.filter(d => d.kind === "manual");
  const docItems = [
    item("documents", "drawings", "Drawing set", "required", fromDocs(drawings), drawings.map(d => documentReadiness(d).note).join(" ") || "Upload the drawings; sheet numbers and titles are read from the title blocks.", { category: "Drawings" }),
    item("documents", "manual", "Project manual (specifications)", "recommended", fromDocs(manuals), manuals.map(d => documentReadiness(d).note).join(" ") || "Scopes from drawings alone can miss specification requirements.", { category: "Specifications", why: "Specification sections carry products, submittals and requirements the drawings don't show." }),
  ];
  const docsStatus: SetupStatus = !drawings.length && !manuals.length ? "missing" : worst(docItems.filter(i => i.status !== "missing").map(i => i.status));

  // ── Project details ──
  const missing = missingProjectFacts(project);
  const rfps = docs.filter(d => d.category === "RFP");
  const unreviewed = rfps.filter(d => !state.reviews.some(r => r.docId === d.id));
  const detailItems = [
    item("details", "facts", "Project information", "required", missing.length ? "missing" : "ready", missing.length ? `Missing: ${missing.join(", ")}.` : "Complete."),
    item("details", "rfp", "RFP / invitation to bid", "recommended", !rfps.length ? "missing" : unreviewed.length ? "needs-review" : fromDocs(rfps),
      !rfps.length ? "Upload the RFP and its details are read for you to review." : unreviewed.length ? `Review the details read from ${unreviewed.map(d => d.name).join(", ")}.` : "Reviewed.", { category: "RFP", why: "Due dates, areas, tax status and participation programs come from it." }),
  ];
  const detailsStatus: SetupStatus = detailItems[1].status === "needs-review" ? "needs-review" : detailItems[0].status;

  // ── Trades ──
  const suggestions = suggestTrades(procurement.packages, { sections: manuals.flatMap(d => d.sections), sheets: drawingRegister(docs) });
  const tradesStatus: SetupStatus = procurement.packages.length ? "ready" : suggestions.length ? "needs-review" : "missing";
  const tradesNote = procurement.packages.length ? `${plural(procurement.packages.length, "trade")}${suggestions.length ? `; ${suggestions.length} more suggested by the files` : ""}.` : suggestions.length ? `Confirm the ${plural(suggestions.length, "suggested trade")} from the drawings and manual.` : "Upload drawings or the project manual, or add trades by hand.";

  // ── Scopes ──
  const withScope = procurement.packages.filter(p => procurement.scopes.some(s => s.packageId === p.id)).length;
  const scopesStatus: SetupStatus = !procurement.packages.length ? "missing" : input.pendingProposals ? "needs-review" : withScope === procurement.packages.length ? "ready" : withScope ? "in-progress" : "missing";
  const scopesNote = input.pendingProposals ? `${plural(input.pendingProposals, "AI proposal")} to review.` : procurement.packages.length ? `${withScope} of ${plural(procurement.packages.length, "trade")} have scope items.` : "Add trades first.";

  // ── Contracts ── (filenames; the contracts department's exhibits live on the Contracts screen)
  const contractItems = [
    item("contracts", "prime", "Owner contract / GMP agreement", "recommended", docsMatching(docs, /agreement|prime contract|\bGMP\b|owner contract/i).length ? "ready" : "missing", "", { category: "Contracts", why: "Sets the terms every subcontract has to flow down." }),
    item("contracts", "conditions", "General and supplementary conditions", "recommended", docsMatching(docs, /general conditions|supplementary conditions|\bA201\b/i).length ? "ready" : "missing", "", { category: "Contracts", why: "Insurance, bonds, retainage and change-order rules." }),
    item("contracts", "subcontract", "Your subcontract form", "recommended", docsMatching(docs, /subcontract/i).length ? "ready" : "missing", "", { category: "Contracts", why: "Exhibit A and the subcontract are generated in your company's form." }),
  ];

  // ── Site and reports ── (suggested by work type, each with why)
  const w = project.workType, newWork = !w || w === "new" || w === "addition" || w === "both", oldWork = !w || w === "renovation" || w === "both";
  const reportItems = [
    newWork && item("reports", "geotech", "Geotechnical report", "recommended", docsMatching(docs, /geotech|soils?\b|boring|subsurface/i).length ? "ready" : "missing", "", { category: "Reports", why: "Foundations, earthwork and dewatering are priced from it." }),
    newWork && item("reports", "survey", "Site survey", "recommended", docsMatching(docs, /survey|topograph|\bALTA\b/i).length ? "ready" : "missing", "", { category: "Reports", why: "Existing grades, utilities and boundaries for sitework." }),
    oldWork && item("reports", "hazmat", "Hazardous materials survey", "recommended", docsMatching(docs, /hazard|asbestos|lead[- ]based|abatement|environmental/i).length ? "ready" : "missing", "", { category: "Reports", why: "Renovation can disturb asbestos, lead or other regulated materials." }),
    oldWork && item("reports", "existing", "Existing-conditions drawings", "recommended", docsMatching(docs, /existing|as-?built|record drawing/i).length ? "ready" : "missing", "", { category: "Drawings", why: "Shows what is being demolished or tied into." }),
  ].filter((i): i is SetupItem => !!i);

  // ── Team ──
  const teamItems = [
    item("team", "architect", "Architect", "recommended", project.architect.trim() ? "ready" : "missing", project.architect.trim() || "Needed to send submittals for review."),
    item("team", "members", "Project team", "recommended", project.team.length ? "ready" : "missing", project.team.length ? plural(project.team.length, "member") : "Add the estimators and project managers."),
  ];

  const step = (id: SetupStepId, title: string, detail: string, level: SetupLevel, status: SetupStatus, screen: Screen, items: SetupItem[] = []): SetupStep => {
    const decision = decisionFor(id);
    // A recommended step is as done as its items, once every item is ready or decided.
    const fromItems = items.length && level === "recommended" ? worst(items.map(i => DONE.has(i.status) ? "ready" : i.status === "waiting" ? "waiting" : "missing")) : status;
    const s = withDecision({ status: fromItems, decision, reconsider: false }, decision, project);
    return { id, title, detail, level, route: ROUTE.includes(id), status: s.status, screen, items, decision, reconsider: s.reconsider };
  };
  const steps: SetupStep[] = [
    step("documents", "Upload drawings and specifications", "Drawings alone are enough to start; the project manual adds specification requirements.", "required", docsStatus, "documents", docItems),
    step("details", "Review project details", "Fill in the project information, or upload the RFP and review what it says.", "required", detailsStatus, "information", detailItems),
    step("trades", "Confirm trades", tradesNote, "required", tradesStatus, "scopes"),
    step("scopes", "Write scopes", scopesNote, "required", scopesStatus, "scopes"),
    step("contracts", "Contract documents", "The owner contract, its conditions and your subcontract form.", "recommended", "missing", "documents", contractItems),
    step("reports", "Site and reports", w ? "Suggested for this project's work type." : "Set the work type to narrow these down.", "recommended", "missing", "documents", reportItems),
    step("budget", "Budget", input.budgetLines ? `${plural(input.budgetLines, "budget line")}.` : "Enter the owner's budget, or build a concept budget from past projects.", "recommended", input.budgetLines ? "ready" : "missing", "budget"),
    step("schedule", "Schedule", input.scheduleActivities ? `${plural(input.scheduleActivities, "activity", "activities")}.` : "Import the owner's schedule, or Suggest schedule with AI.", "recommended", input.scheduleActivities ? "ready" : "missing", "schedule"),
    step("team", "Team", "The architect and your project team.", "recommended", "missing", "information", teamItems),
  ];
  const done = steps.filter(s => DONE.has(s.status)).length;
  const open = (s: SetupStep) => !DONE.has(s.status) && s.status !== "waiting";
  return { steps, progress: { done, total: steps.length, percent: Math.round((done / steps.length) * 100) }, next: steps.find(s => s.route && open(s)) ?? steps.find(open) ?? null };
}

/** A saved decision applies unless the work is actually ready; "not applicable" made under another work type or stage asks to reconsider. */
function withDecision<T extends { status: SetupStatus; reconsider: boolean }>(x: T, decision: SetupDecision | null, project: Project): T {
  if (!decision || x.status === "ready") return x;
  if (decision.kind === "waiting") return { ...x, status: "waiting" };
  const same = decision.workType === project.workType && decision.estimateStage === project.estimateStage;
  return same ? { ...x, status: "not-applicable" } : { ...x, reconsider: true };
}

// ── Actions ─────────────────────────────────────────────────────────────────

const TARGET = /^(documents|details|trades|scopes|contracts|reports|budget|schedule|team)(?::[a-z-]+)?$/;

/** Saves "not applicable" or "waiting" for a step or item. The route to scopes can't be not applicable, and the drawings never are. */
export function decide(state: SetupState, input: { target: string; kind: SetupDecision["kind"]; reason: string; responsible?: string; followUp?: string }, project: Project, by: string, at = new Date().toISOString()): SetupState {
  if (!TARGET.test(input.target)) fail("Choose a setup step.");
  const reason = input.reason.trim() || fail(input.kind === "waiting" ? "Say what you're waiting for." : "Say why it doesn't apply.");
  const step = input.target.split(":")[0] as SetupStepId;
  if (input.kind === "not-applicable" && (ROUTE.includes(step) && !input.target.includes(":") || input.target === "documents:drawings")) fail("This step is needed before scopes can be written.");
  const responsible = input.responsible?.trim() ?? "", followUp = input.followUp?.trim() ?? "";
  if (input.kind === "waiting" && !responsible) fail("Name who has to provide it.");
  if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) fail("Use a date for the follow-up.");
  if (!by.trim()) fail("Sign in to record a decision.");
  const decision: SetupDecision = { target: input.target, kind: input.kind, reason, by: by.trim(), at, responsible: input.kind === "waiting" ? responsible : "", followUp: input.kind === "waiting" ? followUp : "", workType: project.workType, estimateStage: project.estimateStage };
  return { ...state, decisions: [...state.decisions.filter(d => d.target !== input.target), decision] };
}

export const clearDecision = (state: SetupState, target: string): SetupState => ({ ...state, decisions: state.decisions.filter(d => d.target !== target) });

/** Records that a stored RFP (this exact version) has been reviewed, whether or not any detail was taken from it. */
export function markReviewed(state: SetupState, docId: string, by: string, at = new Date().toISOString()): SetupState {
  if (!docId.trim()) fail("Choose the document.");
  if (!by.trim()) fail("Sign in to record the review.");
  return { ...state, reviews: [...state.reviews.filter(r => r.docId !== docId), { docId, by: by.trim(), at }] };
}
