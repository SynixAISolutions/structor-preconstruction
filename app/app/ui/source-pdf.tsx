"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "./shared";

export function SourcePdf({ page, range, onPageChange, label = "Source PDF" }: { page: number; range?: { first: number; last: number } | null; onPageChange: (page: number) => void; label?: string }) {
  // shortcut: files last for this view; share file access when project storage is connected.
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  async function open(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    if (!selected) return;
    const current = ++request.current;
    try {
      const header = await selected.slice(0, 1024).text();
      if (current !== request.current) return;
      if (!/\.pdf$/i.test(selected.name) || !header.includes("%PDF-")) { setError("Choose a valid PDF source document."); return; }
      setFile({ url: URL.createObjectURL(selected), name: selected.name }); setError("");
    } catch { if (current === request.current) setError("The file could not be opened. Choose it again."); }
  }
  return <div className="proc-source-dialog">
    <p className="proc-modal-note">Open the source PDF from your computer to check this reference. The file stays in this browser.</p>
    <label className="ui-field">{label}<input type="file" accept="application/pdf,.pdf" onChange={open}/></label>
    {error && <p className="proc-source-error" role="alert">{error}</p>}
    {file && <>
      <div className="proc-source-page-controls"><span>{file.name}</span>{range && <><Button disabled={page <= range.first} onClick={() => onPageChange(page - 1)}>Previous page</Button><span>Page {page}</span><Button disabled={page >= range.last} onClick={() => onPageChange(page + 1)}>Next page</Button></>}</div>
      <a className="proc-manual-download" href={file.url} download={file.name}>Download source PDF</a>
      <object key={`${file.url}-${page}`} aria-label={`${file.name} · page ${page}`} type="application/pdf" data={`${file.url}#page=${page}&view=FitH`} className="proc-manual-frame"><p className="proc-modal-note">The PDF preview is unavailable in this browser. Use Download source PDF to open it in your PDF viewer.</p></object>
    </>}
  </div>;
}
