"use client";

import { useEffect, useState } from "react";
import { levelingCandidates, type LevelingCandidate } from "../../lib/budget";
import type { BidProvenance, LevelingBidder, LevelingScopeItem } from "../../lib/leveling-import";
import { useActiveProject } from "../../lib/project-scope";
import { useLocalDraft } from "../../lib/use-local-draft";
import { loadWorkspace } from "../../lib/workspace-storage";

import { useValueEngineering } from "../../lib/use-value-engineering";
import { useSubmissions } from "../../lib/use-submissions";
import { veLevelingBidders } from "../../lib/ve-bids";

export function useLevelingComparison() {
  const projectId = useActiveProject();
  const { state: ve } = useValueEngineering();
  const { submissions } = useSubmissions();
  const [provenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [packageId] = useLocalDraft("leveling-submission-package", "");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ projectId: string; candidates: LevelingCandidate[]; loading: boolean; message: string }>({ projectId, candidates: [], loading: true, message: "" });
  useEffect(() => {
    let live = true;
    setResult({ projectId, candidates: [], loading: true, message: "" });
    void loadWorkspace<unknown, LevelingScopeItem, LevelingBidder>().then(workspace => {
      if (!live) return;
      const candidates = workspace ? levelingCandidates({ packageId: packageId || null, items: workspace.items, bidders: veLevelingBidders(workspace.bidders, provenance, ve, submissions), provenance }) : [];
      setResult({ projectId, candidates, loading: false, message: candidates.length ? "" : "No saved leveling bids are available. Load or import bids in Bid leveling first." });
    }).catch(error => { if (live) setResult({ projectId, candidates: [], loading: false, message: error instanceof Error ? error.message : "The saved leveling comparison could not be read." }); });
    return () => { live = false; };
  }, [projectId, packageId, provenance, revision, ve, submissions]);
  const current = result.projectId === projectId ? result : { candidates: [], loading: true, message: "" };
  return { ...current, refresh: () => setRevision(value => value + 1) };
}
