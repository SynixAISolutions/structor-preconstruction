"use client";

import { useEffect, useRef, useState } from "react";
import { extractDrawingScope, type ScopeRunResult } from "../../lib/ai-client";
import type { PageText } from "../../lib/manual-sections";
import type { TradePackage } from "../../lib/procurement";
import { getActiveProjectId } from "../../lib/project-scope";
import { rememberPdf } from "../../lib/pdf-session";
import { AiPdfPicker, type LoadedPdf } from "./ai-pdf-picker";
import { Button } from "./shared";

export function DrawingReader({ pkg, onRun, onPages }: { pkg: TradePackage; onRun: (result: ScopeRunResult, file: File) => string | null; onPages: (pages: (PageText & { sheet: string })[], document: string) => string | null }) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null), [selected, setSelected] = useState<number[]>([]), [sheets, setSheets] = useState<Record<number, string>>({});
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(0), [error, setError] = useState("");
  const [result, setResult] = useState<ScopeRunResult | null>(null), request = useRef(0), running = useRef(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  const chosen = pdf?.text.pages.filter(page => selected.includes(page.page)).map(page => ({ ...page, sheet: sheets[page.page]?.trim() ?? "" })) ?? [];
  async function read() {
    if (!pdf || !chosen.length || running.current) return;
    controller.current = new AbortController();
    running.current = true;
    const id = ++request.current, project = getActiveProjectId();
    setBusy(true); setDone(0); setError(""); setNotice(""); setResult(null); rememberPdf(pdf.file, project);
    try {
      const outcome = await extractDrawingScope({ pkg, document: pdf.file.name, pageCount: pdf.text.pageCount, pages: chosen.map(page => ({ ...page, sheet: page.sheet || `PDF ${page.page}` })), render: page => import("../../lib/pdf-drawing").then(lib => lib.renderDrawingPage(pdf.file, page)), signal: controller.current.signal, onProgress: count => { if (id === request.current) setDone(count); } });
      if (id !== request.current || project !== getActiveProjectId()) return;
      const pageProblem = onPages(outcome.drawingPages ?? [], pdf.file.name);
      if (pageProblem) throw new Error(pageProblem);
      const problem = onRun(outcome, pdf.file);
      if (problem) throw new Error(problem);
      setResult(outcome);
    } catch (failure) { if (id === request.current) setError(failure instanceof Error ? failure.message : "The drawing reading failed."); }
    finally { if (id === request.current) { running.current = false; setBusy(false); } }
  }
  return <details className="ai-reader"><summary>Read drawing sheets</summary><p>Choose the sheets for {pkg.name}. The AI reads each image and its text, then proposes requirements, highlights and dimension-supported quantities.</p>
    <AiPdfPicker label="Drawing set PDF" allowImages disabled={busy} onChange={loaded => { setPdf(loaded); setSelected([]); setSheets(Object.fromEntries(loaded?.text.pages.map(page => [page.page, page.sheet ?? ""]) ?? [])); setResult(null); setError(""); }}/>
    {pdf && <><label className="ui-field">Find drawing sheets<input value={query} disabled={busy} onChange={e => setQuery(e.target.value)} placeholder="Sheet number or PDF page"/></label><p>{selected.length} of {pdf.text.pageCount} pages selected · one AI request per selected page. Check the sheet number against its title block.</p><Button disabled={busy} onClick={() => setSelected([])}>Clear drawing selection</Button><div className="ai-section-list">{pdf.text.pages.filter(page => !query || `${page.page} ${sheets[page.page]}`.toLowerCase().includes(query.toLowerCase())).map(page => <div key={page.page} className="ai-drawing-choice"><label><input type="checkbox" disabled={busy} checked={selected.includes(page.page)} onChange={e => setSelected(e.target.checked ? [...selected, page.page] : selected.filter(n => n !== page.page))}/><span>PDF page {page.page}{!page.text.trim() && " · image reading"}</span></label><input aria-label={`Sheet number for PDF page ${page.page}`} value={sheets[page.page] ?? ""} maxLength={40} disabled={busy} onChange={e => setSheets({ ...sheets, [page.page]: e.target.value })} placeholder="Sheet number"/></div>)}</div></>}
    <p className="ai-privacy">Running AI sends the selected sheet images and text to DeepSeek. Files stay in browser memory. Check every highlight and quantity before accepting; no 3D geometry is generated automatically.</p><Button disabled={busy || !chosen.length || chosen.some(page => !page.sheet)} onClick={() => { if (!pdf) return; const problem = onPages(chosen, pdf.file.name); if (problem) setError(problem); else { rememberPdf(pdf.file); setNotice(`${chosen.length} sheets are available in Drawing Flip with their original PDF images.`); } }}>Add selected sheets to Drawing Flip</Button><Button variant="primary" disabled={busy || !chosen.length} onClick={read}>{busy ? "Reading drawings…" : "Read selected drawing sheets"}</Button>{notice && <p role="status">{notice}</p>}
    {busy && <><p role="status">Reading sheet {done} of {chosen.length}…</p><Button onClick={() => controller.current?.abort()}>Stop reading and keep completed findings</Button></>}{error && <p role="alert">{error}</p>}
    {result && <div className="ai-run-result"><p role={result.input.error ? "alert" : "status"}>{result.input.error ?? `${result.input.drafts.length} findings are ready for review.`}</p>{result.failures.length > 0 && <details open><summary>Incomplete drawing reading</summary><ul>{result.failures.map((f, i) => <li key={i}>{f.section} · page {f.pages}: {f.error}</li>)}</ul></details>}{result.dropped.length > 0 && <details><summary>Screening notes ({result.dropped.length})</summary><ul>{result.dropped.map((d, i) => <li key={i}>{d.what}: {d.reason}</li>)}</ul></details>}</div>}
  </details>;
}
