"use client";

import { useCallback, useRef } from "react";
import { AwardRuleError, type AwardErrors, type AwardState } from "./award";
import { useLocalDraft } from "./use-local-draft";

/** No award exists until someone makes one: every project, Jelleff included, starts here. */
export const EMPTY_AWARDS: AwardState = { awards: [], notifications: [] };

/**
 * The open project's awards, Exhibit A negotiations and subcontracts, in this browser (demo).
 * `run` applies one action from lib/award and returns null, or field-level errors when it is
 * not allowed (nothing changes then):
 *
 *   const errors = run(s => createAward(s, context, { levelingBidderId, basis }, userName));
 */
export function useAward() {
  const [state, setState] = useLocalDraft<AwardState>("awards", EMPTY_AWARDS);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: AwardState) => AwardState): AwardErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof AwardRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
