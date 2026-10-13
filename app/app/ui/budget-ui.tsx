"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, FileText, Link2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  addAllowance, addBudgetLine, applyEstimateValue, applyLevelingValue, approveBudgetLine, budgetTotals,
  costPerSquareFoot, editAllowance, editBudgetLine, linkBudgetLine, parseAmount, removeAllowance,
  removeBudgetLine, reopenBudgetLine, totalsByCostCenter, totalsByDivision,
  type BudgetAllowance, type BudgetErrors, type BudgetLine, type LevelingBasis,
} from "../../lib/budget";
import { useBudget } from "../../lib/use-budget";
import { useEstimate } from "../../lib/use-estimate";
import { budgetLinesForTrade } from "../../lib/estimate";
import { useLevelingComparison } from "./use-leveling-comparison";
import { EstimateBasisLabel, EstimateBudgetChoice, estimateForecastError } from "./estimate-budget-choice";
import { TradeVarianceReport } from "./trade-variance";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, PreviewNote, Source, Stats, Tabs, exportRows, usd, type ViewProps } from "./shared";

const actor = "Marcel Khoury";
const palette = ["#f47640", "#3e6a81", "#759283", "#c2a276", "#8996b2", "#6f8c72"];
const basisLabels: Record<LevelingBasis, string> = { base: "Base bid", provisional: "Provisional total", reviewed: "Reviewed total" };
const allowanceLabels = { review: "Needs review", included: "Included", excluded: "Excluded" } as const;
const usdPerSquareFoot = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)}/SF`;

function FieldError({ error }: { error?: string }) { return error ? <small className="cm-form-error">{error}</small> : null; }
function amount(value: FormDataEntryValue | null, optional = false) {
  const text = String(value ?? "").trim();
  if (optional && !text) return null;
  const parsed = parseAmount(text);
  if (parsed !== null) return parsed;
  const numeric = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function LineForm({ line, costCenters, errors, onSubmit, onCancel }: { line: BudgetLine | null; costCenters: string[]; errors: BudgetErrors; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit}>
    <div className="ui-form-grid">
      <label className="ui-field full"><span>Description</span><input name="description" required defaultValue={line?.description ?? ""}/><FieldError error={errors.description}/></label>
      <label className="ui-field"><span>Cost center</span><input name="costCenter" list="budget-cost-centers" required defaultValue={line?.costCenter ?? costCenters[0] ?? "Project-wide"}/><datalist id="budget-cost-centers">{costCenters.map(center => <option key={center} value={center}/>)}</datalist><FieldError error={errors.costCenter}/></label>
      <label className="ui-field"><span>Cost class</span><select name="classification" defaultValue={line?.classification ?? "direct"}><option value="direct">Direct construction</option><option value="indirect">Indirect cost</option></select><FieldError error={errors.classification}/></label>
      <label className="ui-field"><span>CSI division or section</span><input name="csiCode" placeholder="03 or 03 30 00" defaultValue={line?.csiCode ?? ""}/><FieldError error={errors.csiCode}/></label>
      <label className="ui-field"><span>Owner</span><input name="owner" defaultValue={line?.owner ?? ""}/></label>
      <label className="ui-field"><span>Budget · USD</span><input name="budget" inputMode="decimal" required defaultValue={line?.budget ?? ""}/><FieldError error={errors.budget}/></label>
      <label className="ui-field"><span>Forecast · USD</span><input name="forecast" inputMode="decimal" placeholder="Uses budget until entered" defaultValue={line?.forecast ?? ""}/><FieldError error={errors.forecast}/></label>
      <label className="ui-field"><span>Committed · USD</span><input name="committed" inputMode="decimal" required defaultValue={line?.committed ?? 0}/><FieldError error={errors.committed}/></label>
      <label className="cm-owner-toggle full"><input name="byOwner" type="checkbox" defaultChecked={line?.byOwner ?? false}/><span><strong>Carried by owner</strong><small>Keep this line visible, but exclude it from contractor totals and leveling.</small></span></label>
    </div>
    <FieldError error={errors.line}/>
    <div className="cm-form-footer"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{line ? "Save line" : "Add budget line"}</Button></div>
  </form>;
}

export function BudgetView({ notify, navigate }: ViewProps) {
  const { state, run } = useBudget();
  const estimate = useEstimate();
  const comparison = useLevelingComparison();
  const { candidates, loading: levelingLoading, message: levelingMessage } = comparison;
  const [view, setView] = useState("Budget lines");
  const [tab, setTab] = useState("All costs");
  const [centerFilter, setCenterFilter] = useState("All cost centers");
  const [edit, setEdit] = useState<BudgetLine | "new" | null>(null);
  const [errors, setErrors] = useState<BudgetErrors>({});
  const [levelingLine, setLevelingLine] = useState<BudgetLine | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [basis, setBasis] = useState<LevelingBasis | "estimate">("reviewed");
  const [estimatePackageId, setEstimatePackageId] = useState("");
  const [linkEstimate, setLinkEstimate] = useState(false);
  const totals = budgetTotals(state);
  const centers = totalsByCostCenter(state);
  const divisions = totalsByDivision(state);
  const costCenterNames = centers.map(item => item.costCenter);
  const selectedCenter = centerFilter === "All cost centers" || costCenterNames.includes(centerFilter) ? centerFilter : "All cost centers";
  const centerAreas = new Map(centers.map(item => [item.costCenter, item.squareFeet]));
  const lines = state.lines.filter(line =>
    (selectedCenter === "All cost centers" || line.costCenter === selectedCenter)
    && (tab === "All costs" || (tab === "Direct costs" ? line.classification === "direct" : line.classification === "indirect"))
  );
  const contractorLines = lines.filter(line => !line.byOwner);
  const ownerLines = lines.filter(line => line.byOwner);
  const approved = state.lines.filter(line => line.status === "approved").length;
  const estimatePackage = estimate.procurement.packages.find(pkg => pkg.id === estimatePackageId);
  const selectedEstimate = estimate.byTrade.trades.find(trade => trade.packageId === estimatePackageId);
  const estimateMatch = estimatePackage ? budgetLinesForTrade(state, estimatePackage) : null;
  const canLinkEstimate = !levelingLine?.packageId && (estimateMatch?.basis === "ambiguous" || estimateMatch?.basis === "none");
  const estimateError = levelingLine ? estimateForecastError(state, levelingLine, estimatePackage, selectedEstimate, canLinkEstimate && linkEstimate) : null;
  const selectedCandidate = candidates.find(candidate => candidate.levelingBidderId === candidateId) ?? candidates.find(candidate => candidate.eligible && !candidate.stale) ?? candidates[0];

  function closeLine() { setEdit(null); setErrors({}); }
  function saveLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      description: String(form.get("description") ?? ""), costCenter: String(form.get("costCenter") ?? ""),
      classification: String(form.get("classification")) as BudgetLine["classification"], csiCode: String(form.get("csiCode") ?? ""),
      owner: String(form.get("owner") ?? ""), budget: amount(form.get("budget")) as number,
      forecast: amount(form.get("forecast"), true), committed: amount(form.get("committed")) as number, byOwner: form.get("byOwner") === "on",
    };
    const nextErrors = run(current => edit === "new" ? addBudgetLine(current, input, actor) : editBudgetLine(current, edit!.id, input, actor));
    if (nextErrors) { setErrors(nextErrors); return; }
    closeLine(); notify(edit === "new" ? "Budget line added." : "Budget line updated.");
  }
  function changeApproval(line: BudgetLine) {
    const nextErrors = run(current => line.status === "approved" ? reopenBudgetLine(current, line.id) : approveBudgetLine(current, line.id, actor));
    if (nextErrors) { setErrors(nextErrors); return; }
    setEdit(null); notify(line.status === "approved" ? "Budget line reopened for review." : "Budget line approved.");
  }
  function deleteLine(line: BudgetLine) {
    const nextErrors = run(current => removeBudgetLine(current, line.id));
    if (nextErrors) { setErrors(nextErrors); return; }
    closeLine(); notify("Budget line removed.");
  }
  function openLeveling(line: BudgetLine) {
    setLevelingLine(line); setCandidateId(""); setErrors({}); setLinkEstimate(false);
    setBasis(line.estimateSource ? "estimate" : line.forecastSource?.basis ?? "reviewed");
    const matches = estimate.procurement.packages.filter(pkg => budgetLinesForTrade(state, pkg).lines.some(l => l.id === line.id));
    setEstimatePackageId(line.packageId ?? (matches.length === 1 ? matches[0].id : ""));
    comparison.refresh();
  }
  function applyForecast() {
    if (!levelingLine) return;
    if (basis === "estimate") {
      if (estimateError || !estimatePackage || !selectedEstimate) { setErrors({ forecast: estimateError ?? "Choose a trade." }); return; }
      const nextErrors = run(current => applyEstimateValue(canLinkEstimate && linkEstimate ? linkBudgetLine(current, levelingLine.id, estimatePackage.id) : current, levelingLine.id, estimatePackage, selectedEstimate, actor));
      if (nextErrors) { setErrors(nextErrors); return; }
      setLevelingLine(null); setErrors({}); notify(`MCN estimate applied to ${levelingLine.description}'s forecast.`); return;
    }
    const candidate = selectedCandidate;
    if (!candidate) { setErrors({ forecast: "Choose a bidder." }); return; }
    const nextErrors = run(current => applyLevelingValue(current, levelingLine.id, candidate, basis, actor));
    if (nextErrors) { setErrors(nextErrors); return; }
    setLevelingLine(null); setErrors({}); notify(`${basisLabels[basis]} applied to ${levelingLine.description}'s forecast.`);
  }

  function budgetRow(line: BudgetLine) {
    const forecast = line.forecast ?? line.budget;
    const variance = line.budget - forecast;
    const perSquareFoot = costPerSquareFoot(line.budget, centerAreas.get(line.costCenter));
    return <tr key={line.id}><td><div className="cm-table-primary"><strong>{line.description}</strong><small>{line.classification === "direct" ? line.csiCode ? `CSI ${line.csiCode}` : "Direct · CSI not recorded" : "Indirect cost"}</small><EstimateBasisLabel line={line} trades={estimate.byTrade.trades}/>{line.forecastSource && <small className="cm-budget-source"><Link2 size={11}/>{basisLabels[line.forecastSource.basis]} · {line.forecastSource.bidderName}</small>}</div></td><td>{line.costCenter}<small className="cm-cell-note">{line.owner || "No owner"}</small></td><td className="cm-money">{usd(line.budget)}</td><td className="cm-money">{usdPerSquareFoot(perSquareFoot)}</td><td><strong>{usd(forecast)}</strong>{line.forecast === null && <small className="cm-cell-note">Budget baseline</small>}</td><td>{usd(line.committed)}</td><td><span className={variance >= 0 ? "cm-positive" : "cm-negative"}>{usd(variance)}</span></td><td><Badge tone={line.status === "approved" ? "green" : "amber"}>{line.status === "approved" ? "Approved" : "Draft"}</Badge></td><td><div className="cm-budget-actions">{line.classification === "direct" && !line.byOwner && <button className="cm-text-button" onClick={() => void openLeveling(line)}>Choose forecast basis</button>}<button className="ui-icon-btn" aria-label={`Edit ${line.description}`} onClick={() => { setEdit(line); setErrors({}); }}><Pencil size={15}/></button></div></td></tr>;
  }

  const totalVariance = totals.totalBudget - totals.totalForecast;
  return <div className="cm-view">
    <PageHeader eyebrow="COST CONTROL" title="Project budget" description="Review direct and indirect costs, and choose a forecast from MCN estimates or leveled bids." actions={<><ExportButton onClick={() => exportRows("project-budget.csv", [["Cost center", "Class", "CSI", "Description", "Owner", "By owner", "Budget", "Cost / SF", "Forecast", "Committed", "Variance", "Status"], ...state.lines.map(line => [line.costCenter, line.classification, line.csiCode ?? "", line.description, line.owner, line.byOwner ? "Yes" : "No", line.budget, costPerSquareFoot(line.budget, centerAreas.get(line.costCenter)) ?? "", line.forecast ?? "", line.committed, line.budget - (line.forecast ?? line.budget), line.status])])}/><Button variant="primary" onClick={() => { setEdit("new"); setErrors({}); }}><Plus size={16}/>Add line</Button></>}/>
    <PreviewNote>{state.lines.length ? "Browser-only demo · Owner-carried costs stay visible and are excluded from contractor totals." : "Browser-only demo · This project starts with an empty budget and saves additions in this browser."}</PreviewNote>
    <Tabs tabs={["Budget lines", "Trade variance"]} value={view} onChange={setView}/>
    {view === "Trade variance" ? <TradeVarianceReport estimate={estimate} budget={state} candidates={candidates} loading={levelingLoading} message={levelingMessage} onRefresh={comparison.refresh}/> : <>
    {!state.lines.length && !state.allowances.length ? <Panel><Empty title="This project has no budget yet" description="Add the first direct or indirect cost line to start the cost plan." action={<Button variant="primary" onClick={() => setEdit("new")}><Plus size={16}/>Add budget line</Button>}/></Panel> : <>
      <Stats items={[
        { label: "Total budget", value: usd(totals.totalBudget), detail: `${usd(totals.direct)} direct · ${usd(totals.indirect)} indirect` },
        { label: "Current forecast", value: usd(totals.totalForecast), detail: totals.unforecastLines ? `${totals.unforecastLines} line${totals.unforecastLines === 1 ? " uses" : "s use"} budget until forecasted` : "Every line has a forecast" },
        { label: "Forecast variance", value: usd(totalVariance), detail: totalVariance >= 0 ? "Under the current cost plan" : "Over the current cost plan", tone: totalVariance >= 0 ? "green" : "red" },
        { label: "Committed", value: usd(totals.committed), detail: `${usd(totals.remaining)} remains · ${totals.byOwnerLines} owner-carried line${totals.byOwnerLines === 1 ? "" : "s"} excluded` },
      ]}/>
      <Tabs tabs={["All costs", "Direct costs", "Indirect costs"]} value={tab} onChange={setTab}/>
      {costCenterNames.length > 1 && <div className="cm-center-tabs"><span>Cost center</span><Tabs tabs={["All cost centers", ...costCenterNames]} value={selectedCenter} onChange={setCenterFilter}/></div>}
      <Panel title={selectedCenter === "All cost centers" ? tab : `${tab} · ${selectedCenter}`} subtitle={`${approved} of ${state.lines.length} lines approved · Editing scope, class, CSI, description, budget, or owner responsibility reopens approval.`} action={<Badge tone={approved === state.lines.length ? "green" : "amber"}>{approved} approved</Badge>}>
        <div className="ui-table-wrap"><table className="ui-table cm-budget-table"><thead><tr><th>Cost line</th><th>Cost center</th><th>Budget</th><th>Cost / SF</th><th>Forecast</th><th>Committed</th><th>Variance</th><th>Status</th><th/></tr></thead><tbody>{contractorLines.map(budgetRow)}</tbody></table></div>
        {!contractorLines.length && <Empty title={`No contractor ${tab.toLowerCase()}`} description="Add a line or choose another cost section or cost center."/>}
      </Panel>
      {ownerLines.length > 0 && <Panel title="By owner" subtitle="Shown for project visibility and excluded from contractor budget, forecast, committed, and leveling totals." action={<Badge>{ownerLines.length} excluded</Badge>}>
        <div className="ui-table-wrap"><table className="ui-table cm-budget-table"><thead><tr><th>Cost line</th><th>Cost center</th><th>Budget</th><th>Cost / SF</th><th>Forecast</th><th>Committed</th><th>Variance</th><th>Status</th><th/></tr></thead><tbody>{ownerLines.map(budgetRow)}</tbody></table></div>
      </Panel>}
      <div className="cm-budget-rollups">
        <Panel title="Cost centers" subtitle="Budget, forecast, area, and cost per square foot for each funding bucket."><div className="cm-rollup-list">{centers.map(({ costCenter, squareFeet, totals: item }, index) => { const perSquareFoot = costPerSquareFoot(item.totalBudget, squareFeet); return <div key={costCenter}><span><i style={{ background: palette[index % palette.length] }}/><span><strong>{costCenter}</strong><small>{squareFeet ? `${squareFeet.toLocaleString("en-US")} SF · ${usdPerSquareFoot(perSquareFoot)}` : "Area not recorded"}</small><small>{item.byOwnerLines ? `${item.byOwnerLines} owner-carried line${item.byOwnerLines === 1 ? "" : "s"} excluded` : item.allowancesAdded ? `${usd(item.allowancesAdded)} added allowance` : item.allowancesInLines ? `${usd(item.allowancesInLines)} carried in lines` : "No included allowances"}</small></span></span><span><span><strong>{usd(item.totalForecast)}</strong><small>of {usd(item.totalBudget)}</small></span></span></div>; })}</div></Panel>
        <Panel title="Direct cost by CSI division" subtitle="Forecast share across direct construction work."><div className="cm-distribution">{divisions.map((division, index) => { const percent = totals.direct ? Math.round(division.forecast / totals.direct * 100) : 0; return <div key={division.division}><div><span><i style={{ background: palette[index % palette.length] }}/>{division.division ? `${division.division} · ${division.name}` : division.name}</span><strong>{usd(division.forecast)}</strong></div><div className="cm-distribution-bar"><i style={{ width: `${Math.min(100, percent)}%`, background: palette[index % palette.length] }}/></div></div>; })}<Button onClick={() => navigate("allowances")}>Review allowances<ArrowRight size={15}/></Button></div></Panel>
      </div>
    </>}
    </>}
    {edit && <Modal title={edit === "new" ? "Add budget line" : `Edit ${edit.description}`} subtitle={edit === "new" ? "Add a direct construction or indirect project cost." : `${edit.costCenter} · ${edit.status}`} onClose={closeLine} wide>
      <LineForm line={edit === "new" ? null : edit} costCenters={costCenterNames} errors={errors} onSubmit={saveLine} onCancel={closeLine}/>
      {edit !== "new" && <div className="cm-record-actions"><Button onClick={() => changeApproval(edit)}>{edit.status === "approved" ? <><RotateCcw size={15}/>Reopen approval</> : <><Check size={15}/>Approve line</>}</Button><Button onClick={() => deleteLine(edit)}><Trash2 size={15}/>Remove line</Button></div>}
    </Modal>}
    {levelingLine && <Modal title={`Update ${levelingLine.description} forecast`} subtitle="Choose MCN's estimate or a bidder's value for this line's forecast." onClose={() => { setLevelingLine(null); setErrors({}); }} wide>
      <label className="ui-field"><span>Forecast basis</span><select value={basis} onChange={event => { setBasis(event.target.value as typeof basis); setErrors({}); }}><option value="estimate">MCN estimate</option>{(Object.keys(basisLabels) as LevelingBasis[]).map(value => <option key={value} value={value}>{basisLabels[value]}</option>)}</select></label>
      {basis === "estimate" ? <EstimateBudgetChoice budget={state} line={levelingLine} packages={estimate.procurement.packages} trades={estimate.byTrade.trades} packageId={estimatePackageId} onPackage={id => { setEstimatePackageId(id); setLinkEstimate(false); setErrors({}); }} link={linkEstimate} onLink={setLinkEstimate}/> : levelingLoading ? <div className="cm-inline-empty" role="status">Reading the saved Bid leveling workspace…</div> : candidates.length ? <div className="cm-leveling-grid">{candidates.map(candidate => <label className={`cm-leveling-choice ${selectedCandidate?.levelingBidderId === candidate.levelingBidderId ? "selected" : ""}`} key={candidate.levelingBidderId}><input type="radio" name="candidate" value={candidate.levelingBidderId} checked={selectedCandidate?.levelingBidderId === candidate.levelingBidderId} onChange={() => setCandidateId(candidate.levelingBidderId)}/><span><strong>{candidate.bidderName}</strong><small>{candidate.submissionId ? `Portal submission · revision ${candidate.revisionNumber}` : "Workbook or demo bidder"}</small></span><Badge tone={candidate.stale || !candidate.eligible ? "amber" : "green"}>{candidate.stale ? "Older form" : candidate.eligible ? "Reviewed" : "Review open"}</Badge><div className="cm-leveling-values"><span>Base<strong>{candidate.baseBid === null ? "—" : usd(candidate.baseBid)}</strong></span><span>Provisional<strong>{candidate.provisionalTotal === null ? "—" : usd(candidate.provisionalTotal)}</strong></span><span>Reviewed<strong>{candidate.reviewedTotal === null ? "—" : usd(candidate.reviewedTotal)}</strong></span></div>{candidate.eligibilityReasons.length > 0 && <small className="cm-leveling-reasons">{candidate.eligibilityReasons.join(" · ")}</small>}</label>)}</div> : <div className="cm-inline-empty"><p>{levelingMessage}</p></div>}
      <FieldError error={errors.forecast}/><FieldError error={errors.line}/><div className="cm-form-footer"><Button onClick={() => navigate(basis === "estimate" ? "takeoffs" : "leveling")}>{basis === "estimate" ? "Open trade estimates" : "Open Bid leveling"}</Button><Button variant="primary" disabled={basis === "estimate" ? !!estimateError : levelingLoading || !candidates.length} onClick={applyForecast}>Apply selected value</Button></div>
    </Modal>}
  </div>;
}

export function AllowancesView({ notify, navigate }: ViewProps) {
  const { state, run } = useBudget();
  const [edit, setEdit] = useState<BudgetAllowance | "new" | null>(null);
  const [source, setSource] = useState<BudgetAllowance | null>(null);
  const [errors, setErrors] = useState<BudgetErrors>({});
  const [center, setCenter] = useState("");
  const totals = budgetTotals(state);
  const centers = [...new Set([...state.lines.map(line => line.costCenter), ...state.allowances.map(item => item.costCenter)])];
  const linkedLines = state.lines.filter(line => line.costCenter === center);
  const reviewing = state.allowances.filter(item => item.status === "review").length;

  function openAllowance(item: BudgetAllowance | "new") { setEdit(item); setErrors({}); setCenter(item === "new" ? centers[0] ?? "Modernization" : item.costCenter); }
  function closeAllowance() { setEdit(null); setErrors({}); }
  function saveAllowance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input = { name: String(form.get("name") ?? ""), amount: amount(form.get("amount")) as number, costCenter: String(form.get("costCenter") ?? ""), owner: String(form.get("owner") ?? ""), source: String(form.get("source") ?? ""), status: String(form.get("status")) as BudgetAllowance["status"], budgetLineId: String(form.get("budgetLineId") ?? "") || null };
    const nextErrors = run(current => edit === "new" ? addAllowance(current, input) : editAllowance(current, edit!.id, input));
    if (nextErrors) { setErrors(nextErrors); return; }
    closeAllowance(); notify(edit === "new" ? "Allowance added." : "Allowance updated.");
  }
  function deleteAllowance(item: BudgetAllowance) {
    const nextErrors = run(current => removeAllowance(current, item.id));
    if (nextErrors) { setErrors(nextErrors); return; }
    closeAllowance(); notify("Allowance removed.");
  }

  return <div className="cm-view">
    <PageHeader eyebrow="COST CONTROL" title="Allowances register" description="Keep each allowance sourced, reviewed, and counted exactly once in the project budget." actions={<><ExportButton onClick={() => exportRows("allowances.csv", [["Allowance", "Amount", "Cost center", "Source", "Status", "Owner", "Budget line"], ...state.allowances.map(item => [item.name, item.amount, item.costCenter, item.source, item.status, item.owner, state.lines.find(line => line.id === item.budgetLineId)?.description ?? ""])])}/><Button variant="primary" onClick={() => openAllowance("new")}><Plus size={16}/>Add allowance</Button></>}/>
    <PreviewNote>Browser-only demo · Linked allowances are already inside their budget line and are never added a second time.</PreviewNote>
    <Stats items={[
      { label: "Added to budget", value: usd(totals.allowancesAdded), detail: "Included and not carried by a line" },
      { label: "Carried in lines", value: usd(totals.allowancesInLines), detail: "Shown here without double counting" },
      { label: "Under review", value: usd(totals.allowancesPending), detail: `${reviewing} item${reviewing === 1 ? "" : "s"} awaiting a decision`, tone: reviewing ? "amber" : "green" },
      { label: "Excluded", value: usd(totals.allowancesExcluded), detail: "Kept in the register for history" },
    ]}/>
    <Panel title="Required allowances" subtitle="The source shows where the requirement came from; the budget link shows where its money is carried." action={<Button onClick={() => navigate("budget")}>Open project budget<ArrowRight size={15}/></Button>}>
      {state.allowances.length ? <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Allowance</th><th>Amount</th><th>Cost center</th><th>Source</th><th>Budget treatment</th><th>Owner</th><th>Status</th><th/></tr></thead><tbody>{state.allowances.map(item => {
        const line = state.lines.find(candidate => candidate.id === item.budgetLineId);
        return <tr key={item.id}><td><strong>{item.name}</strong></td><td className="cm-money">{usd(item.amount)}</td><td>{item.costCenter}</td><td>{item.source ? <Source onClick={() => setSource(item)}>{item.source}</Source> : <span className="cm-muted">Not recorded</span>}</td><td>{line ? <span className="cm-linked-line"><Link2 size={13}/><span><strong>{line.description}</strong><small>Already inside this line</small></span></span> : item.status === "included" ? <Badge tone="blue">Added on top</Badge> : <span className="cm-muted">Not included</span>}</td><td>{item.owner || "—"}</td><td><Badge tone={item.status === "included" ? "green" : item.status === "review" ? "amber" : "neutral"}>{allowanceLabels[item.status]}</Badge></td><td><button className="ui-icon-btn" aria-label={`Edit ${item.name}`} onClick={() => openAllowance(item)}><Pencil size={15}/></button></td></tr>;
      })}</tbody></table></div> : <Empty title="No allowances recorded" description="Add the first allowance and link it to a budget line when the money is already carried there." action={<Button variant="primary" onClick={() => openAllowance("new")}>Add allowance</Button>}/>}</Panel>
    {source && <Modal title="Allowance source" subtitle={source.costCenter} onClose={() => setSource(null)}><div className="cm-source-card"><FileText size={28}/><h3>{source.name}</h3><p>{source.source}</p><strong>{usd(source.amount)}</strong><p className="cm-muted">Use the project files to verify the cited requirement before including it in the budget.</p><Button onClick={() => { setSource(null); navigate("documents"); }}>Open project files<ArrowRight size={16}/></Button></div></Modal>}
    {edit && <Modal title={edit === "new" ? "Add allowance" : `Edit ${edit.name}`} subtitle="A linked allowance must stay in the same cost center and fit inside the line budget." onClose={closeAllowance} wide>
      <form onSubmit={saveAllowance}><div className="ui-form-grid">
        <label className="ui-field full"><span>Allowance name</span><input name="name" required defaultValue={edit === "new" ? "" : edit.name}/><FieldError error={errors.name}/></label>
        <label className="ui-field"><span>Amount · USD</span><input name="amount" inputMode="decimal" required defaultValue={edit === "new" ? "" : edit.amount}/><FieldError error={errors.amount}/></label>
        <label className="ui-field"><span>Cost center</span><input name="costCenter" required value={center} onChange={event => setCenter(event.target.value)} list="budget-cost-centers"/><datalist id="budget-cost-centers">{centers.map(value => <option key={value} value={value}/>)}</datalist><FieldError error={errors.costCenter}/></label>
        <label className="ui-field"><span>Owner</span><input name="owner" defaultValue={edit === "new" ? "" : edit.owner}/></label>
        <label className="ui-field"><span>Status</span><select name="status" defaultValue={edit === "new" ? "review" : edit.status}><option value="review">Needs review</option><option value="included">Included</option><option value="excluded">Excluded</option></select><FieldError error={errors.status}/></label>
        <label className="ui-field full"><span>Source citation</span><input name="source" placeholder="Division, drawing, owner requirement, or note" defaultValue={edit === "new" ? "" : edit.source}/></label>
        <label className="ui-field full"><span>Budget line carrying this allowance</span><select name="budgetLineId" defaultValue={edit === "new" ? "" : edit.budgetLineId ?? ""}><option value="">Not carried by a line</option>{linkedLines.map(line => <option key={line.id} value={line.id}>{line.description} · {usd(line.budget)}</option>)}</select><small>Included allowances without a link are added on top of the project budget.</small><FieldError error={errors.budgetLineId}/></label>
      </div><FieldError error={errors.allowance}/><div className="cm-form-footer"><Button onClick={closeAllowance}>Cancel</Button><Button type="submit" variant="primary">{edit === "new" ? "Add allowance" : "Save allowance"}</Button></div></form>
      {edit !== "new" && <div className="cm-record-actions"><Button onClick={() => deleteAllowance(edit)}><Trash2 size={15}/>Remove allowance</Button></div>}
    </Modal>}
  </div>;
}
