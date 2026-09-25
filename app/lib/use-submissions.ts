"use client";

import { useCallback, useRef } from "react";
import { setInvitationStatus } from "./procurement";
import { useActiveProject } from "./project-scope";
import { SubmissionRuleError, submitBid, type Submission, type SubmissionIssue, type Submitter } from "./submissions";
import { useLocalDraft } from "./use-local-draft";
import { useProcurement } from "./use-procurement";

/**
 * The open project's bid submissions, stored in this browser until a server backend exists
 * (see submission-api.ts). Returns the procurement record too — use it from here rather than
 * calling useProcurement() again in the same screen, or the two copies drift apart.
 *
 *   const issues = run(s => setResponse(s, id, itemId, "P", "Excludes slab removal"));
 *   const issues = submit(id, { name, email });   // [] when sent
 */
export function useSubmissions() {
  const projectId = useActiveProject();
  const { state: procurement, run: runProcurement } = useProcurement();
  const [submissions, setSubmissions] = useLocalDraft<Submission[]>("submissions", []);
  const latest = useRef(submissions);
  latest.current = submissions;

  const run = useCallback((action: (current: Submission[]) => Submission[]): SubmissionIssue[] => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setSubmissions(next); }
      return [];
    } catch (error) {
      if (error instanceof SubmissionRuleError) return error.issues;
      throw error;
    }
  }, [setSubmissions]);

  /** Sends the draft as the next revision and marks the invitation "submitted". */
  const submit = useCallback((submissionId: string, submitter: Submitter): SubmissionIssue[] => {
    const issues = run(current => submitBid(current, procurement, submissionId, submitter));
    if (issues.length) return issues;
    const invitationId = latest.current.find(s => s.id === submissionId)?.invitationId;
    if (invitationId) runProcurement(s => setInvitationStatus(s, invitationId, "submitted"));
    return [];
  }, [run, procurement, runProcurement]);

  return { projectId, procurement, runProcurement, submissions, run, submit };
}
