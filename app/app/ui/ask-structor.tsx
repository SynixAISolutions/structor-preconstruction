"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, MessageCircleQuestion, RotateCcw, Send, X } from "lucide-react";
import { applyProposal, undoChange, type AppliedChange, type Proposal } from "../../lib/assistant-actions";
import { askStructor } from "../../lib/assistant-client";
import { useLocalDraft } from "../../lib/use-local-draft";
import { manualGuides } from "../../lib/user-manual";
import type { Screen } from "./shared";
import "./ask-structor.css";

type ProposalState = { proposal: Proposal; status: "pending" | "applied" | "dismissed" | "undone"; error?: string };
/** `tools`: what an answer was read from, told to the AI with the history so it trusts its earlier answers. */
type Message = { role: "user" | "assistant"; text: string; screens?: string[]; tools?: string[]; proposals?: ProposalState[] };
/** Messages kept per project in this browser. */
const KEPT = 40;
const STARTERS = ["Who is the apparent low bidder on each trade?", "Which budget lines are over budget?", "What RFIs are still open?", "What is this page for?"];
const OUTCOME = { pending: "not applied yet", applied: "applied by the user", dismissed: "dismissed by the user", undone: "applied, then undone by the user" };
const pageTitle = (id: string) => manualGuides.find(g => g.id === id)?.title ?? id;

/**
 * Ask Structor (Danial, 15 Oct; live project data and approved changes 22 Oct): questions about the
 * open project are answered from its live data and how-to questions from the built-in guide. Changes
 * the assistant proposes appear as cards and happen only when the user clicks Apply; Undo restores
 * the page's data while nothing else has changed it. Each project's chat is kept in this browser
 * (Danial, 22 Oct: "are the chats not saved?"); Undo lasts until the page is reloaded.
 */
export function AskStructor({ currentScreen, onOpenManual, onNavigate }: { currentScreen: Screen; onOpenManual: () => void; onNavigate: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useLocalDraft<Message[]>("assistant-chat", []);
  const messages = saved;
  const setMessages = (change: (prev: Message[]) => Message[]) => setSaved(prev => change(prev).slice(-KEPT));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const applied = useRef(new Map<string, AppliedChange>());
  const page = manualGuides.find(g => g.id === currentScreen)?.title ?? "this page";
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    // The AI hears what became of its proposals, so "did that go through?" has an answer.
    const history = messages.slice(-6).map(m => ({ role: m.role, text: [m.text, m.tools?.length ? `(read with: ${[...new Set(m.tools)].join(", ")})` : "", ...(m.proposals ?? []).map(p => `[${p.proposal.title}: ${OUTCOME[p.status]}]`)].filter(Boolean).join("\n") }));
    setMessages(prev => [...prev, { role: "user", text: q }]); setDraft(""); setBusy("Reading your question");
    try {
      const reply = await askStructor({ question: q, screen: currentScreen, history }, { onProgress: setBusy });
      setMessages(prev => [...prev, { role: "assistant", text: reply.answer, screens: reply.screens, tools: reply.tools, proposals: reply.proposals.map(proposal => ({ proposal, status: "pending" as const })) }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", text: error instanceof Error ? `I couldn't answer that just now (${error.message}). The full guide has every page's steps.` : "I couldn't answer that just now." }]);
    } finally { setBusy(null); }
  }

  function update(id: string, change: (p: ProposalState) => ProposalState) {
    setMessages(prev => prev.map(m => m.proposals?.some(p => p.proposal.id === id) ? { ...m, proposals: m.proposals.map(p => p.proposal.id === id ? change(p) : p) } : m));
  }
  function apply(p: ProposalState) {
    try {
      applied.current.set(p.proposal.id, applyProposal(p.proposal));
      update(p.proposal.id, s => ({ ...s, status: "applied", error: undefined }));
    } catch (error) {
      update(p.proposal.id, s => ({ ...s, error: error instanceof Error ? error.message : "The change could not be made." }));
    }
  }
  function undo(p: ProposalState) {
    const change = applied.current.get(p.proposal.id);
    if (change && undoChange(change)) update(p.proposal.id, s => ({ ...s, status: "undone", error: undefined }));
    else update(p.proposal.id, s => ({ ...s, error: "Can't undo: the page has changed since. Change it back on the page itself." }));
  }

  return <>
    <button className="ask-launcher" type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="ask-structor-panel"><MessageCircleQuestion size={22} aria-hidden="true"/><span>Ask Structor</span></button>
    {open && <section id="ask-structor-panel" className="ask-panel" aria-label="Ask Structor">
      <header><div><strong>Ask Structor</strong><small>About this project, {page} or anything in the app</small></div><span className="ask-header-actions">{messages.length > 0 && <button type="button" className="ui-icon-btn" aria-label="Start a new chat" title="Start a new chat (this project's chat is cleared)" disabled={!!busy} onClick={() => { setMessages(() => []); applied.current.clear(); }}><RotateCcw size={16}/></button>}<button type="button" className="ui-icon-btn" aria-label="Close Ask Structor" onClick={() => setOpen(false)}><X size={17}/></button></span></header>
      <div className="ask-messages" ref={list} aria-live="polite">
        {!messages.length && <div className="ask-starters"><p>Answers come from this project's live data and Structor's guide. Ask Structor can prepare a change, like a VE idea or an RFI draft, but it only happens when you click Apply. Each project's chat is kept in this browser.</p>{STARTERS.map(s => <button type="button" key={s} onClick={() => void ask(s)}>{s}</button>)}</div>}
        {messages.map((m, i) => <div key={i} className={`ask-message ${m.role}`}>
          <p>{m.text}</p>
          {m.proposals?.map(p => <div key={p.proposal.id} className={`ask-proposal ${p.status}`} aria-label={`Proposed change: ${p.proposal.title}`}>
            <strong>{p.proposal.title}</strong>
            <ul>{p.proposal.lines.map(line => <li key={line}>{line}</li>)}</ul>
            {p.error && <p className="ask-proposal-error" role="alert">{p.error}</p>}
            {p.status === "pending" && <div className="ask-proposal-actions"><button type="button" className="apply" onClick={() => apply(p)}>Apply</button><button type="button" onClick={() => update(p.proposal.id, s => ({ ...s, status: "dismissed", error: undefined }))}>Dismiss</button></div>}
            {p.status === "applied" && <div className="ask-proposal-actions"><span>Applied</span>{applied.current.has(p.proposal.id) && <button type="button" onClick={() => undo(p)}>Undo</button>}<button type="button" onClick={() => onNavigate(p.proposal.screen)}>Open {pageTitle(p.proposal.screen)}</button></div>}
            {(p.status === "dismissed" || p.status === "undone") && <div className="ask-proposal-actions"><span>{p.status === "dismissed" ? "Dismissed" : "Undone"}</span></div>}
          </div>)}
          {m.screens?.length ? <div className="ask-links">{m.screens.map(id => <button type="button" key={id} onClick={() => onNavigate(id)}>Open {pageTitle(id)}</button>)}</div> : null}
        </div>)}
        {busy && <div className="ask-message assistant"><p className="ask-progress">{busy}…</p></div>}
      </div>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void ask(draft); }}><input aria-label="Your question" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask about this project…" disabled={!!busy}/><button type="submit" className="ui-icon-btn" aria-label="Send question" disabled={!!busy || !draft.trim()}><Send size={16}/></button></form>
      <button type="button" className="ask-guide" onClick={() => { setOpen(false); onOpenManual(); }}><BookOpen size={15}/>Open the full guide</button>
    </section>}
  </>;
}
