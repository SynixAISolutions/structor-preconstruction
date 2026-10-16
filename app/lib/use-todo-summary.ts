"use client";

import { useEffect, useState } from "react";
import { sampleFiles } from "./data/preconstruction";
import type { BidProvenance, LevelingBidder, LevelingScopeItem } from "./leveling-import";
import type { Project } from "./projects";
import { scheduleRows } from "./schedule";
import { deriveTodo, type LevelingSnapshot, type TodoSummary } from "./todo";
import { useAward } from "./use-award";
import { useBudget } from "./use-budget";
import { useLocalDraft } from "./use-local-draft";
import { useSchedule } from "./use-schedule";
import { useSubmissions } from "./use-submissions";
import { loadWorkspace } from "./workspace-storage";

const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** The open project's to-do (lib/todo deriveTodo) from its saved state: the to-do page and the reminders in the top bar. */
export function useTodoSummary(project: Project | null): TodoSummary {
  const { procurement, submissions } = useSubmissions();
  const { state: budget } = useBudget();
  const { state: awards } = useAward();
  const { state: schedulePlan } = useSchedule();
  const [documents] = useLocalDraft("library", sampleFiles);
  const [provenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [loadedPackageId] = useLocalDraft("leveling-submission-package", "");
  const [leveling, setLeveling] = useState<LevelingSnapshot | null>(null);
  useEffect(() => {
    let current = true;
    void loadWorkspace<unknown, LevelingScopeItem, LevelingBidder>()
      .then(saved => { if (current) setLeveling(saved ? { packageId: loadedPackageId || null, items: saved.items, bidders: saved.bidders, provenance } : null); })
      .catch(() => { if (current) setLeveling(null); });
    return () => { current = false; };
  }, [loadedPackageId, project?.id, provenance]);
  const today = localDay();
  return deriveTodo({ project, documents, procurement, submissions, leveling, budget, awards, schedule: { rows: scheduleRows(schedulePlan, today), today } });
}
