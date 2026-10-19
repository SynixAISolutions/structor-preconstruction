"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { addAiEstimateLines, lineAmount, varianceReport, type VarianceRow } from "../../lib/estimate";
import { conceptReference, draftTradeEstimate } from "../../lib/estimate-ai-client";
import { ESTIMATE_UNITS, type EstimateDraftLine } from "../../lib/estimate-ai";
import type { ExtractionState } from "../../lib/extraction";
import type { BudgetHistory } from "../../lib/historical-budget";
import type { Project } from "../../lib/projects";
import type { useEstimate } from "../../lib/use-estimate";
import { useBudget } from "../../lib/use-budget";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useProjectDocuments } from "../../lib/project-files-client";
import { useLevelingComparison } from "./use-leveling-comparison";
import { Badge, Button, Empty, Modal, Panel, PreviewNote } from "./shared";
import { estimateMoney, unitRate } from "./estimate-format";
import "./estimate-ai-review.css";

type ReviewLine = { line: EstimateDraftLine; selected: boolean; decision?: "accepted" | "rejected" };
type Draft = { status: "Queued" | "Drafting" | "Done" | "Failed" | "Stopped"; lines: ReviewLine[]; error?: string };

// Keep completed trades on stop, and never start a queued trade after cancellation.
export async function draftEstimateQueue<T>(items: T[], signal: AbortSignal, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (!signal.aborted && next < items.length) await work(items[next++]);
  }));
}

export function EstimateComparison({ row, ai }: { row: VarianceRow; ai: number | null }) {
  const values = [{ label: "AI estimate", value: ai, color: "#8464ad" }, { label: "Budget", value: row.budget, color: "#568b88" }, { label: "Lowest reviewed bid", value: row.bid?.value ?? null, color: "#d28b50" }];
  const max = Math.max(1, ...values.map(v => v.value ?? 0));
  return <div className="eai-chart"><strong>{row.name}</strong>{values.map(v => <div key={v.label}><span>{v.label}</span><i aria-hidden="true" style={{ width: `${(v.value ?? 0) / max * 100}%`, background: v.color }}/><b>{v.value === null ? "Unavailable" : estimateMoney(v.value)}</b></div>)}{row.bid && <small>{row.bid.bidderName} · {row.bid.from === "leveling" ? "Saved leveling comparison" : "Applied budget forecast snapshot"}</small>}</div>;
}

export function EstimateDraftCard({ line }: { line: EstimateDraftLine }) {
  return <div className="eai-basis"><p><b>Quantity basis:</b> {line.quantityBasis || "No quantity basis"}</p><p><b>Rate source:</b> {line.rateNote || "Assumed rate"}</p>{line.flags.map(flag => <Badge key={flag} tone="amber">{flag}</Badge>)}</div>;
}

export function EstimateAiReview({ estimate, project, extraction, packageId, notify }: { estimate: ReturnType<typeof useEstimate>; project: Project; extraction: ExtractionState; packageId: string | null; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false), [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; index: number; line: EstimateDraftLine } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const editor = useRef<HTMLFormElement>(null);
  const { documents, ready } = useProjectDocuments();
  const [history] = useLocalDraft<BudgetHistory[]>("budget-history", []);
  const budget = useBudget(), comparison = useLevelingComparison();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (editing) { editor.current?.scrollIntoView({ block: "center", behavior: "instant" }); editor.current?.querySelector("input")?.focus(); } }, [editing?.id, editing?.index]);
  const trades = estimate.procurement.packages.filter(p => !packageId || p.id === packageId);
  const report = varianceReport({ rows: estimate.rows, procurement: estimate.procurement, budget: budget.state, candidates: comparison.candidates });
  function update(id: string, action: (draft: Draft) => Draft) { setDrafts(current => ({ ...current, [id]: action(current[id]) })); }
  async function start() {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setEditing(null);
    setDrafts(Object.fromEntries(trades.map(t => [t.id, { status: "Queued", lines: [] }])));
    const concept = conceptReference(project, history);
    try {
      await draftEstimateQueue(trades, abort.signal, async trade => {
        update(trade.id, d => ({ ...d, status: "Drafting" }));
        try {
          const lines = await draftTradeEstimate({ trade, project, procurement: estimate.procurement, rows: estimate.rows, extraction, documents, concept, signal: abort.signal });
          if (!abort.signal.aborted) update(trade.id, () => ({ status: "Done", lines: lines.map(line => ({ line, selected: true })) }));
        } catch (failure) {
          if (!abort.signal.aborted) update(trade.id, () => ({ status: "Failed", lines: [], error: failure instanceof Error ? failure.message : "The estimate could not be drafted." }));
        }
      });
    } finally {
      setDrafts(current => Object.fromEntries(Object.entries(current).map(([id, d]) => [id, d.status === "Drafting" || d.status === "Queued" ? { ...d, status: "Stopped" } : d])));
      setBusy(false); controller.current = null;
    }
  }
  function accept(id: string, all: boolean) {
    const chosen = drafts[id].lines.filter(r => !r.decision && (all || r.selected));
    if (!chosen.length) return;
    let added = 0;
    const message = estimate.run(rows => { const next = addAiEstimateLines(rows, estimate.procurement, id, chosen.map(r => r.line)); added = next.length - rows.length; return next; });
    if (message) { setError(message); return; }
    update(id, d => ({ ...d, lines: d.lines.map(r => chosen.includes(r) ? { ...r, decision: "accepted" } : r) }));
    notify(`${added} AI estimate item${added === 1 ? "" : "s"} added for review.${added < chosen.length ? " Duplicate item names were kept only once." : ""}`);
  }
  function saveEdit(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return;
    const line = editing.line, amount = lineAmount(line);
    if (!line.item.trim() || !(line.quantity > 0 && line.quantity <= 1e7) || !(line.rate >= 0 && line.rate <= 1e6) || !Number.isFinite(amount) || amount > 1e9 || !line.quantityBasis.trim() || !line.rateNote.trim()) { setError("Enter an item, a quantity above zero, a valid rate, quantity basis and rate source."); return; }
    update(editing.id, d => ({ ...d, lines: d.lines.map((r, i) => i === editing.index ? { ...r, line: { ...line, item: line.item.trim(), amount } } : r) }));
    setEditing(null); setError("");
  }
  const hasDrafts = Object.keys(drafts).length > 0;
  return <><Button disabled={!ready || !trades.length} variant="primary" onClick={() => setOpen(true)}><Sparkles size={14}/>Estimate with AI</Button>{open && <Modal wide title="Estimate with AI" subtitle={packageId ? trades[0]?.name : `${trades.length} trades · Up to 3 at once`} onClose={() => { controller.current?.abort(); setOpen(false); setEditing(null); }}>
    <PreviewNote>Draft quantities and rates need review. Accepting adds estimate items; your approved budget and bids keep their values.</PreviewNote>
    <div className="eai-actions">{busy ? <Button onClick={() => controller.current?.abort()}>Stop drafting</Button> : <Button variant="primary" onClick={start}>{hasDrafts ? "Draft again" : "Draft estimate"}</Button>}<span role="status">{busy ? "Drafting trade estimates… Completed trades remain available if you stop." : hasDrafts ? "Review each trade below." : "Uses this project's scopes, drawing text, accepted quantities and available rate references."}</span></div>
    {error && <p role="alert">{error}</p>}
    {trades.filter(t => drafts[t.id] || estimate.rows.some(r => r.packageId === t.id && r.origin?.kind === "ai-estimate")).map(trade => {
      const draft: Draft = drafts[trade.id] ?? { status: "Done", lines: [] }, pending = draft.lines.filter(r => !r.decision), row = report.find(r => r.packageId === trade.id)!;
      const aiRows = estimate.rows.filter(r => r.packageId === trade.id && r.origin?.kind === "ai-estimate");
      const ai = draft.lines.length ? Math.round(draft.lines.filter(r => r.decision !== "rejected").reduce((s, r) => s + Math.round(lineAmount(r.line) * 100), 0)) / 100 : aiRows.length ? aiRows.reduce((s, r) => s + Math.round(lineAmount(r) * 100), 0) / 100 : null;
      return <Panel key={trade.id} title={trade.name} action={<Badge tone={draft.status === "Failed" ? "red" : draft.status === "Done" ? "green" : "amber"}>{draft.status}</Badge>}>
        {draft.error && <p role="alert">{draft.error}</p>}{draft.status === "Done" && !draft.lines.length && drafts[trade.id] && <Empty title="No usable estimate lines returned" description="Add scope items or source quantities, then draft again."/>}
        {draft.lines.map((r, index) => <article className="eai-line" key={index}><div className="eai-line-heading"><label><input type="checkbox" aria-label={`Select ${r.line.item}`} checked={r.selected} disabled={!!r.decision} onChange={e => update(trade.id, d => ({ ...d, lines: d.lines.map((v, i) => i === index ? { ...v, selected: e.target.checked } : v) }))}/><strong>{r.line.item}</strong></label><b>{estimateMoney(lineAmount(r.line))}</b></div><p>{r.line.quantity.toLocaleString()} {r.line.unit} × {unitRate(r.line.rate)}</p><EstimateDraftCard line={r.line}/>{r.decision ? <Badge tone={r.decision === "accepted" ? "green" : "neutral"}>{r.decision === "accepted" ? "Accepted · AI draft until reviewed" : "Rejected"}</Badge> : <div className="eai-actions"><Button onClick={() => { setError(""); setEditing({ id: trade.id, index, line: { ...r.line } }); }}>Edit draft</Button><Button onClick={() => update(trade.id, d => ({ ...d, lines: d.lines.map((v, i) => i === index ? { ...v, decision: "rejected" } : v) }))}>Reject</Button></div>}</article>)}
        {!!pending.length && <div className="eai-actions"><Button disabled={!pending.some(r => r.selected)} variant="primary" onClick={() => accept(trade.id, false)}>Accept selected</Button><Button onClick={() => accept(trade.id, true)}>Accept all</Button></div>}
        <EstimateComparison row={row} ai={ai}/>
      </Panel>;
    })}
    {!hasDrafts && <p>No estimate changes until you accept. Rates without references are labelled Assumed rate.</p>}
    {editing && <form ref={editor} className="eai-editor" onSubmit={saveEdit}><h3>Edit draft · {editing.line.item}</h3><div className="ui-form-grid"><label className="ui-field full">Item<input required value={editing.line.item} onChange={e => setEditing({ ...editing, line: { ...editing.line, item: e.target.value } })}/></label>{(["quantity", "rate"] as const).map(field => <label key={field} className="ui-field">{field === "rate" ? "Unit rate · USD" : "Quantity"}<input required type="number" min={field === "quantity" ? ".000001" : "0"} step="any" value={editing.line[field]} onChange={e => setEditing({ ...editing, line: { ...editing.line, [field]: Number(e.target.value), ...(field === "rate" ? { rateSource: "assumption", rateNote: "Estimator edited rate; verify before review", flags: [...new Set([...editing.line.flags, "Assumed rate", "Edited by estimator"])] } : { quantityBasis: editing.line.quantityBasis.startsWith("Estimator edited quantity;") ? editing.line.quantityBasis : `Estimator edited quantity; verify. Original basis: ${editing.line.quantityBasis}`, flags: [...new Set([...editing.line.flags, "Edited by estimator"])] }) } })}/></label>)}<label className="ui-field">Unit<select value={editing.line.unit} onChange={e => setEditing({ ...editing, line: { ...editing.line, unit: e.target.value, rateSource: "assumption", rateNote: "Estimator changed unit; verify rate", flags: [...new Set([...editing.line.flags, "Assumed rate", "Edited by estimator"])] } })}>{ESTIMATE_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></label><label className="ui-field full">Quantity basis<textarea required value={editing.line.quantityBasis} onChange={e => setEditing({ ...editing, line: { ...editing.line, quantityBasis: e.target.value } })}/></label><label className="ui-field full">Rate source<textarea required value={editing.line.rateNote} onChange={e => setEditing({ ...editing, line: { ...editing.line, rateNote: e.target.value } })}/></label></div><p>Amount: {Number.isFinite(lineAmount(editing.line)) ? estimateMoney(lineAmount(editing.line)) : "Unavailable"}</p><div className="eai-actions"><Button onClick={() => setEditing(null)}>Cancel edit</Button><Button type="submit" variant="primary">Save draft</Button></div></form>}
  </Modal>}</>;
}
