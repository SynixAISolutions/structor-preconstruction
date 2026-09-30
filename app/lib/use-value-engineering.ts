"use client";

import { useCallback, useRef } from "react";
import { EMPTY_VE, VeRuleError, type VeErrors, type VeState } from "./value-engineering";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's value-engineering list, in this browser (demo). Every project starts empty.
 * `run` applies one action from lib/value-engineering and returns null, or field-level errors.
 */
export function useValueEngineering() {
  const [state, setState] = useLocalDraft<VeState>("value-engineering", EMPTY_VE);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: VeState) => VeState): VeErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof VeRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
