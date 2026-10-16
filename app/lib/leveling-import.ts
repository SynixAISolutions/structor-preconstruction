// Brings browser-saved submitted bids into Bid leveling (demo, data only).
//
// Input: the project's procurement record, its submissions and the bidder directory.
// Output: a leveling workspace — project, scope items and bidders in the exact shapes
// app/leveling-workspace.tsx uses — plus provenance and review extras per bidder, and issues.
//
// Rules:
// - Only submissions with a submitted revision enter; drafts never do.
// - The latest revision is used unless another is chosen; its number, form version,
//   submitter, time and all ids are kept as provenance.
// - Scope items are the package's CURRENT published bid form.
// - Answers keep their Y/N/P/N-A code and note. Nothing is approved on the estimator's
//   behalf: every response carries explicit resolved:false and adjustmentApproved:false
//   (the workspace would otherwise default missing flags to approved), adjustments are 0.
// - A revision that answers an older form version stays visible but is marked
//   sourceEligibility "INCOMPLETE", so the leveling engine can never rank it.
// Pure: no storage, no network, no runtime imports.

import type { DirectoryCompany, Procurement, TradePackage } from "./procurement";
import type { Alternate, AttachmentMeta, Submission, SubmittedRevision, Submitter } from "./submissions";

// Shapes of app/leveling-workspace.tsx (kept structurally identical).
export type LevelingStatus = "" | "Y" | "N" | "P" | "N/A";
export type LevelingResponse = { status: LevelingStatus; note: string; adjustment: number; resolved?: boolean; adjustmentApproved?: boolean };
export type LevelingScopeItem = { id: string; number: string; description: string; section: string; required: boolean; source: string; estimatorNote: string };
export type LevelingBidder = { id: string; name: string; contact: string; baseBid: number | null; sourceEligibility?: string; responses: Record<string, LevelingResponse> };
export type LevelingProject = { name: string; trade: string; budget: number; isDemo?: boolean };

/** Where a leveling bidder came from, and what the estimator must see beside the grid. */
export type BidProvenance = {
  illustrative?: boolean;
  projectId: string; packageId: string; invitationId: string; bidderId: string; submissionId: string;
  revisionNumber: number; revisionCount: number; formVersion: number; currentFormVersion: number;
  submittedAt: string; submitter: Submitter;
  /** Answers an older bid-form version: shown, never ranked. */
  stale: boolean;
  superseded?: boolean;
  exclusions: string[]; alternates: Alternate[]; clarifications: string[]; attachments: AttachmentMeta[];
  /** Answers given for items that are no longer in the current bid form (stale revisions only). */
  droppedResponses: { scopeItemId: string; answer: string; note: string }[];
};

export type LevelingImportIssueCode =
  | "package-missing" | "package-unpublished" | "no-submitted-bids" | "submission-mismatch" | "revision-missing" | "stale-form" | "superseded-revision" | "unknown-bidder";
export type LevelingImportIssue = { code: LevelingImportIssueCode; message: string; submissionId?: string };

export type LevelingImport = {
  project: LevelingProject;
  items: LevelingScopeItem[];
  bidders: LevelingBidder[];
  /** Keyed by LevelingBidder.id. */
  provenance: Record<string, BidProvenance>;
  issues: LevelingImportIssue[];
};

/** sourceEligibility value that keeps a stale revision out of ranking (the engine treats it as ineligible). */
export const STALE_SOURCE_ELIGIBILITY = "INCOMPLETE";

export type LevelingImportInput = {
  projectId: string;
  projectName: string;
  packageId: string;
  procurement: Procurement;
  submissions: Submission[];
  directory: DirectoryCompany[];
  /** The trade budget, if known; leveling compares totals against it. */
  budget?: number;
  /** Use an earlier revision for a submission instead of its latest: { [submissionId]: revisionNumber }. */
  revisions?: Record<string, number>;
};

const sectionFor = (pkg: TradePackage, allTrades: boolean) => allTrades ? "All trades" : `${pkg.code} · ${pkg.name}`;

export function buildLevelingImport(input: LevelingImportInput): LevelingImport {
  const { procurement, packageId } = input;
  const pkg = procurement.packages.find(p => p.id === packageId);
  const project: LevelingProject = { name: input.projectName, trade: pkg?.name ?? "", budget: input.budget ?? 0, isDemo: false };
  const empty = (issue: LevelingImportIssue): LevelingImport => ({ project, items: [], bidders: [], provenance: {}, issues: [issue] });
  if (!pkg) return empty({ code: "package-missing", message: "That trade package does not exist in this project." });
  const form = pkg.published;
  if (!form) return empty({ code: "package-unpublished", message: `The ${pkg.name} bid form has not been published, so no bids can have been submitted.` });

  const allTrades = new Set(procurement.scopes.filter(s => s.allTrades).map(s => s.id));
  const items: LevelingScopeItem[] = form.items.map((item, index) => ({
    id: item.id, number: String(index + 1), description: item.title, section: sectionFor(pkg, allTrades.has(item.id)),
    required: true, source: item.source || "Not linked yet", estimatorNote: item.detail,
  }));
  const formIds = new Set(form.items.map(item => item.id));

  const issues: LevelingImportIssue[] = [];
  const bidders: LevelingBidder[] = [];
  const provenance: Record<string, BidProvenance> = {};
  const seenInvitations = new Set<string>();
  const mismatch = (submission: Submission, message: string) => issues.push({ code: "submission-mismatch", submissionId: submission.id, message });

  for (const submission of input.submissions.filter(s => s.packageId === packageId && s.revisions.length > 0)) {
    const invitation = procurement.invitations.find(i => i.id === submission.invitationId);
    if (submission.projectId !== input.projectId) { mismatch(submission, "A submission belongs to a different project and was left out."); continue; }
    if (!invitation) { mismatch(submission, "A submission refers to an invitation that no longer exists and was left out."); continue; }
    if (invitation.status === "declined") continue;
    if (invitation.packageId !== submission.packageId || invitation.bidderId !== submission.bidderId) { mismatch(submission, "A submission does not match its invitation and was left out."); continue; }
    if (seenInvitations.has(invitation.id)) { mismatch(submission, "A second submission for the same invitation was left out."); continue; }
    seenInvitations.add(invitation.id);

    const chosen = input.revisions?.[submission.id];
    const revision: SubmittedRevision | undefined = chosen === undefined ? submission.revisions.at(-1) : submission.revisions.find(r => r.number === chosen);
    if (!revision) { issues.push({ code: "revision-missing", submissionId: submission.id, message: `Revision ${chosen} does not exist for this submission, so it was left out.` }); continue; }

    const company = input.directory.find(c => c.id === submission.bidderId);
    if (!company) issues.push({ code: "unknown-bidder", submissionId: submission.id, message: "A bidder is no longer in the directory; its id is shown instead of a company name." });
    const name = company?.company ?? submission.bidderId;
    const stale = revision.formVersion < form.version;
    if (stale) issues.push({ code: "stale-form", submissionId: submission.id, message: `${name} priced bid form version ${revision.formVersion}; the current version is ${form.version}. Shown for reference and not ranked until they resubmit.` });

    const answers = new Map(revision.responses.map(r => [r.scopeItemId, r]));
    const responses: Record<string, LevelingResponse> = Object.fromEntries(form.items.map(item => {
      const answer = answers.get(item.id);
      return [item.id, { status: answer?.answer ?? "", note: answer?.note ?? "", adjustment: 0, resolved: false, adjustmentApproved: false }];
    }));
    const superseded = revision.number !== submission.revisions.at(-1)?.number;
    if (superseded) issues.push({ code: "superseded-revision", submissionId: submission.id, message: `${name}'s revision ${revision.number} is superseded. It is shown for reference and cannot be ranked.` });
    const id = `submission-${submission.id}`;
    bidders.push({ id, name, contact: revision.submitter.name, baseBid: revision.baseBid, ...(stale || superseded ? { sourceEligibility: STALE_SOURCE_ELIGIBILITY } : {}), responses });
    provenance[id] = {
      ...(submission.illustrative ? { illustrative: true } : {}),
      projectId: submission.projectId, packageId: submission.packageId, invitationId: submission.invitationId, bidderId: submission.bidderId, submissionId: submission.id,
      revisionNumber: revision.number, revisionCount: submission.revisions.length, formVersion: revision.formVersion, currentFormVersion: form.version,
      submittedAt: revision.submittedAt, submitter: revision.submitter, stale,
      ...(superseded ? { superseded: true } : {}),
      exclusions: revision.exclusions, alternates: revision.alternates, clarifications: revision.clarifications, attachments: revision.attachments,
      droppedResponses: revision.responses.filter(r => !formIds.has(r.scopeItemId)).map(r => ({ scopeItemId: r.scopeItemId, answer: r.answer ?? "", note: r.note })),
    };
  }

  if (!bidders.length) issues.unshift({ code: "no-submitted-bids", message: issues.length
    ? `None of the submitted bids for ${pkg.name} could be used; see the issues below.`
    : `No submitted bids for ${pkg.name} yet. Drafts are not shown in leveling.` });
  return { project, items, bidders, provenance, issues };
}
