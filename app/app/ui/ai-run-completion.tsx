"use client";

import { useEffect, useState } from "react";
import { RUNS_KEY } from "../../lib/auto-scopes";
import { NO_RUNS, type AutoRun, type SavedRuns } from "../../lib/auto-scope-plan";
import { draftStorageKey } from "../../lib/project-scope";
import { DRAFT_CHANGED } from "../../lib/shared-sync";
import { readDraft } from "../../lib/use-local-draft";
import { StructorOrb } from "./structor-orb";

export function AiRunCompletion({ projectId, readingProjectId }: { projectId: string; readingProjectId?: string }) {
  const [completed, setCompleted] = useState<AutoRun | null>(null);

  useEffect(() => {
    // The progress snapshot clears at the end. The saved run has the final count,
    // including the last trade, even when React batches the progress updates.
    const watched = new Map([[draftStorageKey(projectId, RUNS_KEY), projectId]]);
    if (readingProjectId) watched.set(draftStorageKey(readingProjectId, RUNS_KEY), readingProjectId);
    const running = new Map<string, string>();
    const latestRun = (id: string) => readDraft<SavedRuns>(id, RUNS_KEY, NO_RUNS).runs[0];
    for (const id of watched.values()) {
      const saved = latestRun(id);
      if (saved?.status === "running") running.set(id, saved.id);
    }

    function onDraftChanged(event: Event) {
      const id = watched.get((event as CustomEvent<string>).detail);
      if (!id) return;

      const saved = latestRun(id);
      if (saved?.status === "running") {
        running.set(id, saved.id);
      } else if (saved?.status === "done" && running.get(id) === saved.id) {
        running.delete(id);
        setCompleted(saved);
      }
    }

    window.addEventListener(DRAFT_CHANGED, onDraftChanged);
    return () => window.removeEventListener(DRAFT_CHANGED, onDraftChanged);
  }, [projectId, readingProjectId]);

  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(() => setCompleted(null), 2000);
    return () => window.clearTimeout(timer);
  }, [completed]);

  if (!completed) return null;
  const failed = completed.trades.filter(trade => trade.status === "failed").length;
  return <section className="ai-run-card ai-run-complete" role="status" aria-atomic="true">
    <span className="ai-run-icon"><StructorOrb size={30} mood="happy"/></span>
    <div className="ai-run-copy">
      <strong>Done: {completed.added.toLocaleString("en-US")} scope item{completed.added === 1 ? "" : "s"} added</strong>
      {completed.scopesLater && <small>Bid packages are ready. Read every trade from Project files to add scopes.</small>}
      {failed > 0 && <small>{failed} trade{failed === 1 ? "" : "s"} could not be read.</small>}
    </div>
  </section>;
}
