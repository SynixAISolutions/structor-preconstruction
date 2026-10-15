"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { renderStoredPage } from "../../lib/project-files-client";
import { revisionLabel, type StoredDocument } from "../../lib/project-files";
import "./project-files.css";

/** One page of a stored project PDF, rendered from the original — the real sheet or manual page. */
export function StoredPage({ doc, page, size = 2000, alt, onAspect }: { doc: StoredDocument; page: number; size?: number; alt?: string; onAspect?: (aspect: number) => void }) {
  const [state, setState] = useState<{ key: string; image?: string; error?: string }>({ key: "" });
  const key = `${doc.id}:${page}:${size}`;
  useEffect(() => {
    let live = true;
    renderStoredPage(doc, page, size).then(result => { if (live) { setState({ key, image: result.image }); onAspect?.(result.aspect); } }, error => { if (live) setState({ key, error: error instanceof Error ? error.message : "The page could not be rendered." }); });
    return () => { live = false; };
  }, [key]);
  if (state.key !== key || (!state.image && !state.error)) return <p className="stored-page-status" role="status">Loading {doc.kind === "drawings" ? sheetLabel(doc, page) : `page ${page}`} from {doc.name}…</p>;
  if (state.error) return <p className="stored-page-status" role="alert">{state.error}</p>;
  return <img className="stored-page-image" src={state.image} alt={alt ?? `${doc.name}, page ${page}`}/>;
}

export const sheetLabel = (doc: StoredDocument, page: number) => {
  const sheet = doc.sheets.find(s => s.page === page);
  return sheet?.sheet ? `${sheet.sheet}${sheet.title ? ` · ${sheet.title}` : ""}` : `page ${page}`;
};

/** A page-by-page viewer for a stored PDF, with sheet / section jump lists, zoom and page range limits. */
export function StoredDocumentViewer({ doc, page, onPageChange, range, highlight }: { doc: StoredDocument; page: number; onPageChange: (page: number) => void; range?: { first: number; last: number } | null; highlight?: string }) {
  const [zoom, setZoom] = useState(1);
  const first = range?.first ?? 1, last = range?.last ?? doc.pageCount;
  const sheets = doc.sheets.filter(s => s.sheet && s.page >= first && s.page <= last);
  const sections = doc.sections.filter(s => s.last >= first && s.first <= last);
  return <div className="stored-viewer">
    <div className="stored-viewer-bar">
      <span className="stored-viewer-name"><strong>{doc.name}</strong><small>{revisionLabel(doc)} · {doc.kind === "drawings" ? sheetLabel(doc, page) : `page ${page} of ${doc.pageCount}`}</small></span>
      {sheets.length > 1 && <select aria-label="Go to sheet" value={sheets.some(s => s.page === page) ? page : ""} onChange={event => onPageChange(Number(event.target.value))}><option value="" disabled>Go to sheet…</option>{sheets.map(s => <option key={s.page} value={s.page}>{s.sheet}{s.title ? ` · ${s.title}` : ""}</option>)}</select>}
      {sections.length > 1 && <select aria-label="Go to section" value="" onChange={event => onPageChange(Number(event.target.value))}><option value="" disabled>Go to section…</option>{sections.map(s => <option key={`${s.section}-${s.first}`} value={s.first}>{s.section} · {s.title}</option>)}</select>}
      <span className="stored-viewer-pages">
        <button className="ui-icon-btn" aria-label="Previous page" disabled={page <= first} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16}/></button>
        <span>{page}</span>
        <button className="ui-icon-btn" aria-label="Next page" disabled={page >= last} onClick={() => onPageChange(page + 1)}><ChevronRight size={16}/></button>
      </span>
      <span className="stored-viewer-zoom">
        <button className="ui-icon-btn" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))}><ZoomOut size={16}/></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="ui-icon-btn" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + 0.5))}><ZoomIn size={16}/></button>
      </span>
    </div>
    {highlight && <blockquote className="stored-viewer-quote"><strong>Look for</strong> “{highlight}”</blockquote>}
    <div className="stored-viewer-frame"><div style={{ width: `${zoom * 100}%` }}><StoredPage doc={doc} page={page} size={zoom > 1.5 ? 3600 : 2000}/></div></div>
  </div>;
}
