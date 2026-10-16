// Subcontractor bid submissions: what an invited company sends back for one trade package.
//
// One Submission per invitation. The bidder edits `draft`; submitting freezes a copy into
// `revisions` (never edited again), so the estimator always sees exactly what was sent and
// what changed between revisions. Answers use bid leveling's codes (Y / N / P / N/A) so a
// submission can feed leveling without translation.
//
// Pure functions only, no runtime imports: the same code validates in the browser today and
// in the server route handlers later (see submission-api.ts). Rule violations throw
// SubmissionRuleError carrying field-level issues.

import type { Invitation, Procurement, PublishedForm, TradePackage } from "./procurement";

export type ScopeAnswer = "Y" | "N" | "P" | "N/A";
export type ScopeResponse = { scopeItemId: string; answer: ScopeAnswer | null; note: string };
export type Alternate = { id: string; kind: "add" | "deduct"; description: string; amount: number };
/** File details only. `storageKey` stays null until a server file store holds the bytes. */
export type AttachmentMeta = { id: string; name: string; size: number; type: string; addedAt: string; storageKey: string | null };
export type Submitter = { name: string; email: string };

export type BidContent = {
  /** Lump sum in USD; null until entered. */
  baseBid: number | null;
  /** One per bid-form item, in form order. */
  responses: ScopeResponse[];
  exclusions: string[];
  alternates: Alternate[];
  /** Qualifications, assumptions and questions attached to the price. */
  clarifications: string[];
  attachments: AttachmentMeta[];
};

export type SubmittedRevision = BidContent & {
  number: number;
  /** The published bid-form version this price answers. */
  formVersion: number;
  submittedAt: string;
  submitter: Submitter;
};

/** draft: never submitted · submitted: one revision · revised: resubmitted at least once. */
export type SubmissionStatus = "draft" | "submitted" | "revised";

export type Submission = {
  /** Curated demonstration bid, never a real subcontractor offer. */
  illustrative?: boolean;
  id: string;
  projectId: string;
  packageId: string;
  invitationId: string;
  bidderId: string;
  status: SubmissionStatus;
  draft: BidContent;
  /** Oldest first. */
  revisions: SubmittedRevision[];
  updatedAt: string;
};

export type SubmissionField = "invitation" | "form" | "baseBid" | "responses" | "alternates" | "attachments" | "submitter" | "revision";
export type SubmissionIssue = { field: SubmissionField; message: string; scopeItemId?: string; index?: number };

export class SubmissionRuleError extends Error {
  readonly issues: SubmissionIssue[];
  constructor(issues: SubmissionIssue[]) {
    super(issues.map(issue => issue.message).join(" "));
    this.issues = issues;
    this.name = "SubmissionRuleError";
  }
}

export const ANSWERS: ScopeAnswer[] = ["Y", "N", "P", "N/A"];
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;
export const ATTACHMENT_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".csv", ".docx", ".doc", ".png", ".jpg", ".jpeg", ".zip"];

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (field: SubmissionField, message: string, extra: Partial<SubmissionIssue> = {}): never => { throw new SubmissionRuleError([{ field, message, ...extra }]); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyContent = (form: PublishedForm): BidContent => ({
  baseBid: null, responses: form.items.map(item => ({ scopeItemId: item.id, answer: null, note: "" })),
  exclusions: [], alternates: [], clarifications: [], attachments: [],
});

// ── Reading ─────────────────────────────────────────────────────────────────

export const submissionFor = (submissions: Submission[], invitationId: string) => submissions.find(s => s.invitationId === invitationId);
export const submissionsForPackage = (submissions: Submission[], packageId: string) => submissions.filter(s => s.packageId === packageId);
export const latestRevision = (submission: Submission): SubmittedRevision | undefined => submission.revisions.at(-1);

const contentOf = ({ baseBid, responses, exclusions, alternates, clarifications, attachments }: BidContent): BidContent =>
  ({ baseBid, responses, exclusions, alternates, clarifications, attachments });
const sameContent = (a: BidContent, b: BidContent) => JSON.stringify(contentOf(a)) === JSON.stringify(contentOf(b));

/** The bidder has edited since their last submission (always false before the first one). */
export const hasUnsubmittedChanges = (submission: Submission): boolean => {
  const last = latestRevision(submission);
  return !!last && !sameContent(submission.draft, last);
};

/** The latest submitted price answers an older bid-form version than the one now published. */
export function isStale(submission: Submission, procurement: Procurement): boolean {
  const last = latestRevision(submission);
  const published = procurement.packages.find(p => p.id === submission.packageId)?.published;
  return !!last && !!published && last.formVersion < published.version;
}

/** Everything the estimator must look at in a revision: every answer other than Y. */
export const bidExceptions = (revision: BidContent): ScopeResponse[] => revision.responses.filter(r => r.answer !== "Y");

/** What changed between two revisions, for the estimator's "revised" review. */
export function revisionChanges(previous: BidContent, next: BidContent) {
  const before = new Map(previous.responses.map(r => [r.scopeItemId, r]));
  return {
    baseBidDelta: (next.baseBid ?? 0) - (previous.baseBid ?? 0),
    changedResponses: next.responses.filter(r => {
      const old = before.get(r.scopeItemId);
      return !old || old.answer !== r.answer || old.note !== r.note;
    }).map(r => r.scopeItemId),
    exclusionsChanged: JSON.stringify(previous.exclusions) !== JSON.stringify(next.exclusions),
    alternatesChanged: JSON.stringify(previous.alternates) !== JSON.stringify(next.alternates),
    clarificationsChanged: JSON.stringify(previous.clarifications) !== JSON.stringify(next.clarifications),
    attachmentsChanged: JSON.stringify(previous.attachments.map(a => a.id)) !== JSON.stringify(next.attachments.map(a => a.id)),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Why this invitation cannot bid right now; empty when it can. */
export function invitationIssues(procurement: Procurement, invitationId: string): SubmissionIssue[] {
  const invitation = procurement.invitations.find(i => i.id === invitationId);
  if (!invitation) return [{ field: "invitation", message: "This invitation no longer exists." }];
  if (invitation.status === "declined") return [{ field: "invitation", message: "This company declined the invitation." }];
  const pkg = procurement.packages.find(p => p.id === invitation.packageId);
  if (!pkg) return [{ field: "invitation", message: "The trade package for this invitation no longer exists." }];
  if (!pkg.published) return [{ field: "form", message: `The ${pkg.name} bid form has not been published yet.` }];
  return [];
}

function context(procurement: Procurement, invitationId: string): { invitation: Invitation; pkg: TradePackage; form: PublishedForm } {
  const issues = invitationIssues(procurement, invitationId);
  if (issues.length) throw new SubmissionRuleError(issues);
  const invitation = procurement.invitations.find(i => i.id === invitationId)!;
  const pkg = procurement.packages.find(p => p.id === invitation.packageId)!;
  return { invitation, pkg, form: pkg.published! };
}

/**
 * Every rule a submission must meet to be sent. Drafts may be incomplete; this is checked
 * on submit. Every item in the currently published bid form is required.
 */
export function validateSubmission(submission: Submission, procurement: Procurement, submitter: Submitter): SubmissionIssue[] {
  const issues = invitationIssues(procurement, submission.invitationId);
  if (issues.length) return issues;
  const invitation = procurement.invitations.find(i => i.id === submission.invitationId)!;
  if (invitation.packageId !== submission.packageId || invitation.bidderId !== submission.bidderId) {
    return [{ field: "invitation", message: "This submission does not match its invitation." }];
  }
  const form = procurement.packages.find(p => p.id === submission.packageId)!.published!;
  const { draft } = submission;

  if (!(typeof draft.baseBid === "number" && Number.isFinite(draft.baseBid) && draft.baseBid > 0)) {
    issues.push({ field: "baseBid", message: "Enter a base bid greater than zero." });
  }
  const byItem = new Map(draft.responses.map(r => [r.scopeItemId, r]));
  for (const item of form.items) {
    const response = byItem.get(item.id);
    if (!response?.answer) issues.push({ field: "responses", scopeItemId: item.id, message: `Answer "${item.title}".` });
    else if ((response.answer === "P" || response.answer === "N/A") && !response.note.trim()) {
      issues.push({ field: "responses", scopeItemId: item.id, message: `Explain the ${response.answer === "P" ? "partial" : "not applicable"} answer for "${item.title}".` });
    }
  }
  const formIds = new Set(form.items.map(item => item.id));
  const stray = draft.responses.filter(r => !formIds.has(r.scopeItemId)).length;
  if (stray) issues.push({ field: "form", message: `The bid form changed: ${stray} answer${stray === 1 ? " refers to an item" : "s refer to items"} no longer in it. Reopen the latest bid form.` });
  draft.alternates.forEach((alt, index) => {
    if (!alt.description.trim()) issues.push({ field: "alternates", index, message: `Describe alternate ${index + 1}.` });
    if (!(Number.isFinite(alt.amount) && alt.amount > 0)) issues.push({ field: "alternates", index, message: `Enter an amount greater than zero for alternate ${index + 1}.` });
  });
  if (!submitter.name.trim()) issues.push({ field: "submitter", message: "Enter the name of the person submitting." });
  if (!EMAIL.test(submitter.email.trim())) issues.push({ field: "submitter", message: "Enter a valid email address for the person submitting." });
  const last = latestRevision(submission);
  if (last && last.formVersion === form.version && sameContent(draft, last)) {
    issues.push({ field: "revision", message: `Nothing has changed since revision ${last.number}.` });
  }
  return issues;
}

/** An untrusted draft (a request body, storage) reduced to a well-formed BidContent. Use at every server boundary. */
export function sanitizeBidContent(raw: unknown): BidContent {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const list = (v: unknown) => Array.isArray(v) ? v : [];
  const text = (v: unknown, max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const lines = (v: unknown) => list(v).map(x => text(x, 1000)).filter(Boolean);
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
  const seen = new Set<string>();
  return {
    baseBid: num(o.baseBid),
    responses: list(o.responses).flatMap(r => {
      const id = text(r?.scopeItemId, 200);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{ scopeItemId: id, answer: ANSWERS.includes(r?.answer) ? r.answer as ScopeAnswer : null, note: text(r?.note) }];
    }),
    exclusions: lines(o.exclusions),
    alternates: list(o.alternates).map(a => ({ id: text(a?.id, 200) || newId(), kind: a?.kind === "deduct" ? "deduct" as const : "add" as const, description: text(a?.description, 1000), amount: num(a?.amount) ?? 0 })),
    clarifications: lines(o.clarifications),
    attachments: list(o.attachments).slice(0, MAX_ATTACHMENTS).flatMap(a => {
      const name = text(a?.name, 255), size = num(a?.size);
      return name && size !== null ? [{ id: text(a?.id, 200) || newId(), name, size, type: text(a?.type, 200), addedAt: text(a?.addedAt, 40), storageKey: typeof a?.storageKey === "string" ? a.storageKey : null }] : [];
    }),
  };
}

// ── Actions ─────────────────────────────────────────────────────────────────

const replace = (submissions: Submission[], next: Submission) => submissions.map(s => s.id === next.id ? next : s);
function find(submissions: Submission[], id: string): Submission {
  return submissions.find(s => s.id === id) ?? fail("invitation", "This submission no longer exists.");
}

/**
 * Opens the invitation's submission, creating a draft with one blank answer per bid-form item.
 * If the form was revised since, the draft is aligned to it: answers for remaining items are
 * kept, new items get blank answers, removed items are dropped.
 */
export function openSubmission(submissions: Submission[], procurement: Procurement, input: { projectId: string; invitationId: string }, at = now()): Submission[] {
  const { invitation, form } = context(procurement, input.invitationId);
  const existing = submissionFor(submissions, invitation.id);
  if (!existing) {
    return [...submissions, {
      id: newId(), projectId: input.projectId, packageId: invitation.packageId, invitationId: invitation.id, bidderId: invitation.bidderId,
      status: "draft", draft: emptyContent(form), revisions: [], updatedAt: at,
    }];
  }
  const kept = new Map(existing.draft.responses.map(r => [r.scopeItemId, r]));
  const responses = form.items.map(item => kept.get(item.id) ?? { scopeItemId: item.id, answer: null, note: "" });
  if (JSON.stringify(responses) === JSON.stringify(existing.draft.responses)) return submissions;
  return replace(submissions, { ...existing, draft: { ...existing.draft, responses }, updatedAt: at });
}

/** Replaces any draft fields given. Drafts may be incomplete; completeness is checked on submit. */
export function updateDraft(submissions: Submission[], id: string, patch: Partial<Omit<BidContent, "attachments">>, at = now()): Submission[] {
  const submission = find(submissions, id);
  const merged = sanitizeBidContent({ ...submission.draft, ...patch });
  if (merged.baseBid !== null && merged.baseBid < 0) fail("baseBid", "The base bid cannot be negative.");
  return replace(submissions, { ...submission, draft: { ...merged, attachments: submission.draft.attachments }, updatedAt: at });
}

export function setResponse(submissions: Submission[], id: string, scopeItemId: string, answer: ScopeAnswer | null, note = "", at = now()): Submission[] {
  const submission = find(submissions, id);
  if (!submission.draft.responses.some(r => r.scopeItemId === scopeItemId)) fail("form", "That item is not in this bid form.", { scopeItemId });
  const responses = submission.draft.responses.map(r => r.scopeItemId === scopeItemId ? { scopeItemId, answer, note: note.trim() } : r);
  return replace(submissions, { ...submission, draft: { ...submission.draft, responses }, updatedAt: at });
}

/** Records a file's details. The bytes are not stored until a server file store exists. */
export function addAttachment(submissions: Submission[], id: string, file: { name: string; size: number; type: string }, at = now()): Submission[] {
  const submission = find(submissions, id);
  const name = file.name.trim();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  if (!name) fail("attachments", "The file needs a name.");
  if (!ATTACHMENT_EXTENSIONS.includes(extension)) fail("attachments", `${name}: attach a PDF, Excel, Word, CSV, image or ZIP file.`);
  if (!(file.size > 0)) fail("attachments", `${name} is empty.`);
  if (file.size > MAX_ATTACHMENT_BYTES) fail("attachments", `${name} is larger than 50 MB.`);
  if (submission.draft.attachments.length >= MAX_ATTACHMENTS) fail("attachments", `A submission can hold up to ${MAX_ATTACHMENTS} files.`);
  const attachment: AttachmentMeta = { id: newId(), name, size: file.size, type: file.type, addedAt: at, storageKey: null };
  return replace(submissions, { ...submission, draft: { ...submission.draft, attachments: [...submission.draft.attachments, attachment] }, updatedAt: at });
}

export function removeAttachment(submissions: Submission[], id: string, attachmentId: string, at = now()): Submission[] {
  const submission = find(submissions, id);
  const attachments = submission.draft.attachments.filter(a => a.id !== attachmentId);
  if (attachments.length === submission.draft.attachments.length) return submissions;
  return replace(submissions, { ...submission, draft: { ...submission.draft, attachments }, updatedAt: at });
}

/**
 * Sends the draft as the next revision. Throws SubmissionRuleError with every issue when it is
 * not ready. The caller must also mark the invitation "submitted" (useSubmissions does; the
 * server does it in the same transaction).
 */
export function submitBid(submissions: Submission[], procurement: Procurement, id: string, submitter: Submitter, at = now()): Submission[] {
  const submission = find(submissions, id);
  const issues = validateSubmission(submission, procurement, submitter);
  if (issues.length) throw new SubmissionRuleError(issues);
  const form = procurement.packages.find(p => p.id === submission.packageId)!.published!;
  const revision: SubmittedRevision = {
    ...structuredClone(contentOf(submission.draft)), number: submission.revisions.length + 1, formVersion: form.version, submittedAt: at,
    submitter: { name: submitter.name.trim(), email: submitter.email.trim() },
  };
  return replace(submissions, { ...submission, revisions: [...submission.revisions, revision], status: revision.number === 1 ? "submitted" : "revised", updatedAt: at });
}
