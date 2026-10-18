"use client";

import { useCallback, useRef } from "react";
import { EMPTY_SETUP, SetupRuleError, projectSetup, type SetupState, type SetupSummary } from "./project-setup";
import { useProjectDocuments } from "./project-files-client";
import type { Project } from "./projects";
import { useBudget } from "./use-budget";
import { useExtraction } from "./use-extraction";
import { useLocalDraft } from "./use-local-draft";
import { useSchedule } from "./use-schedule";

/**
 * The open project's setup guide (lib/project-setup) from its saved state, under "project-setup".
 * `run` applies one action (decide, clearDecision, markReviewed) and returns null or the error to show.
 */
export function useProjectSetup(project: Project | null): { summary: SetupSummary | null; state: SetupState; ready: boolean; refresh: () => Promise<unknown>; run: (action: (s: SetupState) => SetupState) => string | null } {
  const [state, setState] = useLocalDraft<SetupState>("project-setup", EMPTY_SETUP);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (s: SetupState) => SetupState): string | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof SetupRuleError) return error.message;
      throw error;
    }
  }, [setState]);
  const { documents, ready, refresh } = useProjectDocuments();
  const { extraction, procurement } = useExtraction();
  const { state: budget } = useBudget();
  const { state: schedule } = useSchedule();
  const summary = project && projectSetup({
    project, documents, procurement, state,
    pendingProposals: extraction.drafts.filter(d => d.kind === "scope" && d.status === "pending-review").length,
    budgetLines: budget.lines.length, scheduleActivities: schedule.activities.length,
  });
  return { summary, state, ready, refresh, run };
}
