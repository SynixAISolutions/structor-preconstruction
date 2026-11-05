"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Check, FileText, Paperclip, Plus, Send, Trash2, Users } from "lucide-react";
import type { PublishedForm } from "../../lib/procurement";
import { ANSWERS, addAttachment, hasUnsubmittedChanges, latestRevision, removeAttachment, setResponse, updateDraft, type Alternate, type Submission, type SubmissionIssue, type Submitter } from "../../lib/submissions";
import { Button, Panel } from "./shared";
import "./submission-ui.css";

// The bid form itself: scope answers, price and files. The contractor's preview (submission-ui) and a subcontractor's
// real page (bid-portal) use the same one, so what the estimator previews is what the sub gets.

export type BidRun = (action: (current: Submission[]) => Submission[]) => SubmissionIssue[];
export type BidFiles = { add: (files: File[]) => void; remove: (id: string) => void; href: (id: string) => string; status: string };

export const bytes = (value: number) => value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;
export const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);
export const submittedAt = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const issueFor = (issues: SubmissionIssue[], field: SubmissionIssue["field"], id?: string) => issues.find(issue => issue.field === field && (!id || issue.scopeItemId === id))?.message;


export function ScopeResponseForm({ submission, items, issues, run }: {
  submission: Submission;
  items: PublishedForm["items"];
  issues: SubmissionIssue[];
  run: BidRun;
}) {
  const formItems = items;
  return <Panel title="Scope confirmation" subtitle="Y included · N excluded · P partial · N/A not applicable"><div className="sub-response-list">{formItems.map((item, index) => {
    const response = submission.draft.responses.find(answer => answer.scopeItemId === item.id);
    const problem = issueFor(issues, "responses", item.id);
    return <article className={problem ? "has-error" : ""} key={item.id}><span className="sub-number">{String(index + 1).padStart(2, "0")}</span><div className="sub-response-copy"><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}<small><FileText size={11}/>{item.source || "Source not linked"}</small>{problem && <span className="sub-field-error">{problem}</span>}{(response?.answer === "P" || response?.answer === "N/A") && <label>Required explanation<textarea rows={2} value={response.note} onChange={event => run(current => setResponse(current, submission.id, item.id, response.answer, event.target.value))} placeholder="Explain what is partial or why this item does not apply."/></label>}</div><div className="sub-answer-buttons">{ANSWERS.map(answer => <button key={answer} aria-label={`${item.title}: ${answer}`} aria-pressed={response?.answer === answer} className={response?.answer === answer ? `selected answer-${answer.replace("/", "")}` : ""} onClick={() => run(current => setResponse(current, submission.id, item.id, answer, response?.note ?? ""))}>{answer}</button>)}</div></article>;
  })}</div></Panel>;
}

export function AlternateEditor({ alternates, onChange }: { alternates: Alternate[]; onChange: (next: Alternate[]) => void }) {
  return <div className="sub-alternates">{alternates.map((alternate, index) => <div key={alternate.id}><select aria-label={`Alternate ${index + 1} type`} value={alternate.kind} onChange={event => onChange(alternates.map(item => item.id === alternate.id ? { ...item, kind: event.target.value as Alternate["kind"] } : item))}><option value="add">Add</option><option value="deduct">Deduct</option></select><input aria-label={`Alternate ${index + 1} description`} value={alternate.description} onChange={event => onChange(alternates.map(item => item.id === alternate.id ? { ...item, description: event.target.value } : item))} placeholder="Description"/><span>$</span><input aria-label={`Alternate ${index + 1} amount`} type="number" min="0" step="0.01" value={alternate.amount || ""} onChange={event => onChange(alternates.map(item => item.id === alternate.id ? { ...item, amount: Number(event.target.value) } : item))}/><button type="button" className="ui-icon-btn" aria-label={`Remove alternate ${index + 1}`} onClick={() => onChange(alternates.filter(item => item.id !== alternate.id))}><Trash2 size={14}/></button></div>)}</div>;
}

export function ProposalForm({ submission, issues, run, submit, profile, notify, stale, files, submitter }: {
  submission: Submission;
  issues: SubmissionIssue[];
  run: BidRun;
  submit: (id: string, person: Submitter) => SubmissionIssue[] | Promise<SubmissionIssue[]>;
  profile: { name: string; email: string };
  notify: (message: string) => void;
  stale: boolean;
  /** Where files really go. Without it (the preview), only their details are recorded. */
  files?: BidFiles;
  /** Replaces the line saying who is submitting. */
  submitter?: ReactNode;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const last = latestRevision(submission);
  function update(patch: Parameters<typeof updateDraft>[2]) { return run(current => updateDraft(current, submission.id, patch)); }
  function addFiles(chosen: FileList | null) {
    if (!chosen) return;
    if (files) { files.add(Array.from(chosen)); if (picker.current) picker.current.value = ""; return; }
    let errors: SubmissionIssue[] = [];
    for (const file of Array.from(chosen)) {
      const result = run(current => addAttachment(current, submission.id, { name: file.name, size: file.size, type: file.type }));
      if (result.length) errors = [...errors, ...result];
    }
    if (errors.length) notify(errors[0].message);
    if (picker.current) picker.current.value = "";
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    const result = await submit(submission.id, { name: profile.name, email: profile.email });
    setSending(false);
    if (result.length) { notify(`Review ${result.length} item${result.length === 1 ? "" : "s"} before submitting.`); return; }
    notify(last ? "Revised bid submitted for estimator review." : "Bid submitted for estimator review.");
  }
  return <Panel title="Your proposal" subtitle={last ? `Revision ${last.number} submitted · edit and resubmit when needed` : "Complete every required field before submitting."}><form className="sub-proposal-form" onSubmit={send}>
    {issues.length > 0 && <div className="sub-issue-summary"><AlertTriangle size={16}/><span><strong>{issues.length} item{issues.length === 1 ? "" : "s"} need attention</strong>{issues.slice(0, 3).map(issue => <small key={`${issue.field}-${issue.scopeItemId ?? issue.index ?? issue.message}`}>{issue.message}</small>)}</span></div>}
    <label className={`ui-field ${issueFor(issues, "baseBid") ? "has-error" : ""}`}>Base bid · USD<input type="number" min="0" step="0.01" value={submission.draft.baseBid ?? ""} onChange={event => update({ baseBid: event.target.value ? Number(event.target.value) : null })} placeholder="0.00"/>{issueFor(issues, "baseBid") && <small className="sub-field-error">{issueFor(issues, "baseBid")}</small>}</label>
    <label className="ui-field">Exclusions<textarea rows={3} key={`exclusions-${submission.updatedAt}`} defaultValue={submission.draft.exclusions.join("\n")} onBlur={event => update({ exclusions: lines(event.target.value) })} placeholder="One exclusion per line"/></label>
    <label className="ui-field">Price clarifications<textarea rows={3} key={`clarifications-${submission.updatedAt}`} defaultValue={submission.draft.clarifications.join("\n")} onBlur={event => update({ clarifications: lines(event.target.value) })} placeholder="Qualifications and assumptions attached to this price"/></label>
    <div className="sub-form-section"><div><span>Alternates</span><button type="button" onClick={() => update({ alternates: [...submission.draft.alternates, { id: crypto.randomUUID(), kind: "add", description: "", amount: 0 }] })}><Plus size={13}/>Add alternate</button></div><AlternateEditor alternates={submission.draft.alternates} onChange={alternates => update({ alternates })}/>{issueFor(issues, "alternates") && <small className="sub-field-error">{issueFor(issues, "alternates")}</small>}</div>
    <div className="sub-form-section"><div><span>Proposal attachments</span><button type="button" onClick={() => picker.current?.click()}><Paperclip size={13}/>Attach files</button></div><input ref={picker} hidden type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.zip" onChange={event => addFiles(event.target.files)}/><div className="sub-attachments">{submission.draft.attachments.map(file => <div key={file.id}><FileText size={14}/><span><strong>{files ? <a href={files.href(file.id)}>{file.name}</a> : file.name}</strong><small>{bytes(file.size)}{files ? "" : " · File details saved in this browser"}</small></span><button type="button" className="ui-icon-btn" aria-label={`Remove ${file.name}`} onClick={() => { if (files) files.remove(file.id); else run(current => removeAttachment(current, submission.id, file.id)); }}><Trash2 size={13}/></button></div>)}</div>{issueFor(issues, "attachments") && <small className="sub-field-error">{issueFor(issues, "attachments")}</small>}{files ? files.status && <p role="status">{files.status}</p> : <p>Preview only: file details are saved in this browser; file contents are not uploaded.</p>}</div>
    {submitter ?? <div className="sub-submitter"><Users size={16}/><span>Submitting as <strong>{profile.name || "Name required"}</strong><small>{profile.email || "Email required"}</small></span></div>}
    <Button type="submit" variant="primary" disabled={sending}><Send size={15}/>{sending ? "Submitting…" : last ? "Submit revised bid" : "Submit bid"}</Button>
    {last && <div className="sub-last-submission"><Check size={14}/><span>Revision {last.number} submitted {submittedAt(last.submittedAt)}{hasUnsubmittedChanges(submission) ? " · You've changed it since: submit again to send the changes" : " · Current draft matches the submitted revision"}{stale ? " · Published form changed" : ""}</span></div>}
  </form></Panel>;
}
