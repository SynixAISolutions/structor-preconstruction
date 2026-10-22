"use client";

import { useMemo } from "react";
import type { BudgetState } from "./budget";
import { budgetCommitments, withCommitments } from "./commitments";
import type { Procurement } from "./procurement";
import { useAward } from "./use-award";
import { useProcurement } from "./use-procurement";

/**
 * The open project's budget with its commitments worked out from the awards (lib/commitments):
 * `budget` is what every page should total and show, `commitments` says where each amount came from.
 * Pass `procurement` when the screen already has it (useSubmissions), so it reads one copy.
 */
export function useCommitments(state: BudgetState, procurement?: Procurement) {
  const { state: awards } = useAward();
  const { state: own } = useProcurement();
  const packages = procurement ?? own;
  return useMemo(() => {
    const commitments = budgetCommitments(state, awards, packages);
    return { commitments, budget: withCommitments(state, commitments) };
  }, [state, awards, packages]);
}
