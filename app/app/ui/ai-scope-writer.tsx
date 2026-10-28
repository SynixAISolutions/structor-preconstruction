"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ScopeRunResult } from "../../lib/ai-client";
import { addPage } from "../../lib/drawing-flip";
import { notOnSheet, recordRun } from "../../lib/extraction";
import { drawingRegister, latestDocuments, specificationSections } from "../../lib/project-files";
import { useProjectDocuments } from "../../lib/project-files-client";
import { sectionsByTrade, sheetsForTrade, uncoveredSections } from "../../lib/project-scopes";
import { applyBidPackagePlan, type BidPackagePlan } from "../../lib/bid-package-ai";
import { planBidPackages } from "../../lib/bid-package-client";
import { dollars, estimateCost } from "../../lib/ai-cost";
import { useAiReader } from "../../lib/ai-reader-client";
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
  // The bid packages are the AI's to set (Danial, 28 Oct: "YOU CANT WRITE THE WHOLE LIST U NEED AI"): it reads the
  // manual's sections and the drawing index, and the estimator reviews what it proposes before it is used.
  const reader = useAiReader();
  const [plan, setPlan] = useState<(BidPackagePlan & { model: string; cost?: number | null }) | null>(null);
  const [planning, setPlanning] = useState<{ reading: boolean; error: string }>({ reading: false, error: "" });
  async function askForPackages() {
    setPlan(null); setPlanning({ reading: true, error: "" });
    try { setPlan(await planBidPackages(documents, packages)); setPlanning({ reading: false, error: "" }); }
    catch (error) { setPlanning({ reading: false, error: error instanceof Error ? error.message : "The AI could not set the bid packages." }); }
  }
  function applyPlan() {
    if (!plan) return;
    let added = 0;
    const errors = latest.current.runProcurement(current => { const applied = applyBidPackagePlan(current, plan); added = applied.added.length; return applied.procurement; });
    if (errors) { notify(errors); return; }
    reopenAfterTrades = !packages.length;
    setPlan(null);
    setChosen([]);
    notify(`Bid packages set by the AI: ${added} new, ${plan.packages.length - added} updated with their sections and sheets.`);
  }
  const [withDrawings, setWithDrawings] = useState(true);
  const sheetsFor = (id: string) => withDrawings ? sheetsForTrade(register, packages.find(p => p.id === id) ?? "") : [];
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
  // Claude costs money per page: the estimate shows before the reading starts (Danial, 28 Oct). A manual page holds
  // about 3,500 characters; a sheet sends its image and its text.
  const estimate = reader?.reader === "claude" ? estimateCost(reader.model, { requests: Math.ceil(totalPages / 5) + totalSheets, chars: totalPages * 3_500 + totalSheets * 4_000, images: totalSheets }) : null;
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
        <div className="ai-new-trades">
          <p><strong>{packages.length ? "Bid packages" : "This project has no bid packages yet"}.</strong> The AI reads the manual's table of contents and the drawing index and sets the packages a general contractor would buy this project in: the sections each one carries and the sheets that show its work. You review them before they are used; owners and due dates are set in Bid packages.</p>
          {plan ? <>
            <p role="status">{plan.model} proposes {plan.packages.length} package{plan.packages.length === 1 ? "" : "s"}, {plan.packages.filter(p => !p.existing && !packages.some(x => x.name.toLowerCase() === p.name.toLowerCase())).length} of them new{plan.cost ? ` (this cost ${dollars(plan.cost)})` : ""}.</p>
            <div className="ai-section-list">{plan.packages.map(p => <label key={p.name}><span>
              <strong>{p.code} · {p.name}{p.existing || packages.some(x => x.name.toLowerCase() === p.name.toLowerCase()) ? "" : " · new"}</strong>
              <small>{[p.sections.length ? `sections ${p.sections.slice(0, 8).join(", ")}${p.sections.length > 8 ? "…" : ""}` : "no sections", p.sheets.length ? `sheets ${p.sheets.join(", ")}` : ""].filter(Boolean).join(" · ")}</small>
              {p.why && <small>{p.why}</small>}
            </span></label>)}</div>
            {plan.unassigned.length > 0 && <p role="alert">{plan.unassigned.length} section{plan.unassigned.length === 1 ? " is" : "s are"} in no package: {plan.unassigned.slice(0, 12).join(", ")}{plan.unassigned.length > 12 ? "…" : ""}. They stay with the trade of their CSI division until you move them.</p>}
            {plan.dropped.length > 0 && <details><summary>{plan.dropped.length} of the AI's answers set aside</summary><p>{plan.dropped.map(d => `${d.what}: ${d.reason}`).join(" · ")}</p></details>}
            <div className="ai-section-actions"><Button disabled={busy} onClick={() => setPlan(null)}>Discard</Button><Button variant="primary" disabled={busy} onClick={applyPlan}>Use these {plan.packages.length} packages</Button></div>
          </> : <Button disabled={busy || planning.reading || (!specs.length && !register.length)} onClick={() => void askForPackages()}><Sparkles size={15}/>{planning.reading ? "The AI is setting the bid packages…" : packages.length ? "Ask the AI to set the bid packages again" : "Set the bid packages with AI"}</Button>}
          {planning.error && <p role="alert">{planning.error}</p>}
        </div>
        {uncovered.length > 0 && <details><summary>{uncovered.length} section{uncovered.length === 1 ? "" : "s"} have no trade package yet</summary><p>{uncovered.map(s => `${s.section} ${s.title}`).join(" · ")}</p></details>}
        <p className="ai-privacy">Selected section text goes to Structor's AI (Claude when it is set up on the server), about five pages per request ({Math.ceil(totalPages / 5)} requests for {totalPages} pages){totalSheets ? `, and ${totalSheets} drawing sheets, one image each` : ""}. Every proposal keeps its page and the exact words it relied on.{estimate !== null && <> <strong>Estimated cost with {reader!.model}: about {dollars(estimate)}.</strong> Pick fewer trades to spend less.</>}</p>
        <div className="proc-form-actions">{busy ? <Button onClick={() => controller.current?.abort()}>Stop and keep finished trades</Button> : <Button onClick={() => setOpen(false)}>Close</Button>}<Button variant="primary" disabled={busy || !chosen.length} onClick={() => void start()}>{busy ? "Reading…" : `Read ${chosen.length} trade${chosen.length === 1 ? "" : "s"}`}</Button></div>
      </div>}
    </Modal>}
  </>;
}
