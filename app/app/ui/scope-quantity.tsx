"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Check, FileText, Pencil, Ruler, Sparkles, X } from "lucide-react";
import { dollars, estimateCost } from "../../lib/ai-cost";
import { useAiReader } from "../../lib/ai-reader-client";
import { bidForm, checkScopeQuantity, QUANTITY_UNITS, quantityLabel, setScopeQuantity, type Procurement, type ScopeItem, type ScopeQuantity, type TradePackage } from "../../lib/procurement";
import { drawingRegister } from "../../lib/project-files";
import { useProjectDocuments } from "../../lib/project-files-client";
import { applyAiQuantities, quantityPlan } from "../../lib/quantity-ai";
import type { QuantityRun } from "../../lib/quantity-ai-client";
import { citationEvidence } from "../../lib/scope-evidence";
import { quantityFromTakeoff, takeoffChoices, takeoffDrift } from "../../lib/scope-quantity";
import { useEstimate } from "../../lib/use-estimate";
import { ScopeSourceModal } from "./package-scope-sources";
import { Badge, Button, Modal } from "./shared";

// A scope line's quantity (Marcel's issues log, item 19): beside the line in the bid form, set by the estimator,
// taken from a Quantity takeoffs line, carried from an AI drawing finding someone accepted, or proposed by the AI
// quantity pass over a trade's sheets (lib/procurement, lib/scope-quantity, lib/quantity-ai).

type Run = (action: (current: Procurement) => Procurement) => string | null;

const originLabel = (q: ScopeQuantity) => q.origin === "estimator" ? "Entered by an estimator" : q.origin === "takeoff" ? "From Quantity takeoffs" : q.checked ? "Read from the drawings by AI, checked" : "Proposed by AI from the drawings";

/** The quantity beside a line in the list; amber until checked. */
export function QuantityChip({ quantity }: { quantity: ScopeQuantity }) {
  return <span className={`proc-qty${quantity.checked ? "" : " unchecked"}`} title={quantity.checked ? quantity.basis : `Not checked yet · ${quantity.basis}`}><Ruler size={11}/>{quantityLabel(quantity)}</span>;
}

/** The QUANTITY part of Requirement detail. `packageId` is the trade on screen, whose takeoff lines are offered. */
export function ScopeQuantityPanel({ item, packageId, run, notify, by }: { item: ScopeItem; packageId: string; run: Run; notify: (message: string) => void; by: string }) {
  const { rows } = useEstimate();
  const { documents } = useProjectDocuments();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState(false);
  const q = item.quantity ?? null;
  const drift = takeoffDrift(item, rows);
  const choices = takeoffChoices(rows, item, packageId);
  const act = (action: (current: Procurement) => Procurement, done: string) => { const message = run(action); notify(message ?? done); return message; };
  return <div className="proc-quantity">
    <span className="proc-label"><Ruler size={12}/>QUANTITY</span>
    {q ? <>
      <strong className="proc-quantity-value">{quantityLabel(q)}{!q.checked && <Badge tone="amber">Not checked</Badge>}</strong>
      <small>{q.origin === "takeoff" ? q.basis : `${originLabel(q)} · ${q.basis}`}</small>
      {!q.checked && <p className="proc-quantity-note">{q.origin === "ai" ? "Check it on the sheet before publishing: View on sheet opens it at the printed words it rests on." : "Check it against the drawings before publishing: the takeoff line it came from hasn't been reviewed."}</p>}
      {drift?.kind === "changed" && <p className="proc-quantity-note">The takeoff line now says {quantityLabel({ value: drift.row.quantity, unit: drift.row.unit.trim().toUpperCase() })}. <button type="button" onClick={() => act(current => setScopeQuantity(current, item.id, quantityFromTakeoff(drift.row), by), "Quantity updated from the takeoff line.")}>Use the new figure</button></p>}
      {drift?.kind === "gone" && <p className="proc-quantity-note">The takeoff line it came from has been deleted. Keep the figure, change it, or remove it.</p>}
    </> : <p className="proc-quantity-empty">No quantity. Bidders see this line without one.</p>}
    <div className="proc-detail-actions">
      {q?.citation && <Button onClick={() => setViewing(true)}><FileText size={14}/>View on sheet</Button>}
      {q && !q.checked && <Button onClick={() => act(current => checkScopeQuantity(current, item.id, by), "Quantity checked.")}><Check size={14}/>Mark checked</Button>}
      <Button onClick={() => setEditing(true)}><Pencil size={14}/>{q ? "Edit quantity" : "Add quantity"}</Button>
      <Button disabled={!choices.length} onClick={() => setPicking(true)}><Ruler size={14}/>Use a takeoff line</Button>
      {q && <Button onClick={() => act(current => setScopeQuantity(current, item.id, null, by), "Quantity removed.")}><X size={14}/>Remove</Button>}
      {!choices.length && <small>No takeoff lines with a quantity in this trade yet.</small>}
    </div>
    {viewing && q?.citation && <ScopeSourceModal title={`${item.title} · ${quantityLabel(q)}`} evidence={citationEvidence([{ document: q.citation.document, page: q.citation.page, sheet: q.citation.sheet, quote: q.citation.quote, ...(q.citation.fromImage ? { verification: "image" as const } : {}) }], documents)} onClose={() => setViewing(false)}/>}
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

/**
 * Find quantities with AI, for the trade on screen: reads the sheets its lines without a quantity are on (at most
 * MAX_QUANTITY_SHEETS, the busiest), shows the estimated cost first, and puts what it finds on the lines Not checked.
 * Lines for every trade are left out: they rarely have a quantity, and each would be read once per trade.
 */
export function FindQuantitiesButton({ pkg, state, run, notify, by }: { pkg: TradePackage; state: Procurement; run: Run; notify: (message: string) => void; by: string }) {
  const { documents } = useProjectDocuments();
  const reader = useAiReader();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<(QuantityRun & { added: number; kept: number }) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const items = useMemo(() => bidForm(state, pkg.id).filter(s => !s.allTrades && !s.quantity).map(({ id, title, detail, source }) => ({ id, title, detail, source })), [state, pkg.id]);
  const plan = useMemo(() => quantityPlan(items, drawingRegister(documents), pkg), [items, documents, pkg]);
  const covered = new Set(plan.flatMap(p => p.items.map(i => i.id))).size;
  const estimate = reader?.reader === "claude" ? estimateCost(reader.model, { requests: plan.length, chars: plan.length * 6_000, images: plan.length }) : null;
  const running = !!progress && !result;
  async function start() {
    abort.current = new AbortController(); setResult(null); setProgress(`Reading 1 / ${plan.length}: ${plan[0].row.sheet}`);
    try {
      const { findQuantities } = await import("../../lib/quantity-ai-client");
      const found = await findQuantities({ pkg, plan, signal: abort.current.signal, onProgress: (done, total) => setProgress(done < total ? `${done} / ${total} sheets read · Reading ${plan[done].row.sheet}` : `${total} / ${total} sheets read`) });
      let applied = { added: 0, kept: 0 };
      if (found.proposals.length) {
        const message = run(current => { const next = applyAiQuantities(current, found.proposals, by); applied = { added: next.added, kept: next.kept }; return next.state; });
        if (message) throw new Error(message);
      }
      setResult({ ...found, ...applied });
      notify(applied.added ? `${applied.added} quantit${applied.added === 1 ? "y" : "ies"} proposed. Check each on its sheet before publishing.` : "No quantities found on these sheets.");
    } catch (error) {
      setProgress(error instanceof Error ? error.message : "Finding quantities failed. Try again.");
    }
  }
  const close = () => { if (running) return; setOpen(false); setProgress(""); setResult(null); };
  return <>
    <Button disabled={!items.length} onClick={() => setOpen(true)}><Sparkles size={15}/>Find quantities with AI</Button>
    {open && <Modal title="Find quantities with AI" subtitle={`${pkg.name}: the lines without a quantity, read from the drawings.`} onClose={close}>
      <div className="proc-ai-quantities">
        {!plan.length ? <p>No stored drawing sheets show these lines. Store the drawing set in Project files first.</p> : <>
          <p>Reads {plan.length} sheet{plan.length === 1 ? "" : "s"} for {covered} of the {items.length} line{items.length === 1 ? "" : "s"} without a quantity: {plan.map(p => p.row.sheet).join(", ")}.{estimate !== null ? ` About ${dollars(estimate)}.` : ""}</p>
          <p>The AI gives a quantity only where the sheet prints it: a schedule, printed dimensions, tags it can count, a note. It quotes the printed words and states its arithmetic, which Structor works out. Each quantity arrives Not checked and holds publishing until someone checks it on the sheet. Lines that already have a quantity keep it.</p>
        </>}
        {progress && <p className="proc-ai-progress" role="status">{progress}</p>}
        {result && <div className="proc-ai-result">
          <strong>{result.added} quantit{result.added === 1 ? "y" : "ies"} proposed{result.kept ? `; ${result.kept} line${result.kept === 1 ? "" : "s"} already had one and kept it` : ""}.</strong>
          <small>{result.sheets} of {plan.length} sheets read{result.cost !== null ? ` · ${dollars(result.cost)}` : ""}</small>
          {result.failures.length > 0 && <details open><summary>{result.failures.length} sheet{result.failures.length === 1 ? "" : "s"} couldn't be read</summary><ul>{result.failures.map(f => <li key={f.sheet}>{f.sheet}: {f.error}</li>)}</ul></details>}
          {result.dropped.length > 0 && <details><summary>{result.dropped.length} answer{result.dropped.length === 1 ? "" : "s"} set aside</summary><ul>{result.dropped.map((d, i) => <li key={i}>{d.what}: {d.reason}</li>)}</ul></details>}
        </div>}
        <div className="proc-form-actions">
          {running ? <Button onClick={() => abort.current?.abort()}>Stop</Button> : <Button onClick={close}>{result ? "Close" : "Cancel"}</Button>}
          {!result && plan.length > 0 && <Button variant="primary" disabled={running} onClick={() => void start()}><Sparkles size={15}/>{running ? "Reading…" : `Read ${plan.length} sheet${plan.length === 1 ? "" : "s"}`}</Button>}
        </div>
      </div>
    </Modal>}
  </>;
}
