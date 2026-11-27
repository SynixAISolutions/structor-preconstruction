"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil, Ruler, X } from "lucide-react";
import { checkScopeQuantity, QUANTITY_UNITS, quantityLabel, setScopeQuantity, type Procurement, type ScopeItem, type ScopeQuantity } from "../../lib/procurement";
import { quantityFromTakeoff, takeoffChoices, takeoffDrift } from "../../lib/scope-quantity";
import { useEstimate } from "../../lib/use-estimate";
import { Badge, Button, Modal } from "./shared";

// A scope line's quantity (Marcel's issues log, item 19): beside the line in the bid form, set by the estimator,
// taken from a Quantity takeoffs line, or carried from an AI drawing finding someone accepted (lib/procurement,
// lib/scope-quantity).

type Run = (action: (current: Procurement) => Procurement) => string | null;

const ORIGIN: Record<ScopeQuantity["origin"], string> = { estimator: "Entered by an estimator", takeoff: "From Quantity takeoffs", ai: "Read from the drawings by AI, accepted" };

/** The quantity beside a line in the list; amber until checked. */
export function QuantityChip({ quantity }: { quantity: ScopeQuantity }) {
  return <span className={`proc-qty${quantity.checked ? "" : " unchecked"}`} title={quantity.checked ? quantity.basis : `Not checked yet · ${quantity.basis}`}><Ruler size={11}/>{quantityLabel(quantity)}</span>;
}

/** The QUANTITY part of Requirement detail. `packageId` is the trade on screen, whose takeoff lines are offered. */
export function ScopeQuantityPanel({ item, packageId, run, notify, by }: { item: ScopeItem; packageId: string; run: Run; notify: (message: string) => void; by: string }) {
  const { rows } = useEstimate();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const q = item.quantity ?? null;
  const drift = takeoffDrift(item, rows);
  const choices = takeoffChoices(rows, item, packageId);
  const act = (action: (current: Procurement) => Procurement, done: string) => { const message = run(action); notify(message ?? done); return message; };
  return <div className="proc-quantity">
    <span className="proc-label"><Ruler size={12}/>QUANTITY</span>
    {q ? <>
      <strong className="proc-quantity-value">{quantityLabel(q)}{!q.checked && <Badge tone="amber">Not checked</Badge>}</strong>
      <small>{q.origin === "takeoff" ? q.basis : `${ORIGIN[q.origin]} · ${q.basis}`}</small>
      {!q.checked && <p className="proc-quantity-note">Check it against the drawings before publishing: the takeoff line it came from hasn't been reviewed.</p>}
      {drift?.kind === "changed" && <p className="proc-quantity-note">The takeoff line now says {quantityLabel({ value: drift.row.quantity, unit: drift.row.unit.trim().toUpperCase() })}. <button type="button" onClick={() => act(current => setScopeQuantity(current, item.id, quantityFromTakeoff(drift.row), by), "Quantity updated from the takeoff line.")}>Use the new figure</button></p>}
      {drift?.kind === "gone" && <p className="proc-quantity-note">The takeoff line it came from has been deleted. Keep the figure, change it, or remove it.</p>}
    </> : <p className="proc-quantity-empty">No quantity. Bidders see this line without one.</p>}
    <div className="proc-detail-actions">
      {q && !q.checked && <Button onClick={() => act(current => checkScopeQuantity(current, item.id, by), "Quantity checked.")}><Check size={14}/>Mark checked</Button>}
      <Button onClick={() => setEditing(true)}><Pencil size={14}/>{q ? "Edit quantity" : "Add quantity"}</Button>
      <Button disabled={!choices.length} onClick={() => setPicking(true)}><Ruler size={14}/>Use a takeoff line</Button>
      {q && <Button onClick={() => act(current => setScopeQuantity(current, item.id, null, by), "Quantity removed.")}><X size={14}/>Remove</Button>}
      {!choices.length && <small>No takeoff lines with a quantity in this trade yet.</small>}
    </div>
    {editing && <QuantityEditor item={item} onClose={() => setEditing(false)} save={input => { const message = run(current => setScopeQuantity(current, item.id, { ...input, origin: "estimator" }, by)); if (!message) { notify("Quantity saved."); setEditing(false); } return message; }}/>}
    {picking && <Modal title="Use a takeoff line" subtitle={`The quantity for "${item.title}", from this trade's Quantity takeoffs. Lines most like it come first.`} onClose={() => setPicking(false)}>
      <div className="proc-takeoff-choices">{choices.map(row => <article key={row.id}>
        <span><strong>{row.item}</strong><small>{row.source || "No source"}{row.reviewed ? "" : " · not reviewed yet"}</small></span>
        <b>{quantityLabel({ value: row.quantity, unit: row.unit.trim().toUpperCase() })}</b>
        <Button onClick={() => { if (!act(current => setScopeQuantity(current, item.id, quantityFromTakeoff(row), by), row.reviewed ? "Quantity taken from the takeoff line." : "Quantity taken from the takeoff line. Check it before publishing: the line isn't reviewed.")) setPicking(false); }}>Use</Button>
      </article>)}</div>
    </Modal>}
  </div>;
}

export function QuantityEditor({ item, onClose, save }: { item: ScopeItem; onClose: () => void; save: (input: { value: number; unit: string; basis: string }) => string | null }) {
  const q = item.quantity;
  const [value, setValue] = useState(q ? String(q.value) : "");
  const [unit, setUnit] = useState(q?.unit ?? "SF");
  const [basis, setBasis] = useState(q?.basis ?? "");
  const [error, setError] = useState("");
  const units = [...new Set([...QUANTITY_UNITS, unit])];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const number = Number(value.replace(/,/g, "").trim());
    setError(save({ value: value.trim() ? number : NaN, unit, basis }) ?? "");
  };
  return <Modal title={q ? "Edit quantity" : "Add quantity"} subtitle={item.title} onClose={onClose}>
    <form className="proc-quantity-form" onSubmit={submit}>
      <div className="proc-quantity-fields">
        <label>Quantity<input inputMode="decimal" autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="1,240"/></label>
        <label>Unit<select value={unit} onChange={e => setUnit(e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select></label>
      </div>
      <label>Where it comes from<textarea rows={3} value={basis} onChange={e => setBasis(e.target.value)} placeholder="AD-101: 14 windows counted on the east elevation, 6 ft x 8 ft each"/></label>
      <small>Bidders see the quantity beside the line, for reference. Where it comes from stays with your team.</small>
      {error && <p role="alert" className="scope-export-error">{error}</p>}
      <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save quantity</Button></div>
    </form>
  </Modal>;
}
