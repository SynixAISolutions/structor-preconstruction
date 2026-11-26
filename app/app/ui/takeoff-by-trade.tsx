"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Download, Ruler } from "lucide-react";
import type { Project } from "../../lib/projects";
import { setScopeQuantity, setScopeUnitPrice, type Procurement, type ScopeItem } from "../../lib/procurement";
import { ISSUE_LABEL, priceSuggestions, takeoffByTrade, tradeTakeoff, type PriceSuggestion, type TakeoffLine } from "../../lib/takeoff-by-trade";
import { dueLabel, laborBasisOf, takeoffWorkbook, workbookName } from "../../lib/takeoff-workbook";
import { benchmarks, EMPTY_UNIT_COSTS, UNIT_COSTS_KEY, type UnitCostState } from "../../lib/unit-costs";
import { downloadText } from "../../lib/format";
import type { TakeoffRow } from "../../lib/data/preconstruction";
import { useLocalDraft } from "../../lib/use-local-draft";
import { QuantityChip, QuantityEditor } from "./scope-quantity";
import { estimateMoney } from "./estimate-format";
import { Badge, Button, Empty, Modal, SearchBox, Stats } from "./shared";
import "./takeoff-by-trade.css";

// Takeoff by trade (Marcel's issues log, item 16): every line of the trade's bid form, with its quantity and the
// contractor's unit price, the extended amount and the trade's total, and his ROM unit-pricing workbook to send to
// bidders (lib/takeoff-by-trade, lib/takeoff-workbook). The prices stay with the team.

const actor = "Marcel Khoury";
type Filter = "All lines" | "Need a quantity" | "Need a price";
const FILTERS: Filter[] = ["All lines", "Need a quantity", "Need a price"];

/** "6.25" or "1,250" as typed; NaN when it isn't a number. */
const parsePrice = (text: string) => { const t = text.replace(/[$,\s]/g, ""); return t ? Number(t) : NaN; };
const priceText = (rate: number) => rate.toLocaleString("en-US", { minimumFractionDigits: rate % 1 ? 2 : 0, maximumFractionDigits: 2 });

function PriceCell({ line, suggestions, run, notify }: { line: TakeoffLine; suggestions: PriceSuggestion[]; run: (action: (s: Procurement) => Procurement) => string | null; notify: (m: string) => void }) {
  const { item } = line, price = item.unitPrice;
  const shown = price ? priceText(price.rate) : "";
  const [text, setText] = useState(shown);
  const [was, setWas] = useState(shown);
  if (was !== shown) { setWas(shown); setText(shown); }
  if (!item.quantity) return <span className="tbt-muted">Quantity first</span>;
  function save() {
    if (text.trim() === shown) return;
    const rate = parsePrice(text);
    if (!text.trim()) { const m = run(s => setScopeUnitPrice(s, item.id, null, actor)); notify(m ?? "Unit price removed."); return; }
    if (!Number.isFinite(rate)) { notify("Enter the unit price as a number, e.g. 6.25."); setText(shown); return; }
    const m = run(s => setScopeUnitPrice(s, item.id, { rate }, actor));
    if (m) { notify(m); setText(shown); }
  }
  function use(s: PriceSuggestion) {
    const m = run(st => setScopeUnitPrice(st, item.id, { rate: s.rate, origin: s.origin, basis: s.basis }, actor));
    notify(m ?? `Unit price set from the ${s.origin === "benchmark" ? "unit cost database" : "estimate line"}.`);
  }
  const keys = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(shown); e.currentTarget.blur(); } };
  return <div className="tbt-price">
    <label className="tbt-price-input"><span>$</span><input inputMode="decimal" aria-label={`Unit price for ${item.title}`} value={text} placeholder="0.00" onChange={e => setText(e.target.value)} onBlur={save} onKeyDown={keys}/><small>/ {item.quantity.unit}</small></label>
    {price && <small className="tbt-basis" title={`${price.basis} · ${price.by}`}>{price.origin === "estimator" ? "Typed" : price.origin === "benchmark" ? "Benchmark" : "Estimate line"}{line.issue === "unit-changed" ? ` · per ${price.unit}` : ""}</small>}
    {!price && suggestions.map(s => <button type="button" key={s.origin} className="tbt-suggestion" title={s.basis} onClick={() => use(s)}>Use {s.label}</button>)}
  </div>;
}

/** The screen's one copy of the project's records: what's typed here shows in the trade list and the workbook at once. */
export type TakeoffRecords = { procurement: Procurement; runProcurement: (action: (s: Procurement) => Procurement) => string | null; rows: TakeoffRow[] };

/**
 * One trade's detailed takeoff: its own bid-form lines in order, each with its quantity (set here or in Scopes & bid
 * forms) and the contractor's unit price, typed or picked from what's offered.
 */
export function DetailedTakeoff({ packageId, project, notify, records }: { packageId: string; project: Project; notify: (m: string) => void; records: TakeoffRecords }) {
  const { procurement: state, runProcurement: run, rows } = records;
  const [costs] = useLocalDraft<UnitCostState>(UNIT_COSTS_KEY, EMPTY_UNIT_COSTS);
  // A job never benchmarks itself.
  const list = useMemo(() => benchmarks(costs.entries.filter(e => e.projectId !== project.id)), [costs.entries, project.id]);
  const takeoff = useMemo(() => tradeTakeoff(state, packageId), [state, packageId]);
  const [filter, setFilter] = useState<Filter>("All lines");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ScopeItem | null>(null);
  const shown = takeoff.lines.filter(l => (filter === "All lines" || (filter === "Need a quantity" ? l.issue === "no-quantity" : l.issue === "unpriced" || l.issue === "unit-changed"))
    && `${l.item.title} ${l.item.source}`.toLowerCase().includes(query.trim().toLowerCase()));
  const lines = takeoff.lines.length;
  if (!lines) return <Empty title="No detailed scope lines in this trade yet" description="The takeoff lists this trade's bid-form lines, so it fills in as its scope is written in Scopes & bid forms."/>;
  return <div className="tbt">
    <Stats items={[
      { label: "Scope lines", value: lines, detail: `${takeoff.approved} approved` },
      { label: "With a quantity", value: `${takeoff.quantified} of ${lines}`, detail: !takeoff.quantified ? "None yet" : takeoff.unchecked ? `${takeoff.unchecked} not checked yet` : "All checked", tone: takeoff.quantified < lines ? "amber" : "green" },
      { label: "Priced", value: `${takeoff.priced} of ${lines}`, detail: "Quantity × your unit price", tone: takeoff.priced < lines ? "amber" : "green" },
      { label: "Takeoff total", value: estimateMoney(takeoff.total), detail: "Priced lines only, for plugs and a rough figure" },
    ]}/>
    <p className="tbt-note">Every line of this trade's bid form, as detailed as its scope. Unit prices stay with your team: bidders see a line's quantity, never its price. When a bidder leaves a line out, Bid leveling plugs it from here. The lines for every trade aren't measured, so they aren't listed.</p>
    <div className="ui-toolbar tbt-toolbar"><div className="ui-tabs" role="tablist">{FILTERS.map(f => <button key={f} role="tab" aria-selected={f === filter} className={f === filter ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div><SearchBox value={query} onChange={setQuery} placeholder="Search this trade's lines…"/></div>
    <div className="ui-table-wrap"><table className="ui-table tbt-table">
      <thead><tr><th>#</th><th>Scope line</th><th>Quantity</th><th>Unit price</th><th>Extended</th></tr></thead>
      <tbody>{shown.map(line => {
        const { item } = line;
        const offered = item.unitPrice ? [] : priceSuggestions(item, takeoff.division, rows, list);
        return <tr key={item.id}>
          <td className="tbt-num">{line.number}</td>
          <td className="tbt-line"><strong>{item.title}</strong><span>{item.source && <span className="ui-source">{item.source}</span>}{item.status === "draft" && <Badge tone="amber">Draft</Badge>}</span></td>
          <td className="tbt-qty">{item.quantity ? <button type="button" className="tbt-qty-button" title="Edit the quantity" onClick={() => setEditing(item)}><QuantityChip quantity={item.quantity}/></button> : <Button onClick={() => setEditing(item)}><Ruler size={13}/>Add quantity</Button>}</td>
          <td><PriceCell line={line} suggestions={offered} run={run} notify={notify}/></td>
          <td className="tbt-money">{line.extended !== null ? estimateMoney(line.extended) : <small>{ISSUE_LABEL[line.issue!]}</small>}</td>
        </tr>;
      })}</tbody>
      <tfoot><tr><td/><th scope="row">{filter === "All lines" && !query ? "Trade total" : `Trade total (all ${lines} lines)`}</th><td/><td/><td className="tbt-money"><strong>{estimateMoney(takeoff.total)}</strong></td></tr></tfoot>
    </table></div>
    {!shown.length && <p className="tbt-muted tbt-none">No lines match.</p>}
    {editing && <QuantityEditor item={editing} onClose={() => setEditing(null)} save={input => {
      const message = run(s => setScopeQuantity(s, editing.id, { ...input, origin: "estimator" }, actor));
      if (!message) { notify(editing.unitPrice && editing.unitPrice.unit !== input.unit.trim().toUpperCase() ? `Quantity saved. Its unit price is per ${editing.unitPrice.unit}: price it again.` : "Quantity saved."); setEditing(null); }
      return message;
    }}/>}
  </div>;
}

/** The trade list's column: each trade's takeoff total and how much of it is priced. */
export const takeoffTotals = (state: Procurement) => new Map(takeoffByTrade(state).map(t => [t.packageId, t]));

/**
 * His ROM unit-pricing workbook (lib/takeoff-workbook): which trades, the cover's pricing due date and labor basis, the
 * approved lines only or all, and whether it's the bidders' copy or the internal one with the unit prices.
 */
export function TakeoffWorkbookButton({ project, notify, procurement: state }: { project: Project; notify: (m: string) => void; procurement: Procurement }) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => takeoffByTrade(state), [state]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [internal, setInternal] = useState(false);
  const [due, setDue] = useState("");
  const [labor, setLabor] = useState("");
  function start() {
    const withLines = all.filter(t => t.lines.length).map(t => t.packageId);
    setChosen(withLines);
    const dues = state.packages.filter(p => withLines.includes(p.id) && /^\d{4}-\d{2}-\d{2}$/.test(p.due)).map(p => p.due).sort();
    setDue(dues[0] ? dueLabel(dues[0]) : "");
    setLabor(laborBasisOf(project));
    setApprovedOnly(false); setInternal(false); setOpen(true);
  }
  const counted = all.filter(t => chosen.includes(t.packageId)).map(t => approvedOnly ? t.approved : t.lines.length);
  const total = counted.reduce((a, b) => a + b, 0);
  function save() {
    const trades = state.packages.filter(p => chosen.includes(p.id)).map(p => tradeTakeoff(state, p.id, approvedOnly));
    const bytes = takeoffWorkbook({ project, pricingDue: due, laborBasis: labor, trades, includeRates: internal });
    downloadText(workbookName(project.name, internal), bytes as Uint8Array<ArrayBuffer>, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    notify(`Takeoff workbook saved: ${trades.length} trade tab${trades.length === 1 ? "" : "s"}, ${total} line${total === 1 ? "" : "s"}${internal ? ", with your unit prices. Keep it internal" : ", without your unit prices"}.`);
    setOpen(false);
  }
  const toggle = (id: string, on: boolean) => setChosen(c => on ? [...c, id] : c.filter(x => x !== id));
  return <>
    <Button onClick={start}><Download size={16}/>Takeoff workbook</Button>
    {open && <Modal title="Takeoff workbook" subtitle="Your ROM unit-pricing workbook: a START HERE tab, then a tab per trade with every line, its quantity, and yellow cells for the bidder's quantity, unit price, scope status and qualifications." onClose={() => setOpen(false)}>
      <form className="scope-export" onSubmit={e => { e.preventDefault(); save(); }}>
        <fieldset><legend>Trades · {chosen.length} of {all.length}</legend>
          <div className="scope-export-quick"><button type="button" onClick={() => setChosen(all.map(t => t.packageId))}>Select all</button><button type="button" onClick={() => setChosen([])}>Clear</button></div>
          <div className="scope-export-trades">{all.map(t => <label key={t.packageId}><input type="checkbox" checked={chosen.includes(t.packageId)} onChange={e => toggle(t.packageId, e.target.checked)}/> <span>{t.code} · {t.name} <small>{approvedOnly ? `${t.approved} approved` : `${t.lines.length} line${t.lines.length === 1 ? "" : "s"}`}</small></span></label>)}</div>
        </fieldset>
        <fieldset><legend>Lines</legend>
          <label><input type="radio" name="tbt-lines" checked={!approvedOnly} onChange={() => setApprovedOnly(false)}/> Every line on the bid form, drafts too</label>
          <label><input type="radio" name="tbt-lines" checked={approvedOnly} onChange={() => setApprovedOnly(true)}/> Approved lines only</label>
        </fieldset>
        <label className="ui-field">Pricing due<input value={due} onChange={e => setDue(e.target.value)} placeholder="Thursday, December 10, 2026"/></label>
        <label className="ui-field">Labor basis<input value={labor} onChange={e => setLabor(e.target.value)} placeholder="e.g. Open shop; no Davis-Bacon, CBE or First Source assumed"/><small>From the project's wage scale and certification programs. Check it before sending.</small></label>
        <fieldset><legend>Copy</legend>
          <label><input type="radio" name="tbt-copy" checked={!internal} onChange={() => setInternal(false)}/> For bidders: the Unit Price column is left for them</label>
          <label><input type="radio" name="tbt-copy" checked={internal} onChange={() => setInternal(true)}/> Internal: with your unit prices and extended amounts. Never send this one to bidders</label>
        </fieldset>
        <div className="proc-form-actions"><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!chosen.length}><Download size={15}/>Save workbook · {total} line{total === 1 ? "" : "s"}</Button></div>
      </form>
    </Modal>}
  </>;
}

/** What a trade's takeoff reads as in the trade list. */
export const takeoffSummary = (t: { total: number; priced: number; lines: unknown[] } | undefined) =>
  !t || !t.lines.length ? "No scope lines" : t.priced ? `${estimateMoney(t.total)} · ${t.priced} of ${t.lines.length} priced` : `${t.lines.length} line${t.lines.length === 1 ? "" : "s"}, none priced`;

