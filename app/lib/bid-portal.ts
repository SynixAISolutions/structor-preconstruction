// The subcontractor portal (Marcel, 24 Oct: "Subs only see their own portal page and submit their proposal and bid form
// there", with messages back and forth like BuildingConnected). A sub opens a private link with no account. Their bid
// goes into the project's own "submissions" draft, so Bid leveling, the buyout tracker and best and final offers read
// it like any other. This file holds what they may see and do. Pure; used by the routes and the page.

import { markInvitationSubmitted, setInvitationStatus, type Procurement, type ProcurementNotification, type PublishedForm } from "./procurement";
import { addAttachment, invitationIssues, openSubmission, removeAttachment, sanitizeBidContent, submissionFor, submitBid, updateDraft, type AttachmentMeta, type Submission, type Submitter } from "./submissions";

/** Drafts this adds to a project's shared saving. */
export const BID_MESSAGES_KEY = "bid-messages", PORTAL_INVITES_KEY = "portal-invites";
/** A private link lasts long enough for a bid, its revisions and a best and final. It can be turned off sooner. */
export const PORTAL_LINK_DAYS = 180;

export type BidMessage = { id: string; invitationId: string; packageId: string; bidderId: string; from: "subcontractor" | "contractor"; author: string; text: string; at: string; read: boolean };
/** One invitation's private link. What the app knows about the company comes from the estimator who made it. */
export type PortalInvite = { id: string; projectName: string; company: string; contact: string; email: string; issuedAt: string; issuedBy: string; revoked: boolean };
export type BidDocument = { id: string; name: string; category: string; size: number; pageCount: number; revision: number };

/** Everything a sub's page shows, and nothing about anyone else's bid, the budget or the estimator's notes. */
export type PortalBidView = {
  projectName: string;
  company: { name: string; contact: string; email: string };
  package: { name: string; code: string; due: string; owner: string };
  invitation: { id: string; status: string };
  form: Pick<PublishedForm, "version" | "items"> | null;
  /** Why they can't bid right now; empty when they can. */
  blockers: string[];
  submission: Submission | null;
  messages: BidMessage[];
  documents: BidDocument[];
};

export class PortalRuleError extends Error { constructor(message: string) { super(message); this.name = "PortalRuleError"; } }
/** The bid changed since this page loaded it: another window, probably. */
export class PortalConflict extends Error { constructor() { super("This bid changed in another window. Reload the page to see the latest."); this.name = "PortalConflict"; } }
const fail = (message: string): never => { throw new PortalRuleError(message); };
const now = () => new Date().toISOString();

// Where a stored file's path says it lives. A sub's file only counts inside their own invitation's folder.
const unsafe = /[^\w.-]+/g;
export const bidFileFolder = (projectId: string, invitationId: string) => `bid-files/${projectId}/${invitationId}/`;
export const bidFilePath = (projectId: string, invitationId: string, fileId: string, name: string) =>
  `${bidFileFolder(projectId, invitationId)}${fileId}/${name.normalize("NFKD").replace(unsafe, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120) || "file"}`;
export function validBidFilePath(path: string, projectId: string, invitationId: string): boolean {
  const folder = bidFileFolder(projectId, invitationId);
  return path.startsWith(folder) && /^[\w-]{8,60}\/[\w.-]{1,120}$/.test(path.slice(folder.length));
}
export const BID_FILE_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "image/png", "image/jpeg", "application/zip", "application/x-zip-compressed"];
const BY_EXTENSION: Record<string, string> = { pdf: "application/pdf", xlsx: BID_FILE_TYPES[1], xls: "application/vnd.ms-excel", csv: "text/csv", docx: BID_FILE_TYPES[4], doc: "application/msword", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", zip: "application/zip" };
/** A file's type as the store takes it: some systems give a CSV or ZIP an empty or odd one. */
export const bidFileType = (name: string, type: string) => BID_FILE_TYPES.includes(type) ? type : BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? type;

/** Files in a sub's view carry no storage path; they're fetched by their id, through their link. */
const hidePaths = (files: AttachmentMeta[]) => files.map(f => ({ ...f, storageKey: null }));
export const ownSubmission = (submission: Submission | undefined | null): Submission | null => submission ? {
  ...submission, draft: { ...submission.draft, attachments: hidePaths(submission.draft.attachments) },
  revisions: submission.revisions.map(r => ({ ...r, attachments: hidePaths(r.attachments) })),
} : null;

export function portalView(input: { invite: PortalInvite; procurement: Procurement; submissions: Submission[]; messages: BidMessage[]; documents: BidDocument[]; invitationId: string }): PortalBidView {
  const invitation = input.procurement.invitations.find(i => i.id === input.invitationId) ?? fail("This invitation no longer exists.");
  const pkg = input.procurement.packages.find(p => p.id === invitation.packageId) ?? fail("This trade package no longer exists.");
  return {
    projectName: input.invite.projectName,
    company: { name: input.invite.company, contact: input.invite.contact, email: input.invite.email },
    package: { name: pkg.name, code: pkg.code, due: pkg.due, owner: pkg.owner },
    invitation: { id: invitation.id, status: invitation.status },
    form: pkg.published ? { version: pkg.published.version, items: pkg.published.items } : null,
    blockers: invitationIssues(input.procurement, invitation.id).map(i => i.message),
    submission: ownSubmission(submissionFor(input.submissions, invitation.id)),
    messages: input.messages.filter(m => m.invitationId === invitation.id),
    documents: input.documents,
  };
}

/** The drawings, specifications and addenda a bid is priced on: their latest versions, without the RFP, budget or contracts. */
export function bidDocuments<D extends { id: string; name: string; category: string; size: number; pageCount: number; revision: number; series: string }>(documents: D[]): BidDocument[] {
  const latest = new Map<string, D>();
  for (const doc of documents) if ((latest.get(doc.series)?.revision ?? 0) < doc.revision) latest.set(doc.series, doc);
  return [...latest.values()].filter(d => ["Drawings", "Specifications", "Addenda"].includes(d.category))
    .map(({ id, name, category, size, pageCount, revision }) => ({ id, name, category, size, pageCount, revision }));
}

function tellOwner(procurement: Procurement, packageId: string, kind: ProcurementNotification["kind"], text: string, at: string): Procurement {
  const owner = procurement.packages.find(p => p.id === packageId)?.owner;
  if (!owner) return procurement;
  return { ...procurement, notifications: [...procurement.notifications, { id: crypto.randomUUID(), kind, recipientType: "team", recipient: owner, packageId, text, at, read: false }] };
}

/** Opens the invitation's bid, lining a draft up with the current bid form. Unchanged when the form isn't published. */
export function ensureSubmission(submissions: Submission[], procurement: Procurement, projectId: string, invitationId: string, at = now()): Submission[] {
  return invitationIssues(procurement, invitationId).length ? submissions : openSubmission(submissions, procurement, { projectId, invitationId }, at);
}

const mine = (submissions: Submission[], invitationId: string) => submissionFor(submissions, invitationId) ?? fail("Open your bid again: it isn't ready to save.");

/** Saves what the sub has typed. The form and the files stay the server's: answers to items not on the form are dropped. */
export function saveBidDraft(submissions: Submission[], procurement: Procurement, invitationId: string, content: unknown, expected: unknown, at = now()): Submission[] {
  const issues = invitationIssues(procurement, invitationId);
  if (issues.length) fail(issues[0].message);
  const current = mine(submissions, invitationId);
  if (expected !== current.updatedAt) throw new PortalConflict();
  const clean = sanitizeBidContent(content);
  const form = procurement.packages.find(p => p.id === current.packageId)!.published!;
  const answers = new Map(clean.responses.map(r => [r.scopeItemId, r]));
  if (clean.baseBid !== null && (clean.baseBid < 0 || clean.baseBid > 1e11)) fail("Check the base bid.");
  return updateDraft(submissions, current.id, {
    baseBid: clean.baseBid, exclusions: clean.exclusions, alternates: clean.alternates, clarifications: clean.clarifications,
    responses: form.items.map(item => answers.get(item.id) ?? { scopeItemId: item.id, answer: null, note: "" }),
  }, at);
}

/** Once they've started, the estimator sees they're bidding. */
export const markBidding = (procurement: Procurement, invitationId: string): Procurement =>
  procurement.invitations.find(i => i.id === invitationId)?.status === "invited" ? setInvitationStatus(procurement, invitationId, "bidding") : procurement;

/** Submits the bid as its next revision. submitBid checks every rule. */
export const submitPortalBid = (submissions: Submission[], procurement: Procurement, invitationId: string, submitter: Submitter, at = now()): Submission[] =>
  submitBid(submissions, procurement, mine(submissions, invitationId).id, submitter, at);

/** A bid came in: the invitation says so, and the trade's owner is told. */
export function recordBidSubmitted(procurement: Procurement, invitationId: string, revision: number, company: string, at = now()): Procurement {
  const packageId = procurement.invitations.find(i => i.id === invitationId)?.packageId ?? "";
  const trade = procurement.packages.find(p => p.id === packageId)?.name ?? "the trade";
  return tellOwner(markInvitationSubmitted(procurement, invitationId), packageId, "bid-received", `${company} submitted ${revision > 1 ? `a revised bid (V${revision})` : "a bid"} for ${trade}.`, at);
}

export function declineInvitation(procurement: Procurement, invitationId: string, company: string, at = now()): Procurement {
  const invitation = procurement.invitations.find(i => i.id === invitationId) ?? fail("This invitation no longer exists.");
  if (invitation.status === "submitted") fail("Your bid is already in. Message the estimator to withdraw it.");
  const trade = procurement.packages.find(p => p.id === invitation.packageId)?.name ?? "the trade";
  return tellOwner(setInvitationStatus(procurement, invitationId, "declined"), invitation.packageId, "bid-declined", `${company} declined to bid on ${trade}.`, at);
}

/** Tells the trade's owner that a sub wrote. */
export const tellOwnerOfMessage = (procurement: Procurement, invitationId: string, company: string, at = now()): Procurement => {
  const packageId = procurement.invitations.find(i => i.id === invitationId)?.packageId;
  return packageId ? tellOwner(procurement, packageId, "bid-message", `${company} sent a message about ${procurement.packages.find(p => p.id === packageId)?.name ?? "the trade"}.`, at) : procurement;
};

/** A message on an invitation's thread, from either side. Text only, and only on an invitation that exists. */
export function addBidMessage(messages: BidMessage[], procurement: Procurement, invitationId: string, input: { from: BidMessage["from"]; author: unknown; text: unknown }, at = now()): BidMessage[] {
  const invitation = procurement.invitations.find(i => i.id === invitationId) ?? fail("This invitation no longer exists.");
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const author = typeof input.author === "string" ? input.author.trim().slice(0, 120) : "";
  if (!text) fail("Write your message first.");
  if (text.length > 4000) fail("Keep a message under 4,000 characters.");
  if (!author) fail("Enter your name.");
  return [...messages, { id: crypto.randomUUID(), invitationId, packageId: invitation.packageId, bidderId: invitation.bidderId, from: input.from, author, text, at, read: false }];
}

/** The estimator opened the thread: the sub's messages on it are read. */
export function markMessagesRead(messages: BidMessage[], invitationId: string): BidMessage[] {
  return messages.some(m => m.invitationId === invitationId && m.from === "subcontractor" && !m.read)
    ? messages.map(m => m.invitationId === invitationId && m.from === "subcontractor" ? { ...m, read: true } : m) : messages;
}
export const unreadMessages = (messages: BidMessage[], invitationId: string) => messages.filter(m => m.invitationId === invitationId && m.from === "subcontractor" && !m.read).length;

/** Records a file already stored in the sub's own folder on their draft. */
export function attachBidFile(submissions: Submission[], projectId: string, invitationId: string, file: { name?: unknown; size?: unknown; type?: unknown; storageKey?: unknown }, at = now()): Submission[] {
  const current = mine(submissions, invitationId);
  const storageKey = typeof file.storageKey === "string" ? file.storageKey : "";
  if (!validBidFilePath(storageKey, projectId, invitationId)) fail("That file isn't in your bid's folder.");
  return addAttachment(submissions, current.id, { name: String(file.name ?? ""), size: Number(file.size) || 0, type: String(file.type ?? ""), storageKey }, at);
}
export const removeBidFile = (submissions: Submission[], invitationId: string, attachmentId: string, at = now()): Submission[] =>
  removeAttachment(submissions, mine(submissions, invitationId).id, attachmentId, at);

/** A file on a bid, in its draft or any revision it was submitted with. */
export function findBidFile(submissions: Submission[], invitationId: string, attachmentId: string): AttachmentMeta | null {
  const submission = submissionFor(submissions, invitationId);
  return submission ? [...submission.draft.attachments, ...submission.revisions.flatMap(r => r.attachments)].find(a => a.id === attachmentId && a.storageKey) ?? null : null;
}
