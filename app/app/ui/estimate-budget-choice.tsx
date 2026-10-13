import { applyEstimateValue, BudgetRuleError, linkBudgetLine, type BudgetLine, type BudgetState } from "../../lib/budget";
import { budgetLinesForTrade, type TradeEstimate } from "../../lib/estimate";
import type { TradePackage } from "../../lib/procurement";
import { Badge, PreviewNote } from "./shared";
import { estimateMoney } from "./estimate-format";

export function estimateForecastError(budget: BudgetState, line: BudgetLine, pkg: TradePackage | undefined, estimate: TradeEstimate | undefined, link: boolean): string | null {
  if (!pkg || !estimate) return "Choose the estimate's trade package.";
  try {
    const match = budgetLinesForTrade(budget, pkg);
    const canLink = !line.packageId && (match.basis === "ambiguous" || match.basis === "none");
    applyEstimateValue(link && canLink ? linkBudgetLine(budget, line.id, pkg.id) : budget, line.id, pkg, estimate, "preview");
    return null;
  } catch (error) {
    if (error instanceof BudgetRuleError) return error.errors.forecast ?? error.errors.line ?? "Check the trade's budget matching.";
    throw error;
  }
}

export function EstimateBudgetChoice({ budget, line, packages, trades, packageId, onPackage, link, onLink }: { budget: BudgetState; line: BudgetLine; packages: TradePackage[]; trades: TradeEstimate[]; packageId: string; onPackage: (id: string) => void; link: boolean; onLink: (link: boolean) => void }) {
  const pkg = packages.find(p => p.id === packageId);
  const estimate = trades.find(t => t.packageId === packageId);
  const match = pkg ? budgetLinesForTrade(budget, pkg) : null;
  const canLink = !line.packageId && (match?.basis === "ambiguous" || match?.basis === "none");
  const error = estimateForecastError(budget, line, pkg, estimate, canLink && link);
  return <div className="est-budget-choice"><label className="ui-field">MCN estimate trade<select value={packageId} onChange={e => onPackage(e.target.value)}><option value="">Choose a trade</option>{packages.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name} · {p.owner || "Unassigned"}</option>)}</select></label>
    {estimate && <><div className="est-estimate-summary"><strong>{estimateMoney(estimate.total)}</strong><span>{estimate.items.length} item{estimate.items.length === 1 ? "" : "s"} · {estimate.unreviewed} unreviewed · {estimate.unpriced} unpriced</span><Badge tone={estimate.unreviewed ? "amber" : estimate.items.length ? "green" : "neutral"}>{estimate.unreviewed ? "Review pending" : estimate.items.length ? "Reviewed" : "No items"}</Badge></div><p className="proc-modal-note">{match?.basis === "suggested" ? "Matched by CSI code. Check the budget lines below before applying the estimate." : match?.basis === "linked" ? "Trade is linked to its budget line." : "The budget match needs an explicit trade link."}</p>{match && match.lines.length > 0 && <ul className="est-budget-matches">{match.lines.map(l => <li key={l.id}>{l.description} · {l.costCenter} · {l.csiCode}</li>)}</ul>}</>}
    {canLink && <label className="cm-owner-toggle"><input type="checkbox" checked={link} onChange={e => onLink(e.target.checked)}/><span><strong>Link this budget line to {pkg?.name}</strong><small>{line.description} · {line.costCenter} · Explicitly replaces the uncertain CSI match.</small></span></label>}
    {error && <p className="proc-source-error" role="status">{error}</p>}
    <PreviewNote>Applies a snapshot to this line's forecast. The budget baseline, bid figures and committed contracts keep their values.</PreviewNote>
  </div>;
}

export function EstimateBasisLabel({ line, trades }: { line: BudgetLine; trades: TradeEstimate[] }) {
  const source = line.estimateSource;
  if (!source) return null;
  const current = trades.find(trade => trade.packageId === source.packageId);
  const changed = current && (current.total !== source.value || current.items.length !== source.lines || current.unreviewed !== source.unreviewed);
  return <div className="cm-budget-source"><strong>MCN estimate · {estimateMoney(source.value)}</strong><small>{source.lines} items · {source.unreviewed} unreviewed at application</small><small>{source.appliedBy} · {new Date(source.appliedAt).toLocaleDateString("en-US")}</small>{changed && <small className="est-warning">Estimate changed since application; forecast keeps its snapshot.</small>}</div>;
}
