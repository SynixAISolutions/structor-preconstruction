"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { readPageTextBoxes, renderStoredPage } from "../../lib/project-files-client";
import { revisionLabel, type StoredDocument } from "../../lib/project-files";
import { findOnSheet, type Box } from "../../lib/text-anchor";
import type { Point } from "../../lib/drawing-flip";
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

const union = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
};
const outlineBox = (points: Point[]): Box => union(points.map(p => ({ x: p.x, y: p.y, width: 0, height: 0 })));

/** Where `highlight` is printed on the page (its text layer), else the `outline` when this is its page. */
function usePageMarks(doc: StoredDocument, page: number, highlight?: string, outline?: Point[], markPage?: number) {
  const key = `${doc.id}:${page}:${highlight ?? ""}`;
  const [found, setFound] = useState<{ key: string; boxes: Box[] } | null>(null);
  useEffect(() => {
    if (!highlight) return;
    let live = true;
    readPageTextBoxes(doc, page).then(boxes => findOnSheet(boxes, highlight), () => [] as Box[]).then(boxes => { if (live) setFound({ key, boxes }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMarkPage = markPage == null || markPage === page;
  const text = found?.key === key ? found.boxes : [];
  const boxes = text.length ? text : onMarkPage && outline && outline.length > 1 ? [outlineBox(outline)] : [];
  return { key, boxes, searched: !highlight || found?.key === key, fromText: text.length > 0, onMarkPage };
}

/**
 * A page-by-page viewer for a stored PDF, with sheet / section jump lists, zoom and page range limits.
 * With `highlight` (the words a finding was read from) it marks them in orange wherever the page prints them
 * and zooms in on them, like the reference app Marcel showed; `outline` marks a Drawing Flip region on `markPage`.
 */
export function StoredDocumentViewer({ doc, page, onPageChange, range, highlight, outline, markPage }: { doc: StoredDocument; page: number; onPageChange: (page: number) => void; range?: { first: number; last: number } | null; highlight?: string; outline?: Point[]; markPage?: number }) {
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(null);
  const marks = usePageMarks(doc, page, highlight, outline, markPage);
  const frame = useRef<HTMLDivElement>(null);
  // Zoom to the marks once per page and quote, then leave the zoom to the estimator.
  const focused = useRef(""), scroll = useRef(false);
  useEffect(() => {
    if (!marks.boxes.length || focused.current === marks.key) return;
    focused.current = marks.key; scroll.current = true;
    const u = union(marks.boxes);
    setZoom(Math.min(4, Math.max(1, Math.round(4 * 0.45 / Math.max(u.width, 0.02)) / 4)));
  }, [marks.key, marks.boxes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el || !aspect || !scroll.current || !marks.boxes.length) return;
    scroll.current = false;
    const u = union(marks.boxes), width = el.clientWidth * zoom, height = width / aspect;
    el.scrollTo({ left: (u.x + u.width / 2) * width - el.clientWidth / 2, top: (u.y + u.height / 2) * height - el.clientHeight / 2 });
  });
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
    {highlight && <blockquote className="stored-viewer-quote"><strong>{marks.fromText ? "Highlighted" : "Look for"}</strong> “{highlight}”</blockquote>}
    {highlight && marks.searched && !marks.fromText && marks.onMarkPage && <p className="stored-viewer-status" role="status">{marks.boxes.length ? "These exact words aren't in the page's text layer, so the orange box is the area marked in Drawing Flip." : "These exact words weren't found in this page's text layer (a scanned or drawn page has none). Look for them on the page."}</p>}
    <div className="stored-viewer-frame" ref={frame}><div className="stored-viewer-sheet" style={{ width: `${zoom * 100}%`, aspectRatio: aspect ?? undefined }}>
      <StoredPage doc={doc} page={page} size={zoom > 1.5 ? 3600 : 2000} onAspect={setAspect}/>
      {aspect && marks.boxes.map((b, i) => <span key={i} className="stored-viewer-mark" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }} aria-hidden="true"/>)}
    </div></div>
  </div>;
}
