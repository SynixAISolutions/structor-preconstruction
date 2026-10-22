"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileQuestion,
  Inbox,
  Mail,
  MessageSquareQuote,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { initialBidders } from "../../lib/data/commercial";
import { displayDate } from "../../lib/format";
import {
  addIssue,
  approveIssue,
  approveRfi,
  checkSummary,
  closeIssue,
  closeRfi,
  combineIssues,
  createRfi,
  discardRfi,
  editIssue,
  editRfi,
  filterIssues,
  issueTrades,
  markRfiNotificationsRead,
  portalRfis,
  raiseSubcontractorQuestion,
  recordRfiResponse,
  reopenIssue,
  rfiLog,
  sendRfi,
  shareRfiResponse,
  type IssueInput,
  type IssueOrigin,
  type IssueStatus,
  type Rfi,
  type RfiErrors,
  type Severity,
  type StructorCheckState,
  type StructorIssue,
} from "../../lib/rfi";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useProcurement } from "../../lib/use-procurement";
import { useStructorCheck } from "../../lib/use-structor-check";
import {
  Badge,
  Button,
  Empty,
  ExportButton,
  Modal,
  PageHeader,
  Panel,
  PreviewNote,
  SearchBox,
  Stats,
  Tabs,
  exportRows,
  type ViewProps,
} from "./shared";
import "./rfi-ui.css";
import { LinkedProjectContent } from "./project-content-links";

const CURRENT_USER = "Marcel Khoury";
const origins: IssueOrigin[] = ["ai", "team", "subcontractor", "email"];
const statuses: IssueStatus[] = ["pending-review", "open", "in-rfi", "resolved", "dismissed", "combined"];
const severities: Severity[] = ["high", "medium", "low"];

const originLabel: Record<IssueOrigin, string> = {
  ai: "Structor AI",
  team: "Project team",
  subcontractor: "Subcontractor",
  email: "Email",
};

const statusLabel: Record<IssueStatus, string> = {
  "pending-review": "Awaiting contractor",
  open: "Reviewed · open",
  "in-rfi": "In RFI",
  resolved: "Resolved",
  dismissed: "Dismissed",
  combined: "Combined",
};

const statusTone = (status: IssueStatus) => status === "resolved" ? "green" : status === "in-rfi" ? "blue" : status === "pending-review" ? "orange" : "neutral";
const rfiTone = (status: Rfi["status"]) => status === "closed" ? "green" : status === "answered" || status === "approved" ? "blue" : status === "sent" ? "orange" : "neutral";
const firstError = (errors: RfiErrors) => Object.values(errors)[0] ?? "Review the highlighted fields.";
const prettyDateTime = (value: string | null) => value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Not recorded";

type IssueDraft = {
  id?: string;
  title: string;
  detail: string;
  category: string;
  severity: Severity;
  trade: string;
  packageId: string;
  source: string;
  crossReference: string;
  origin: "team" | "email";
};

type RfiDraft = {
  id?: string;
  issueIds: string[];
  subject: string;
  question: string;
  discipline: string;
  toName: string;
  toCompany: string;
  toEmail: string;
  due: string;
};

type CombineDraft = { keep: StructorIssue; otherIds: string[] };

function FieldError({ children }: { children?: string }) {
  return children ? <small className="rfi-field-error">{children}</small> : null;
}

function IssueEditor({ value, packages, errors, onChange, onClose, onSave }: {
  value: IssueDraft;
  packages: ReturnType<typeof useProcurement>["state"]["packages"];
  errors: RfiErrors;
  onChange: (next: IssueDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return <Modal title={value.id ? "Edit coordination issue" : "Add coordination issue"} subtitle="Team and email questions join Structor findings in one review queue." onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave(); }}>
      <label className="ui-field">Issue title<input autoFocus value={value.title} onChange={event => onChange({ ...value, title: event.target.value })} placeholder="What needs to be clarified?"/><FieldError>{errors.title}</FieldError></label>
      <label className="ui-field">Description<textarea rows={4} value={value.detail} onChange={event => onChange({ ...value, detail: event.target.value })} placeholder="Explain the conflict, missing detail, or coordination concern."/></label>
      <div className="ui-form-grid">
        <label className="ui-field">Severity<select value={value.severity} onChange={event => onChange({ ...value, severity: event.target.value as Severity })}>{severities.map(item => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><FieldError>{errors.severity}</FieldError></label>
        <label className="ui-field">Origin<select value={value.origin} onChange={event => onChange({ ...value, origin: event.target.value as IssueDraft["origin"] })}><option value="team">Project team</option><option value="email">Received by email</option></select></label>
        <label className="ui-field">Category<input value={value.category} onChange={event => onChange({ ...value, category: event.target.value })} placeholder="Missing detail"/></label>
        <label className="ui-field">Trade package<select value={value.packageId} onChange={event => { const pkg = packages.find(item => item.id === event.target.value); onChange({ ...value, packageId: event.target.value, trade: pkg ? `${pkg.division} · ${pkg.name}` : value.trade }); }}><option value="">No package</option>{packages.map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
        <label className="ui-field">Trade / discipline<input value={value.trade} onChange={event => onChange({ ...value, trade: event.target.value })} placeholder="08 · Openings"/></label>
        <label className="ui-field">Drawing or source<input value={value.source} onChange={event => onChange({ ...value, source: event.target.value })} placeholder="A-101 · Room 104"/></label>
      </div>
      <label className="ui-field">Cross-reference<input value={value.crossReference} onChange={event => onChange({ ...value, crossReference: event.target.value })} placeholder="A-601 · Door schedule"/></label>
      <div className="rfi-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save issue</Button></div>
    </form>
  </Modal>;
}

function RfiEditor({ value, issues, errors, onChange, onClose, onSave }: {
  value: RfiDraft;
  issues: StructorIssue[];
  errors: RfiErrors;
  onChange: (next: RfiDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return <Modal title={value.id ? "Edit contractor RFI draft" : "Contractor review and RFI packaging"} subtitle="Review the source issues, write one clear question, then save it as an internal draft." wide onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave(); }}>
      <div className="rfi-review-gate"><ShieldCheck size={20}/><div><strong>Contractor review gate</strong><p>Nothing reaches the architect from this step. A separate send action is required after the draft is reviewed.</p></div></div>
      <fieldset className="rfi-issue-picker"><legend>Issues included in this RFI</legend>{issues.map(issue => <label key={issue.id}><input type="checkbox" checked={value.issueIds.includes(issue.id)} onChange={event => onChange({ ...value, issueIds: event.target.checked ? [...value.issueIds, issue.id] : value.issueIds.filter(id => id !== issue.id) })}/><span><strong>{issue.number} · {issue.title}</strong><small>{issue.trade || "No trade"} · {originLabel[issue.origin]}</small></span></label>)}</fieldset>
      <FieldError>{errors.issueIds}</FieldError>
      <div className="ui-form-grid">
        <label className="ui-field">RFI subject<input value={value.subject} onChange={event => onChange({ ...value, subject: event.target.value })}/></label>
        <label className="ui-field">Discipline<input value={value.discipline} onChange={event => onChange({ ...value, discipline: event.target.value })}/></label>
      </div>
      <label className="ui-field">Question for the design team<textarea rows={5} value={value.question} onChange={event => onChange({ ...value, question: event.target.value })}/><FieldError>{errors.question}</FieldError></label>
      <div className="ui-form-grid">
        <label className="ui-field">Design contact<input value={value.toName} onChange={event => onChange({ ...value, toName: event.target.value })} placeholder="Architect name"/><FieldError>{errors.to}</FieldError></label>
        <label className="ui-field">Company<input value={value.toCompany} onChange={event => onChange({ ...value, toCompany: event.target.value })} placeholder="Design firm"/></label>
        <label className="ui-field">Email<input type="email" value={value.toEmail} onChange={event => onChange({ ...value, toEmail: event.target.value })} placeholder="architect@example.com"/><FieldError>{errors.email}</FieldError></label>
        <label className="ui-field">Response due<input type="date" value={value.due} onChange={event => onChange({ ...value, due: event.target.value })}/><FieldError>{errors.due}</FieldError></label>
      </div>
      <div className="rfi-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save internal draft</Button></div>
    </form>
  </Modal>;
}

export function RfiWorkspace({ projectName, notify }: ViewProps) {
  const { state, run } = useStructorCheck();
  const { state: procurement } = useProcurement();
  const [bidders] = useLocalDraft("bidders", initialBidders);
  const [tab, setTab] = useState("Issue review");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [selectedRfiId, setSelectedRfiId] = useState("");
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null);
  const [rfiDraft, setRfiDraft] = useState<RfiDraft | null>(null);
  const [combineDraft, setCombineDraft] = useState<CombineDraft | null>(null);
  const [closeDraft, setCloseDraft] = useState<{ issue: StructorIssue; outcome: "resolved" | "dismissed"; note: string } | null>(null);
  const [responseDraft, setResponseDraft] = useState<{ rfi: Rfi; text: string; by: string } | null>(null);
  const [sendDraft, setSendDraft] = useState<Rfi | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [errors, setErrors] = useState<RfiErrors>({});
  const [invitationId, setInvitationId] = useState(procurement.invitations[0]?.id ?? "");
  const [portalQuestion, setPortalQuestion] = useState<{ title: string; detail: string; source: string } | null>(null);

  const summary = checkSummary(state, new Date().toISOString().slice(0, 10));
  const visible = filterIssues(state, {
    query,
    trade: trade || undefined,
    severity: (severity || undefined) as Severity | undefined,
    status: (status || undefined) as IssueStatus | undefined,
    origin: (origin || undefined) as IssueOrigin | undefined,
  });
  const selectedIssue = state.issues.find(item => item.id === selectedIssueId) ?? visible[0] ?? null;
  const selectedRfi = state.rfis.find(item => item.id === selectedRfiId) ?? state.rfis.at(-1) ?? null;
  const availableRfiIssues = rfiDraft ? state.issues.filter(issue => issue.status === "open" || issue.rfiId === rfiDraft.id) : [];
  const combineCandidates = state.issues.filter(issue => issue.status === "open" && issue.id !== selectedIssue?.id);
  const unread = state.notifications.filter(item => !item.read);
  const log = rfiLog(state);
  const selectedInvitation = procurement.invitations.find(item => item.id === invitationId) ?? procurement.invitations[0];
  const selectedBidder = bidders.find(item => item.id === selectedInvitation?.bidderId);
  const portal = portalRfis(state, selectedInvitation?.bidderId ?? "");
  const packageName = procurement.packages.find(item => item.id === selectedInvitation?.packageId)?.name ?? "Unknown package";

  function apply(action: (current: StructorCheckState) => StructorCheckState, success: string) {
    const nextErrors = run(action);
    if (nextErrors) {
      setErrors(nextErrors);
      notify(firstError(nextErrors));
      return false;
    }
    setErrors({});
    notify(success);
    return true;
  }

  function newIssue() {
    setErrors({});
    setIssueDraft({ title: "", detail: "", category: "Question", severity: "medium", trade: "", packageId: "", source: "", crossReference: "", origin: "team" });
  }

  function editIssueDraft(issue: StructorIssue) {
    setErrors({});
    setIssueDraft({ id: issue.id, title: issue.title, detail: issue.detail, category: issue.category, severity: issue.severity, trade: issue.trade, packageId: issue.packageId ?? "", source: issue.source, crossReference: issue.crossReference, origin: issue.origin === "email" ? "email" : "team" });
  }

  function saveIssue() {
    if (!issueDraft) return;
    const input: IssueInput = { title: issueDraft.title, detail: issueDraft.detail, category: issueDraft.category, severity: issueDraft.severity, trade: issueDraft.trade, packageId: issueDraft.packageId || null, source: issueDraft.source, crossReference: issueDraft.crossReference, origin: issueDraft.origin, raisedBy: CURRENT_USER };
    const ok = issueDraft.id
      ? apply(current => editIssue(current, issueDraft.id!, input), "Issue updated and returned to the contractor review queue.")
      : apply(current => addIssue(current, input, CURRENT_USER), "Issue added to the contractor review queue.");
    if (ok) setIssueDraft(null);
  }

  function openRfiEditor(issueIds: string[], rfi?: Rfi) {
    const first = state.issues.find(issue => issue.id === issueIds[0]);
    const contact = rfi?.to ?? state.designTeam ?? { name: "", company: "", email: "" };
    setErrors({});
    setRfiDraft({ id: rfi?.id, issueIds, subject: rfi?.subject ?? first?.title ?? "", question: rfi?.question ?? first?.detail ?? "", discipline: rfi?.discipline ?? first?.trade ?? "", toName: contact.name, toCompany: contact.company, toEmail: contact.email, due: rfi?.due ?? "" });
  }

  function saveRfi() {
    if (!rfiDraft) return;
    const input = { issueIds: rfiDraft.issueIds, subject: rfiDraft.subject, question: rfiDraft.question, discipline: rfiDraft.discipline, to: { name: rfiDraft.toName, company: rfiDraft.toCompany, email: rfiDraft.toEmail }, due: rfiDraft.due };
    const ok = rfiDraft.id
      ? apply(current => editRfi(current, rfiDraft.id!, input), "RFI draft updated after contractor review.")
      : apply(current => createRfi(current, input, CURRENT_USER), "Contractor review saved as an internal RFI draft. Nothing was emailed.");
    if (ok) {
      setRfiDraft(null);
      setSelectedIssueIds([]);
      setTab("RFI log");
    }
  }

  const rfiIssueNames = useMemo(() => new Map(state.issues.map(issue => [issue.id, `${issue.number} · ${issue.title}`])), [state.issues]);

  return <div className="rfi-view">
    <PageHeader eyebrow={`${projectName} / Quality & coordination`} title="Structor Check & RFIs" description="Review document issues, package approved questions for the architect, and return answers to the affected subcontractors." actions={<><Button onClick={() => setNotificationsOpen(true)}><Bell size={16}/>{unread.length ? `${unread.length} unread` : "Notifications"}</Button><Button variant="primary" onClick={newIssue}><Plus size={16}/>Add issue</Button></>}/>
    <PreviewNote>Demo workflow · Sending and sharing are recorded in this browser. No email is sent.</PreviewNote>
    <Stats items={[
      { label: "Awaiting contractor review", value: summary.pendingReview, detail: "AI and subcontractor issues", tone: summary.pendingReview ? "orange" : "green" },
      { label: "Reviewed open issues", value: summary.open, detail: `${summary.openHigh} high severity` },
      { label: "RFI approval", value: summary.awaitingApproval + summary.readyToSend, detail: `${summary.awaitingApproval} draft · ${summary.readyToSend} ready to send` },
      { label: "Awaiting architect", value: summary.awaitingResponse, detail: `${summary.overdue} overdue` },
      { label: "Answers to share", value: summary.answeredNotShared, detail: "Ready for affected bidders", tone: summary.answeredNotShared ? "orange" : "green" },
    ]}/>
    <Tabs tabs={["Issue review", "RFI log", "Subcontractor view"]} value={tab} onChange={setTab}/>

    {tab === "Issue review" && <div className="rfi-issue-layout">
      <Panel title="Contractor review queue" subtitle="AI, team, subcontractor, and email questions stay here until the contractor decides what happens next." action={<ExportButton onClick={() => exportRows("structor-check-issues.csv", [["Issue", "Title", "Category", "Severity", "Trade", "Origin", "Raised by", "Source", "Cross-reference", "Status", "RFI"], ...state.issues.map(issue => [issue.number, issue.title, issue.category, issue.severity, issue.trade, originLabel[issue.origin], issue.raisedBy, issue.source, issue.crossReference, statusLabel[issue.status], state.rfis.find(rfi => rfi.id === issue.rfiId)?.number ?? ""])])}/> }>
        <div className="rfi-filters"><SearchBox value={query} onChange={setQuery} placeholder="Search issues and references…"/><select aria-label="Filter by trade" value={trade} onChange={event => setTrade(event.target.value)}><option value="">All trades</option>{issueTrades(state).map(item => <option key={item}>{item}</option>)}</select><select aria-label="Filter by severity" value={severity} onChange={event => setSeverity(event.target.value)}><option value="">All severities</option>{severities.map(item => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(item => <option value={item} key={item}>{statusLabel[item]}</option>)}</select><select aria-label="Filter by origin" value={origin} onChange={event => setOrigin(event.target.value)}><option value="">All origins</option>{origins.map(item => <option value={item} key={item}>{originLabel[item]}</option>)}</select></div>
        {selectedIssueIds.length > 0 && <div className="rfi-selection-bar"><span><CheckCircle2 size={16}/><strong>{selectedIssueIds.length}</strong> open issue{selectedIssueIds.length === 1 ? "" : "s"} reviewed for packaging</span><Button variant="primary" onClick={() => openRfiEditor(selectedIssueIds)}><FileQuestion size={15}/>Package into RFI draft</Button></div>}
        <div className="ui-table-wrap"><table className="ui-table rfi-issue-table"><thead><tr><th><span className="sr-only">Select</span></th><th>Issue</th><th>Severity</th><th>Trade / source</th><th>Origin</th><th>Status</th><th></th></tr></thead><tbody>{visible.map(issue => <tr key={issue.id} className={issue.id === selectedIssue?.id ? "selected" : ""}><td><input type="checkbox" aria-label={`Select ${issue.number} for an RFI`} disabled={issue.status !== "open"} checked={selectedIssueIds.includes(issue.id)} onChange={event => setSelectedIssueIds(ids => event.target.checked ? [...ids, issue.id] : ids.filter(id => id !== issue.id))}/></td><td><button className="rfi-row-title" onClick={() => setSelectedIssueId(issue.id)}><strong>{issue.number} · {issue.title}</strong><small>{issue.category}</small></button></td><td><Badge tone={issue.severity === "high" ? "red" : issue.severity === "medium" ? "orange" : "neutral"}>{issue.severity}</Badge></td><td><span className="rfi-cell-stack"><strong>{issue.trade || "Unassigned"}</strong><small>{issue.source || "No source reference"}</small></span></td><td><span className={`rfi-origin ${issue.origin}`}>{originLabel[issue.origin]}</span></td><td><Badge tone={statusTone(issue.status)}>{statusLabel[issue.status]}</Badge></td><td><button className="ui-icon-btn" aria-label={`Open ${issue.number}`} onClick={() => setSelectedIssueId(issue.id)}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div>
        {!visible.length && <Empty title="No issues match these filters" description="Clear a filter or add a coordination issue." action={<Button onClick={newIssue}>Add issue</Button>}/>}
      </Panel>

      <div className="rfi-detail-column">{selectedIssue ? <Panel title={selectedIssue.number} subtitle={`${selectedIssue.category} · Raised by ${selectedIssue.raisedBy}`} action={<Badge tone={statusTone(selectedIssue.status)}>{statusLabel[selectedIssue.status]}</Badge>}>
        <div className="rfi-detail"><div className="rfi-detail-heading"><span className={`rfi-severity-mark ${selectedIssue.severity}`}><AlertTriangle size={19}/></span><div><h2>{selectedIssue.title}</h2><p>{selectedIssue.detail || "No additional description was recorded."}</p></div></div>
          <dl><div><dt>Origin</dt><dd>{originLabel[selectedIssue.origin]}</dd></div><div><dt>Trade</dt><dd>{selectedIssue.trade || "Not assigned"}</dd></div><div><dt>Source</dt><dd>{selectedIssue.source || "Not recorded"}</dd></div><div><dt>Cross-reference</dt><dd>{selectedIssue.crossReference || "Not recorded"}</dd></div><div><dt>Contractor review</dt><dd>{selectedIssue.reviewedBy ? `${selectedIssue.reviewedBy} · ${prettyDateTime(selectedIssue.reviewedAt)}` : "Waiting for review"}</dd></div><div><dt>Package</dt><dd>{procurement.packages.find(pkg => pkg.id === selectedIssue.packageId)?.name ?? "Not linked"}</dd></div></dl>
          {selectedIssue.rfiId && <button className="rfi-linked-card" onClick={() => { setSelectedRfiId(selectedIssue.rfiId!); setTab("RFI log"); }}><FileQuestion size={18}/><span><strong>{state.rfis.find(item => item.id === selectedIssue.rfiId)?.number ?? "Linked RFI"}</strong><small>Open the contractor-reviewed RFI</small></span><ChevronRight size={16}/></button>}
          {selectedIssue.combinedInto && <button className="rfi-linked-card" onClick={() => setSelectedIssueId(selectedIssue.combinedInto!)}><Share2 size={18}/><span><strong>Combined into {state.issues.find(item => item.id === selectedIssue.combinedInto)?.number ?? "another issue"}</strong><small>Open the reviewed issue that now carries this question</small></span><ChevronRight size={16}/></button>}
          {selectedIssue.resolution && <div className="rfi-answer-card"><CheckCircle2 size={18}/><div><strong>{selectedIssue.status === "dismissed" ? "Dismissal note" : "Resolution"}</strong><p>{selectedIssue.resolution.note}</p><small>{selectedIssue.resolution.by} · {prettyDateTime(selectedIssue.resolution.at)}</small></div></div>}
          <div className="rfi-detail-actions">{selectedIssue.status === "pending-review" ? <><Button onClick={() => editIssueDraft(selectedIssue)}><Pencil size={14}/>Edit before approval</Button><Button variant="primary" onClick={() => apply(current => approveIssue(current, selectedIssue.id, CURRENT_USER), `${selectedIssue.number} approved into the reviewed issue log.`)}><ShieldCheck size={14}/>Approve issue</Button><Button onClick={() => setCloseDraft({ issue: selectedIssue, outcome: "resolved", note: "" })}><Check size={14}/>Answer directly</Button><Button onClick={() => setCloseDraft({ issue: selectedIssue, outcome: "dismissed", note: "" })}><XCircle size={14}/>Dismiss</Button></> : selectedIssue.status === "open" ? <><Button onClick={() => editIssueDraft(selectedIssue)}><Pencil size={14}/>Edit</Button><Button onClick={() => openRfiEditor([selectedIssue.id])}><FileQuestion size={14}/>Package in RFI</Button>{combineCandidates.length > 0 && <Button onClick={() => { setErrors({}); setCombineDraft({ keep: selectedIssue, otherIds: [] }); }}><Share2 size={14}/>Combine duplicates</Button>}<Button variant="primary" onClick={() => setCloseDraft({ issue: selectedIssue, outcome: "resolved", note: "" })}><Check size={14}/>Resolve</Button><Button onClick={() => setCloseDraft({ issue: selectedIssue, outcome: "dismissed", note: "" })}><XCircle size={14}/>Dismiss</Button></> : selectedIssue.status !== "in-rfi" ? <Button onClick={() => apply(current => reopenIssue(current, selectedIssue.id), "Issue reopened in the reviewed issue log.")}><RotateCcw size={14}/>Reopen</Button> : null}</div>
        </div>
      </Panel> : <Panel><Empty title="No issue selected" description="Choose an issue from the contractor review queue."/></Panel>}</div>
    </div>}

    {tab === "RFI log" && <div className="rfi-log-layout">
      <Panel title="RFI register" subtitle="Drafts are internal. Sent RFIs appear in Marcel’s formal log." action={<ExportButton onClick={() => exportRows("rfi-register.csv", [["RFI", "Discipline", "Question", "Submitted by", "Date submitted", "Response", "Response date", "Status"], ...log.map(row => [row.number, row.discipline, row.question, row.submittedBy, row.dateSubmitted, row.response, row.responseDate, row.status])])}/> }>
        <div className="rfi-log-list">{state.rfis.slice().reverse().map(rfi => <button key={rfi.id} className={rfi.id === selectedRfi?.id ? "selected" : ""} onClick={() => setSelectedRfiId(rfi.id)}><span className={`rfi-log-icon ${rfi.status}`}><FileQuestion size={18}/></span><span><strong>{rfi.number} · {rfi.subject}</strong><small>{rfi.discipline || "No discipline"} · {rfi.issueIds.length} source issue{rfi.issueIds.length === 1 ? "" : "s"}</small></span><Badge tone={rfiTone(rfi.status)}>{rfi.status}</Badge><ChevronRight size={16}/></button>)}</div>
        {!state.rfis.length && <Empty title="No RFIs yet" description="Review an open issue and package it into an internal draft first." action={<Button onClick={() => setTab("Issue review")}>Review issues</Button>}/>}
      </Panel>
      <div className="rfi-detail-column">{selectedRfi && <Panel title={selectedRfi.number} subtitle={`${selectedRfi.discipline || "No discipline"} · ${selectedRfi.issueIds.length} issue${selectedRfi.issueIds.length === 1 ? "" : "s"}`} action={<Badge tone={rfiTone(selectedRfi.status)}>{selectedRfi.status}</Badge>}>
        <div className="rfi-detail"><div className="rfi-rfi-header"><h2>{selectedRfi.subject}</h2><p>{selectedRfi.question}</p></div>
          <LinkedProjectContent kind="rfi" recordId={selectedRfi.id}/><div className="rfi-route"><span><UserRoundCheck size={17}/><small>To</small><strong>{selectedRfi.to.name || "Not assigned"}</strong><em>{selectedRfi.to.company || "Design team"}</em></span><span><Mail size={17}/><small>Email</small><strong>{selectedRfi.to.email || "Required before send"}</strong></span><span><CircleHelp size={17}/><small>Answer due</small><strong>{selectedRfi.due ? displayDate(selectedRfi.due) : "Not set"}</strong></span></div>
          <div className="rfi-source-issues"><h3>Packaged source issues</h3>{selectedRfi.issueIds.map(id => <button key={id} onClick={() => { setSelectedIssueId(id); setTab("Issue review"); }}><span>{rfiIssueNames.get(id) ?? id}</span><ChevronRight size={14}/></button>)}</div>
          {selectedRfi.approvedAt && <div className="rfi-event approved"><ShieldCheck size={16}/><span><strong>Approved by the contractor</strong><small>{selectedRfi.approvedBy} · {prettyDateTime(selectedRfi.approvedAt)}</small></span></div>}
          {selectedRfi.sentAt && <div className="rfi-event"><Send size={16}/><span><strong>Recorded as sent to the architect</strong><small>{selectedRfi.sentBy} · {prettyDateTime(selectedRfi.sentAt)}</small></span></div>}
          {selectedRfi.response && <div className="rfi-answer-card"><MessageSquareQuote size={18}/><div><strong>Design-team response</strong><p>{selectedRfi.response.text}</p><small>{selectedRfi.response.by} · {prettyDateTime(selectedRfi.response.at)}</small></div></div>}
          {selectedRfi.shares.length > 0 && <div className="rfi-event shared"><Share2 size={16}/><span><strong>Answer shared with {selectedRfi.shares.length} subcontractor{selectedRfi.shares.length === 1 ? "" : "s"}</strong><small>Recorded notifications only</small></span></div>}
          <div className="rfi-detail-actions">{selectedRfi.status === "draft" && <><Button onClick={() => openRfiEditor(selectedRfi.issueIds, selectedRfi)}><Pencil size={14}/>Edit draft</Button><Button onClick={() => { if (apply(current => discardRfi(current, selectedRfi.id), `${selectedRfi.number} discarded; its issues returned to review.`)) setSelectedRfiId(""); }}><Trash2 size={14}/>Discard</Button><Button variant="primary" onClick={() => apply(current => approveRfi(current, selectedRfi.id, CURRENT_USER), `${selectedRfi.number} approved by the contractor and ready to send.`)}><ShieldCheck size={14}/>Approve RFI</Button></>}{selectedRfi.status === "approved" && <><Button onClick={() => openRfiEditor(selectedRfi.issueIds, selectedRfi)}><Pencil size={14}/>Edit and reapprove</Button><Button onClick={() => { if (apply(current => discardRfi(current, selectedRfi.id), `${selectedRfi.number} discarded; its issues returned to review.`)) setSelectedRfiId(""); }}><Trash2 size={14}/>Discard</Button><Button variant="primary" onClick={() => setSendDraft(selectedRfi)}><Send size={14}/>Record send</Button></>}{selectedRfi.status === "sent" && <Button variant="primary" onClick={() => setResponseDraft({ rfi: selectedRfi, text: "", by: selectedRfi.to.name })}><MessageSquareQuote size={14}/>Record response</Button>}{selectedRfi.status === "answered" && <><Button onClick={() => apply(current => shareRfiResponse(current, procurement, selectedRfi.id), "Architect’s answer shared with the affected subcontractors. Notifications were recorded; no email was sent.")}><Share2 size={14}/>Share with subcontractors</Button><Button variant="primary" onClick={() => apply(current => closeRfi(current, selectedRfi.id, CURRENT_USER), `${selectedRfi.number} closed and its issues resolved.`)}><Check size={14}/>Close RFI</Button></>}{selectedRfi.status === "closed" && selectedRfi.shares.length === 0 && <Button onClick={() => apply(current => shareRfiResponse(current, procurement, selectedRfi.id), "Answer shared with the affected subcontractors. Notifications were recorded; no email was sent.")}><Share2 size={14}/>Share answer</Button>}</div>
        </div>
      </Panel>}</div>
    </div>}

    {tab === "Subcontractor view" && <div className="rfi-portal-grid">
      <Panel title="Acting as invited company" subtitle="One-browser demo of the subcontractor RFI experience.">
        {procurement.invitations.length ? <><label className="ui-field">Invitation<select value={selectedInvitation?.id ?? ""} onChange={event => setInvitationId(event.target.value)}>{procurement.invitations.map(invitation => { const bidder = bidders.find(item => item.id === invitation.bidderId); const pkg = procurement.packages.find(item => item.id === invitation.packageId); return <option value={invitation.id} key={invitation.id}>{bidder?.company ?? invitation.bidderId} · {pkg?.name ?? invitation.packageId}</option>; })}</select></label><div className="rfi-acting-card"><span>{selectedBidder?.company.slice(0, 2).toUpperCase() ?? "CO"}</span><div><strong>{selectedBidder?.company ?? selectedInvitation?.bidderId}</strong><small>{packageName} · {selectedInvitation?.status}</small></div><Badge tone={selectedInvitation?.status === "declined" ? "neutral" : "green"}>{selectedInvitation?.status === "declined" ? "Cannot ask" : "Active invitation"}</Badge></div>{selectedInvitation?.status === "declined" ? <div className="rfi-review-gate"><XCircle size={20}/><div><strong>This company declined the invitation</strong><p>Only an active invitation can raise a project question.</p></div></div> : <Button variant="primary" onClick={() => { setErrors({}); setPortalQuestion({ title: "", detail: "", source: "" }); }}><Plus size={15}/>Ask contractor a question</Button>}</> : <Empty title="No invitations" description="Invite a subcontractor from Bid packages before using this portal view."/>}
      </Panel>
      <Panel title="My questions" subtitle="Questions wait for contractor review before becoming architect RFIs.">
        <div className="rfi-portal-list">{portal.questions.map(({ issue, current, rfi }) => <article key={issue.id}><span className={`rfi-log-icon ${issue.status}`}><CircleHelp size={17}/></span><div><strong>{issue.number} · {issue.title}</strong><p>{issue.detail || "No additional detail."}</p><small>{rfi ? `${rfi.number} · ${rfi.status}` : current.id !== issue.id ? `Combined into ${current.number}` : statusLabel[issue.status]} · Asked {displayDate(issue.createdAt.slice(0, 10))}</small>{issue.resolution && <div className="rfi-portal-answer"><CheckCircle2 size={14}/>{issue.resolution.note}</div>}</div></article>)}</div>{!portal.questions.length && <Empty title="No questions from this company" description="A submitted question will enter the contractor’s shared review queue."/>}
      </Panel>
      <Panel title="Shared design-team answers" subtitle="Only answers released by the contractor appear here." className="rfi-portal-answers">
        <div className="rfi-portal-list">{portal.shared.map(rfi => <article key={rfi.id}><span className="rfi-log-icon answered"><MessageSquareQuote size={17}/></span><div><strong>{rfi.number} · {rfi.subject}</strong><p>{rfi.response?.text}</p><small>{rfi.response?.by} · {prettyDateTime(rfi.response?.at ?? null)}</small></div></article>)}</div>{!portal.shared.length && <Empty title="No answers shared yet" description="Architect responses appear after the contractor reviews and releases them."/>}
      </Panel>
    </div>}

    {issueDraft && <IssueEditor value={issueDraft} packages={procurement.packages} errors={errors} onChange={setIssueDraft} onClose={() => setIssueDraft(null)} onSave={saveIssue}/>}
    {rfiDraft && <RfiEditor value={rfiDraft} issues={availableRfiIssues} errors={errors} onChange={setRfiDraft} onClose={() => setRfiDraft(null)} onSave={saveRfi}/>}
    {combineDraft && <Modal title="Combine duplicate issues" subtitle={`Keep ${combineDraft.keep.number} as the primary reviewed issue.`} onClose={() => setCombineDraft(null)}><div className="rfi-review-gate"><Share2 size={20}/><div><strong>One coordinated question</strong><p>The selected issues will point to {combineDraft.keep.number}. Their details and references will be added to the primary issue, and every subcontractor who asked will still receive the answer.</p></div></div><fieldset className="rfi-issue-picker"><legend>Reviewed issues to combine</legend>{state.issues.filter(issue => issue.status === "open" && issue.id !== combineDraft.keep.id).map(issue => <label key={issue.id}><input type="checkbox" checked={combineDraft.otherIds.includes(issue.id)} onChange={event => setCombineDraft({ ...combineDraft, otherIds: event.target.checked ? [...combineDraft.otherIds, issue.id] : combineDraft.otherIds.filter(id => id !== issue.id) })}/><span><strong>{issue.number} · {issue.title}</strong><small>{issue.trade || "No trade"} · {originLabel[issue.origin]}</small></span></label>)}</fieldset><FieldError>{errors.issueIds}</FieldError><div className="rfi-form-actions"><Button onClick={() => setCombineDraft(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (apply(current => combineIssues(current, combineDraft.keep.id, combineDraft.otherIds, CURRENT_USER), `${combineDraft.otherIds.length} duplicate issue${combineDraft.otherIds.length === 1 ? "" : "s"} combined into ${combineDraft.keep.number}.`)) setCombineDraft(null); }}>Combine issues</Button></div></Modal>}
    {closeDraft && <Modal title={closeDraft.outcome === "resolved" ? "Resolve issue" : "Dismiss issue"} subtitle={`${closeDraft.issue.number} · ${closeDraft.issue.title}`} onClose={() => setCloseDraft(null)}><label className="ui-field">{closeDraft.outcome === "resolved" ? "Contractor answer" : "Reason for dismissal"}<textarea autoFocus rows={4} value={closeDraft.note} onChange={event => setCloseDraft({ ...closeDraft, note: event.target.value })}/><FieldError>{errors.note}</FieldError></label><div className="rfi-form-actions"><Button onClick={() => setCloseDraft(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (apply(current => closeIssue(current, closeDraft.issue.id, closeDraft.outcome, closeDraft.note, CURRENT_USER), closeDraft.outcome === "resolved" ? "Issue resolved. The originating subcontractor was notified when applicable." : "Issue dismissed with an audit note.")) setCloseDraft(null); }}>{closeDraft.outcome === "resolved" ? "Resolve issue" : "Dismiss issue"}</Button></div></Modal>}
    {sendDraft && <Modal title={`Send ${sendDraft.number} to the architect?`} subtitle="Approved RFI · final send record" onClose={() => setSendDraft(null)}><div className="rfi-review-gate"><ShieldCheck size={20}/><div><strong>Contractor approval recorded</strong><p>{sendDraft.approvedBy} approved this RFI {sendDraft.approvedAt ? `on ${prettyDateTime(sendDraft.approvedAt)}` : ""}. Structor will record the send to {sendDraft.to.name || "the design team"}; this demo does not deliver an email.</p></div></div><div className="rfi-send-summary"><strong>{sendDraft.subject}</strong><span>{sendDraft.issueIds.length} reviewed source issue{sendDraft.issueIds.length === 1 ? "" : "s"}</span><span>{sendDraft.to.email || "No design-team email"}</span></div><FieldError>{errors.email}</FieldError><div className="rfi-form-actions"><Button onClick={() => setSendDraft(null)}>Keep approved</Button><Button variant="primary" onClick={() => { if (apply(current => sendRfi(current, sendDraft.id, CURRENT_USER), `${sendDraft.number} recorded as sent to the architect. No email was sent.`)) setSendDraft(null); }}><Send size={15}/>Record send</Button></div></Modal>}
    {responseDraft && <Modal title={`Record response to ${responseDraft.rfi.number}`} subtitle="Add the architect’s answer to the shared RFI log." onClose={() => setResponseDraft(null)}><label className="ui-field">Response<textarea autoFocus rows={5} value={responseDraft.text} onChange={event => setResponseDraft({ ...responseDraft, text: event.target.value })}/><FieldError>{errors.response}</FieldError></label><label className="ui-field">Answered by<input value={responseDraft.by} onChange={event => setResponseDraft({ ...responseDraft, by: event.target.value })}/></label><div className="rfi-form-actions"><Button onClick={() => setResponseDraft(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (apply(current => recordRfiResponse(current, procurement, responseDraft.rfi.id, { text: responseDraft.text, by: responseDraft.by }), "Design-team response recorded. Package owners were notified.")) setResponseDraft(null); }}>Save response</Button></div></Modal>}
    {portalQuestion && selectedInvitation && <Modal title={`Ask about ${packageName}`} subtitle={`Acting as ${selectedBidder?.company ?? selectedInvitation.bidderId}`} onClose={() => setPortalQuestion(null)}><div className="rfi-review-gate"><Inbox size={20}/><div><strong>Sent to the contractor first</strong><p>This question enters Structor Check for contractor review. It is not sent directly to the architect.</p></div></div><label className="ui-field">Question<input autoFocus value={portalQuestion.title} onChange={event => setPortalQuestion({ ...portalQuestion, title: event.target.value })}/><FieldError>{errors.title}</FieldError></label><label className="ui-field">Detail<textarea rows={4} value={portalQuestion.detail} onChange={event => setPortalQuestion({ ...portalQuestion, detail: event.target.value })}/></label><label className="ui-field">Drawing or specification reference<input value={portalQuestion.source} onChange={event => setPortalQuestion({ ...portalQuestion, source: event.target.value })} placeholder="A-101 · Detail 3"/></label><div className="rfi-form-actions"><Button onClick={() => setPortalQuestion(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (apply(current => raiseSubcontractorQuestion(current, procurement, { invitationId: selectedInvitation.id, company: selectedBidder?.company ?? selectedInvitation.bidderId, title: portalQuestion.title, detail: portalQuestion.detail, source: portalQuestion.source }), "Question submitted to the contractor review queue.")) setPortalQuestion(null); }}>Submit question</Button></div></Modal>}
    {notificationsOpen && <Modal title="Structor Check notifications" subtitle={`${unread.length} unread recorded event${unread.length === 1 ? "" : "s"}`} onClose={() => setNotificationsOpen(false)}><div className="rfi-notifications">{unread.map(item => <article key={item.id}><span><Bell size={15}/></span><div><strong>{item.text}</strong><small>{item.recipientType} · {item.recipient} · {prettyDateTime(item.at)}</small></div></article>)}</div>{!unread.length && <Empty title="No unread notifications" description="RFI sends, responses, and shared answers are recorded here."/>}<div className="rfi-form-actions"><Button onClick={() => setNotificationsOpen(false)}>Close</Button>{unread.length > 0 && <Button variant="primary" onClick={() => { apply(current => markRfiNotificationsRead(current, unread.map(item => item.id)), "Notifications marked read."); setNotificationsOpen(false); }}>Mark all read</Button>}</div></Modal>}
  </div>;
}
