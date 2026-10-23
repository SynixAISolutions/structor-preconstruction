"use client";

import { useCallback, useRef } from "react";
import { BuyoutRuleError, EMPTY_BUYOUT, type BuyoutState } from "./buyout";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's scope reviews, minutes and best and final offers (lib/buyout), in this browser.
 * `run` applies one action and returns null, or the message to show.
 */
export function useBuyout() {
  const [state, setState] = useLocalDraft<BuyoutState>("buyout", EMPTY_BUYOUT);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: BuyoutState) => BuyoutState): string | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof BuyoutRuleError) return error.message;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
