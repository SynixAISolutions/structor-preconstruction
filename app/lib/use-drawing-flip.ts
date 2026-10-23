"use client";

import { useCallback, useMemo, useRef } from "react";
import { sampleDrawingFlip } from "./data/drawing-flip";
import { DrawingFlipRuleError, withStoredPages, type DrawingFlipErrors, type DrawingFlipState } from "./drawing-flip";
import { drawingRegister } from "./project-files";
import { useProjectDocuments } from "./project-files-client";
import { useLocalDraft } from "./use-local-draft";

/**
 * The open project's Drawing Flip pages and regions, in this browser (demo), under "drawing-flip".
 * `run` applies one action from lib/drawing-flip and returns null, or field-level errors. Actions
 * that check trades or scope items take the procurement record from useProcurement(). Every stored
 * drawing sheet is a page (withStoredPages), so regions and AI findings can go on any sheet.
 */
export function useDrawingFlip() {
  const [saved, setState] = useLocalDraft<DrawingFlipState>("drawing-flip", sampleDrawingFlip);
  const { documents } = useProjectDocuments();
  const state = useMemo(() => withStoredPages(saved, drawingRegister(documents)), [saved, documents]);
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
