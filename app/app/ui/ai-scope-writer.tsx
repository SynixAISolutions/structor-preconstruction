"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { extractDrawingScope, extractTradeScope, chunkPages, type ScopeRunResult } from "../../lib/ai-client";
import { addPage } from "../../lib/drawing-flip";
import { recordRun } from "../../lib/extraction";
import { consolidateScope } from "../../lib/ai-more-client";
import { drawingRegister, findManual, type RegisterRow } from "../../lib/project-files";
import { readStoredText, renderStoredPage, useProjectDocuments } from "../../lib/project-files-client";
import { sectionsByTrade, sheetsForTrade, uncoveredSections } from "../../lib/project-scopes";
import { getActiveProjectId } from "../../lib/project-scope";
import type { ManualSection } from "../../lib/manual-sections";
import type { useExtraction } from "../../lib/use-extraction";
import { Button, Modal } from "./shared";

type TradeState = { status: "queued" | "reading" | "done" | "failed" | "skipped"; done: number; total: number; found: number; note: string };
const PARALLEL_TRADES = 3;

/** One trade's specification and drawing readings as one run (both documents cited). */
const mergeRuns = (a: ScopeRunResult, b: ScopeRunResult): ScopeRunResult => {
  const drafts = [...a.input.drafts, ...b.input.drafts];
  return {
    input: { ...a.input, documents: [...a.input.documents, ...b.input.documents.filter(d => !a.input.documents.some(x => x.name === d.name))], drafts, finishedAt: b.input.finishedAt, error: drafts.length ? undefined : a.input.error ?? b.input.error },
    dropped: [...a.dropped, ...b.dropped], failures: [...a.failures, ...b.failures], drawingPages: [...(a.drawingPages ?? []), ...(b.drawingPages ?? [])],
  };
};

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
  const register = useMemo(() => drawingRegister(documents), [documents]);
  const [withDrawings, setWithDrawings] = useState(true);
  const sheetsFor = (id: string) => withDrawings ? sheetsForTrade(register, packages.find(p => p.id === id)?.code ?? "") : [];
  const [chosen, setChosen] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, TradeState>>({});
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(review);
  latest.current = review;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open && !busy && !chosen.length) setChosen(packages.filter(p => (assigned.get(p.id)?.length ?? 0) > 0 || sheetsFor(p.id).length > 0).map(p => p.id)); }, [open, assigned]);

  const pages = (id: string) => (assigned.get(id) ?? []).reduce((n: number, s: { first: number; last: number }) => n + s.last - s.first + 1, 0);
  const update = (id: string, change: Partial<TradeState>) => setStates(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: "queued", done: 0, total: 0, found: 0, note: "" }), ...change } }));

  function record(outcome: ScopeRunResult) {
    const input = { ...outcome.input, notes: { failures: outcome.failures.map(f => `${f.section} · pages ${f.pages}: ${f.error}`), screening: outcome.dropped.map(d => `${d.what}: ${d.reason}`) } };
    return latest.current.run(current => recordRun(current, latest.current.procurement, input));
  }

  /** Reads a trade's drawing sheets (image + text layer), one set at a time, and adds missing sheets to Drawing Flip for the highlights. */
  async function readSheets(pkg: (typeof packages)[number], sheets: RegisterRow[], signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<ScopeRunResult | null> {
    let merged: ScopeRunResult | null = null, done = 0;
    for (const rows of Map.groupBy(sheets, r => r.doc.id).values()) {
      const doc = rows[0].doc, aspects = new Map<number, number>();
      const text = await readStoredText(doc, { first: Math.min(...rows.map(r => r.page)), last: Math.max(...rows.map(r => r.page)) });
      const outcome = await extractDrawingScope({
        pkg, document: doc.name, pageCount: doc.pageCount, signal, onProgress: d => onProgress(done + d, sheets.length),
        pages: rows.map(r => ({ page: r.page, sheet: r.sheet, text: text.find(p => p.page === r.page)?.text ?? "" })),
        render: page => renderStoredPage(doc, page, 2000).then(r => { aspects.set(page, r.aspect); return { image: r.image }; }),
      });
      done += rows.length;
      const highlighted = new Set(outcome.input.drafts.filter(d => d.kind === "region").map(d => (d as { sheet: string }).sheet));
      const flipErrors = latest.current.runFlip(current => (outcome.drawingPages ?? []).filter(p => highlighted.has(p.sheet)).reduce((state, p) => state.pages.some(x => x.sheet === p.sheet) ? state : addPage(state, { sheet: p.sheet, title: rows.find(r => r.page === p.page)?.title ?? p.sheet, discipline: rows.find(r => r.page === p.page)?.discipline ?? "", revision: "", documentId: doc.id, documentName: doc.name, pageNumber: p.page, aspect: aspects.get(p.page) }), current));
      if (flipErrors) outcome.dropped.push({ what: "Drawing highlights", reason: Object.values(flipErrors)[0] ?? "A sheet could not be added to Drawing Flip." });
      merged = merged ? mergeRuns(merged, outcome) : outcome;
    }
    return merged;
  }

  async function readTrade(id: string, signal: AbortSignal) {
    const pkg = packages.find(p => p.id === id)!;
    const stored = assigned.get(id) ?? [];
    const sheets = sheetsFor(id);
    update(id, { status: "reading", done: 0, total: 0, note: stored.length ? "Loading section text…" : "Reading drawing sheets…" });
    let outcome: ScopeRunResult | null = null;
    if (stored.length && manual) {
      const text = await readStoredText(manual, { first: Math.min(...stored.map((s: { first: number }) => s.first)), last: Math.max(...stored.map((s: { last: number }) => s.last)) });
      const sections: ManualSection[] = stored.map((s: { section: string; title: string; first: number; last: number }) => ({ section: s.section, title: s.title, firstPage: s.first, lastPage: s.last, pages: text.filter(p => p.page >= s.first && p.page <= s.last && p.text.trim()) })).filter((s: ManualSection) => s.pages.length);
      const total = sections.reduce((n, s) => n + chunkPages(s.pages).length, 0);
      update(id, { total, note: "" });
      outcome = await extractTradeScope({ pkg, manual: { name: manual.name, pageCount: manual.pageCount }, sections, signal, onProgress: (done, all) => update(id, { done, total: all }) });
    }
    // One finding per paragraph → one line per thing the subcontractor prices. Specification findings
    // only: drawing findings are already one per item, and their highlights point at their keys.
    if (outcome && outcome.input.drafts.length > 12 && !signal.aborted) {
      update(id, { note: "Writing bid-form lines…", total: 0 });
      try {
        const lines = await consolidateScope(pkg.name, outcome.input.drafts, signal, Object.fromEntries(stored.map((s: { section: string; title: string }) => [s.section, s.title])));
        outcome.input = { ...outcome.input, drafts: lines.drafts };
        if (lines.merged) outcome.dropped.push({ what: `${lines.merged} paragraph findings`, reason: `Merged into ${lines.drafts.filter(d => d.kind === "scope").length} bid-form lines${lines.dropped ? `; ${lines.dropped} judged boilerplate` : ""}.` });
      } catch (error) {
        outcome.dropped.push({ what: "Bid-form lines", reason: `Could not merge findings (${error instanceof Error ? error.message : "AI error"}); every paragraph finding is listed.` });
      }
    }
    if (sheets.length && !signal.aborted) {
      update(id, { total: 0, note: `Reading drawing sheet 1 of ${sheets.length}` });
      const drawn = await readSheets(pkg, sheets, signal, (done, all) => update(id, { total: 0, note: `Reading drawing sheet ${Math.min(done + 1, all)} of ${all}` }));
      if (drawn) outcome = outcome ? mergeRuns(outcome, drawn) : drawn;
    }
    if (!outcome) throw new Error("This trade has no specification sections or drawing sheets to read.");
    const message = record(outcome);
    if (message) throw new Error(message);
    update(id, { status: outcome.input.error && !outcome.input.drafts.length ? "failed" : "done", found: outcome.input.drafts.filter(d => d.kind === "scope").length, note: outcome.input.error ?? (outcome.failures.length ? `${outcome.failures.length} request(s) failed; the run notes list the pages.` : "") });
  }

  async function start() {
    if ((!manual && !register.length) || busy) return;
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
  const totalSheets = chosen.reduce((n, id) => n + sheetsFor(id).length, 0);
  return <>
    <Button onClick={() => setOpen(true)}><Sparkles size={15}/>Write scopes with AI</Button>
    {open && <Modal title="Write scopes with AI" subtitle="The AI reads the project manual and the drawing sheets in Project files and proposes bid-form lines for each trade. You accept, reject, move or delete every line." wide onClose={() => { if (!busy) setOpen(false); }}>
      {!ready ? <p role="status">Looking for the project manual and drawings in Project files…</p> : !manual && !register.length ? <div className="ai-reader"><p>No project manual is stored for this project yet.</p><Button variant="primary" onClick={() => { setOpen(false); onOpenFiles(); }}>Upload it in Project files</Button></div> : <div className="ai-reader">
        <p>{manual ? <><strong>{manual.name}</strong> · {manual.pageCount} pages · {manual.sections.length} specification sections. Division 01 general requirements stay in the General section.</> : "No project manual is stored; the drawings alone will be read."}</p>
        {register.length > 0 && <label className="ai-drawings-toggle"><input type="checkbox" checked={withDrawings} disabled={busy} onChange={e => setWithDrawings(e.target.checked)}/> Also read each trade's drawing sheets ({register.length} sheets stored): plans, schedules and notes, up to six per trade. Highlights go to Drawing Flip.</label>}
        <div className="ai-section-actions"><Button disabled={busy} onClick={() => setChosen(packages.filter(p => pages(p.id) > 0 || sheetsFor(p.id).length > 0).map(p => p.id))}>Select every trade</Button><Button disabled={busy} onClick={() => setChosen([])}>Clear</Button></div>
        <div className="ai-section-list">{packages.map(pkg => {
          const sections = assigned.get(pkg.id) ?? [];
          const sheets = sheetsFor(pkg.id);
          const state = states[pkg.id];
          return <label key={pkg.id}><input type="checkbox" disabled={busy || (!sections.length && !sheets.length)} checked={chosen.includes(pkg.id)} onChange={e => setChosen(e.target.checked ? [...chosen, pkg.id] : chosen.filter(id => id !== pkg.id))}/><span>
            <strong>{pkg.code} · {pkg.name}</strong>
            <small>{sections.length ? `${sections.length} section${sections.length === 1 ? "" : "s"} · ${pages(pkg.id)} pages: ${sections.slice(0, 6).map((s: { section: string }) => s.section).join(", ")}${sections.length > 6 ? "…" : ""}` : "No sections in this trade's division"}{sheets.length ? ` · drawings: ${sheets.map(s => s.sheet).join(", ")}` : ""}</small>
            {state && <small role="status">{state.status === "reading" ? (state.total ? `Reading request ${state.done} of ${state.total}` : state.note) : state.status === "done" ? `Done · ${state.found} scope proposal${state.found === 1 ? "" : "s"}${state.note ? ` · ${state.note}` : ""}` : state.status === "failed" ? `Failed · ${state.note}` : state.status === "skipped" ? state.note : "Waiting"}</small>}
          </span></label>;
        })}</div>
        {uncovered.length > 0 && <details><summary>{uncovered.length} section{uncovered.length === 1 ? "" : "s"} have no trade package yet</summary><p>{uncovered.map(s => `${s.section} ${s.title}`).join(" · ")}</p></details>}
        <p className="ai-privacy">Selected section text goes to DeepSeek, about five pages per request ({Math.ceil(totalPages / 5)} requests for {totalPages} pages){totalSheets ? `, and ${totalSheets} drawing sheets, one image each` : ""}. Every proposal keeps its page and the exact words it relied on.</p>
        <div className="proc-form-actions">{busy ? <Button onClick={() => controller.current?.abort()}>Stop and keep finished trades</Button> : <Button onClick={() => setOpen(false)}>Close</Button>}<Button variant="primary" disabled={busy || !chosen.length} onClick={() => void start()}>{busy ? "Reading…" : `Read ${chosen.length} trade${chosen.length === 1 ? "" : "s"}`}</Button></div>
      </div>}
    </Modal>}
  </>;
}
