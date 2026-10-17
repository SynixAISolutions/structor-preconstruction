"use client";

import { useEffect, useState } from "react";
import { levelingCandidates, type LevelingCandidate } from "../../lib/budget";
import type { BidProvenance, LevelingBidder, LevelingScopeItem, LevelingProject } from "../../lib/leveling-import";
import { useActiveProject } from "../../lib/project-scope";
import { useLocalDraft } from "../../lib/use-local-draft";
import { loadWorkspace } from "../../lib/workspace-storage";

import { useValueEngineering } from "../../lib/use-value-engineering";
import { useSubmissions } from "../../lib/use-submissions";
import { veLevelingBidders } from "../../lib/ve-bids";
import type { SavedTradeComparison } from "../../lib/leveling-sync";
import { portalComparisonCandidates } from "../../lib/portal-comparisons";
import { initialBidders } from "../../lib/data/commercial";

export function useLevelingComparison() {
  const projectId = useActiveProject();
  const { state: ve } = useValueEngineering();
  const { submissions, procurement } = useSubmissions();
  const [directory] = useLocalDraft("directory", initialBidders);
  const [comparisons] = useLocalDraft<Record<string, SavedTradeComparison>>("leveling-trades", {});
  const [provenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [packageId] = useLocalDraft("leveling-submission-package", "");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ projectId: string; candidates: LevelingCandidate[]; loading: boolean; message: string }>({ projectId, candidates: [], loading: true, message: "" });
  useEffect(() => {
    let live = true;
    setResult({ projectId, candidates: [], loading: true, message: "" });
    void loadWorkspace<LevelingProject, LevelingScopeItem, LevelingBidder>().then(workspace => {
      if (!live) return;
      const current = workspace && packageId && !Object.values(provenance).some(p => p.superseded) ? { [packageId]: { ...workspace, provenance } } : {};
      const candidates = portalComparisonCandidates({ projectId, projectName: workspace?.project.name ?? "", procurement, submissions, directory, comparisons: { ...comparisons, ...current }, ve });
      if (workspace && !packageId) candidates.push(...levelingCandidates({ packageId: null, items: workspace.items, bidders: veLevelingBidders(workspace.bidders, provenance, ve, submissions), provenance }));
      setResult({ projectId, candidates, loading: false, message: candidates.length ? "" : "No saved leveling bids are available. Load or import bids in Bid leveling first." });
    }).catch(error => { if (live) setResult({ projectId, candidates: [], loading: false, message: error instanceof Error ? error.message : "The saved leveling comparison could not be read." }); });
    return () => { live = false; };
  }, [projectId, packageId, provenance, revision, ve, submissions, procurement, directory, comparisons]);
  const current = result.projectId === projectId ? result : { candidates: [], loading: true, message: "" };
  return { ...current, refresh: () => setRevision(value => value + 1) };
}
