"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, CircleHelp, FileUp, FolderOpen, ListChecks } from "lucide-react";
import type { Project } from "../../lib/projects";
import { clearDecision, decide, markReviewed, type SetupDecision, type SetupItem, type SetupStepId, type SetupStatus } from "../../lib/project-setup";
import { latestDocuments, type StoredDocument } from "../../lib/project-files";
import { uploadProjectPdf, useProjectDocuments, type UploadProgress } from "../../lib/project-files-client";
import { useProjectSetup } from "../../lib/use-project-setup";
import { ProjectForm } from "./project-record";
import { RfpReview } from "./rfp-review";
import { SetupFileDrop } from "./setup-file-drop";
import { Badge, Button, Modal, PageHeader, type Screen } from "./shared";
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

function SetupUpload({ projectId, category, documents, notify }: { projectId: string; category: string; documents: StoredDocument[]; notify: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null), [error, setError] = useState("");
  async function upload(file: File) {
    setError("");
    if (documents.some(d => d.name.toLowerCase() === file.name.toLowerCase())) { setError("This filename is already stored. Open Project files to upload it as a revision."); return; }
    setProgress({ stage: "uploading", done: 0, total: 1 });
    try { await uploadProjectPdf({ projectId, file, category, onProgress: setProgress }); notify(`${file.name} is stored in Project files.`); }
    catch (error) { setError(error instanceof Error ? error.message : "The file could not be stored. Try again."); }
    finally { setProgress(null); if (input.current) input.current.value = ""; }
  }
  return <div className="setup-upload"><input ref={input} aria-label={`Upload ${category} PDF`} type="file" accept="application/pdf,.pdf" hidden disabled={!!progress} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }}/><Button disabled={!!progress} onClick={() => input.current?.click()}><FileUp size={14}/>{progress ? "Processing…" : "Upload PDF"}</Button>{progress && <span role="status">{progress.stage === "uploading" ? "Uploading" : progress.stage === "title-blocks" ? "Reading title blocks" : progress.stage === "saving" ? "Saving" : "Reading pages"} · {progress.done} / {progress.total}</span>}{error && <p role="alert" className="setup-error">{error}</p>}</div>;
}

export function ProjectSetupView({ project, onSave, navigate, notify }: { project: Project; onSave: (project: Project) => void; navigate: (screen: Screen) => void; notify: (text: string) => void }) {
  const setup = useProjectSetup(project);
  const { documents } = useProjectDocuments();
  const [selected, setSelected] = useState<SetupStepId | null>(null), [editing, setEditing] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [decision, setDecision] = useState<{ target: string; title: string; kind: SetupDecision["kind"] } | null>(null), [error, setError] = useState("");
  const summary = setup.summary;
  if (!summary) return null;
  const step = summary.steps.find(s => s.id === selected) ?? summary.next ?? summary.steps[0];
  const detailDocuments = latestDocuments(documents).filter(d => d.category === "RFP" || d.category === "Addenda");
  function decisionActions(target: string, title: string, status: SetupStatus, level: string, saved: SetupDecision | null) {
    if (saved) return <button className="setup-text-button" onClick={() => { const message = setup.run(s => clearDecision(s, target)); notify(message ?? "Decision cleared. The project state is checked again."); }}>Clear saved decision</button>;
    if (status === "ready") return null;
    return <div className="setup-decision-actions"><button onClick={() => { setError(""); setDecision({ target, title, kind: "waiting" }); }}>Waiting on someone</button>{level === "recommended" && <button onClick={() => { setError(""); setDecision({ target, title, kind: "not-applicable" }); }}>Not applicable</button>}</div>;
  }
  function itemView(item: SetupItem) {
    return <article className="setup-item" key={item.id}><div className="setup-item-heading"><strong>{item.label}</strong><SetupStatusBadge status={item.status} reconsider={item.reconsider}/></div><small className="setup-level">{item.level === "required" ? "Needed for this step" : "Recommended"}</small>{item.note && <p>{item.note}</p>}{item.why && <p className="setup-why"><CircleHelp size={13}/>{item.why}</p>}{item.decision && <p className="setup-saved-decision">{item.decision.reason}{item.decision.responsible ? ` · Waiting on ${item.decision.responsible}` : ""}{item.decision.followUp ? ` · Follow up ${item.decision.followUp}` : ""} · {item.decision.by}{item.reconsider ? ". Work type or design stage changed; review this decision." : ""}</p>}
      <div className="setup-item-actions">{item.category && <SetupUpload key={`${project.id}:${step.id}:${item.id}`} projectId={project.id} category={item.category} documents={documents} notify={notify}/>}<div>{decisionActions(`${step.id}:${item.id}`, item.label, item.status, item.level, item.decision)}</div></div>
    </article>;
  }
  return <div className="setup-view"><PageHeader eyebrow="FROM FIRST FILE TO FIRST SCOPE" title="Project setup" description="Start with your documents. Review the details, confirm the trades and let the AI draft scopes." actions={<Button onClick={() => navigate("turnover")}><ListChecks size={15}/>Preconstruction to-do</Button>}/>
    <SetupFileDrop key={project.id} projectId={project.id} documents={documents} notify={notify}/>
    <div className="setup-route-note"><FolderOpen size={19}/><p><strong>Your route to scopes.</strong> Drawings or a project manual are enough to start. The recommended steps can be completed as the project develops.</p><span>{summary.progress.done} / {summary.progress.total} steps ready</span></div>
    <div className="setup-layout"><aside className="setup-step-rail" aria-label="Project setup steps">{summary.steps.map((s, i) => <button key={s.id} aria-current={s.id === step.id ? "step" : undefined} onClick={() => setSelected(s.id)}><span className={`setup-step-number ${s.status}`}>{s.status === "ready" || s.status === "not-applicable" ? <Check size={15}/> : String(i + 1).padStart(2, "0")}</span><span><strong>{s.title}</strong><small>{s.route ? "Path to scopes" : "Recommended"}</small><SetupStatusBadge status={s.status} reconsider={s.reconsider}/></span><ArrowRight size={14}/></button>)}</aside>
      <section className="setup-step-content" aria-busy={!setup.ready || setup.checking}><header><span className="health-eyebrow">{step.route ? "YOUR FIRST SCOPES" : "BUILD THE PROJECT RECORD"}</span><h2>{step.title}</h2><p>{step.detail}</p><SetupStatusBadge status={step.status} reconsider={step.reconsider}/></header>
        {!setup.ready && <p role="status">Checking stored project documents…</p>}
        <SetupCheckStatus checking={setup.checking} error={setup.checkError} onRetry={setup.retryChecks}/>
        {step.items.map(itemView)}
        {step.id === "details" && <div className="setup-detail-actions"><Button onClick={() => setEditing(true)}>Edit project details</Button>{detailDocuments.map(doc => <div className="setup-rfp-file" key={doc.id}><strong>{doc.name}</strong><small>{doc.category === "Addenda" ? "Addendum" : "RFP"} · Version {doc.revision}{setup.state.reviews.some(r => r.docId === doc.id) ? " · Reviewed" : " · Awaiting review"}</small><RfpReview project={project} doc={doc} onSave={onSave} onReviewed={() => setup.run(s => markReviewed(s, doc.id, "Marcel Khoury"))}/></div>)}</div>}
        {step.id === "documents" && <p className="setup-honesty-note">Sheet numbers and titles are read during upload. Completeness is reported only when the drawing index or manual contents can be read with confidence.</p>}
        <div className="setup-step-footer"><Button variant="primary" onClick={() => navigate(step.screen)}>{step.id === "trades" ? "Review and manage trade packages" : step.id === "scopes" ? "Open Write scopes with AI" : step.id === "details" || step.id === "team" ? "Open project information" : step.id === "budget" ? "Open budget" : step.id === "schedule" ? "Open project schedule" : "Open Project files"}<ArrowRight size={15}/></Button>{!step.items.length && decisionActions(step.id, step.title, step.status, step.level, step.decision)}{step.decision && !step.items.length && <p>{step.decision.reason}{step.decision.responsible ? ` · ${step.decision.responsible}` : ""} · {step.decision.by}</p>}</div>
      </section>
    </div>
    {editing && <Modal title="Review project information" wide onClose={() => { if (!formBusy) setEditing(false); }}><ProjectForm project={project} onBusyChange={setFormBusy} onCancel={() => setEditing(false)} onSave={updated => { onSave(updated); setEditing(false); }}/></Modal>}
    {decision && <Modal title={decision.kind === "waiting" ? "Waiting on someone" : "Mark not applicable"} subtitle={decision.title} onClose={() => setDecision(null)}><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const message = setup.run(s => decide(s, { target: decision.target, kind: decision.kind, reason: String(data.get("reason") ?? ""), responsible: String(data.get("responsible") ?? ""), followUp: String(data.get("followUp") ?? "") }, project, "Marcel Khoury")); setError(message ?? ""); if (!message) { setDecision(null); notify("Setup decision saved with its reason."); } }}><label className="ui-field">Reason<textarea name="reason" required rows={3}/></label>{decision.kind === "waiting" && <><label className="ui-field">Waiting on<input name="responsible" required placeholder="Owner, architect or team member"/></label><label className="ui-field">Follow-up date (optional)<input name="followUp" type="date"/></label></>}{error && <p className="setup-error" role="alert">{error}</p>}<div className="proc-form-actions"><Button onClick={() => setDecision(null)}>Cancel</Button><Button type="submit" variant="primary">Save decision</Button></div></form></Modal>}
  </div>;
}
