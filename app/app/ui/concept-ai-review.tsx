"use client";

import { useEffect, useRef, useState } from "react";
import { aiJob } from "../../lib/ai-more-client";
import { comparableFacts, targetFacts, type ConceptSuggestion } from "../../lib/concept-ai";
import { generateConceptBudget, type BudgetHistory, type ConceptFactors } from "../../lib/historical-budget";
import type { Project } from "../../lib/projects";
import { Badge, Button, Empty, Modal, PreviewNote } from "./shared";

export function ComparableRanking({ suggestion, selected, onSelect }: { suggestion: ConceptSuggestion; selected: string[]; onSelect: (id: string, use: boolean) => void }) {
  return <div className="concept-ranking">{suggestion.comparables.map((item, i) => <article key={item.id}><label><input type="checkbox" checked={selected.includes(item.id)} onChange={e => onSelect(item.id, e.target.checked)}/><strong>{i + 1}. {item.name}</strong><Badge tone={item.score >= 60 ? "green" : "amber"}>{item.score}/100 match</Badge></label><div className="concept-score" aria-hidden="true"><i style={{ width: `${item.score}%` }}/></div><p>{item.reasons || "No explanation returned. Review the project's recorded facts before selecting it."}</p></article>)}</div>;
}
export function initialComparables(suggestion: ConceptSuggestion) { return suggestion.comparables.filter(c => c.score >= 60).map(c => c.id); }

export function ConceptAiReview({ project, history, onUse }: { project: Project; history: BudgetHistory[]; onUse: (ids: string[], factors: ConceptFactors) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<ConceptSuggestion | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [factors, setFactors] = useState<ConceptFactors>({ locationIndex: 100, costIndex: 100, profileFactor: 1, basis: "" });
  const control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  async function suggest() {
    const abort = new AbortController(); control.current = abort; setOpen(true); setBusy(true); setError(""); setResult(null);
    try {
      const next = await aiJob<ConceptSuggestion>("concept-comparables", { project: targetFacts(project), records: comparableFacts(history) }, abort.signal);
      if (abort.signal.aborted) return;
      setResult(next); setSelected(initialComparables(next)); setFactors(next.factors);
    } catch (failure) { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Comparable projects could not be suggested."); }
    finally { if (control.current === abort) { setBusy(false); control.current = null; } }
  }
  function useSelection() {
    const chosen = history.filter(record => selected.includes(record.id));
    if (!chosen.length) { setError("Select at least one historical project."); return; }
    try { generateConceptBudget(project, chosen, factors); onUse(chosen.map(c => c.id), factors); setOpen(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Check the selected projects and adjustment factors."); }
  }
  return <><Button disabled={!history.length || busy} onClick={suggest}>Suggest comparables with AI</Button>{open && <Modal wide title="Review AI comparables" subtitle={`${project.name} · ${Math.min(50, history.length)} historical budgets`} onClose={() => { control.current?.abort(); setOpen(false); }}>
    <PreviewNote>AI suggests matches and adjustments. Costs come from your selected historical budget lines. Confirm the index source and its base before applying a factor.</PreviewNote>
    {busy && <p role="status">Comparing project type, city, area, stage, tax status and project requirements… <Button onClick={() => control.current?.abort()}>Stop comparison</Button></p>}
    {error && <p role="alert">{error}</p>}
    {result && <><ComparableRanking suggestion={result} selected={selected} onSelect={(id, use) => setSelected(ids => use ? [...ids, id] : ids.filter(value => value !== id))}/>{!result.comparables.length && <Empty title="No comparable projects returned" description="Review the historical projects' facts, then try again."/>}
      <h3>Proposed adjustments</h3><div className="ui-form-grid">{(["locationIndex", "costIndex", "profileFactor"] as const).map((key, i) => <label className="ui-field" key={key}>{["Target location index", "Target cost index", "Project profile factor"][i]}<input type="number" step="any" min=".0001" max={key === "profileFactor" ? 10 : 1000} value={factors[key]} onChange={e => setFactors({ ...factors, [key]: Number(e.target.value) })}/></label>)}<label className="ui-field full">Adjustment source and explanation<textarea rows={4} maxLength={2000} value={factors.basis} onChange={e => setFactors({ ...factors, basis: e.target.value })}/></label></div>
      {result.notes.map((note, i) => <p key={i}>{note}</p>)}<p>{selected.length} selected. Scores of 60 and above start selected; change the ticks to choose your own comparison.</p><div className="concept-ai-actions"><Button onClick={suggest}>Suggest again</Button><Button variant="primary" disabled={!selected.length} onClick={useSelection}>Use selected comparables</Button></div>
    </>}{!busy && !result && <Button onClick={suggest}>Try comparison again</Button>}
  </Modal>}</>;
}
