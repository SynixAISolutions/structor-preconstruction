// Structor Check and RFIs for ONE project (demo, browser-only).
//
// Marcel (20 Sep, 21:38–23:31): Structor Check as a table he can filter by trade and severity;
// add the team's own issues next to the AI's; package issues into RFIs and send them to the
// architect; when the architect answers, share the answer with the subcontractors. Subs raise
// RFIs from their portal too, and emailed RFIs should land in the same log — so there is ONE
// register of issues with their provenance, and RFIs are built from it.
//
// RFIs follow his RFI log: number, discipline, question, submitted by, date submitted,
// design-team response, response date.
//
// Contractor review gate (Danial, 30 Sep): every AI-created and subcontractor-created issue waits
// for contractor review before it can be combined or packaged; the contractor can edit, combine
// and package reviewed issues; only a contractor-approved RFI can be recorded as sent.
//
// Pure functions; rule violations throw RfiRuleError with field-level errors. Sending to the
// design team and sharing with subcontractors are RECORDED as notifications; nothing is emailed.

import type { Procurement } from "./procurement";

export type Severity = "high" | "medium" | "low";
/** Who raised the issue: Structor's document check, the team, a subcontractor (portal), or an email. */
export type IssueOrigin = "ai" | "team" | "subcontractor" | "email";
/**
 * pending-review (AI and subcontractor issues) → open (reviewed) → in-rfi → resolved.
 * Also: dismissed (not a real issue), or combined into another reviewed issue.
 */
export type IssueStatus = "pending-review" | "open" | "in-rfi" | "resolved" | "dismissed" | "combined";

export type StructorIssue = {
  id: string;
  /** "SC-001", never reused. */
  number: string;
  title: string;
  detail: string;
  /** Kind of problem, e.g. "Conflict", "Missing detail", "Coordination", "Question". */
  category: string;
  severity: Severity;
  /** Trade label as shown to people, e.g. "08 · Openings". */
  trade: string;
  packageId: string | null;
  /** Where it was found, e.g. "A-101 · Room 104". */
  source: string;
  crossReference: string;
  origin: IssueOrigin;
  /** Name of the person or company who raised it. */
  raisedBy: string;
  /** Directory company, when a subcontractor raised it. */
  bidderId: string | null;
  status: IssueStatus;
  /** The contractor who reviewed it. The team's own issues are reviewed as they are added. */
  reviewedBy: string | null; reviewedAt: string | null;
  /** The issue this one was combined into (status "combined"). */
  combinedInto: string | null;
  rfiId: string | null;
  resolution: { note: string; by: string; at: string } | null;
  createdAt: string; updatedAt: string;
};

export type DesignTeamContact = { name: string; company: string; email: string };
/** draft → approved (by the contractor) → sent → answered → closed. Editing an approved RFI returns it to draft. */
export type RfiStatus = "draft" | "approved" | "sent" | "answered" | "closed";

export type Rfi = {
  id: string;
  /** "RFI-001", never reused. */
  number: string;
  subject: string;
  /** The question sent to the design team. */
  question: string;
  discipline: string;
  issueIds: string[];
  to: DesignTeamContact;
  /** Answer wanted by (yyyy-mm-dd), or "". */
  due: string;
  status: RfiStatus;
  createdAt: string; createdBy: string;
  approvedAt: string | null; approvedBy: string | null;
  sentAt: string | null; sentBy: string | null;
  response: { text: string; by: string; at: string } | null;
  /** Subcontractors the answer was shared with. */
  shares: { bidderId: string; packageId: string | null; at: string }[];
  closedAt: string | null; closedBy: string | null;
};

export type RfiNotificationKind = "question-raised" | "rfi-sent" | "rfi-answered" | "answer-shared" | "question-resolved";
/** Recorded, never sent. `recipient`: a team member's name, a directory bidder id, or the design team's email. */
export type RfiNotification = { id: string; kind: RfiNotificationKind; recipientType: "team" | "bidder" | "design-team"; recipient: string; text: string; at: string; read: boolean; issueId: string | null; rfiId: string | null };

export type StructorCheckState = {
  issues: StructorIssue[];
  rfis: Rfi[];
  notifications: RfiNotification[];
  lastIssueNumber: number;
  lastRfiNumber: number;
  /** Default addressee for new RFIs (the architect / design team), once entered. */
  designTeam: DesignTeamContact | null;
};

export const EMPTY_STRUCTOR_CHECK: StructorCheckState = { issues: [], rfis: [], notifications: [], lastIssueNumber: 0, lastRfiNumber: 0, designTeam: null };

export type IssueInput = {
  title: string; detail?: string; category?: string; severity: Severity; trade?: string; packageId?: string | null;
  source?: string; crossReference?: string; origin?: IssueOrigin; raisedBy?: string;
};
export type RfiInput = { issueIds: string[]; subject?: string; question: string; discipline?: string; to: DesignTeamContact; due?: string };
export type RfiErrors = Partial<Record<"title" | "severity" | "issue" | "issueIds" | "question" | "to" | "email" | "due" | "rfi" | "response" | "note" | "invitation", string>>;

export class RfiRuleError extends Error {
  readonly errors: RfiErrors;
  constructor(errors: RfiErrors) {
    super(Object.values(errors).join(" "));
    this.name = "RfiRuleError";
    this.errors = errors;
  }
}

export const SEVERITIES: Severity[] = ["high", "medium", "low"];
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: RfiErrors): never => { throw new RfiRuleError(errors); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(3, "0");

type Note = Omit<RfiNotification, "id" | "read">;
const withNotes = (state: StructorCheckState, notes: Note[]): StructorCheckState =>
  ({ ...state, notifications: [...state.notifications, ...notes.map(n => ({ ...n, id: newId(), read: false }))] });
function findIssue(state: StructorCheckState, id: string): StructorIssue {
  return state.issues.find(i => i.id === id) ?? fail({ issue: "That issue no longer exists." });
}
function findRfi(state: StructorCheckState, id: string): Rfi {
  return state.rfis.find(r => r.id === id) ?? fail({ rfi: "That RFI no longer exists." });
}
const putIssue = (state: StructorCheckState, issue: StructorIssue) => ({ ...state, issues: state.issues.map(i => i.id === issue.id ? issue : i) });
const putRfi = (state: StructorCheckState, rfi: Rfi) => ({ ...state, rfis: state.rfis.map(r => r.id === rfi.id ? rfi : r) });
/** AI and subcontractor issues must be reviewed by the contractor before anything else happens to them. */
const needsReview = (origin: IssueOrigin) => origin === "ai" || origin === "subcontractor";
const reviewed = (i: StructorIssue) => !needsReview(i.origin) || !!i.reviewedBy;
/** The issue a combined issue now lives in (itself when not combined). */
function currentIssue(state: StructorCheckState, issue: StructorIssue): StructorIssue {
  let i = issue;
  for (let hops = 0; i.combinedInto && hops < state.issues.length; hops++) i = state.issues.find(x => x.id === i.combinedInto) ?? i;
  return i;
}
/** Subcontractors waiting on this issue's answer: whoever raised it or an issue combined into it. */
function askers(state: StructorCheckState, issue: StructorIssue): string[] {
  const ids = state.issues.filter(i => currentIssue(state, i).id === issue.id).map(i => i.bidderId);
  return [...new Set(ids.filter((b): b is string => !!b))];
}
const lastNumber = (numbers: string[], stored: number) => Math.max(stored || 0, ...numbers.map(n => Number(n.replace(/\D/g, "")) || 0));

// ── Reading ─────────────────────────────────────────────────────────────────

export type IssueFilter = { trade?: string; severity?: Severity; status?: IssueStatus; origin?: IssueOrigin; query?: string };

/** The Structor Check table, filtered. Most severe first, then newest. */
export function filterIssues(state: StructorCheckState, filter: IssueFilter = {}): StructorIssue[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  const rank = { high: 0, medium: 1, low: 2 };
  return state.issues
    .filter(i => (!filter.trade || i.trade === filter.trade) && (!filter.severity || i.severity === filter.severity)
      && (!filter.status || i.status === filter.status) && (!filter.origin || i.origin === filter.origin)
      && (!q || `${i.number} ${i.title} ${i.detail} ${i.source} ${i.crossReference} ${i.trade}`.toLowerCase().includes(q)))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.createdAt.localeCompare(a.createdAt));
}

/** Trades that have issues, for the filter. */
export const issueTrades = (state: StructorCheckState): string[] => [...new Set(state.issues.map(i => i.trade).filter(Boolean))].sort();

export type CheckSummary = {
  pendingReview: number; open: number; openHigh: number; inRfi: number;
  awaitingApproval: number; readyToSend: number; awaitingResponse: number; overdue: number; answeredNotShared: number;
};

/** Headline counts. `today` is yyyy-mm-dd; an RFI is overdue when sent, unanswered and past its due date. */
export function checkSummary(state: StructorCheckState, today: string): CheckSummary {
  const open = state.issues.filter(i => i.status === "open");
  const waiting = state.rfis.filter(r => r.status === "sent");
  return {
    pendingReview: state.issues.filter(i => i.status === "pending-review").length,
    open: open.length, openHigh: open.filter(i => i.severity === "high").length,
    inRfi: state.issues.filter(i => i.status === "in-rfi").length,
    awaitingApproval: state.rfis.filter(r => r.status === "draft").length,
    readyToSend: state.rfis.filter(r => r.status === "approved").length,
    awaitingResponse: waiting.length, overdue: waiting.filter(r => r.due && r.due < today).length,
    answeredNotShared: state.rfis.filter(r => r.status === "answered" && !r.shares.length).length,
  };
}

/** Marcel's RFI log rows (sent RFIs only): RFI #, discipline, question, submitted by, date submitted, response, response date. */
export const rfiLog = (state: StructorCheckState) => state.rfis.filter(r => r.sentAt).map(r => ({
  rfiId: r.id, number: r.number, discipline: r.discipline, question: r.question, submittedBy: r.sentBy ?? "", dateSubmitted: r.sentAt?.slice(0, 10) ?? "",
  response: r.response?.text ?? "", responseDate: r.response?.at.slice(0, 10) ?? "", status: r.status,
}));

/**
 * What a subcontractor sees in its portal: the questions it raised (`current` is the issue it was
 * combined into, if any; `rfi` only once that RFI has been sent), and RFI answers shared with it.
 */
export function portalRfis(state: StructorCheckState, bidderId: string) {
  return {
    questions: state.issues.filter(i => i.bidderId === bidderId).map(i => {
      const current = currentIssue(state, i);
      const rfi = current.rfiId ? state.rfis.find(r => r.id === current.rfiId && r.sentAt) ?? null : null;
      return { issue: i, current, rfi };
    }),
    shared: state.rfis.filter(r => r.shares.some(s => s.bidderId === bidderId)),
  };
}

// ── Issues ──────────────────────────────────────────────────────────────────

function validIssue(input: IssueInput): void {
  const errors: RfiErrors = {};
  if (!input.title?.trim()) errors.title = "Describe the issue.";
  if (!SEVERITIES.includes(input.severity)) errors.severity = "Choose high, medium, or low.";
  if (Object.keys(errors).length) fail(errors);
}

/**
 * A new issue in the log. The team's own by default (reviewed by `by` as it is added); pass origin
 * "email" for one received by email. Origin "ai" or "subcontractor" waits for contractor review.
 */
export function addIssue(state: StructorCheckState, input: IssueInput, by: string, at = now()): StructorCheckState {
  validIssue(input);
  const n = lastNumber(state.issues.map(i => i.number), state.lastIssueNumber) + 1;
  const origin = input.origin ?? "team";
  const waits = needsReview(origin);
  const issue: StructorIssue = {
    id: newId(), number: `SC-${pad(n)}`, title: input.title.trim(), detail: input.detail?.trim() ?? "", category: input.category?.trim() || "Question",
    severity: input.severity, trade: input.trade?.trim() ?? "", packageId: input.packageId || null, source: input.source?.trim() ?? "",
    crossReference: input.crossReference?.trim() ?? "", origin, raisedBy: input.raisedBy?.trim() || by, bidderId: null,
    status: waits ? "pending-review" : "open", reviewedBy: waits ? null : by, reviewedAt: waits ? null : at, combinedInto: null,
    rfiId: null, resolution: null, createdAt: at, updatedAt: at,
  };
  return { ...state, lastIssueNumber: n, issues: [...state.issues, issue] };
}

/** Editable while waiting for review or open. Who raised it (origin, raisedBy) never changes. */
export function editIssue(state: StructorCheckState, id: string, patch: Partial<IssueInput>, at = now()): StructorCheckState {
  const issue = findIssue(state, id);
  if (issue.status !== "open" && issue.status !== "pending-review") fail({ issue: `${issue.number} is ${issue.status === "in-rfi" ? "in an RFI" : issue.status}; it can't be edited now.` });
  const merged = { ...issue, ...patch } as IssueInput & StructorIssue;
  validIssue(merged);
  return putIssue(state, {
    ...issue, title: merged.title.trim(), detail: merged.detail?.trim() ?? "", category: merged.category?.trim() || issue.category, severity: merged.severity,
    trade: merged.trade?.trim() ?? "", packageId: merged.packageId || null, source: merged.source?.trim() ?? "", crossReference: merged.crossReference?.trim() ?? "", updatedAt: at,
  });
}

/** The contractor's review: an AI or subcontractor issue joins the reviewed log. */
export function approveIssue(state: StructorCheckState, id: string, by: string, at = now()): StructorCheckState {
  const issue = findIssue(state, id);
  if (issue.status !== "pending-review") fail({ issue: `${issue.number} is not waiting for review.` });
  if (!by?.trim()) fail({ issue: "Say who reviewed it." });
  return putIssue(state, { ...issue, status: "open", reviewedBy: by.trim(), reviewedAt: at, updatedAt: at });
}

/**
 * Combines reviewed duplicates into one: the others become "combined" and point to `keepId`, whose
 * detail, sources and cross-references gain theirs; it takes the highest severity. Subcontractors
 * who raised any of them still get the answer.
 */
export function combineIssues(state: StructorCheckState, keepId: string, otherIds: string[], by: string, at = now()): StructorCheckState {
  const keep = findIssue(state, keepId);
  const others = [...new Set(otherIds)].filter(id => id !== keepId).map(id => findIssue(state, id));
  if (!others.length) fail({ issueIds: "Choose the issues to combine into this one." });
  for (const i of [keep, ...others]) {
    if (i.status === "pending-review") fail({ issueIds: `${i.number} needs contractor review first.` });
    if (i.status !== "open") fail({ issueIds: `${i.number} is ${i.status === "in-rfi" ? "in an RFI" : i.status}; only open issues can be combined.` });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  const join = (values: string[]) => [...new Set(values.flatMap(v => v.split("; ")).map(v => v.trim()).filter(Boolean))].join("; ");
  const all = [keep, ...others];
  const merged: StructorIssue = {
    ...keep,
    detail: [keep.detail, ...others.map(o => `${o.number}: ${o.title}${o.detail ? ` — ${o.detail}` : ""}`)].filter(Boolean).join("\n\n"),
    severity: all.reduce((s, i) => rank[i.severity] < rank[s] ? i.severity : s, keep.severity),
    source: join(all.map(i => i.source)), crossReference: join(all.map(i => i.crossReference)), updatedAt: at,
  };
  const ids = new Set(others.map(o => o.id));
  return {
    ...state,
    issues: state.issues.map(i => i.id === keep.id ? merged
      : ids.has(i.id) ? { ...i, status: "combined" as const, combinedInto: keep.id, resolution: { note: `Combined into ${keep.number}.`, by, at }, updatedAt: at } : i),
  };
}

/**
 * Closes an issue without an RFI: "resolved" (answered by the team) or "dismissed" (not a real
 * issue). Closing one that waits for review is the contractor's review. Subcontractors who raised
 * it (or an issue combined into it) are told the answer.
 */
export function closeIssue(state: StructorCheckState, id: string, outcome: "resolved" | "dismissed", note: string, by: string, at = now()): StructorCheckState {
  const issue = findIssue(state, id);
  if (issue.status !== "open" && issue.status !== "pending-review") fail({ issue: `${issue.number} is not open.` });
  if (outcome !== "resolved" && outcome !== "dismissed") fail({ issue: "Resolve or dismiss the issue." });
  if (!note?.trim()) fail({ note: outcome === "resolved" ? "Write the answer." : "Say why it is dismissed." });
  const next = putIssue(state, {
    ...issue, status: outcome, resolution: { note: note.trim(), by, at }, updatedAt: at,
    reviewedBy: issue.reviewedBy ?? by, reviewedAt: issue.reviewedAt ?? at,
  });
  return outcome === "resolved"
    ? withNotes(next, askers(state, issue).map(bidderId => ({ kind: "question-resolved" as const, recipientType: "bidder" as const, recipient: bidderId, text: `Answer to your question "${issue.title}": ${note.trim()}`, at, issueId: issue.id, rfiId: null })))
    : next;
}

/** A resolved, dismissed or combined issue back to open (reviewed). Issues inside an RFI follow the RFI instead. */
export function reopenIssue(state: StructorCheckState, id: string, at = now()): StructorCheckState {
  const issue = findIssue(state, id);
  if (issue.status === "open" || issue.status === "pending-review") return state;
  if (issue.status === "in-rfi") fail({ issue: `${issue.number} is part of an RFI.` });
  return putIssue(state, { ...issue, status: "open", combinedInto: null, resolution: null, updatedAt: at });
}

/**
 * A subcontractor's question from the portal. It lands in the same log (origin "subcontractor")
 * waiting for contractor review; the package owner is told.
 */
export function raiseSubcontractorQuestion(
  state: StructorCheckState, procurement: Procurement,
  input: { invitationId: string; company: string; title: string; detail?: string; source?: string }, at = now(),
): StructorCheckState {
  const invitation = procurement.invitations.find(i => i.id === input.invitationId);
  if (!invitation || invitation.status === "declined") fail({ invitation: "Only an active invitation can raise questions." });
  const pkg = procurement.packages.find(p => p.id === invitation!.packageId);
  const next = addIssue(state, {
    title: input.title, detail: input.detail, source: input.source, category: "Question", severity: "medium",
    trade: pkg ? `${pkg.division} · ${pkg.name}` : "", packageId: pkg?.id ?? null, origin: "subcontractor", raisedBy: input.company,
  }, input.company, at);
  const issue = { ...next.issues[next.issues.length - 1], bidderId: invitation!.bidderId };
  return withNotes(putIssue(next, issue), pkg?.owner ? [{ kind: "question-raised", recipientType: "team", recipient: pkg.owner, text: `${input.company} asked a question on ${pkg.name}: "${issue.title}". It is waiting for your review.`, at, issueId: issue.id, rfiId: null }] : []);
}

// ── RFIs ────────────────────────────────────────────────────────────────────

function validRfi(state: StructorCheckState, input: RfiInput, rfiId: string | null): void {
  const errors: RfiErrors = {};
  const ids = [...new Set(input.issueIds ?? [])];
  if (!ids.length) errors.issueIds = "Choose at least one issue.";
  for (const id of ids) {
    const issue = state.issues.find(i => i.id === id);
    if (!issue) { errors.issueIds = "An issue no longer exists."; break; }
    const mine = rfiId !== null && issue.rfiId === rfiId;
    if (issue.status === "pending-review" || !reviewed(issue)) { errors.issueIds = `${issue.number} needs contractor review first.`; break; }
    if (issue.status !== "open" && !mine) { errors.issueIds = `${issue.number} is ${issue.status === "in-rfi" ? "already in an RFI" : issue.status}.`; break; }
  }
  if (!input.question?.trim()) errors.question = "Write the question for the design team.";
  if (!input.to?.name?.trim()) errors.to = "Say who the RFI goes to.";
  if (input.to?.email?.trim() && !EMAIL.test(input.to.email.trim())) errors.email = "Enter a valid email address.";
  if (input.due && !ISO_DATE.test(input.due)) errors.due = "Use a valid date.";
  if (Object.keys(errors).length) fail(errors);
}

const cleanTo = (to: DesignTeamContact): DesignTeamContact => ({ name: to.name.trim(), company: to.company?.trim() ?? "", email: to.email?.trim() ?? "" });

/** Packages reviewed open issues into a draft RFI. The addressee becomes the project's default design team. */
export function createRfi(state: StructorCheckState, input: RfiInput, by: string, at = now()): StructorCheckState {
  validRfi(state, input, null);
  const ids = [...new Set(input.issueIds)];
  const first = findIssue(state, ids[0]);
  const n = lastNumber(state.rfis.map(r => r.number), state.lastRfiNumber) + 1;
  const rfi: Rfi = {
    id: newId(), number: `RFI-${pad(n)}`, subject: input.subject?.trim() || first.title, question: input.question.trim(),
    discipline: input.discipline?.trim() || first.trade, issueIds: ids, to: cleanTo(input.to), due: input.due ?? "", status: "draft",
    createdAt: at, createdBy: by, approvedAt: null, approvedBy: null, sentAt: null, sentBy: null, response: null, shares: [], closedAt: null, closedBy: null,
  };
  return {
    ...state, lastRfiNumber: n, designTeam: rfi.to, rfis: [...state.rfis, rfi],
    issues: state.issues.map(i => ids.includes(i.id) ? { ...i, status: "in-rfi" as const, rfiId: rfi.id, updatedAt: at } : i),
  };
}

/** Changes a draft or approved RFI, including which issues it carries. An approved one goes back to draft. */
export function editRfi(state: StructorCheckState, id: string, patch: Partial<RfiInput>, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status !== "draft" && rfi.status !== "approved") fail({ rfi: `${rfi.number} has been sent; record the answer or close it instead.` });
  const merged: RfiInput = { issueIds: rfi.issueIds, subject: rfi.subject, question: rfi.question, discipline: rfi.discipline, to: rfi.to, due: rfi.due, ...patch };
  validRfi(state, merged, rfi.id);
  const ids = [...new Set(merged.issueIds)];
  const next: Rfi = { ...rfi, status: "draft", approvedAt: null, approvedBy: null, issueIds: ids, subject: merged.subject?.trim() || rfi.subject, question: merged.question.trim(), discipline: merged.discipline?.trim() ?? "", to: cleanTo(merged.to), due: merged.due ?? "" };
  return {
    ...putRfi(state, next),
    issues: state.issues.map(i => ids.includes(i.id) ? { ...i, status: "in-rfi" as const, rfiId: rfi.id, updatedAt: at }
      : i.rfiId === rfi.id ? { ...i, status: "open" as const, rfiId: null, updatedAt: at } : i),
  };
}

/** Deletes an unsent (draft or approved) RFI; its issues go back to open. */
export function discardRfi(state: StructorCheckState, id: string, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status !== "draft" && rfi.status !== "approved") fail({ rfi: `${rfi.number} has been sent and stays in the log.` });
  return { ...state, rfis: state.rfis.filter(r => r.id !== id), issues: state.issues.map(i => i.rfiId === id ? { ...i, status: "open" as const, rfiId: null, updatedAt: at } : i) };
}

/** The contractor approves the package as ready to send. Its issues must all be reviewed and it needs the design team's email. */
export function approveRfi(state: StructorCheckState, id: string, by: string, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status !== "draft") fail({ rfi: rfi.status === "approved" ? `${rfi.number} is already approved.` : `${rfi.number} was already sent.` });
  if (!by?.trim()) fail({ rfi: "Say who approved it." });
  validRfi(state, rfi, rfi.id);
  if (!EMAIL.test(rfi.to.email)) fail({ email: "Add the design team's email address before approving." });
  return putRfi(state, { ...rfi, status: "approved", approvedBy: by.trim(), approvedAt: at });
}

/** Records sending an approved RFI to the design team (nothing is emailed). */
export function sendRfi(state: StructorCheckState, id: string, by: string, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status === "draft") fail({ rfi: `The contractor must approve ${rfi.number} before it is sent.` });
  if (rfi.status !== "approved") fail({ rfi: `${rfi.number} was already sent.` });
  return withNotes(putRfi(state, { ...rfi, status: "sent", sentAt: at, sentBy: by }),
    [{ kind: "rfi-sent", recipientType: "design-team", recipient: rfi.to.email, text: `${rfi.number}: ${rfi.subject}${rfi.due ? ` (answer requested by ${rfi.due})` : ""}`, at, issueId: null, rfiId: rfi.id }]);
}

/** The design team's answer. The owners of the affected trade packages are told. */
export function recordRfiResponse(state: StructorCheckState, procurement: Procurement, id: string, response: { text: string; by: string }, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status !== "sent" && rfi.status !== "answered") fail({ rfi: rfi.status === "closed" ? `${rfi.number} is closed.` : "Send the RFI before recording an answer." });
  if (!response.text?.trim()) fail({ response: "Enter the design team's answer." });
  const owners = [...new Set(affectedPackages(state, rfi).map(p => procurement.packages.find(x => x.id === p)?.owner).filter((o): o is string => !!o))];
  return withNotes(putRfi(state, { ...rfi, status: "answered", response: { text: response.text.trim(), by: response.by?.trim() || rfi.to.name, at } }),
    owners.map(owner => ({ kind: "rfi-answered" as const, recipientType: "team" as const, recipient: owner, text: `${rfi.number} was answered: ${rfi.subject}`, at, issueId: null, rfiId: rfi.id })));
}

const affectedPackages = (state: StructorCheckState, rfi: Rfi) =>
  [...new Set(rfi.issueIds.map(id => state.issues.find(i => i.id === id)?.packageId).filter((p): p is string => !!p))];

/**
 * Shares the answer with the subcontractors concerned: every active (not declined) invitee of the
 * affected trade packages, plus any subcontractor who raised one of its issues (or an issue combined
 * into one). Each company is
 * told once per RFI.
 */
export function shareRfiResponse(state: StructorCheckState, procurement: Procurement, id: string, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status !== "answered" && rfi.status !== "closed") fail({ rfi: "Record the design team's answer before sharing it." });
  const packages = affectedPackages(state, rfi);
  const targets = new Map<string, string | null>();
  for (const inv of procurement.invitations) if (packages.includes(inv.packageId) && inv.status !== "declined") targets.set(inv.bidderId, inv.packageId);
  for (const issueId of rfi.issueIds) {
    const i = state.issues.find(x => x.id === issueId);
    if (i) for (const bidderId of askers(state, i)) if (!targets.has(bidderId)) targets.set(bidderId, i.packageId);
  }
  const already = new Set(rfi.shares.map(s => s.bidderId));
  const fresh = [...targets].filter(([bidderId]) => !already.has(bidderId));
  if (!fresh.length) fail({ rfi: targets.size ? "Everyone concerned already has this answer." : "No subcontractors are invited to the affected trades yet." });
  return withNotes(putRfi(state, { ...rfi, shares: [...rfi.shares, ...fresh.map(([bidderId, packageId]) => ({ bidderId, packageId, at }))] }),
    fresh.map(([bidderId]) => ({ kind: "answer-shared" as const, recipientType: "bidder" as const, recipient: bidderId, text: `${rfi.number} answered: ${rfi.subject} — ${rfi.response!.text}`, at, issueId: null, rfiId: rfi.id })));
}

/** Closes an answered RFI and resolves its issues with a pointer to it. */
export function closeRfi(state: StructorCheckState, id: string, by: string, at = now()): StructorCheckState {
  const rfi = findRfi(state, id);
  if (rfi.status !== "answered") fail({ rfi: rfi.status === "closed" ? `${rfi.number} is already closed.` : "Only an answered RFI can be closed." });
  return {
    ...putRfi(state, { ...rfi, status: "closed", closedAt: at, closedBy: by }),
    issues: state.issues.map(i => i.rfiId === rfi.id ? { ...i, status: "resolved" as const, resolution: { note: `Answered in ${rfi.number}: ${rfi.response!.text}`, by, at }, updatedAt: at } : i),
  };
}

export function markRfiNotificationsRead(state: StructorCheckState, ids: string[]): StructorCheckState {
  const read = new Set(ids);
  return { ...state, notifications: state.notifications.map(n => read.has(n.id) ? { ...n, read: true } : n) };
}
