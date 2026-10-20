"use client";

import { useMemo, useRef, useState } from "react";
import { applyClarification, clarificationLetter, draftClarifications, isOverdue, staleLines, type ClarificationLine, type ClarificationRequest } from "../../lib/clarifications";
import { cancelClarificationRequest, clarificationLink, ClarificationConflict, recordApplied, sendClarificationRequest, useClarifications } from "../../lib/clarifications-client";
import type { LevelingBidder, LevelingScopeItem } from "../../lib/leveling-import";
import "./clarifications.css";

const actor = "Marcel Khoury";
const usd = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
export function AnswerText({ line }: { line: ClarificationLine }) {
  return <>{line.answer ? <>{line.answer.kind === "add" ? `Add ${usd(line.answer.amount!)}` : line.answer.kind === "included" ? "Included" : "Excluded"}{line.answer.note && ` · ${line.answer.note}`}<small>Answered by {line.answer.by}</small></> : "Awaiting answer"}</>;
}
function lineStatus(request: ClarificationRequest, line: ClarificationLine) {
  return request.status === "cancelled" ? "Cancelled" : line.appliedAt ? "Applied" : line.answer ? "Answered" : isOverdue(request, new Date().toISOString().slice(0, 10)) ? "Overdue" : "Sent";
}

export function ApplyClarificationPreview({ request, bidders }: { request: ClarificationRequest; bidders: LevelingBidder[] }) {
  const stale = staleLines(request, bidders);
  const preview = applyClarification(bidders, request, actor, new Date().toISOString());
  const before = bidders.find(b => b.id === request.bidderId), after = preview.bidders.find(b => b.id === request.bidderId);
  return <div className="clarify-lines">
    {stale.baseBidChanged && <p className="clarify-warning" role="alert">The base bid changed. Applying is blocked. Review the current proposal and prepare a new request after cancelling this one.</p>}
    {request.lines.map(line => {
      const current = before?.responses[line.scopeItemId], next = after?.responses[line.scopeItemId];
      const skipped = stale.lines.includes(line.scopeItemId);
      return <article className="clarify-line" key={line.scopeItemId}>
        <div className="clarify-row"><strong>{line.number} {line.item}</strong><span className="clarify-status">{lineStatus(request, line)}</span></div>
        <p className="clarify-source">Documents require: {line.requirement || "See the bid form"}{line.section && ` · ${line.section}`}</p>
        <div className="clarify-comparison"><div><span>Subcontractor answer</span><p><AnswerText line={line}/></p></div><div><span>Current response / plug</span><p>{current?.status || "Unanswered"} · {usd(current?.adjustment ?? 0)}</p></div><div><span>After applying</span><p>{stale.baseBidChanged || skipped || !line.answer || line.appliedAt ? "No change" : `${next?.status} · ${usd(next?.adjustment ?? 0)} · ${next?.resolved ? "Resolved" : "Unresolved; plug kept"}`}</p></div></div>
        {skipped && <p className="clarify-warning">This response changed since the request was prepared. This line will be skipped.</p>}
      </article>;
    })}
  </div>;
}

function DraftLetter({ draft, bidders, disabled, onSend }: { draft: ClarificationRequest; bidders: LevelingBidder[]; disabled: boolean; onSend: (draft: ClarificationRequest, recipient: { name: string; email: string }, due: string) => Promise<void> }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [due, setDue] = useState("");
  const preview = { ...draft, recipient: { name, email }, dueAt: due || null };
  return <details className="clarify-card"><summary>{draft.bidder} <span>{draft.lines.length} gap{draft.lines.length === 1 ? "" : "s"} · Draft</span></summary>
    <form onSubmit={event => { event.preventDefault(); void onSend(draft, { name, email }, due); }}>
      <fieldset disabled={disabled}><legend>Review recipient and reply date</legend><div className="clarify-fields">
        <label>Recipient name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} autoComplete="off"/></label>
        <label>Recipient email<input required type="email" maxLength={200} value={email} onChange={e => setEmail(e.target.value)} autoComplete="off"/></label>
        <label>Reply by<input required type="date" min={new Date().toISOString().slice(0, 10)} value={due} onChange={e => setDue(e.target.value)}/></label>
      </div><h4>Letter preview</h4><pre className="clarify-letter">{clarificationLetter(preview)}</pre><p>Current leveling plugs: {draft.lines.map(l => `${l.number || l.item}: ${usd(bidders.find(b => b.id === draft.bidderId)?.responses[l.scopeItemId]?.adjustment ?? 0)}`).join(" · ")}</p><p>Send creates a signed reply link. Nothing is emailed. Copy and share the link with the recipient.</p><button className="ui-btn primary" type="submit">Send to {name || draft.bidder}</button></fieldset>
    </form>
  </details>;
}

export function ClarificationsPanel({ projectId, projectName, packageId, trade, items, bidders, onSave }: {
  projectId: string; projectName: string; packageId: string; trade: string; items: LevelingScopeItem[]; bidders: LevelingBidder[]; onSave: (bidders: LevelingBidder[]) => Promise<void>;
}) {
  const { requests: allRequests, loading, error, reload } = useClarifications(projectId);
  const requests = allRequests.filter(r => r.projectId === projectId && r.packageId === packageId);
  const drafts = useMemo(() => draftClarifications({ projectId, projectName, packageId, trade, items, bidders, open: allRequests.filter(r => r.projectId === projectId), at: new Date().toISOString(), newId: () => crypto.randomUUID() }), [projectId, projectName, packageId, trade, items, bidders, allRequests]);
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [notice, setNotice] = useState(""), [failure, setFailure] = useState("");
  const [link, setLink] = useState<{ bidder: string; url: string } | null>(null);
  const [pending, setPending] = useState<{ request: ClarificationRequest; applied: string[] } | null>(null);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailure(""); setNotice("");
    try { await action(); } catch (e) { setFailure(messageOf(e)); if (e instanceof ClarificationConflict) reload(); }
    finally { lock.current = false; setBusy(false); }
  }
  async function apply(request: ClarificationRequest) {
    await run(async () => {
      if (staleLines(request, bidders).baseBidChanged) throw new Error("Review the changed base bid before applying.");
      const result = applyClarification(bidders, request, actor, new Date().toISOString());
      if (!result.applied.length) { setNotice("Nothing changed. Already applied, unanswered and stale lines are left as they are."); return; }
      await onSave(result.bidders);
      setPending({ request, applied: result.applied });
      await recordApplied(request, result.applied, actor);
      setPending(null); reload();
      setNotice(`${result.applied.length} answer${result.applied.length === 1 ? "" : "s"} applied. ${result.skipped.length} unanswered or changed line${result.skipped.length === 1 ? "" : "s"} skipped. Applying again leaves these amounts unchanged.`);
    });
  }
  return <section className="clarify-panel" aria-label="Trade clarifications">
    <header className="clarify-row"><div><h2>Close the gap</h2><p>{trade} · Review each letter, then send its reply link.</p></div><button className="ui-btn" disabled={busy || loading} onClick={reload}>{loading ? "Loading…" : "Refresh answers"}</button></header>
    <p role="status" aria-live="polite">{busy ? "Saving…" : notice}</p>
    {(error || failure) && <p role="alert" className="clarify-warning">{error || failure}</p>}
    {pending && <div role="alert" className="clarify-warning">Leveling is saved locally, but the server has not confirmed the applied status. Keep this panel open and retry the status update. If the request changed, refresh and recheck its answers before reconciling with the estimator.<button className="ui-btn" disabled={busy} onClick={() => void run(async () => { await recordApplied(pending.request, pending.applied, actor); setPending(null); reload(); setNotice("Applied status saved."); })}>Retry status update</button></div>}
    {link && <div className="clarify-link" role="status"><strong>Reply link for {link.bidder}</strong><p>Nothing was emailed. Copy and share this link with the recipient.</p><label>Signed reply link<input readOnly value={link.url} onFocus={e => e.target.select()}/></label><button className="ui-btn" disabled={busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(link.url); setNotice("Reply link copied. Nothing was emailed."); })}>Copy link</button></div>}
    {!loading && !error && <>
      <h3>Prepare clarifications</h3>
      {!drafts.length && <p>No new gaps to ask about. Existing requests and resolved items are not drafted again.</p>}
      {drafts.map(draft => <DraftLetter key={draft.id} draft={draft} bidders={bidders} disabled={busy || !!pending} onSend={(d, recipient, due) => run(async () => { const sent = await sendClarificationRequest(d, recipient, due, actor); setLink({ bidder: d.bidder, url: sent.link }); reload(); setNotice("Request sent. Nothing was emailed."); })}/>)}
      <h3>Requests &amp; apply preview</h3>
      {!requests.length && <p>No requests sent for this trade yet.</p>}
      {requests.map(request => <details className="clarify-card" key={request.id}><summary>{request.bidder}<span>{request.status === "cancelled" ? "Cancelled" : request.status === "applied" ? "Applied" : `${request.lines.filter(l => l.answer).length}/${request.lines.length} answered${isOverdue(request, new Date().toISOString().slice(0, 10)) ? " · Overdue" : request.status === "answered" ? " · Answered" : " · Sent"}`}</span></summary>
        <p>To {request.recipient?.name} · {request.recipient?.email} · Reply by {request.dueAt}</p>
        {request.status === "cancelled" ? <p>This request was withdrawn. Its link no longer accepts answers.</p> : <ApplyClarificationPreview request={request} bidders={bidders}/>}
        <div className="clarify-actions">
          {request.status !== "cancelled" && <button className="ui-btn" disabled={busy || !!pending || loading || staleLines(request, bidders).baseBidChanged || !request.lines.some(l => l.answer)} onClick={() => void apply(request)}>{request.status === "applied" ? "Apply again" : "Apply answers"}</button>}
          {!["cancelled", "applied"].includes(request.status) && <><button className="ui-btn" disabled={busy || !!pending} onClick={() => void run(async () => { setLink({ bidder: request.bidder, url: await clarificationLink(request) }); })}>Get reply link</button><button className="ui-btn" disabled={busy || !!pending} onClick={() => void run(async () => { await cancelClarificationRequest(request, actor); reload(); setNotice("Request cancelled. Its reply link is withdrawn."); })}>Cancel request</button></>}
        </div>
      </details>)}
    </>}
  </section>;
}
