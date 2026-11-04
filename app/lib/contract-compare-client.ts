"use client";

// The AI's explanations of a contract comparison, one comparison at a time for this tab. They belong to the tab rather
// than the screen, and each answer is saved as it arrives, so leaving the page doesn't lose what has been paid for.

import { useSyncExternalStore } from "react";
import { aiJob } from "./ai-more-client";
import { inAiPool } from "./ai-pool";
import { CONTRACT_COMPARISON_KEY, EMPTY_COMPARISON, explanationBatches, type ComparisonState, type ContractChange, type ContractExplanation } from "./contract-compare";
import { readDraft, writeDraft } from "./use-local-draft";

export type ExplainProgress = { pair: string; done: number; total: number };

const NONE = { pair: "", message: "" };
let progress: ExplainProgress | null = null;
let failure = NONE;
const tried = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const useContractExplaining = () => ({
  progress: useSyncExternalStore(subscribe, () => progress, () => null),
  failure: useSyncExternalStore(subscribe, () => failure, () => NONE),
});

/** Whether this tab already tried this pair of files, so a failing one isn't asked (and paid for) again on every visit. */
export const triedExplaining = (pair: string) => tried.has(pair);

/** Explains what isn't explained yet, saving each answer with the project. A failed batch is left for Explain again. */
export async function explainChanges(projectId: string, pair: string, changes: ContractChange[]): Promise<void> {
  if (progress) return;
  tried.add(pair);
  failure = NONE;
  const read =() => readDraft<ComparisonState>(projectId, CONTRACT_COMPARISON_KEY, EMPTY_COMPARISON);
  const batches = explanationBatches(changes, read());
  const total = batches.flat().length;
  let done = 0, failed = 0, reason = "";
  progress = { pair, done, total };
  emit();
  await Promise.all(batches.map(async batch => {
    try {
      const answer = await inAiPool(() => aiJob<{ explanations: Record<string, ContractExplanation>; cost?: number | null }>("contract-changes", { changes: batch }));
      const saved = read();
      writeDraft(projectId, CONTRACT_COMPARISON_KEY, { ...saved, explanations: { ...saved.explanations, ...answer.explanations }, model: answer.model, cost: saved.cost + (answer.cost ?? 0), at: new Date().toISOString() });
    } catch (error) {
      failed += batch.length;
      reason = error instanceof Error ? error.message : "The AI could not explain these changes.";
    }
    done += batch.length;
    progress = { pair, done, total };
    emit();
  }));
  if (failed) failure = { pair, message: `${failed} of ${total} changes could not be explained. ${reason}` };
  progress = null;
  emit();
}
