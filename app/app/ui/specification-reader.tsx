"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractTradeScope, chunkPages, type ScopeRunResult } from "../../lib/ai-client";
import { manualSections, sectionsInDivision } from "../../lib/manual-sections";
import type { TradePackage } from "../../lib/procurement";
import { getActiveProjectId } from "../../lib/project-scope";
import { AiPdfPicker, type LoadedPdf } from "./ai-pdf-picker";
import { Button } from "./shared";

export function SpecificationReader({ pkg, onRun }: {
  pkg: TradePackage; onRun: (result: ScopeRunResult, file: File) => string | null;
}) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ScopeRunResult | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0), running = useRef(false);
  useEffect(() => () => { request.current++; }, []);
  const sections = useMemo(() => pdf ? manualSections(pdf.text.pages) : [], [pdf]);
  const chosen = sections.filter(s => selected.includes(s.section));
  const visible = sections.filter(s => `${s.section} ${s.title}`.toLowerCase().includes(query.toLowerCase()));
  const calls = chosen.reduce((count, s) => count + chunkPages(s.pages).length, 0);
  async function read() {
    if (!pdf || !chosen.length || running.current) return;
    running.current = true;
    const projectId = getActiveProjectId();
    const current = ++request.current;
    setBusy(true); setError(""); setResult(null); setProgress({ done: 0, total: calls });
    try {
      const outcome = await extractTradeScope({ pkg, manual: pdf.text, sections: chosen, onProgress: (done, total) => { if (current === request.current) setProgress({ done, total }); } });
      if (current !== request.current || projectId !== getActiveProjectId()) return;
      const message = onRun(outcome, pdf.file);
      if (message) throw new Error(message);
      setResult(outcome);
    } catch (failure) { if (current === request.current) setError(failure instanceof Error ? failure.message : "The specification reading failed. Try again."); }
    finally { if (current === request.current) { running.current = false; setBusy(false); } }
  }
  return <div className="ai-reader">
    <h3>Read specifications</h3><p>Choose the sections that belong in {pkg.name}. The AI proposes scope items for your review.</p>
    <AiPdfPicker label="Project manual PDF" disabled={busy} onChange={loaded => { setPdf(loaded); const found = loaded ? manualSections(loaded.text.pages) : []; setSelected(sectionsInDivision(found, pkg.division).map(s => s.section)); setResult(null); setError(""); }}/>
    {pdf && (sections.length ? <>
      <label className="ui-field">Find specification sections<input value={query} disabled={busy} onChange={e => setQuery(e.target.value)} placeholder="Section number or title"/></label>
      <p>{selected.length} of {sections.length} sections selected · {calls} AI request{calls === 1 ? "" : "s"}. Defaults cover Division {pkg.division}; include other divisions if this package installs their work.</p>
      <div className="ai-section-actions"><Button disabled={busy} onClick={() => setSelected(sectionsInDivision(sections, pkg.division).map(s => s.section))}>Select Division {pkg.division}</Button><Button disabled={busy} onClick={() => setSelected([])}>Clear selection</Button></div>
      <div className="ai-section-list">{visible.map(section => <label key={section.section}><input type="checkbox" disabled={busy} checked={selected.includes(section.section)} onChange={e => setSelected(e.target.checked ? [...selected, section.section] : selected.filter(s => s !== section.section))}/><span><strong>{section.section} · {section.title}</strong><small>PDF pages {section.firstPage}–{section.lastPage} · {section.pages.length} readable pages</small></span></label>)}{!visible.length && <p>No sections match your search.</p>}</div>
    </> : <p role="alert">No specification section headers were found. Choose a project manual with section numbers and readable text.</p>)}
    <p className="ai-privacy">The PDF stays in this browser. Running AI sends the selected section text to DeepSeek. Findings and their citations are saved here for review; choose the PDF again after a reload.</p>
    <Button variant="primary" disabled={busy || !chosen.length} onClick={read}>{busy ? "Reading specifications…" : "Read selected sections"}</Button>
    {busy && <p role="status">Reading request {progress.done} of {progress.total}…</p>}
    {error && <p role="alert" className="proc-source-error">{error}</p>}
    {result && <div className="ai-run-result"><p role={result.input.error ? "alert" : "status"}>{result.input.error ? result.input.error : `${result.input.drafts.length} findings are ready below. Review before accepting.`}{result.failures.length > 0 && !result.input.error && " Some pages failed to read; this run is incomplete."}</p>{result.failures.length > 0 && <details open><summary>{result.failures.length} failed request{result.failures.length === 1 ? "" : "s"}</summary><ul>{result.failures.map((failure, i) => <li key={i}>{failure.section} · pages {failure.pages}: {failure.error}</li>)}</ul></details>}{result.dropped.length > 0 && <details><summary>{result.dropped.length} unsupported findings discarded</summary><ul>{result.dropped.map((drop, i) => <li key={i}>{drop.what}: {drop.reason}</li>)}</ul></details>}</div>}
  </div>;
}
