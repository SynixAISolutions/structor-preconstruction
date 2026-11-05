"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, ExternalLink, Link2Off, Mail, Send } from "lucide-react";
import { addBidMessage, BID_MESSAGES_KEY, markMessagesRead, type BidMessage } from "../../lib/bid-portal";
import { requestPortalLink, revokePortalLink } from "../../lib/bid-portal-client";
import type { Procurement } from "../../lib/procurement";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Button, Empty, Modal } from "./shared";
import "./bid-portal.css";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The open project's messages with its subcontractors, shared with their private pages (lib/bid-portal). */
export const useBidMessages = () => useLocalDraft<BidMessage[]>(BID_MESSAGES_KEY, []);

/**
 * A company's private link to bid. Automatic emails would need an email service, so the estimator sends this: copied, or
 * through their own email with the message written for them.
 */
export function PortalLinkDialog({ projectId, projectName, invitationId, trade, company, contact, email, by, notify, onClose }: {
  projectId: string; projectName: string; invitationId: string; trade: string; company: string; contact: string; email: string; by: string;
  notify: (message: string) => void; onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void requestPortalLink({ projectId, invitationId, projectName, company, contact, email, by }).then(made => { if (live) setLink(made); }).catch(e => { if (live) setError(e instanceof Error ? e.message : "The link could not be made."); });
    return () => { live = false; };
  }, [projectId, invitationId, projectName, company, contact, email, by]);
  const subject = `Invitation to bid: ${trade}, ${projectName}`;
  const body = `Hi ${contact || company},\n\nYou're invited to bid on ${trade} for ${projectName}. This private page has the bid documents and the bid form, and it's where you submit your price and your proposal and can message me:\n\n${link}\n\nThe link is for your company only, so please don't forward it.\n\n${by}`;
  async function copy() {
    try { await navigator.clipboard.writeText(link); notify("Link copied."); }
    catch { setError("The browser refused to copy. Select the link and copy it by hand."); }
  }
  async function turnOff() {
    setBusy(true); setError("");
    try { await revokePortalLink({ projectId, invitationId, by }); notify(`${company}'s link is off. Opening this dialog again makes a new one.`); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "The link could not be turned off."); setBusy(false); }
  }
  return <Modal title="Private bid link" subtitle={`${company} · ${trade}`} onClose={onClose}>
    <div className="bid-link-box">
      {!link && !error && <p role="status">Making the link…</p>}
      {link && <><p>Anyone with this link can see and submit {company}&apos;s bid on this trade, and nothing else. It lasts 180 days, or until you turn it off.</p>
        <label className="ui-field">Link<input readOnly value={link} onFocus={event => event.target.select()}/></label>
        <div className="bid-link-actions">
          <Button variant="primary" onClick={() => void copy()}><Copy size={14}/>Copy link</Button>
          <a className="ui-btn secondary" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14}/>Write the email</a>
          <a className="ui-btn secondary" href={link} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open their page</a>
          <Button disabled={busy} onClick={() => void turnOff()}><Link2Off size={14}/>Turn this link off</Button>
        </div></>}
      {error && <p className="sub-field-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}

/** The thread with one invited company. Opening it marks their messages read. */
export function BidThread({ messages, setMessages, procurement, invitationId, company, by, notify }: { messages: BidMessage[]; setMessages: ReturnType<typeof useBidMessages>[1]; procurement: Procurement; invitationId: string; company: string; by: string; notify: (message: string) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const thread = messages.filter(m => m.invitationId === invitationId);
  useEffect(() => { setMessages(current => markMessagesRead(current, invitationId)); }, [invitationId, thread.length]); // eslint-disable-line react-hooks/exhaustive-deps
  function send(event: FormEvent) {
    event.preventDefault();
    try {
      setMessages(current => addBidMessage(current, procurement, invitationId, { from: "contractor", author: by, text }));
      setText(""); setError("");
      notify(`Sent. ${company} sees it the next time their page checks, within a minute. They aren't emailed.`);
    } catch (e) { setError(e instanceof Error ? e.message : "The message didn't send."); }
  }
  return <section className="bid-thread-section">
    <h3>Messages with {company}</h3>
    <div className="bid-thread">{thread.map(m => <article key={m.id} className={m.from === "contractor" ? "own" : ""}><strong>{m.author}</strong><p>{m.text}</p><small>{when(m.at)}</small></article>)}{!thread.length && <Empty title="No messages yet" description="What you write here shows on their private page, and what they write shows here."/>}</div>
    <form className="bid-thread-compose" onSubmit={send}><label className="ui-field">Reply<textarea required rows={2} maxLength={4000} value={text} onChange={event => setText(event.target.value)}/></label>{error && <p className="sub-field-error" role="alert">{error}</p>}<Button type="submit"><Send size={14}/>Send to {company}</Button></form>
  </section>;
}
