"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { readPageTextBoxes, renderStoredPage } from "../../lib/project-files-client";
import { revisionLabel, type StoredDocument } from "../../lib/project-files";
import { findOnSheet, type Box } from "../../lib/text-anchor";
import { findInSheetImage, type OcrProgress } from "../../lib/sheet-ocr";
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

/** A page with fewer pieces of text than this has no real text layer (a scanned or drawn sheet). */
const IMAGE_PAGE_TEXT = 20;

/**
 * Where the `quotes` are printed on the page: its text layer, else the words OCR reads off the page image (a
 * page with no text layer, or `readImage` when the AI read the words from the image). Else the `outline` when
 * this is its page.
 */
function usePageMarks(doc: StoredDocument, page: number, quotes: string[], readImage: boolean, outline?: Point[], markPage?: number) {
  const key = `${doc.id}:${page}:${quotes.join("|")}`;
  // "not-printed": OCR read the whole sheet image and the words aren't on it.
  const [found, setFound] = useState<{ key: string; boxes: Box[]; via: "text" | "image" | "none" | "not-printed" } | null>(null);
  const [reading, setReading] = useState<OcrProgress | null>(null);
  useEffect(() => {
    if (!quotes.length) return;
    let live = true;
    setReading(null);
    (async () => {
      const text = await readPageTextBoxes(doc, page).catch(() => []);
      const inText = quotes.flatMap(q => findOnSheet(text, q));
      if (inText.length || !(readImage || text.length < IMAGE_PAGE_TEXT)) return { boxes: inText, via: inText.length ? "text" as const : "none" as const };
      const image = await findInSheetImage(doc, page, quotes, progress => { if (live) setReading(progress); });
      return { boxes: image.marks, via: image.marks.length ? "image" as const : image.wholeSheet ? "not-printed" as const : "none" as const };
    })().catch(() => ({ boxes: [] as Box[], via: "none" as const })).then(result => { if (live) { setFound({ key, ...result }); setReading(null); } });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMarkPage = markPage == null || markPage === page;
  const current = found?.key === key ? found : null;
  const words = current?.boxes ?? [];
  const boxes = words.length ? words : onMarkPage && outline && outline.length > 1 ? [outlineBox(outline)] : [];
  return { key, boxes, searched: !quotes.length || !!current, fromText: words.length > 0, via: current?.via ?? null, reading, onMarkPage };
}

/**
 * A page-by-page viewer for a stored PDF, with sheet / section jump lists, zoom and page range limits.
 * With `highlight` (the words a finding was read from) it marks them in orange wherever the page prints them
 * and zooms in on them, like the reference app Marcel showed; `outline` marks a Drawing Flip region on `markPage`.
 */
export function StoredDocumentViewer({ doc, page, onPageChange, range, highlight, readImage = false, outline, markPage }: { doc: StoredDocument; page: number; onPageChange: (page: number) => void; range?: { first: number; last: number } | null; highlight?: string | string[]; readImage?: boolean; outline?: Point[]; markPage?: number }) {
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(null);
  const quotes = (Array.isArray(highlight) ? highlight : highlight ? [highlight] : []).filter(q => q.trim());
  const marks = usePageMarks(doc, page, quotes, readImage, outline, markPage);
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
    {quotes.length > 0 && <blockquote className="stored-viewer-quote"><strong>{marks.fromText ? marks.via === "image" ? "Highlighted (read from the sheet image)" : "Highlighted" : "Look for"}</strong> {quotes.map(q => `“${q}”`).join(" · ")}</blockquote>}
    {marks.reading && <p className="stored-viewer-status" role="status">This sheet has no text layer, so Structor is reading the words off the image at 300 dpi… {marks.reading.done} of {marks.reading.total} parts</p>}
    {quotes.length > 0 && marks.searched && !marks.fromText && marks.onMarkPage && <p className={`stored-viewer-status${marks.via === "not-printed" ? " warning" : ""}`} role="status">{marks.boxes.length ? "These exact words aren't on the page, so the orange box is the area marked in Drawing Flip."
      : marks.via === "not-printed" ? "These words aren't printed on this sheet: Structor read the whole sheet image and they aren't on it. The AI described the sheet in its own words here, so check this scope item against the sheet."
      : "These words weren't found on this page. Look for them on the page."}</p>}
    <div className="stored-viewer-frame" ref={frame}><div className="stored-viewer-sheet" style={{ width: `${zoom * 100}%`, aspectRatio: aspect ?? undefined }}>
      <StoredPage doc={doc} page={page} size={zoom > 1.5 ? 3600 : 2000} onAspect={setAspect}/>
      {aspect && marks.boxes.map((b, i) => <span key={i} className="stored-viewer-mark" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }} aria-hidden="true"/>)}
    </div></div>
  </div>;
}
