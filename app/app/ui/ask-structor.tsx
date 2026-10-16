"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, MessageCircleQuestion, Send, X } from "lucide-react";
import { aiJob } from "../../lib/ai-more-client";
import { manualGuides } from "../../lib/user-manual";
import type { Screen } from "./shared";
import "./ask-structor.css";

type Message = { role: "user" | "assistant"; text: string; screens?: string[] };
const STARTERS = ["What is this page for?", "How do I get the AI to write scopes?", "How do I upload a new drawing revision?"];

/**
 * Ask Structor (Danial, 15 Oct): ask anything about the page or how to use it, in place of the About &
 * help button. Answers come from the built-in guide; the full guide stays one click away.
 */
export function AskStructor({ currentScreen, onOpenManual, onNavigate }: { currentScreen: Screen; onOpenManual: () => void; onNavigate: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const page = manualGuides.find(g => g.id === currentScreen)?.title ?? "this page";
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.slice(-6).map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, { role: "user", text: q }]); setDraft(""); setBusy(true);
    try {
      const reply = await aiJob<{ answer: string; screens: string[] }>("assistant", { question: q, screen: currentScreen, history });
      setMessages(prev => [...prev, { role: "assistant", text: reply.answer, screens: reply.screens }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", text: error instanceof Error ? `I couldn't answer that just now (${error.message}). The full guide has every page's steps.` : "I couldn't answer that just now." }]);
    } finally { setBusy(false); }
  }

  return <>
    <button className="ask-launcher" type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="ask-structor-panel"><MessageCircleQuestion size={22} aria-hidden="true"/><span>Ask Structor</span></button>
    {open && <section id="ask-structor-panel" className="ask-panel" aria-label="Ask Structor">
      <header><div><strong>Ask Structor</strong><small>About {page} or anything in the app</small></div><button type="button" className="ui-icon-btn" aria-label="Close Ask Structor" onClick={() => setOpen(false)}><X size={17}/></button></header>
      <div className="ask-messages" ref={list} aria-live="polite">
        {!messages.length && <div className="ask-starters"><p>Answers come from Structor's own guide.</p>{STARTERS.map(s => <button type="button" key={s} onClick={() => void ask(s)}>{s}</button>)}</div>}
        {messages.map((m, i) => <div key={i} className={`ask-message ${m.role}`}><p>{m.text}</p>{m.screens?.length ? <div className="ask-links">{m.screens.map(id => <button type="button" key={id} onClick={() => onNavigate(id)}>Open {manualGuides.find(g => g.id === id)?.title ?? id}</button>)}</div> : null}</div>)}
        {busy && <div className="ask-message assistant"><p>…</p></div>}
      </div>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void ask(draft); }}><input aria-label="Your question" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask a question…" disabled={busy}/><button type="submit" className="ui-icon-btn" aria-label="Send question" disabled={busy || !draft.trim()}><Send size={16}/></button></form>
      <button type="button" className="ask-guide" onClick={() => { setOpen(false); onOpenManual(); }}><BookOpen size={15}/>Open the full guide</button>
    </section>}
  </>;
}
