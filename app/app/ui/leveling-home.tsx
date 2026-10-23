"use client";

import { useRef } from "react";
import { ArrowRight, Download } from "lucide-react";
import type { BidSheetSummary } from "../../lib/bid-sheet-summary";
import { Badge, Button, Empty, Panel, exportRows } from "./shared";
import { estimateMoney } from "./estimate-format";
import "./leveling-home.css";

export const LEVELING_VIEWS = ["Trade packages", "Bid sheet summary"];
export function LevelingViews({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="ui-tabs" role="tablist" aria-label="Bid leveling views">{LEVELING_VIEWS.map((name, i) => <button key={name} ref={el => { buttons.current[i] = el; }} id={`leveling-tab-${i}`} className={value === name ? "active" : ""} role="tab" tabIndex={value === name ? 0 : -1} aria-selected={value === name} aria-controls="leveling-view" onClick={() => onChange(name)} onKeyDown={e => { if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return; e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : (i + 1) % 2; onChange(LEVELING_VIEWS[next]); buttons.current[next]?.focus(); }}>{name}</button>)}</div>;
}

const dollars = (value: number | null) => value === null ? "—" : estimateMoney(value);
const basis = (value: "reviewed" | "base") => value === "reviewed" ? "Reviewed" : "Base bid · needs leveling";

export function BidSheetTable({ summary, onOpen }: { summary: BidSheetSummary; onOpen: (id: string) => void }) {
  const slots = Math.max(1, ...summary.rows.map(r => r.bids.length));
  return <div className="ui-table-wrap"><table className="ui-table bid-sheet-table"><caption>Lowest subcontractor per trade · {summary.withoutBids} trades without bids. Bids are listed lowest first; a reviewed bid is carried ahead of an unreviewed base bid.</caption><thead><tr><th>Est.</th><th>CSI</th><th>Trade</th><th>Budget</th><th>Carried</th><th>Delta</th><th>Cost/SF</th>{Array.from({ length: slots }, (_, i) => <th key={i}>Bid {i + 1}</th>)}</tr></thead><tbody>{summary.rows.map(row => <tr key={row.packageId}><td>{row.owner || "—"}</td><td>{row.code}</td><th scope="row"><button className="table-nav" onClick={() => onOpen(row.packageId)}>{row.trade}</button></th><td>{row.budget === null ? <span tabIndex={0} title="No unique budget line for this trade. The four site trades share the Site improvements line.">—<span className="visually-hidden"> No unique budget line; site trades share Site improvements.</span></span> : dollars(row.budget)}</td><td>{row.carried ? <><strong>{dollars(row.carried.value)}</strong><span>{row.carried.name}</span><small>{basis(row.carried.basis)}</small></> : <span className="bid-sheet-empty">No bids yet</span>}</td><td>{dollars(row.delta)}</td><td>{dollars(row.perSquareFoot)}</td>{Array.from({ length: slots }, (_, i) => { const bid = row.bids[i]; return <td key={i}>{bid ? <><strong>{dollars(bid.value)}</strong><span>{bid.name}</span><small>{basis(bid.basis)}</small></> : "—"}</td>; })}</tr>)}</tbody><tfoot><tr><th colSpan={3} scope="row">Total</th><td>{dollars(summary.total.budget)}</td><td>{dollars(summary.total.carried)}</td><td>{dollars(summary.total.delta)}</td><td>{dollars(summary.total.perSquareFoot)}</td><td colSpan={slots}>Totals include available figures only.</td></tr></tfoot></table></div>;
}

export function LevelingHome({ summary, awarded, ready, tab, onTab, onOpen }: { summary: BidSheetSummary; awarded: string[]; ready: boolean; tab: string; onTab: (tab: string) => void; onOpen: (id: string) => void }) {
  function exportSummary() {
    const slots = Math.max(1, ...summary.rows.map(r => r.bids.length));
    exportRows("bid-sheet-summary.csv", [["Est.", "CSI", "Trade", "Budget", "Carried", "Company", "Basis", "Delta", "Cost/SF", ...Array.from({ length: slots }, (_, i) => [`Bid ${i + 1} company`, `Bid ${i + 1}`, `Bid ${i + 1} basis`]).flat()], ...summary.rows.map(r => [r.owner, r.code, r.trade, r.budget ?? "", r.carried?.value ?? "", r.carried?.name ?? "", r.carried ? basis(r.carried.basis) : "No bids yet", r.delta ?? "", r.perSquareFoot ?? "", ...Array.from({ length: slots }, (_, i) => r.bids[i] ? [r.bids[i].name, r.bids[i].value, basis(r.bids[i].basis)] : ["", "", ""]).flat()]), ["", "", "Total", summary.total.budget, summary.total.carried, "", "", summary.total.delta, summary.total.perSquareFoot ?? ""]]);
  }
  return <div className="leveling-home"><LevelingViews value={tab} onChange={onTab}/><div id="leveling-view" role="tabpanel" aria-labelledby={`leveling-tab-${tab === "Trade packages" ? 0 : 1}`}>
    {tab === "Bid sheet summary" ? <Panel title="Bid sheet summary" subtitle="Every trade, its carried subcontractor and the bids behind it." action={<Button disabled={!ready} onClick={exportSummary}><Download size={15}/>Export CSV for Excel</Button>}><BidSheetTable summary={summary} onOpen={onOpen}/></Panel> : <><div className="leveling-home-intro"><p>Choose a trade to review its bids and level the scope.</p><Badge>{summary.rows.length} trades</Badge></div><div className="leveling-trade-grid">{summary.rows.map(row => { const reviewed = row.bids.filter(b => b.basis === "reviewed").length; const isAwarded = awarded.includes(row.packageId); return <button className="leveling-trade-tile" key={row.packageId} disabled={!ready} onClick={() => onOpen(row.packageId)}><span className="leveling-trade-top"><span>{row.code}</span><Badge tone={isAwarded ? "green" : reviewed ? "blue" : row.bids.length ? "orange" : "neutral"}>{isAwarded ? "Awarded" : reviewed ? "Leveled" : row.bids.length ? "Bids in" : "Awaiting bids"}</Badge></span><h2>{row.trade}</h2><p>{row.owner || "Estimator not assigned"}</p><div className="leveling-trade-counts"><span><b>{row.bids.length}</b> bids in</span><span><b>{reviewed}</b> leveled</span></div><footer><span>{row.carried ? dollars(row.carried.value) : "No bids yet"}</span><ArrowRight size={16}/></footer></button>; })}</div>{!summary.rows.length && <Empty title="No trade packages yet" description="Confirm your trade packages in Scopes & bid forms to start leveling."/>}</>}
  </div></div>;
}
