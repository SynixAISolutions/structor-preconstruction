"use client";

import { useCallback, useEffect, useRef } from "react";
import { aiJob } from "./ai-more-client";
import { EMPTY_SETUP, SetupRuleError, projectSetup, type SetupChecks, type SetupState, type SetupSummary } from "./project-setup";
import { drawingRegister, findManual, latestDocuments } from "./project-files";
import { readStoredText, useProjectDocuments } from "./project-files-client";
import { draftStorageKey, getActiveProjectId } from "./project-scope";
import type { Project } from "./projects";
import { drawingIndexCheck, indexSheet, referencePages, sectionInText, specTocCheck, tocText, type ReferencedDoc } from "./setup-checks";
import { useBudget } from "./use-budget";
import { useExtraction } from "./use-extraction";
import { useLocalDraft } from "./use-local-draft";
import { useSchedule } from "./use-schedule";

// Check results live under their own key ("project-setup-checks"), so writing them can never undo a
// decision saved through another component's copy of the hook; finished results are shared in the page.
const inFlight = new Set<string>();
const finished = new Map<string, SetupChecks>();
const listeners = new Set<() => void>();
/** Saves a finished run straight to storage (the component that started it may be gone) and tells every mounted copy. */
function publish(key: string, found: SetupChecks, projectId: string) {
  finished.set(key, found);
  try {
    const storageKey = draftStorageKey(projectId, "project-setup-checks");
    localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(localStorage.getItem(storageKey) ?? "{}"), ...found }));
  } catch { /* the mounted copies still get it */ }
  listeners.forEach(listener => listener());
}

/**
 * The open project's setup guide (lib/project-setup) from its saved state, under "project-setup".
 * `run` applies one action (decide, clearDecision, markReviewed) and returns null or the error to show.
 * The phase-2 checks (drawing index, manual contents, referenced reports) run by themselves once per
 * drawing-set and manual version and are saved with the state.
 */
export function useProjectSetup(project: Project | null): { summary: SetupSummary | null; state: SetupState; ready: boolean; checking: boolean; refresh: () => Promise<unknown>; run: (action: (s: SetupState) => SetupState) => string | null } {
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
  useEffect(() => {
    const listener = () => { const result = finished.get(keyRef.current); if (result) setChecks(current => ({ ...current, ...result })); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [setChecks]);
  const due = ready && !!project && ((drawings && checks.drawingIndex?.docId !== drawings.id) || (manual && (checks.specToc?.docId !== manual.id || checks.references?.docId !== manual.id)));
  useEffect(() => {
    const key = runKey;
    if (!due || inFlight.has(key)) return;
    if (finished.has(key)) { setChecks({ ...checks, ...finished.get(key) }); return; }
    inFlight.add(key);
    const projectId = getActiveProjectId();
    void (async () => {
      const found: SetupChecks = {};
      try {
        if (drawings && checks.drawingIndex?.docId !== drawings.id) {
          const register = drawingRegister([drawings]), row = indexSheet(register);
          const [page] = row ? await readStoredText(drawings, { first: row.page, last: row.page }) : [];
          found.drawingIndex = drawingIndexCheck(drawings.id, page?.text ?? "", register.map(r => r.sheet));
        }
        if (manual && (checks.specToc?.docId !== manual.id || checks.references?.docId !== manual.id)) {
          const pages = await readStoredText(manual);
          const full = pages.map(p => p.text).join("\n");
          if (checks.specToc?.docId !== manual.id) found.specToc = specTocCheck(manual.id, tocText(pages), manual.sections, code => sectionInText(code, full));
          if (checks.references?.docId !== manual.id) {
            const chosen = referencePages(pages).map(p => ({ page: p.page, text: p.text.slice(0, 9000) }));
            found.references = { docId: manual.id, documents: chosen.length ? (await aiJob<{ documents: ReferencedDoc[] }>("referenced-documents", { pages: chosen })).documents : [] };
          }
        }
      } catch { /* whatever finished is saved; the rest runs again next time */ }
      finally {
        if (Object.keys(found).length) publish(key, found, projectId);
        inFlight.delete(key);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, drawings?.id, manual?.id]);

  const summary = project && projectSetup({
    project, documents, procurement, state: { ...state, checks },
    pendingProposals: extraction.drafts.filter(d => d.kind === "scope" && d.status === "pending-review").length,
    budgetLines: budget.lines.length, scheduleActivities: schedule.activities.length,
  });
  return { summary, state, ready, checking: !!due, refresh, run };
}
