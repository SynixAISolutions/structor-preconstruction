"use client";

import { useMemo } from "react";
import { useLocalDraft } from "./use-local-draft";
import { resolveModelSupplement, type ModelSupplement } from "./model-supplements";

export function usePreparedModel(projectId: string) {
  const [saved, setSaved] = useLocalDraft<ModelSupplement | null>("model-supplements", null);
  const result = useMemo(() => {
    const empty: ModelSupplement = { version: 1, projectId, finishes: [], cornerGuards: [] };
    try { return { ...resolveModelSupplement(saved ?? empty, projectId), error: "" }; }
    catch (error) { return { ...resolveModelSupplement(empty, projectId), error: error instanceof Error ? error.message : "The saved measurements could not be read." }; }
  }, [saved, projectId]);
  return { ...result, importMeasurements: (raw: unknown) => { const checked = resolveModelSupplement(raw, projectId); setSaved(checked.data); } };
}
