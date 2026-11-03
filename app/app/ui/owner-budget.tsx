"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCw, Sparkles } from "lucide-react";
import { latestDocuments } from "../../lib/project-files";
import { readOwnerBudget, useProjectDocuments } from "../../lib/project-files-client";
import { applyOwnerBudget, matchBudgetLine, OWNER_BUDGET_KEY, type OwnerBudgetLine, type OwnerBudgetReading } from "../../lib/owner-budget";
import type { BudgetErrors, BudgetState } from "../../lib/budget";
import { readDraft, useLocalDraft } from "../../lib/use-local-draft";
import type { Project } from "../../lib/projects";
import type { Screen } from "../../lib/screens";
import { Badge, Button, Empty, Panel, usd } from "./shared";
import "./owner-budget.css";

const actor = "Marcel Khoury";

/**
 * The owner's budget, read from its file (Marcel, 24 Oct: "the budget upload is optional and the AI extracts from
 * it"). The newest PDF in the Budget folder is read when this tab opens and hasn't been read yet; the estimator
 * ticks the lines to keep and puts them in the budget (lib/owner-budget).
 */
export function OwnerBudgetView({ project, budget, notify, navigate }: { project: Project; budget: { state: BudgetState; run: (action: (s: BudgetState) => BudgetState) => BudgetErrors | null }; notify: (message: string) => void; navigate: (screen: Screen) => void }) {
  const { documents, ready } = useProjectDocuments(project.id);
  const files = useMemo(() => latestDocuments(documents).filter(d => d.category === "Budget").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), [documents]);
  const [reading, setReading] = useLocalDraft<OwnerBudgetReading | null>(OWNER_BUDGET_KEY, null);
  const [docId, setDocId] = useState("");
  const doc = files.find(f => f.id === docId) ?? files.find(f => f.id === reading?.docId) ?? files[0] ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const costCenters = budget.state.costCenters.map(c => c.name);
  const [costCenter, setCostCenter] = useState(costCenters[0] ?? "Base building");
  const tried = useRef(new Set<string>());

  async function read(target = doc) {
    if (!target) return;
    tried.current.add(target.id);
    setBusy(true); setError("");
    try {
      const found = await readOwnerBudget(target);
      setReading({ docId: target.id, docName: target.name, model: found.model, at: new Date().toISOString(), lines: found.lines });
      setSkipped(new Set());
      if (!found.lines.length) setError("The AI found no cost lines with their amounts printed on the pages. Check that the file is the budget itself.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The budget could not be read.");
    } finally {
      setBusy(false);
    }
  }
  // Read once, when a budget file is here that hasn't been read (the saved reading, not this render's copy, which is
  // still empty on the first render).
  useEffect(() => {
    if (!ready || !doc || busy || tried.current.has(doc.id) || readDraft<OwnerBudgetReading | null>(project.id, OWNER_BUDGET_KEY, null)?.docId === doc.id) return;
    void read(doc);
  }, [ready, doc?.id, reading?.docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = reading && doc && reading.docId === doc.id ? reading.lines : [];
  const chosen = lines.filter((_, i) => !skipped.has(i));
  // What each line would fill, in order, as applyOwnerBudget will.
  const fills = useMemo(() => {
    const taken = new Set<string>();
    return lines.map((line, i) => {
      if (skipped.has(i)) return null;
      const match = matchBudgetLine(budget.state.lines, line, taken);
      if (match) taken.add(match.id);
      return match;
    });
  }, [lines, skipped, budget.state.lines]);
  const total = (kind: OwnerBudgetLine["classification"]) => chosen.filter(l => l.classification === kind).reduce((n, l) => n + l.amount, 0);

  function apply() {
    try {
      const result = applyOwnerBudget(budget.state, chosen, costCenter, actor);
      const problem = budget.run(() => result.state);
      if (problem) throw new Error(Object.values(problem)[0]);
      notify(`${result.updated} budget line${result.updated === 1 ? "" : "s"} updated and ${result.added} added from ${doc?.name}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The lines could not be put in the budget.");
    }
  }

  if (!ready) return <p role="status">Loading the project's files…</p>;
  if (!files.length) return <Empty title="No budget file yet" description="Upload the owner's budget or an earlier estimate (concept, schematic design, design development) to the Budget folder in Project files. The AI reads its cost lines here." action={<Button variant="primary" onClick={() => navigate("documents")}><FileText size={15}/>Open Project files</Button>}/>;

  return <Panel title="Owner's budget" subtitle="Cost lines the AI read from the budget file, each with the page it comes from. Tick the lines to keep, then put them in the budget." action={<div className="owner-budget-tools">
    {files.length > 1 && <label className="ui-field">File<select value={doc?.id} onChange={e => setDocId(e.target.value)}>{files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
    <Button disabled={busy} onClick={() => void read()}>{busy ? <><Sparkles size={15}/>Reading…</> : <><RefreshCw size={15}/>{lines.length ? "Read again" : "Read with AI"}</>}</Button>
  </div>}>
    {busy && <p className="owner-budget-note" role="status">The AI is reading {doc?.name}…</p>}
    {error && <p className="owner-budget-note error" role="alert">{error}</p>}
    {lines.length > 0 && <>
      <div className="ui-table-wrap"><table className="ui-table owner-budget-table"><thead><tr><th><span className="owner-budget-sr">Keep</span></th><th>Cost line</th><th>CSI</th><th>Type</th><th>Amount</th><th>Fills</th><th>Source</th></tr></thead><tbody>
        {lines.map((line, i) => <tr key={i} className={skipped.has(i) ? "skipped" : ""}>
          <td><input type="checkbox" aria-label={`Keep ${line.description}`} checked={!skipped.has(i)} onChange={e => setSkipped(prev => { const next = new Set(prev); if (e.target.checked) next.delete(i); else next.add(i); return next; })}/></td>
          <td><strong>{line.description}</strong></td>
          <td>{line.csiCode ?? "—"}</td>
          <td><Badge tone={line.classification === "direct" ? "blue" : "neutral"}>{line.classification === "direct" ? "Direct" : "Indirect"}</Badge></td>
          <td className="owner-budget-amount">{usd(line.amount)}</td>
          <td>{skipped.has(i) ? "—" : fills[i] ? <>{fills[i]!.description}<small className="owner-budget-was">now {usd(fills[i]!.budget)}</small></> : <em>New line</em>}</td>
          <td><span className="ui-source" title={line.quote}>Page {line.page}</span></td>
        </tr>)}
      </tbody></table></div>
      <div className="owner-budget-apply">
        <p><strong>{chosen.length}</strong> of {lines.length} lines · direct {usd(total("direct"))} · indirect {usd(total("indirect"))}<small>Read by {reading?.model} on {reading ? new Date(reading.at).toLocaleDateString("en-US") : ""}</small></p>
        <label className="ui-field">New lines go to<select value={costCenter} onChange={e => setCostCenter(e.target.value)}>{(costCenters.length ? costCenters : [costCenter]).map(c => <option key={c}>{c}</option>)}</select></label>
        <Button variant="primary" disabled={!chosen.length} onClick={apply}>Put {chosen.length} line{chosen.length === 1 ? "" : "s"} in the budget</Button>
      </div>
    </>}
  </Panel>;
}
