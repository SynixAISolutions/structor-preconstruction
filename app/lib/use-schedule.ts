"use client";

import { useCallback, useRef } from "react";
import { sampleSchedule } from "./data/schedule";
import { ScheduleRuleError, type ScheduleErrors, type ScheduleState } from "./schedule";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's schedule in this browser (demo), under "schedule-plan" (the older milestone
 * list stays under "schedule" until the screen moves over). `run` applies one action from
 * lib/schedule and returns null, or field-level errors.
 */
export function useSchedule() {
  const [state, setState] = useLocalDraft<ScheduleState>("schedule-plan", sampleSchedule);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: ScheduleState) => ScheduleState): ScheduleErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof ScheduleRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
