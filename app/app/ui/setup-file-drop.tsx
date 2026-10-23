"use client";

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { DOCUMENT_CATEGORIES, MAX_SOURCE_BYTES, type StoredDocument } from "../../lib/project-files";
import { uploadProjectPdf, type UploadProgress } from "../../lib/project-files-client";
import { classifyFile, type FileGuess } from "../../lib/setup-checks";
import { Badge, Button, Modal } from "./shared";
import { UploadCheck } from "./drawing-log";

type PendingPdf = { id: number; file: File; category: string; guess: FileGuess | null; status: "reading" | "ready" | "uploading" | "done" | "failed" | "invalid"; error: string };

/** Inspect locally first; no original file leaves the browser until Upload is selected. */
export async function inspectSetupPdf(file: File): Promise<FileGuess> {
  if (!/\.pdf$/i.test(file.name) || !(await file.slice(0, 1024).text()).includes("%PDF-")) throw new Error("Choose a PDF file.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("This PDF exceeds the project-file size limit.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("../../lib/pdf-worker")).pdfWorkerSrc();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const texts: string[] = []; let sheetsRead = 0;
    for (let number = 1; number <= Math.min(3, pdf.numPages); number++) {
      const page = await pdf.getPage(number), view = page.getViewport({ scale: 1 }), content = await page.getTextContent();
      const items = content.items.filter(item => "str" in item);
      texts.push(items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join(""));
      if (items.some(item => /^[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?$/.test(item.str.trim()) && item.transform[4] > view.width * .65 && item.transform[5] < view.height * .35)) sheetsRead++;
      page.cleanup();
    }
    return classifyFile(file.name, texts.join("\n"), sheetsRead);
  } finally { await task.destroy(); }
}

export function SetupFileChoice({ row, disabled, onChange, onRemove }: { row: PendingPdf; disabled: boolean; onChange: (category: string) => void; onRemove: () => void }) {
  return <article className="setup-file-choice"><div><strong>{row.file.name}</strong><Badge tone={row.status === "done" ? "green" : row.guess?.confidence === "low" || row.error ? "yellow" : "neutral"}>{row.status === "done" ? "Uploaded" : row.status === "reading" ? "Reading first pages…" : row.status === "uploading" ? "Uploading…" : row.guess?.confidence === "low" ? "Choose a category" : row.status === "invalid" ? "Check file" : "Ready for review"}</Badge></div>{row.guess && <p>{row.guess.reason}{row.guess.confidence === "low" ? " Confirm the category before uploading." : " You can change the category before uploading."}</p>}{row.status !== "reading" && row.status !== "invalid" && <label className="ui-field">Category for {row.file.name}<select value={row.category} disabled={disabled || row.status === "done"} onChange={e => onChange(e.target.value)}><option value="">Choose a category…</option>{DOCUMENT_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>}{row.error && <p role="alert" className="setup-error">{row.error}</p>}{row.status !== "done" && <button className="setup-remove-file" disabled={disabled} onClick={onRemove} aria-label={`Remove ${row.file.name}`}><X size={14}/></button>}</article>;
}

export function SetupFileDrop({ projectId, documents, notify }: { projectId: string; documents: StoredDocument[]; notify: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null), sequence = useRef(0), busyRef = useRef(false);
  const [rows, setRows] = useState<PendingPdf[]>([]), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false);
  const [checkIds, setCheckIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null), [activeName, setActiveName] = useState("");
  const update = (id: number, patch: Partial<PendingPdf>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  async function inspect(files: File[]) {
    if (busyRef.current || !files.length) return;
    busyRef.current = true; setBusy(true);
    const names = new Set([...documents.map(d => d.name), ...rows.map(r => r.file.name)].map(name => name.toLowerCase()));
    try {
      for (const file of files) {
        const id = ++sequence.current;
        const duplicate = names.has(file.name.toLowerCase()); names.add(file.name.toLowerCase());
        setRows(current => [...current, { id, file, category: "", guess: null, status: duplicate ? "invalid" : "reading", error: duplicate ? "This filename is already stored or queued. Use Project files for a revision." : "" }]);
        if (duplicate) continue;
        try { const guess = await inspectSetupPdf(file); update(id, { guess, category: guess.confidence === "high" ? guess.category : "", status: "ready" }); }
        catch (error) { update(id, { status: "invalid", error: error instanceof Error ? error.message : "The PDF could not be read. Try a readable PDF." }); }
      }
    } finally { busyRef.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  }
  const pending = rows.filter(row => row.status === "ready" || row.status === "failed");
  async function upload() {
    if (busyRef.current || !pending.length || pending.some(row => !row.category)) return;
    busyRef.current = true; setBusy(true);
    try {
      for (const row of pending) {
        setActiveName(row.file.name); update(row.id, { status: "uploading", error: "" }); setProgress({ stage: "uploading", done: 0, total: 1 });
        try { const doc = await uploadProjectPdf({ projectId, file: row.file, category: row.category, onProgress: setProgress }); if (doc.kind === "drawings") setCheckIds(ids => [...ids, doc.id]); update(row.id, { status: "done" }); notify(`${row.file.name} is stored in Project files as ${row.category}.`); }
        catch (error) { update(row.id, { status: "failed", error: error instanceof Error ? error.message : "Upload failed. Try again." }); }
      }
    } finally { busyRef.current = false; setBusy(false); setProgress(null); setActiveName(""); }
  }
  return <section className="setup-file-drop" aria-label="Upload project PDFs"><div className={`setup-drop-target ${dragging ? "is-dragging" : ""}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void inspect(Array.from(e.dataTransfer.files)); }}><FileUp size={24}/><div><h2>Drop your project PDFs here</h2><p>Drawings, specifications, RFPs, addenda and reports. Review the suggested categories, then upload.</p></div><input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="Choose project PDFs" disabled={busy} onChange={e => void inspect(Array.from(e.target.files ?? []))}/><Button disabled={busy} onClick={() => input.current?.click()}>Choose PDFs</Button></div>{rows.length > 0 && <div className="setup-file-queue">{rows.map(row => <SetupFileChoice key={row.id} row={row} disabled={busy} onChange={category => update(row.id, { category })} onRemove={() => setRows(current => current.filter(item => item.id !== row.id))}/>)}<div className="setup-file-actions"><Button variant="primary" disabled={busy || !pending.length || pending.some(row => !row.category)} onClick={() => void upload()}>Upload {pending.length || "ready"} {pending.length === 1 ? "PDF" : "PDFs"}</Button>{pending.some(row => !row.category) && <p>Choose a category for each uncertain file before uploading.</p>}{progress && <p role="status">{activeName} · {progress.stage === "title-blocks" ? "Reading title blocks" : progress.stage === "reading" ? "Reading pages" : progress.stage === "saving" ? "Saving" : "Uploading"} · {progress.done} / {progress.total}</p>}</div></div>}{!busy && !!checkIds.length && <Modal title="Upload check" subtitle="Your drawings are saved. Review the sheet numbers before continuing." wide onClose={() => setCheckIds([])}><UploadCheck documents={documents} ids={checkIds} onDone={() => setCheckIds([])}/></Modal>}</section>;
}
