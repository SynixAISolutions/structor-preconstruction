"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, FileText, Pencil, RotateCcw, X } from "lucide-react";
import { editDraft, filterDrafts, isEdited, notOnSheet, recordRun, REJECT_REASONS, rejectDraft, reopenDraft, runSummary, type Citation, type Draft, type DraftKind, type DraftStatus, type RejectReason } from "../../lib/extraction";
import type { useExtraction } from "../../lib/use-extraction";
import type { SpecSection } from "../../lib/data/preconstruction";
import { Badge, Button, Empty, Modal, Panel, PreviewNote, type ViewProps } from "./shared";
import { ScopeSourceDialog } from "./scope-source-dialog";
import { findingCitationSources, findingTitle, IMAGE_CHECK_NOTES } from "./extraction-citations";
import { SpecificationReader } from "./specification-reader";
import { DrawingReader } from "./drawing-reader";
import { addPage } from "../../lib/drawing-flip";
import { rememberPdf } from "../../lib/pdf-session";
import { downloadText } from "../../lib/format";
import type { ScopeRunResult } from "../../lib/ai-client";
import { useActiveProject } from "../../lib/project-scope";
import "./extraction-review.css";

type Review = ReturnType<typeof useExtraction>;
const kinds: Record<DraftKind, string> = { scope: "Scope item", region: "Drawing region", quantity: "Quantity" };
const statuses: Record<DraftStatus, string> = { "pending-review": "Needs review", accepted: "Accepted", rejected: "Rejected" };
type Dialog = { kind: "edit" | "reject"; draft: Draft } | { kind: "citation"; draft: Draft; citation: Citation };

function DraftEditor({ draft, review, by, onClose, notify }: { draft: Draft; review: Review; by: string; onClose: () => void; notify: ViewProps["notify"] }) {
  const [value, setValue] = useState(draft);
  const [error, setError] = useState("");
  function save(event: FormEvent) {
    event.preventDefault();
    const changes = value.kind === "scope" ? { packageId: value.packageId, title: value.title, detail: value.detail, source: value.source } : value.kind === "region" ? { packageId: value.packageId, label: value.label, sheet: value.sheet } : { packageId: value.packageId, item: value.item, quantity: value.quantity, unit: value.unit };
    const message = review.run(current => editDraft(current, review.procurement, draft.id, changes, by));
    if (message) setError(message); else { notify("Finding saved for review. Its original version is retained."); onClose(); }
  }
  return <Modal title="Edit finding" subtitle="Save your corrections, then accept when ready." onClose={onClose}><form onSubmit={save}>
    <label className="ui-field">Trade package<select value={value.packageId} onChange={e => setValue({ ...value, packageId: e.target.value })}>{review.procurement.packages.map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
    {value.kind === "scope" ? <>
      <label className="ui-field">Scope description<textarea required maxLength={300} rows={3} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })}/></label>
      <label className="ui-field">Source reference<input maxLength={120} value={value.source} onChange={e => setValue({ ...value, source: e.target.value })}/></label>
      <label className="ui-field">Coordination notes<textarea maxLength={2000} rows={4} value={value.detail} onChange={e => setValue({ ...value, detail: e.target.value })}/></label>
    </> : value.kind === "region" ? <>
      <label className="ui-field">Region description<input required maxLength={200} value={value.label} onChange={e => setValue({ ...value, label: e.target.value })}/></label>
      <label className="ui-field">Drawing sheet<input required maxLength={40} value={value.sheet} onChange={e => setValue({ ...value, sheet: e.target.value })}/></label>
    </> : <>
      <label className="ui-field">Quantity item<input required maxLength={300} value={value.item} onChange={e => setValue({ ...value, item: e.target.value })}/></label>
      <div className="ext-form-pair"><label className="ui-field">Quantity<input required type="number" min="0.000001" step="any" value={value.quantity} onChange={e => setValue({ ...value, quantity: Number(e.target.value) })}/></label><label className="ui-field">Unit<select value={value.unit} onChange={e => setValue({ ...value, unit: e.target.value as typeof value.unit })}>{["SF", "LF", "EA", "CY"].map(unit => <option key={unit}>{unit}</option>)}</select></label></div>
      <p className="proc-modal-note">Measurement basis: {value.basis}</p>
    </>}
    {value.packageId !== draft.packageId && <p className="proc-modal-note">Moving trade clears links to findings in the previous trade.</p>}
    {error && <p role="alert" className="proc-source-error">{error}</p>}
    <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save finding</Button></div>
  </form></Modal>;
}

function RejectDialog({ draft, review, by, onClose, notify }: { draft: Draft; review: Review; by: string; onClose: () => void; notify: ViewProps["notify"] }) {
  const [reason, setReason] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return <Modal title="Reject finding" subtitle={findingTitle(draft)} onClose={onClose}><form onSubmit={e => {
    e.preventDefault();
    if (!reason) { setError("Choose a reason."); return; }
    const message = review.run(current => rejectDraft(current, draft.id, reason, note, by));
    if (message) setError(message); else { notify("Finding rejected with its reason recorded."); onClose(); }
  }}><label className="ui-field">Reason<select required value={reason} onChange={e => setReason(e.target.value as RejectReason)}><option value="">Choose a reason</option>{Object.entries(REJECT_REASONS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="ui-field">Review note{reason === "other" ? " (required)" : " (optional)"}<textarea required={reason === "other"} maxLength={600} rows={3} value={note} onChange={e => setNote(e.target.value)}/></label>{error && <p role="alert" className="proc-source-error">{error}</p>}<div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">Reject finding</Button></div></form></Modal>;
}

export function ExtractionReview({ review, packageId, sections, colors, by, notify, onOpenScope }: {
  review: Review; packageId: string; sections: SpecSection[]; colors: Map<string, string>; by: string; notify: ViewProps["notify"]; onOpenScope: (id: string) => void;
}) {
  const { extraction } = review;
  const projectId = useActiveProject();
  const latest = useRef(review);
  latest.current = review;
  const pkg = review.procurement.packages.find(p => p.id === packageId);
  const [source, setSource] = useState<{ runId: string; file: File } | null>(null);
  const runs = extraction.runs.filter(run => run.packageIds.includes(packageId) || extraction.drafts.some(d => d.runId === run.id && d.packageId === packageId));
  const [runId, setRunId] = useState("");
  const [kind, setKind] = useState<DraftKind | "">("");
  const [status, setStatus] = useState<DraftStatus | "">("pending-review");
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [result, setResult] = useState("");
  const activeRun = runs.find(run => run.id === runId) ?? runs.at(-1);
  const drafts = filterDrafts(extraction, { packageId, runId: activeRun?.id, kind: kind || undefined, status: status || undefined });
  const pending = drafts.filter(d => d.status === "pending-review");
  const selection = pending.filter(d => selected.includes(d.id)).map(d => d.id);
  const summary = activeRun ? runSummary(extraction, activeRun.id) : null;
  function accept(ids: string[]) {
    let accepted = 0;
    const failed: string[] = [], messages: string[] = [];
    for (const id of ids) {
      const message = review.accept(id, by);
      if (message) { failed.push(id); messages.push(`${findingTitle(extraction.drafts.find(d => d.id === id)!)}: ${message}`); } else accepted++;
    }
    setSelected(failed);
    const outcome = `${accepted} finding${accepted === 1 ? "" : "s"} accepted.${messages.length ? ` ${messages.length} still ${messages.length === 1 ? "needs" : "need"} review. ${messages.join(" ")}` : ""}`;
    setResult(outcome); notify(outcome);
  }
  function recordReading(outcome: ScopeRunResult, file: File) {
    let id = "";
    const input = { ...outcome.input, notes: { failures: outcome.failures.map(f => `${f.section} · pages ${f.pages}: ${f.error}`), screening: outcome.dropped.map(d => `${d.what}: ${d.reason}`) } };
    const message = latest.current.run(current => { const next = recordRun(current, latest.current.procurement, input); id = next.runs.at(-1)!.id; return next; });
    if (message) return message;
    rememberPdf(file); setRunId(id); setSource({ runId: id, file }); setKind(""); setStatus("pending-review"); setSelected([]); setResult("");
    notify(input.error ? "The run failed. Check the reported pages and try again." : `${input.drafts.length} findings are ready for review${outcome.failures.length ? "; some pages could not be read" : ""}.`);
    return null;
  }
  return <Panel className="ext-review" title="AI findings" subtitle="Check the cited source before accepting a finding.">
    {pkg && <SpecificationReader key={`${projectId}:${pkg.id}`} pkg={pkg} onRun={recordReading}/>}
    {pkg && <DrawingReader key={`drawing:${projectId}:${pkg.id}`} pkg={pkg} onRun={recordReading} onPages={(pages, document) => {
      const errors = latest.current.runFlip(current => pages.reduce((state, page) => state.pages.some(p => p.documentName === document && p.pageNumber === page.page && p.sheet === page.sheet) ? state : addPage(state, { sheet: page.sheet, title: page.sheet, discipline: "Uploaded drawing", revision: "", documentId: `pdf:${document}`, documentName: document, pageNumber: page.page, aspect: page.aspect, source: "uploaded" }), current));
      return errors ? Object.values(errors)[0] ?? "Check the selected sheets." : null;
    }}/>}
    {!activeRun ? <Empty title="No AI findings for this trade" description="Choose a project manual and read the relevant sections to start a review."/> : <>
    {activeRun.engine.mode === "sample" && <PreviewNote>Illustrative sample — no documents were read. These findings demonstrate the review workflow.</PreviewNote>}
    <Button onClick={() => downloadText(`ai-review-${activeRun.id}.json`, JSON.stringify({ run: activeRun, findings: extraction.drafts.filter(d => d.runId === activeRun.id) }, null, 2), "application/json")}>Export this run for accuracy check</Button>
    {activeRun.notes && (activeRun.notes.failures.length > 0 || activeRun.notes.screening.length > 0) && <details className="ai-run-result" open={activeRun.notes.failures.length > 0}><summary>{activeRun.notes.failures.length ? "Incomplete run" : "Screening notes"} · check coverage before publishing</summary><ul>{[...activeRun.notes.failures, ...activeRun.notes.screening].map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
    <div className="ext-filters">
      <label className="ui-field">Extraction run<select value={activeRun.id} onChange={e => { setRunId(e.target.value); setSelected([]); setResult(""); }}>{runs.map(run => <option key={run.id} value={run.id}>{new Date(run.finishedAt).toLocaleDateString("en-US")} · {run.engine.mode} · {run.engine.model}</option>)}</select></label>
      <label className="ui-field">Finding type<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setSelected([]); }}><option value="">All types</option>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="ui-field">Review status<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setSelected([]); }}><option value="">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {activeRun.status === "failed" ? <p role="alert" className="ext-result error">Extraction failed: {activeRun.error}</p> : <>
      <div className="ext-summary" aria-label="Outcomes across this entire run"><span>{summary!.pending} pending</span><span>{summary!.acceptedAsProposed} accepted as proposed</span><span>{summary!.acceptedEdited} accepted with edits</span><span>{summary!.rejected} rejected</span><small>Entire run, across trades</small></div>
      <details className="ext-run-details"><summary>Run sources and review outcomes</summary><p>{activeRun.engine.model} · Finished {new Date(activeRun.finishedAt).toLocaleString("en-US")}</p><ul>{activeRun.documents.map(doc => <li key={doc.name}>{doc.name} · {doc.pages} pages</li>)}</ul>{Object.entries(summary!.rejectedBy).filter(([, count]) => count > 0).map(([reason, count]) => <p key={reason}>{REJECT_REASONS[reason as RejectReason]}: {count}</p>)}</details>
      {pending.length > 0 && <div className="ext-bulk"><label><input type="checkbox" aria-label="Select all visible pending findings" checked={pending.every(d => selected.includes(d.id))} onChange={e => setSelected(e.target.checked ? pending.map(d => d.id) : [])}/>Select visible pending findings</label><Button variant="primary" disabled={!selection.length} onClick={() => accept(selection)}><Check size={14}/>Accept selected ({selection.length})</Button></div>}
      {result && <p className="ext-result" role="status">{result}</p>}
      <div className="ext-list">{drafts.map(draft => <article className={`ext-card ${draft.status}`} key={draft.id}>
        <header><div>{draft.status === "pending-review" && <input type="checkbox" aria-label={`Select ${findingTitle(draft)}`} checked={selected.includes(draft.id)} onChange={e => setSelected(e.target.checked ? [...selected, draft.id] : selected.filter(id => id !== draft.id))}/>}<Badge>{kinds[draft.kind]}</Badge><Badge tone={draft.status === "accepted" ? "green" : draft.status === "rejected" ? "neutral" : "amber"}>{statuses[draft.status]}</Badge>{isEdited(draft) && <Badge tone="blue">Edited</Badge>}</div></header>
        <h3>{findingTitle(draft)}</h3>
        {notOnSheet(draft) ? <p className="proc-modal-note warning">{IMAGE_CHECK_NOTES["not-printed"]}</p> : draft.citations.some(c => c.verification === "image") && <p className="proc-modal-note">Image citation · check the sheet before accepting</p>}
        {draft.kind === "scope" ? <><p>{draft.detail}</p><small>{draft.source}</small></> : draft.kind === "region" ? <p>{draft.sheet} · {draft.status === "accepted" ? "Highlight saved in Drawing Flip." : "Highlight stays out of Drawing Flip until accepted."}</p> : <><strong className="ext-quantity">{draft.quantity.toLocaleString()} {draft.unit}</strong><p>{draft.basis}</p></>}
        <div className="ext-citations">{draft.citations.map((citation, index) => <button key={index} onClick={() => setDialog({ kind: "citation", draft, citation })}><FileText size={13}/>{citation.sheet ?? citation.document} · p. {citation.page}</button>)}</div>
        {draft.rejection && <p className="ext-rejection">{REJECT_REASONS[draft.rejection.reason]}{draft.rejection.note && ` · ${draft.rejection.note}`}</p>}
        {draft.original && <details className="ext-original"><summary>Original proposal</summary>{"title" in draft.original ? <><strong>{draft.original.title}</strong><p>{draft.original.detail}</p><small>{draft.original.source}</small></> : "label" in draft.original ? <p>{draft.original.label} · {draft.original.sheet}</p> : <p>{draft.original.item} · {draft.original.quantity} {draft.original.unit}<br/>{draft.original.basis}</p>}</details>}
        <details className="ext-history"><summary>Review history ({draft.history.length})</summary><ul>{draft.history.map((event, index) => <li key={index}>{event.kind === "edited" ? `Edited ${event.fields.join(", ")}` : event.kind === "rejected" ? `Rejected: ${REJECT_REASONS[event.reason]}${event.note ? ` — ${event.note}` : ""}` : event.kind[0].toUpperCase() + event.kind.slice(1)}<small>{event.by} · {new Date(event.at).toLocaleString("en-US")}</small></li>)}</ul></details>
        <footer>{draft.status === "pending-review" ? <><Button variant="primary" onClick={() => accept([draft.id])}><Check size={14}/>Accept</Button><Button onClick={() => setDialog({ kind: "edit", draft })}><Pencil size={14}/>Edit</Button><Button onClick={() => setDialog({ kind: "reject", draft })}><X size={14}/>Reject</Button></> : draft.status === "rejected" ? <Button onClick={() => { const message = review.run(current => reopenDraft(current, draft.id, by)); notify(message ?? "Finding reopened for review."); }}><RotateCcw size={14}/>Reopen for review</Button> : draft.kind === "scope" && draft.acceptedId ? <Button onClick={() => onOpenScope(draft.acceptedId!)}>View in bid form</Button> : <p className="proc-modal-note">{draft.kind === "region" ? "Accepted highlight is available in Drawing Flip." : "Accepted quantity is ready for the estimate."}</p>}</footer>
      </article>)}</div>
      {!drafts.length && <Empty title="No findings match" description="Change the type or review status to see other findings from this run."/>}
    </>}
    </>}
    {dialog?.kind === "edit" && <DraftEditor draft={dialog.draft} review={review} by={by} onClose={() => setDialog(null)} notify={notify}/>}
    {dialog?.kind === "reject" && <RejectDialog draft={dialog.draft} review={review} by={by} onClose={() => setDialog(null)} notify={notify}/>}
    {dialog?.kind === "citation" && <ScopeSourceDialog title={findingTitle(dialog.draft)} sources={findingCitationSources(dialog.draft, dialog.citation, review.flip, sections)} kind={dialog.citation.sheet ? "drawings" : "spec"} colors={colors} citation={dialog.citation} sourceFile={source?.runId === dialog.draft.runId ? source.file : undefined} proposedRegion={dialog.draft.kind === "region" && dialog.draft.status !== "accepted" ? dialog.draft : undefined} sample={extraction.runs.find(run => run.id === dialog.draft.runId)?.engine.mode === "sample"} onClose={() => setDialog(null)}/>}
  </Panel>;
}
