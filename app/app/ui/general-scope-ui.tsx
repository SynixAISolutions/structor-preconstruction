"use client";

import { useState, type FormEvent } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Pencil, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { Button, Empty } from "./shared";
import { addGeneralLine, editGeneralLine, generalItems, generalStale, removeGeneralLine, uncovered } from "../../lib/general-scope";
import { writeGeneralScope } from "../../lib/general-scope-client";
import type { Procurement, TradePackage } from "../../lib/procurement";
import { displayDate } from "../../lib/format";
import { useScopeEvidence } from "../../lib/use-scope-evidence";
import type { Evidence } from "../../lib/scope-evidence";
import { OpenSourceButton, ScopeSourceModal } from "./package-scope-sources";
import "./general-scope.css";

/**
 * A trade's general scope (Marcel, 18 Nov meeting: a "general scope tab" beside the detailed one, written like his bid
 * forms, "very general, summarized"). The AI lumps the detailed items into a few lines; each line shows the items it
 * covers, and the estimator can reword, remove or add lines.
 */
export function GeneralScopePanel({ projectId, state, pkg, run, by, notify }: { projectId: string; state: Procurement; pkg: TradePackage; run: (action: (current: Procurement) => Procurement) => unknown; by: string; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false), [open, setOpen] = useState<string[]>([]), [editing, setEditing] = useState<string | null>(null), [adding, setAdding] = useState(false);
  const general = pkg.general;
  const items = generalItems(state, pkg.id);
  const byId = new Map(items.map(i => [i.id, i]));
  const missing = general ? uncovered(state, pkg) : [];
  const stale = generalStale(state, pkg);
  // Where a line comes from (Danial, 19 Nov: "where is the button that will show me where they are coming from in the
  // drawing"): the sources of every item it covers, one chip each, opened on the first drawing.
  const evidenceOf = useScopeEvidence();
  const [opened, setOpened] = useState<{ title: string; evidence: Evidence[]; index: number } | null>(null);
  const lineEvidence = (members: string[]) => [...new Map(members.map(id => byId.get(id)).filter(Boolean).flatMap(item => evidenceOf(item!)).map(e => [e.key, e])).values()];
  // Trades read before general scopes existed (Whittier's): every one still without one, written one after another.
  const waiting = state.packages.filter(p => !p.general && generalItems(state, p.id).length);
  const [allBusy, setAllBusy] = useState("");
  async function writeAll() {
    let written = 0;
    for (const [n, p] of waiting.entries()) {
      setAllBusy(`Writing ${n + 1} of ${waiting.length}: ${p.name}…`);
      try { await writeGeneralScope(projectId, p.id, by); written++; } catch { /* a trade that fails keeps its button */ }
    }
    setAllBusy("");
    notify(`General scope written for ${written} of ${waiting.length} trade${waiting.length === 1 ? "" : "s"}.`);
  }
  const everyTrade = waiting.length > 1 ? <Button disabled={!!allBusy || busy} onClick={() => void writeAll()}><Sparkles size={14}/>{allBusy || `Write for every trade (${waiting.length})`}</Button> : null;

  async function write() {
    setBusy(true);
    try { const lines = await writeGeneralScope(projectId, pkg.id, by); notify(`${pkg.name}: general scope written in ${lines} line${lines === 1 ? "" : "s"}.`); }
    catch (error) { notify(error instanceof Error ? error.message : "The general scope couldn't be written. Try again."); }
    finally { setBusy(false); }
  }
  const act = (action: (current: Procurement) => Procurement, done?: string) => {
    try { run(action); if (done) notify(done); return true; }
    catch (error) { notify(error instanceof Error ? error.message : "That couldn't be saved."); return false; }
  };
  function saveLine(event: FormEvent<HTMLFormElement>, lineId: string | null) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("text") ?? "");
    if (lineId ? act(s => editGeneralLine(s, pkg.id, lineId, text)) : act(s => addGeneralLine(s, pkg.id, text), "Line added.")) { setEditing(null); setAdding(false); }
  }
  async function copy() {
    if (!general) return;
    try { await navigator.clipboard.writeText([`${pkg.name}${pkg.code ? ` (${pkg.code})` : ""}`, ...general.lines.map(l => `- ${l.text}`)].join("\n")); notify("General scope copied."); }
    catch { notify("Copy couldn't reach the clipboard."); }
  }

  if (!general) return <div className="general-scope">
    <Empty title={items.length ? "No general scope yet" : "No detailed items to summarize yet"} description={items.length ? `The AI lumps this trade's ${items.length} detailed items into a few general lines, the way your bid forms read. Each line keeps the items it covers.` : "Write or read this trade's scope first; the general scope is written from its detailed items."}
      action={<span className="general-scope-actions">{items.length > 0 && <Button variant="primary" disabled={busy || !!allBusy} onClick={() => void write()}><Sparkles size={15}/>{busy ? "Writing…" : "Write general scope"}</Button>}{everyTrade}</span>}/>
  </div>;

  return <div className="general-scope">
    <div className="general-scope-head">
      <span>{general.lines.length} line{general.lines.length === 1 ? "" : "s"} covering {items.length - missing.length} of {items.length} detailed items · written {displayDate(general.at.slice(0, 10))}{general.by ? ` by ${general.by}` : ""}</span>
      <span className="general-scope-actions">{everyTrade}<Button onClick={() => void copy()}><Copy size={14}/>Copy</Button><Button disabled={busy} onClick={() => void write()}><RefreshCw size={14}/>{busy ? "Writing…" : "Rewrite"}</Button></span>
    </div>
    {(stale || missing.length > 0) && <p className="general-scope-stale" role="status">{missing.length ? `${missing.length} detailed item${missing.length === 1 ? " isn't" : "s aren't"} covered by a general line${stale ? ": the detailed scope changed since this was written" : ""}.` : "The detailed scope changed since this was written."} Rewrite to include {missing.length === 1 ? "it" : "them"}.</p>}
    <ol className="general-scope-lines" role="list">{general.lines.map((line, lineIndex) => {
      const expanded = open.includes(line.id), covered = line.members.map(id => byId.get(id)).filter(Boolean);
      const evidence = lineEvidence(line.members);
      return <li key={line.id}>
        <span className="general-scope-index" aria-hidden="true">{String(lineIndex + 1).padStart(2, "0")}</span>
        {editing === line.id
          ? <form className="general-scope-edit" onSubmit={e => saveLine(e, line.id)}><input name="text" autoFocus defaultValue={line.text} maxLength={400} aria-label="General scope line"/><button type="submit" className="ui-icon-btn" aria-label="Save line"><Check size={14}/></button><button type="button" className="ui-icon-btn" aria-label="Cancel" onClick={() => setEditing(null)}><X size={14}/></button></form>
          : <div className="general-scope-line"><span className="general-scope-text">{line.text}{line.edited && <small> · edited</small>}</span>
            <span className="general-scope-line-actions"><OpenSourceButton evidence={evidence} onOpen={index => setOpened({ title: line.text, evidence, index })}/>{covered.length > 0 && <button type="button" className="general-scope-disclosure" aria-expanded={expanded} onClick={() => setOpen(o => expanded ? o.filter(x => x !== line.id) : [...o, line.id])}>{expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}{covered.length} item{covered.length === 1 ? "" : "s"}</button>}
              <button type="button" className="ui-icon-btn" aria-label={`Edit: ${line.text}`} onClick={() => setEditing(line.id)}><Pencil size={13}/></button>
              <button type="button" className="ui-icon-btn general-scope-remove" aria-label={`Remove: ${line.text}`} onClick={() => act(s => removeGeneralLine(s, pkg.id, line.id), "Line removed.")}><Trash2 size={13}/></button></span></div>}
        {expanded && <ul className="general-scope-members">{covered.map(item => <li key={item!.id}><span>{item!.title}</span><OpenSourceButton evidence={evidenceOf(item!)} onOpen={index => setOpened({ title: item!.title, evidence: evidenceOf(item!), index })}/></li>)}</ul>}
      </li>;
    })}</ol>
    {adding ? <form className="general-scope-edit" onSubmit={e => saveLine(e, null)}><input name="text" autoFocus maxLength={400} placeholder="e.g. Temporary protection of adjacent finishes" aria-label="New general scope line"/><button type="submit" className="ui-icon-btn" aria-label="Add line"><Check size={14}/></button><button type="button" className="ui-icon-btn" aria-label="Cancel" onClick={() => setAdding(false)}><X size={14}/></button></form>
      : <Button onClick={() => setAdding(true)}><Plus size={14}/>Add a line</Button>}
    {opened && <ScopeSourceModal title={opened.title} evidence={opened.evidence} index={opened.index} onClose={() => setOpened(null)}/>}
  </div>;
}
