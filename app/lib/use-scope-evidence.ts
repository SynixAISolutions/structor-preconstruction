"use client";

import { useCallback } from "react";
import { sampleExtraction } from "./data/extraction";
import type { ExtractionState } from "./extraction";
import type { ScopeItem } from "./procurement";
import { useProjectDocuments } from "./project-files-client";
import { scopeEvidence, type Evidence } from "./scope-evidence";
import { useDrawingFlip } from "./use-drawing-flip";
import { useLocalDraft } from "./use-local-draft";

/**
 * Where the open project's bid-form items came from (lib/scope-evidence), for screens that only show it.
 * Read-only: the findings and Drawing Flip are changed through useExtraction and useDrawingFlip.
 *
 *   const evidenceOf = useScopeEvidence();
 *   evidenceOf(item)   // [] when the item names no source the project can open
 */
export function useScopeEvidence(): (item: Pick<ScopeItem, "id" | "source">) => Evidence[] {
  const [extraction] = useLocalDraft<ExtractionState>("extraction", sampleExtraction);
  const { state: flip } = useDrawingFlip();
  const { documents } = useProjectDocuments();
  return useCallback(item => scopeEvidence(item, { extraction, flip }, documents), [extraction, flip, documents]);
}
