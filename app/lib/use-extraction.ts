"use client";

import { useCallback, useRef } from "react";
import { sampleExtraction } from "./data/extraction";
import { acceptDraft, ExtractionRuleError, type ExtractionState } from "./extraction";
import { useDrawingFlip } from "./use-drawing-flip";
import { useLocalDraft } from "./use-local-draft";
import { useProcurement } from "./use-procurement";
import { removeReviewedScope, approveWithRegions } from "./scope-review";

/**
 * The open project's AI findings and their review, in this browser (demo), under "extraction".
 * Accepting a finding writes to procurement and Drawing Flip too, so this hook returns those
 * records — use them from here rather than calling useProcurement() or useDrawingFlip() again in
 * the same screen, or the copies drift apart.
 *
 *   const message = run(s => rejectDraft(s, id, "duplicate", "", userName));
 *   const message = run(s => editDraft(s, procurement, id, { title }, userName));
 *   const message = accept(id, userName);   // null when done, else why not
 */
export function useExtraction() {
  const { state: procurement, run: runProcurement } = useProcurement();
  const { state: flip, run: runFlip } = useDrawingFlip();
  const [extraction, setExtraction] = useLocalDraft<ExtractionState>("extraction", sampleExtraction);
  const latest = useRef({ extraction, procurement, flip });
  latest.current = { extraction, procurement, flip };

  const run = useCallback((action: (current: ExtractionState) => ExtractionState): string | null => {
    try {
      const next = action(latest.current.extraction);
      if (next !== latest.current.extraction) { latest.current = { ...latest.current, extraction: next }; setExtraction(next); }
      return null;
    } catch (error) {
      if (error instanceof ExtractionRuleError) return error.message;
      throw error;
    }
  }, [setExtraction]);

  const accept = useCallback((draftId: string, by: string): string | null => {
    try {
      const next = acceptDraft(latest.current, draftId, by);
      latest.current = next;
      setExtraction(next.extraction);
      runProcurement(() => next.procurement);
      runFlip(() => next.flip);
      return null;
    } catch (error) {
      if (error instanceof ExtractionRuleError) return error.message;
      throw error;
    }
  }, [setExtraction, runProcurement, runFlip]);

  const removeScope = useCallback((id: string, by: string): string | null => {
    try {
      const next = removeReviewedScope(latest.current, id, by);
      latest.current = next;
      runProcurement(() => next.procurement);
      runFlip(() => next.flip);
      return null;
    } catch (error) { if (error instanceof ExtractionRuleError) return error.message; throw error; }
  }, [runProcurement, runFlip]);

  /** Approves a bid-form line and places the highlights the AI proposed with it (lib/scope-review approveWithRegions). */
  const approveScopeItem = useCallback((id: string, by: string): string | null => {
    try {
      const next = approveWithRegions(latest.current, id, by);
      latest.current = next;
      setExtraction(next.extraction);
      runProcurement(() => next.procurement);
      runFlip(() => next.flip);
      return null;
    } catch (error) {
      if (error instanceof ExtractionRuleError) return error.message;
      if (error instanceof Error && error.name === "ProcurementRuleError") return error.message;
      throw error;
    }
  }, [setExtraction, runProcurement, runFlip]);

  return { extraction, procurement, runProcurement, flip, runFlip, run, accept, removeScope, approveScopeItem };
}
