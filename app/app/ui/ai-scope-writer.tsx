"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ScopeRunResult } from "../../lib/ai-client";
import { addPage } from "../../lib/drawing-flip";
import { addPackage } from "../../lib/procurement";
import { notOnSheet, recordRun } from "../../lib/extraction";
import { drawingRegister, latestDocuments, specificationSections } from "../../lib/project-files";
import { useProjectDocuments } from "../../lib/project-files-client";
import { sectionsByTrade, sheetsForTrade, tradesToAdd as packagesToAdd, uncoveredSections } from "../../lib/project-scopes";
import { readTradeScope } from "../../lib/scope-reading";
import { getActiveProjectId } from "../../lib/project-scope";
import type { useExtraction } from "../../lib/use-extraction";
import { Button, Modal } from "./shared";

type TradeState = { status: "queued" | "reading" | "done" | "failed" | "skipped"; done: number; total: number; found: number; note: string };
const PARALLEL_TRADES = 3;
// ponytail: creating the first trades swaps the empty Scopes page for the full one, which remounts
// this button; the flag reopens the dialog there so the reading can start.
let reopenAfterTrades = false;

/**
 * "Write scopes with AI" (Marcel, 15 Oct): the AI reads the project manual already stored in Project
 * files and proposes bid-form lines for every trade. Proposals land inside each trade for accept /
 * reject / move / delete; nothing is uploaded twice.
 */
export function AiScopeWriter({ review, notify, onOpenFiles }: { review: ReturnType<typeof useExtraction>; notify: (text: string) => void; onOpenFiles: () => void }) {
  const { documents, ready } = useProjectDocuments();
  // The project manual may come in volumes (24 Oct); every one is read.
  const volumes = useMemo(() => latestDocuments(documents).filter(d => d.kind === "manual"), [documents]);
  const specs = useMemo(() => specificationSections(documents), [documents]);
  const [open, setOpen] = useState(() => { const again = reopenAfterTrades; reopenAfterTrades = false; return again; });
  const packages = review.procurement.packages;
  const assigned = useMemo(() => sectionsByTrade(specs, packages), [specs, packages]);
  const register = useMemo(() => drawingRegister(documents), [documents]);
  const uncovered = useMemo(() => uncoveredSections(specs, packages), [specs, packages]);
  // A new project has no trades yet: offer the ones its manual calls for (15 Oct, Marcel's first question).
  // Standard trades first, then a CSI group (Marcel's list) for every section no trade covers.
  const proposals = useMemo(() => packagesToAdd(packages, { sections: specs, sheets: register }), [packages, specs, register]);
  const [newTrades, setNewTrades] = useState<string[] | null>(null);
  const tradesToAdd = newTrades ?? (packages.length ? [] : proposals.map(p => p.id));
  function createTrades() {
    const chosenTrades = proposals.filter(p => tradesToAdd.includes(p.id));
    const errors = latest.current.runProcurement(current => chosenTrades.reduce((state, p) => addPackage(state, p), current));
    if (errors) { notify(errors); return; }
    setNewTrades(null);
    reopenAfterTrades = !packages.length;
    setChosen(prev => [...new Set([...prev, ...chosenTrades.map(p => p.id)])]);
    notify(`${chosenTrades.length} trade package${chosenTrades.length === 1 ? "" : "s"} added from the project manual.`);
  }
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

  async function readTrade(id: string, signal: AbortSignal) {
    const pkg = packages.find(p => p.id === id)!;
    update(id, { status: "reading" });
    const outcome = await readTradeScope({
      pkg, sections: assigned.get(id) ?? [], sheets: sheetsFor(id), signal,
      onProgress: p => update(id, { status: "reading", done: p.done, total: p.total, note: p.note }),
      addFlipPages: pages => { const errors = latest.current.runFlip(current => pages.reduce((state, page) => state.pages.some(x => x.sheet === page.sheet) ? state : addPage(state, page), current)); return errors ? Object.values(errors)[0] ?? "A sheet could not be added to Drawing Flip." : null; },
    });
    const message = record(outcome);
    if (message) throw new Error(message);
    const held = outcome.input.drafts.filter(d => d.kind === "scope" && notOnSheet(d)).length;
    const notes = [outcome.failures.length ? `${outcome.failures.length} request(s) failed; the run notes list the pages.` : "", held ? `${held} flagged: the words they quote aren't printed on the sheet.` : ""].filter(Boolean).join(" ");
    update(id, { status: outcome.input.error && !outcome.input.drafts.length ? "failed" : "done", found: outcome.input.drafts.filter(d => d.kind === "scope").length, note: outcome.input.error ?? notes });
  }

  async function start() {
    if ((!volumes.length && !register.length) || busy) return;
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
      {!ready ? <p role="status">Looking for the project manual and drawings in Project files…</p> : !volumes.length && !register.length ? <div className="ai-reader"><p>No project manual is stored for this project yet.</p><Button variant="primary" onClick={() => { setOpen(false); onOpenFiles(); }}>Upload it in Project files</Button></div> : <div className="ai-reader">
        <p>{volumes.length ? <><strong>{volumes.map(v => v.name).join(", ")}</strong> · {volumes.reduce((n, v) => n + v.pageCount, 0)} pages · {specs.length} specification sections{volumes.length > 1 ? `, read from all ${volumes.length} volumes` : ""}. Division 01 general requirements stay in the General section.</> :"No project manual is stored, so the drawings alone will be read. Scopes from drawings can miss specification requirements: upload the manual when you have it."}</p>
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
        {proposals.length > 0 && <div className="ai-new-trades">
          <p><strong>{packages.length ? `The manual calls for ${proposals.length} more trade${proposals.length === 1 ? "" : "s"}` : "This project has no trade packages yet"}.</strong> Create them from the project files, then read their scopes; each lists the sections and sheets it came from. Owners and due dates can be set in Bid packages.</p>
          <div className="ai-section-list">{proposals.map(p => <label key={p.id}><input type="checkbox" disabled={busy} checked={tradesToAdd.includes(p.id)} onChange={e => setNewTrades(e.target.checked ? [...tradesToAdd, p.id] : tradesToAdd.filter(id => id !== p.id))}/><span><strong>{p.code} · {p.name}</strong><small>{[p.sections.length ? `sections ${p.sections.slice(0, 5).join(", ")}${p.sections.length > 5 ? "…" : ""}` : "", p.sheets.length ? `sheets ${p.sheets.slice(0, 5).join(", ")}${p.sheets.length > 5 ? "…" : ""}` : ""].filter(Boolean).join(" · ")}</small></span></label>)}</div>
          <Button disabled={busy || !tradesToAdd.length} onClick={createTrades}>Create {tradesToAdd.length} trade package{tradesToAdd.length === 1 ? "" : "s"}</Button>
        </div>}
        {uncovered.length > 0 && <details><summary>{uncovered.length} section{uncovered.length === 1 ? "" : "s"} have no trade package yet</summary><p>{uncovered.map(s => `${s.section} ${s.title}`).join(" · ")}</p></details>}
        <p className="ai-privacy">Selected section text goes to DeepSeek, about five pages per request ({Math.ceil(totalPages / 5)} requests for {totalPages} pages){totalSheets ? `, and ${totalSheets} drawing sheets, one image each` : ""}. Every proposal keeps its page and the exact words it relied on.</p>
        <div className="proc-form-actions">{busy ? <Button onClick={() => controller.current?.abort()}>Stop and keep finished trades</Button> : <Button onClick={() => setOpen(false)}>Close</Button>}<Button variant="primary" disabled={busy || !chosen.length} onClick={() => void start()}>{busy ? "Reading…" : `Read ${chosen.length} trade${chosen.length === 1 ? "" : "s"}`}</Button></div>
      </div>}
    </Modal>}
  </>;
}
