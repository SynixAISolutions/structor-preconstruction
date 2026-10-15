"use client";

import { useState, type FormEvent } from "react";
import type { CostBasis, GapResponse } from "../../lib/bid-gap-cost";
import { gapCostAmount } from "../../lib/bid-gap-cost";
import { useEstimate } from "../../lib/use-estimate";
import { Button, Modal } from "./shared";
import { estimateMoney } from "./estimate-format";
import "./workflow-features.css";

type Item = { id: string; description: string; includeInTotal?: boolean };
type Bidder = { id: string; name: string; responses: Record<string, GapResponse> };
export function BidGapCostDialog({ items, bidders, initialItemId, packageId, onClose, onApply }: {
  items: Item[]; bidders: Bidder[]; initialItemId?: string; packageId: string;
  onClose: () => void; onApply: (bidderId: string, itemId: string, basis: CostBasis, reviewed: boolean) => string | null;
}) {
  const estimate = useEstimate();
  const [bidderId, setBidderId] = useState(bidders.find(b => items.some(i => ["N", "P"].includes(b.responses[i.id]?.status)))?.id ?? bidders[0]?.id ?? "");
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [tradeId, setTradeId] = useState(packageId), [estimateId, setEstimateId] = useState("");
  const [quantity, setQuantity] = useState(""), [rate, setRate] = useState(""), [unit, setUnit] = useState(""), [source, setSource] = useState("");
  const [reviewed, setReviewed] = useState(false), [error, setError] = useState("");
  const bidder = bidders.find(b => b.id === bidderId);
  const gaps = items.filter(i => i.includeInTotal !== false && ["N", "P"].includes(bidder?.responses[i.id]?.status ?? ""));
  const item = gaps.find(i => i.id === itemId) ?? gaps[0];
  const target = item ? bidder?.responses[item.id] : undefined;
  const estimateRows = estimate.rows.filter(r => r.packageId === tradeId && r.reviewed && r.quantity > 0 && r.rate > 0);
  const basis = { quantity: quantity.trim() ? Number(quantity) : NaN, rate: rate.trim() ? Number(rate) : NaN, unit, source };
  let amount: number | null = null;
  try { amount = gapCostAmount(basis); } catch { /* Incomplete fields stay visibly unpriced. */ }
  function reset() { setReviewed(false); setError(""); }
  function selectEstimate(id: string) {
    setEstimateId(id); reset(); const row = estimateRows.find(r => r.id === id);
    if (!row) { setQuantity(""); setRate(""); setUnit(""); setSource(""); return; }
    setQuantity(String(row.quantity)); setRate(String(row.rate)); setUnit(row.unit);
    setSource(`Estimate reference: ${row.item}${row.source ? ` · ${row.source}` : ""}. Confirm the portion needed for this bid gap.`);
  }
  function apply(event: FormEvent) {
    event.preventDefault(); if (!item || !bidder) return;
    const message = onApply(bidder.id, item.id, basis, reviewed);
    if (message) setError(message); else onClose();
  }
  return <Modal title="Cost suggestions" subtitle="Review the missing scope and its quantity/rate basis, then apply an approved adjustment to this bid." wide onClose={onClose}><form className="workflow-cost-form" onSubmit={apply}>
    <div className="ui-form-grid"><label className="ui-field">Bidder<select value={bidderId} onChange={e => { setBidderId(e.target.value); setItemId(""); selectEstimate(""); }}>{bidders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="ui-field">Excluded or partial scope<select value={item?.id ?? ""} onChange={e => { setItemId(e.target.value); selectEstimate(""); }}><option value="" disabled>Choose a scope gap</option>{gaps.map(i => <option key={i.id} value={i.id}>{i.description}</option>)}</select></label></div>
    {!gaps.length && <p className="cost-source-note">This bidder has no excluded or partial rows available for a cost adjustment.</p>}
    {item && <><div className="ui-form-grid"><label className="ui-field">Estimate trade<select value={tradeId} onChange={e => { setTradeId(e.target.value); selectEstimate(""); }}><option value="">Choose trade for estimate references</option>{estimate.procurement.packages.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label><label className="ui-field">Reviewed estimate reference<select value={estimateId} onChange={e => selectEstimate(e.target.value)}><option value="">Enter a quantity and rate manually</option>{estimateRows.map(r => <option key={r.id} value={r.id}>{r.item} · {r.quantity} {r.unit} at ${r.rate}</option>)}</select></label></div>
      <p className="cost-source-note">Estimate references list reviewed, priced items in the chosen trade. For partial scope, enter only the missing quantity.</p>
      <div className="ui-form-grid"><label className="ui-field">Missing quantity<input type="number" required min="0.000001" step="any" value={quantity} onChange={e => { setQuantity(e.target.value); reset(); }}/></label><label className="ui-field">Unit<input required value={unit} onChange={e => { setUnit(e.target.value); reset(); }}/></label><label className="ui-field">Unit rate · USD<input type="number" required min="0" step="any" value={rate} onChange={e => { setRate(e.target.value); reset(); }}/></label></div>
      <label className="ui-field">Supporting cost basis<textarea required rows={3} value={source} onChange={e => { setSource(e.target.value); reset(); }} placeholder="Identify the estimate, quote or estimator assumption and its date."/></label>
      <p className="workflow-cost-amount">Proposed adjustment: {amount === null ? "Complete the cost basis" : estimateMoney(amount)}</p>
      <p className="workflow-cost-warning">This replaces the current adjustment of {estimateMoney(target?.adjustment ?? 0)} for {bidder?.name}. The scope exception stays open until you resolve its coverage in the comparison.</p>
      <label className="workflow-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>I checked the missing quantity, rate and supporting basis, and approve replacing this adjustment.</label>
    </>}
    {error && <p role="alert">{error}</p>}<div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!item || amount === null || !reviewed}>Apply approved adjustment</Button></div>
  </form></Modal>;
}
