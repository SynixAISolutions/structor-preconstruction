"use client";

import { useCallback, useMemo, useRef } from "react";
import { activeAward } from "./award";
import type { Procurement } from "./procurement";
import { findManual } from "./project-files";
import { useProjectDocuments } from "./project-files-client";
import { CoverageRuleError, assignmentWarnings, sectionCoverage, type CoverageDecisions } from "./section-coverage";
import { useAward } from "./use-award";
import { useLocalDraft } from "./use-local-draft";

/**
 * Section coverage for the open project: the manual's sections against `procurement` (pass the screen's
 * own useProcurement state, so assigning goes through its `run`). `decide` applies one decision action and
 * returns null, or the rule's message:
 *
 *   const message = decide(d => markNotApplicable(d, row.section, reason, userName, new Date().toISOString()));
 *   const assignMessage = run(s => assignSection(s, row, packageId, userName)); // useProcurement
 *
 * `warningsFor(packageId)` lists what assigning would affect (a published bid form, an awarded trade).
 * Decisions save in this browser for the project, like the rest of procurement.
 */
export function useSectionCoverage(procurement: Procurement) {
  const { documents, ready } = useProjectDocuments();
  const manual = findManual(documents);
  const [decisions, setDecisions] = useLocalDraft<CoverageDecisions>("coverage-decisions", {});
  const { state: awards } = useAward();
  const coverage = useMemo(() => sectionCoverage({ sections: manual?.sections ?? [], manual }, procurement, decisions), [manual, procurement, decisions]);
  const latest = useRef(decisions);
  latest.current = decisions;
  const decide = useCallback((action: (current: CoverageDecisions) => CoverageDecisions): string | null => {
    try {
      const next = action(latest.current);
      if (next !== latest.current) { latest.current = next; setDecisions(next); }
      return null;
    } catch (error) {
      if (error instanceof CoverageRuleError) return error.message;
      throw error;
    }
  }, [setDecisions]);
  const warningsFor = useCallback((packageId: string) => assignmentWarnings(procurement, packageId, { awarded: !!activeAward(awards, packageId) }), [procurement, awards]);
  return { ready, manual, ...coverage, decisions, decide, warningsFor };
}
