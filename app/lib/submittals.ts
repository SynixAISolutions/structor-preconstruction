// Submittal packages for ONE project (Operations; demo, browser-only).
//
// Marcel (20 Sep, 10:50–12:09 and 18:44): the spec matrix becomes the submittal log. Each
// specification section says what the awarded subcontractor must submit (mix designs, test
// reports, product data, samples, shop drawings, warranties). Once a trade is awarded, Structor
// asks that subcontractor for them, the subcontractor submits on the platform, the architect
// reviews and comments, and Structor routes the answer back and keeps reminding everyone until it
// is done. The contractor still makes the decisions: nothing reaches the architect before the
// contractor has reviewed it.
//
// One Submittal is one required item ("03 30 00-01 Mix design"). Every submission is a revision
// (0 = the first); a revision is never changed once the next one exists, so the whole back-and-forth
// stays on record. Requests, sends, responses and reminders are RECORDED as notifications; nothing
// is emailed. Pure functions; rule violations throw SubmittalRuleError with field-level errors.

import type { Award } from "./award";
import type { SpecItem } from "./data/preconstruction";
import type { Procurement } from "./procurement";
import type { DesignTeamContact } from "./rfi";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, type AttachmentMeta } from "./submissions";

/**
 * draft → requested → contractor-review → ready-to-send → with-architect → response-received → closed,
 * or → resubmit (returned by the contractor's review or the architect) → contractor-review again.
 */
export type SubmittalStatus = "draft" | "requested" | "contractor-review" | "ready-to-send" | "with-architect" | "response-received" | "resubmit" | "closed";
export type ArchitectAction = "approved" | "approved-as-noted" | "revise-and-resubmit" | "rejected";
export type Party = "contractor" | "subcontractor" | "architect";

/** The awarded company responsible for the submittal. `awardId` is null when assigned without an award record. */
export type SubmittalSubcontractor = { bidderId: string; company: string; contact: string; email: string; awardId: string | null };

export type SubmittalRevision = {
  /** 0 is the first submission. */
  number: number;
  files: AttachmentMeta[];
  note: string;
  submittedAt: string; submittedBy: string;
  /** The contractor's review before anything goes to the architect. */
  review: { decision: "approve" | "return"; note: string; by: string; at: string } | null;
  sent: { to: DesignTeamContact; due: string; by: string; at: string } | null;
  response: { action: ArchitectAction; comments: string; files: AttachmentMeta[]; by: string; at: string } | null;
  /** When the architect's response went back to the subcontractor. */
  returned: { by: string; at: string } | null;
};

export type SubmittalEventKind =
  | "created" | "assigned" | "requested" | "submitted" | "approved-for-architect" | "returned-by-contractor"
  | "sent-to-architect" | "architect-responded" | "response-returned" | "reminded";
export type SubmittalEvent = { kind: SubmittalEventKind; at: string; by: string; note: string; revision: number | null };

export type Submittal = {
  id: string;
  /** "03 30 00-01": the section and a sequence within it, never reused. */
  number: string;
  /** List of specifications section, "03 30 00". */
  specSection: string;
  /** What is required: "Mix design", "Shop drawings"… */
  title: string;
  description: string;
  packageId: string;
  /** The estimator responsible for the trade, told when something needs the contractor. */
  owner: string;
  /** The spec-matrix row the requirement came from, if any. */
  specItemId: string | null;
  subcontractor: SubmittalSubcontractor | null;
  status: SubmittalStatus;
  /** When the party now holding it must act (subcontractor or architect); "" while it is with the contractor. */
  due: string;
  revisions: SubmittalRevision[];
  history: SubmittalEvent[];
  createdAt: string; createdBy: string; updatedAt: string;
};

export type SubmittalNotificationKind =
  | "requested" | "submitted" | "returned-for-revision" | "sent-to-architect" | "architect-responded" | "response-returned" | "reminder";
/** Recorded, never sent. `recipient`: a team member's name, a directory bidder id, or the architect's email. */
export type SubmittalNotification = { id: string; submittalId: string; kind: SubmittalNotificationKind; recipientType: "team" | "bidder" | "architect"; recipient: string; text: string; at: string; read: boolean };

export type SubmittalState = {
  submittals: Submittal[];
  notifications: SubmittalNotification[];
  /** Default architect for sending, once entered. */
  architect: DesignTeamContact | null;
  /** Last sequence used per specification section, so numbers are never reused. */
  sequences: { section: string; last: number }[];
};
export const EMPTY_SUBMITTALS: SubmittalState = { submittals: [], notifications: [], architect: null, sequences: [] };

export type RequirementInput = { specSection: string; title: string; packageId: string; description?: string; specItemId?: string | null };
export type FileInput = { name: string; size: number; type?: string };
export type SubmittalErrors = Partial<Record<
  "submittal" | "specSection" | "title" | "packageId" | "subcontractor" | "email" | "due" | "files" | "note" | "decision" | "to" | "action" | "comments" | "by" | "award", string>>;

export class SubmittalRuleError extends Error {
  readonly errors: SubmittalErrors;
  constructor(errors: SubmittalErrors) {
    super(Object.values(errors).join(" "));
    this.name = "SubmittalRuleError";
    this.errors = errors;
  }
}

export const ARCHITECT_ACTIONS: ArchitectAction[] = ["approved", "approved-as-noted", "revise-and-resubmit", "rejected"];
/** Architect actions that close the submittal once returned; the others send it back for a new revision. */
export const ACCEPTED: ArchitectAction[] = ["approved", "approved-as-noted"];

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: SubmittalErrors): never => { throw new SubmittalRuleError(errors); };
const check = (errors: SubmittalErrors) => { if (Object.keys(errors).length) fail(errors); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SECTION = /^\d{2} \d{2} \d{2}$/;
const day = (iso: string) => iso.slice(0, 10);
const needBy = (by: string) => { if (!by?.trim()) fail({ by: "Say who did this." }); };

function findSubmittal(state: SubmittalState, id: string): Submittal {
  return state.submittals.find(s => s.id === id) ?? fail({ submittal: "That submittal no longer exists." });
}
const current = (s: Submittal): SubmittalRevision | null => s.revisions[s.revisions.length - 1] ?? null;
type Note = Omit<SubmittalNotification, "id" | "read">;
/** Replaces the submittal (with one history event) and records notifications. */
function commit(state: SubmittalState, next: Submittal, event: Omit<SubmittalEvent, "revision"> & { revision?: number | null }, notes: Note[] = []): SubmittalState {
  const updated = { ...next, updatedAt: event.at, history: [...next.history, { ...event, note: event.note.trim(), revision: event.revision ?? current(next)?.number ?? null }] };
  return {
    ...state,
    submittals: state.submittals.map(s => s.id === next.id ? updated : s),
    notifications: [...state.notifications, ...notes.map(n => ({ ...n, id: newId(), read: false }))],
  };
}
/** A real calendar date: Date.parse rolls 2026-02-30 over to March, so it must round-trip. */
const realDate = (d: string) => ISO_DATE.test(d) && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;
function validDue(due: string | undefined, at: string, errors: SubmittalErrors) {
  if (!due || !realDate(due)) errors.due = "Choose a due date.";
  else if (due < day(at)) errors.due = "The due date can't be in the past.";
}
const toBidder = (s: Submittal, kind: SubmittalNotificationKind, text: string, at: string): Note =>
  ({ submittalId: s.id, kind, recipientType: "bidder", recipient: s.subcontractor!.bidderId, text, at });
const toOwner = (s: Submittal, kind: SubmittalNotificationKind, text: string, at: string): Note[] =>
  s.owner ? [{ submittalId: s.id, kind, recipientType: "team", recipient: s.owner, text, at }] : [];
const label = (s: Submittal) => `${s.number} ${s.title}`;

// ── Requirements ────────────────────────────────────────────────────────────

/** A required submittal for a specification section and trade package. Starts as a draft. */
export function addRequirement(state: SubmittalState, procurement: Procurement, input: RequirementInput, by: string, at = now()): SubmittalState {
  needBy(by);
  const errors: SubmittalErrors = {};
  const section = input.specSection?.trim() ?? "", title = input.title?.trim() ?? "";
  if (!SECTION.test(section)) errors.specSection = "Use a specification section like 03 30 00.";
  if (!title) errors.title = "Say what must be submitted.";
  const pkg = procurement.packages.find(p => p.id === input.packageId);
  if (!pkg) errors.packageId = "Choose the trade package.";
  if (!errors.title && state.submittals.some(s => s.specSection === section && s.packageId === input.packageId && s.title.toLowerCase() === title.toLowerCase())) {
    errors.title = `${title} is already required for ${section}.`;
  }
  check(errors);
  const last = (state.sequences.find(q => q.section === section)?.last ?? 0) + 1;
  const submittal: Submittal = {
    id: newId(), number: `${section}-${String(last).padStart(2, "0")}`, specSection: section, title, description: input.description?.trim() ?? "",
    packageId: pkg!.id, owner: pkg!.owner, specItemId: input.specItemId ?? null, subcontractor: null, status: "draft", due: "",
    revisions: [], history: [{ kind: "created", at, by, note: "", revision: null }], createdAt: at, createdBy: by, updatedAt: at,
  };
  const sequences = [...state.sequences.filter(q => q.section !== section), { section, last }].sort((a, b) => a.section.localeCompare(b.section));
  return { ...state, sequences, submittals: [...state.submittals, submittal] };
}

/**
 * Requirements from the spec matrix: one per required type ("Mix design · Test reports" → two), in
 * the package whose main section matches. Rows already in the log are skipped; a section with no
 * package is an error, so nothing is silently lost.
 */
export function requirementsFromSpecs(state: SubmittalState, procurement: Procurement, specs: SpecItem[], by: string, at = now()): SubmittalState {
  const orphans = specs.filter(item => !procurement.packages.some(p => p.code === item.section)).map(item => item.section);
  if (orphans.length) fail({ packageId: `No trade package has section ${orphans.join(", ")}; add those requirements one by one.` });
  return specs.reduce((next, item) => item.submittal.split("·").map(t => t.trim()).filter(Boolean).reduce((inner, title) => {
    const pkg = procurement.packages.find(p => p.code === item.section)!;
    if (inner.submittals.some(s => s.specSection === item.section && s.packageId === pkg.id && s.title.toLowerCase() === title.toLowerCase())) return inner;
    return addRequirement(inner, procurement, { specSection: item.section, title, packageId: pkg.id, description: `${item.title}: ${item.product}`, specItemId: item.id }, by, at);
  }, next), state);
}

/** Removes a requirement that was never requested. Its number is not reused. */
export function removeRequirement(state: SubmittalState, id: string): SubmittalState {
  const s = findSubmittal(state, id);
  if (s.status !== "draft") fail({ submittal: `${s.number} has been requested and stays in the log.` });
  return { ...state, submittals: state.submittals.filter(x => x.id !== id) };
}

/** Gives a package's draft submittals to the awarded subcontractor. */
export function assignSubcontractor(state: SubmittalState, packageId: string, sub: SubmittalSubcontractor, by: string, at = now()): SubmittalState {
  needBy(by);
  const errors: SubmittalErrors = {};
  if (!sub?.bidderId?.trim() || !sub.company?.trim()) errors.subcontractor = "Choose the awarded subcontractor.";
  if (sub?.email?.trim() && !EMAIL.test(sub.email.trim())) errors.email = "Enter a valid email address.";
  check(errors);
  const drafts = state.submittals.filter(s => s.packageId === packageId && s.status === "draft");
  if (!drafts.length) fail({ submittal: "This package has no submittals waiting to be requested." });
  const clean: SubmittalSubcontractor = { bidderId: sub.bidderId.trim(), company: sub.company.trim(), contact: sub.contact?.trim() ?? "", email: sub.email?.trim() ?? "", awardId: sub.awardId ?? null };
  return drafts.reduce((next, s) => commit(next, { ...s, subcontractor: clean }, { kind: "assigned", at, by, note: clean.company }), state);
}

/** The same, from an award (Contracts & exhibits): its package, company and contact. */
export function assignFromAward(state: SubmittalState, award: Award, by: string, at = now()): SubmittalState {
  if (award.cancelled) fail({ award: "That award was cancelled." });
  const c = award.snapshot.company;
  return assignSubcontractor(state, award.packageId, { bidderId: award.bidderId, company: c.name, contact: c.contact, email: c.email, awardId: award.id }, by, at);
}

// ── Subcontractor ───────────────────────────────────────────────────────────

/** Asks the subcontractor for the submittal by a date. */
export function requestSubmittal(state: SubmittalState, id: string, due: string, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  if (s.status !== "draft") fail({ submittal: `${s.number} was already requested.` });
  if (!s.subcontractor) fail({ subcontractor: "Assign the awarded subcontractor first." });
  const errors: SubmittalErrors = {};
  validDue(due, at, errors);
  check(errors);
  return commit(state, { ...s, status: "requested", due }, { kind: "requested", at, by, note: `Due ${due}` },
    [toBidder(s, "requested", `Please submit ${label(s)} by ${due}.`, at)]);
}

/** Requests every draft of a package at once ("send him the submittals he owes"). */
export function requestPackage(state: SubmittalState, packageId: string, due: string, by: string, at = now()): SubmittalState {
  const ready = state.submittals.filter(s => s.packageId === packageId && s.status === "draft" && s.subcontractor);
  if (!ready.length) fail({ submittal: "Nothing in this package is ready to request." });
  return ready.reduce((next, s) => requestSubmittal(next, s.id, due, by, at), state);
}

/** The subcontractor submits files and notes: a new revision for the contractor to review. */
export function submitRevision(state: SubmittalState, id: string, input: { files: FileInput[]; note?: string }, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  if (s.status !== "requested" && s.status !== "resubmit") fail({ submittal: `${s.number} isn't waiting for a submission.` });
  const files = cleanFiles(input.files, at);
  const revision: SubmittalRevision = {
    number: s.revisions.length, files, note: input.note?.trim() ?? "", submittedAt: at, submittedBy: by.trim(),
    review: null, sent: null, response: null, returned: null,
  };
  const next = { ...s, status: "contractor-review" as const, due: "", revisions: [...s.revisions, revision] };
  return commit(state, next, { kind: "submitted", at, by, note: revision.note },
    toOwner(s, "submitted", `${s.subcontractor?.company ?? "The subcontractor"} submitted ${label(s)}, revision ${revision.number}.`, at));
}

function cleanFiles(files: FileInput[] | undefined, at: string): AttachmentMeta[] {
  if (!Array.isArray(files) || !files.length) fail({ files: "Attach at least one file." });
  if (files!.length > MAX_ATTACHMENTS) fail({ files: `Attach at most ${MAX_ATTACHMENTS} files.` });
  for (const f of files!) {
    if (!f?.name?.trim()) fail({ files: "Every file needs a name." });
    if (!(typeof f.size === "number" && f.size >= 0 && f.size <= MAX_ATTACHMENT_BYTES)) fail({ files: `${f.name.trim()} must be under 50 MB.` });
  }
  return files!.map(f => ({ id: newId(), name: f.name.trim(), size: f.size, type: f.type ?? "", addedAt: at, storageKey: null }));
}

// ── Contractor and architect ────────────────────────────────────────────────

/**
 * The contractor's review of the latest revision. "approve" makes it ready to send to the
 * architect; "return" sends it back to the subcontractor with a note and a new due date.
 */
export function reviewSubmittal(state: SubmittalState, id: string, decision: "approve" | "return", input: { note?: string; due?: string }, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  if (s.status !== "contractor-review") fail({ submittal: `${s.number} isn't waiting for the contractor's review.` });
  if (decision !== "approve" && decision !== "return") fail({ decision: "Approve it for the architect or return it." });
  const note = input.note?.trim() ?? "";
  const rev = current(s)!;
  const review = { decision, note, by: by.trim(), at };
  const revisions = [...s.revisions.slice(0, -1), { ...rev, review }];
  if (decision === "approve") return commit(state, { ...s, status: "ready-to-send", revisions }, { kind: "approved-for-architect", at, by, note });
  const errors: SubmittalErrors = {};
  if (!note) errors.note = "Say what the subcontractor must correct.";
  validDue(input.due, at, errors);
  check(errors);
  return commit(state, { ...s, status: "resubmit", due: input.due!, revisions }, { kind: "returned-by-contractor", at, by, note },
    [toBidder(s, "returned-for-revision", `${label(s)} revision ${rev.number} needs changes before it goes to the architect: ${note} Resubmit by ${input.due}.`, at)]);
}

/** Records sending the contractor-approved revision to the architect (nothing is emailed). */
export function sendToArchitect(state: SubmittalState, id: string, input: { to?: DesignTeamContact; due: string }, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  if (s.status === "contractor-review") fail({ submittal: `The contractor must review ${s.number} before it goes to the architect.` });
  if (s.status !== "ready-to-send") fail({ submittal: `${s.number} isn't ready to send.` });
  const to = input.to ?? state.architect;
  const errors: SubmittalErrors = {};
  if (!to?.name?.trim()) errors.to = "Say who the architect is.";
  if (!to?.email?.trim() || !EMAIL.test(to.email.trim())) errors.email = "Add the architect's email address.";
  validDue(input.due, at, errors);
  check(errors);
  const clean = { name: to!.name.trim(), company: to!.company?.trim() ?? "", email: to!.email.trim() };
  const rev = current(s)!;
  const revisions = [...s.revisions.slice(0, -1), { ...rev, sent: { to: clean, due: input.due, by: by.trim(), at } }];
  return commit({ ...state, architect: clean }, { ...s, status: "with-architect", due: input.due, revisions }, { kind: "sent-to-architect", at, by, note: `Due ${input.due}` },
    [{ submittalId: s.id, kind: "sent-to-architect", recipientType: "architect", recipient: clean.email, text: `${label(s)}, revision ${rev.number}, for review by ${input.due}.`, at }]);
}

/** The architect's action and comments on the revision. The trade's owner is told. */
export function recordArchitectResponse(state: SubmittalState, id: string, input: { action: ArchitectAction; comments?: string; files?: FileInput[]; by?: string }, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  if (s.status !== "with-architect") fail({ submittal: `${s.number} isn't with the architect.` });
  const errors: SubmittalErrors = {};
  if (!ARCHITECT_ACTIONS.includes(input.action)) errors.action = "Choose the architect's action.";
  const comments = input.comments?.trim() ?? "";
  if (input.action !== "approved" && !comments) errors.comments = "Enter the architect's comments.";
  check(errors);
  const rev = current(s)!;
  const files = input.files?.length ? cleanFiles(input.files, at) : [];
  const response = { action: input.action, comments, files, by: input.by?.trim() || rev.sent!.to.name, at };
  const revisions = [...s.revisions.slice(0, -1), { ...rev, response }];
  return commit(state, { ...s, status: "response-received", due: "", revisions }, { kind: "architect-responded", at, by, note: `${input.action}${comments ? `: ${comments}` : ""}` },
    toOwner(s, "architect-responded", `The architect returned ${label(s)}: ${input.action.replace(/-/g, " ")}.`, at));
}

/**
 * Sends the architect's response to the subcontractor. Approved (as noted) closes the submittal;
 * revise-and-resubmit or rejected asks for the next revision by `due`.
 */
export function returnResponse(state: SubmittalState, id: string, input: { due?: string }, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  if (s.status !== "response-received") fail({ submittal: `${s.number} has no architect response to return.` });
  const rev = current(s)!;
  const response = rev.response!;
  const closes = ACCEPTED.includes(response.action);
  if (!closes) { const errors: SubmittalErrors = {}; validDue(input.due, at, errors); check(errors); }
  const revisions = [...s.revisions.slice(0, -1), { ...rev, returned: { by: by.trim(), at } }];
  const text = `The architect's response to ${label(s)}: ${response.action.replace(/-/g, " ")}${response.comments ? `. ${response.comments}` : ""}${closes ? "" : ` Resubmit by ${input.due}.`}`;
  return commit(state, { ...s, status: closes ? "closed" : "resubmit", due: closes ? "" : input.due!, revisions },
    { kind: "response-returned", at, by, note: response.action }, [toBidder(s, "response-returned", text, at)]);
}

// ── Reminders and due dates ─────────────────────────────────────────────────

const WAITING_ON: Partial<Record<SubmittalStatus, Party>> = { requested: "subcontractor", resubmit: "subcontractor", "with-architect": "architect" };

/** Overdue: past its due date. `due` is only set while the subcontractor or architect holds it. `today` is yyyy-mm-dd. */
export const isOverdue = (s: Submittal, today: string): boolean => !!s.due && s.due < today;
export const daysOverdue = (s: Submittal, today: string): number =>
  isOverdue(s, today) ? Math.round((Date.parse(today) - Date.parse(s.due)) / 86_400_000) : 0;

/** Records a reminder to whoever holds the submittal. */
export function sendReminder(state: SubmittalState, id: string, by: string, at = now()): SubmittalState {
  needBy(by);
  const s = findSubmittal(state, id);
  const party = WAITING_ON[s.status];
  if (!party) return fail({ submittal: `${s.number} isn't waiting on the subcontractor or the architect.` });
  const late = s.due && s.due < day(at) ? ` It was due ${s.due}.` : ` It is due ${s.due}.`;
  const note: Note = party === "architect"
    ? { submittalId: s.id, kind: "reminder", recipientType: "architect", recipient: current(s)!.sent!.to.email, text: `Reminder: please review ${label(s)}.${late}`, at }
    : toBidder(s, "reminder", `Reminder: please ${s.status === "resubmit" ? "resubmit" : "submit"} ${label(s)}.${late}`, at);
  return commit(state, s, { kind: "reminded", at, by, note: party }, [note]);
}

/** Reminds the holder of every overdue submittal not already reminded on `today` (yyyy-mm-dd). */
export function remindOverdue(state: SubmittalState, today: string, by: string, at = now()): SubmittalState {
  return state.submittals
    .filter(s => isOverdue(s, today) && !s.history.some(e => e.kind === "reminded" && day(e.at) === today))
    .reduce((next, s) => sendReminder(next, s.id, by, at), state);
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Who holds the submittal and what they must do next. */
export function nextStep(s: Submittal): { party: Party | null; action: string } {
  const rev = current(s);
  const company = s.subcontractor?.company ?? "the subcontractor";
  switch (s.status) {
    case "draft": return { party: "contractor", action: s.subcontractor ? `Request from ${company}` : "Assign the awarded subcontractor" };
    case "requested": return { party: "subcontractor", action: "Submit" };
    case "contractor-review": return { party: "contractor", action: `Review revision ${rev!.number}` };
    case "ready-to-send": return { party: "contractor", action: "Send to the architect" };
    case "with-architect": return { party: "architect", action: `Review revision ${rev!.number}` };
    case "response-received": return { party: "contractor", action: `Return the architect's response to ${company}` };
    case "resubmit": return { party: "subcontractor", action: `Resubmit as revision ${s.revisions.length}` };
    case "closed": return { party: null, action: "Complete" };
  }
}

export type SubmittalLogRow = {
  id: string; number: string; specSection: string; title: string; packageId: string; packageName: string;
  subcontractor: string; bidderId: string | null; status: SubmittalStatus; revision: number | null;
  party: Party | null; nextAction: string; due: string; overdue: boolean; daysOverdue: number;
  /** The latest architect action, if any. */
  architectAction: ArchitectAction | null;
  updatedAt: string;
};

/** The submittal log: every submittal with its holder, next action and due state, by number. */
export function submittalLog(state: SubmittalState, procurement: Procurement, today: string): SubmittalLogRow[] {
  return [...state.submittals].sort((a, b) => a.number.localeCompare(b.number)).map(s => {
    const step = nextStep(s);
    const responded = [...s.revisions].reverse().find(r => r.response);
    return {
      id: s.id, number: s.number, specSection: s.specSection, title: s.title, packageId: s.packageId,
      packageName: procurement.packages.find(p => p.id === s.packageId)?.name ?? "", subcontractor: s.subcontractor?.company ?? "",
      bidderId: s.subcontractor?.bidderId ?? null, status: s.status, revision: current(s)?.number ?? null,
      party: step.party, nextAction: step.action, due: s.due, overdue: isOverdue(s, today), daysOverdue: daysOverdue(s, today),
      architectAction: responded?.response?.action ?? null, updatedAt: s.updatedAt,
    };
  });
}

export type SubmittalFilter = { packageId?: string; specSection?: string; status?: SubmittalStatus; party?: Party | "none"; bidderId?: string; overdue?: boolean; query?: string };

/** Log rows matching every filter given. `party: "none"` finds the closed ones. */
export function filterSubmittals(state: SubmittalState, procurement: Procurement, filter: SubmittalFilter, today: string): SubmittalLogRow[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return submittalLog(state, procurement, today).filter(r => (!filter.packageId || r.packageId === filter.packageId)
    && (!filter.specSection || r.specSection === filter.specSection) && (!filter.status || r.status === filter.status)
    && (!filter.party || (filter.party === "none" ? r.party === null : r.party === filter.party))
    && (!filter.bidderId || r.bidderId === filter.bidderId) && (filter.overdue === undefined || r.overdue === filter.overdue)
    && (!q || `${r.number} ${r.title} ${r.packageName} ${r.subcontractor}`.toLowerCase().includes(q)));
}

export type SubmittalSummary = { total: number; needsAssignment: number; withContractor: number; withSubcontractor: number; withArchitect: number; overdue: number; closed: number };

export function submittalSummary(state: SubmittalState, today: string): SubmittalSummary {
  const steps = state.submittals.map(s => ({ s, party: nextStep(s).party }));
  return {
    total: state.submittals.length,
    needsAssignment: state.submittals.filter(s => s.status === "draft" && !s.subcontractor).length,
    withContractor: steps.filter(x => x.party === "contractor").length,
    withSubcontractor: steps.filter(x => x.party === "subcontractor").length,
    withArchitect: steps.filter(x => x.party === "architect").length,
    overdue: state.submittals.filter(s => isOverdue(s, today)).length,
    closed: state.submittals.filter(s => s.status === "closed").length,
  };
}

export type PortalSubmittal = {
  id: string; number: string; title: string; specSection: string; due: string;
  /** True when the subcontractor has to submit or resubmit. */
  yourTurn: boolean;
  status: "to-submit" | "in-review" | "to-resubmit" | "closed";
  /** Their revisions, with only what has been returned to them: the contractor's return note and the architect's returned response. */
  revisions: { number: number; files: AttachmentMeta[]; note: string; submittedAt: string; contractorNote: string | null; response: { action: ArchitectAction; comments: string; files: AttachmentMeta[] } | null }[];
};

/** What an awarded subcontractor sees: its requested submittals, never drafts or unreturned architect responses. */
export function portalSubmittals(state: SubmittalState, bidderId: string): PortalSubmittal[] {
  return state.submittals.filter(s => s.subcontractor?.bidderId === bidderId && s.status !== "draft").map((s): PortalSubmittal => ({
    id: s.id, number: s.number, title: s.title, specSection: s.specSection, due: WAITING_ON[s.status] === "subcontractor" ? s.due : "",
    yourTurn: WAITING_ON[s.status] === "subcontractor",
    status: s.status === "requested" ? "to-submit" : s.status === "resubmit" ? "to-resubmit" : s.status === "closed" ? "closed" : "in-review",
    revisions: s.revisions.map(r => ({
      number: r.number, files: r.files, note: r.note, submittedAt: r.submittedAt,
      contractorNote: r.review?.decision === "return" ? r.review.note : null,
      response: r.returned && r.response ? { action: r.response.action, comments: r.response.comments, files: r.response.files } : null,
    })),
  })).sort((a, b) => a.number.localeCompare(b.number));
}

export function markSubmittalNotificationsRead(state: SubmittalState, ids: string[]): SubmittalState {
  const read = new Set(ids);
  return { ...state, notifications: state.notifications.map(n => read.has(n.id) ? { ...n, read: true } : n) };
}
