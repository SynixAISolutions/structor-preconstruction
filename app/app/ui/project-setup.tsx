"use client";

import { useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, CircleHelp, Clock3, FileUp } from "lucide-react";
import type { Project } from "../../lib/projects";
import { clearDecision, decide, markReviewed, type SetupDecision, type SetupLevel, type SetupStatus } from "../../lib/project-setup";
import { screenLabel } from "../../lib/screens";
import { latestDocuments, type StoredDocument } from "../../lib/project-files";
import { uploadProjectPdf, useProjectDocuments, type UploadProgress } from "../../lib/project-files-client";
import type { useProjectSetup } from "../../lib/use-project-setup";
import { ProjectForm } from "./project-record";
import { RfpReview } from "./rfp-review";
import { SetupFileDrop } from "./setup-file-drop";
import { UploadCheck } from "./drawing-log";
import { Badge, Button, Modal, type Screen } from "./shared";
import "./project-setup.css";

const STATUS: Record<SetupStatus, { label: string; tone: string }> = { missing: { label: "Missing", tone: "red" }, "needs-review": { label: "Needs review", tone: "yellow" }, "in-progress": { label: "In progress", tone: "blue" }, ready: { label: "Ready", tone: "green" }, failed: { label: "Check file", tone: "yellow" }, waiting: { label: "Waiting", tone: "blue" }, "not-applicable": { label: "Not applicable", tone: "neutral" } };
export function SetupStatusBadge({ status, reconsider = false }: { status: SetupStatus; reconsider?: boolean }) {
  const value = reconsider ? { label: "Reconsider", tone: "yellow" } : STATUS[status];
  return <Badge tone={value.tone}>{value.label}</Badge>;
}

export function SetupCheckStatus({ checking, error, onRetry }: { checking: boolean; error: string | null; onRetry: () => void }) {
  if (error) return <div className="setup-check-error" role="alert"><p><strong>Some document checks did not finish.</strong> Completed results are kept. {error}</p><Button onClick={onRetry}>Retry checks</Button></div>;
  return checking ? <p role="status" className="setup-honesty-note">Checking documents… Reading the drawing index, manual contents and referenced reports.</p> : null;
}

function SetupUpload({ projectId, category, documents, notify, onDrawingsUploaded }: { projectId: string; category: string; documents: StoredDocument[]; notify: (text: string) => void; onDrawingsUploaded: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null), [error, setError] = useState("");
  async function upload(file: File) {
    setError("");
    if (documents.some(d => d.name.toLowerCase() === file.name.toLowerCase())) { setError("This filename is already stored. Open Project files to upload it as a revision."); return; }
    setProgress({ stage: "uploading", done: 0, total: 1 });
    try { const doc = await uploadProjectPdf({ projectId, file, category, onProgress: setProgress }); if (doc.kind === "drawings") onDrawingsUploaded(doc.id); notify(`${file.name} is stored in Project files.`); }
    catch (error) { setError(error instanceof Error ? error.message : "The file could not be stored. Try again."); }
    finally { setProgress(null); if (input.current) input.current.value = ""; }
  }
  return <div className="setup-upload"><input ref={input} aria-label={`Upload ${category} PDF`} type="file" accept="application/pdf,.pdf" hidden disabled={!!progress} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }}/><Button disabled={!!progress} onClick={() => input.current?.click()}><FileUp size={14}/>{progress ? "Processing…" : "Upload PDF"}</Button>{progress && <span role="status">{progress.stage === "uploading" ? "Uploading" : progress.stage === "title-blocks" ? "Reading title blocks" : progress.stage === "saving" ? "Saving" : "Reading pages"} · {progress.done} / {progress.total}</span>}{error && <p role="alert" className="setup-error">{error}</p>}</div>;
}

type SetupRow = {
  key: string; target: string; stepTitle: string; label: string; status: SetupStatus; level: SetupLevel; note: string; why: string;
  category: string; decision: SetupDecision | null; reconsider: boolean; screen: Screen;
};
const inPlace = (row: SetupRow) => (row.status === "ready" || row.status === "not-applicable") && !row.reconsider;
const rowTone = (row: SetupRow) => row.status === "waiting" ? "waiting" : row.reconsider || row.status === "needs-review" || row.status === "failed" ? "yellow" : "red";

/**
 * Project setup as step 1 of the Preconstruction to-do (Marcel, 24 Oct: setup and the to-do are one page). Each open
 * setup item is a to-do row with its upload, review and decision actions; what is already in place folds away.
 * `setup` is the to-do's own copy of the setup guide, so a decision made here shows in the steps straight away.
 * Scopes and the budget are their own to-do steps, so they are not repeated here.
 */
export function SetupChecklist({ project, setup, filter, onSave, navigate, notify }: { project: Project; setup: ReturnType<typeof useProjectSetup>; filter: string; onSave: (project: Project) => void; navigate: (screen: Screen) => void; notify: (text: string) => void }) {
  const [checkIds, setCheckIds] = useState<string[]>([]);
  const { documents } = useProjectDocuments();
  const [editing, setEditing] = useState(false), [formBusy, setFormBusy] = useState(false);
  const [decision, setDecision] = useState<{ target: string; title: string; kind: SetupDecision["kind"] } | null>(null), [error, setError] = useState("");
  const summary = setup.summary;
  if (!summary) return null;
  const reviewDocs = latestDocuments(documents).filter(d => d.category === "RFP" || d.category === "Addenda");
  const rows: SetupRow[] = summary.steps.filter(step => step.id !== "scopes" && step.id !== "budget").flatMap(step => step.items.length
    ? step.items.map(item => ({ key: `${step.id}:${item.id}`, target: `${step.id}:${item.id}`, stepTitle: step.title, label: item.label, status: item.status, level: item.level, note: item.note, why: item.why, category: item.category, decision: item.decision, reconsider: item.reconsider, screen: step.screen }))
    : [{ key: step.id, target: step.id, stepTitle: step.title, label: step.title, status: step.status, level: step.level, note: step.detail, why: "", category: "", decision: step.decision, reconsider: step.reconsider, screen: step.screen }]);
  const open = rows.filter(row => !inPlace(row)), done = rows.filter(inPlace);
  const shown = open.filter(row => filter === "All work" || (filter === "Waiting") === (row.status === "waiting"));
  function decisionActions(row: SetupRow) {
    if (row.decision) return <button className="setup-text-button" onClick={() => { const message = setup.run(s => clearDecision(s, row.target)); notify(message ?? "Decision cleared. The project state is checked again."); }}>Clear saved decision</button>;
    if (row.status === "ready") return null;
    return <div className="setup-decision-actions"><button onClick={() => { setError(""); setDecision({ target: row.target, title: row.label, kind: "waiting" }); }}>Waiting on someone</button>{row.level === "recommended" && <button onClick={() => { setError(""); setDecision({ target: row.target, title: row.label, kind: "not-applicable" }); }}>Not applicable</button>}</div>;
  }
  function rowView(row: SetupRow) {
    const Icon = row.status === "waiting" ? Clock3 : rowTone(row) === "yellow" ? CircleHelp : AlertCircle;
    const docs = row.target === "details:rfp" ? reviewDocs.filter(d => d.category === "RFP") : row.target === "details:addenda" ? reviewDocs.filter(d => d.category === "Addenda") : [];
    return <li className={`todo-task-card setup-task ${rowTone(row)}`} key={row.key}>
      <span className="todo-task-icon"><Icon size={18} aria-hidden="true"/></span>
      <div className="todo-task-copy">
        <div className="todo-task-labels"><span>{row.stepTitle}</span><SetupStatusBadge status={row.status} reconsider={row.reconsider}/>{row.level === "required" && <Badge tone="orange">Needed to start</Badge>}</div>
        <h3>{row.label}</h3>
        {row.note && <p>{row.note}</p>}
        {row.why && <p className="setup-why"><CircleHelp size={13}/>{row.why}</p>}
        {row.decision && <p className="setup-saved-decision">{row.decision.reason}{row.decision.responsible ? ` · Waiting on ${row.decision.responsible}` : ""}{row.decision.followUp ? ` · Follow up ${row.decision.followUp}` : ""} · {row.decision.by}{row.reconsider ? ". Work type or design stage changed; review this decision." : ""}</p>}
        {docs.map(doc => <div className="setup-rfp-file" key={doc.id}><strong>{doc.name}</strong><small>{doc.category === "Addenda" ? "Addendum" : "RFP"} · Version {doc.revision}{setup.state.reviews.some(r => r.docId === doc.id) ? " · Reviewed" : " · Awaiting review"}</small><RfpReview project={project} doc={doc} onSave={onSave} onReviewed={() => setup.run(s => markReviewed(s, doc.id, "Marcel Khoury"))}/></div>)}
        <div className="setup-item-actions">{row.category && <SetupUpload key={`${project.id}:${row.key}`} projectId={project.id} category={row.category} documents={documents} notify={notify} onDrawingsUploaded={id => setCheckIds([id])}/>}{row.target === "details:facts" && <Button onClick={() => setEditing(true)}>Edit project details</Button>}{decisionActions(row)}</div>
      </div>
      <button className="todo-task-action" onClick={() => navigate(row.screen)} aria-label={`Open ${screenLabel(row.screen)} for ${row.label}`}>Open {screenLabel(row.screen)}<ArrowUpRight size={15}/></button>
    </li>;
  }
  return <div className="setup-checklist" aria-busy={!setup.ready || setup.checking}>
    {!!checkIds.length && <Modal title="Upload check" subtitle="Your drawings are saved. Review the sheet numbers before continuing." wide onClose={() => setCheckIds([])}><UploadCheck documents={documents} ids={checkIds} onDone={() => setCheckIds([])}/></Modal>}
    <SetupFileDrop key={project.id} projectId={project.id} documents={documents} notify={notify}/>
    {!setup.ready && <p role="status" className="setup-honesty-note">Checking stored project documents…</p>}
    <SetupCheckStatus checking={setup.checking} error={setup.checkError} onRetry={setup.retryChecks}/>
    {shown.length ? <ul className="todo-work-list">{shown.map(rowView)}</ul> : <p className="setup-all-set">{open.length ? `No ${filter === "Waiting" ? "waiting items" : "setup actions"} here. Choose All work to see the rest.` : "Everything this project needs to start is in place."}</p>}
    {!!done.length && <details className="setup-in-place"><summary><Check size={14} aria-hidden="true"/>{done.length} in place</summary><ul>{done.map(row => <li key={row.key}><span><strong>{row.label}</strong><small>{row.stepTitle}{row.decision ? ` · Not applicable: ${row.decision.reason}` : row.note && row.note !== "Complete." ? ` · ${row.note}` : ""}</small></span>{row.target === "details:facts" ? <button className="setup-text-button" onClick={() => setEditing(true)}>Edit project details</button> : row.decision && decisionActions(row)}</li>)}</ul></details>}
    {editing && <Modal title="Review project information" wide onClose={() => { if (!formBusy) setEditing(false); }}><ProjectForm project={project} onBusyChange={setFormBusy} onCancel={() => setEditing(false)} onSave={updated => { onSave(updated); setEditing(false); }}/></Modal>}
    {decision && <Modal title={decision.kind === "waiting" ? "Waiting on someone" : "Mark not applicable"} subtitle={decision.title} onClose={() => setDecision(null)}><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const message = setup.run(s => decide(s, { target: decision.target, kind: decision.kind, reason: String(data.get("reason") ?? ""), responsible: String(data.get("responsible") ?? ""), followUp: String(data.get("followUp") ?? "") }, project, "Marcel Khoury")); setError(message ?? ""); if (!message) { setDecision(null); notify("Setup decision saved with its reason."); } }}><label className="ui-field">Reason<textarea name="reason" required rows={3}/></label>{decision.kind === "waiting" && <><label className="ui-field">Waiting on<input name="responsible" required placeholder="Owner, architect or team member"/></label><label className="ui-field">Follow-up date (optional)<input name="followUp" type="date"/></label></>}{error && <p className="setup-error" role="alert">{error}</p>}<div className="proc-form-actions"><Button onClick={() => setDecision(null)}>Cancel</Button><Button type="submit" variant="primary">Save decision</Button></div></form></Modal>}
  </div>;
}
