"use client";

import { useCallback, useRef } from "react";
import { sampleProposals } from "./data/proposals";
import { applyReading, ProposalRuleError, type ProposalState } from "./proposal-extraction";
import type { SubmissionIssue } from "./submissions";
import { useLocalDraft } from "./use-local-draft";
import { useSubmissions } from "./use-submissions";

/**
 * The open project's proposal readings, in this browser (demo), under "proposal-readings".
 * Applying one writes the company's submission and its invitation too, so this hook returns those
 * records — use them from here rather than calling useSubmissions() or useProcurement() again in
 * the same screen.
 *
 *   const message = run(s => setReadAnswer(s, id, itemId, "P", "Gym slab only", userName));
 *   const issues = apply(id, userName);   // [] when it became a revision
 */
export function useProposals() {
  const { projectId, procurement, runProcurement, submissions, run: runSubmissions } = useSubmissions();
  const [proposals, setProposals] = useLocalDraft<ProposalState>("proposal-readings", sampleProposals);
  const latest = useRef({ proposals, submissions, procurement });
  latest.current = { proposals, submissions, procurement };

  const run = useCallback((action: (current: ProposalState) => ProposalState): string | null => {
    try {
      const next = action(latest.current.proposals);
      if (next !== latest.current.proposals) { latest.current = { ...latest.current, proposals: next }; setProposals(next); }
      return null;
    } catch (error) {
      if (error instanceof ProposalRuleError) return error.message;
      throw error;
    }
  }, [setProposals]);

  /** Empty when applied; otherwise every reason it can't be, with the bid-form item where there is one. */
  const apply = useCallback((readingId: string, by: string): SubmissionIssue[] => {
    try {
      const next = applyReading(latest.current, readingId, projectId, by);
      latest.current = next;
      setProposals(next.proposals);
      runSubmissions(() => next.submissions);
      runProcurement(() => next.procurement);
      return [];
    } catch (error) {
      if (error instanceof ProposalRuleError) return error.issues.length ? error.issues : [{ field: "invitation", message: error.message }];
      throw error;
    }
  }, [projectId, setProposals, runSubmissions, runProcurement]);

  return { projectId, proposals, submissions, procurement, run, apply };
}
