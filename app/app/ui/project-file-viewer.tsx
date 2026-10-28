"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { readPageTextBoxes, renderStoredPage } from "../../lib/project-files-client";
import { revisionLabel, type StoredDocument } from "../../lib/project-files";
import { findOnSheet, type Box } from "../../lib/text-anchor";
import { findInSheetImage, type OcrProgress } from "../../lib/sheet-ocr";
import type { Point } from "../../lib/drawing-flip";
import "./project-files.css";

/** One page of a stored project PDF, rendered from the original — the real sheet or manual page. */
export function StoredPage({ doc, page, size = 2000, alt, onAspect }: { doc: StoredDocument; page: number; size?: number; alt?: string; onAspect?: (aspect: number) => void }) {
  const [state, setState] = useState<{ key: string; page: string; image?: string; error?: string }>({ key: "", page: "" });
  const at = `${doc.id}:${page}`, key = `${at}:${size}`;
  useEffect(() => {
    let live = true;
    renderStoredPage(doc, page, size).then(result => { if (live) { setState({ key, page: at, image: result.image }); onAspect?.(result.aspect); } }, error => { if (live) setState({ key, page: at, error: error instanceof Error ? error.message : "The page could not be rendered." }); });
    return () => { live = false; };
  }, [key]);
  // While a sharper render of the same page comes (zooming in), the one on screen stays.
  const stale = state.key !== key;
  if (stale && !(state.page === at && state.image)) return <p className="stored-page-status" role="status">Loading {doc.kind === "drawings" ? sheetLabel(doc, page) : `page ${page}`} from {doc.name}…</p>;
  if (!stale && state.error) return <p className="stored-page-status" role="alert">{state.error}</p>;
  return <img className="stored-page-image" src={state.image} alt={alt ?? `${doc.name}, page ${page}`} draggable={false}/>;
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

/** Other packages' printed words on the page, each in its package's colour (Wyre's "Highlight all scope packages"). */
export type MarkLayer = { key: string; label: string; color: string; quotes: string[] };

/** Where each layer's words are printed on the page: its text layer only (a scanned sheet shows none). */
function useLayerMarks(doc: StoredDocument, page: number, layers?: MarkLayer[]) {
  const key = `${doc.id}:${page}:${(layers ?? []).map(l => `${l.key}=${l.quotes.join("|")}`).join(",")}`;
  const [state, setState] = useState<{ key: string; marks: (Box & { color: string; label: string })[] }>({ key: "", marks: [] });
  useEffect(() => {
    if (!layers?.length) return;
    let live = true;
    readPageTextBoxes(doc, page).then(
      text => { if (live) setState({ key, marks: layers.flatMap(l => l.quotes.flatMap(q => findOnSheet(text, q).map(b => ({ ...b, color: l.color, label: l.label })))) }); },
      () => { if (live) setState({ key, marks: [] }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return layers?.length && state.key === key ? state.marks : [];
}

/** Furthest zoom: four times the frame's width (the sheet is rendered 3600 px wide from 1.5×). */
const ZOOM_MAX = 4;
/** Slow at both ends, for the glide in to the marks. */
const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
type Spot = { x: number; y: number };

/**
 * A page-by-page viewer for a stored PDF, with sheet / section jump lists, zoom and page range limits.
 * With `highlight` (the words a finding was read from) it marks them in green wherever the page prints them:
 * the page opens whole, then glides in to them (Danial, 27 Oct: "it should zoom in as a transition, not just an
 * already zoomed in picture"); `outline` marks a Drawing Flip region on `markPage`. Drag to move around; the
 * mouse wheel (on a drawing; Ctrl + wheel on other pages), a trackpad pinch or two fingers zoom where they point.
 */
export function StoredDocumentViewer({ doc, page, onPageChange, range, highlight, readImage = false, outline, markPage, layers }: { doc: StoredDocument; page: number; onPageChange: (page: number) => void; range?: { first: number; last: number } | null; highlight?: string | string[]; readImage?: boolean; outline?: Point[]; markPage?: number; layers?: MarkLayer[] }) {
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const quotes = (Array.isArray(highlight) ? highlight : highlight ? [highlight] : []).filter(q => q.trim());
  const marks = usePageMarks(doc, page, quotes, readImage, outline, markPage);
  const layerMarks = useLayerMarks(doc, page, layers);
  const frame = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null);
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;
  // After a zoom the sheet point `u` (0–1 of the sheet) is put back under the frame point `p` (pixels).
  const anchor = useRef<{ u: Spot; p: Spot } | null>(null);
  const glide = useRef(0);
  /** The zoom that shows the whole page in the frame (1 is the frame's width). */
  const fit = () => { const el = frame.current; return el && aspect ? Math.min(1, (el.clientHeight * aspect) / el.clientWidth) : 1; };
  const middle = (): Spot => ({ x: (frame.current?.clientWidth ?? 0) / 2, y: (frame.current?.clientHeight ?? 0) / 2 });
  /** Zooms to `z`, keeping sheet point `u` (default: whatever is under `p`) at frame point `p` (default: the middle). */
  const zoomAt = (z: number, p = middle(), u?: Spot) => {
    const el = frame.current, s = sheet.current;
    if (!el || !s) return;
    const r = s.getBoundingClientRect(), f = el.getBoundingClientRect();
    anchor.current = { u: u ?? { x: (f.left + p.x - r.left) / r.width, y: (f.top + p.y - r.top) / r.height }, p };
    zoomNow.current = Math.min(ZOOM_MAX, Math.max(fit(), z));
    setZoom(zoomNow.current);
  };
  const zoomAtNow = useRef(zoomAt);
  zoomAtNow.current = zoomAt;
  useLayoutEffect(() => {
    const el = frame.current, s = sheet.current, a = anchor.current;
    if (!el || !s || !a) return;
    anchor.current = null;
    const r = s.getBoundingClientRect(), f = el.getBoundingClientRect();
    el.scrollLeft += r.left - f.left + a.u.x * r.width - a.p.x;
    el.scrollTop += r.top - f.top + a.u.y * r.height - a.p.y;
  });

  // The whole page first, then the glide in to the marks, once per page and quote; after that the zoom is yours.
  const opened = useRef(""), focused = useRef("");
  const marking = quotes.length > 0 || !!outline?.length;
  useLayoutEffect(() => {
    if (!aspect || !marking || opened.current === marks.key) return;
    opened.current = marks.key;
    zoomAt(fit(), middle(), { x: 0.5, y: 0.5 });
  }, [aspect, marks.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aspect || !marks.boxes.length || focused.current === marks.key) return;
    focused.current = marks.key;
    const u = union(marks.boxes), center = { x: u.x + u.width / 2, y: u.y + u.height / 2 };
    const from = fit(), to = Math.min(ZOOM_MAX, Math.max(1, Math.round(4 * 0.45 / Math.max(u.width, 0.02)) / 4));
    const still = reducedMotion(), start = performance.now() + (still ? 0 : 400), length = still ? 0 : 1100;
    const step = (now: number) => {
      const t = length ? Math.min(1, Math.max(0, (now - start) / length)) : 1;
      zoomAtNow.current(from + (to - from) * ease(t), middle(), center);
      if (t < 1) glide.current = requestAnimationFrame(step);
    };
    glide.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(glide.current);
  }, [aspect, marks.key, marks.boxes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel and trackpad: a pinch arrives as Ctrl + wheel. On a drawing the wheel zooms, on other pages it scrolls.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && doc.kind !== "drawings") return;
      e.preventDefault();
      cancelAnimationFrame(glide.current);
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1), f = el.getBoundingClientRect();
      zoomAtNow.current(zoomNow.current * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.002)), { x: e.clientX - f.left, y: e.clientY - f.top });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [doc.kind]);

  // Drag to move around; two fingers pinch to zoom.
  const pointers = useRef(new Map<number, Spot>()), pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const local = (e: { clientX: number; clientY: number }): Spot => { const f = frame.current!.getBoundingClientRect(); return { x: e.clientX - f.left, y: e.clientY - f.top }; };
  const spread = () => { const [a, b] = [...pointers.current.values()]; return { distance: Math.hypot(a.x - b.x, a.y - b.y), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; };
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const el = e.currentTarget, p = local(e);
    if ((e.pointerType === "mouse" && e.button !== 0) || p.x > el.clientWidth || p.y > el.clientHeight) return;
    cancelAnimationFrame(glide.current);
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) pinch.current = { distance: spread().distance, zoom: zoomNow.current };
    setDragging(true);
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(e.pointerId), el = frame.current;
    if (!last || !el) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pinch.current && pointers.current.size === 2) { const s = spread(); zoomAt(pinch.current.zoom * s.distance / Math.max(1, pinch.current.distance), s.middle); return; }
    el.scrollLeft -= p.x - last.x;
    el.scrollTop -= p.y - last.y;
  }
  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) setDragging(false);
  }
  const fitted = zoom <= fit() + 0.001;
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
        <button className="ui-icon-btn" aria-label="Zoom out" disabled={fitted} onClick={() => { cancelAnimationFrame(glide.current); zoomAt(zoom / 1.25); }}><ZoomOut size={16}/></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="ui-icon-btn" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => { cancelAnimationFrame(glide.current); zoomAt(zoom * 1.25); }}><ZoomIn size={16}/></button>
        <button className="ui-icon-btn" aria-label="Fit the whole page" title="Fit the whole page" disabled={fitted} onClick={() => { cancelAnimationFrame(glide.current); zoomAt(fit(), middle(), { x: 0.5, y: 0.5 }); }}><Maximize size={15}/></button>
      </span>
    </div>
    {quotes.length > 0 && <blockquote className="stored-viewer-quote"><strong>{marks.fromText ? marks.via === "image" ? "Highlighted (read from the sheet image)" : "Highlighted" : "Look for"}</strong> {quotes.slice(0, 3).map(q => `“${q}”`).join(" · ")}{quotes.length > 3 ? ` and ${quotes.length - 3} more` : ""}</blockquote>}
    {marks.reading && <p className="stored-viewer-status" role="status">This sheet has no text layer, so Structor is reading the words off the image at 300 dpi… {marks.reading.done} of {marks.reading.total} parts</p>}
    {quotes.length > 0 && marks.searched && !marks.fromText && marks.onMarkPage && <p className={`stored-viewer-status${marks.via === "not-printed" ? " warning" : ""}`} role="status">{marks.boxes.length ? "These exact words aren't on the page, so the green box is the area marked in Drawing Flip."
      : marks.via === "not-printed" ? "These words aren't printed on this sheet: Structor read the whole sheet image and they aren't on it. The AI described the sheet in its own words here, so check this scope item against the sheet."
      : "These words weren't found on this page. Look for them on the page."}</p>}
    <div className={`stored-viewer-frame${dragging ? " dragging" : ""}`} ref={frame} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><div className="stored-viewer-sheet" ref={sheet} style={{ width: `${zoom * 100}%`, aspectRatio: aspect ?? undefined }}>
      <StoredPage doc={doc} page={page} size={zoom > 1.5 ? 3600 : 2000} onAspect={setAspect}/>
      {aspect && layerMarks.map((b, i) => <span key={`layer-${i}`} className="stored-viewer-mark layer" title={b.label} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%`, borderColor: b.color, background: `${b.color}2e` }}/>)}
      {aspect && marks.boxes.map((b, i) => <span key={i} className="stored-viewer-mark" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }} aria-hidden="true"/>)}
    </div></div>
  </div>;
}
