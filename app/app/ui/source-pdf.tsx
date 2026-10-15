"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "./shared";

export function SourcePdf({ page, range, onPageChange, label = "Source PDF", selectedFile, expectedName }: { page: number; range?: { first: number; last: number } | null; onPageChange: (page: number) => void; label?: string; selectedFile?: File; expectedName?: string }) {
  // shortcut: files last for this view; share file access when project storage is connected.
  const [file, setFile] = useState<{ url: string; name: string; source: File } | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  useEffect(() => {
    let live = true; setImage(null);
    if (file) {
      setError("");
      import("../../lib/pdf-drawing").then(lib => lib.renderDrawingPage(file.source, page)).then(result => { if (live) setImage(result.image); }, failure => { if (live) setError(failure instanceof Error ? failure.message : "The source page could not be rendered. Download the PDF to check it."); });
    }
    return () => { live = false; };
  }, [file, page]);
  async function openFile(selected: File) {
    const current = ++request.current;
    setFile(null); setError("");
    try {
      const header = await selected.slice(0, 1024).text();
      if (current !== request.current) return;
      if (!/\.pdf$/i.test(selected.name) || !header.includes("%PDF-")) { setError("Choose a valid PDF source document."); return; }
      if (expectedName && selected.name !== expectedName) { setError(`This citation belongs to ${expectedName}. Choose that source PDF.`); return; }
      setFile({ url: URL.createObjectURL(selected), name: selected.name, source: selected }); setError("");
    } catch { if (current === request.current) setError("The file could not be opened. Choose it again."); }
  }
  useEffect(() => { if (selectedFile) void openFile(selectedFile); return () => { request.current++; }; }, [selectedFile, expectedName]);
  function open(event: ChangeEvent<HTMLInputElement>) { const selected = event.currentTarget.files?.[0]; if (selected) void openFile(selected); }
  return <div className="proc-source-dialog">
    <p className="proc-modal-note">Open the source PDF from your computer to check this reference. The file stays in this browser.</p>
    <label className="ui-field">{label}<input type="file" accept="application/pdf,.pdf" onChange={open}/></label>
    {error && <p className="proc-source-error" role="alert">{error}</p>}
    {file && <>
      <div className="proc-source-page-controls"><span>{file.name}</span>{range && <><Button disabled={page <= range.first} onClick={() => onPageChange(page - 1)}>Previous page</Button><span>Page {page}</span><Button disabled={page >= range.last} onClick={() => onPageChange(page + 1)}>Next page</Button></>}</div>
      <a className="proc-manual-download" href={file.url} download={file.name}>Download source PDF</a>
      {image ? <div className="proc-manual-frame"><img src={image} alt={`${file.name} · page ${page}`} style={{ display: "block", width: "100%", height: "auto" }}/></div> : !error && <p role="status">Rendering source page {page}…</p>}
    </>}
  </div>;
}
