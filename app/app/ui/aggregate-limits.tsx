"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ListChecks, Pencil, Plus } from "lucide-react";
import { exposures, LimitRuleError, NO_LIMITS, setPercentComplete, setSubLimit, type Exposure, type ExposureInput, type LimitErrors, type LimitsState } from "../../lib/aggregate-limits";
import type { AwardState } from "../../lib/award";
import { parseAmount } from "../../lib/budget";
import { initialBidders } from "../../lib/data/commercial";
import { sampleProcurement } from "../../lib/data/procurement";
import { sampleAwards } from "../../lib/data/sample-award";
import type { Procurement } from "../../lib/procurement";
import { loadProjects, sampleProjectRecords } from "../../lib/projects";
import { screenLabel } from "../../lib/screens";
import { readDraft, useLocalDraft } from "../../lib/use-local-draft";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, PreviewNote, Stats, exportRows, usd, type ViewProps } from "./shared";

const actor = "Marcel Khoury";
const money = (value: number | null) => value === null ? "—" : usd(value);
const status = (e: Exposure) => e.overAggregate ? { tone: "red", label: "Over aggregate limit" } : e.overSingle ? { tone: "red", label: "Over single-project limit" } : e.limit ? { tone: "green", label: "Within limits" } : { tone: "neutral", label: "No limits set" };
function FieldError({ error }: { error?: string }) { return error ? <small className="cm-form-error">{error}</small> : null; }

/** Every project's awards and trade names, read from this browser for the open value (lib/aggregate-limits). */
function useAllProjectAwards(): ExposureInput["projects"] {
  const [projects, setProjects] = useState<ExposureInput["projects"]>([]);
  useEffect(() => {
    setProjects((loadProjects() ?? sampleProjectRecords).map(p => ({
      id: p.id, name: p.name,
      awards: readDraft<AwardState>(p.id, "awards", sampleAwards),
      packages: readDraft<Procurement>(p.id, "procurement", sampleProcurement).packages.map(pkg => ({ id: pkg.id, name: pkg.name })),
    })));
  }, []);
  return projects;
}

/**
 * Subcontractor aggregate limits (Marcel, 24 Oct: renamed from prequalification): the contracts team's limits for
 * each subcontractor beside the open value of its contracts on every project.
 */
export function AggregateLimitsView({ navigate }: ViewProps) {
  const [directory] = useLocalDraft("directory", initialBidders);
  const [state, setState] = useLocalDraft<LimitsState>("subcontractor-limits", NO_LIMITS);
  const projects = useAllProjectAwards();
  const rows = exposures({ directory, projects, state });
  const [edit, setEdit] = useState<{ companyId: string } | "new" | null>(null);
  const [contracts, setContracts] = useState<string | null>(null);
  const [errors, setErrors] = useState<LimitErrors>({});
  const over = rows.filter(r => r.overAggregate || r.overSingle);
  const shown = contracts ? rows.find(r => r.companyId === contracts) ?? null : null;
  const editing = edit && edit !== "new" ? rows.find(r => r.companyId === edit.companyId) ?? null : null;

  function apply(action: (current: LimitsState) => LimitsState): boolean {
    try { setState(action(state)); setErrors({}); return true; }
    catch (error) { if (error instanceof LimitRuleError) { setErrors(error.errors); return false; } throw error; }
  }
  function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = (name: string) => { const text = String(form.get(name) ?? "").trim(); return text ? parseAmount(text) ?? Number.NaN : null; };
    const companyId = edit === "new" ? String(form.get("companyId") ?? "") : edit!.companyId;
    if (apply(current => setSubLimit(current, companyId, { singleProject: amount("singleProject"), aggregate: amount("aggregate"), note: String(form.get("note") ?? "") }, actor))) setEdit(null);
  }
  function savePercent(event: FormEvent<HTMLFormElement>, awardId: string) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("percent") ?? "").trim();
    apply(current => setPercentComplete(current, awardId, text === "" ? Number.NaN : Number(text), actor));
  }

  return <div className="cm-view">
    <PageHeader eyebrow="PARTNER NETWORK" title={screenLabel("prequalification")} description="Each subcontractor's single-project and aggregate limits, set by the contracts team, against the open value of its contracts on every project." actions={<>
      <ExportButton onClick={() => exportRows("subcontractor-aggregate-limits.csv", [["Subcontractor", "Single-project limit", "Aggregate limit", "Open contract value", "Largest project", "Largest project open", "Headroom", "Status", "Note"], ...rows.map(r => [r.company, r.limit?.singleProject ?? "", r.limit?.aggregate ?? "", r.open, r.largest?.projectName ?? "", r.largest?.open ?? "", r.headroom ?? "", status(r).label, r.limit?.note ?? ""])])}/>
      <Button variant="primary" onClick={() => { setEdit("new"); setErrors({}); }}><Plus size={16}/>Set limits</Button>
    </>}/>
    <PreviewNote>Textura isn't connected yet, so percent complete is typed for each contract here. A contract with no percent recorded counts as 0% complete: its full amount is open.</PreviewNote>
    <Stats items={[
      { label: "Subcontractors", value: rows.length, detail: `${rows.filter(r => r.limit).length} with limits set` },
      { label: "Over a limit", value: over.length, detail: over.length ? over.map(r => r.company).join(", ") : "Everyone is within their limits", tone: over.length ? "red" : "green" },
      { label: "Open contract value", value: usd(rows.reduce((n, r) => n + r.open, 0)), detail: `Across ${projects.length} project${projects.length === 1 ? "" : "s"}` },
    ]}/>
    <Panel title="Limits and open contract value" subtitle="Open contract value: each awarded contract's amount less its percent complete, on every project. Cancelled awards don't count.">
      {rows.length ? <div className="ui-table-wrap"><table className="ui-table cm-limits-table"><thead><tr><th>Subcontractor</th><th>Single-project limit</th><th>Aggregate limit</th><th>Open contract value</th><th>Largest project</th><th>Headroom</th><th>Status</th><th/></tr></thead><tbody>{rows.map(r => <tr key={r.companyId}>
        <td><div className="cm-table-primary"><strong>{r.company}</strong>{r.limit?.note && <small>{r.limit.note}</small>}</div></td>
        <td className={`cm-money${r.overSingle ? " cm-limit-over" : ""}`}>{money(r.limit?.singleProject ?? null)}</td>
        <td className={`cm-money${r.overAggregate ? " cm-limit-over" : ""}`}>{money(r.limit?.aggregate ?? null)}</td>
        <td className="cm-money"><button type="button" className="cm-text-button" onClick={() => setContracts(r.companyId)}>{usd(r.open)}</button><small className="cm-cell-note">{r.contracts.length} contract{r.contracts.length === 1 ? "" : "s"}</small></td>
        <td>{r.largest ? <>{r.largest.projectName}<small className="cm-cell-note">{usd(r.largest.open)} open</small></> : "—"}</td>
        <td className={`cm-money${r.headroom !== null && r.headroom < 0 ? " cm-limit-over" : ""}`}>{money(r.headroom)}</td>
        <td><Badge tone={status(r).tone}>{status(r).label}</Badge></td>
        <td><div className="cm-budget-actions"><button className="ui-icon-btn" aria-label={`Contracts of ${r.company}`} title="Contracts and percent complete" onClick={() => setContracts(r.companyId)}><ListChecks size={15}/></button><button className="ui-icon-btn" aria-label={`Set limits for ${r.company}`} onClick={() => { setEdit({ companyId: r.companyId }); setErrors({}); }}><Pencil size={15}/></button></div></td>
      </tr>)}</tbody></table></div>
        : <Empty title="No limits or awarded contracts yet" description="Set a subcontractor's limits, or award a trade in Contract & award: its contract then counts here." action={<Button onClick={() => navigate("bidders")}>Open subcontractor directory</Button>}/>}
    </Panel>

    {edit && <Modal title={editing ? `Limits for ${editing.company}` : "Set subcontractor limits"} subtitle="Entered by the contracts team. Leave a limit empty when none applies." onClose={() => setEdit(null)}>
      <form onSubmit={saveLimit}><div className="ui-form-grid">
        {edit === "new" && <label className="ui-field full"><span>Subcontractor</span><select name="companyId" required defaultValue=""><option value="" disabled>Choose a company…</option>{directory.map(d => <option key={d.id} value={d.id}>{d.company}{d.trade ? ` · ${d.trade}` : ""}</option>)}</select><FieldError error={errors.company}/></label>}
        <label className="ui-field"><span>Single-project limit · USD</span><input name="singleProject" inputMode="decimal" defaultValue={editing?.limit?.singleProject ?? ""} placeholder="1,500,000"/><FieldError error={errors.singleProject}/></label>
        <label className="ui-field"><span>Aggregate limit · USD</span><input name="aggregate" inputMode="decimal" defaultValue={editing?.limit?.aggregate ?? ""} placeholder="4,000,000"/><FieldError error={errors.aggregate}/></label>
        <label className="ui-field full"><span>Note</span><input name="note" defaultValue={editing?.limit?.note ?? ""} placeholder="Bonded through …; reviewed …"/></label>
      </div><div className="cm-form-footer"><Button onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" variant="primary">Save limits</Button></div></form>
    </Modal>}

    {shown && <Modal title={`Contracts · ${shown.company}`} subtitle={`${usd(shown.open)} open across ${new Set(shown.contracts.map(c => c.projectId)).size} project(s). Percent complete is typed here until Textura is connected.`} wide onClose={() => { setContracts(null); setErrors({}); }}>
      {shown.contracts.length ? <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Project</th><th>Trade</th><th>Contract</th><th>Percent complete</th><th>Open</th></tr></thead><tbody>{shown.contracts.map(c => <tr key={c.awardId}>
        <td>{c.projectName}</td><td>{c.trade}<small className="cm-cell-note">{c.executed ? "Executed subcontract" : "Awarded, not yet executed"}</small></td><td className="cm-money">{usd(c.amount)}</td>
        <td><form className="cm-limit-percent" onSubmit={event => savePercent(event, c.awardId)}><input name="percent" inputMode="decimal" aria-label={`Percent complete, ${c.projectName} ${c.trade}`} defaultValue={c.percent ?? ""} placeholder="0"/>%<Button type="submit">Save</Button></form>{c.percent === null && <small className="cm-cell-note">Not recorded · counted as 0%</small>}</td>
        <td className="cm-money"><strong>{usd(c.open)}</strong></td>
      </tr>)}</tbody></table></div> : <p className="cm-muted">No awarded contracts on any project yet.</p>}
      <FieldError error={errors.percent}/>
    </Modal>}
  </div>;
}
