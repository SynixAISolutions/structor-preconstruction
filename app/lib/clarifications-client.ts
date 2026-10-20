"use client";

// Browser calls for clarification requests (Close the gap): the estimator's side (/api/clarifications)
// and the subcontractor's portal (/api/portal/clarification, by signed link). Errors carry the server's
// message; a 409 is a ClarificationConflict holding the stored request, so the screen can reload and
// show what changed.

import { useCallback, useEffect, useState } from "react";
import type { AnswerInput, ClarificationRequest, PortalClarification } from "./clarifications";

export class ClarificationConflict extends Error {
  constructor(message: string, readonly current: ClarificationRequest | PortalClarification | null) { super(message); this.name = "ClarificationConflict"; }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (response.status === 409) throw new ClarificationConflict(body.error ?? "This request changed. Reload and try again.", body.request ?? null);
  if (!response.ok) throw new Error(body.error ?? `The request failed (${response.status}).`);
  return body as T;
}
const post = <T,>(url: string, body: unknown) => call<T>(url, { method: "POST", body: JSON.stringify(body) });

// ── Estimator ────────────────────────────────────────────────────────────────

export const listClarifications = async (projectId: string) =>
  (await call<{ requests: ClarificationRequest[] }>(`/api/clarifications?project=${encodeURIComponent(projectId)}`)).requests;

/** Stores a draft as sent and returns it with the sub's signed link (valid 30 days). Copy the link to the sub; nothing is emailed yet. */
export const sendClarificationRequest = (draft: ClarificationRequest, recipient: { name: string; email: string }, dueAt: string, by: string) =>
  post<{ request: ClarificationRequest; link: string }>("/api/clarifications", { action: "send", request: draft, recipient, dueAt, by });

/** After applyClarification in leveling: the server marks those lines applied (safe to repeat). */
export const recordApplied = async (request: ClarificationRequest, applied: string[], by: string) =>
  (await post<{ request: ClarificationRequest }>("/api/clarifications", { action: "applied", projectId: request.projectId, id: request.id, version: request.version, applied, by })).request;

export const cancelClarificationRequest = async (request: ClarificationRequest, by: string) =>
  (await post<{ request: ClarificationRequest }>("/api/clarifications", { action: "cancel", projectId: request.projectId, id: request.id, version: request.version, by })).request;

/** A fresh signed link for a sent request (to copy again). */
export const clarificationLink = async (request: ClarificationRequest) =>
  (await post<{ link: string }>("/api/clarifications", { action: "link", projectId: request.projectId, id: request.id })).link;

/** The open project's requests from the server; `reload` after sending, applying or cancelling. */
export function useClarifications(projectId: string | null) {
  const [state, setState] = useState<{ requests: ClarificationRequest[]; loading: boolean; error: string | null }>({ requests: [], loading: !!projectId, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!projectId) { setState({ requests: [], loading: false, error: null }); return; }
    let current = true;
    setState(s => ({ ...s, loading: true }));
    listClarifications(projectId)
      .then(requests => { if (current) setState({ requests, loading: false, error: null }); })
      .catch(error => { if (current) setState(s => ({ ...s, loading: false, error: error instanceof Error ? error.message : "Could not load the requests." })); });
    return () => { current = false; };
  }, [projectId, tick]);
  const reload = useCallback(() => setTick(n => n + 1), []);
  return { ...state, reload };
}

// ── Subcontractor portal ────────────────────────────────────────────────────

export const loadPortalClarification = async (token: string) =>
  (await call<{ request: PortalClarification }>(`/api/portal/clarification?t=${encodeURIComponent(token)}`)).request;

/** Saves answers made from `version` (the one loaded); returns the stored request. `by` is the sub's name. */
export const answerPortalClarification = async (token: string, version: number, answers: AnswerInput[], by: string) =>
  (await post<{ request: PortalClarification }>(`/api/portal/clarification?t=${encodeURIComponent(token)}`, { version, answers, by })).request;
