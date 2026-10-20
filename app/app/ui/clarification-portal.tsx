"use client";

import { useEffect, useRef, useState } from "react";
import type { AnswerInput, PortalClarification } from "../../lib/clarifications";
import { answerPortalClarification, ClarificationConflict, loadPortalClarification } from "../../lib/clarifications-client";
import "./clarifications.css";

type Choice = { kind: AnswerInput["kind"] | ""; amount: string; note: string };
export function PortalQuestion({ line, value, disabled, onChange }: { line: PortalClarification["lines"][number]; value: Choice; disabled: boolean; onChange: (value: Choice) => void }) {
  return <fieldset className="clarify-question" disabled={disabled || !!line.appliedAt}>
    <legend>{line.number} {line.item}</legend>
    <dl><dt>Your proposal said</dt><dd>{line.bid.status === "N" ? "Excluded" : line.bid.status === "P" ? "Partly included" : line.bid.status || "Not answered"}{line.bid.note && ` · ${line.bid.note}`}</dd><dt>The documents require</dt><dd>{line.requirement || "See the bid form"}{line.section && ` · ${line.section}`}</dd></dl>
    {line.appliedAt && <p className="clarify-status">Applied by the estimator. Contact them to change this answer.</p>}
    <div className="clarify-choices" role="group" aria-label="Your answer">{([ ["included", "Included"], ["add", "Add $"], ["excluded", "Excluded"] ] as const).map(([kind, label]) => <label key={kind}><input type="radio" name={`answer-${line.scopeItemId}`} checked={value.kind === kind} onChange={() => onChange({ ...value, kind })}/>{label}</label>)}</div>
    {value.kind === "add" && <label>Amount to add ($)<input required type="number" inputMode="decimal" min="0.01" max="999999999.99" step="0.01" value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })}/></label>}
    <label>Note (optional)<textarea maxLength={1000} rows={3} value={value.note} onChange={e => onChange({ ...value, note: e.target.value })}/></label>
  </fieldset>;
}

export function ClarificationPortal() {
  const [token, setToken] = useState(""), [request, setRequest] = useState<PortalClarification | null>(null);
  const [answers, setAnswers] = useState<Record<string, Choice>>({}), [name, setName] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false), lock = useRef(false);
  function populate(next: PortalClarification) {
    setRequest(next);
    setAnswers(Object.fromEntries(next.lines.map(line => [line.scopeItemId, { kind: line.answer?.kind ?? "", amount: line.answer?.amount?.toString() ?? "", note: line.answer?.note ?? "" }])));
    setName(next.lines.find(l => l.answer)?.answer?.by ?? next.recipient?.name ?? "");
  }
  async function load(t: string) {
    setLoading(true); setError("");
    try { populate(await loadPortalClarification(t)); setConflict(false); }
    catch (e) { setRequest(null); setError(e instanceof Error ? e.message : "The request could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("t") ?? ""; setToken(t); if (t) void load(t); else { setLoading(false); setError("This link is not valid or has expired. Ask the estimator for a new one."); } }, []);
  async function save() {
    if (!request || lock.current || conflict) return;
    const changed: AnswerInput[] = request.lines.filter(l => !l.appliedAt && answers[l.scopeItemId].kind).filter(l => {
      const a = answers[l.scopeItemId]; return !l.answer || a.kind !== l.answer.kind || (a.kind === "add" ? Number(a.amount) : null) !== l.answer.amount || a.note !== l.answer.note;
    }).map(l => { const a = answers[l.scopeItemId]; return { scopeItemId: l.scopeItemId, kind: a.kind as AnswerInput["kind"], amount: a.kind === "add" ? Number(a.amount) : null, note: a.note }; });
    if (!changed.length) { setNotice("No changed answers to save. You can answer another item later."); return; }
    lock.current = true; setSaving(true); setError(""); setNotice("");
    try { populate(await answerPortalClarification(token, request.version, changed, name)); setNotice("Answers saved. The estimator can now review them. You can return to answer the remaining items."); }
    catch (e) { const message = e instanceof Error ? e.message : "Your answers could not be saved. Please try again."; setError(message); if (e instanceof ClarificationConflict) setConflict(true); else if (/link is not valid|request is not available|withdrew this request/.test(message)) setRequest(null); }
    finally { lock.current = false; setSaving(false); }
  }
  return <main className="clarify-portal"><header className="clarify-portal-brand">Structor <span>Proposal clarification</span></header>
    {loading && <p role="status">Loading your request…</p>}
    {error && <div role="alert" className="clarify-warning"><h1>{conflict ? "Reload and recheck your answers" : request ? "Answers were not saved" : "Request unavailable"}</h1><p>{error}</p>{conflict && <p>Your entries are still shown below. Reload replaces them with the saved answers. Recheck each item before saving again.</p>}{token && <button className="ui-btn" disabled={saving || loading} onClick={() => { setNotice(""); void load(token); }}>Reload request</button>}</div>}
    {request && !loading && <><h1>{request.projectName}</h1><p>{request.trade} · {request.bidder}</p><p>Reply by {request.dueAt}. Confirm each item below. Add is an addition to your proposal price; Included has no added cost. Your answers become part of your proposal.</p>
      <p role="status" aria-live="polite">{saving ? "Saving answers…" : notice}</p>
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        {request.lines.map(line => <PortalQuestion key={line.scopeItemId} line={line} value={answers[line.scopeItemId]} disabled={saving || conflict} onChange={value => { setAnswers(current => ({ ...current, [line.scopeItemId]: value })); setNotice(""); }}/>) }
        {request.lines.some(l => !l.appliedAt) ? <div className="clarify-submit"><label>Your name<input required maxLength={120} autoComplete="name" value={name} disabled={saving || conflict} onChange={e => setName(e.target.value)}/></label><p>You may save some answers now and return for the rest. Review your answers before saving.</p><button className="ui-btn primary" type="submit" disabled={saving || conflict}>{saving ? "Saving…" : "Save answers"}</button></div> : <p className="clarify-card">All answers have been applied. Contact the estimator for changes.</p>}
      </form>
    </>}
  </main>;
}
