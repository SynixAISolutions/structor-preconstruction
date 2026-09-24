"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  FileText,
  History,
  Mail,
  MessageSquareText,
  MoveRight,
  Pencil,
  Phone,
  Plus,
  Send,
  Share2,
  UserPlus,
} from "lucide-react";
import {
  addScope,
  applyScopeToAllTrades,
  approveScope,
  bidForm,
  editScope,
  inviteBidder,
  inviteCandidates,
  logOutreach,
  markNotificationsRead,
  moveScope,
  outreachLog,
  packageStatus,
  publishBlockers,
  publishPackage,
  reopenScope,
  setInvitationStatus,
  unreadFor,
  type Invitation,
  type InvitationStatus,
  type OutreachKind,
  type PackageStatus,
  type Procurement,
  type ScopeItem,
  type ScopeOrigin,
} from "../../lib/procurement";
import { useProcurement } from "../../lib/use-procurement";
import { useLocalDraft } from "../../lib/use-local-draft";
import { initialBidders, type Bidder } from "../../lib/data/commercial";
import { displayDate } from "../../lib/format";
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
import "./procurement.css";

const CURRENT_USER = "Marcel Khoury";

type ScopeDraft = Pick<ScopeItem, "title" | "detail" | "source" | "origin"> & { id?: string; packageId: string };
type OutreachTarget = { packageId: string; bidderId: string };

const statusLabels: Record<PackageStatus, string> = { draft: "Draft", ready: "Ready", published: "Published", revised: "Revised" };
const statusTone = (status: PackageStatus) => status === "published" ? "green" : status === "ready" ? "blue" : status === "revised" ? "orange" : "amber";
const invitationTone = (status: InvitationStatus) => status === "submitted" ? "green" : status === "declined" ? "neutral" : status === "bidding" ? "blue" : "amber";
const eventTime = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function runAndNotify(run: ReturnType<typeof useProcurement>["run"], action: (state: Procurement) => Procurement, notify: ViewProps["notify"], success: string) {
  const message = run(action);
  notify(message ?? success);
  return !message;
}

function ScopeEditor({ draft, packages, onClose, onSave }: {
  draft: ScopeDraft;
  packages: Procurement["packages"];
  onClose: () => void;
  onSave: (draft: ScopeDraft) => void;
}) {
  const [value, setValue] = useState(draft);
  return <Modal title={draft.id ? "Edit scope item" : "Add scope item"} subtitle="Every change returns an approved item to draft for review." onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave(value); }}>
      <label className="ui-field">Trade package<select value={value.packageId} onChange={event => setValue({ ...value, packageId: event.target.value })}>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
      <label className="ui-field">Scope description<textarea required rows={3} value={value.title} onChange={event => setValue({ ...value, title: event.target.value })}/></label>
      <label className="ui-field">Source reference<input value={value.source} onChange={event => setValue({ ...value, source: event.target.value })} placeholder="e.g. A-101 · Note 04"/></label>
      <label className="ui-field">Detail and coordination notes<textarea rows={4} value={value.detail} onChange={event => setValue({ ...value, detail: event.target.value })}/></label>
      <label className="ui-field">Origin<select value={value.origin} onChange={event => setValue({ ...value, origin: event.target.value as ScopeOrigin })}><option value="estimator">Estimator</option><option value="drawing">Drawing</option><option value="specification">Specification</option><option value="ai">AI draft</option></select></label>
      <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save scope item</Button></div>
    </form>
  </Modal>;
}

function historyLabel(event: ScopeItem["history"][number], packages: Procurement["packages"]) {
  if (event.kind === "moved") return `Moved from ${packages.find(pkg => pkg.id === event.from)?.name ?? event.from} to ${packages.find(pkg => pkg.id === event.to)?.name ?? event.to}`;
  if (event.kind === "applied-to-all") return "Applied to every trade";
  return event.kind === "created" ? "Created" : event.kind === "approved" ? "Approved" : event.kind === "reopened" ? "Reopened for review" : "Edited";
}

export function ProcurementScopesView({ projectName, notify, navigate }: ViewProps) {
  const { state, run } = useProcurement();
  const [packageId, setPackageId] = useState("demolition");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<ScopeDraft | null>(null);
  const [moveItem, setMoveItem] = useState<ScopeItem | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const activePackage = state.packages.find(pkg => pkg.id === packageId) ?? state.packages[0];
  const form = activePackage ? bidForm(state, activePackage.id) : [];
  const visible = form.filter(item => `${item.title} ${item.detail} ${item.source}`.toLowerCase().includes(query.toLowerCase()));
  const selected = form.find(item => item.id === selectedId) ?? form[0];
  const blockers = activePackage ? publishBlockers(state, activePackage.id) : [];
  const packageState = activePackage ? packageStatus(state, activePackage.id) : "draft";
  const unread = unreadFor(state, CURRENT_USER);

  function saveScope(draft: ScopeDraft) {
    const ok = draft.id
      ? runAndNotify(run, current => editScope(current, draft.id!, { title: draft.title, detail: draft.detail, source: draft.source }, CURRENT_USER), notify, "Scope item saved and returned to review.")
      : runAndNotify(run, current => addScope(current, { packageId: draft.packageId, title: draft.title, detail: draft.detail, source: draft.source, origin: draft.origin }, CURRENT_USER), notify, "Scope item added for review.");
    if (ok) setEditor(null);
  }

  function approveAll() {
    const drafts = form.filter(item => item.status === "draft");
    for (const item of drafts) {
      const message = run(current => approveScope(current, item.id, CURRENT_USER));
      if (message) { notify(message); return; }
    }
    notify(drafts.length ? `${drafts.length} scope item${drafts.length === 1 ? "" : "s"} approved.` : "Every item is already approved.");
  }

  if (!activePackage) return <div className="proc-view"><PageHeader eyebrow={`${projectName} / Project intelligence`} title="Scopes & bid forms" description="Review scope requirements before they reach subcontractors."/><Empty title="No bid packages yet" description="Trade packages will appear here after they are added to this project."/></div>;

  return <div className="proc-view">
    <PageHeader eyebrow={`${projectName} / Project intelligence`} title="Scopes & bid forms" description="Review each requirement, correct its trade, and publish one clear bid form." actions={<><ExportButton onClick={() => exportRows("scope-and-bid-forms.csv", [["Package", "CSI section", "Scope", "Detail", "Source", "Origin", "Status", "All trades"], ...state.scopes.map(item => { const pkg = state.packages.find(candidate => candidate.id === item.packageId); return [pkg?.name ?? item.packageId, pkg?.code ?? "", item.title, item.detail, item.source, item.origin, item.status, item.allTrades ? "Yes" : "No"]; })])}/>{unread.length > 0 && <Button onClick={() => setNotificationsOpen(true)}><Bell size={15}/>{unread.length} notification{unread.length === 1 ? "" : "s"}</Button>}<Button variant="primary" onClick={() => setEditor({ packageId: activePackage.id, title: "", detail: "", source: "", origin: "estimator" })}><Plus size={16}/>Add scope item</Button></>}/>
    <Stats items={[{ label: "Trade packages", value: state.packages.length, detail: "One bid form per trade" }, { label: "Scope items", value: state.scopes.length, detail: "Project requirements" }, { label: "Approved", value: state.scopes.filter(item => item.status === "approved").length, detail: "Reviewed by an estimator", tone: "green" }, { label: "Published", value: state.packages.filter(pkg => packageStatus(state, pkg.id) === "published").length, detail: "Current with bidders" }]}/>
    <div className="proc-scope-layout">
      <aside className="ui-panel proc-trades"><div className="proc-aside-title">TRADE PACKAGES</div>{state.packages.map(pkg => { const items = bidForm(state, pkg.id); const status = packageStatus(state, pkg.id); return <button className={pkg.id === activePackage.id ? "active" : ""} key={pkg.id} onClick={() => { setPackageId(pkg.id); setSelectedId(""); }}><span className="proc-division">{pkg.division}</span><span><strong>{pkg.name}</strong><small>{items.filter(item => item.status === "approved").length}/{items.length} approved</small></span><Badge tone={statusTone(status)}>{statusLabels[status]}</Badge></button>; })}<button className="proc-aside-link" onClick={() => navigate("packages")}>Manage bidders<ArrowRight size={14}/></button></aside>
      <Panel title={activePackage.name} subtitle={`${activePackage.code} · Owner: ${activePackage.owner} · Due ${displayDate(activePackage.due)}`} action={<Badge tone={statusTone(packageState)}>{statusLabels[packageState]}{activePackage.published ? ` · v${activePackage.published.version}` : ""}</Badge>} className="proc-scope-panel">
        <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search this bid form…"/><Button onClick={approveAll}><CheckCheck size={15}/>Approve visible form</Button></div>
        <div className="proc-scope-list">{visible.map((item, index) => <article className={`proc-scope-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id}>
          <button className={`proc-approval ${item.status}`} aria-label={`${item.status === "approved" ? "Reopen" : "Approve"} ${item.title}`} onClick={() => runAndNotify(run, current => item.status === "approved" ? reopenScope(current, item.id, CURRENT_USER) : approveScope(current, item.id, CURRENT_USER), notify, item.status === "approved" ? "Scope item reopened for review." : "Scope item approved.")}>{item.status === "approved" ? <Check size={14}/> : <span/>}</button>
          <button className="proc-scope-copy" onClick={() => setSelectedId(item.id)}><span className="proc-scope-meta"><b>{String(index + 1).padStart(2, "0")}</b><Badge tone={item.status === "approved" ? "green" : "amber"}>{item.status === "approved" ? "Approved" : "Needs review"}</Badge>{item.allTrades && <Badge tone="blue">All trades</Badge>}</span><strong>{item.title}</strong><small><FileText size={12}/>{item.source || "Source not linked"} · {item.origin}</small></button>
          <button className="ui-icon-btn" aria-label={`Edit ${item.title}`} onClick={() => setEditor({ id: item.id, packageId: item.packageId, title: item.title, detail: item.detail, source: item.source, origin: item.origin })}><Pencil size={15}/></button>
        </article>)}</div>
        {!visible.length && <Empty title="No scope items found" description="Add a requirement or adjust your search."/>}
        <div className="proc-publish-bar"><div><strong>{form.filter(item => item.status === "approved").length} of {form.length} approved</strong>{blockers.map(reason => <span key={reason}>{reason}</span>)}</div><Button variant="primary" disabled={blockers.length > 0} onClick={() => runAndNotify(run, current => publishPackage(current, activePackage.id, CURRENT_USER), notify, activePackage.published ? "Revised bid form published to invited bidders." : "Bid form published to invited bidders.")}><Send size={15}/>{activePackage.published ? "Publish revision" : "Publish to subcontractors"}</Button></div>
      </Panel>
      <div className="proc-detail-column">{selected ? <Panel title="Requirement detail" action={<Badge>{selected.origin}</Badge>}><div className="proc-detail">
        <span className="proc-label">SOURCE REFERENCE</span><strong>{selected.source || "No source linked"}</strong><p>{selected.detail || "No coordination notes recorded."}</p>
        <div className="proc-detail-actions"><Button onClick={() => { setMoveItem(selected); setMoveTo(state.packages.find(pkg => pkg.id !== selected.packageId)?.id ?? ""); }}><MoveRight size={14}/>{selected.allTrades ? "Assign to one trade" : "Move trade"}</Button>{!selected.allTrades && <Button onClick={() => runAndNotify(run, current => applyScopeToAllTrades(current, selected.id, CURRENT_USER), notify, "Scope item applied to every trade for review.")}><Share2 size={14}/>Apply to all trades</Button>}</div>
        <div className="proc-history"><span className="proc-label"><History size={12}/>HISTORY</span>{selected.history.slice().reverse().map((event, index) => <div key={`${event.at}-${index}`}><i/><span><strong>{historyLabel(event, state.packages)}</strong><small>{event.by} · {eventTime(event.at)}</small></span></div>)}</div>
      </div></Panel> : <Panel><Empty title="Select a scope item" description="Choose an item to see its source, notes, and history."/></Panel>}</div>
    </div>
    <PreviewNote>The scope checklist is the bidder’s bid form. Only approved items can be published.</PreviewNote>
    {editor && <ScopeEditor draft={editor} packages={state.packages} onClose={() => setEditor(null)} onSave={saveScope}/>} 
    {moveItem && <Modal title={moveItem.allTrades ? "Assign to one trade" : "Move scope item"} subtitle={moveItem.title} onClose={() => setMoveItem(null)}><label className="ui-field">Destination trade<select value={moveTo} onChange={event => setMoveTo(event.target.value)}>{state.packages.filter(pkg => pkg.id !== moveItem.packageId || moveItem.allTrades).map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.code} · {pkg.name} · {pkg.owner}</option>)}</select></label><p className="proc-modal-note">The item returns to draft and the receiving estimator is tagged for review.</p><div className="proc-form-actions"><Button onClick={() => setMoveItem(null)}>Cancel</Button><Button variant="primary" disabled={!moveTo} onClick={() => { if (runAndNotify(run, current => moveScope(current, moveItem.id, moveTo, CURRENT_USER), notify, "Scope item moved and the receiving estimator was tagged.")) { setPackageId(moveTo); setSelectedId(moveItem.id); setMoveItem(null); } }}><MoveRight size={15}/>Move item</Button></div></Modal>}
    {notificationsOpen && <Modal title="Your notifications" subtitle={`${unread.length} unread for ${CURRENT_USER}`} onClose={() => setNotificationsOpen(false)}><div className="proc-notifications">{unread.map(item => <div key={item.id}><Bell size={15}/><span>{item.text}</span></div>)}</div><div className="proc-form-actions"><Button onClick={() => setNotificationsOpen(false)}>Close</Button><Button variant="primary" onClick={() => { run(current => markNotificationsRead(current, unread.map(item => item.id))); setNotificationsOpen(false); notify("Notifications marked read."); }}>Mark all read</Button></div></Modal>}
  </div>;
}

function BidderInvite({ state, pkgId, directory, run, notify, onClose }: {
  state: Procurement;
  pkgId: string;
  directory: Bidder[];
  run: ReturnType<typeof useProcurement>["run"];
  notify: ViewProps["notify"];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const pkg = state.packages.find(item => item.id === pkgId)!;
  const candidates = inviteCandidates(state, directory, pkgId, query);
  return <Modal title={`Invite bidders · ${pkg.name}`} subtitle={query ? "Searching the full company directory" : "Suggested companies match this trade"} onClose={onClose} wide>
    <SearchBox value={query} onChange={setQuery} placeholder="Search company, contact, or trade…"/>
    <div className="proc-candidates">{candidates.map(company => <article key={company.id}><span className="proc-company-mark">{company.company.slice(0, 2).toUpperCase()}</span><span><strong>{company.company}</strong><small>{company.name} · {company.trade}</small></span><Button onClick={() => { if (runAndNotify(run, current => inviteBidder(current, pkgId, company.id, CURRENT_USER), notify, `${company.company} invited to ${pkg.name}.`)) onClose(); }}><UserPlus size={14}/>Invite</Button></article>)}</div>
    {!candidates.length && <Empty title="No available companies found" description={query ? "Try another company, contact, or trade." : "Search the full directory to invite a company outside the suggested trade."}/>} 
  </Modal>;
}

function OutreachDialog({ state, target, directory, run, notify, onClose }: {
  state: Procurement;
  target: OutreachTarget;
  directory: Bidder[];
  run: ReturnType<typeof useProcurement>["run"];
  notify: ViewProps["notify"];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<OutreachKind>("call");
  const [entry, setEntry] = useState("");
  const pkg = state.packages.find(item => item.id === target.packageId);
  const bidder = directory.find(item => item.id === target.bidderId);
  const history = outreachLog(state, target.packageId, target.bidderId);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (runAndNotify(run, current => logOutreach(current, { ...target, kind, text: entry }, CURRENT_USER), notify, "Outreach added to the company log.")) setEntry("");
  }
  return <Modal title={bidder?.company ?? "Bidder outreach"} subtitle={`${pkg?.name ?? "Trade package"} · Calls, notes, and messages`} onClose={onClose} wide>
    <form className="proc-outreach-form" onSubmit={save}><label className="ui-field">Contact type<select value={kind} onChange={event => setKind(event.target.value as OutreachKind)}><option value="call">Call</option><option value="note">Internal note</option><option value="message">Message</option></select></label><label className="ui-field">What happened?<textarea required rows={3} value={entry} onChange={event => setEntry(event.target.value)} placeholder="Record the question, response, or next step."/></label><Button type="submit" variant="primary"><Plus size={14}/>Add to log</Button></form>
    <div className="proc-outreach-log">{history.map(item => <article key={item.id}><span>{item.kind === "call" ? <Phone size={14}/> : item.kind === "message" ? <MessageSquareText size={14}/> : <FileText size={14}/>}</span><div><strong>{item.kind}</strong><p>{item.text}</p><small>{item.by} · {eventTime(item.at)}</small></div></article>)}</div>
    {!history.length && <Empty title="No outreach yet" description="Log a call, note, or message after contacting this company."/>}
  </Modal>;
}

export function ProcurementPackagesView({ projectName, notify, navigate }: ViewProps) {
  const { state, run } = useProcurement();
  const [directory] = useLocalDraft("directory", initialBidders);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All packages");
  const [packageId, setPackageId] = useState("demolition");
  const [invitePackage, setInvitePackage] = useState<string | null>(null);
  const [outreach, setOutreach] = useState<OutreachTarget | null>(null);
  const activePackage = state.packages.find(pkg => pkg.id === packageId) ?? state.packages[0];
  const shown = state.packages.filter(pkg => `${pkg.name} ${pkg.code} ${pkg.owner}`.toLowerCase().includes(query.toLowerCase()) && (filter === "All packages" || packageStatus(state, pkg.id) === filter.toLowerCase()));
  const invitations = activePackage ? state.invitations.filter(item => item.packageId === activePackage.id) : [];

  if (!activePackage) return <div className="proc-view"><PageHeader eyebrow={`${projectName} / Bid management`} title="Bid packages" description="Assign trade owners, invite bidders, and keep outreach with each package."/><Empty title="No bid packages yet" description="This project starts empty. Add package setup to the project record before inviting bidders."/></div>;

  return <div className="proc-view">
    <PageHeader eyebrow={`${projectName} / Bid management`} title="Bid packages" description="Assign trade owners, invite bidders, and keep every follow-up with the package." actions={<Button variant="primary" onClick={() => setInvitePackage(activePackage.id)}><UserPlus size={16}/>Invite bidders</Button>}/>
    <PreviewNote>Project scoped package workflow · Invitations and outreach are saved with the open project.</PreviewNote>
    <Stats items={[{ label: "Trade packages", value: state.packages.length, detail: "Across the project" }, { label: "Published", value: state.packages.filter(pkg => packageStatus(state, pkg.id) === "published").length, detail: "Current bid forms", tone: "green" }, { label: "Invitations", value: state.invitations.length, detail: "Companies contacted" }, { label: "Proposals received", value: state.invitations.filter(item => item.status === "submitted").length, detail: "Ready for leveling" }]}/>
    <div className="proc-package-layout">
      <Panel className="proc-package-table"><div className="ui-toolbar"><Tabs tabs={["All packages", "Draft", "Ready", "Published", "Revised"]} value={filter} onChange={setFilter}/><SearchBox value={query} onChange={setQuery} placeholder="Search package, code, or owner…"/></div><div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Trade package</th><th>Owner</th><th>Bid due</th><th>Coverage</th><th>Status</th><th/></tr></thead><tbody>{shown.map(pkg => { const status = packageStatus(state, pkg.id); const invited = state.invitations.filter(item => item.packageId === pkg.id); const submitted = invited.filter(item => item.status === "submitted").length; return <tr className={pkg.id === activePackage.id ? "proc-active-row" : ""} key={pkg.id}><td><button className="proc-package-link" onClick={() => setPackageId(pkg.id)}><span className="proc-code">{pkg.code}</span><span><strong>{pkg.name}</strong><small>{bidForm(state, pkg.id).length} bid-form items</small></span></button></td><td><span className="proc-owner"><i>{pkg.owner[0] || "?"}</i>{pkg.owner || "Unassigned"}</span></td><td><span className="proc-date"><CalendarDays size={14}/>{displayDate(pkg.due)}</span></td><td><strong>{submitted} / {invited.length}</strong><small className="proc-table-sub">proposals received</small></td><td><Badge tone={statusTone(status)}>{statusLabels[status]}</Badge></td><td><Button onClick={() => { setPackageId(pkg.id); setInvitePackage(pkg.id); }}><Mail size={14}/>Invite</Button></td></tr>; })}</tbody></table></div>{!shown.length && <Empty title="No packages match" description="Try another trade, owner, or status."/>}</Panel>
      <Panel title={activePackage.name} subtitle={`${activePackage.code} · ${invitations.length} invited`} action={<Button onClick={() => navigate("scopes")}><FileText size={14}/>Review bid form</Button>} className="proc-invite-panel">
        <div className="proc-package-summary"><span><small>OWNER</small><strong>{activePackage.owner || "Unassigned"}</strong></span><span><small>BID DUE</small><strong>{displayDate(activePackage.due)}</strong></span><span><small>FORM</small><strong>{activePackage.published ? `Published v${activePackage.published.version}` : statusLabels[packageStatus(state, activePackage.id)]}</strong></span></div>
        <div className="proc-invitation-list">{invitations.map(invitation => { const bidder = directory.find(item => item.id === invitation.bidderId); const entries = outreachLog(state, invitation.packageId, invitation.bidderId); return <article key={invitation.id}><span className="proc-company-mark">{(bidder?.company ?? "?").slice(0, 2).toUpperCase()}</span><div><strong>{bidder?.company ?? "Directory company"}</strong><small>{bidder?.name ?? invitation.bidderId} · Invited {displayDate(invitation.invitedAt.slice(0, 10))}</small><button onClick={() => setOutreach({ packageId: invitation.packageId, bidderId: invitation.bidderId })}>{entries.length ? `${entries.length} outreach entr${entries.length === 1 ? "y" : "ies"}` : "Add first outreach"}<ArrowRight size={12}/></button></div><select aria-label={`Invitation status for ${bidder?.company ?? invitation.bidderId}`} value={invitation.status} className={`proc-status-select ${invitationTone(invitation.status)}`} onChange={event => runAndNotify(run, current => setInvitationStatus(current, invitation.id, event.target.value as InvitationStatus), notify, "Invitation status updated.")}><option value="invited">Invited</option><option value="bidding">Bidding</option><option value="declined">Declined</option><option value="submitted">Submitted</option></select></article>; })}</div>
        {!invitations.length && <Empty title="No bidders invited" description="Invite suggested companies or search the full directory." action={<Button onClick={() => setInvitePackage(activePackage.id)}><UserPlus size={14}/>Invite bidders</Button>}/>} 
      </Panel>
    </div>
    {invitePackage && <BidderInvite state={state} pkgId={invitePackage} directory={directory} run={run} notify={notify} onClose={() => setInvitePackage(null)}/>} 
    {outreach && <OutreachDialog state={state} target={outreach} directory={directory} run={run} notify={notify} onClose={() => setOutreach(null)}/>} 
  </div>;
}
