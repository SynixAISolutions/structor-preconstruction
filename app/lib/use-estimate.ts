"use client";

import { useCallback, useMemo, useRef } from "react";
import { initialTakeoffs, type TakeoffRow } from "./data/preconstruction";
import { EstimateRuleError, estimateByTrade, placeRows } from "./estimate";
import { useLocalDraft } from "./use-local-draft";
import { useProcurement } from "./use-procurement";

/**
 * The open project's estimate lines (the "takeoffs" draft) with every line placed in its trade,
 * and the per-trade roll-up. Replaces reading useLocalDraft("takeoffs") directly: lines saved
 * before trades existed are placed here, and the first edit saves the placement.
 *
 *   const message = run(rows => addEstimateItem(rows, procurement, { packageId, item, unit, quantity, rate }));
 *
 * For the variance report, pass `rows` and `procurement` from here with useBudget().state and the
 * leveling candidates to varianceReport().
 */
export function useEstimate() {
  const { state: procurement } = useProcurement();
  const [saved, setSaved] = useLocalDraft<TakeoffRow[]>("takeoffs", initialTakeoffs);
  const rows = useMemo(() => placeRows(saved, procurement.packages), [saved, procurement.packages]);
  const byTrade = useMemo(() => estimateByTrade(rows, procurement), [rows, procurement]);
  const latest = useRef(rows);
  latest.current = rows;
  const run = useCallback((action: (current: TakeoffRow[]) => TakeoffRow[]): string | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setSaved(next); }
      return null;
    } catch (error) {
      if (error instanceof EstimateRuleError) return error.message;
      throw error;
    }
  }, [setSaved]);
  return { rows, byTrade, procurement, run };
}
