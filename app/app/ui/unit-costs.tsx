"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { editEstimateItem } from "../../lib/estimate";
import type { BudgetHistory } from "../../lib/historical-budget";
import { CERTIFICATION_PROGRAMS, TAX_STATUSES, type Project, type TaxStatus } from "../../lib/projects";
import { BENCHMARK_MARGIN, EMPTY_UNIT_COSTS, UNIT_COSTS_KEY, addUnitCost, benchmarks, checkEstimate, divisionCostsPerSf, entriesFromEstimate, filterUnitCosts, removeUnitCost, requirementsOf, saveUnitCosts, unitCostRows, type UnitCostFilter, type UnitCostInput, type UnitCostState } from "../../lib/unit-costs";
import { CSI_DIVISIONS } from "../../lib/csi";
import { useEstimate } from "../../lib/use-estimate";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, SearchBox, Stats, Tabs, exportRows, type ViewProps } from "./shared";
import "./unit-costs.css";

const actor = "Marcel Khoury";
const TABS = ["Unit costs", "This project", "Cost per SF"];
const rate = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The organization's unit costs (Marcel's process doc): rates kept from each job, with the requirements and place that
 * shaped them, as a benchmark for the next one (lib/unit-costs).
 */
export function UnitCostsView({ project, navigate, notify }: ViewProps & { project: Project }) {
  const [state, setState] = useLocalDraft<UnitCostState>(UNIT_COSTS_KEY, EMPTY_UNIT_COSTS);
  const [history] = useLocalDraft<BudgetHistory[]>("budget-history", []);
  const { rows, procurement, run } = useEstimate();
  const [tab, setTab] = useState(TABS[0]);
  const [filter, setFilter] = useState<UnitCostFilter>({});
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = useMemo(() => filterUnitCosts(state.entries, filter), [state.entries, filter]);
  const groups = useMemo(() => benchmarks(shown), [shown]);
  const checks = useMemo(() => checkEstimate(rows, shown, project.id), [rows, shown, project.id]);
  const perSf = useMemo(() => divisionCostsPerSf(history, filter), [history, filter]);
  const set = (patch: Partial<UnitCostFilter>) => setFilter(f => ({ ...f, ...patch }));

  function saveProject() {
    const found = entriesFromEstimate(rows, project, today(), actor);
    const saved = saveUnitCosts(state, found.entries);
    setState(saved.state);
    const left = [found.unreviewed && `${found.unreviewed} not reviewed yet`, found.unpriced && `${found.unpriced} without a rate`, found.samples && `${found.samples} illustrative`].filter(Boolean).join(", ");
    notify(`${project.name}: ${saved.added} unit cost${saved.added === 1 ? "" : "s"} added, ${saved.updated} updated, ${saved.unchanged} unchanged.${left ? ` Left out: ${left}.` : ""}`);
  }
  function plug(id: string, median: number, count: number) {
    const problem = run(current => editEstimateItem(current, procurement, id, { rate: median, source: `Unit cost database: median of ${count} price${count === 1 ? "" : "s"}` }));
    notify(problem ?? "Rate added to the estimate, ready for review in Quantity takeoffs.");
  }

  const flagged = checks.filter(c => c.flag === "high" || c.flag === "low").length, matched = checks.filter(c => c.benchmark).length;
  return <>
    <PageHeader eyebrow="COST DATA" title="Unit cost database" description="Rates from your jobs, kept with what shaped them, as a benchmark for the next one." actions={<>
      <ExportButton onClick={() => exportRows("Structor unit costs.csv", unitCostRows(shown))}/>
      <Button onClick={() => setAdding(true)}><Plus size={16}/>Add a price</Button>
      <Button variant="primary" onClick={saveProject}><Save size={16}/>Save {project.name}'s rates</Button>
    </>}/>
    <div className="unit-costs">
      <Tabs tabs={TABS} value={tab} onChange={setTab}/>
      <div className="unit-costs-filters">
        <SearchBox value={filter.query ?? ""} onChange={query => set({ query })} placeholder="Search items or jobs…"/>
        <label className="ui-field">Tax status<select value={filter.taxStatus ?? ""} onChange={e => set({ taxStatus: e.target.value as TaxStatus | "" })}><option value="">Any</option>{TAX_STATUSES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label className="ui-field">Program<select value={filter.program ?? ""} onChange={e => set({ program: e.target.value })}><option value="">Any</option>{CERTIFICATION_PROGRAMS.map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="ui-field">Location<input value={filter.location ?? ""} placeholder="e.g. DC" onChange={e => set({ location: e.target.value })}/></label>
        <label className="ui-field">From year<input inputMode="numeric" value={filter.since ?? ""} placeholder="e.g. 2024" onChange={e => set({ since: e.target.value.replace(/\D/g, "").slice(0, 4) })}/></label>
        <Button onClick={() => setFilter(requirementsOf(project))}>Match {project.name}</Button>
        <Button onClick={() => setFilter({})}>Clear</Button>
      </div>

      {tab === "Unit costs" && (!state.entries.length
        ? <Empty title="No unit costs yet" description={`Choose Save ${project.name}'s rates to keep the reviewed rates from its Quantity takeoffs, or Add a price for a quote or an earlier job.`} action={<Button onClick={() => navigate("takeoffs")}>Open Quantity takeoffs</Button>}/>
        : !groups.length ? <Empty title="Nothing matches" description="No prices from jobs like this. Widen the filters."/>
        : <Panel title={`${groups.length} item${groups.length === 1 ? "" : "s"}`} subtitle={`${shown.length} price${shown.length === 1 ? "" : "s"} from ${new Set(shown.map(e => e.project)).size} job${new Set(shown.map(e => e.project)).size === 1 ? "" : "s"}. Open an item for each price and where it came from.`}>
          <div className="ui-table-wrap"><table className="ui-table unit-costs-table"><thead><tr><th>Item</th><th>Division</th><th>Unit</th><th>Low</th><th>Median</th><th>High</th><th>Jobs</th><th>By year</th></tr></thead><tbody>
            {groups.map(group => <Fragment key={group.key}>
              <tr>
                <td><button className="unit-costs-open" aria-expanded={open === group.key} onClick={() => setOpen(o => o === group.key ? null : group.key)}>{open === group.key ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}{group.item}</button></td>
                <td>{group.division ? <span title={CSI_DIVISIONS[group.division]}>{group.division}</span> : "—"}</td>
                <td>{group.unit}</td>
                <td className="unit-costs-num">{rate(group.low)}</td><td className="unit-costs-num"><strong>{rate(group.median)}</strong></td><td className="unit-costs-num">{rate(group.high)}</td>
                <td className="unit-costs-num">{group.jobs}</td>
                <td className="unit-costs-years">{group.byYear.map(y => <span key={y.year}><small>{y.year}</small>{rate(y.median)}</span>)}</td>
              </tr>
              {open === group.key && group.entries.map(entry => <tr key={entry.id} className="unit-costs-entry">
                <td colSpan={3}><strong>{entry.project}</strong><small>{[entry.location, TAX_STATUSES.find(t => t.value === entry.taxStatus)?.label, ...entry.certifications].filter(Boolean).join(" · ") || "No requirements recorded"}</small></td>
                <td colSpan={2} className="unit-costs-num"><strong>{rate(entry.rate)}</strong><small>{entry.date}</small></td>
                <td colSpan={2}><small>{entry.source} · {entry.by}</small></td>
                <td><button className="ui-icon-btn" aria-label={`Remove ${entry.project}'s price for ${entry.item}`} title="Remove" onClick={() => setState(s => removeUnitCost(s, entry.id))}><Trash2 size={14}/></button></td>
              </tr>)}
            </Fragment>)}
          </tbody></table></div>
        </Panel>)}

      {tab === "This project" && <>
        <Stats items={[
          { label: "Estimate lines", value: rows.length, detail: project.name },
          { label: "With a benchmark", value: matched, detail: "prices from other jobs" },
          { label: "Worth a second look", value: flagged, detail: `over ${Math.round(BENCHMARK_MARGIN * 100)}% from the median`, tone: flagged ? "orange" : "" },
        ]}/>
        {!rows.length ? <Empty title="No estimate lines yet" description="Add lines in Quantity takeoffs, then compare them here." action={<Button onClick={() => navigate("takeoffs")}>Open Quantity takeoffs</Button>}/>
          : <Panel title="Rates against the database" subtitle="Only prices from other jobs, within the filters above. A line with no rate can take the median; it then waits for review in Quantity takeoffs.">
            <div className="ui-table-wrap"><table className="ui-table unit-costs-table"><thead><tr><th>Estimate line</th><th>Unit</th><th>This job</th><th>Benchmark</th><th>Range</th><th>Difference</th></tr></thead><tbody>
              {checks.map(({ row, benchmark, difference, flag }) => <tr key={row.id}>
                <td><strong>{row.item}</strong>{benchmark && benchmark.item !== row.item && <small>Compared with: {benchmark.item}</small>}</td>
                <td>{row.unit}</td>
                <td className="unit-costs-num">{row.rate > 0 ? rate(row.rate) : "—"}</td>
                <td className="unit-costs-num">{benchmark ? <>{rate(benchmark.median)}<small>{benchmark.count} price{benchmark.count === 1 ? "" : "s"}</small></> : "—"}</td>
                <td className="unit-costs-num">{benchmark ? `${rate(benchmark.low)} to ${rate(benchmark.high)}` : "—"}</td>
                <td>{flag === "unpriced" && benchmark ? <Button onClick={() => plug(row.id, benchmark.median, benchmark.count)}>Use {rate(benchmark.median)}</Button> : flag === "none" ? <small>No prices yet</small> : <Badge tone={flag === "close" ? "green" : "orange"}>{percent(difference ?? 0)}</Badge>}</td>
              </tr>)}
            </tbody></table></div>
          </Panel>}
      </>}

      {tab === "Cost per SF" && (!perSf.divisions.length
        ? <Empty title="No past jobs to go by" description={history.length ? "No job in the comparable project library matches these filters." : "Add finished estimates to the comparable project library, under Concept budget in Budget summary. Each division's cost per square foot comes from them."} action={<Button onClick={() => navigate("budget")}>Open Budget summary</Button>}/>
        : <Panel title="Cost per square foot, by division" subtitle={`From ${perSf.jobs} job${perSf.jobs === 1 ? "" : "s"} in the comparable project library, as recorded and not escalated. For pricing a job with few drawings.`}>
          <div className="ui-table-wrap"><table className="ui-table unit-costs-table"><thead><tr><th>Division</th><th>Low</th><th>Median</th><th>High</th><th>Jobs</th></tr></thead><tbody>
            {perSf.divisions.map(d => <tr key={d.division}><td><strong>{d.division}</strong> {d.name}</td><td className="unit-costs-num">{rate(d.low)}</td><td className="unit-costs-num"><strong>{rate(d.median)}</strong></td><td className="unit-costs-num">{rate(d.high)}</td><td className="unit-costs-num">{d.jobs}</td></tr>)}
            {perSf.total && <tr className="unit-costs-total"><td><strong>All trades</strong></td><td className="unit-costs-num">{rate(perSf.total.low)}</td><td className="unit-costs-num"><strong>{rate(perSf.total.median)}</strong></td><td className="unit-costs-num">{rate(perSf.total.high)}</td><td className="unit-costs-num">{perSf.total.jobs}</td></tr>}
          </tbody></table></div>
        </Panel>)}
    </div>
    {adding && <AddPrice project={project} onClose={() => setAdding(false)} onAdd={input => { setState(addUnitCost(state, input, actor)); setAdding(false); notify(`${input.item} added to the database.`); }}/>}
  </>;
}

function AddPrice({ project, onAdd, onClose }: { project: Project; onAdd: (input: UnitCostInput) => void; onClose: () => void }) {
  const [form, setForm] = useState({ item: "", unit: "SF", rate: "", division: "", project: project.name, location: project.location, taxStatus: (project.taxStatus ?? "") as TaxStatus | "", date: today() });
  const [programs, setPrograms] = useState<string[]>(project.certifications);
  const [error, setError] = useState("");
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value })) });
  return <Modal title="Add a price" subtitle="From a quote, a vendor or an earlier job." onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); try { onAdd({ ...form, rate: Number(form.rate), taxStatus: form.taxStatus || null, certifications: programs }); } catch (failure) { setError(failure instanceof Error ? failure.message : "The price could not be added."); } }}>
      <div className="ui-form-grid">
        <label className="ui-field full">Item<input {...field("item")} placeholder="e.g. Single-ply membrane roofing"/></label>
        <label className="ui-field">Unit<input {...field("unit")}/></label>
        <label className="ui-field">Unit cost ($)<input {...field("rate")} inputMode="decimal"/></label>
        <label className="ui-field">Division<select {...field("division")}><option value="">Not set</option>{Object.entries(CSI_DIVISIONS).sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}</select></label>
        <label className="ui-field">Date of the price<input type="date" {...field("date")}/></label>
        <label className="ui-field">Job or source<input {...field("project")}/></label>
        <label className="ui-field">Location<input {...field("location")}/></label>
        <label className="ui-field">Tax status<select {...field("taxStatus")}><option value="">Not recorded</option>{TAX_STATUSES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      </div>
      <fieldset className="unit-costs-programs"><legend>Programs on the job</legend>{CERTIFICATION_PROGRAMS.map(p => <label key={p}><input type="checkbox" checked={programs.includes(p)} onChange={e => setPrograms(list => e.target.checked ? [...list, p] : list.filter(x => x !== p))}/>{p}</label>)}</fieldset>
      {error && <p className="unit-costs-error" role="alert">{error}</p>}
      <div className="ui-form-actions"><Button type="submit" variant="primary">Add price</Button></div>
    </form>
  </Modal>;
}
