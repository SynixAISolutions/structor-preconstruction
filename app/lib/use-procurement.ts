"use client";

import { useCallback, useRef } from "react";
import { sampleProcurement } from "./data/procurement";
import { ProcurementRuleError, type Procurement } from "./procurement";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's procurement record. `run` applies one action from lib/procurement
 * and returns null, or the rule's message when the action is not allowed (nothing changes then):
 *
 *   const message = run(s => moveScope(s, id, toPackageId, userName));
 *   if (message) notify(message);
 */
export function useProcurement() {
  const [state, setState] = useLocalDraft<Procurement>("procurement", sampleProcurement);
  // Latest state, so several actions in one event handler build on each other.
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: Procurement) => Procurement): string | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof ProcurementRuleError) return error.message;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
