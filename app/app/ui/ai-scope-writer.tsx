"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { extractTradeScope, chunkPages, type ScopeRunResult } from "../../lib/ai-client";
import { recordRun } from "../../lib/extraction";
import { consolidateScope } from "../../lib/ai-more-client";
import { findManual } from "../../lib/project-files";
import { readStoredText, useProjectDocuments } from "../../lib/project-files-client";
import { sectionsByTrade, uncoveredSections } from "../../lib/project-scopes";
import { getActiveProjectId } from "../../lib/project-scope";
import type { ManualSection } from "../../lib/manual-sections";
import type { useExtraction } from "../../lib/use-extraction";
import { Button, Modal } from "./shared";

type TradeState = { status: "queued" | "reading" | "done" | "failed" | "skipped"; done: number; total: number; found: number; note: string };
const PARALLEL_TRADES = 3;

/**
 * "Write scopes with AI" (Marcel, 15 Oct): the AI reads the project manual already stored in Project
 * files and proposes bid-form lines for every trade. Proposals land inside each trade for accept /
 * reject / move / delete; nothing is uploaded twice.
 */
export function AiScopeWriter({ review, notify, onOpenFiles }: { review: ReturnType<typeof useExtraction>; notify: (text: string) => void; onOpenFiles: () => void }) {
  const { documents, ready } = useProjectDocuments();
  const manual = findManual(documents);
  const [open, setOpen] = useState(false);
  const packages = review.procurement.packages;
  const assigned = useMemo(() => manual ? sectionsByTrade(manual.sections, packages) : new Map(), [manual, packages]);
  const uncovered = useMemo(() => manual ? uncoveredSections(manual.sections, packages) : [], [manual, packages]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, TradeState>>({});
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(review);
  latest.current = review;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open && !busy && !chosen.length) setChosen(packages.filter(p => (assigned.get(p.id)?.length ?? 0) > 0).map(p => p.id)); }, [open, assigned]);

  const pages = (id: string) => (assigned.get(id) ?? []).reduce((n: number, s: { first: number; last: number }) => n + s.last - s.first + 1, 0);
  const update = (id: string, change: Partial<TradeState>) => setStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: "queued", done: 0, total: 0, found: 0, note: "" }), ...change } }));

  function record(outcome: ScopeRunResult) {
    const input = { ...outcome.input, notes: { failures: outcome.failures.map(f => `${f.section} · pages ${f.pages}: ${f.error}`), screening: outcome.dropped.map(d => `${d.what}: ${d.reason}`) } };
    return latest.current.run(current => recordRun(current, latest.current.procurement, input));
  }

  async function readTrade(id: string, signal: AbortSignal) {
    const pkg = packages.find(p => p.id === id)!;
    const stored = assigned.get(id) ?? [];
    update(id, { status: "reading", done: 0, total: 0, note: "Loading section text…" });
    const text = await readStoredText(manual!, { first: Math.min(...stored.map((s: { first: number }) => s.first)), last: Math.max(...stored.map((s: { last: number }) => s.last)) });
    const sections: ManualSection[] = stored.map((s: { section: string; title: string; first: number; last: number }) => ({ section: s.section, title: s.title, firstPage: s.first, lastPage: s.last, pages: text.filter(p => p.page >= s.first && p.page <= s.last && p.text.trim()) })).filter((s: ManualSection) => s.pages.length);
    const total = sections.reduce((n, s) => n + chunkPages(s.pages).length, 0);
    update(id, { total, note: "" });
    const outcome = await extractTradeScope({ pkg, manual: { name: manual!.name, pageCount: manual!.pageCount }, sections, signal, onProgress: (done, all) => update(id, { done, total: all }) });
    // One finding per paragraph → one line per thing the subcontractor prices.
    if (outcome.input.drafts.length > 12 && !signal.aborted) {
      update(id, { note: "Writing bid-form lines…", total: 0 });
      try {
        const lines = await consolidateScope(pkg.name, outcome.input.drafts, signal, Object.fromEntries(stored.map((s: { section: string; title: string }) => [s.section, s.title])));
        outcome.input = { ...outcome.input, drafts: lines.drafts };
        if (lines.merged) outcome.dropped.push({ what: `${lines.merged} paragraph findings`, reason: `Merged into ${lines.drafts.filter(d => d.kind === "scope").length} bid-form lines${lines.dropped ? `; ${lines.dropped} judged boilerplate` : ""}.` });
      } catch (error) {
        outcome.dropped.push({ what: "Bid-form lines", reason: `Could not merge findings (${error instanceof Error ? error.message : "AI error"}); every paragraph finding is listed.` });
      }
    }
    const message = record(outcome);
    if (message) throw new Error(message);
    update(id, { status: outcome.input.error && !outcome.input.drafts.length ? "failed" : "done", found: outcome.input.drafts.filter(d => d.kind === "scope").length, note: outcome.input.error ?? (outcome.failures.length ? `${outcome.failures.length} request(s) failed; the run notes list the pages.` : "") });
  }

  async function start() {
    if (!manual || busy) return;
    const projectId = getActiveProjectId();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy(true);
    setStates(Object.fromEntries(chosen.map(id => [id, { status: "queued", done: 0, total: 0, found: 0, note: "" } as TradeState])));
    const queue = [...chosen];
    let found = 0, failed = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL_TRADES, queue.length) }, async () => {
      while (queue.length && !signal.aborted && projectId === getActiveProjectId()) {
        const id = queue.shift()!;
        try { await readTrade(id, signal); found++; }
        catch (error) { failed++; update(id, { status: "failed", note: error instanceof Error ? error.message : "The reading failed." }); }
      }
    }));
    for (const id of queue) update(id, { status: "skipped", note: "Stopped before this trade." });
    setBusy(false);
    notify(signal.aborted ? "Reading stopped. Completed trades keep their proposals." : `AI scope proposals are ready in ${found} trade${found === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}. Review them inside each trade.`);
  }

  const totalPages = chosen.reduce((n, id) => n + pages(id), 0);
  return <>
    <Button onClick={() => setOpen(true)}><Sparkles size={15}/>Write scopes with AI</Button>
    {open && <Modal title="Write scopes with AI" subtitle="The AI reads the project manual in Project files and proposes bid-form lines for each trade. You accept, reject, move or delete every line." wide onClose={() => { if (!busy) setOpen(false); }}>
      {!ready ? <p role="status">Looking for the project manual in Project files…</p> : !manual ? <div className="ai-reader"><p>No project manual is stored for this project yet.</p><Button variant="primary" onClick={() => { setOpen(false); onOpenFiles(); }}>Upload it in Project files</Button></div> : <div className="ai-reader">
        <p><strong>{manual.name}</strong> · {manual.pageCount} pages · {manual.sections.length} specification sections. Division 01 general requirements stay in the General section.</p>
        <div className="ai-section-actions"><Button disabled={busy} onClick={() => setChosen(packages.filter(p => pages(p.id) > 0).map(p => p.id))}>Select every trade</Button><Button disabled={busy} onClick={() => setChosen([])}>Clear</Button></div>
        <div className="ai-section-list">{packages.map(pkg => {
          const sections = assigned.get(pkg.id) ?? [];
          const state = states[pkg.id];
          return <label key={pkg.id}><input type="checkbox" disabled={busy || !sections.length} checked={chosen.includes(pkg.id)} onChange={e => setChosen(e.target.checked ? [...chosen, pkg.id] : chosen.filter(id => id !== pkg.id))}/><span>
            <strong>{pkg.code} · {pkg.name}</strong>
            <small>{sections.length ? `${sections.length} section${sections.length === 1 ? "" : "s"} · ${pages(pkg.id)} pages: ${sections.slice(0, 6).map((s: { section: string }) => s.section).join(", ")}${sections.length > 6 ? "…" : ""}` : "No sections in this trade's division"}</small>
            {state && <small role="status">{state.status === "reading" ? (state.total ? `Reading request ${state.done} of ${state.total}` : state.note) : state.status === "done" ? `Done · ${state.found} scope proposal${state.found === 1 ? "" : "s"}${state.note ? ` · ${state.note}` : ""}` : state.status === "failed" ? `Failed · ${state.note}` : state.status === "skipped" ? state.note : "Waiting"}</small>}
          </span></label>;
        })}</div>
        {uncovered.length > 0 && <details><summary>{uncovered.length} section{uncovered.length === 1 ? "" : "s"} have no trade package yet</summary><p>{uncovered.map(s => `${s.section} ${s.title}`).join(" · ")}</p></details>}
        <p className="ai-privacy">Selected section text goes to DeepSeek, about five pages per request ({Math.ceil(totalPages / 5)} requests for {totalPages} pages). Every proposal keeps its page and the exact words it relied on.</p>
        <div className="proc-form-actions">{busy ? <Button onClick={() => controller.current?.abort()}>Stop and keep finished trades</Button> : <Button onClick={() => setOpen(false)}>Close</Button>}<Button variant="primary" disabled={busy || !chosen.length} onClick={() => void start()}>{busy ? "Reading…" : `Read ${chosen.length} trade${chosen.length === 1 ? "" : "s"}`}</Button></div>
      </div>}
    </Modal>}
  </>;
}
