// Server contract for bid submissions: HTTP request/response shapes and the repository
// interfaces a real backend must implement. TYPES ONLY — no route or storage exists yet,
// because no database, authentication provider or file store is configured.
//
// Once one is chosen, route handlers go in app/api/portal/** and app/api/projects/**, and
// each one: authenticates → loads with the repositories → runs the pure rules from
// submissions.ts (sanitizeBidContent on every body) → saves.
//
// ── Routes ──────────────────────────────────────────────────────────────────
// Bidder (portal session, from the invitation link; only ever sees its own invitation):
//   GET    /api/portal/session                       → PortalView
//   PUT    /api/portal/submission/draft              SaveDraftRequest → SubmissionResponse | 409
//   POST   /api/portal/submission/submit             SubmitRequest    → SubmissionResponse | 422 (issues)
//   POST   /api/portal/submission/attachments        AttachmentUploadRequest → AttachmentUploadResponse
//   DELETE /api/portal/submission/attachments/:id                     → SubmissionResponse
// Estimator (organization session):
//   GET    /api/projects/:projectId/packages/:packageId/submissions   → PackageSubmissionsResponse
//   GET    /api/projects/:projectId/submissions/:submissionId         → SubmissionDetailResponse

import type { Invitation, InvitationStatus, Procurement, PublishedForm, TradePackage } from "./procurement";
import type { AttachmentMeta, BidContent, Submission, SubmissionIssue, SubmittedRevision, Submitter } from "./submissions";

// ── Identity ────────────────────────────────────────────────────────────────

/** A bidder's access, granted by the signed link in their invitation email. Short-lived, one invitation only. */
export type PortalSession = { projectId: string; packageId: string; invitationId: string; bidderId: string; email: string; expiresAt: string };
/** A signed-in member of the general contractor's organization. */
export type OrganizationSession = { userId: string; name: string; email: string; organizationId: string; role: "admin" | "estimator" | "viewer" };

// ── Requests and responses ──────────────────────────────────────────────────

export type ApiErrorCode = "unauthorized" | "forbidden" | "not_found" | "conflict" | "invalid" | "payload_too_large";
/** Every non-2xx response. `issues` accompanies 422 "invalid" from submit. */
export type ApiError = { error: { code: ApiErrorCode; message: string; issues?: SubmissionIssue[] } };

/** What the portal needs to render: the invitation, its package, the form version to answer, and the bidder's submission. */
export type PortalView = {
  projectName: string;
  package: Pick<TradePackage, "id" | "name" | "code" | "due">;
  invitation: Pick<Invitation, "id" | "status">;
  form: PublishedForm;
  submission: Submission | null;
};

/** `expectedUpdatedAt` is the submission's updatedAt when the bidder loaded it (null before the first save). A mismatch returns 409 conflict instead of overwriting. */
export type SaveDraftRequest = { draft: Omit<BidContent, "attachments">; expectedUpdatedAt: string | null };
export type SubmitRequest = { submitter: Submitter; expectedUpdatedAt: string };
export type SubmissionResponse = { submission: Submission };

/** Step 1 of an upload: the server records the attachment and returns a short-lived URL the browser PUTs the bytes to. */
export type AttachmentUploadRequest = { name: string; size: number; type: string };
export type AttachmentUploadResponse = { attachment: AttachmentMeta; upload: { url: string; method: "PUT"; headers: Record<string, string>; expiresAt: string } };

/** The estimator's list: the latest revision per invited company, plus whether it answers an older form. */
export type SubmissionSummary = {
  submissionId: string; invitationId: string; bidderId: string; status: Submission["status"];
  latest: Pick<SubmittedRevision, "number" | "baseBid" | "formVersion" | "submittedAt" | "submitter"> | null;
  exceptionCount: number; stale: boolean;
};
export type PackageSubmissionsResponse = { submissions: SubmissionSummary[] };
export type SubmissionDetailResponse = { submission: Submission; downloads: { attachmentId: string; url: string; expiresAt: string }[] };

// ── Repositories: what the chosen backend must implement ────────────────────

export class ConflictError extends Error {
  constructor(message = "This submission was changed elsewhere. Reload and try again.") { super(message); this.name = "ConflictError"; }
}

export interface SubmissionRepository {
  get(projectId: string, submissionId: string): Promise<Submission | null>;
  findByInvitation(projectId: string, invitationId: string): Promise<Submission | null>;
  listForPackage(projectId: string, packageId: string): Promise<Submission[]>;
  /** Writes only if the stored updatedAt equals `expectedUpdatedAt` (null: must not exist yet); otherwise throws ConflictError. */
  save(submission: Submission, expectedUpdatedAt: string | null): Promise<Submission>;
  /**
   * Saves a newly submitted revision AND sets the invitation's status to "submitted" in ONE
   * transaction, with the same ConflictError rule as save().
   */
  saveSubmitted(submission: Submission, expectedUpdatedAt: string): Promise<Submission>;
}

export interface ProcurementRepository {
  get(projectId: string): Promise<Procurement | null>;
  setInvitationStatus(projectId: string, invitationId: string, status: InvitationStatus): Promise<void>;
}

/** Private object storage for proposal files. Keys come from attachmentStorageKey(). */
export interface AttachmentStore {
  createUpload(key: string, file: { size: number; type: string }): Promise<AttachmentUploadResponse["upload"]>;
  createDownload(key: string): Promise<{ url: string; expiresAt: string }>;
  delete(key: string): Promise<void>;
}

/** Issues and checks the signed invitation links that create a PortalSession. */
export interface PortalLinks {
  issue(session: Omit<PortalSession, "expiresAt">, ttlHours: number): Promise<string>;
  verify(token: string): Promise<PortalSession | null>;
}

/** Sends invitation, publish and revision emails. */
export interface Mailer {
  send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

/** Where an attachment's bytes live: grouped by project and submission, with a filesystem-safe name. */
export function attachmentStorageKey(projectId: string, submissionId: string, attachment: Pick<AttachmentMeta, "id" | "name">): string {
  for (const id of [projectId, submissionId, attachment.id]) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error(`Refusing to build a storage key from the unsafe id "${id}".`);
  }
  const safe = attachment.name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120) || "file";
  return `projects/${projectId}/submissions/${submissionId}/${attachment.id}-${safe}`;
}
