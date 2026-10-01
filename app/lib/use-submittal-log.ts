"use client";

import { useCallback, useRef } from "react";
import { sampleSubmittals } from "./data/submittals";
import { SubmittalRuleError, type SubmittalErrors, type SubmittalState } from "./submittals";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's submittal log and its recorded notifications, in this browser (demo), under
 * "submittal-log". `run` applies one action from lib/submittals and returns null, or field-level
 * errors. Actions that need trade packages take the record from useProcurement().
 */
export function useSubmittalLog() {
  const [state, setState] = useLocalDraft<SubmittalState>("submittal-log", sampleSubmittals);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: SubmittalState) => SubmittalState): SubmittalErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof SubmittalRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
