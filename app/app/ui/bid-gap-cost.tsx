"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CostBasis, GapResponse } from "../../lib/bid-gap-cost";
import { gapCostAmount } from "../../lib/bid-gap-cost";
import { useEstimate } from "../../lib/use-estimate";
import { Button, Modal } from "./shared";
import { estimateMoney } from "./estimate-format";
import "./workflow-features.css";
import { aiJob } from "../../lib/ai-more-client";
import type { GapCostSuggestion } from "../../lib/gap-cost-ai";

type Item = { id: string; description: string; includeInTotal?: boolean };
type Bidder = { id: string; name: string; responses: Record<string, GapResponse> };
export function BidGapCostDialog({ items, bidders, initialItemId, packageId, onClose, onApply }: {
  items: Item[]; bidders: Bidder[]; initialItemId?: string; packageId: string;
  onClose: () => void; onApply: (bidderId: string, itemId: string, basis: CostBasis, reviewed: boolean, coversScope: boolean) => string | null;
}) {
  const estimate = useEstimate();
  const [bidderId, setBidderId] = useState(bidders.find(b => items.some(i => ["N", "P"].includes(b.responses[i.id]?.status)))?.id ?? bidders[0]?.id ?? "");
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [tradeId, setTradeId] = useState(packageId), [estimateId, setEstimateId] = useState("");
  const [quantity, setQuantity] = useState(""), [rate, setRate] = useState(""), [unit, setUnit] = useState(""), [source, setSource] = useState("");
  const [reviewed, setReviewed] = useState(false), [error, setError] = useState("");
  const [coversScope, setCoversScope] = useState(false);
  const [suggestions, setSuggestions] = useState<GapCostSuggestion[]>([]), [busy, setBusy] = useState(false), [read, setRead] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const bidder = bidders.find(b => b.id === bidderId);
  const gaps = items.filter(i => i.includeInTotal !== false && ["N", "P"].includes(bidder?.responses[i.id]?.status ?? ""));
  const item = gaps.find(i => i.id === itemId) ?? gaps[0];
  const target = item ? bidder?.responses[item.id] : undefined;
  const estimateRows = estimate.rows.filter(r => r.packageId === tradeId && r.reviewed && r.quantity > 0 && r.rate > 0);
  const basis = { quantity: quantity.trim() ? Number(quantity) : NaN, rate: rate.trim() ? Number(rate) : NaN, unit, source };
  let amount: number | null = null;
  try { amount = gapCostAmount(basis); } catch { /* Incomplete fields stay visibly unpriced. */ }
  function reset() { setReviewed(false); setCoversScope(false); setError(""); }
  function clearSuggestions() { request.current?.abort(); request.current = null; setBusy(false); setRead(false); setSuggestions([]); }
  async function suggest() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setRead(false); setSuggestions([]);
    try {
      const references = estimateRows.filter(r => r.source.trim()).slice(0, 99).map(r => ({ id: r.id, item: r.item, quantity: r.quantity, rate: r.rate, unit: r.unit, source: r.source }));
      if (amount !== null && item) references.push({ id: "manual-cost-basis", item: item.description, ...basis });
      if (!references.length) throw new Error("Add a reviewed, priced estimate item for this trade or enter a quantity, rate and supporting source below.");
      const found: GapCostSuggestion[] = [];
      for (let start = 0; start < gaps.length; start += 40) {
        const reply = await aiJob<{ suggestions: GapCostSuggestion[] }>("gap-cost", { gaps: gaps.slice(start, start + 40).map(g => ({ id: g.id, description: g.description, status: bidder!.responses[g.id].status, note: bidder!.responses[g.id].note })), references }, controller.signal);
        found.push(...reply.suggestions);
      }
      if (request.current !== controller || controller.signal.aborted) return;
      setSuggestions(found); setRead(true);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Cost suggestions could not be read."); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  function useSuggestion(s: GapCostSuggestion) {
    setItemId(s.gapId); setEstimateId(""); setQuantity(String(s.quantity)); setRate(String(s.rate)); setUnit(s.unit);
    setSource(`AI matched estimate reference: ${s.item} · ${s.source}. ${s.explanation}`); reset();
  }
  function selectEstimate(id: string) {
    setEstimateId(id); reset(); const row = estimateRows.find(r => r.id === id);
    if (!row) { setQuantity(""); setRate(""); setUnit(""); setSource(""); return; }
    setQuantity(String(row.quantity)); setRate(String(row.rate)); setUnit(row.unit);
    setSource(`Estimate reference: ${row.item}${row.source ? ` · ${row.source}` : ""}. Confirm the portion needed for this bid gap.`);
  }
  function apply(event: FormEvent) {
    event.preventDefault(); if (!item || !bidder) return;
    const message = onApply(bidder.id, item.id, basis, reviewed, coversScope);
    if (message) setError(message); else onClose();
  }
  return <Modal title="Cost suggestions" subtitle="Review the missing scope and its quantity/rate basis, then apply an approved adjustment to this bid." wide onClose={onClose}><form className="workflow-cost-form" onSubmit={apply}>
    <div className="ui-form-grid"><label className="ui-field">Bidder<select value={bidderId} onChange={e => { clearSuggestions(); setBidderId(e.target.value); setItemId(""); selectEstimate(""); }}>{bidders.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="ui-field">Excluded or partial scope<select value={item?.id ?? ""} onChange={e => { setItemId(e.target.value); selectEstimate(""); }}><option value="" disabled>Choose a scope gap</option>{gaps.map(i => <option key={i.id} value={i.id}>{i.description}</option>)}</select></label></div>
    {!gaps.length && <p className="cost-source-note">This bidder has no excluded or partial rows available for a cost adjustment.</p>}
    {item && <><div className="proc-form-actions"><Button disabled={busy} onClick={() => void suggest()}>{busy ? "Reading missing scope…" : "Suggest plug costs with AI"}</Button><span className="cost-source-note">AI matches missing scope to your priced estimate references. Calculations use their saved quantities and rates.</span></div>
      {read && gaps.map(g => { const suggestion = suggestions.find(s => s.gapId === g.id); return <section className="contract-file-row" key={g.id}><strong>{g.description}</strong>{suggestion ? <><p>{suggestion.quantity} {suggestion.unit} × {estimateMoney(suggestion.rate)} = <strong>{estimateMoney(suggestion.amount)}</strong></p><p>{suggestion.explanation}</p><small>{suggestion.item} · {suggestion.source}</small><Button onClick={() => useSuggestion(suggestion)}>Review suggested plug</Button></> : <p>No suitable priced reference found. Enter a supported quantity and rate manually.</p>}</section>; })}
      <div className="ui-form-grid"><label className="ui-field">Estimate trade<select value={tradeId} onChange={e => { clearSuggestions(); setTradeId(e.target.value); selectEstimate(""); }}><option value="">Choose trade for estimate references</option>{estimate.procurement.packages.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label><label className="ui-field">Reviewed estimate reference<select value={estimateId} onChange={e => selectEstimate(e.target.value)}><option value="">Enter a quantity and rate manually</option>{estimateRows.map(r => <option key={r.id} value={r.id}>{r.item} · {r.quantity} {r.unit} at ${r.rate}</option>)}</select></label></div>
      <p className="cost-source-note">Estimate references list reviewed, priced items in the chosen trade. For partial scope, enter only the missing quantity.</p>
      <div className="ui-form-grid"><label className="ui-field">Missing quantity<input type="number" required min="0.000001" step="any" value={quantity} onChange={e => { setQuantity(e.target.value); reset(); }}/></label><label className="ui-field">Unit<input required value={unit} onChange={e => { setUnit(e.target.value); reset(); }}/></label><label className="ui-field">Unit rate · USD<input type="number" required min="0" step="any" value={rate} onChange={e => { setRate(e.target.value); reset(); }}/></label></div>
      <label className="ui-field">Supporting cost basis<textarea required rows={3} value={source} onChange={e => { setSource(e.target.value); reset(); }} placeholder="Identify the estimate, quote or estimator assumption and its date."/></label>
      <p className="workflow-cost-amount">Proposed adjustment: {amount === null ? "Complete the cost basis" : estimateMoney(amount)}</p>
      <p className="workflow-cost-warning">This replaces the current adjustment of {estimateMoney(target?.adjustment ?? 0)} for {bidder?.name}. The budget uses the reviewed total once every scope exception is resolved.</p>
      <label className="workflow-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>I checked the missing quantity, rate and supporting basis, and approve replacing this adjustment.</label>
      <label className="workflow-check"><input type="checkbox" checked={coversScope} onChange={e => setCoversScope(e.target.checked)}/>This plug covers the full missing scope for this line. Resolve its coverage check.</label>
    </>}
    {error && <p role="alert">{error}</p>}<div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!item || amount === null || !reviewed}>Apply approved adjustment</Button></div>
  </form></Modal>;
}
