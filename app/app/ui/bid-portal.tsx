"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Check, Download, FileText, MessageSquareText, Send, X } from "lucide-react";
import type { BidDocument, PortalBidView } from "../../lib/bid-portal";
import { bidAction, bidFileUrl, downloadBidDocument, loadBid, PortalRequestError, uploadBidFile } from "../../lib/bid-portal-client";
import { displayDate, usd } from "../../lib/format";
import { latestRevision, type Submission, type SubmissionIssue, type Submitter } from "../../lib/submissions";
import { bytes, ProposalForm, ScopeResponseForm, submittedAt } from "./bid-form";
import { Badge, Button, Empty, Modal, Panel, Tabs } from "./shared";
import "./product.css";
import "./bid-portal.css";

const CHECK_EVERY = 30_000, SAVE_AFTER = 900;
const contentOf = ({ baseBid, responses, exclusions, alternates, clarifications }: Submission["draft"]) => ({ baseBid, responses, exclusions, alternates, clarifications });
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * What a subcontractor sees from their private link (Marcel, 24 Oct: "Subs only see their own portal page and submit their
 * proposal and bid form there"). Their draft saves by itself as they type; submitting makes it a version the estimator
 * sees, and they can submit again. Messages go back and forth with the estimator.
 */
export function BidPortal() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<PortalBidView | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [issues, setIssues] = useState<SubmissionIssue[]>([]);
  const [tab, setTab] = useState("Invitation");
  const [person, setPerson] = useState<Submitter>({ name: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("");
  const [fileStatus, setFileStatus] = useState("");
  const [declining, setDeclining] = useState(false);
  const latest = useRef<Submission[]>([]);
  const expected = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const dirty = useRef(false);

  const show = useCallback((submission: Submission | null | undefined) => {
    latest.current = submission ? [submission] : [];
    expected.current = submission?.updatedAt ?? null;
    setSubmissions(latest.current);
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(t);
    if (!t) { setLoading(false); setFatal("This link isn't complete. Open the full link the estimator sent you."); return; }
    void loadBid(t).then(next => {
      setView(next); show(next.submission);
      setPerson({ name: next.submission?.revisions.at(-1)?.submitter.name || next.company.contact, email: next.submission?.revisions.at(-1)?.submitter.email || next.company.email });
    }).catch(error => setFatal(error instanceof Error ? error.message : "Your bid could not be loaded. Please try again.")).finally(() => setLoading(false));
  }, [show]);

  // New messages and status changes come in while the page is open. A draft being typed is left alone.
  useEffect(() => {
    if (!token) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void loadBid(token).then(next => setView(current => current ? { ...next, submission: current.submission } : next)).catch(() => {});
    };
    const id = setInterval(check, CHECK_EVERY);
    return () => clearInterval(id);
  }, [token]);

  /** Saves changes one at a time, so each is made on the version the last one left. */
  const save = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return queue.current;
    dirty.current = false;
    setSaveState("Saving…");
    queue.current = queue.current.then(async () => {
      const draft = latest.current[0];
      if (!draft) return;
      try {
        const { submission } = await bidAction(token, { action: "save", draft: contentOf(draft.draft), expectedUpdatedAt: expected.current });
        expected.current = submission!.updatedAt;
        setSaveState(dirty.current ? "Saving…" : `Saved ${when(submission!.updatedAt)}`);
      } catch (error) {
        setSaveState("");
        setNotice(error instanceof Error ? error.message : "Your changes couldn't be saved. Please try again.");
        if (error instanceof PortalRequestError && error.status !== 409) dirty.current = true;
      }
    });
    return queue.current;
  }, [token]);

  const run = useCallback((action: (current: Submission[]) => Submission[]): SubmissionIssue[] => {
    try {
      latest.current = action(latest.current);
      setSubmissions(latest.current);
      setIssues([]);
      setNotice(current => /^Review/.test(current) ? "" : current);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_AFTER);
      return [];
    } catch (error) {
      const found = (error as { issues?: SubmissionIssue[] }).issues;
      if (found) { setIssues(found); return found; }
      throw error;
    }
  }, [save]);

  // Leaving with changes still on their way sends them first.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") void save(); };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [save]);

  async function submit(_id: string, submitter: Submitter): Promise<SubmissionIssue[]> {
    await save();
    await queue.current;
    try {
      const { view: next } = await bidAction(token, { action: "submit", submitter });
      setView(next!); show(next!.submission); setIssues([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return [];
    } catch (error) {
      const found: SubmissionIssue[] = error instanceof PortalRequestError && error.issues.length ? error.issues : [{ field: "revision", message: error instanceof Error ? error.message : "Your bid couldn't be submitted. Please try again." }];
      setIssues(found);
      return found;
    }
  }

  async function addFiles(files: File[]) {
    let current = latest.current[0];
    for (const file of files) {
      try {
        setFileStatus(`Uploading ${file.name}…`);
        await save(); await queue.current;
        const saved = await uploadBidFile(token, current, file, percent => setFileStatus(`Uploading ${file.name}: ${percent}%`));
        current = saved;
        const draft = latest.current[0];
        latest.current = [{ ...draft, draft: { ...draft.draft, attachments: saved.draft.attachments } }];
        expected.current = saved.updatedAt;
        setSubmissions(latest.current);
        setFileStatus(`${file.name} is attached.`);
      } catch (error) {
        setFileStatus(`${file.name} didn't upload: ${error instanceof Error ? error.message : "please try again."}`);
      }
    }
  }
  async function removeFile(id: string) {
    await save(); await queue.current;
    try {
      const { submission } = await bidAction(token, { action: "remove-file", id });
      const draft = latest.current[0];
      latest.current = [{ ...draft, draft: { ...draft.draft, attachments: submission!.draft.attachments } }];
      expected.current = submission!.updatedAt;
      setSubmissions(latest.current);
    } catch (error) { setFileStatus(error instanceof Error ? error.message : "That file couldn't be removed."); }
  }

  async function act(body: Record<string, unknown>) {
    const { view: next } = await bidAction(token, body);
    setView(current => current ? { ...next!, submission: current.submission } : next!);
  }

  if (loading) return <Shell><p role="status" className="bid-portal-note">Opening your invitation…</p></Shell>;
  if (fatal || !view) return <Shell><div className="bid-portal-stop" role="alert"><AlertTriangle size={22}/><div><h1>This invitation can&apos;t be opened</h1><p>{fatal}</p></div></div></Shell>;

  const submission = submissions[0];
  const last = submission ? latestRevision(submission) : undefined;
  const declined = view.invitation.status === "declined";
  const amount = submission?.draft.baseBid ?? last?.baseBid;
  const messagesTab = view.messages.length ? `Messages (${view.messages.length})` : "Messages";

  return <Shell company={view.company.name}>
    {notice && <div className={`bid-portal-notice ${/^(Review|Your changes|This bid changed)/.test(notice) ? "warning" : ""}`} role="status">{/^(Review|Your changes|This bid changed)/.test(notice) ? <AlertTriangle size={16}/> : <Check size={16}/>}<span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14}/></button></div>}
    <div className="sub-portal-hero"><div><Badge tone="blue">INVITATION TO BID</Badge><h1>{view.projectName}</h1><p>{view.package.name}{view.package.code ? ` · CSI ${view.package.code}` : ""}</p><div>{view.package.due && <span>Bid due {displayDate(view.package.due)}</span>}{view.package.owner && <span>Estimator: {view.package.owner}</span>}{view.form && <span>Bid form v{view.form.version}</span>}</div></div><aside><small>Your proposal</small><Badge tone={declined ? "red" : last ? "green" : "amber"}>{declined ? "Declined" : last ? `V${last.number} submitted` : "Not submitted"}</Badge><strong>{amount ? usd(amount) : "—"}</strong></aside></div>
    <Tabs tabs={["Invitation", "Scope & bid", messagesTab]} value={tab.startsWith("Messages") ? messagesTab : tab} onChange={setTab}/>

    {tab === "Invitation" && <div className="sub-invitation-grid">
      <Panel title="What's being asked" subtitle={view.company.name}><div className="sub-overview">
        <p>Provide a complete price for the {view.package.name.toLowerCase()} bid form. Confirm every scope item and record any exclusions, alternates or price clarifications.</p>
        <dl><div><dt>Trade</dt><dd>{view.package.code ? `${view.package.code} · ` : ""}{view.package.name}</dd></div><div><dt>Bid due</dt><dd>{view.package.due ? displayDate(view.package.due) : "Not set"}</dd></div><div><dt>Estimator</dt><dd>{view.package.owner || "Not named yet"}</dd></div><div><dt>Bid form</dt><dd>{view.form ? `Version ${view.form.version}, ${view.form.items.length} items` : "Not published yet"}</dd></div></dl>
        {view.blockers.length > 0 ? <div className="sub-inline-warning"><AlertTriangle size={15}/>{declined ? "You declined this invitation. To bid after all, message the estimator." : view.blockers[0]}</div> : <Button variant="primary" onClick={() => setTab("Scope & bid")}>{last ? "Review your bid" : "Prepare your bid"}<ArrowRight size={15}/></Button>}
        {!declined && !last && <button className="bid-portal-link-button" onClick={() => setDeclining(true)}>Not bidding this one? Let the estimator know</button>}
      </div></Panel>
      <DocumentsPanel token={token} documents={view.documents}/>
    </div>}

    {tab === "Scope & bid" && (view.blockers.length || !submission ? <Panel><div className="sub-blocked"><AlertTriangle size={25}/><div><h3>This bid form isn&apos;t open</h3><p>{declined ? "You declined this invitation. To bid after all, message the estimator." : view.blockers[0] ?? "Reload the page and try again."}</p></div></div></Panel> : <>
      {saveState && <p className="bid-portal-note" role="status">{saveState}</p>}
      <div className="sub-bid-grid">
        <ScopeResponseForm submission={submission} items={view.form?.items ?? []} issues={issues} run={run}/>
        <ProposalForm submission={submission} issues={issues} run={run} submit={submit} profile={person} notify={setNotice} stale={!!last && !!view.form && last.formVersion < view.form.version}
          files={{ add: files => void addFiles(files), remove: id => void removeFile(id), href: id => bidFileUrl(token, id), status: fileStatus }}
          submitter={<div className="ui-form-grid"><label className="ui-field">Your name<input required maxLength={120} autoComplete="name" value={person.name} onChange={event => setPerson({ ...person, name: event.target.value })}/></label><label className="ui-field">Your email<input required type="email" maxLength={200} autoComplete="email" value={person.email} onChange={event => setPerson({ ...person, email: event.target.value })}/></label></div>}/>
      </div>
      {submission.revisions.length > 0 && <Panel title="Your submitted versions" subtitle="What the estimator has. Later versions don't change earlier ones."><div className="bid-portal-versions">{[...submission.revisions].reverse().map(r => <article key={r.number}><Badge tone="blue">{`V${r.number}`}</Badge><span><strong>{usd(r.baseBid ?? 0)}</strong><small>{submittedAt(r.submittedAt)} · {r.submitter.name}</small></span>{r.attachments.map(file => <a key={file.id} href={bidFileUrl(token, file.id)}><FileText size={13}/>{file.name} · {bytes(file.size)}</a>)}</article>)}</div></Panel>}
    </>)}

    {tab.startsWith("Messages") && <Messages view={view} person={person} onSend={async text => { await act({ action: "message", author: person.name, text }); }}/>}

    {declining && <DeclineDialog onClose={() => setDeclining(false)} onDecline={async reason => { await act({ action: "decline", author: person.name, reason }); setDeclining(false); setTab("Invitation"); setNotice("The estimator has been told you aren't bidding. Thank you for letting them know."); }}/>}
  </Shell>;
}

function Shell({ company, children }: { company?: string; children: React.ReactNode }) {
  return <div className="product-app bid-portal"><header className="bid-portal-top"><strong>Bid invitation</strong>{company && <span>{company}</span>}</header><main className="sub-view bid-portal-main">{children}</main><footer className="bid-portal-foot">This page is private to your company. Please don&apos;t forward the link.</footer></div>;
}

function DocumentsPanel({ token, documents }: { token: string; documents: BidDocument[] }) {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  async function get(doc: BidDocument) {
    setError(""); setProgress(p => ({ ...p, [doc.id]: 0 }));
    try { await downloadBidDocument(token, doc, percent => setProgress(p => ({ ...p, [doc.id]: percent }))); }
    catch (e) { setError(e instanceof Error ? e.message : "The document could not be downloaded."); }
    finally { setProgress(({ [doc.id]: _done, ...rest }) => rest); }
  }
  return <Panel title="Bid documents" subtitle="The current drawings, specifications and addenda.">
    {documents.length ? <div className="sub-document-list">{documents.map(doc => <button key={doc.id} disabled={doc.id in progress} onClick={() => void get(doc)}><span><FileText size={18}/></span><span><strong>{doc.name}</strong><small>{doc.id in progress ? `Downloading ${progress[doc.id]}%` : `${doc.category} · ${doc.pageCount} pages · ${bytes(doc.size)}${doc.revision > 1 ? ` · version ${doc.revision}` : ""}`}</small></span><Download size={15}/></button>)}</div> : <Empty title="No documents here yet" description="Ask the estimator if you need the drawings or specifications."/>}
    {error && <p className="sub-field-error" role="alert">{error}</p>}
  </Panel>;
}

function Messages({ view, person, onSend }: { view: PortalBidView; person: Submitter; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSend(text); setText(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Your message didn't send. Please try again."); }
    finally { setBusy(false); }
  }
  return <Panel title="Messages" subtitle={`Between ${view.company.name} and ${view.package.owner || "the estimator"}, about ${view.package.name}.`}>
    <div className="bid-thread">{view.messages.map(m => <article key={m.id} className={m.from === "subcontractor" ? "own" : ""}><strong>{m.author}</strong><p>{m.text}</p><small>{when(m.at)}</small></article>)}{!view.messages.length && <Empty title="No messages yet" description="Ask about the scope or the documents here."/>}</div>
    <form className="bid-thread-compose" onSubmit={event => void send(event)}><label className="ui-field">Your message<textarea required rows={3} maxLength={4000} value={text} onChange={event => setText(event.target.value)}/></label>{!person.name.trim() && <p className="sub-field-error">Enter your name under Scope &amp; bid first.</p>}{error && <p className="sub-field-error" role="alert">{error}</p>}<Button type="submit" variant="primary" disabled={busy || !person.name.trim()}><MessageSquareText size={14}/>{busy ? "Sending…" : "Send"}</Button></form>
  </Panel>;
}

function DeclineDialog({ onClose, onDecline }: { onClose: () => void; onDecline: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Modal title="Decline to bid?" subtitle="The estimator is told. This closes the bid form for your company." onClose={onClose}><form onSubmit={event => { event.preventDefault(); setBusy(true); void onDecline(reason).catch(e => { setError(e instanceof Error ? e.message : "That didn't go through."); setBusy(false); }); }}>
    <label className="ui-field">Reason (optional)<textarea rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label>
    {error && <p className="sub-field-error" role="alert">{error}</p>}
    <div className="sub-modal-actions"><Button onClick={onClose}>Keep invitation</Button><Button type="submit" variant="primary" disabled={busy}><Send size={14}/>{busy ? "Sending…" : "Decline to bid"}</Button></div>
  </form></Modal>;
}
