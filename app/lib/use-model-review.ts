"use client";

import { useCallback, useRef } from "react";
import { sampleModelReview } from "./jelleff-model";
import { ModelRuleError, type ModelErrors, type ModelReviewState } from "./model";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's model reviews and hidden divisions, in this browser (demo), under
 * "model-review". `run` applies one action from lib/model and returns null, or field-level errors.
 * The objects themselves come from modelForProject(projectId).
 */
export function useModelReview() {
  const [state, setState] = useLocalDraft<ModelReviewState>("model-review", sampleModelReview);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: ModelReviewState) => ModelReviewState): ModelErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof ModelRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
