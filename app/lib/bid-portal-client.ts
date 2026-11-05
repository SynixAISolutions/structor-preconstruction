"use client";

import { upload } from "@vercel/blob/client";
import { bidFilePath, bidFileType, type BidDocument, type PortalBidView } from "./bid-portal";
import { MAX_RANGE_BYTES } from "./project-files";
import type { Submission, SubmissionIssue } from "./submissions";

export class PortalRequestError extends Error {
  readonly status: number;
  readonly issues: SubmissionIssue[];
  constructor(message: string, status: number, issues: SubmissionIssue[] = []) { super(message); this.name = "PortalRequestError"; this.status = status; this.issues = issues; }
}

const route = (token: string, path = "") => `/api/portal/bid${path}?t=${encodeURIComponent(token)}`;
async function answer<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new PortalRequestError(body.error || "That didn't go through. Please try again.", response.status, body.issues ?? []);
  return body as T;
}

export const loadBid = async (token: string) => (await answer<{ view: PortalBidView }>(await fetch(route(token), { cache: "no-store" }))).view;

/** One action on the bid: "save", "submit", "message", "decline", "attach" or "remove-file". */
export const bidAction = async (token: string, body: Record<string, unknown>) =>
  answer<{ view?: PortalBidView; submission?: Submission }>(await fetch(route(token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

export const bidFileUrl = (token: string, id: string) => `${route(token, "/file")}&id=${encodeURIComponent(id)}`;

/** Sends a proposal file straight to the private store, then records it on the bid. */
export async function uploadBidFile(token: string, submission: Submission, file: File, onProgress?: (percent: number) => void): Promise<Submission> {
  const stored = await upload(bidFilePath(submission.projectId, submission.invitationId, crypto.randomUUID(), file.name), file, {
    access: "private", handleUploadUrl: route(token, "/upload"), contentType: bidFileType(file.name, file.type), multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: event => onProgress?.(Math.round(event.percentage)),
  });
  const { submission: saved } = await bidAction(token, { action: "attach", file: { name: file.name, size: file.size, type: bidFileType(file.name, file.type), storageKey: stored.pathname } });
  return saved!;
}

/** Downloads a bid document piece by piece and joins it, because one server response can't carry a whole drawing set. */
export async function downloadBidDocument(token: string, doc: BidDocument, onProgress: (percent: number) => void): Promise<void> {
  const parts: Blob[] = [];
  for (let start = 0; start < doc.size; start += MAX_RANGE_BYTES) {
    const end = Math.min(doc.size, start + MAX_RANGE_BYTES) - 1;
    const response = await fetch(`${route(token, "/document")}&doc=${encodeURIComponent(doc.id)}`, { headers: { range: `bytes=${start}-${end}` } });
    if (response.status !== 206) throw new Error("The document could not be downloaded. Please try again.");
    parts.push(await response.blob());
    onProgress(Math.round(((end + 1) / doc.size) * 100));
  }
  const url = URL.createObjectURL(new Blob(parts, { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = doc.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The estimator's side: a private link for an invitation. The invitation reaches the shared copy a few seconds after it's made, so this waits for it. */
export async function requestPortalLink(input: { projectId: string; invitationId: string; projectName: string; company: string; contact: string; email: string; by: string }): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch("/api/bid-portal/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return `${window.location.origin}${body.path}`;
    if (!body.saving || attempt >= 7) throw new Error(body.error || "The link could not be made. Try again.");
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
}

export async function revokePortalLink(input: { projectId: string; invitationId: string; by: string }): Promise<void> {
  const response = await fetch("/api/bid-portal/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, action: "revoke" }) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "The link could not be turned off. Try again.");
}
