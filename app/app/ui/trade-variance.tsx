"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { varianceReport, type VarianceRow } from "../../lib/estimate";
import type { useEstimate } from "../../lib/use-estimate";
import type { BudgetState, LevelingCandidate } from "../../lib/budget";
import { Badge, Button, Empty, Panel, PreviewNote, SearchBox, exportRows } from "./shared";
import { estimateMoney } from "./estimate-format";
import "./trade-estimates.css";

export const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${estimateMoney(value)}`;

export function TradeVarianceTable({ rows }: { rows: VarianceRow[] }) {
  return <div className="ui-table-wrap"><table className="ui-table est-variance-table"><thead><tr><th>Trade / estimator</th><th>In-house estimate</th><th>Bid compared</th><th>Budget</th><th>Current forecast</th><th>Bid − estimate</th><th>Budget − estimate</th></tr></thead><tbody>{rows.map(row => <tr key={row.packageId}><th scope="row"><strong>{row.name}</strong><small>{row.owner || "Estimator unassigned"}</small></th><td>{row.estimate === null ? "Not estimated" : <><strong>{estimateMoney(row.estimate)}</strong><small>{row.estimateLines} item{row.estimateLines === 1 ? "" : "s"}{row.estimateUnreviewed ? ` · ${row.estimateUnreviewed} unreviewed` : " · Reviewed"}</small></>}</td><td>{row.bid ? <><strong>{estimateMoney(row.bid.value)}</strong><small>{row.bid.bidderName}</small><Badge tone={row.bid.basis === "reviewed" ? "green" : "amber"}>{row.bid.basis === "reviewed" ? "Reviewed total" : row.bid.basis === "base" ? "Base bid" : "Provisional total"}</Badge><small>{row.bid.from === "leveling" ? "Saved leveling comparison" : "Applied budget forecast snapshot"}</small></> : "No eligible bid"}</td><td>{row.budget === null ? "Not matched" : <>{estimateMoney(row.budget)}<small>{row.budgetBasis === "suggested" ? "Matched by CSI code" : "Linked to trade"}</small></>}</td><td>{row.forecast === null ? "Uses budget baseline" : estimateMoney(row.forecast)}</td><td>{row.bidOverEstimate ? <><strong className={row.bidOverEstimate.amount > 0 ? "est-over" : "est-under"}>{signedMoney(row.bidOverEstimate.amount)}</strong><small>{row.bidOverEstimate.percent === null ? "Percentage unavailable: zero estimate" : `${row.bidOverEstimate.percent > 0 ? "+" : ""}${row.bidOverEstimate.percent}%`}</small><small>{row.bidOverEstimate.amount > 0 ? "Bid above In-house estimate" : row.bidOverEstimate.amount < 0 ? "Bid below In-house estimate" : "Same total"}</small></> : "Not comparable"}</td><td>{row.budgetOverEstimate === null ? "Not comparable" : <><strong className={row.budgetOverEstimate >= 0 ? "est-under" : "est-over"}>{signedMoney(row.budgetOverEstimate)}</strong><small>{row.budgetOverEstimate >= 0 ? "Estimate within budget" : "Estimate above budget"}</small></>}</td></tr>)}</tbody></table></div>;
}

export function TradeVarianceReport({ estimate, budget, candidates, loading, message, onRefresh }: { estimate: ReturnType<typeof useEstimate>; budget: BudgetState; candidates: LevelingCandidate[]; loading: boolean; message: string; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const rows = varianceReport({ rows: estimate.rows, procurement: estimate.procurement, budget, candidates });
  const visible = rows.filter(row => `${row.name} ${row.owner} ${row.bid?.bidderName ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="est-variance-view"><PreviewNote>Trade totals only. In-house estimates exclude indirect costs, markups and allowances; bid totals retain their leveling basis. Confirm equivalent scope and cost coverage before interpreting a difference.</PreviewNote>
    <Panel title="Trade variance report" subtitle="The lowest eligible current reviewed bid is compared first; otherwise the applied bid forecast is used.">
      <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search trade, estimator or bidder…"/><Button onClick={onRefresh} disabled={loading}><RefreshCw size={14}/>Refresh bid comparison</Button><Button disabled={!visible.length} onClick={() => exportRows("trade-variance.csv", [["Trade", "Estimator", "In-house estimate", "Estimate items", "Unreviewed", "Bidder", "Bid", "Bid basis", "Bid source", "Budget", "Budget matching", "Forecast", "Bid minus estimate", "Bid difference %", "Budget minus estimate"], ...visible.map(row => [row.name, row.owner, row.estimate ?? "", row.estimateLines, row.estimateUnreviewed, row.bid?.bidderName ?? "", row.bid?.value ?? "", row.bid?.basis ?? "", row.bid?.from ?? "", row.budget ?? "", row.budgetBasis, row.forecast ?? "", row.bidOverEstimate?.amount ?? "", row.bidOverEstimate?.percent ?? "", row.budgetOverEstimate ?? ""])])}><Download size={14}/>Export report</Button></div>
      {loading ? <p className="est-comparison-message" role="status">Reading the saved bid comparison… Applied forecast snapshots remain available below.</p> : message && <p className="est-comparison-message">{message} The report can still show bid values previously applied to the budget.</p>}
      <p className="est-mobile-hint">Scroll across the table to compare all figures.</p><TradeVarianceTable rows={visible}/>{!visible.length && <Empty title="No matching trades" description="Try another search or add trade packages to this project."/>}
    </Panel>
  </div>;
}
