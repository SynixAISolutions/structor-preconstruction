"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aiJob } from "./ai-more-client";
import { EMPTY_SETUP, SetupRuleError, projectSetup, type SetupChecks, type SetupState, type SetupSummary } from "./project-setup";
import { findManual, latestDocuments } from "./project-files";
import { readStoredText, useProjectDocuments } from "./project-files-client";
import { draftStorageKey, getActiveProjectId } from "./project-scope";
import type { Project } from "./projects";
import { dueChecks, runSetupChecks, type ReferencedDoc } from "./setup-checks";
import { useBudget } from "./use-budget";
import { useExtraction } from "./use-extraction";
import { useLocalDraft } from "./use-local-draft";
import { useSchedule } from "./use-schedule";

// Check results live under their own key ("project-setup-checks"), so writing them can never undo a
// decision saved through another component's copy of the hook. One run per drawing-set and manual
// version is shared by every mounted copy: what it found so far, whether it is running, and why it
// stopped. A failed check is not retried by itself (no request loop); retryChecks() or a reload does.
type Run = { found: SetupChecks; running: boolean; error: string | null };
const runs = new Map<string, Run>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
/** The saved results, read directly: a copy that has just mounted hasn't loaded its draft yet. */
function stored(projectId: string): SetupChecks {
  try { return JSON.parse(localStorage.getItem(draftStorageKey(projectId, "project-setup-checks")) ?? "{}") as SetupChecks; } catch { return {}; }
}
/** Saves results straight to storage (the component that started the run may be gone). */
function save(projectId: string, found: SetupChecks) {
  try { localStorage.setItem(draftStorageKey(projectId, "project-setup-checks"), JSON.stringify({ ...stored(projectId), ...found })); } catch { /* the mounted copies still get it */ }
}
const io = {
  text: readStoredText,
  references: async (pages: { page: number; text: string }[]) => (await aiJob<{ documents: ReferencedDoc[] }>("referenced-documents", { pages })).documents,
};

/**
 * The open project's setup guide (lib/project-setup) from its saved state, under "project-setup".
 * `run` applies one action (decide, clearDecision, markReviewed) and returns null or the error to show.
 * The phase-2 checks (drawing index, manual contents, referenced reports) run by themselves once per
 * drawing-set and manual version and are saved with the state. `checking` is true while they are due
 * and haven't failed; `checkError` says which failed (the others' results are kept) and
 * `retryChecks` runs the missing ones again.
 */
export function useProjectSetup(project: Project | null): { summary: SetupSummary | null; state: SetupState; ready: boolean; checking: boolean; checkError: string | null; retryChecks: () => void; refresh: () => Promise<unknown>; run: (action: (s: SetupState) => SetupState) => string | null } {
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

  // Phase 2 checks. ponytail: the newest drawing set only; check every set if projects split drawings across files.
  const drawings = latestDocuments(documents).find(d => d.kind === "drawings") ?? null, manual = findManual(documents);
  const [checks, setChecks] = useLocalDraft<SetupChecks>("project-setup-checks", {});
  const runKey = `${drawings?.id ?? ""}|${manual?.id ?? ""}`;
  const keyRef = useRef(runKey);
  keyRef.current = runKey;
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => {
      const found = runs.get(keyRef.current)?.found;
      if (found && Object.keys(found).length) setChecks(current => ({ ...current, ...found }));
      rerender(n => n + 1);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [setChecks]);
  const current = runs.get(runKey);
  const have: SetupChecks = { ...checks, ...current?.found };
  const due = ready && !!project && dueChecks(drawings, manual, have).length > 0;
  useEffect(() => {
    const key = runKey, previous = runs.get(key);
    if (!due || previous?.running || previous?.error) return;
    const projectId = getActiveProjectId(), start = { ...stored(projectId), ...checks, ...previous?.found };
    if (!dueChecks(drawings, manual, start).length) return;
    const entry: Run = { found: previous?.found ?? {}, running: true, error: null };
    runs.set(key, entry);
    notify();
    void runSetupChecks(drawings, manual, start, io).then(({ found, error }) => {
      entry.found = { ...entry.found, ...found };
      entry.running = false;
      entry.error = error;
      if (Object.keys(found).length) save(projectId, found);
      notify();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, runKey, current?.error]);
  const retryChecks = useCallback(() => {
    const entry = runs.get(keyRef.current);
    if (entry?.error) { entry.error = null; notify(); }
  }, []);

  const summary = project && projectSetup({
    project, documents, procurement, state: { ...state, checks: have },
    pendingProposals: extraction.drafts.filter(d => d.kind === "scope" && d.status === "pending-review").length,
    budgetLines: budget.lines.length, scheduleActivities: schedule.activities.length,
  });
  return { summary, state, ready, checking: due && !current?.error, checkError: current?.error ?? null, retryChecks, refresh, run };
}
