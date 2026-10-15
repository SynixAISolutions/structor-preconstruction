"use client";

import { useState, type FormEvent } from "react";
import { BUDGET_VERSION_STAGES, compareBudgetVersions, saveBudgetVersion, type BudgetVersion, type BudgetVersionStage } from "../../lib/budget-versions";
import { budgetTotals, type BudgetState } from "../../lib/budget";
import type { Project } from "../../lib/projects";
import { useLocalDraft } from "../../lib/use-local-draft";
import { draftStorageKey } from "../../lib/project-scope";
import { Badge, Button, Empty, Modal, Panel, Stats, exportRows, type ViewProps } from "./shared";
import { estimateMoney } from "./estimate-format";
import "./workflow-features.css";

export function BudgetVersionsView({ budget, project, notify }: { budget: BudgetState; project: Project; notify: ViewProps["notify"] }) {
  const [saved, setSaved] = useLocalDraft<BudgetVersion[]>("budget-versions", []);
  const versions = saved.filter(v => v.projectId === project.id);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [beforeId, setBeforeId] = useState(""), [afterId, setAfterId] = useState("");
  const [unchanged, setUnchanged] = useState(false);
  const before = versions.find(v => v.id === beforeId) ?? versions[0];
  const after = versions.find(v => v.id === afterId) ?? versions.at(-1);
  const comparison = before && after ? compareBudgetVersions(before, after) : null;
  const rows = comparison?.rows.filter(r => unchanged || r.change !== "Unchanged") ?? [];
  const max = Math.max(1, ...versions.map(v => budgetTotals(v.budget).totalBudget));
  const stage = (v: BudgetVersion) => BUDGET_VERSION_STAGES.find(s => s.value === v.stage)?.label ?? v.stage;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const next = saveBudgetVersion(saved, budget, { projectId: project.id, name: String(form.get("name")), stage: String(form.get("stage")) as BudgetVersionStage, reason: String(form.get("reason")), by: "Marcel Khoury", at: new Date().toISOString() });
      try { localStorage.setItem(draftStorageKey(project.id, "budget-versions"), JSON.stringify(next)); }
      catch { throw new Error("The version was not saved. Browser storage is unavailable or full; export your current budget before leaving."); }
      setSaved(next); setAfterId(next.at(-1)!.id); setSaving(false); setError(""); notify("Budget version saved. Earlier versions and the current budget keep their values.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The version could not be saved."); }
  }
  return <div className="workflow-feature"><Panel title="Budget versions" subtitle="Save a stage with its explanation, then compare retained cost plans." action={<Button variant="primary" onClick={() => { setSaving(true); setError(""); }}>Save budget version</Button>}>
    {!versions.length ? <Empty title="No saved budget versions" description="Save the current cost plan as your first version. Change the budget and save another stage to compare it."/> : <div className="version-list">{versions.map(v => <article key={v.id}><header><strong>{v.name}</strong><Badge>{stage(v)}</Badge><b>{estimateMoney(budgetTotals(v.budget).totalBudget)}</b></header><p>{v.reason}</p><small>{v.by} · {new Date(v.at).toLocaleString()} · {v.budget.lines.length} cost lines</small><div className="version-bar" aria-hidden="true"><i style={{width:`${budgetTotals(v.budget).totalBudget / max * 100}%`}}/></div></article>)}</div>}
    {versions.length > 0 && <Button onClick={() => exportRows("budget-version-history.csv", [["Version", "Stage", "Saved at", "Budget", "Explanation"], ...versions.map(v => [v.name, stage(v), v.at, budgetTotals(v.budget).totalBudget, v.reason])])}>Export version history</Button>}
  </Panel>
    {versions.length > 1 && comparison && before && after && <Panel title="Compare saved versions" subtitle="Added and removed lines stay separate. Owner costs and linked allowances are excluded from duplicate totals."><div className="ui-form-grid"><label className="ui-field">Earlier version<select value={before.id} onChange={e => setBeforeId(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>{v.name} · {stage(v)}</option>)}</select></label><label className="ui-field">Later version<select value={after.id} onChange={e => setAfterId(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>{v.name} · {stage(v)}</option>)}</select></label></div>
      <Stats items={[{label:"Earlier budget",value:estimateMoney(comparison.beforeTotal)},{label:"Later budget",value:estimateMoney(comparison.afterTotal)},{label:"Budget movement",value:estimateMoney(comparison.delta),detail:comparison.delta>0?"Increase":comparison.delta<0?"Decrease":"No amount change"}]}/>
      <p><strong>Later version explanation:</strong> {after.reason}</p><label className="workflow-check"><input type="checkbox" checked={unchanged} onChange={e => setUnchanged(e.target.checked)}/>Show unchanged lines</label>
      <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Cost line</th><th>Cost center</th><th>Earlier</th><th>Later</th><th>Movement</th><th>Change</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><th scope="row">{r.description}<small>{r.basis}</small></th><td>{r.center}</td><td>{estimateMoney(r.before)}</td><td>{estimateMoney(r.after)}</td><td>{estimateMoney(r.delta)}</td><td>{r.change}</td></tr>)}</tbody></table></div>{!rows.length && <p>No changed lines in these versions.</p>}
      <Button onClick={() => exportRows("budget-version-comparison.csv", [["Line", "Cost center", "Earlier", "Later", "Movement", "Change"], ...comparison.rows.map(r => [r.description, r.center, r.before, r.after, r.delta, r.change])])}>Export comparison</Button>
    </Panel>}
    {saving && <Modal title="Save budget version" subtitle="Retains a copy of the current budget and its sources. This does not change the working cost plan." onClose={() => setSaving(false)}><form onSubmit={save}><label className="ui-field">Version name<input name="name" required placeholder="For example, Concept review 1"/></label><label className="ui-field">Estimate stage<select name="stage" required defaultValue={project.estimateStage ?? ""}><option value="" disabled>Choose stage</option>{BUDGET_VERSION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label><label className="ui-field">Why this version / what changed<textarea name="reason" required rows={3} placeholder="Record the baseline or explain the design and cost changes."/></label>{error && <p role="alert">{error}</p>}<div className="proc-form-actions"><Button onClick={() => setSaving(false)}>Cancel</Button><Button type="submit" variant="primary">Save version</Button></div></form></Modal>}
  </div>;
}
