// A subcontractor's emailed proposal, read by Structor's AI into a bid for the estimator to check.
//
// Most proposals arrive as a PDF by email, not through the portal. A reading maps the proposal onto
// the trade's published bid form: the base bid, an answer per scope item (Y / N / P / N/A), and the
// exclusions, clarifications and alternates it states — each with the page and words it was read
// from. The estimator corrects whatever was misread, then applies it: that opens the company's
// submission, fills the draft and submits it as a revision, exactly as if the company had used the
// portal, so it reaches Bid leveling with its exceptions open. Nothing is applied without review;
// the AI's first reading is kept beside the estimator's corrections, so its accuracy can be measured.
//
// The reading itself (offline or live — undecided) only has to produce `ReadingInput`.

import { AI_ACTOR, cleanCitations, ExtractionRuleError, type Citation, type RunEngine } from "./extraction";
import { markInvitationSubmitted, ProcurementRuleError, type Procurement } from "./procurement";
import {
  ANSWERS, addAttachment, MAX_ATTACHMENT_BYTES, openSubmission, submissionFor, submitBid, SubmissionRuleError, updateDraft,
  type ScopeAnswer, type Submission, type SubmissionIssue, type Submitter,
} from "./submissions";

export type ReadResponse = { scopeItemId: string; answer: ScopeAnswer | null; note: string; citations: Citation[] };
export type ReadLine = { text: string; citations: Citation[] };
export type ReadAlternate = { kind: "add" | "deduct"; description: string; amount: number; citations: Citation[] };

/** What the proposal says, mapped onto the bid form. A citation list is empty only where the estimator added or changed the value. */
export type ReadingContent = {
  baseBid: number | null; baseBidCitations: Citation[];
  /** One per item of the published form, in form order; null where the proposal doesn't say. */
  responses: ReadResponse[];
  exclusions: ReadLine[]; clarifications: ReadLine[]; alternates: ReadAlternate[];
  /** The proposal's contact, who becomes the revision's submitter. */
  submitter: Submitter | null;
};

export type ReadingStatus = "pending-review" | "applied" | "discarded";
export type ReadingEvent =
  | { kind: "read" | "applied"; at: string; by: string }
  | { kind: "edited"; at: string; by: string; fields: string[] }
  | { kind: "discarded"; at: string; by: string; reason: string };

export type ProposalReading = {
  id: string;
  invitationId: string; packageId: string; bidderId: string;
  /** The published bid-form version the proposal was mapped onto. */
  formVersion: number;
  /** The proposal file. */
  document: { name: string; pages: number; size: number };
  engine: RunEngine;
  readAt: string;
  content: ReadingContent;
  /** The AI's reading before the estimator's first correction; null while uncorrected. */
  original: ReadingContent | null;
  status: ReadingStatus;
  reviewedBy: string | null; reviewedAt: string | null;
  discardReason: string | null;
  /** The submission revision it became. */
  applied: { submissionId: string; revisionNumber: number } | null;
  history: ReadingEvent[];
};

export type ProposalState = { readings: ProposalReading[] };
export const EMPTY_PROPOSALS: ProposalState = { readings: [] };

/** The records applying a reading touches. */
export type ProposalRecords = { proposals: ProposalState; submissions: Submission[]; procurement: Procurement };

export type ReadingInput = {
  invitationId: string;
  formVersion: number;
  document: { name: string; pages: number; size: number };
  engine: RunEngine;
  readAt: string;
  baseBid: number | null; baseBidCitations?: Citation[];
  responses: { scopeItemId: string; answer: ScopeAnswer | null; note?: string; citations?: Citation[] }[];
  exclusions?: { text: string; citations: Citation[] }[];
  clarifications?: { text: string; citations: Citation[] }[];
  alternates?: { kind: "add" | "deduct"; description: string; amount: number; citations: Citation[] }[];
  submitter?: Submitter | null;
};

export class ProposalRuleError extends Error {
  readonly issues: SubmissionIssue[];
  constructor(message: string, issues: SubmissionIssue[] = []) {
    super(message);
    this.name = "ProposalRuleError";
    this.issues = issues;
  }
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (message: string): never => { throw new ProposalRuleError(message); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, what: string, max: number, optional = false): string {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t && !optional) fail(`${what} is missing.`);
  if (t.length > max) fail(`${what} is longer than ${max} characters.`);
  return t;
}
/** Citations into the proposal file itself; at least one unless `optional`. */
function cite(citations: unknown, doc: { name: string; pages: number }, what: string, optional = false): Citation[] {
  if (optional && (!Array.isArray(citations) || !citations.length)) return [];
  try { return cleanCitations(citations, [doc]); } catch (error) {
    if (error instanceof ExtractionRuleError) fail(`${what}: ${error.message}`);
    throw error;
  }
}
const amount = (value: unknown, what: string, allowNull = false): number | null => {
  if (value === null && allowNull) return null;
  return typeof value === "number" && Number.isFinite(value) && value > 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
    ? value : fail(`${what} must be an amount above 0 with at most two decimals.`);
};
const cleanSubmitter = (s: Submitter | null | undefined): Submitter | null => {
  if (!s) return null;
  const name = text(s.name, "The contact's name", 200, true), email = text(s.email, "The contact's email", 200, true);
  if (!name && !email) return null;
  if (email && !EMAIL.test(email)) fail("The contact's email isn't a valid address.");
  return { name, email };
};

function formOf(procurement: Procurement, invitationId: string) {
  const invitation = procurement.invitations.find(i => i.id === invitationId) ?? fail("That invitation no longer exists.");
  if (invitation.status === "declined") fail("This company declined the invitation.");
  const pkg = procurement.packages.find(p => p.id === invitation.packageId) ?? fail("The invitation's trade package no longer exists.");
  if (!pkg.published) fail(`The ${pkg.name} bid form isn't published, so there is nothing to map the proposal onto.`);
  return { invitation, pkg, form: pkg.published! };
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** The invitation's latest reading — the one waiting for review, if any: a new reading can't start while one waits. */
export const readingFor = (state: ProposalState, invitationId: string): ProposalReading | undefined =>
  state.readings.filter(r => r.invitationId === invitationId).at(-1);

export type ReadingCorrections = { baseBid: boolean; answers: string[]; exclusions: boolean; clarifications: boolean; alternates: boolean; submitter: boolean };

/** What the estimator changed from the AI's reading (the reading's accuracy); all false/empty when uncorrected. */
export function readingCorrections(reading: ProposalReading): ReadingCorrections {
  const o = reading.original, c = reading.content;
  const lines = (a: { text?: string; description?: string; amount?: number; kind?: string }[], b: typeof a) => JSON.stringify(a.map(({ text, description, amount, kind }) => [text, description, amount, kind])) !== JSON.stringify(b.map(({ text, description, amount, kind }) => [text, description, amount, kind]));
  if (!o) return { baseBid: false, answers: [], exclusions: false, clarifications: false, alternates: false, submitter: false };
  return {
    baseBid: o.baseBid !== c.baseBid,
    answers: c.responses.filter(r => { const was = o.responses.find(x => x.scopeItemId === r.scopeItemId); return was?.answer !== r.answer || was?.note !== r.note; }).map(r => r.scopeItemId),
    exclusions: lines(o.exclusions, c.exclusions), clarifications: lines(o.clarifications, c.clarifications), alternates: lines(o.alternates, c.alternates),
    submitter: JSON.stringify(o.submitter) !== JSON.stringify(c.submitter),
  };
}

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Records the AI's reading of one proposal, waiting for review. Refused while another reading of
 * the same invitation waits. Form items the proposal doesn't address are kept with no answer; a
 * stated answer, price or line must cite the proposal.
 */
export function recordReading(state: ProposalState, procurement: Procurement, input: ReadingInput): ProposalState {
  const { invitation, pkg, form } = formOf(procurement, input.invitationId);
  if (input.formVersion !== form.version) fail(`The ${pkg.name} bid form is at version ${form.version}; the proposal was mapped onto version ${input.formVersion}.`);
  if (state.readings.some(r => r.invitationId === invitation.id && r.status === "pending-review")) fail("This company already has a reading waiting for review. Apply or discard it first.");
  const name = text(input.document?.name, "The proposal file name", 255);
  const doc = { name, pages: input.document?.pages, size: input.document?.size };
  if (!Number.isInteger(doc.pages) || doc.pages < 1) fail("The proposal's page count must be a whole number from 1.");
  if (!(typeof doc.size === "number" && doc.size > 0 && doc.size <= MAX_ATTACHMENT_BYTES)) fail("The proposal file must be larger than 0 and at most 50 MB.");
  if (!input.engine?.model?.trim() || !["sample", "offline", "live"].includes(input.engine.mode)) fail("Say how the proposal was read: sample, offline or live, and the model.");
  if (!input.readAt) fail("Say when the proposal was read.");

  const formIds = form.items.map(i => i.id);
  const given = new Map<string, ReadingInput["responses"][number]>();
  for (const r of input.responses ?? []) {
    if (!formIds.includes(r?.scopeItemId)) fail(`${r?.scopeItemId ?? "An answer"} isn't an item of the published bid form.`);
    if (given.has(r.scopeItemId)) fail(`${r.scopeItemId} is answered twice.`);
    if (r.answer !== null && !ANSWERS.includes(r.answer)) fail(`${r.scopeItemId}: answer with Y, N, P or N/A.`);
    given.set(r.scopeItemId, r);
  }
  const responses: ReadResponse[] = formIds.map(id => {
    const r = given.get(id);
    if (!r || r.answer === null) return { scopeItemId: id, answer: null, note: text(r?.note ?? "", `${id}: the note`, 4000, true), citations: [] };
    return { scopeItemId: id, answer: r.answer, note: text(r.note ?? "", `${id}: the note`, 4000, true), citations: cite(r.citations, doc, `${id}`) };
  });
  const baseBid = amount(input.baseBid, "The base bid", true);
  const line = (l: { text: string; citations: Citation[] }, what: string): ReadLine => ({ text: text(l?.text, what, 1000), citations: cite(l?.citations, doc, what) });
  const content: ReadingContent = {
    baseBid, baseBidCitations: baseBid === null ? [] : cite(input.baseBidCitations, doc, "The base bid"),
    responses,
    exclusions: (input.exclusions ?? []).map((l, i) => line(l, `Exclusion ${i + 1}`)),
    clarifications: (input.clarifications ?? []).map((l, i) => line(l, `Clarification ${i + 1}`)),
    alternates: (input.alternates ?? []).map((a, i) => ({
      kind: a?.kind === "deduct" ? "deduct" : a?.kind === "add" ? "add" : fail(`Alternate ${i + 1}: add or deduct?`),
      description: text(a?.description, `Alternate ${i + 1}: the description`, 1000), amount: amount(a?.amount, `Alternate ${i + 1}: the amount`)!,
      citations: cite(a?.citations, doc, `Alternate ${i + 1}`),
    })),
    submitter: cleanSubmitter(input.submitter),
  };
  const reading: ProposalReading = {
    id: newId(), invitationId: invitation.id, packageId: pkg.id, bidderId: invitation.bidderId, formVersion: form.version,
    document: { name, pages: doc.pages, size: doc.size }, engine: { mode: input.engine.mode, model: input.engine.model.trim() }, readAt: input.readAt,
    content, original: null, status: "pending-review", reviewedBy: null, reviewedAt: null, discardReason: null, applied: null,
    history: [{ kind: "read", at: input.readAt, by: AI_ACTOR }],
  };
  return { readings: [...state.readings, reading] };
}

// ── Review ──────────────────────────────────────────────────────────────────

const needBy = (by: string) => by?.trim() || fail("Say who reviewed it.");
function findReading(state: ProposalState, id: string): ProposalReading {
  return state.readings.find(r => r.id === id) ?? fail("That proposal reading no longer exists.");
}
const pending = (r: ProposalReading) => r.status === "pending-review" || fail(r.status === "applied" ? "This reading is already applied; correct the bid in the company's submission." : "This reading was discarded.");
const put = (state: ProposalState, r: ProposalReading): ProposalState => ({ readings: state.readings.map(x => x.id === r.id ? r : x) });

export type ReadingPatch = Partial<{
  baseBid: number | null;
  exclusions: string[]; clarifications: string[];
  alternates: { kind: "add" | "deduct"; description: string; amount: number }[];
  submitter: Submitter | null;
}>;

/**
 * Corrects the reading. A line kept word for word keeps its citations; a new or reworded line has
 * none (the estimator wrote it). A corrected base bid drops its citations. The AI's version is kept.
 */
export function editReading(state: ProposalState, id: string, patch: ReadingPatch, by: string, at = now()): ProposalState {
  needBy(by);
  const reading = findReading(state, id);
  pending(reading);
  const c = reading.content;
  const lines = (next: string[] | undefined, old: ReadLine[], what: string): ReadLine[] => next === undefined ? old
    : next.map((t, i) => { const clean = text(t, `${what} ${i + 1}`, 1000); return { text: clean, citations: old.find(l => l.text === clean)?.citations ?? [] }; });
  const baseBid = patch.baseBid === undefined ? c.baseBid : amount(patch.baseBid, "The base bid", true);
  const next: ReadingContent = {
    ...c,
    baseBid, baseBidCitations: baseBid === c.baseBid ? c.baseBidCitations : [],
    exclusions: lines(patch.exclusions, c.exclusions, "Exclusion"),
    clarifications: lines(patch.clarifications, c.clarifications, "Clarification"),
    alternates: patch.alternates === undefined ? c.alternates : patch.alternates.map((a, i) => {
      const kind = a?.kind === "deduct" ? "deduct" as const : a?.kind === "add" ? "add" as const : fail(`Alternate ${i + 1}: add or deduct?`);
      const description = text(a?.description, `Alternate ${i + 1}: the description`, 1000), value = amount(a?.amount, `Alternate ${i + 1}: the amount`)!;
      return { kind, description, amount: value, citations: c.alternates.find(o => o.kind === kind && o.description === description && o.amount === value)?.citations ?? [] };
    }),
    submitter: patch.submitter === undefined ? c.submitter : cleanSubmitter(patch.submitter),
  };
  return withEdit(state, reading, next, by, at);
}

/** Corrects one answer. P and N/A need their note before the reading can be applied. */
export function setReadAnswer(state: ProposalState, id: string, scopeItemId: string, answer: ScopeAnswer | null, note: string, by: string, at = now()): ProposalState {
  needBy(by);
  const reading = findReading(state, id);
  pending(reading);
  if (answer !== null && !ANSWERS.includes(answer)) fail("Answer with Y, N, P or N/A.");
  const old = reading.content.responses.find(r => r.scopeItemId === scopeItemId) ?? fail("That item isn't on the bid form this proposal was read against.");
  const cleanNote = text(note ?? "", "The note", 4000, true);
  const responses = reading.content.responses.map(r => r.scopeItemId === scopeItemId
    ? { scopeItemId, answer, note: cleanNote, citations: answer === old.answer ? old.citations : [] } : r);
  return withEdit(state, reading, { ...reading.content, responses }, by, at);
}

function withEdit(state: ProposalState, reading: ProposalReading, next: ReadingContent, by: string, at: string): ProposalState {
  const fields = (Object.keys(next) as (keyof ReadingContent)[]).filter(k => k !== "baseBidCitations" && JSON.stringify(next[k]) !== JSON.stringify(reading.content[k]));
  if (!fields.length) return state;
  return put(state, { ...reading, content: next, original: reading.original ?? reading.content, history: [...reading.history, { kind: "edited", at, by: by.trim(), fields }] });
}

export function discardReading(state: ProposalState, id: string, reason: string, by: string, at = now()): ProposalState {
  needBy(by);
  const reading = findReading(state, id);
  pending(reading);
  const r = text(reason, "Why it is discarded", 600);
  return put(state, { ...reading, status: "discarded", discardReason: r, reviewedBy: by.trim(), reviewedAt: at, history: [...reading.history, { kind: "discarded", at, by: by.trim(), reason: r }] });
}

/**
 * Turns the checked reading into the company's next bid revision: opens its submission, fills the
 * draft, attaches the proposal file, submits it with the proposal's contact as submitter, and marks
 * the invitation submitted. Refused, with the submission's own issues, while anything is missing
 * (an unanswered item, a P or N/A without a note, no base bid, no contact), and refused when the
 * bid form was revised after the reading — the proposal priced the older form.
 */
export function applyReading(records: ProposalRecords, id: string, projectId: string, by: string, at = now()): ProposalRecords {
  needBy(by);
  const reading = findReading(records.proposals, id);
  pending(reading);
  const { form, pkg } = formOf(records.procurement, reading.invitationId);
  if (form.version !== reading.formVersion) fail(`The ${pkg.name} bid form was revised (version ${reading.formVersion} → ${form.version}) after this proposal was read. Ask for a proposal against the current form, or discard this reading.`);
  const c = reading.content;
  if (!c.submitter?.name || !c.submitter.email) fail("Enter the proposal's contact name and email; they become the revision's submitter.");
  let submissions = records.submissions, procurement = records.procurement;
  try {
    submissions = openSubmission(submissions, procurement, { projectId, invitationId: reading.invitationId }, at);
    const submission = submissionFor(submissions, reading.invitationId)!;
    submissions = updateDraft(submissions, submission.id, {
      baseBid: c.baseBid,
      responses: c.responses.map(({ scopeItemId, answer, note }) => ({ scopeItemId, answer, note })),
      exclusions: c.exclusions.map(l => l.text), clarifications: c.clarifications.map(l => l.text),
      alternates: c.alternates.map(a => ({ id: newId(), kind: a.kind, description: a.description, amount: a.amount })),
    }, at);
    if (!submissionFor(submissions, reading.invitationId)!.draft.attachments.some(a => a.name === reading.document.name)) {
      submissions = addAttachment(submissions, submission.id, { name: reading.document.name, size: reading.document.size, type: "application/pdf" }, at);
    }
    submissions = submitBid(submissions, procurement, submission.id, c.submitter!, at);
    procurement = markInvitationSubmitted(procurement, reading.invitationId);
  } catch (error) {
    if (error instanceof SubmissionRuleError) throw new ProposalRuleError(error.issues.map(i => i.message).join(" "), error.issues);
    if (error instanceof ProcurementRuleError) fail(error.message);
    throw error;
  }
  const submission = submissionFor(submissions, reading.invitationId)!;
  const applied: ProposalReading = {
    ...reading, status: "applied", reviewedBy: by.trim(), reviewedAt: at,
    applied: { submissionId: submission.id, revisionNumber: submission.revisions.at(-1)!.number },
    history: [...reading.history, { kind: "applied", at, by: by.trim() }],
  };
  return { proposals: put(records.proposals, applied), submissions, procurement };
}

/** Why the reading can't be applied yet; empty when it can. The same checks as applying, nothing saved. */
export function applyBlockers(records: ProposalRecords, id: string, projectId: string): string[] {
  try { applyReading(records, id, projectId, "check"); return []; } catch (error) {
    if (error instanceof ProposalRuleError) return error.issues.length ? error.issues.map(i => i.message) : [error.message];
    throw error;
  }
}
