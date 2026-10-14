"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { PdfText } from "../../lib/pdf-text";
import "./ai-reading.css";

export type LoadedPdf = { file: File; text: PdfText };

export function AiPdfPicker({ label, disabled, maxBytes, onChange }: {
  label: string; disabled: boolean; maxBytes?: number; onChange: (pdf: LoadedPdf | null) => void;
}) {
  const request = useRef(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<PdfText | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => { request.current++; }, []);
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const current = ++request.current;
    onChange(null); setSummary(null); setError(""); setProgress(null);
    if (!file) return;
    try {
      if (!/\.pdf$/i.test(file.name) || !(await file.slice(0, 1024).text()).includes("%PDF-")) throw new Error("Choose a valid PDF document.");
      if (maxBytes && file.size > maxBytes) throw new Error("Choose a proposal PDF of at most 50 MB.");
      if (current !== request.current) return;
      setProgress({ done: 0, total: 0 });
      const { readPdfText } = await import("../../lib/pdf-text");
      const text = await readPdfText(file, (done, total) => { if (current === request.current) setProgress({ done, total }); });
      if (current !== request.current) return;
      if (text.emptyPages === text.pageCount) throw new Error("This PDF has no readable text. A scanned document needs OCR first.");
      setSummary(text); onChange({ file, text });
    } catch (failure) {
      if (current === request.current) setError(failure instanceof Error ? failure.message : "The PDF could not be read. Choose it again.");
    } finally { if (current === request.current) setProgress(null); }
  }
  return <div className="ai-pdf-picker">
    <label className="ui-field">{label}<input type="file" accept="application/pdf,.pdf" disabled={disabled} onChange={pick}/></label>
    {progress && <p role="status">{progress.total ? `Reading PDF pages ${progress.done} of ${progress.total}…` : "Opening PDF…"}</p>}
    {summary && <p role="status">{summary.name} · {summary.pageCount} pages{summary.emptyPages > 0 && ` · ${summary.emptyPages} pages have no readable text and need separate checking`}</p>}
    {error && <p className="proc-source-error" role="alert">{error}</p>}
  </div>;
}
