"use client";

import { useCallback, useRef } from "react";
import { sampleStructorCheck } from "./data/rfi";
import { RfiRuleError, type RfiErrors, type StructorCheckState } from "./rfi";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's Structor Check issues, RFIs and recorded notifications, in this browser
 * (demo). `run` applies one action from lib/rfi and returns null, or field-level errors.
 * Stored under "structor-check-state", separate from the older "structor-check" preview list.
 */
export function useStructorCheck() {
  const [state, setState] = useLocalDraft<StructorCheckState>("structor-check-state", sampleStructorCheck);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: StructorCheckState) => StructorCheckState): RfiErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof RfiRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
