"use client";

import { useState, type FormEvent } from "react";
import { Building2, Send } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Stats, Tabs, type ViewProps } from "./shared";
import { ARCHITECT_ACTIONS, recordArchitectResponse, type ArchitectAction, type Submittal } from "../../lib/submittals";
import { useSubmittalLog } from "../../lib/use-submittal-log";

const ACTION_LABEL: Record<ArchitectAction, string> = { approved: "Approved", "approved-as-noted": "Approved as noted", "revise-and-resubmit": "Revise and resubmit", rejected: "Rejected" };
const lastResponse = (s: Submittal) => [...s.revisions].reverse().find(r => r.response)?.response ?? null;

/**
 * What the architect sees (Marcel, 15 Oct): only the submittals — those the contractor sent for
 * review, and the ones already answered. The architect records an action and comments; the contractor
 * then returns the response to the subcontractor. A preview in this demo: no separate login yet.
 */
export function ArchitectPortal({ projectName, notify }: ViewProps) {
  const { state, run } = useSubmittalLog();
  const [tab, setTab] = useState("To review");
  const [responding, setResponding] = useState<Submittal | null>(null);
  const [action, setAction] = useState<ArchitectAction>("approved");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const toReview = state.submittals.filter(s => s.status === "with-architect");
  const answered = state.submittals.filter(s => lastResponse(s));
  const rows = tab === "To review" ? toReview : answered;

  function respond(event: FormEvent) {
    event.preventDefault();
    if (!responding) return;
    if (action !== "approved" && !comments.trim()) { setError("Add review comments for anything other than an approval."); return; }
    const errors = run(current => recordArchitectResponse(current, responding.id, { action, comments, by: "Design team" }, "Design team"));
    if (errors) { setError(Object.values(errors).join(" ")); return; }
    notify(`${responding.number}: ${ACTION_LABEL[action]} recorded. The contractor returns it to the subcontractor.`);
    setResponding(null); setComments(""); setAction("approved"); setError("");
  }

  return <div className="sub-view">
    <PageHeader eyebrow="ARCHITECT PORTAL · DEMO" title={`${projectName} submittals`} description="Review the submittals the contractor sent you, record your action and comments, and see what you already returned."/>
    <PreviewNote>Preview of the architect's view · only submittals are visible; nothing else in the project is shared.</PreviewNote>
    <Stats items={[{ label: "Waiting for your review", value: toReview.length, detail: "Sent by the contractor", tone: toReview.length ? "orange" : "green" }, { label: "Answered", value: answered.length, detail: "Returned to the contractor" }]}/>
    <Tabs tabs={["To review", "Answered"]} value={tab} onChange={setTab}/>
    <Panel>{rows.length ? <div className="sub-portal-submittals">{rows.map(s => { const response = lastResponse(s); const revision = s.revisions.at(-1); return <article key={s.id}>
      <header><span><strong>{s.number} · {s.title}</strong><small>Spec {s.specSection} · {s.subcontractor?.company ?? "Subcontractor"} · {revision?.number ? `revision ${revision.number}` : "original submission"}</small></span>{response ? <Badge tone={response.action === "approved" || response.action === "approved-as-noted" ? "green" : "amber"}>{ACTION_LABEL[response.action]}</Badge> : <Badge tone="blue">Your turn</Badge>}</header>
      {revision?.files?.length ? <small>Files: {revision.files.map(f => f.name).join(", ")}</small> : null}
      {response?.comments && <p>{response.comments}</p>}
      {s.status === "with-architect" && <Button variant="primary" onClick={() => { setResponding(s); setError(""); }}><Send size={14}/>Record review</Button>}
    </article>; })}</div> : <Empty title={tab === "To review" ? "Nothing waiting for review" : "No answered submittals yet"} description="The contractor sends submittals here from Submittal packages."/>}</Panel>
    {responding && <Modal title={`Review ${responding.number}`} subtitle={responding.title} onClose={() => setResponding(null)}><form onSubmit={respond}>
      <label className="ui-field"><span><Building2 size={13}/> Architect action</span><select value={action} onChange={e => setAction(e.target.value as ArchitectAction)}>{ARCHITECT_ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}</select></label>
      <label className="ui-field">Review comments<textarea rows={4} value={comments} onChange={e => setComments(e.target.value)} placeholder={action === "approved" ? "Optional for an approval" : "Required"}/></label>
      {error && <p role="alert" className="sub-field-error">{error}</p>}
      <div className="sub-modal-actions"><Button onClick={() => setResponding(null)}>Cancel</Button><Button type="submit" variant="primary">Return to contractor</Button></div>
    </form></Modal>}
  </div>;
}
