"use client";

import { useCallback, useRef } from "react";
import { AwardRuleError, type AwardErrors, type AwardState } from "./award";
import { sampleAwards } from "./data/sample-award";
import { useLocalDraft } from "./use-local-draft";

/** A project with no awards yet. New projects start here; Jelleff starts with Concrete awarded (sampleAwards). */
export const EMPTY_AWARDS: AwardState = { awards: [], notifications: [] };

/**
 * The open project's awards, Exhibit A negotiations and subcontracts, in this browser (demo).
 * `run` applies one action from lib/award and returns null, or field-level errors when it is
 * not allowed (nothing changes then):
 *
 *   const errors = run(s => createAward(s, context, { levelingBidderId, basis }, userName));
 */
export function useAward() {
  const [state, setState] = useLocalDraft<AwardState>("awards", sampleAwards);
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
