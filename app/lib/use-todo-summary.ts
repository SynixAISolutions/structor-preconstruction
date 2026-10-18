"use client";

import { useCallback, useEffect, useState } from "react";
import { sampleFiles } from "./data/preconstruction";
import type { BidProvenance, LevelingBidder, LevelingScopeItem } from "./leveling-import";
import type { SetupSummary } from "./project-setup";
import type { Project } from "./projects";
import { scheduleRows } from "./schedule";
import { EMPTY_TODO_HISTORY, deriveTodo, reconcileTodo, type DoneTask, type LevelingSnapshot, type TodoHistory, type TodoSummary } from "./todo";
import { useAward } from "./use-award";
import { useBudget } from "./use-budget";
import { useLocalDraft } from "./use-local-draft";
import { useProjectSetup } from "./use-project-setup";
import { useSchedule } from "./use-schedule";
import { useSubmissions } from "./use-submissions";
import { loadWorkspace } from "./workspace-storage";

const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * The open project's to-do (lib/todo deriveTodo) from its saved state, with the project setup
 * guide's warnings: the to-do page and the reminders in the top bar. `ready` once the stored files
 * and the leveling workspace have loaded; `reload` rereads both.
 */
export function useTodoSummary(project: Project | null): TodoSummary & { setup: SetupSummary | null; ready: boolean; reload: () => Promise<void> } {
  const { procurement, submissions } = useSubmissions();
  const { state: budget } = useBudget();
  const { state: awards } = useAward();
  const { state: schedulePlan } = useSchedule();
  const { summary: setup, ready: filesReady, refresh } = useProjectSetup(project);
  const [documents] = useLocalDraft("library", sampleFiles);
  const [provenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [loadedPackageId] = useLocalDraft("leveling-submission-package", "");
  const [leveling, setLeveling] = useState<{ snapshot: LevelingSnapshot | null; loaded: boolean }>({ snapshot: null, loaded: false });
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    let current = true;
    setLeveling(prev => prev.loaded ? { snapshot: prev.snapshot, loaded: false } : prev);
    void loadWorkspace<unknown, LevelingScopeItem, LevelingBidder>()
      .then(saved => { if (current) setLeveling({ snapshot: saved ? { packageId: loadedPackageId || null, items: saved.items, bidders: saved.bidders, provenance } : null, loaded: true }); })
      .catch(() => { if (current) setLeveling({ snapshot: null, loaded: true }); });
    return () => { current = false; };
  }, [loadedPackageId, project?.id, provenance, reloads]);
  const reload = useCallback(async () => { setReloads(n => n + 1); await refresh(); }, [refresh]);
  const today = localDay();
  const summary = deriveTodo({ project, documents, procurement, submissions, leveling: leveling.snapshot, budget, awards, schedule: { rows: scheduleRows(schedulePlan, today), today }, setup });
  return { ...summary, setup, ready: filesReady && leveling.loaded, reload };
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
