"use client";

import { useCallback, useRef } from "react";
import { BudgetRuleError, type BudgetErrors, type BudgetState } from "./budget";
import { sampleBudget } from "./data/budget";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's budget lines and allowances, in this browser (demo). `run` applies one
 * action from lib/budget and returns null, or field-level errors when it is not allowed
 * (nothing changes then):
 *
 *   const errors = run(s => addBudgetLine(s, input, userName));
 *   if (errors) showFieldErrors(errors);
 *
 * Stored under "budget-state", separate from the older "budget" / "allowances" preview drafts.
 */
export function useBudget() {
  const [state, setState] = useLocalDraft<BudgetState>("budget-state", sampleBudget);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: BudgetState) => BudgetState): BudgetErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof BudgetRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
