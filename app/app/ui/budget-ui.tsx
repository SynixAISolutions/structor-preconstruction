"use client";

import { Fragment, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, FileText, Link2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  addAllowance, addBudgetLine, approveBudgetLine, budgetTotals, budgetRowsByTrade,
  costPerSquareFoot, editAllowance, editBudgetLine, parseAmount, removeAllowance,
  removeBudgetLine, reopenBudgetLine, sectionTotal, totalsByCostCenter, totalsByDivision,
  type BudgetAllowance, type BudgetErrors, type BudgetLine, type SectionTotal,
} from "../../lib/budget";
import { useValueEngineering } from "../../lib/use-value-engineering";
import { useBudget } from "../../lib/use-budget";
import { useAward } from "../../lib/use-award";
import type { LineCommitment } from "../../lib/commitments";
import { costPlan as planCosts } from "../../lib/forecasts";
import { estimateMoney } from "./estimate-format";
import { useEstimate } from "../../lib/use-estimate";
import { useSubmissions } from "../../lib/use-submissions";
import { useLocalDraft } from "../../lib/use-local-draft";
import { initialBidders } from "../../lib/data/commercial";
import { inHouseFromLowestSub, lowestTradeBid, lowestSubLineValue, tradeForBudgetLine, type LowBid } from "../../lib/budget-comparison";
import type { TradePackage } from "../../lib/procurement";
import { InHouseBudgetEditor, LowBidCell, LowBidSplitEditor } from "./budget-comparison";
import { useLevelingComparison } from "./use-leveling-comparison";
import { EstimateBasisLabel } from "./estimate-budget-choice";
import { TradeVarianceReport } from "./trade-variance";
import { ConceptBudgetView } from "./concept-budget";
import { BudgetVersionsView } from "./budget-versions";
import { BasisOfEstimateView } from "./basis-of-estimate";
import { estimateStageLabel, type Project } from "../../lib/projects";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, PreviewNote, Source, Stats, Tabs, exportRows, usd, type ViewProps } from "./shared";

const actor = "Marcel Khoury";
const palette = ["#f47640", "#3e6a81", "#759283", "#c2a276", "#8996b2", "#6f8c72"];
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

function LineForm({ line, commitment, costCenters, errors, onSubmit, onCancel }: { line: BudgetLine | null; commitment?: LineCommitment; costCenters: string[]; errors: BudgetErrors; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const fromAwards = !!commitment?.sources.length;
  return <form onSubmit={onSubmit}>
    <div className="ui-form-grid">
      <label className="ui-field full"><span>Description</span><input name="description" required defaultValue={line?.description ?? ""}/><FieldError error={errors.description}/></label>
      <label className="ui-field"><span>Cost center</span><input name="costCenter" list="budget-cost-centers" required defaultValue={line?.costCenter ?? costCenters[0] ?? "Project-wide"}/><datalist id="budget-cost-centers">{costCenters.map(center => <option key={center} value={center}/>)}</datalist><FieldError error={errors.costCenter}/></label>
      <label className="ui-field"><span>Cost class</span><select name="classification" defaultValue={line?.classification ?? "direct"}><option value="direct">Direct construction</option><option value="indirect">Indirect cost</option></select><FieldError error={errors.classification}/></label>
      <label className="ui-field"><span>CSI division or section</span><input name="csiCode" placeholder="03 or 03 30 00" defaultValue={line?.csiCode ?? ""}/><FieldError error={errors.csiCode}/></label>
      <label className="ui-field"><span>Owner</span><input name="owner" defaultValue={line?.owner ?? ""}/></label>
      <label className="ui-field"><span>Total cost · USD</span><input name="budget" inputMode="decimal" required defaultValue={line?.budget ?? ""}/><FieldError error={errors.budget}/></label>
      {/* Marcel (24 Oct) took the forecast off the Budget summary; a line keeps whatever forecast it had. */}
      <input type="hidden" name="forecast" value={line?.forecast ?? ""}/>
      {fromAwards
        // The awards set this line's committed cost; the typed value is kept, unused, in case they are cancelled.
        ? <label className="ui-field"><span>Committed · USD</span><input value={usd(commitment!.committed)} readOnly aria-describedby="committed-from-awards"/><input type="hidden" name="committed" value={line?.committed ?? 0}/><small id="committed-from-awards" className="cm-cell-note">Set by {commitment!.sources.map(s => `${s.company}'s award (${s.stage})`).join(" and ")}. Change or cancel the award to change it.</small></label>
        : <label className="ui-field"><span>Committed · USD</span><input name="committed" inputMode="decimal" required defaultValue={line?.committed ?? 0}/><FieldError error={errors.committed}/></label>}
      <label className="cm-owner-toggle full"><input name="byOwner" type="checkbox" defaultChecked={line?.byOwner ?? false}/><span><strong>Carried by owner</strong><small>Keep this line visible, but exclude it from contractor totals and leveling.</small></span></label>
    </div>
    <FieldError error={errors.line}/>
    <div className="cm-form-footer"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{line ? "Save line" : "Add budget line"}</Button></div>
  </form>;
}

/** Committed cost: from the awards when they reach the line (pending ones beside it), else the typed value. */
function CommittedCell({ line, commitment, onOpen }: { line: BudgetLine; commitment?: LineCommitment; onOpen: () => void }) {
  if (!commitment) return <>{usd(line.committed)}</>;
  const executed = commitment.sources.filter(s => s.counts === "committed"), pending = commitment.sources.filter(s => s.counts === "pending");
  return <>
    {commitment.sources.length ? <strong>{usd(commitment.committed)}</strong> : usd(line.committed)}
    {executed.map(s => <small key={s.awardId} className="cm-budget-source"><Link2 size={11}/><button type="button" className="cm-text-button" onClick={onOpen}>{s.company} · executed</button></small>)}
    {pending.map(s => <small key={s.awardId} className="cm-cell-note">Pending {usd(s.amount)} · {s.company} · {s.stage}</small>)}
    {commitment.splitNeeded.length > 0 && <small><Badge tone="amber">Split needed · {commitment.splitNeeded.join(", ")}</Badge></small>}
  </>;
}

export function BudgetView({ notify, navigate, project }: ViewProps & { project: Project }) {
  const { state, run } = useBudget();
  const { state: ve } = useValueEngineering();
  const estimate = useEstimate();
  const submitted = useSubmissions();
  const [directory] = useLocalDraft("directory", initialBidders);
  const { state: awards } = useAward();
  const [expandedTrades, setExpandedTrades] = useState<string[]>([]);
  const [inHouseLine, setInHouseLine] = useState<BudgetLine | null>(null);
  const [split, setSplit] = useState<{pkg:TradePackage;bid:LowBid}|null>(null);
  const comparison = useLevelingComparison();
  const { candidates, loading: levelingLoading, message: levelingMessage } = comparison;
  const [view, setView] = useState("Budget lines");
  const [showBasis, setShowBasis] = useState(false);
  const [tab, setTab] = useState("All costs");
  const [centerFilter, setCenterFilter] = useState("All cost centers");
  const [edit, setEdit] = useState<BudgetLine | "new" | null>(null);
  const [errors, setErrors] = useState<BudgetErrors>({});
  // Committed comes from the awards (lib/commitments); every total, export and saved version reads this plan.
  // Its forecasts still feed Budget versions and Trade variance, but the summary no longer shows them (Marcel, 24 Oct).
  const { commitments, veUnplaced, budget: costPlan } = useMemo(() => planCosts(state, { awards, procurement: submitted.procurement, submissions: submitted.submissions, candidates, directory, ve, estimates: estimate.byTrade.trades }), [state, awards, submitted.procurement, submitted.submissions, candidates, directory, ve, estimate.byTrade.trades]);
  const totals = budgetTotals(costPlan);
  const centers = totalsByCostCenter(costPlan);
  const divisions = totalsByDivision(costPlan);
  const committedOf = (line: BudgetLine) => commitments.lines[line.id]?.sources.length ? commitments.lines[line.id].committed : line.committed;
  const costCenterNames = centers.map(item => item.costCenter);
  const selectedCenter = centerFilter === "All cost centers" || costCenterNames.includes(centerFilter) ? centerFilter : "All cost centers";
  const centerAreas = new Map(centers.map(item => [item.costCenter, item.squareFeet]));
  // Rows show the cost plan (accepted VE taken off its trade, lib/ve-budget); edits always open the typed line.
  const typed = (line: BudgetLine) => state.lines.find(l => l.id === line.id) ?? line;
  const lines = costPlan.lines.filter(line =>
    (selectedCenter === "All cost centers" || line.costCenter === selectedCenter)
    && (tab === "All costs" || (tab === "Direct costs" ? line.classification === "direct" : line.classification === "indirect"))
  );
  const contractorLines = lines.filter(line => !line.byOwner);
  const ownerLines = lines.filter(line => line.byOwner);
  const approved = state.lines.filter(line => line.status === "approved").length;
  /** A line's lowest subcontractor price (its share of the trade's low bid), or null while its trade has no bid. */
  const lowSubOf = (line: BudgetLine) => {
    const pkg = tradeForBudgetLine(state, submitted.procurement, line);
    const low = pkg ? lowestTradeBid(submitted.procurement, submitted.submissions, pkg.id, candidates, directory, ve) : null;
    return pkg && low ? lowestSubLineValue(state, pkg, line.id, low.value) : null;
  };

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
  function budgetRow(line: BudgetLine) {
    const pkg = tradeForBudgetLine(state, submitted.procurement, line);
    const low = pkg ? lowestTradeBid(submitted.procurement, submitted.submissions, pkg.id, candidates, directory, ve) : null;
    const carried = state.allowances.filter(a => a.budgetLineId === line.id && a.status === "included");
    const perSquareFoot = costPerSquareFoot(line.budget, centerAreas.get(line.costCenter));
    return <tr key={line.id}><td><div className="cm-table-primary"><strong>{line.description}</strong>{carried.map(a => <small key={a.id}><Badge tone="blue">Allowance · {a.name} · {usd(a.amount)}</Badge></small>)}<small>{line.classification === "direct" ? line.csiCode ? `CSI ${line.csiCode}` : "Direct · CSI not recorded" : "Indirect cost"}</small><EstimateBasisLabel line={line} trades={estimate.byTrade.trades}/></div></td><td>{line.costCenter}<small className="cm-cell-note">{line.owner || "No owner"}</small></td><td className="cm-money"><button className="cm-text-button" aria-label={`Set total cost for ${line.description}`} onClick={() => setInHouseLine(typed(line))}>{usd(line.budget)} <Pencil size={11}/></button>{line.veApplied?.map(v => <small key={v.ideaId} className="cm-cell-note cm-ve-applied">VE applied · {v.number} {usd(v.amount)}</small>)}{line.veApplied && <small className="cm-cell-note">Before VE {usd(typed(line).budget)}</small>}{line.inHouseSource && <small className="cm-cell-note">From lowest sub · {line.inHouseSource.bidder}</small>}{pkg && low && <button type="button" className="cm-text-button" onClick={() => { const issues = run(s => inHouseFromLowestSub(s, line.id, pkg, low, actor)); if (issues) { setInHouseLine(typed(line)); notify(Object.values(issues).join(" ")); } else notify("Total cost pulled from the lowest sub."); }}>Pull lowest sub</button>}</td><td><LowBidCell bid={low} budget={state} pkg={pkg} lineId={line.id} onSplit={(pkg,bid) => setSplit({pkg,bid})}/></td><td className="cm-money">{usdPerSquareFoot(perSquareFoot)}</td><td className="cm-committed-cell"><CommittedCell line={line} commitment={commitments.lines[line.id]} onOpen={() => navigate("contracts")}/></td><td><Badge tone={line.status === "approved" ? "green" : "amber"}>{line.status === "approved" ? "Approved" : "Draft"}</Badge></td><td><div className="cm-budget-actions"><button className="ui-icon-btn" aria-label={`Edit ${line.description}`} onClick={() => { setEdit(typed(line)); setErrors({}); }}><Pencil size={15}/></button></div></td></tr>;
  }

  // The total rows (Marcel, 24 Oct): "total trades costs" after the direct lines, then the indirect costs and
  // theirs, then the total cost; each also adds up the low sub and committed columns.
  const sections = (tab === "All costs" ? ["direct", "indirect"] : [tab === "Direct costs" ? "direct" : "indirect"]) as BudgetLine["classification"][];
  const sectionNames: Record<BudgetLine["classification"], string> = { direct: "Total trades cost", indirect: "Total indirect costs" };
  const allCenters = selectedCenter === "All cost centers";
  const areaShown = allCenters ? (centers.length && centers.every(c => c.squareFeet) ? centers.reduce((n, c) => n + (c.squareFeet ?? 0), 0) : null) : centerAreas.get(selectedCenter) ?? null;
  const allowancesAdded = allCenters ? totals.allowancesAdded : centers.find(c => c.costCenter === selectedCenter)?.totals.allowancesAdded ?? 0;
  const trades = sectionTotal(costPlan.lines.filter(l => l.classification === "direct" && !l.byOwner), lowSubOf, committedOf);
  // `bidLines`: the lines that can have a bid (only trades do), for "4 of 35 lines have a bid".
  const totalRow = (key: string, label: string, total: SectionTotal, added = 0, bidLines = total.lines) => <tr key={key} className={`budget-section-total${key === "total" ? " grand" : ""}`}>
    <td><strong>{label}</strong><small className="cm-cell-note">{added ? `Includes ${usd(added)} of allowances added once` : `${total.lines} line${total.lines === 1 ? "" : "s"}`}</small></td><td/>
    <td className="cm-money"><strong>{usd(total.total + added)}</strong></td>
    <td className="cm-money">{total.withLowSub ? <>{usd(total.lowSub)}{total.withLowSub < bidLines && <small className="cm-cell-note">{total.withLowSub} of {bidLines} trade lines have a bid</small>}</> : "—"}</td>
    <td className="cm-money">{usdPerSquareFoot(costPerSquareFoot(total.total + added, areaShown))}</td>
    <td className="cm-money"><strong>{usd(total.committed)}</strong></td><td colSpan={2}/>
  </tr>;
  const tradeRow = (row: ReturnType<typeof budgetRowsByTrade>[number]) => {
    if (row.lines.length === 1) return budgetRow(row.lines[0]);
    const expanded = expandedTrades.includes(row.key);
    const pkg = tradeForBudgetLine(state, submitted.procurement, row.lines[0]);
    const low = pkg ? lowestTradeBid(submitted.procurement, submitted.submissions, pkg.id, candidates, directory, ve) : null;
    return <Fragment key={row.key}><tr className="budget-trade-total"><td><button className="cm-text-button" aria-expanded={expanded} onClick={() => setExpandedTrades(keys => expanded ? keys.filter(k => k !== row.key) : [...keys,row.key])}>{expanded ? "−" : "+"} <strong>{row.description}</strong></button><small className="cm-cell-note">CSI {row.csiCode}</small></td><td>{row.lines.length} cost centers</td><td>{usd(row.budget)}</td><td>{low ? <>{usd(low.value)}<small className="cm-cell-note">{low.name}</small></> : "No current bid"}</td><td>—</td><td>{usd(row.lines.reduce((n,l)=>n+committedOf(l),0))}</td><td colSpan={2}>Open to edit cost centers</td></tr>{expanded && row.lines.map(budgetRow)}</Fragment>;
  };
  const columns = <tr><th>Cost line</th><th>Cost center</th><th>Total cost</th><th>Low sub budget</th><th>Cost / SF</th><th>Committed</th><th>Status</th><th/></tr>;
  if (showBasis) return <BasisOfEstimateView project={project} budget={state} navigate={navigate} onBack={() => { setShowBasis(false); requestAnimationFrame(() => document.getElementById("basis-of-estimate-entry")?.focus()); }}/>;
  return <div className="cm-view">
    <PageHeader eyebrow="COST CONTROL" title="Budget summary" description="Each line's total cost beside the lowest subcontractor price and what is committed from awarded subcontracts. The low sub column is for your team, not the owner." actions={<><button id="basis-of-estimate-entry" type="button" className="ui-btn secondary" onClick={() => setShowBasis(true)}><FileText size={16}/>Basis of estimate</button><ExportButton onClick={() => exportRows("project-budget.csv", [["Cost center", "Class", "CSI", "Description", "Owner", "By owner", "Total cost", "Lowest sub budget", "Lowest sub basis", "Cost / SF", "Committed", "Committed from", "Pending commitment", "Status"], ...state.lines.map(line => [line.costCenter, line.classification, line.csiCode ?? "", line.description, line.owner, line.byOwner ? "Yes" : "No", line.budget, lowSubOf(line) ?? "", (()=>{const p=tradeForBudgetLine(state,submitted.procurement,line);return p?lowestTradeBid(submitted.procurement,submitted.submissions,p.id,candidates,directory,ve)?.basis??"":"";})(), costPerSquareFoot(line.budget, centerAreas.get(line.costCenter)) ?? "", committedOf(line), commitments.lines[line.id]?.sources.filter(s => s.counts === "committed").map(s => `${s.company} (executed)`).join("; ") || "Typed", commitments.lines[line.id]?.pending ?? 0, line.status])])}/><Button variant="primary" onClick={() => { setEdit("new"); setErrors({}); }}><Plus size={16}/>Add line</Button></>}/>
    <PreviewNote>{state.lines.length ? "Browser-only demo · Owner-carried costs stay visible and are excluded from contractor totals." : "Browser-only demo · This project starts with an empty budget and saves additions in this browser."}</PreviewNote>
    <p>Estimate stage: {estimateStageLabel(project.estimateStage)}</p>
    <Panel title="In-house estimate" subtitle="Live priced takeoffs · Direct costs · Compare it with the low sub in Trade variance."><strong>{estimate.rows.length ? estimateMoney(estimate.byTrade.total) : "Not estimated"}</strong><p>{estimate.rows.length} items · {estimate.rows.filter(r => !r.reviewed).length} need review</p><Button onClick={() => navigate("takeoffs")}>Open trade estimates</Button></Panel>
    <Tabs tabs={["Budget lines", "Trade variance", "Budget versions", "Historical concept budget"]} value={view} onChange={setView}/>
    {view === "Budget versions" ? <BudgetVersionsView key={project.id} budget={costPlan} project={project} notify={notify}/> : view === "Historical concept budget" ? <ConceptBudgetView key={project.id} project={project} budget={{ state, run }} notify={notify} navigate={navigate}/> : view === "Trade variance" ? <TradeVarianceReport estimate={estimate} budget={costPlan} candidates={candidates} loading={levelingLoading} message={levelingMessage} onRefresh={comparison.refresh}/> : <>
    {!state.lines.length && !state.allowances.length ? <Panel><Empty title="This project has no budget yet" description="Add the first direct or indirect cost line to start the cost plan." action={<Button variant="primary" onClick={() => setEdit("new")}><Plus size={16}/>Add budget line</Button>}/></Panel> : <>
      <Stats items={[
        { label: "Total cost", value: usd(totals.totalBudget), detail: `${usd(totals.direct)} trades · ${usd(totals.indirect)} indirect${totals.allowancesAdded ? ` · ${usd(totals.allowancesAdded)} allowances` : ""}` },
        { label: "Total trades cost", value: usd(totals.direct), detail: "Direct construction, every trade" },
        { label: "Low sub budget", value: trades.withLowSub ? usd(trades.lowSub) : "No bids yet", detail: `${trades.withLowSub} of ${trades.lines} trade lines have a bid` },
        { label: "Committed", value: usd(totals.committed), detail: `${commitments.pending ? `${usd(commitments.pending)} pending signature · ` : ""}${usd(totals.remaining)} remains · from executed subcontracts` },
      ]}/>
      {veUnplaced.length > 0 && <Panel title="Accepted VE not in the budget yet" subtitle="An accepted VE item lowers its trade's budget once it is linked to a trade with a budget line." action={<Button onClick={() => navigate("value-engineering")}>Open value engineering<ArrowRight size={14}/></Button>}><div className="cm-rollup-list">{veUnplaced.map(v => <div key={v.ideaId}><span><strong>{v.number}</strong><small>{v.reason}</small></span></div>)}</div></Panel>}
      {commitments.unplaced.length > 0 && <Panel title="Awards not in the budget yet" subtitle="Their subcontract sums count nowhere until they reach a budget line." action={<Badge tone="amber">{commitments.unplaced.length}</Badge>}><div className="cm-rollup-list">{commitments.unplaced.map(a => <div key={a.awardId}><span><strong>{a.trade} · {a.company}</strong><small>{a.reason}</small></span><span><strong>{usd(a.amount)}</strong><Badge tone={a.counts === "committed" ? "green" : "amber"}>{a.stage}</Badge></span></div>)}</div></Panel>}
      <Tabs tabs={["All costs", "Direct costs", "Indirect costs"]} value={tab} onChange={setTab}/>
      {costCenterNames.length > 1 && <div className="cm-center-tabs"><span>Cost center</span><Tabs tabs={["All cost centers", ...costCenterNames]} value={selectedCenter} onChange={setCenterFilter}/></div>}
      <Panel title={selectedCenter === "All cost centers" ? tab : `${tab} · ${selectedCenter}`} subtitle={`${approved} of ${state.lines.length} lines approved · Editing scope, class, CSI, description, budget, or owner responsibility reopens approval.`} action={<Badge tone={approved === state.lines.length ? "green" : "amber"}>{approved} approved</Badge>}>
        <div className="ui-table-wrap"><table className="ui-table cm-budget-table"><thead>{columns}</thead><tbody>{sections.map(section => {
          const sectionLines = contractorLines.filter(line => line.classification === section);
          return <Fragment key={section}>{allCenters ? budgetRowsByTrade(sectionLines).map(tradeRow) : sectionLines.map(budgetRow)}{sectionLines.length > 0 && totalRow(section, sectionNames[section], sectionTotal(sectionLines, lowSubOf, committedOf))}</Fragment>;
        })}{sections.length > 1 && contractorLines.length > 0 && totalRow("total", "Total cost", sectionTotal(contractorLines, lowSubOf, committedOf), allowancesAdded, contractorLines.filter(line => line.classification === "direct").length)}</tbody></table></div>
        {!contractorLines.length && <Empty title={`No contractor ${tab.toLowerCase()}`} description="Add a line or choose another cost section or cost center."/>}
      </Panel>
      {ownerLines.length > 0 && <Panel title="By owner" subtitle="Shown for project visibility and excluded from contractor totals, committed, and leveling." action={<Badge>{ownerLines.length} excluded</Badge>}>
        <div className="ui-table-wrap"><table className="ui-table cm-budget-table"><thead>{columns}</thead><tbody>{ownerLines.map(budgetRow)}</tbody></table></div>
      </Panel>}
      {state.allowances.length>0 && <Panel title="Allowances carried in this budget" subtitle="Linked allowances are already inside their budget line; unlinked included allowances are added once." action={<Button onClick={()=>navigate("allowances")}>Edit allowances<ArrowRight size={14}/></Button>}><div className="cm-rollup-list">{state.allowances.map(a=><div key={a.id}><span><strong>{a.name}</strong><small>{a.costCenter} · {a.budgetLineId ? "Carried in budget line" : a.status==="included" ? "Added once to budget" : "Not added to total"}</small></span><span><strong>{usd(a.amount)}</strong><Badge tone={a.status==="included"?"green":"amber"}>{allowanceLabels[a.status]}</Badge></span></div>)}</div></Panel>}
      <div className="cm-budget-rollups">
        <Panel title="Cost centers" subtitle="Total cost, committed, area, and cost per square foot for each funding bucket."><div className="cm-rollup-list">{centers.map(({ costCenter, squareFeet, totals: item }, index) => { const perSquareFoot = costPerSquareFoot(item.totalBudget, squareFeet); return <div key={costCenter}><span><i style={{ background: palette[index % palette.length] }}/><span><strong>{costCenter}</strong><small>{squareFeet ? `${squareFeet.toLocaleString("en-US")} SF · ${usdPerSquareFoot(perSquareFoot)}` : "Area not recorded"}</small><small>{item.byOwnerLines ? `${item.byOwnerLines} owner-carried line${item.byOwnerLines === 1 ? "" : "s"} excluded` : item.allowancesAdded ? `${usd(item.allowancesAdded)} added allowance` : item.allowancesInLines ? `${usd(item.allowancesInLines)} carried in lines` : "No included allowances"}</small></span></span><span><span><strong>{usd(item.totalBudget)}</strong><small>{usd(item.committed)} committed</small></span></span></div>; })}</div></Panel>
        <Panel title="Direct cost by CSI division" subtitle="Share of the total trades cost by CSI division."><div className="cm-distribution">{divisions.map((division, index) => { const percent = totals.direct ? Math.round(division.budget / totals.direct * 100) : 0; return <div key={division.division}><div><span><i style={{ background: palette[index % palette.length] }}/>{division.division ? `${division.division} · ${division.name}` : division.name}</span><strong>{usd(division.budget)}</strong></div><div className="cm-distribution-bar"><i style={{ width: `${Math.min(100, percent)}%`, background: palette[index % palette.length] }}/></div></div>; })}<Button onClick={() => navigate("allowances")}>Review allowances<ArrowRight size={15}/></Button></div></Panel>
      </div>
    </>}
    </>}
    {inHouseLine && <InHouseBudgetEditor line={inHouseLine} budget={{state,run}} pkg={tradeForBudgetLine(state, submitted.procurement, inHouseLine)} low={(() => { const pkg = tradeForBudgetLine(state, submitted.procurement, inHouseLine); return pkg ? lowestTradeBid(submitted.procurement, submitted.submissions, pkg.id, candidates, directory, ve) : null; })()} notify={notify} onClose={()=>setInHouseLine(null)}/>}
    {split && <LowBidSplitEditor budget={{state,run}} pkg={split.pkg} bid={split.bid} notify={notify} onClose={()=>setSplit(null)}/>}
    {edit && <Modal title={edit === "new" ? "Add budget line" : `Edit ${edit.description}`} subtitle={edit === "new" ? "Add a direct construction or indirect project cost." : `${edit.costCenter} · ${edit.status}`} onClose={closeLine} wide>
      <LineForm line={edit === "new" ? null : edit} commitment={edit === "new" ? undefined : commitments.lines[edit.id]} costCenters={costCenterNames} errors={errors} onSubmit={saveLine} onCancel={closeLine}/>
      {edit !== "new" && <div className="cm-record-actions"><Button onClick={() => changeApproval(edit)}>{edit.status === "approved" ? <><RotateCcw size={15}/>Reopen approval</> : <><Check size={15}/>Approve line</>}</Button><Button onClick={() => deleteLine(edit)}><Trash2 size={15}/>Remove line</Button></div>}
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
