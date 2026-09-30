"use client";

import { useCallback, useRef } from "react";
import { sampleDrawingFlip } from "./data/drawing-flip";
import { DrawingFlipRuleError, type DrawingFlipErrors, type DrawingFlipState } from "./drawing-flip";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's Drawing Flip pages and regions, in this browser (demo), under "drawing-flip".
 * `run` applies one action from lib/drawing-flip and returns null, or field-level errors. Actions
 * that check trades or scope items take the procurement record from useProcurement().
 */
export function useDrawingFlip() {
  const [state, setState] = useLocalDraft<DrawingFlipState>("drawing-flip", sampleDrawingFlip);
  const latest = useRef(state);
  latest.current = state;
  const run = useCallback((action: (current: DrawingFlipState) => DrawingFlipState): DrawingFlipErrors | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setState(next); }
      return null;
    } catch (error) {
      if (error instanceof DrawingFlipRuleError) return error.errors;
      throw error;
    }
  }, [setState]);
  return { state, run };
}
