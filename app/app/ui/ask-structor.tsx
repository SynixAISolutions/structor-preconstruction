"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, Download, ListChecks, MessageCircleQuestion, RotateCcw, Send, X } from "lucide-react";
import { applyProposal, undoChange, type AppliedChange, type Proposal } from "../../lib/assistant-actions";
import { askStructor, runSavedTask, savedTaskChoices } from "../../lib/assistant-client";
import { SAVED_TASKS, type SavedTask } from "../../lib/assistant-tools";
import { reportFileName, reportWorkbook, type BidPackageReport } from "../../lib/bid-package-report";
import { usd } from "../../lib/format";
import { useLocalDraft } from "../../lib/use-local-draft";
import { manualGuides } from "../../lib/user-manual";
import type { Screen } from "./shared";
import "./ask-structor.css";

type ProposalState = { proposal: Proposal; status: "pending" | "applied" | "dismissed" | "undone"; error?: string };
/** `tools`: what an answer was read from, told to the AI with the history so it trusts its earlier answers. */
type Message = { role: "user" | "assistant"; text: string; screens?: string[]; tools?: string[]; proposals?: ProposalState[]; reports?: BidPackageReport[] };
/** Messages kept per project in this browser. */
const KEPT = 40;
const STARTERS = ["Who is the apparent low bidder on each trade?", "Which budget lines are over budget?", "What RFIs are still open?", "What is this page for?"];
const OUTCOME = { pending: "not applied yet", applied: "applied by the user", dismissed: "dismissed by the user", undone: "applied, then undone by the user" };
const pageTitle = (id: string) => manualGuides.find(g => g.id === id)?.title ?? id;
const money = (n: number | null) => n == null ? "–" : usd(n);

/**
 * Ask Structor (Danial, 15 Oct; live project data and approved changes 22 Oct): questions about the
 * open project are answered from its live data and how-to questions from the built-in guide. Changes
 * the assistant proposes appear as cards and happen only when the user clicks Apply; Undo restores
 * the page's data while nothing else has changed it. Each project's chat is kept in this browser
 * (Danial, 22 Oct: "are the chats not saved?"); Undo lasts until the page is reloaded. Saved tasks
 * (the bid package summary first) run from their list without the AI, or when asked for in words.
 */
export function AskStructor({ currentScreen, onOpenManual, onNavigate }: { currentScreen: Screen; onOpenManual: () => void; onNavigate: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useLocalDraft<Message[]>("assistant-chat", []);
  const messages = saved;
  const setMessages = (change: (prev: Message[]) => Message[]) => setSaved(prev => change(prev).slice(-KEPT));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const list = useRef<HTMLDivElement>(null);
  const applied = useRef(new Map<string, AppliedChange>());
  const page = manualGuides.find(g => g.id === currentScreen)?.title ?? "this page";
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy, tasksOpen]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    // The AI hears what became of its proposals, so "did that go through?" has an answer.
    const history = messages.slice(-6).map(m => ({ role: m.role, text: [m.text, m.tools?.length ? `(read with: ${[...new Set(m.tools)].join(", ")})` : "", ...(m.proposals ?? []).map(p => `[${p.proposal.title}: ${OUTCOME[p.status]}]`), ...(m.reports ?? []).map(r => `[shown: ${r.title}]`)].filter(Boolean).join("\n") }));
    setMessages(prev => [...prev, { role: "user", text: q }]); setDraft(""); setBusy("Reading your question");
    try {
      const reply = await askStructor({ question: q, screen: currentScreen, history }, { onProgress: setBusy });
      setMessages(prev => [...prev, { role: "assistant", text: reply.answer, screens: reply.screens, tools: reply.tools, proposals: reply.proposals.map(proposal => ({ proposal, status: "pending" as const })), reports: reply.reports }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", text: error instanceof Error ? `I couldn't answer that just now (${error.message}). The full guide has every page's steps.` : "I couldn't answer that just now." }]);
    } finally { setBusy(null); }
  }

  async function openTasks() {
    setTasksOpen(o => !o);
    for (const task of SAVED_TASKS) {
      const found = await savedTaskChoices(task).catch((): string[] => []);
      setChoices(prev => ({ ...prev, [task.id]: found }));
      setPicked(prev => ({ ...prev, [task.id]: prev[task.id] && found.includes(prev[task.id]) ? prev[task.id] : found[0] ?? "" }));
    }
  }
  async function runTask(task: SavedTask) {
    const choice = picked[task.id];
    if (!choice || busy) return;
    setTasksOpen(false);
    setMessages(prev => [...prev, { role: "user", text: `Saved task: ${task.title} for ${choice}` }]); setBusy(`Running the ${task.title.toLowerCase()} for ${choice}`);
    try {
      const reply = await runSavedTask(task, choice);
      setMessages(prev => [...prev, { role: "assistant", text: reply.answer, tools: reply.tools, reports: reply.reports }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", text: error instanceof Error ? `The task couldn't run (${error.message}).` : "The task couldn't run." }]);
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
      <header><div><strong>Ask Structor</strong><small>About this project, {page} or anything in the app</small></div><span className="ask-header-actions">
        <button type="button" className="ui-icon-btn" aria-label="Saved tasks" title="Saved tasks" aria-expanded={tasksOpen} disabled={!!busy} onClick={() => void openTasks()}><ListChecks size={16}/></button>
        {messages.length > 0 && <button type="button" className="ui-icon-btn" aria-label="Start a new chat" title="Start a new chat (this project's chat is cleared)" disabled={!!busy} onClick={() => { setMessages(() => []); applied.current.clear(); }}><RotateCcw size={16}/></button>}
        <button type="button" className="ui-icon-btn" aria-label="Close Ask Structor" onClick={() => setOpen(false)}><X size={17}/></button></span></header>
      <div className="ask-messages" ref={list} aria-live="polite">
        {!messages.length && !tasksOpen && <div className="ask-starters"><p>Answers come from this project's live data and Structor's guide. Ask Structor can prepare a change, like a VE idea or an RFI draft, but it only happens when you click Apply. Each project's chat is kept in this browser.</p>{STARTERS.map(s => <button type="button" key={s} onClick={() => void ask(s)}>{s}</button>)}<button type="button" onClick={() => void openTasks()}><ListChecks size={13} aria-hidden="true"/> Saved tasks</button></div>}
        {messages.map((m, i) => <div key={i} className={`ask-message ${m.role}`}>
          <p>{m.text}</p>
          {m.reports?.map(r => <ReportCard key={`${r.packageId}-${r.trade}`} report={r} onNavigate={onNavigate}/>)}
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
        {tasksOpen && <div className="ask-tasks" aria-label="Saved tasks"><strong>Saved tasks</strong><small>They run on this project's data straight away, without the AI. You can also ask for them in words.</small>
          {SAVED_TASKS.map(task => <div key={task.id} className="ask-task">
            <span><b>{task.title}</b><small>{task.description}</small></span>
            {choices[task.id] === undefined ? <small>Finding the trades with bids…</small> : choices[task.id].length ? <div className="ask-proposal-actions">
              <select aria-label={`${task.title}: trade`} value={picked[task.id] ?? ""} onChange={e => setPicked(prev => ({ ...prev, [task.id]: e.target.value }))}>{choices[task.id].map(c => <option key={c}>{c}</option>)}</select>
              <button type="button" className="apply" disabled={!!busy || !picked[task.id]} onClick={() => void runTask(task)}>Run</button>
            </div> : <small>No trade has bids yet. Bids appear once they're submitted or loaded into Bid leveling.</small>}
          </div>)}
        </div>}
        {busy && <div className="ask-message assistant"><p className="ask-progress">{busy}…</p></div>}
      </div>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void ask(draft); }}><input aria-label="Your question" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask about this project…" disabled={!!busy}/><button type="submit" className="ui-icon-btn" aria-label="Send question" disabled={!!busy || !draft.trim()}><Send size={16}/></button></form>
      <button type="button" className="ask-guide" onClick={() => { setOpen(false); onOpenManual(); }}><BookOpen size={15}/>Open the full guide</button>
    </section>}
  </>;
}

/** A bid package summary in the chat: the ranked bids at a glance, everything else in its Excel file. */
function ReportCard({ report, onNavigate }: { report: BidPackageReport; onNavigate: (id: string) => void }) {
  const [error, setError] = useState("");
  async function download() {
    try { const XLSX = await import("xlsx"); XLSX.writeFile(reportWorkbook(report, XLSX), reportFileName(report)); setError(""); }
    catch (e) { setError(e instanceof Error ? `The Excel file couldn't be made (${e.message}).` : "The Excel file couldn't be made."); }
  }
  return <div className="ask-report" aria-label={report.title}>
    <strong>{report.title}</strong>
    <small>{[report.code, report.asSubmitted ? "bids as submitted" : "leveled in Bid leveling", `as of ${report.asOf}`].filter(Boolean).join(" · ")}</small>
    <table>
      <thead><tr><th>#</th><th>Company</th><th>Total</th></tr></thead>
      <tbody>{report.ranked.map(b => <tr key={b.company}><td>{b.rank ?? "–"}</td><td>{b.company}<small>{b.status}</small></td><td>{money(b.leveledTotal ?? b.provisionalTotal)}</td></tr>)}</tbody>
    </table>
    <small>{report.budget != null ? `Trade budget ${money(report.budget)}. ` : ""}{report.adjustments.length} plug{report.adjustments.length === 1 ? "" : "s"} and adjustments, {report.gaps.length} exclusion{report.gaps.length === 1 ? "" : "s"} or gaps: every line is in the Excel file.</small>
    {error && <p className="ask-proposal-error" role="alert">{error}</p>}
    <div className="ask-proposal-actions"><button type="button" className="apply" onClick={() => void download()}><Download size={13} aria-hidden="true"/> Download Excel</button><button type="button" onClick={() => onNavigate("leveling")}>Open Bid leveling</button></div>
  </div>;
}
