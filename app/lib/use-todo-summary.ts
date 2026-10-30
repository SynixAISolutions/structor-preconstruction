"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initialBidders } from "./data/commercial";
import { sampleFiles } from "./data/preconstruction";
import { costPlan } from "./forecasts";
import type { BidProvenance, LevelingBidder, LevelingProject, LevelingScopeItem } from "./leveling-import";
import type { SavedTradeComparison } from "./leveling-sync";
import { openComparisonCandidates } from "./portal-comparisons";
import { useActiveProject } from "./project-scope";
import type { SetupSummary } from "./project-setup";
import type { Project } from "./projects";
import { scheduleRows } from "./schedule";
import { procurementSchedule } from "./schedule-procurement";
import { EMPTY_TODO_HISTORY, deriveTodo, reconcileTodo, type DoneTask, type LevelingSnapshot, type TodoHistory, type TodoSummary } from "./todo";
import { useAward } from "./use-award";
import { useBudget } from "./use-budget";
import { useEstimate } from "./use-estimate";
import { useLocalDraft } from "./use-local-draft";
import { useProjectSetup } from "./use-project-setup";
import { useSchedule } from "./use-schedule";
import { useStructorCheck } from "./use-structor-check";
import { useBuyout } from "./use-buyout";
import { useSubmissions } from "./use-submissions";
import { useValueEngineering } from "./use-value-engineering";
import { loadWorkspace } from "./workspace-storage";

const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * The open project's to-do (lib/todo deriveTodo) from its saved state, with the project setup
 * guide's warnings: the to-do page and the reminders in the top bar. `ready` once the stored files
 * and the leveling workspace have loaded; `reload` rereads both.
 */
export function useTodoSummary(project: Project | null): TodoSummary & { setup: SetupSummary | null; setupGuide: ReturnType<typeof useProjectSetup>; ready: boolean; reload: () => Promise<void> } {
  const { procurement, submissions } = useSubmissions();
  const { state: budget } = useBudget();
  const { state: awards } = useAward();
  const { state: schedulePlan } = useSchedule();
  const { state: check } = useStructorCheck();
  const { state: buyout } = useBuyout();
  // The to-do's setup step acts through this same copy, so a decision shows in the steps at once.
  const setupGuide = useProjectSetup(project);
  const { summary: setup, ready: filesReady, refresh } = setupGuide;
  const [documents] = useLocalDraft("library", sampleFiles);
  const [provenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [loadedPackageId] = useLocalDraft("leveling-submission-package", "");
  const [leveling, setLeveling] = useState<{ snapshot: LevelingSnapshot | null; workspace: Omit<SavedTradeComparison, "provenance"> | null; loaded: boolean }>({ snapshot: null, workspace: null, loaded: false });
  const projectId = useActiveProject();
  const { state: ve } = useValueEngineering();
  const [directory] = useLocalDraft("directory", initialBidders);
  const [comparisons] = useLocalDraft<Record<string, SavedTradeComparison>>("leveling-trades", {});
  const estimate = useEstimate();
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    let current = true;
    setLeveling(prev => prev.loaded ? { ...prev, loaded: false } : prev);
    void loadWorkspace<LevelingProject, LevelingScopeItem, LevelingBidder>()
      .then(saved => { if (current) setLeveling({ snapshot: saved ? { packageId: loadedPackageId || null, items: saved.items, bidders: saved.bidders, provenance } : null, workspace: saved, loaded: true }); })
      .catch(() => { if (current) setLeveling({ snapshot: null, workspace: null, loaded: true }); });
    return () => { current = false; };
  }, [loadedPackageId, project?.id, provenance, reloads]);
  const reload = useCallback(async () => { setReloads(n => n + 1); await refresh(); }, [refresh]);
  const today = localDay();
  // The budget as the Budget page shows it: committed from the awards, forecasts worked out (lib/forecasts).
  const plan = useMemo(() => costPlan(budget, {
    awards, procurement, submissions, directory, ve, estimates: estimate.byTrade.trades,
    candidates: openComparisonCandidates({ projectId, procurement, submissions, directory, workspace: leveling.workspace, packageId: loadedPackageId, provenance, comparisons, ve }),
  }).budget, [budget, awards, procurement, submissions, directory, ve, estimate.byTrade.trades, projectId, leveling.workspace, loadedPackageId, provenance, comparisons]);
  const summary = deriveTodo({ project, documents, procurement, submissions, directory, leveling: leveling.snapshot, budget: plan, awards, schedule: { rows: scheduleRows(procurementSchedule(schedulePlan, { procurement, awards }, today).state, today), today }, setup, check, buyout });
  return { ...summary, setup, setupGuide, ready: filesReady && leveling.loaded, reload };
}

/**
 * The to-do page: the summary plus what has been done. Tasks that disappear while the data is
 * loaded move to done; "Scan for task completion" rereads the files and leveling first and reports
 * what it found.
 */
export function useTodo(project: Project) {
  const summary = useTodoSummary(project);
  const [history, setHistory] = useLocalDraft<TodoHistory>("todo-history", EMPTY_TODO_HISTORY);
  const [scan, setScan] = useState<"idle" | "scanning" | "checking">("idle");
  const [lastScan, setLastScan] = useState<{ at: string; completed: DoneTask[]; open: number } | null>(null);
  const key = summary.tasks.map(task => `${task.id}\u0000${task.title}`).join("\u0001");
  useEffect(() => {
    if (!summary.ready || scan === "scanning") return;
    const result = reconcileTodo(history, summary.tasks, new Date().toISOString());
    if (result.history !== history) setHistory(result.history);
    if (scan === "checking") { setLastScan({ at: new Date().toISOString(), completed: result.completed, open: summary.tasks.length }); setScan("idle"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.ready, key, scan]);
  const scanForCompletion = useCallback(async () => {
    setScan("scanning");
    try { await summary.reload(); } finally { setScan("checking"); }
  }, [summary]);
  return { summary, history, scanning: scan !== "idle", lastScan, scanForCompletion };
}
