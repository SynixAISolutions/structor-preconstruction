"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  Download,
  FileText,
  History,
  Paperclip,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { initialBidders, type Bidder } from "../../lib/data/commercial";
import { displayDate, downloadText, usd } from "../../lib/format";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useSubmissions } from "../../lib/use-submissions";
import {
  ANSWERS,
  addAttachment,
  bidExceptions,
  hasUnsubmittedChanges,
  invitationIssues,
  isStale,
  latestRevision,
  openSubmission,
  removeAttachment,
  revisionChanges,
  setResponse,
  submissionFor,
  submissionsForPackage,
  updateDraft,
  type Alternate,
  type Submission,
  type SubmissionIssue,
  type SubmittedRevision,
} from "../../lib/submissions";
import type { Procurement, TradePackage } from "../../lib/procurement";
import { portalRfis, raiseSubcontractorQuestion } from "../../lib/rfi";
import { useStructorCheck } from "../../lib/use-structor-check";
import { portalSubmittals, submitRevision } from "../../lib/submittals";
import { useSubmittalLog } from "../../lib/use-submittal-log";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Tabs, type ViewProps } from "./shared";
import "./submission-ui.css";

type PortalProfile = { name: string; email: string };

const bytes = (value: number) => value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;
const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);
const submittedAt = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const issueFor = (issues: SubmissionIssue[], field: SubmissionIssue["field"], id?: string) => issues.find(issue => issue.field === field && (!id || issue.scopeItemId === id))?.message;

function statusTone(status: Submission["status"]) { return status === "draft" ? "amber" : "green"; }

function PortalBlocked({ messages }: { messages: string[] }) {
  return <Panel><div className="sub-blocked"><AlertTriangle size={25}/><div><h3>This bid form is not open yet</h3>{messages.map(message => <p key={message}>{message}</p>)}</div></div></Panel>;
}

function PackageDocuments({ projectName, pkg }: { projectName: string; pkg: TradePackage }) {
  const items = pkg.published?.items ?? [];
  const documents = [
    { name: "Invitation to bid", body: `${projectName}\n${pkg.code} · ${pkg.name}\nBid due ${displayDate(pkg.due)}\nEstimator: ${pkg.owner}` },
    { name: `${pkg.name} bid form`, body: items.map((item, index) => `${index + 1}. ${item.title}\n   ${item.detail}\n   Source: ${item.source || "Not linked"}`).join("\n\n") },
    { name: "Addendum acknowledgement", body: `${projectName}\n${pkg.name}\nConfirm all addenda received before submitting.` },
  ];
  return <Panel title="Package documents" subtitle="Review the current invitation and published bid form."><div className="sub-document-list">{documents.map(document => <button key={document.name} onClick={() => downloadText(`${document.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.txt`, `${document.name}\n\n${document.body}`)}><span><FileText size={18}/></span><span><strong>{document.name}</strong><small>Download preview · TXT</small></span><Download size={15}/></button>)}</div></Panel>;
}

function ScopeResponseForm({ submission, pkg, issues, run }: {
  submission: Submission;
  pkg: TradePackage;
  issues: SubmissionIssue[];
  run: ReturnType<typeof useSubmissions>["run"];
}) {
  const formItems = pkg.published?.items ?? [];
  return <Panel title="Scope confirmation" subtitle="Y included · N excluded · P partial · N/A not applicable"><div className="sub-response-list">{formItems.map((item, index) => {
    const response = submission.draft.responses.find(answer => answer.scopeItemId === item.id);
    const problem = issueFor(issues, "responses", item.id);
    return <article className={problem ? "has-error" : ""} key={item.id}><span className="sub-number">{String(index + 1).padStart(2, "0")}</span><div className="sub-response-copy"><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}<small><FileText size={11}/>{item.source || "Source not linked"}</small>{problem && <span className="sub-field-error">{problem}</span>}{(response?.answer === "P" || response?.answer === "N/A") && <label>Required explanation<textarea rows={2} value={response.note} onChange={event => run(current => setResponse(current, submission.id, item.id, response.answer, event.target.value))} placeholder="Explain what is partial or why this item does not apply."/></label>}</div><div className="sub-answer-buttons">{ANSWERS.map(answer => <button key={answer} aria-label={`${item.title}: ${answer}`} aria-pressed={response?.answer === answer} className={response?.answer === answer ? `selected answer-${answer.replace("/", "")}` : ""} onClick={() => run(current => setResponse(current, submission.id, item.id, answer, response?.note ?? ""))}>{answer}</button>)}</div></article>;
  })}</div></Panel>;
}

function AlternateEditor({ alternates, onChange }: { alternates: Alternate[]; onChange: (next: Alternate[]) => void }) {
  return <div className="sub-alternates">{alternates.map((alternate, index) => <div key={alternate.id}><select aria-label={`Alternate ${index + 1} type`} value={alternate.kind} onChange={event => onChange(alternates.map(item => item.id === alternate.id ? { ...item, kind: event.target.value as Alternate["kind"] } : item))}><option value="add">Add</option><option value="deduct">Deduct</option></select><input aria-label={`Alternate ${index + 1} description`} value={alternate.description} onChange={event => onChange(alternates.map(item => item.id === alternate.id ? { ...item, description: event.target.value } : item))} placeholder="Description"/><span>$</span><input aria-label={`Alternate ${index + 1} amount`} type="number" min="0" step="0.01" value={alternate.amount || ""} onChange={event => onChange(alternates.map(item => item.id === alternate.id ? { ...item, amount: Number(event.target.value) } : item))}/><button type="button" className="ui-icon-btn" aria-label={`Remove alternate ${index + 1}`} onClick={() => onChange(alternates.filter(item => item.id !== alternate.id))}><Trash2 size={14}/></button></div>)}</div>;
}

function ProposalForm({ submission, issues, run, submit, profile, notify, stale }: {
  submission: Submission;
  issues: SubmissionIssue[];
  run: ReturnType<typeof useSubmissions>["run"];
  submit: ReturnType<typeof useSubmissions>["submit"];
  profile: { name: string; email: string };
  notify: ViewProps["notify"];
  stale: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const last = latestRevision(submission);
  function update(patch: Parameters<typeof updateDraft>[2]) { return run(current => updateDraft(current, submission.id, patch)); }
  function addFiles(files: FileList | null) {
    if (!files) return;
    let errors: SubmissionIssue[] = [];
    for (const file of Array.from(files)) {
      const result = run(current => addAttachment(current, submission.id, { name: file.name, size: file.size, type: file.type }));
      if (result.length) errors = [...errors, ...result];
    }
    if (errors.length) notify(errors[0].message);
    if (picker.current) picker.current.value = "";
  }
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = submit(submission.id, { name: profile.name, email: profile.email });
    if (result.length) { notify(`Review ${result.length} item${result.length === 1 ? "" : "s"} before submitting.`); return; }
    notify(last ? "Revised bid submitted for estimator review." : "Bid submitted for estimator review.");
  }
  return <Panel title="Your proposal" subtitle={last ? `Revision ${last.number} submitted · edit and resubmit when needed` : "Complete every required field before submitting."}><form className="sub-proposal-form" onSubmit={send}>
    {issues.length > 0 && <div className="sub-issue-summary"><AlertTriangle size={16}/><span><strong>{issues.length} item{issues.length === 1 ? "" : "s"} need attention</strong>{issues.slice(0, 3).map(issue => <small key={`${issue.field}-${issue.scopeItemId ?? issue.index ?? issue.message}`}>{issue.message}</small>)}</span></div>}
    <label className={`ui-field ${issueFor(issues, "baseBid") ? "has-error" : ""}`}>Base bid · USD<input type="number" min="0" step="0.01" value={submission.draft.baseBid ?? ""} onChange={event => update({ baseBid: event.target.value ? Number(event.target.value) : null })} placeholder="0.00"/>{issueFor(issues, "baseBid") && <small className="sub-field-error">{issueFor(issues, "baseBid")}</small>}</label>
    <label className="ui-field">Exclusions<textarea rows={3} key={`exclusions-${submission.updatedAt}`} defaultValue={submission.draft.exclusions.join("\n")} onBlur={event => update({ exclusions: lines(event.target.value) })} placeholder="One exclusion per line"/></label>
    <label className="ui-field">Price clarifications<textarea rows={3} key={`clarifications-${submission.updatedAt}`} defaultValue={submission.draft.clarifications.join("\n")} onBlur={event => update({ clarifications: lines(event.target.value) })} placeholder="Qualifications and assumptions attached to this price"/></label>
    <div className="sub-form-section"><div><span>Alternates</span><button type="button" onClick={() => update({ alternates: [...submission.draft.alternates, { id: crypto.randomUUID(), kind: "add", description: "", amount: 0 }] })}><Plus size={13}/>Add alternate</button></div><AlternateEditor alternates={submission.draft.alternates} onChange={alternates => update({ alternates })}/>{issueFor(issues, "alternates") && <small className="sub-field-error">{issueFor(issues, "alternates")}</small>}</div>
    <div className="sub-form-section"><div><span>Proposal attachments</span><button type="button" onClick={() => picker.current?.click()}><Paperclip size={13}/>Attach files</button></div><input ref={picker} hidden type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.zip" onChange={event => addFiles(event.target.files)}/><div className="sub-attachments">{submission.draft.attachments.map(file => <div key={file.id}><FileText size={14}/><span><strong>{file.name}</strong><small>{bytes(file.size)} · File details saved in this browser</small></span><button type="button" className="ui-icon-btn" aria-label={`Remove ${file.name}`} onClick={() => run(current => removeAttachment(current, submission.id, file.id))}><Trash2 size={13}/></button></div>)}</div>{issueFor(issues, "attachments") && <small className="sub-field-error">{issueFor(issues, "attachments")}</small>}<p>Demo only: file details are saved in this browser; file contents are not uploaded.</p></div>
    <div className="sub-submitter"><Users size={16}/><span>Submitting as <strong>{profile.name || "Name required"}</strong><small>{profile.email || "Email required"}</small></span></div>
    <Button type="submit" variant="primary"><Send size={15}/>{last ? "Submit revised bid" : "Submit bid"}</Button>
    {last && <div className="sub-last-submission"><Check size={14}/><span>Revision {last.number} submitted {submittedAt(last.submittedAt)}{hasUnsubmittedChanges(submission) ? " · Unsaved changes ready for a revision" : " · Current draft matches the submitted revision"}{stale ? " · Published form changed" : ""}</span></div>}
  </form></Panel>;
}

function PortalQuestions({ procurement, invitationId, bidder, notify }: { procurement: Procurement; invitationId: string; bidder: Bidder; notify: ViewProps["notify"] }) {
  const { state, run } = useStructorCheck();
  const [question, setQuestion] = useState({ title: "", detail: "", source: "" });
  const [error, setError] = useState("");
  const view = portalRfis(state, bidder.id);
  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = run(current => raiseSubcontractorQuestion(current, procurement, { invitationId, company: bidder.company, ...question }));
    if (errors) { setError(Object.values(errors)[0] ?? "Check the question."); return; }
    setError(""); setQuestion({ title: "", detail: "", source: "" }); notify("Question recorded for contractor review. No email was sent.");
  }
  return <Panel title="Questions & RFIs" subtitle="Your question enters the contractor's issue log for review before an RFI can be sent to the architect.">
    <div className="sub-rfi-list">{view.questions.map(({ issue, current, rfi }) => <article key={issue.id}><span>{issue.number}</span><div><strong>{issue.title}<Badge tone={current.status === "resolved" ? "green" : "amber"}>{current.status === "pending-review" ? "Awaiting contractor review" : current.status === "in-rfi" ? "In RFI" : current.status}</Badge></strong>{issue.detail && <p>{issue.detail}</p>}<small>{issue.source || "No source given"} · Raised {displayDate(issue.createdAt.slice(0, 10))}{rfi ? ` · ${rfi.number} sent` : ""}</small></div></article>)}</div>
    {!view.questions.length && <Empty title="No questions raised" description="Ask about a drawing, specification, or bid-form item. Price conditions belong in bid clarifications."/>}
    {view.shared.length > 0 && <div className="sub-rfi-list"><h3>Design-team answers shared with you</h3>{view.shared.map(item => <article key={item.id}><span>{item.number}</span><div><strong>{item.subject}</strong><p>{item.response?.text || "Response recorded."}</p><small>{item.response?.by} · {item.response ? displayDate(item.response.at.slice(0, 10)) : ""}</small></div></article>)}</div>}
    <form className="sub-rfi-compose" onSubmit={submitQuestion}><label className="ui-field">Question summary<input required value={question.title} onChange={event => setQuestion({ ...question, title: event.target.value })} placeholder="What needs clarification?"/></label><label className="ui-field">Details<textarea rows={3} value={question.detail} onChange={event => setQuestion({ ...question, detail: event.target.value })} placeholder="Explain what is unclear and why it affects your bid."/></label><label className="ui-field">Drawing or specification reference<input value={question.source} onChange={event => setQuestion({ ...question, source: event.target.value })} placeholder="A1.1, detail 4 / 03 30 00"/></label>{error && <p className="sub-field-error" role="alert">{error}</p>}<Button type="submit" variant="primary"><Plus size={14}/>Raise question</Button></form>
  </Panel>;
}

function PortalSubmittals({ bidder, notify }: { bidder: Bidder; notify: ViewProps["notify"] }) {
  const { state, run } = useSubmittalLog();
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const rows = portalSubmittals(state, bidder.id);
  function submit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const files = data.getAll("files").filter((file): file is File => file instanceof File && !!file.name).map(file => ({ name: file.name, size: file.size, type: file.type }));
    const errors = run(current => submitRevision(current, id, { files, note: String(data.get("note") ?? "") }, bidder.name || bidder.company));
    if (errors) { setError({ id, message: Object.values(errors)[0] ?? "Check the submission." }); return; }
    setError(null); notify("Submittal recorded for contractor review. File metadata is saved in this browser.");
  }
  return <Panel title="Your submittals" subtitle="Assigned after an award. Submit a revision when it is your turn; the contractor reviews it before the architect.">
    {!rows.length && <Empty title="No assigned submittals" description="Requirements appear here once your company is awarded and the contractor requests them."/>}
    <div className="sub-portal-submittals">{rows.map(item => <article key={item.id}><header><span><strong>{item.number} · {item.title}</strong><small>Spec {item.specSection}{item.due ? ` · Due ${displayDate(item.due)}` : ""}</small></span><Badge tone={item.status === "closed" ? "green" : item.yourTurn ? "amber" : "blue"}>{item.status === "to-submit" ? "To submit" : item.status === "to-resubmit" ? "Revise and resubmit" : item.status === "closed" ? "Closed" : "In review"}</Badge></header>{item.yourTurn && item.due && item.due < new Date().toISOString().slice(0, 10) && <p className="sub-field-error">Overdue · {displayDate(item.due)}</p>}
      {item.revisions.map(revision => <details key={revision.number}><summary>Revision {revision.number} · {displayDate(revision.submittedAt.slice(0, 10))}</summary><p>{revision.note || "No submission note."}</p>{revision.files.map(file => <small key={file.id}>{file.name} · {bytes(file.size)}</small>)}{revision.contractorNote && <p>Contractor: {revision.contractorNote}</p>}{revision.response && <p>Architect: {revision.response.action} · {revision.response.comments || "No comments"}</p>}</details>)}
      {item.yourTurn && <form onSubmit={event => submit(event, item.id)}><label className="ui-field">Files<input required multiple type="file" name="files" accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.zip"/></label><label className="ui-field">Submission note<textarea name="note" rows={2} placeholder="What should the reviewer know?"/></label>{error?.id === item.id && <p className="sub-field-error" role="alert">{error.message}</p>}<Button type="submit" variant="primary"><Send size={14}/>Submit to contractor</Button></form>}</article>)}</div>
    <p className="sub-demo-note">Demo: file names and sizes are recorded here; files are not uploaded.</p>
  </Panel>;
}

export function SubmissionPortalView({ projectName, notify }: ViewProps) {
  const { projectId, procurement, submissions, run, submit } = useSubmissions();
  const [section, setSection] = useState("Invitation");
  const [directory] = useLocalDraft("directory", initialBidders);
  const [actingInvitationId, setActingInvitationId] = useLocalDraft("portal-acting-invitation", procurement.invitations[0]?.id ?? "");
  const invitation = procurement.invitations.find(item => item.id === actingInvitationId) ?? procurement.invitations[0];
  const bidder = directory.find(company => company.id === invitation?.bidderId);
  const pkg = procurement.packages.find(item => item.id === invitation?.packageId);
  const [profile, setProfile] = useLocalDraft<PortalProfile>(`portal-profile-${invitation?.id ?? "none"}`, { name: bidder?.name ?? "", email: bidder?.email ?? "" });
  const submitter = { name: profile.name || bidder?.name || "", email: profile.email || bidder?.email || "" };
  const [profileEdit, setProfileEdit] = useState<PortalProfile | null>(null);
  const [issues, setIssues] = useState<SubmissionIssue[]>([]);
  const blockers = invitation ? invitationIssues(procurement, invitation.id) : [{ field: "invitation" as const, message: "This project has no invitations to preview." }];
  const submission = invitation ? submissionFor(submissions, invitation.id) : undefined;

  useEffect(() => {
    if (!invitation || blockers.length || submission) return;
    const result = run(current => openSubmission(current, procurement, { projectId, invitationId: invitation.id }));
    if (result.length) setIssues(result);
  }, [blockers.length, invitation, procurement, projectId, run, submission]);

  const activeSubmission = invitation ? submissionFor(submissions, invitation.id) : undefined;
  const last = activeSubmission ? latestRevision(activeSubmission) : undefined;
  const amount = activeSubmission?.draft.baseBid ?? last?.baseBid;

  return <div className="sub-view"><PageHeader eyebrow="SUBCONTRACTOR PORTAL · DEMO" title="Your next opportunity" description="Choose an invited company, complete its bid, and return to Marcel's estimator view." actions={<Button disabled={!invitation} onClick={() => setProfileEdit(submitter)}><Users size={16}/>Edit submitter</Button>}/>
    <PreviewNote>Demo-only workflow · Everything stays in this browser. Notifications are recorded; no email is sent.</PreviewNote>
    <div className="sub-acting-as"><div className="sub-acting-heading"><Building2 size={19}/><span><small>DEMO VIEW</small><strong>Acting as invited company</strong></span></div><label>Invitation<select aria-label="Acting as invited company" value={invitation?.id ?? ""} disabled={!procurement.invitations.length} onChange={event => { setActingInvitationId(event.target.value); setSection("Invitation"); setIssues([]); }}><option value="" disabled>{procurement.invitations.length ? "Choose an invitation" : "No invitations in this project"}</option>{procurement.invitations.map(item => { const company = directory.find(candidate => candidate.id === item.bidderId); const trade = procurement.packages.find(candidate => candidate.id === item.packageId); return <option key={item.id} value={item.id}>{company?.company ?? item.bidderId} · {trade?.name ?? item.packageId} · {item.status}</option>; })}</select></label>{invitation && <div className="sub-acting-contact"><span><strong>{bidder?.company ?? "Directory company"}</strong><small>{submitter.name || "Contact not recorded"} · {submitter.email || "Email not recorded"}</small></span><Badge tone={blockers.length ? "amber" : invitation.status === "submitted" ? "green" : "blue"}>{blockers.length ? "Cannot bid" : invitation.status}</Badge></div>}</div>
    {pkg && <div className="sub-portal-hero"><div><Badge tone="blue">INVITATION TO BID</Badge><h2>{projectName}</h2><p>{pkg.name} · CSI {pkg.code}</p><div><span>Bid due {displayDate(pkg.due)}</span><span>Estimator: {pkg.owner}</span>{pkg.published && <span>Bid form v{pkg.published.version}</span>}</div></div><aside><small>Your proposal</small><Badge tone={activeSubmission ? statusTone(activeSubmission.status) : "amber"}>{activeSubmission?.status ?? "Not started"}</Badge><strong>{amount ? usd(amount) : "—"}</strong></aside></div>}
    <Tabs tabs={["Invitation", "Scope & bid", "RFIs", "Submittals"]} value={section} onChange={setSection}/>
    {!pkg ? <Empty title="No invitation to preview" description="Invite a company from Bid packages, then return here to act as that bidder."/> : section === "Invitation" ? <div className="sub-invitation-grid"><Panel title="Project overview" subtitle="Review the trade package before preparing your proposal."><div className="sub-overview"><p>Provide a complete price for the published {pkg.name.toLowerCase()} bid form. Confirm every scope item and record any exclusions, alternates, or price clarifications.</p><dl><div><dt>Trade package</dt><dd>{pkg.code} · {pkg.name}</dd></div><div><dt>Bid deadline</dt><dd>{displayDate(pkg.due)}</dd></div><div><dt>Estimator</dt><dd>{pkg.owner}</dd></div><div><dt>Published form</dt><dd>{pkg.published ? `Version ${pkg.published.version}` : "Not published"}</dd></div></dl>{blockers.length ? <div className="sub-inline-warning"><AlertTriangle size={15}/>{blockers[0].message}</div> : <Button variant="primary" onClick={() => setSection("Scope & bid")}>Prepare proposal<ArrowRight size={15}/></Button>}</div></Panel><PackageDocuments projectName={projectName} pkg={pkg}/></div> : section === "Scope & bid" ? blockers.length || !activeSubmission ? <PortalBlocked messages={blockers.map(issue => issue.message)}/> : <div className="sub-bid-grid"><ScopeResponseForm submission={activeSubmission} pkg={pkg} issues={issues} run={(action) => { const result = run(action); setIssues(result); return result; }}/><ProposalForm submission={activeSubmission} issues={issues} run={(action) => { const result = run(action); setIssues(result); return result; }} submit={(id, person) => { const result = submit(id, person); setIssues(result); return result; }} profile={submitter} notify={notify} stale={isStale(activeSubmission, procurement)}/></div> : section === "RFIs" ? bidder && invitation ? <PortalQuestions key={invitation.id} procurement={procurement} invitationId={invitation.id} bidder={bidder} notify={notify}/> : <Empty title="No company selected" description="Choose an invited company to raise a question."/> : bidder ? <PortalSubmittals key={bidder.id} bidder={bidder} notify={notify}/> : <Empty title="No company selected" description="Choose an invited company to view its submittals."/>}
    {profileEdit && invitation && <Modal title="Edit submitter" subtitle={`${bidder?.company ?? "Invited company"} · ${pkg?.name ?? "Trade package"}`} onClose={() => setProfileEdit(null)}><form onSubmit={event => { event.preventDefault(); setProfile(profileEdit); setProfileEdit(null); notify("Submitter details saved in this browser."); }}><div className="ui-form-grid"><label className="ui-field">Contact name<input required value={profileEdit.name} onChange={event => setProfileEdit({ ...profileEdit, name: event.target.value })}/></label><label className="ui-field">Email<input required type="email" value={profileEdit.email} onChange={event => setProfileEdit({ ...profileEdit, email: event.target.value })}/></label></div><div className="sub-modal-actions"><Button onClick={() => setProfileEdit(null)}>Cancel</Button><Button type="submit" variant="primary">Save submitter</Button></div></form></Modal>}
  </div>;
}

function RevisionDetail({ submission, revision, pkg, bidder, onClose }: { submission: Submission; revision: SubmittedRevision; pkg: TradePackage; bidder?: Bidder; onClose: () => void }) {
  const exceptions = bidExceptions(revision);
  const previous = submission.revisions.at(-2);
  const changes = previous ? revisionChanges(previous, revision) : null;
  const title = new Map((pkg.published?.items ?? []).map(item => [item.id, item.title]));
  return <Modal title={`${bidder?.company ?? "Bidder"} · Revision ${revision.number}`} subtitle={`${pkg.name} · Submitted ${submittedAt(revision.submittedAt)}`} onClose={onClose} wide><div className="sub-review-summary"><div><small>BASE BID</small><strong>{usd(revision.baseBid ?? 0)}</strong></div><div><small>FORM VERSION</small><strong>v{revision.formVersion}</strong></div><div><small>EXCEPTIONS</small><strong>{exceptions.length}</strong></div><div><small>SUBMITTED BY</small><strong>{revision.submitter.name}</strong><span>{revision.submitter.email}</span></div></div>{changes && <div className="sub-change-summary"><History size={15}/><span><strong>{changes.baseBidDelta === 0 ? "Base bid unchanged" : `${changes.baseBidDelta > 0 ? "+" : ""}${usd(changes.baseBidDelta)} base-bid change`}</strong><small>{changes.changedResponses.length} changed scope answer{changes.changedResponses.length === 1 ? "" : "s"}{changes.exclusionsChanged || changes.alternatesChanged || changes.clarificationsChanged || changes.attachmentsChanged ? " · Supporting details changed" : ""}</small></span></div>}<div className="sub-review-grid"><section><h3>Scope responses</h3>{revision.responses.map(response => <div className={response.answer === "Y" ? "" : "exception"} key={response.scopeItemId}><Badge tone={response.answer === "Y" ? "green" : "amber"}>{response.answer ?? "—"}</Badge><span><strong>{title.get(response.scopeItemId) ?? response.scopeItemId}</strong>{response.note && <small>{response.note}</small>}</span></div>)}</section><aside><h3>Price details</h3><DetailList title="Exclusions" values={revision.exclusions}/><DetailList title="Clarifications" values={revision.clarifications}/><div className="sub-review-section"><strong>Alternates</strong>{revision.alternates.length ? revision.alternates.map(item => <p key={item.id}>{item.kind === "add" ? "+" : "−"}{usd(item.amount)} · {item.description}</p>) : <p>None recorded</p>}</div><div className="sub-review-section"><strong>Attachments</strong>{revision.attachments.length ? revision.attachments.map(file => <p key={file.id}>{file.name} · {bytes(file.size)}</p>) : <p>No attachments</p>}</div></aside></div></Modal>;
}

function DetailList({ title, values }: { title: string; values: string[] }) { return <div className="sub-review-section"><strong>{title}</strong>{values.length ? values.map(value => <p key={value}>{value}</p>) : <p>None recorded</p>}</div>; }

export function EstimatorSubmissions({ packageId, procurement, submissions, directory }: { packageId: string; procurement: Procurement; submissions: Submission[]; directory: Bidder[] }) {
  const [review, setReview] = useState<{ submission: Submission; revision: SubmittedRevision } | null>(null);
  const pkg = procurement.packages.find(item => item.id === packageId);
  if (!pkg) return null;
  const rows = submissionsForPackage(submissions, packageId).filter(item => latestRevision(item));
  return <div className="sub-estimator-list">{rows.map(submission => { const revision = latestRevision(submission)!; const bidder = directory.find(item => item.id === submission.bidderId); const exceptions = bidExceptions(revision); const stale = isStale(submission, procurement); return <article key={submission.id}><span className="sub-company-mark">{(bidder?.company ?? "?").slice(0, 2).toUpperCase()}</span><div><strong>{bidder?.company ?? submission.bidderId}</strong><small>Revision {revision.number} · Submitted {submittedAt(revision.submittedAt)}</small><span>{exceptions.length ? `${exceptions.length} scope exception${exceptions.length === 1 ? "" : "s"}` : "Full scope confirmed"}{stale ? " · Older form version" : ""}</span></div><strong>{usd(revision.baseBid ?? 0)}</strong><Button onClick={() => setReview({ submission, revision })}>Review bid<ArrowRight size={13}/></Button></article>; })}{!rows.length && <Empty title="No submitted bids" description="Submitted portal responses will appear here with scope exceptions and revision history."/>}{review && <RevisionDetail submission={review.submission} revision={review.revision} pkg={pkg} bidder={directory.find(item => item.id === review.submission.bidderId)} onClose={() => setReview(null)}/>}</div>;
}
