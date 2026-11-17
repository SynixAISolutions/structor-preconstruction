"use client";

import { useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, Stats, usd, type ViewProps } from "./shared";
import { exportRows } from "../../lib/format";
import { budgetTotals } from "../../lib/budget";
import { useBudget } from "../../lib/use-budget";
import { useAward } from "../../lib/use-award";
import { useLocalDraft } from "../../lib/use-local-draft";
import { initialBidders, type Bidder } from "../../lib/data/commercial";
import { REMOVED_COMPANIES_KEY, withStartingCompanies } from "../../lib/directory";
import { ComplianceRuleError, EMPTY_COMPLIANCE, complianceReport, complianceRows, setCompanyCertification, setWageScaleCompliance, type ComplianceRow, type ComplianceState, type WageScaleStatus } from "../../lib/compliance";
import type { Project } from "../../lib/projects";
import "./compliance.css";

const ACTOR = "Marcel Khoury";
const percentText = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

/**
 * Compliance, the last step of Subcontractor outreach (Marcel's feedback log, 7 Nov): every awarded subcontractor against
 * the project's wage scale and certification targets, and how far the awarded contracts go toward each target.
 */
export function ComplianceView({ project, navigate, notify, projectName }: ViewProps & { project: Project }) {
  const { state: budget } = useBudget();
  const { state: awards } = useAward();
  const [saved, setDirectory] = useLocalDraft<Bidder[]>("directory", initialBidders);
  const [removed] = useLocalDraft<string[]>(REMOVED_COMPANIES_KEY, []);
  const [state, setState] = useLocalDraft<ComplianceState>("compliance", EMPTY_COMPLIANCE);
  const [editing, setEditing] = useState<{ row: ComplianceRow; program: string } | null>(null);
  const [wageNote, setWageNote] = useState<ComplianceRow | null>(null);
  const [error, setError] = useState("");
  const directory = withStartingCompanies(saved, removed);
  const total = budgetTotals(budget).totalBudget;
  const report = complianceReport({ project, budgetTotal: total, awards: awards.awards, directory, state });
  const awardIds = report.rows.map(r => r.awardId);
  const targetsSet = report.programs.some(p => p.target !== null);

  const run = (action: () => void, done?: string) => {
    try { action(); setError(""); if (done) notify(done); return true; }
    catch (e) { if (e instanceof ComplianceRuleError) { setError(e.message); return false; } throw e; }
  };
  const setWage = (row: ComplianceRow, status: WageScaleStatus | null, note?: string) =>
    run(() => setState(setWageScaleCompliance(state, awardIds, row.awardId, status, note, ACTOR)), note !== undefined ? `Wage scale note saved for ${row.company}.` : undefined);
  function savePercent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing?.row.companyId) return;
    const raw = String(new FormData(event.currentTarget).get("percent") ?? "").trim().replace(/%$/, "");
    const percent = raw === "" ? null : Number(raw);
    if (run(() => setDirectory(setCompanyCertification(directory, editing.row.companyId!, editing.program, percent)), percent === null ? `${editing.program} cleared for ${editing.row.company}.` : `${editing.row.company} is ${percentText(percent)} ${editing.program}.`)) setEditing(null);
  }

  const wage = report.wageScale;
  const stats = [
    ...report.programs.map(p => ({
      label: `${p.program}${p.target !== null ? ` · ${percentText(p.target)} required` : ""}`,
      value: usd(p.counted),
      detail: p.required === null ? (p.target === null ? "No % required set" : "Needs a budget or project value") : p.met ? `Met: ${usd(p.required)} required` : `${usd(p.shortfall ?? 0)} still needed of ${usd(p.required)}`,
      tone: p.met === null ? "" : p.met ? "green" : "orange",
    })),
    { label: "Wage scale", value: wage.required === true ? `${wage.compliant} of ${report.awarded}` : wage.required === false ? "None" : "Not confirmed", detail: wage.required === true ? `${wage.type || "Type not recorded"} · compliant${wage.notCompliant ? ` · ${wage.notCompliant} not compliant` : ""}` : wage.required === false ? "No wage scale on this project" : "Set it in Project information", tone: wage.required === true && wage.notCompliant ? "orange" : wage.required === true && wage.compliant === report.awarded && report.awarded ? "green" : "" },
  ];

  return <>
    <PageHeader eyebrow={`${projectName} / Subcontractor outreach`} title="Compliance" description="Every awarded subcontractor against the project's wage scale and certification requirements, and how far the awarded contracts go toward each."
      actions={<><Button onClick={() => navigate("information")}>Set requirements</Button><Button disabled={!report.rows.length} onClick={() => exportRows(`compliance-${project.id}.csv`, complianceRows(report))}><Download size={15}/>Export CSV</Button></>}/>
    {!project.certifications.length && project.kickoff?.wageScale !== true && <Panel><Empty title="No requirements set yet" description="Add the certification programs and the % each requires, and whether there's a wage scale, in Project information. They're usually in the RFP." action={<Button variant="primary" onClick={() => navigate("information")}>Open Project information</Button>}/></Panel>}
    {(project.certifications.length > 0 || project.kickoff?.wageScale === true) && <Stats items={stats}/>}
    {project.certifications.length > 0 && <p className="compliance-base">{report.base === null ? "Targets need a total to be a share of: build the Budget summary, or enter the internal project value in Project information." : `Targets are shares of ${report.baseSource === "budget" ? "the Budget summary's total" : "the internal project value"}, ${usd(report.base)}.`}{!targetsSet && " No % required is set yet: add one beside each program in Project information."}</p>}
    {error && <p className="cm-form-error" role="alert">{error}</p>}
    <Panel title="Awarded subcontractors" subtitle={report.rows.length ? `${report.rows.length} awarded ${report.rows.length === 1 ? "trade" : "trades"} · percents are saved on the company in the Subcontractor directory` : undefined}>
      {!report.rows.length ? <Empty title="No trades awarded yet" description="Award a trade in Contracts & exhibits and it appears here with its contract value." action={<Button onClick={() => navigate("buyout")}>Open Scope review & buyout</Button>}/> :
      <div className="ui-table-wrap"><table className="ui-table compliance-table">
        <thead><tr><th>Trade</th><th>Subcontractor</th><th className="num">Contract value</th>{project.kickoff?.wageScale === true && <th>Wage scale</th>}{project.certifications.map(program => <th key={program} className="num">{program}</th>)}</tr></thead>
        <tbody>{report.rows.map(row => <tr key={row.awardId}>
          <th scope="row">{row.trade}<small>{row.code}</small></th>
          <td>{row.company}{!row.companyId && <small>Not in the directory: add it there to record certifications</small>}</td>
          <td className="num">{usd(row.amount)}</td>
          {project.kickoff?.wageScale === true && <td><select aria-label={`Wage scale, ${row.company}`} value={row.wageScale ?? ""} onChange={e => setWage(row, (e.target.value || null) as WageScaleStatus | null)}><option value="">Not confirmed</option><option value="compliant">Compliant</option><option value="not-compliant">Not compliant</option></select><button type="button" className="cm-text-button compliance-note" onClick={() => setWageNote(row)}>{row.note ? "Edit note" : "Add note"}</button>{row.note && <small>{row.note}</small>}</td>}
          {row.programs.map(p => <td key={p.program} className="num">
            {p.percent === null ? <Badge tone="neutral">Not recorded</Badge> : <><strong>{percentText(p.percent)}</strong><small>{usd(p.counted ?? 0)} counts</small></>}
            <button type="button" className="cm-text-button" disabled={!row.companyId} onClick={() => { setError(""); setEditing({ row, program: p.program }); }}>Set %</button>
          </td>)}
        </tr>)}</tbody>
        {project.certifications.length > 0 && <tfoot><tr><th scope="row">Total</th><td/><td className="num">{usd(report.rows.reduce((t, r) => t + r.amount, 0))}</td>{project.kickoff?.wageScale === true && <td/>}{report.programs.map(p => <td key={p.program} className="num"><strong>{usd(p.counted)}</strong>{p.share !== null && <small>{percentText(p.share)} of the total{p.target !== null ? ` · ${percentText(p.target)} required` : ""}</small>}{p.unknown > 0 && <small>{p.unknown} not recorded</small>}</td>)}</tr></tfoot>}
      </table></div>}
    </Panel>
    {editing && <Modal title={`${editing.program} share · ${editing.row.company}`} subtitle="The share of this company's work that counts toward the program: 100 for a certified firm, less for a joint venture. Saved on the company in the Subcontractor directory, for every project." onClose={() => setEditing(null)}>
      <form onSubmit={savePercent}><label className="ui-field">Percent<input name="percent" autoFocus inputMode="decimal" defaultValue={directory.find(c => c.id === editing.row.companyId)?.certifications?.find(c => c.program.toLowerCase() === editing.program.toLowerCase())?.percent ?? ""} placeholder="e.g. 100"/></label><p className="intel-muted intel-small">Leave it blank to clear it.</p>{error && <p className="cm-form-error" role="alert">{error}</p>}<div className="cm-form-footer"><Button onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">Save</Button></div></form>
    </Modal>}
    {wageNote && <Modal title={`Wage scale note · ${wageNote.company}`} subtitle={wageNote.trade} onClose={() => setWageNote(null)}>
      <form onSubmit={e => { e.preventDefault(); if (setWage(wageNote, wageNote.wageScale, String(new FormData(e.currentTarget).get("note") ?? ""))) setWageNote(null); }}><label className="ui-field">Note<textarea name="note" rows={4} maxLength={1000} autoFocus defaultValue={wageNote.note} placeholder="e.g. Certified payrolls received through October"/></label>{error && <p className="cm-form-error" role="alert">{error}</p>}<div className="cm-form-footer"><Button onClick={() => setWageNote(null)}>Cancel</Button><Button type="submit" variant="primary">Save note</Button></div></form>
    </Modal>}
  </>;
}
