"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { answerLeave, askToLeave, useAutoScopes } from "../../lib/auto-scopes";
import { runFiles, runProgress, type AutoRun } from "../../lib/auto-scope-plan";
import { timeLeftLabel } from "../../lib/run-time-left";
import { Button, Modal } from "./shared";
import "./ai-run-card.css";

/**
 * The automatic scope run's progress card (Danial, 26 Oct: "a small notification at the bottom that shows
 * progress ... once it's done it goes away" and shows in the notification center). Also our own "please
 * don't close this tab" box for reloading while the AI works: F5 and Ctrl+R ask here first.
 */
export function AiRunCard({ projectId }: { projectId: string }) {
  const { run, leave, left, elsewhere } = useAutoScopes(projectId);
  useEffect(() => {
    if (!run) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        void askToLeave().then(go => { if (go) window.location.reload(); });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [run]);
  if (!run && !leave) return elsewhere ? <ElsewhereCard run={elsewhere}/> : null;
  const { done, total } = run ? runProgress(run) : { done: 0, total: 0 };
  const reading = run?.trades.filter(t => t.status === "reading") ?? [];
  // The bar follows the time: the share gone by of the time the run will take (lib/run-time-left).
  const percent = left ? Math.round(left.share * 100) : total ? Math.round((done / total) * 100) : 0;
  return <>
    {run && <section className="ai-run-card" role="status" aria-live="polite" aria-label="AI is writing scopes">
      <span className="ai-run-icon"><Sparkles size={16}/></span>
      <div className="ai-run-copy">
        <strong>AI is reading {runFiles(run)}</strong>
        <small>{total ? `${done} of ${total} trades · ${run.added} scope item${run.added === 1 ? "" : "s"} added` : run.update || run.stage ? "Reading the new revision…" : "Setting up the bid packages…"}{run.newTrades.length ? ` · ${run.newTrades.length} new bid package${run.newTrades.length === 1 ? "" : "s"}` : ""}</small>
        {run.update && <small>Revision: {run.update.sheets.length} changed sheet{run.update.sheets.length === 1 ? "" : "s"}, {run.update.sections.length} changed section{run.update.sections.length === 1 ? "" : "s"}</small>}
        <span className="ai-run-bar" aria-hidden><i style={{ width: `${Math.max(4, percent)}%` }}/></span>
        {left && <small className="ai-run-left">{timeLeftLabel(left.seconds)}</small>}
        {reading.length > 0 ? <small className="ai-run-now">Now: {reading.map(t => t.name).join(", ")}</small> : run.stage && <small className="ai-run-now">{run.stage}</small>}
        <small className="ai-run-keep">Keep this tab open until it finishes.</small>
      </div>
    </section>}
    {leave && <Modal title="Please don't close this tab" subtitle="The AI is extracting scopes from the uploaded files." onClose={() => answerLeave(false)}>
      <p className="ai-run-leave">{run ? `${done} of ${total} trades are done${left ? `; ${timeLeftLabel(left.seconds).toLowerCase()}` : ""}. ` : ""}Closing or reloading now stops the reading. What is finished is kept, and the rest is read the next time this project is opened.</p>
      <div className="proc-form-actions"><Button onClick={() => answerLeave(true)}>Close anyway</Button><Button variant="primary" onClick={() => answerLeave(false)}>Wait for AI</Button></div>
    </Modal>}
  </>;
}

/** A run someone else's browser is reading on this project (shared saving): what it has done so far. */
function ElsewhereCard({ run }: { run: AutoRun }) {
  const { done, total } = runProgress(run);
  return <section className="ai-run-card" role="status" aria-live="polite" aria-label="AI is writing scopes in another browser">
    <span className="ai-run-icon"><Sparkles size={16}/></span>
    <div className="ai-run-copy">
      <strong>AI is reading {runFiles(run)} in another browser</strong>
      <small>{total ? `${done} of ${total} trades · ${run.added} scope item${run.added === 1 ? "" : "s"} added` : "Setting up the bid packages…"}</small>
      <span className="ai-run-bar" aria-hidden><i style={{ width: `${Math.max(4, total ? Math.round((done / total) * 100) : 0)}%` }}/></span>
      <small className="ai-run-now">Its findings appear here as they are saved. Nothing is read twice.</small>
    </div>
  </section>;
}
