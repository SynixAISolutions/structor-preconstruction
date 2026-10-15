"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { WorkBook } from "xlsx";
import { applyConceptBudget, generateConceptBudget, parseBudgetSheet, validateBudgetHistory, type BudgetHistory, type ConceptFactors } from "../../lib/historical-budget";
import { ESTIMATE_STAGES, estimateStageLabel, PROJECT_TYPES, TAX_STATUSES, WORK_TYPES, type Project } from "../../lib/projects";
import type { useBudget } from "../../lib/use-budget";
import { useLocalDraft } from "../../lib/use-local-draft";
import { draftStorageKey } from "../../lib/project-scope";
import { Button, Empty, Panel, Stats, exportRows, type ViewProps, usd } from "./shared";
import "./concept-budget.css";

const rate = (value: number) => `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}/SF`;
const total = (record: BudgetHistory) => record.lines.filter(line => !line.byOwner).reduce((sum, line) => sum + line.amount, 0);

export function ConceptBudgetView({ project, budget, notify, navigate }: { project: Project; budget: ReturnType<typeof useBudget> } & Pick<ViewProps, "notify" | "navigate">) {
  const [savedHistory, setHistory] = useLocalDraft<BudgetHistory[]>("budget-history", []);
  const library = useMemo(() => {
    try {
      if (!Array.isArray(savedHistory)) throw new Error();
      savedHistory.forEach(validateBudgetHistory);
      if (new Set(savedHistory.map(record => record.id)).size !== savedHistory.length) throw new Error();
      return { records: savedHistory, error: "" };
    } catch { return { records: [], error: "The saved historical library contains invalid data. Its browser copy is kept; recover it before adding another budget." }; }
  }, [savedHistory]);
  const history = library.records;
  const [selected, setSelected] = useState<string[]>([]), [book, setBook] = useState<WorkBook | null>(null), [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [factors, setFactors] = useState<ConceptFactors>({ locationIndex: 100, costIndex: 100, profileFactor: 1, basis: "" });
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const imported = useMemo(() => {
    if (!book || !sheet) return null;
    return { book, sheet };
  }, [book, sheet]);
  const [detail, setDetail] = useState<ReturnType<typeof parseBudgetSheet> | null>(null);
  useEffect(() => {
    let live = true; setDetail(null);
    if (imported) import("xlsx").then(xlsx => {
      const ws = imported.book.Sheets[imported.sheet];
      if (xlsx.utils.decode_range(ws["!ref"] ?? "A1").e.r >= 5000) throw new Error("Choose a budget summary with at most 5,000 rows.");
      const result = parseBudgetSheet(xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }), ws);
      if (live) { setDetail(result); setError(""); }
    }).catch(failure => { if (live) setError(failure instanceof Error ? failure.message : "The budget could not be read."); });
    return () => { live = false; };
  }, [imported]);
  const comparison = useMemo(() => {
    const chosen = history.filter(record => selected.includes(record.id));
    if (!chosen.length) return { result: null, error: "Choose historical projects to preview a concept budget." };
    try { return { result: generateConceptBudget(project, chosen, factors), error: "" }; }
    catch (failure) { return { result: null, error: failure instanceof Error ? failure.message : "The concept could not be generated." }; }
  }, [project, history, selected, factors]);

  async function openFile(file?: File) {
    const id = ++request.current; setBook(null); setDetail(null); setError("");
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name) || file.size > 20_000_000) { setError("Choose an XLSX or CSV budget of at most 20 MB."); return; }
    setBusy(true);
    try {
      const xlsx = await import("xlsx"), data = await file.arrayBuffer();
      const next = xlsx.read(data, { type: "array", cellFormula: true, sheetRows: 5001 });
      if (id !== request.current) return;
      setBook(next); setFileName(file.name); setSheet(next.SheetNames.find(name => name.toLowerCase() === "estimate summary") ?? next.SheetNames[0]);
    } catch (failure) { if (id === request.current) setError(failure instanceof Error ? failure.message : "The workbook could not be opened."); }
    finally { if (id === request.current) setBusy(false); }
  }
  function saveHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail || library.error) return;
    const form = new FormData(event.currentTarget), value = (name: string) => String(form.get(name) ?? "").trim();
    try {
      const record = validateBudgetHistory({ id: crypto.randomUUID(), name: value("name"), location: value("location"), type: value("type"), year: Number(value("year")), squareFeet: Number(value("area")), stage: value("stage") as BudgetHistory["stage"], workType: value("work") as BudgetHistory["workType"] || null, taxStatus: value("tax") as BudgetHistory["taxStatus"] || null, certifications: value("certifications").split(",").map(s => s.trim()).filter(Boolean), locationIndex: Number(value("locationIndex")), costIndex: Number(value("costIndex")), source: `${fileName} · ${sheet}`, lines: detail.lines });
      if (history.some(item => item.name.toLowerCase() === record.name.toLowerCase() && item.year === record.year && item.source === record.source)) throw new Error("That project and source are already in the library.");
      const next = [...history, record];
      localStorage.setItem(draftStorageKey(project.id, "budget-history"), JSON.stringify(next));
      setHistory(next); setSelected(ids => [...ids, record.id]); setBook(null); setDetail(null); setError(""); notify("Historical budget saved in this browser's shared library.");
    } catch (failure) { setError(failure instanceof Error && failure.name !== "QuotaExceededError" ? failure.message : "There is not enough browser storage. Export the library before adding more."); }
  }
  const result = comparison.result, snapshot = budget.state.conceptSource;
  return <div className="concept-budget">
    <Panel title="Historical concept budget" subtitle={`${estimateStageLabel(project.estimateStage)} · ${project.squareFeet.toLocaleString()} SF gross building area · ${project.type}`}>
      <p>Select comparable uploaded budgets, then review their cost-per-square-foot build and adjustments. No project history is preloaded.</p>
      {!project.estimateStage && <p role="status">Record this project's estimate stage before generating a budget. <Button onClick={() => navigate("information")}>Open project information</Button></p>}
      <details><summary>Upload a historical budget</summary><p>Choose an Estimate Summary workbook or the app's budget CSV export. Flat imports need Description, Class (direct/indirect) and Budget columns; optional Cost center, CSI and By owner columns retain the cost breakdown.</p><label className="ui-field">Historical budget file<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={event => openFile(event.target.files?.[0])}/></label>{busy && <p role="status">Reading budget…</p>}
        {book && <label className="ui-field">Budget worksheet<select value={sheet} onChange={event => setSheet(event.target.value)}>{book.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label>}
        {detail && <form onSubmit={saveHistory} key={fileName + sheet}><p>{detail.lines.length} detail lines · Contractor total {usd(detail.total)}{detail.sourceTotal !== null && ` · Reconciled source total ${usd(detail.sourceTotal)}`}. Owner-carried costs are excluded from contractor totals.</p><div className="ui-form-grid">
          <label className="ui-field">Historical project name<input name="name" required maxLength={200} defaultValue={fileName.replace(/\.[^.]+$/, "")}/></label>
          <label className="ui-field">Historical location<input name="location" required maxLength={300}/></label>
          <label className="ui-field">Historical project type<select name="type" required defaultValue=""><option value="">Choose type</option>{PROJECT_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="ui-field">Historical estimate stage<select name="stage" required defaultValue=""><option value="">Choose stage</option>{ESTIMATE_STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></label>
          <label className="ui-field">Estimate year<input name="year" type="number" required min="1900" max="2200"/></label>
          <label className="ui-field">Gross building area · SF<input name="area" type="number" required min="1" max="1000000000" step="any"/></label>
          <label className="ui-field">Historical work type<select name="work" defaultValue=""><option value="">Not recorded</option>{WORK_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label className="ui-field">Historical tax status<select name="tax" defaultValue=""><option value="">Not recorded</option>{TAX_STATUSES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label className="ui-field full">Certifications and labor requirements<input name="certifications" placeholder="Comma-separated, e.g. CBE, First Source, Union labor" maxLength={1000}/></label>
          <label className="ui-field">Historical location index<input name="locationIndex" type="number" required min=".0001" max="1000" step="any" defaultValue="100"/></label>
          <label className="ui-field">Historical cost index<input name="costIndex" type="number" required min=".0001" max="1000" step="any" defaultValue="100"/></label>
        </div><p>Use a consistent index source and base for historical and target values. An index of 100 on both applies no adjustment.</p><Button type="submit" variant="primary">Save historical budget</Button></form>}
      </details>
      {(error || library.error) && <p role="alert">{error || library.error}</p>}
    </Panel>
    <Panel title="Comparable project library" subtitle="Shared across projects in this browser. Source files stay local; export a CSV copy of the library for your records." action={<Button disabled={!history.length} onClick={() => exportRows("budget-history.csv", [["Project", "Year", "Type", "Location", "Stage", "Work type", "Tax status", "Certifications", "Gross SF", "Source", "Cost center", "Class", "CSI", "Description", "Budget", "By owner", "Location index", "Cost index"], ...history.flatMap(record => record.lines.map(line => [record.name, record.year, record.type, record.location, record.stage, record.workType ?? "", record.taxStatus ?? "", record.certifications.join(", "), record.squareFeet, record.source, line.costCenter, line.classification, line.csiCode ?? "", line.description, line.amount, line.byOwner ? "Yes" : "No", record.locationIndex, record.costIndex]))])}>Export history</Button>}>
      {!history.length ? <Empty title="No historical budgets uploaded" description="Upload a previous project's detailed budget to start a source-based comparison."/> : <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Use</th><th>Project and source</th><th>Profile</th><th>Area</th><th>Contractor budget</th><th>Cost / SF</th></tr></thead><tbody>{history.map(record => <tr key={record.id}><td><input type="checkbox" aria-label={`Use ${record.name}`} checked={selected.includes(record.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, record.id] : ids.filter(id => id !== record.id))}/></td><td><strong>{record.name}</strong><small>{record.source}</small></td><td>{record.year} · {estimateStageLabel(record.stage)}<small>{record.type} · {record.location}</small><small>{record.workType ?? "Work type not recorded"} · {record.taxStatus ?? "Tax status not recorded"} · {record.certifications.join(", ") || "No requirements recorded"}</small></td><td>{record.squareFeet.toLocaleString()} SF</td><td>{usd(total(record))}</td><td>{rate(total(record) / record.squareFeet)}</td></tr>)}</tbody></table></div>}
    </Panel>
    <Panel title="Target adjustments" subtitle="Factors are explicit estimator inputs. RSMeans is not connected; licensed figures can be entered with their source.">
      <div className="ui-form-grid">{([["locationIndex", "Target location index"], ["costIndex", "Target cost index"], ["profileFactor", "Project profile factor"]] as const).map(([name, label]) => <label className="ui-field" key={name}>{label}<input type="number" min=".0001" max={name === "profileFactor" ? "10" : "1000"} step="any" value={factors[name]} onChange={event => setFactors(current => ({ ...current, [name]: Number(event.target.value) }))}/></label>)}<label className="ui-field full">Adjustment source and explanation<textarea maxLength={2000} value={factors.basis} onChange={event => setFactors(current => ({ ...current, basis: event.target.value }))} placeholder="Index source/date and scope, certification, tax or labor adjustments"/></label></div>
      <p>For each source: cost × target location index ÷ historical location index × target cost index ÷ historical cost index. Divide combined adjusted costs by their recorded gross area, then multiply by target gross area and the project profile factor.</p>
    </Panel>
    {result ? <><Stats items={[{ label: "Concept budget", value: usd(result.total), detail: "Direct and indirect; owner-carried costs excluded" }, { label: "Concept cost / SF", value: rate(result.total / result.area), detail: `${result.area.toLocaleString()} SF gross building area` }, { label: "Historical projects", value: result.records.length, detail: "Explicitly selected sources" }, { label: "Cost lines", value: result.lines.length, detail: "Detailed source-based build" }]}/>
      <Panel title="Concept budget preview" action={<Button onClick={() => exportRows("concept-budget.csv", [["Cost center", "Class", "CSI", "Description", "Budget", "By owner", "Gross SF basis", "Adjusted cost / SF", "Projects recording line", "Location index", "Cost index", "Profile factor", "Adjustment source", "Historical sources"], ...result.lines.map(line => [line.costCenter, line.classification, line.csiCode ?? "", line.description, line.amount, line.byOwner ? "Yes" : "No", result.area, line.unitCost, line.observations, factors.locationIndex, factors.costIndex, factors.profileFactor, factors.basis, result.records.map(record => `${record.name}: ${record.source}`).join("; ")])])}>Export concept budget</Button>}>
        {result.warnings.map(warning => <p key={warning}>{warning}</p>)}<div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Cost line</th><th>Cost center</th><th>Class</th><th>Adjusted cost / SF</th><th>Budget</th><th>Source coverage</th></tr></thead><tbody>{result.lines.map((line, index) => <tr key={index}><td>{line.csiCode} {line.description}{line.byOwner && <small>By owner · excluded</small>}</td><td>{line.costCenter}</td><td>{line.classification}</td><td>{rate(line.unitCost)}</td><td>{usd(line.amount)}</td><td>{line.observations} / {result.records.length}</td></tr>)}</tbody></table></div>
        <Button variant="primary" disabled={!!budget.state.lines.length || !!budget.state.allowances.length} onClick={() => { try { const problem = budget.run(state => applyConceptBudget(state, result, "Marcel Khoury")); if (problem) throw new Error(Object.values(problem)[0]); setError(""); notify("Concept budget created as draft cost lines. Review before approval."); } catch (failure) { setError(failure instanceof Error ? failure.message : "The budget could not be applied."); } }}>Create project budget from this concept</Button>{(!!budget.state.lines.length || !!budget.state.allowances.length) && <p>The project already has a cost plan. Export this concept for comparison; the existing budget and commitments are kept.</p>}
      </Panel></> : <p role="status">{comparison.error}</p>}
    {snapshot && <Panel title="Applied concept source"><p>{snapshot.records.map(record => record.name).join(", ")} · {usd(snapshot.total)} generated for {snapshot.area.toLocaleString()} SF · {snapshot.appliedBy} · {snapshot.appliedAt.slice(0, 10)}</p><p>{snapshot.factors.basis || "No index or profile adjustment."} Later edits to project area, history or factors do not change the saved cost plan.</p></Panel>}
  </div>;
}
