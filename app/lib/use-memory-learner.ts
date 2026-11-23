"use client";

// Sends the estimators' corrections on this project to the AI memory as proposals (lib/memory-learn), a few seconds
// after the review changes. Each correction goes once from this browser (remembered under "memory-sent:<project>"),
// and the server ignores one it already has, so another browser sending it too changes nothing. When the memory can't
// be reached the corrections wait for the next change.

import { useEffect } from "react";
import type { ExtractionState } from "./extraction";
import { learnMemory } from "./memory-client";
import { correctionsFrom } from "./memory-learn";
import type { CoverageDecisions } from "./section-coverage";
import { useLocalDraft } from "./use-local-draft";
import type { Procurement } from "./procurement";

const SENT_LIMIT = 5_000, BATCH = 100, DELAY_MS = 4_000;

function sentIds(projectId: string): string[] {
  try { const value = JSON.parse(localStorage.getItem(`memory-sent:${projectId}`) ?? "[]"); return Array.isArray(value) ? value.filter(v => typeof v === "string") : []; }
  catch { return []; }
}

export function useMemoryLearner(projectId: string | null, procurement: Procurement, extraction: ExtractionState) {
  const [decisions] = useLocalDraft<CoverageDecisions>("coverage-decisions", {});
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    const timer = setTimeout(async () => {
      const sent = new Set(sentIds(projectId));
      const fresh = correctionsFrom(projectId, procurement, extraction, decisions).filter(c => !sent.has(c.events[0])).slice(0, BATCH);
      if (!fresh.length || !live) return;
      try {
        await learnMemory(fresh);
        const next = [...sent, ...fresh.map(c => c.events[0])].slice(-SENT_LIMIT);
        try { localStorage.setItem(`memory-sent:${projectId}`, JSON.stringify(next)); } catch { /* storage full or blocked: the server ignores repeats */ }
      } catch { /* the memory isn't reachable: these go with the next change */ }
    }, DELAY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [projectId, procurement, extraction, decisions]);
}
