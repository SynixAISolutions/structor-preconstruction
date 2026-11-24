"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  FilePlus2,
  History,
  Link2,
  ListFilter,
  LocateFixed,
  Maximize2,
  MousePointer2,
  PencilRuler,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Unlink,
  UserRound,
  ZoomIn } from "lucide-react";
import {
  addPage,
  addRegion,
  bounds,
  importRegions,
  approveRegion,
  corrections,
  editRegionNotes,
  filterRegions,
  flipSummary,
  linkScope,
  rectangle,
  redrawRegion,
  regionsForScope,
  reassignRegion,
  tradeLegend,
  unlinkScope,
  unlocatedScopes,
  type DrawingFlipErrors,
  type DrawingPage,
  type FlipRegion,
  type Point,
  type RegionOrigin,
  type RegionStatus, onPrintedWords } from "../../lib/drawing-flip";
import { displayDate } from "../../lib/format";
import { useExtraction } from "../../lib/use-extraction";
import type { useProcurement } from "../../lib/use-procurement";
import { editPackage } from "../../lib/procurement";
import { loadProjects, sampleProjectRecords } from "../../lib/projects";
import { getActiveProjectId } from "../../lib/project-scope";
import { rememberPdf, useSourceFile } from "../../lib/pdf-session";
import { renderStoredPage, useProjectDocuments } from "../../lib/project-files-client";
import { locatePlan } from "../../lib/drawing-ai";
import { locateScopes } from "../../lib/ai-more-client";
import { drawingRegister, sheetKey, findSheet } from "../../lib/project-files";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, Stats, type ViewProps } from "./shared";
import "./drawing-flip-ui.css";

const CURRENT_USER = "Marcel Khoury";
export const tradeColors = ["#e27f4b", "#4e8ca6", "#8b70aa", "#54a078", "#c99a46", "#c76464", "#657eae", "#8b9870"];
const firstError = (errors: DrawingFlipErrors) => Object.values(errors)[0] ?? "Review the highlighted fields.";
const activityDate = (value: string | null) => value ? displayDate(value.slice(0, 10)) : "Not set";
const eventLabel = (kind: FlipRegion["history"][number]["kind"]) => ({
  created: "Region created",
  approved: "Trade assignment approved",
  reassigned: "Trade assignment corrected",
  linked: "Scope item linked",
  unlinked: "Scope item unlinked",
  notes: "Review notes updated",
  redrawn: "Outline redrawn",
})[kind];

/** Full-view zoom limit: sheets render at 3,600 px there, sharp to about six times the window. */
const MAX_ZOOM = 600;

type Filters = { query: string; packageId: string; status: "" | RegionStatus; origin: "" | RegionOrigin; corrected: boolean };
type PageDraft = { sheet: string; title: string; discipline: string; revision: string; documentId: string; documentName: string; pageNumber: string };
type RegionDraft = { label: string; packageId: string; x: string; y: string; width: string; height: string; notes: string };

function DrawingBackdrop({ page, height }: { page: DrawingPage; height: number }) {
  if (page.image) return <image href={page.image} x="0" y="0" width="1000" height={height} preserveAspectRatio="xMidYMid meet"/>;
  return <g className="flip-linework" transform={`scale(1 ${height / 667})`}>
    <defs><pattern id={`flip-grid-${page.id}`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28"/></pattern></defs>
    <rect width="1000" height="667" fill="#fbfcfb"/>
    <rect x="18" y="18" width="964" height="631" fill={`url(#flip-grid-${page.id})`} stroke="#b9c4cb"/>
    <path className="flip-wall" d="M115 115H842V492H115ZM115 304H842M305 115V304M507 115V492M682 115V304M260 304V492M682 304V492"/>
    <path d="M144 143h128v57H144zm194 0h134v109H338zm205 0h105v109H543zm174 0h92v109h-92zM144 341h82v110h-82zm151 0h177v110H295zm248 0h105v110H543zm174 0h92v110h-92z"/>
    <path d="M111 86H846M111 78V94M305 78V94M507 78V94M682 78V94M846 78V94M80 115V492M72 115H88M72 304H88M72 492H88"/>
    <path d="M186 115v42a42 42 0 0 0 42-42M507 238h-42a42 42 0 0 0 42 42M682 375h42a42 42 0 0 0-42-42M260 418h-42a42 42 0 0 0 42 42"/>
    <g className="flip-room-labels"><text x="210" y="285">ROOM 101</text><text x="405" y="285">MULTIPURPOSE</text><text x="595" y="285">OFFICE</text><text x="760" y="285">COMMUNITY</text><text x="187" y="477">SERVICE</text><text x="385" y="477">LOBBY</text><text x="595" y="477">MEETING</text><text x="760" y="477">RECEPTION</text></g>
    <g className="flip-titleblock"><path d="M674 535h268v91H674zM790 535v91M674 574h268"/><text x="692" y="558">{page.documentName || "PROJECT DRAWING SET"}</text><text x="692" y="597">{page.title || page.discipline}</text><text x="812" y="610" className="sheet">{page.sheet}</text></g>
    <text x="55" y="55" className="flip-demo-note">ILLUSTRATIVE LINEWORK · SOURCE IMAGE NOT LOADED</text>
  </g>;
}

export type CanvasRegion = Pick<FlipRegion, "id" | "number" | "label" | "polygon" | "packageId" | "status" | "anchor">;

export function pointerToPage(clientX: number, clientY: number, bounds: Pick<DOMRect, "left" | "top" | "width" | "height">): Point | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const x = (clientX - bounds.left) / bounds.width, y = (clientY - bounds.top) / bounds.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

export function RedrawOutlineButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick}><PencilRuler size={15}/>Redraw outline</Button>;
}

export function RegionHistory({ region, packages, comparison, onCompare }: {
  region: FlipRegion; packages: { id: string; name: string }[];
  comparison?: FlipRegion["history"][number] | null;
  onCompare: (event: Extract<FlipRegion["history"][number], { kind: "redrawn" }>) => void;
}) {
  return <div className="flip-history"><h3>Region history</h3>{[...region.history].reverse().map((event, index) => <div key={`${event.at}-${index}`}><i/><span>
    {event.kind === "redrawn" ? <button className="flip-history-compare" aria-pressed={comparison === event} onClick={() => onCompare(event)}><strong>{eventLabel(event.kind)}</strong><small>{event.by} · {activityDate(event.at)}</small>{event.reason && <em>{event.reason}</em>}<small>Compare previous outline</small></button> : <><strong>{eventLabel(event.kind)}</strong><small>{event.by} · {activityDate(event.at)}</small>{event.kind === "reassigned" && <em>{packages.find(pkg => pkg.id === event.from)?.name} → {packages.find(pkg => pkg.id === event.to)?.name}{event.reason ? ` · ${event.reason}` : ""}</em>}</>}
  </span></div>)}</div>;
}

type Trace = { regionId: string; points: Point[]; reason: string; errors: DrawingFlipErrors };
type TraceActions = { onPoint: (point: Point) => void; onUndo: () => void; onFinish: () => void; onCancel: () => void; onReason: (reason: string) => void };

export function TraceControls({ trace, number, onUndo, onFinish, onCancel, onReason }: { trace: Trace; number: string } & Omit<TraceActions, "onPoint">) {
  return <section className="flip-trace-controls" aria-label="Redraw outline controls">
    <p role="status">Tracing {number}: click to add points, Enter to finish, Esc to cancel. Arrow keys pan; Backspace removes the last point.</p>
    <div className="flip-trace-actions"><strong aria-live="polite">{trace.points.length} points</strong><Button disabled={!trace.points.length} onClick={onUndo}>Undo point</Button><Button onClick={onCancel}>Cancel</Button><Button variant="primary" disabled={trace.points.length < 3} onClick={onFinish}>Finish</Button><label className="ui-field">Reason (optional)<input value={trace.reason} onChange={e => onReason(e.target.value)} placeholder="Tighter around the curb"/></label></div>
    <p className="flip-outline-key">Dashed: current outline · Solid: new outline. Trade and review state stay the same.</p>
    {Object.entries(trace.errors).map(([field, message]) => <p key={field} role="alert" className="flip-error">{message}</p>)}
  </section>;
}

/** A rectangle being marked on a sheet, 0-1 from its top-left corner. */
export type MarkBox = { x: number; y: number; width: number; height: number };
type BoxHandle = "move" | "nw" | "ne" | "sw" | "se";

export function DrawingCanvas({ page, regions, selectedId, colors, onSelect, expandable = true, fullPage = false, onFullPage, regionDetail, trace, traceActions, comparison, onClearComparison, focus, describe, navigation, markScope }: {
  page: DrawingPage;
  regions: CanvasRegion[];
  selectedId: string;
  colors: Map<string, string>;
  onSelect: (id: string) => void;
  expandable?: boolean;
  fullPage?: boolean; onFullPage?: (open: boolean) => void; regionDetail?: ReactNode;
  trace?: Trace | null; traceActions?: TraceActions;
  comparison?: { regionId: string; from: Point[] } | null; onClearComparison?: () => void;
  /** Zoom the full view to this region; a new `n` zooms again. */
  focus?: { regionId: string; n: number } | null;
  /** The hover text for a region: number, label, trade and owner. */
  describe?: (region: CanvasRegion) => string;
  /** Previous and Next on the sheet itself, with where it is in the set ("A-506 · 46 / 102"). */
  navigation?: { label: string; onPrev: () => void; onNext: () => void };
  /** Right-click "Add a scope line here": the rectangle being marked, and the box to fill in beside it. */
  markScope?: { box: MarkBox | null; onBox: (box: MarkBox | null) => void; form: ReactNode };
}) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(100);
  const pan = useRef<{x:number;y:number;left:number;top:number}|null>(null);
  const panElement = useRef<HTMLDivElement>(null);
  // Zooming keeps a point of the sheet in place (the cursor, or a region's middle); applied once the new size is laid out.
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const keep = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null);
  const [laid, setLaid] = useState(0);
  function zoomAt(next: number, clientX?: number, clientY?: number) {
    const el = panElement.current, value = Math.min(MAX_ZOOM, Math.max(50, Math.round(next)));
    if (el) {
      const rect = el.getBoundingClientRect(), px = (clientX ?? rect.left + rect.width / 2) - rect.left, py = (clientY ?? rect.top + rect.height / 2) - rect.top;
      keep.current = { fx: (el.scrollLeft + px) / el.scrollWidth, fy: (el.scrollTop + py) / el.scrollHeight, px, py };
    }
    setZoom(value); setLaid(n => n + 1);
  }
  useLayoutEffect(() => {
    const el = panElement.current, k = keep.current;
    if (!el || !k) return;
    el.scrollLeft = k.fx * el.scrollWidth - k.px; el.scrollTop = k.fy * el.scrollHeight - k.py; keep.current = null;
  }, [zoom, laid]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const isExpanded = fullPage || expanded;
  // Scroll wheel or trackpad pinch zooms toward the cursor, like Wire AI; dragging pans.
  useEffect(() => {
    const el = panElement.current;
    if (!el || !isExpanded) return;
    const wheel = (e: WheelEvent) => { if (trace) return; e.preventDefault(); zoomAt(zoomRef.current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  function expand(open:boolean){if(onFullPage)onFullPage(open);else setExpanded(open);}

  // ── The drawing box on the page (Danial, 24 Nov): the wheel zooms where you point, left-drag moves the sheet, right-click
  // marks a new scope line with a rectangle you can move and resize, and Previous/Next sit on the sheet. The full view keeps
  // its own zoom.
  const boxNav = !!navigation || !!markScope;
  const boxRef = useRef<HTMLDivElement>(null), wrapRef = useRef<HTMLDivElement>(null);
  const [boxZoom, setBoxZoom] = useState(100);
  const boxZoomRef = useRef(boxZoom); boxZoomRef.current = boxZoom;
  const boxKeep = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null);
  const [boxLaid, setBoxLaid] = useState(0);
  const boxPan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const clickAfterPan = useRef(false);
  const [menu, setMenu] = useState<{ left: number; top: number; point: Point } | null>(null);
  /** After "Add a scope line here": the next drag draws the rectangle instead of moving the sheet. */
  const [drawingBox, setDrawingBox] = useState(false);
  const boxDrag = useRef<{ kind: BoxHandle | "new"; start: Point; box: MarkBox } | null>(null);
  function boxZoomAt(next: number, clientX?: number, clientY?: number) {
    const el = boxRef.current, value = Math.min(MAX_ZOOM, Math.max(100, Math.round(next)));
    if (el) {
      const rect = el.getBoundingClientRect(), px = (clientX ?? rect.left + rect.width / 2) - rect.left, py = (clientY ?? rect.top + rect.height / 2) - rect.top;
      boxKeep.current = { fx: (el.scrollLeft + px) / el.scrollWidth, fy: (el.scrollTop + py) / el.scrollHeight, px, py };
    }
    setBoxZoom(value); setBoxLaid(n => n + 1);
  }
  useLayoutEffect(() => {
    const el = boxRef.current, k = boxKeep.current;
    if (!el || !k) return;
    el.scrollLeft = k.fx * el.scrollWidth - k.px; el.scrollTop = k.fy * el.scrollHeight - k.py; boxKeep.current = null;
  }, [boxZoom, boxLaid]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !boxNav) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setMenu(null); boxZoomAt(boxZoomRef.current * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // A new sheet opens fitted, with nothing half-marked on it.
  useEffect(() => { setBoxZoom(100); setMenu(null); setDrawingBox(false); boxDrag.current = null; markScope?.onBox(null); }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Where a pointer is on the sheet, 0-1, held to the sheet's edges. */
  const sheetPoint = (e: { clientX: number; clientY: number }, sheet: Element): Point => {
    const r = sheet.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  /** A starting rectangle where the menu was opened, to drag out a new one or move and resize this one. */
  function startMark(point: Point) {
    setMenu(null);
    const width = 0.12, height = 0.06;
    markScope?.onBox({ x: Math.min(1 - width, Math.max(0, point.x - width / 2)), y: Math.min(1 - height, Math.max(0, point.y - height / 2)), width, height });
    setDrawingBox(true);
  }
  function cancelMark() { setMenu(null); setDrawingBox(false); boxDrag.current = null; markScope?.onBox(null); }
  function markDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!markScope || e.button !== 0) return;
    const handle = (e.target as Element).closest("[data-handle]")?.getAttribute("data-handle") as BoxHandle | null;
    if (!handle && !drawingBox) return;
    e.stopPropagation();
    const start = sheetPoint(e, e.currentTarget);
    boxDrag.current = { kind: handle ?? "new", start, box: handle && markScope.box ? markScope.box : { x: start.x, y: start.y, width: 0, height: 0 } };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function markMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = boxDrag.current;
    if (!d || !markScope) return;
    const p = sheetPoint(e, e.currentTarget), b = d.box, dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.kind === "new") { markScope.onBox({ x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), width: Math.abs(dx), height: Math.abs(dy) }); return; }
    if (d.kind === "move") { markScope.onBox({ ...b, x: Math.min(1 - b.width, Math.max(0, b.x + dx)), y: Math.min(1 - b.height, Math.max(0, b.y + dy)) }); return; }
    const left = d.kind.includes("w") ? b.x + dx : b.x, right = d.kind.includes("e") ? b.x + b.width + dx : b.x + b.width;
    const top = d.kind.includes("n") ? b.y + dy : b.y, bottom = d.kind.includes("s") ? b.y + b.height + dy : b.y + b.height;
    markScope.onBox({ x: Math.max(0, Math.min(left, right)), y: Math.max(0, Math.min(top, bottom)), width: Math.min(1, Math.abs(right - left)), height: Math.min(1, Math.abs(bottom - top)) });
  }
  function markUp(e: ReactPointerEvent<SVGSVGElement>) {
    const d = boxDrag.current;
    boxDrag.current = null;
    if (!d || !markScope) return;
    setDrawingBox(false);
    // A click without a drag keeps a rectangle there that can be seen and grabbed.
    const p = sheetPoint(e, e.currentTarget);
    if (d.kind === "new" && (Math.abs(p.x - d.start.x) < 0.01 || Math.abs(p.y - d.start.y) < 0.008)) markScope.onBox({ x: Math.min(0.88, Math.max(0, d.start.x - 0.06)), y: Math.min(0.94, Math.max(0, d.start.y - 0.03)), width: 0.12, height: 0.06 });
  }
  useEffect(() => { pan.current = null; setHoverPoint(null); panElement.current?.focus({ preventScroll: true }); }, [trace?.regionId]);

  const file = useSourceFile(page.documentName);
  const [rendered, setRendered] = useState<{ file: File; page: number; image: string } | null>(null);
  const [sourceError, setSourceError] = useState("");
  const runtime = page.source === "uploaded";
  // The real sheet from Project files: by document id, or by sheet number in the stored drawing set.
  const { documents } = useProjectDocuments();
  const stored = useMemo(() => {
    const byId = documents.find(d => d.id === page.documentId);
    if (byId) return { doc: byId, pageNumber: page.pageNumber };
    const found = findSheet(documents, page.sheet);
    return found ? { doc: found.doc, pageNumber: found.sheet.page } : null;
  }, [documents, page.documentId, page.pageNumber, page.sheet]);
  const renderSize = isExpanded ? 3600 : 2400;
  const storedKey = stored ? `${stored.doc.id}:${stored.pageNumber}:${renderSize}` : "";
  const [storedImage, setStoredImage] = useState<{ key: string; image: string; aspect: number } | null>(null);
  useEffect(() => {
    if (!stored) return;
    let live = true;
    renderStoredPage(stored.doc, stored.pageNumber, renderSize).then(result => { if (live) setStoredImage({ key: storedKey, ...result }); }, error => { if (live) setSourceError(error instanceof Error ? error.message : "The sheet could not be rendered."); });
    return () => { live = false; };
  }, [storedKey]);
  const storedReady = storedImage?.key === storedKey ? storedImage : null;
  useEffect(() => {
    const region = focus && regions.find(r => r.id === focus.regionId), el = panElement.current;
    if (!isExpanded || !region || !el) return;
    const b = bounds(region.polygon), sheetHeight = el.clientWidth * (1 / (storedReady?.aspect ?? page.aspect));
    const next = Math.min(MAX_ZOOM, Math.max(100, 100 * Math.min(0.35 / Math.max(b.width, 0.005), (0.35 * el.clientHeight / sheetHeight) / Math.max(b.height, 0.005))));
    keep.current = { fx: b.x + b.width / 2, fy: b.y + b.height / 2, px: el.clientWidth / 2, py: el.clientHeight / 2 };
    setZoom(Math.round(next)); setLaid(n => n + 1);
  }, [focus?.n, isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps
  const image = page.image || storedReady?.image || (rendered?.file === file && rendered?.page === page.pageNumber ? rendered.image : null);
  useEffect(() => {
    let current = true;
    setSourceError("");
    if (runtime && file) import("../../lib/pdf-drawing").then(lib => lib.renderDrawingPage(file, page.pageNumber)).then(result => { if (current) setRendered({ file, page: page.pageNumber, image: result.image }); }, error => { if (current) setSourceError(error instanceof Error ? error.message : "The source page could not be rendered."); });
    return () => { current = false; };
  }, [runtime, file, page.pageNumber]);
  const sourceNeeded = runtime && !image ? <div className="flip-source-needed"><p>{sourceError || (file ? "Rendering original drawing page…" : `Choose ${page.documentName} to view the original sheet and its highlights.`)}</p><label className="ui-field">Original drawing PDF<input type="file" accept=".pdf,application/pdf" onChange={event => { const chosen = event.target.files?.[0]; if (!chosen) return; if (chosen.name !== page.documentName) { setSourceError(`Choose the cited file: ${page.documentName}.`); return; } rememberPdf(chosen); }}/></label></div> : stored && !image ? <div className="flip-source-needed"><p role="status">{sourceError || `Loading ${page.sheet} from ${stored.doc.name}…`}</p></div> : null;
  const displayPage = image ? { ...page, image } : page;
  const height = 1000 / (storedReady?.aspect ?? page.aspect);
  const svgPoints = (points: Point[]) => points.map(point => `${point.x * 1000},${point.y * height}`).join(" ");
  // The marked rectangle's corner handles stay about 12 px on screen at any zoom.
  const handle = 12 / Math.max(0.05, (boxRef.current?.clientWidth ?? 700) * boxZoom / 100 / 1000);
  // The form opens on the side of the sheet away from the rectangle, so it never covers it (as laid out last).
  const formOnLeft = (() => {
    const b = markScope?.box, sheet = boxRef.current?.querySelector("svg")?.getBoundingClientRect(), wrap = wrapRef.current?.getBoundingClientRect();
    return !!(b && sheet && wrap) && sheet.left + (b.x + b.width / 2) * sheet.width > wrap.left + wrap.width / 2;
  })();
  /** Screen pixels per drawing unit (the sheet is 1000 wide) in the drawing box, the full view, or a fixed sheet. */
  const pxPerUnit = (inBox: boolean, full: boolean) => Math.max(0.05, ((inBox ? boxRef.current : full ? panElement.current : null)?.clientWidth ?? 700) * (inBox ? boxZoom : full ? zoom : 100) / 100 / 1000);
  const drawing = (interactive = false, inBox = false) => sourceNeeded || <svg viewBox={`0 0 1000 ${height}`} role="img" aria-label={`${page.sheet} with ${regions.length} trade regions`}
    className={interactive && trace ? "flip-tracing" : inBox && drawingBox ? "flip-drawing-box" : undefined}
    onClick={interactive && trace ? event => { const point = pointerToPage(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()); if (point) { traceActions?.onPoint(point); panElement.current?.focus({ preventScroll: true }); } } : undefined}
    onPointerDown={inBox ? markDown : undefined}
    onPointerMove={inBox ? markMove : interactive && trace ? event => setHoverPoint(pointerToPage(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())) : undefined}
    onPointerUp={inBox ? markUp : undefined}
    onPointerLeave={() => setHoverPoint(null)}>
    <DrawingBackdrop page={displayPage} height={height}/>
    <g className="flip-region-layer">{(() => { const unit = pxPerUnit(inBox, interactive); return regions.map(region => {
      const points = region.polygon.map(point => `${point.x * 1000},${point.y * height}`).join(" ");
      // The selected highlight's number is a small tag at its top-left corner, just outside it, about 15 px tall at any zoom
      // (Danial, 24 Nov: a 32-unit circle on the box's middle grew with the zoom and covered the title it marked). The rest
      // show their number on hover and in the list below.
      const box = bounds(region.polygon), tag = region.number.replace("R-", "");
      const tagH = 15 / unit, tagW = (tag.length * 6.4 + 10) / unit, gap = 3 / unit;
      const tagX = Math.min(1000 - tagW, box.x * 1000), above = box.y * height - tagH - gap;
      const tagY = above >= 0 ? above : (box.y + box.height) * height + gap;
      const color = colors.get(region.packageId) ?? "#697b8c";
      return <g key={region.id} role={interactive && trace ? undefined : "button"} tabIndex={interactive && trace ? undefined : 0} aria-label={`${region.number}: ${region.label}`} className={`${selectedId === region.id ? "selected" : ""} ${region.status === "pending-review" ? "pending" : ""} ${region.anchor === "image" ? "approximate" : ""} ${trace?.regionId === region.id ? "trace-original" : ""}`} onClick={() => { if (clickAfterPan.current) { clickAfterPan.current = false; return; } if (!(interactive && trace)) onSelect(region.id); }} onKeyDown={event => { if (!(interactive && trace) && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(region.id); } }}>
        <title>{describe ? describe(region) : `${region.number}: ${region.label}`}</title>
        <polygon points={points} fill={`${color}30`} stroke={color}/>
        {selectedId === region.id && <g className="flip-region-tag"><rect x={tagX} y={tagY} width={tagW} height={tagH} rx={tagH / 2} fill={color}/><text x={tagX + tagW / 2} y={tagY + tagH / 2} dominantBaseline="central" style={{ fontSize: `${9.5 / unit}px` }}>{tag}</text></g>}
      </g>;
    }); })()}</g>
    {!trace && comparison && <polygon className="flip-previous-outline" points={svgPoints(comparison.from)} aria-label="Previous outline"/>}
    {interactive && trace && <g className="flip-trace-overlay" aria-label="New outline">
      {trace.points.length >= 3 && <polygon points={svgPoints(trace.points)}/>}
      <polyline points={svgPoints([...trace.points, ...(hoverPoint ? [hoverPoint] : [])])}/>
      {trace.points.map((point, i) => <circle key={i} cx={point.x * 1000} cy={point.y * height} r="4"/>)}
    </g>}
    {inBox && markScope?.box && (() => {
      const b = markScope.box, x = b.x * 1000, y = b.y * height, w = b.width * 1000, h = b.height * height;
      const corners: [BoxHandle, number, number][] = [["nw", x, y], ["ne", x + w, y], ["sw", x, y + h], ["se", x + w, y + h]];
      return <g className="flip-new-box" aria-label="New scope line's area">
        <rect data-handle="move" x={x} y={y} width={w} height={h}/>
        {corners.map(([k, hx, hy]) => <rect key={k} data-handle={k} className={`flip-box-handle ${k}`} x={hx - handle / 2} y={hy - handle / 2} width={handle} height={handle}/>)}
      </g>;
    })()}
  </svg>;
  return <>
    <div ref={wrapRef} className="flip-canvas-wrap" onKeyDown={event => { if (event.key === "Escape" && (menu || markScope?.box)) { event.stopPropagation(); cancelMark(); } }}>
      {boxNav
        ? <div ref={boxRef} className={`flip-sheet flip-box-pan ${drawingBox ? "is-drawing" : ""}`} style={{ aspectRatio: `${storedReady?.aspect ?? page.aspect}` }} tabIndex={0} role="region"
            aria-label={`${page.sheet}: scroll to zoom, drag to move the sheet${markScope ? ", right-click to add a scope line" : ""}`}
            onPointerDown={e => { clickAfterPan.current = false; if (e.button !== 0 || drawingBox || (e.target as Element).closest("[data-handle], .flip-context-menu")) return; setMenu(null); boxPan.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop, moved: false }; }}
            onPointerMove={e => { const p = boxPan.current; if (!p) return; if (!p.moved) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return; p.moved = true; e.currentTarget.setPointerCapture(e.pointerId); } e.currentTarget.scrollLeft = p.left + p.x - e.clientX; e.currentTarget.scrollTop = p.top + p.y - e.clientY; }}
            onPointerUp={() => { if (boxPan.current?.moved) clickAfterPan.current = true; boxPan.current = null; }}
            onPointerCancel={() => { boxPan.current = null; }}
            onDoubleClick={e => { if ((e.target as Element).closest('[role="button"], [data-handle]')) return; boxZoomAt(boxZoom * 2, e.clientX, e.clientY); }}
            onContextMenu={e => {
              if (!markScope) return;
              e.preventDefault();
              const sheet = e.currentTarget.querySelector("svg"), wrap = wrapRef.current?.getBoundingClientRect();
              if (!sheet || !wrap) return;
              setMenu({ left: e.clientX - wrap.left, top: e.clientY - wrap.top, point: sheetPoint(e, sheet) });
            }}>
            <div className="flip-zoom-sheet" style={{ width: `${boxZoom}%` }}>{drawing(false, true)}</div>
          </div>
        : <div className="flip-sheet">{drawing()}</div>}
      {expandable && <button className="flip-expand" onClick={() => expand(true)} aria-label="Expand drawing"><Maximize2 size={16}/></button>}
      {!image && <span className="flip-image-state"><PencilRuler size={13}/>Diagram preview</span>}
      {navigation && <>
        <button className="flip-sheet-step prev" aria-label="Previous drawing" title="Previous drawing" onClick={navigation.onPrev}><ArrowLeft size={18}/></button>
        <button className="flip-sheet-step next" aria-label="Next drawing" title="Next drawing" onClick={navigation.onNext}><ArrowRight size={18}/></button>
        <span className="flip-sheet-label">{navigation.label}</span>
      </>}
      {boxNav && <div className="flip-box-zoom" role="group" aria-label="Sheet zoom"><button aria-label="Zoom out" onClick={() => boxZoomAt(boxZoom / 1.25)}>−</button><output>{boxZoom}%</output><button aria-label="Zoom in" onClick={() => boxZoomAt(boxZoom * 1.25)}>+</button><button onClick={() => boxZoomAt(100)}>Fit</button></div>}
      {markScope && !markScope.box && !menu && <span className="flip-box-hint">Scroll to zoom · drag to move · right-click to add a scope line</span>}
      {drawingBox && <span className="flip-box-hint is-active" role="status">Drag over the area for the new line, or move and resize the box · Esc cancels</span>}
      {menu && <div className="flip-context-menu" role="menu" style={{ left: menu.left, top: menu.top }}>
        <button role="menuitem" autoFocus onClick={() => startMark(menu.point)}><Plus size={14}/>Add a scope line here</button>
        <button role="menuitem" onClick={() => setMenu(null)}>Cancel</button>
      </div>}
      {markScope?.box && <div className={`flip-mark-form ${formOnLeft ? "on-left" : ""}`}>{markScope.form}</div>}
    </div>
    {isExpanded && <Modal title={`${page.sheet} · ${page.title}`} subtitle={trace ? "Redraw outline · Trace the work on the sheet." : "Scroll to zoom where you point, drag or use arrow keys to pan, double-click to zoom in. Select a region to see its scope items. Esc closes."} fullScreen onClose={() => { if (trace) traceActions?.onCancel(); else expand(false); }}>
      <div className="flip-full-content" onKeyDownCapture={event => {
        if (!trace) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); traceActions?.onCancel(); return; }
        if ((event.target as Element).closest('input, textarea, select, button, [contenteditable="true"]')) return;
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (trace.points.length >= 3) traceActions?.onFinish(); }
        if (event.key === "Backspace") { event.preventDefault(); traceActions?.onUndo(); }
        const delta = { ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] }[event.key];
        if (delta) { event.preventDefault(); panElement.current?.scrollBy(delta[0], delta[1]); }
      }}>
      <div className="flip-full-toolbar"><Button onClick={()=>zoomAt(zoom/1.25)}>Zoom out</Button><label>Zoom <input aria-label="Sheet zoom" type="range" min="50" max={MAX_ZOOM} step="25" value={zoom} onChange={e=>zoomAt(Number(e.target.value))}/></label><output>{zoom}%</output><Button onClick={()=>zoomAt(zoom*1.25)}>Zoom in</Button><Button onClick={()=>setZoom(100)}>Fit page</Button></div>
      {trace && traceActions && <TraceControls trace={trace} number={regions.find(r => r.id === trace.regionId)?.number ?? "region"} {...traceActions}/>}
      {!trace && comparison && <div className="flip-comparison-note" role="status">Dashed: previous outline · Colored: current outline <Button onClick={onClearComparison}>Hide previous outline</Button></div>}
      <div className="flip-full-layout"><div ref={panElement} className={`flip-pan ${trace ? "is-tracing" : ""}`} tabIndex={0} role="region" aria-label="Drawing sheet; scroll to zoom, drag or arrow keys to pan, double-click to zoom in" onDoubleClick={e=>{if(trace||(e.target as Element).closest('[role="button"]'))return;zoomAt(zoom*2,e.clientX,e.clientY);}} onPointerDown={e=>{if(trace||(e.target as Element).closest('[role="button"]')||e.button!==0)return;pan.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!pan.current)return;e.currentTarget.scrollLeft=pan.current.left+pan.current.x-e.clientX;e.currentTarget.scrollTop=pan.current.top+pan.current.y-e.clientY;}} onPointerUp={()=>{pan.current=null;}} onPointerCancel={()=>{pan.current=null;}}><div className="flip-zoom-sheet" style={{width:`${zoom}%`}}>{drawing(true)}</div></div>{!trace && regionDetail&&<aside className="flip-full-detail">{regionDetail}</aside>}</div>
      </div>
    </Modal>}
  </>;
}

function PageEditor({ errors, onClose, onSave }: { errors: DrawingFlipErrors; onClose: () => void; onSave: (draft: PageDraft) => void }) {
  const [draft, setDraft] = useState<PageDraft>({ sheet: "", title: "", discipline: "Architectural", revision: "", documentId: "drawing-set", documentName: "Project drawing set.pdf", pageNumber: "1" });
  return <Modal title="Add a drawing page" subtitle="Connect one sheet to its source file and page number." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    {Object.keys(errors).length > 0 && <div className="flip-error"><CircleDot size={15}/>{firstError(errors)}</div>}
    <div className="ui-form-grid"><label className="ui-field">Sheet number<input autoFocus required value={draft.sheet} onChange={event => setDraft({ ...draft, sheet: event.target.value })} placeholder="A-101"/></label><label className="ui-field">Revision<input value={draft.revision} onChange={event => setDraft({ ...draft, revision: event.target.value })} placeholder="02"/></label></div>
    <label className="ui-field">Drawing title<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="First floor plan"/></label>
    <div className="ui-form-grid"><label className="ui-field">Discipline<input value={draft.discipline} onChange={event => setDraft({ ...draft, discipline: event.target.value })}/></label><label className="ui-field">PDF page<input type="number" min="1" required value={draft.pageNumber} onChange={event => setDraft({ ...draft, pageNumber: event.target.value })}/></label></div>
    <label className="ui-field">Source document<input required value={draft.documentName} onChange={event => setDraft({ ...draft, documentName: event.target.value, documentId: event.target.value.trim().toLowerCase().replace(/\W+/g, "-") || "drawing-set" })}/></label>
    <div className="flip-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add page</Button></div>
  </form></Modal>;
}

function RegionEditor({ packages, errors, onClose, onSave }: { packages: ReturnType<typeof useProcurement>["state"]["packages"]; errors: DrawingFlipErrors; onClose: () => void; onSave: (draft: RegionDraft) => void }) {
  const [draft, setDraft] = useState<RegionDraft>({ label: "", packageId: packages[0]?.id ?? "", x: "15", y: "15", width: "25", height: "20", notes: "" });
  return <Modal title="Mark a drawing region" subtitle="Add an estimator-reviewed rectangle to the current page." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    {Object.keys(errors).length > 0 && <div className="flip-error"><CircleDot size={15}/>{firstError(errors)}</div>}
    <label className="ui-field">What does this region show?<input autoFocus required value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} placeholder="Acoustical ceiling area"/></label>
    <label className="ui-field">Responsible trade<select value={draft.packageId} onChange={event => setDraft({ ...draft, packageId: event.target.value })}>{packages.map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
    <div className="flip-coordinates"><label>X %<input type="number" step="any" min="0" max="99" value={draft.x} onChange={event => setDraft({ ...draft, x: event.target.value })}/></label><label>Y %<input type="number" step="any" min="0" max="99" value={draft.y} onChange={event => setDraft({ ...draft, y: event.target.value })}/></label><label>Width %<input type="number" step="any" min="1" max="100" value={draft.width} onChange={event => setDraft({ ...draft, width: event.target.value })}/></label><label>Height %<input type="number" step="any" min="1" max="100" value={draft.height} onChange={event => setDraft({ ...draft, height: event.target.value })}/></label></div>
    <label className="ui-field">Review notes<textarea rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })}/></label>
    <div className="flip-form-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add reviewed region</Button></div>
  </form></Modal>;
}

export function DrawingFlipWorkspace({ projectName, notify, navigate }: ViewProps) {
  // One copy of the records: placing the AI's highlights writes the review findings and Drawing Flip together.
  const { flip: state, runFlip: run, procurement, runProcurement, extraction, placeAllHighlights, addScopeOnDrawing } = useExtraction();
  /** A scope line being marked on the sheet: its rectangle, and what goes in the bid form (Danial, 24 Nov). */
  const [markBox, setMarkBox] = useState<MarkBox | null>(null);
  const [markDraft, setMarkDraft] = useState({ packageId: "", title: "", detail: "" });
  const { documents } = useProjectDocuments();
  /** Flip through the sheets that carry highlights only (Marcel, 18 Nov: each trade's scope highlighted per page, Next and Previous). */
  const [onlyMarked, setOnlyMarked] = useState(true);
  /** Highlights the AI drew while reading that aren't on Drawing Flip yet (lib/extraction placeHighlights). */
  const waiting = useMemo(() => extraction.drafts.filter(d => d.kind === "region" && d.status === "pending-review" && !d.removed).length, [extraction.drafts]);
  const [fullPage,setFullPage] = useState(false);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [comparison, setComparison] = useState<{ regionId: string; event: Extract<FlipRegion["history"][number], { kind: "redrawn" }> } | null>(null);
  const [sheetQuery,setSheetQuery] = useState("");
  const [locateTrade,setLocateTrade] = useState("");
  const [locating,setLocating] = useState(false);
  const [progress,setProgress] = useState("");
  const [result,setResult] = useState<Awaited<ReturnType<typeof locateScopes>>|null>(null);
  const abort = useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  const [pageId, setPageId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [owner, setOwner] = useState("");
  const [focus, setFocus] = useState<{ regionId: string; n: number } | null>(null);
  /** Opens the full view zoomed to a region (Marcel, 24 Oct: "look how it zooms in to where it's written"). */
  const zoomTo = (id: string) => { setRegionId(id); setFullPage(true); setFocus(f => ({ regionId: id, n: (f?.n ?? 0) + 1 })); };
  const [filters, setFilters] = useState<Filters>({ query: "", packageId: "", status: "", origin: "", corrected: false });
  const [mode, setMode] = useState<"regions" | "corrections" | "unlocated">("regions");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkId, setLinkId] = useState("");
  const [pageEditor, setPageEditor] = useState(false);
  const [regionEditor, setRegionEditor] = useState(false);
  const [errors, setErrors] = useState<DrawingFlipErrors>({});

  const [showGuesses, setShowGuesses] = useState(false);
  const marked = useMemo(() => new Set(state.regions.filter(r => showGuesses || onPrintedWords(r)).map(r => r.pageId)), [state.regions, showGuesses]);
  const flipPages = onlyMarked && marked.size ? state.pages.filter(p => marked.has(p.id)) : state.pages;
  const page = state.pages.find(item => item.id === pageId) ?? flipPages[0] ?? state.pages[0];
  const activePageId = page?.id ?? "";
  const guesses = state.regions.filter(r => r.pageId === activePageId && !onPrintedWords(r)).length;
  const visible = useMemo(() => filterRegions(state, procurement, {
    pageId: activePageId,
    query: filters.query || undefined,
    packageId: filters.packageId || undefined,
    status: filters.status || undefined,
    origin: filters.origin || undefined,
    corrected: filters.corrected || undefined,
  }).filter(region => (showGuesses || onPrintedWords(region)) && (!owner || procurement.packages.find(pkg => pkg.id === region.packageId)?.owner === owner)), [state, procurement, activePageId, filters, owner, showGuesses]);
  const selected = visible.find(item => item.id === regionId) ?? visible[0] ?? null;
  const pageIndex = Math.max(0, flipPages.findIndex(item => item.id === activePageId));
  const summary = flipSummary(state);
  const pageSummary = flipSummary(state, activePageId);
  const hasRegionFilters = Boolean(filters.query.trim() || filters.packageId || filters.status || filters.origin || filters.corrected || owner);
  const legend = tradeLegend(state, procurement, activePageId);
  const colors = useMemo(() => new Map(procurement.packages.map((pkg, index) => [pkg.id, tradeColors[index % tradeColors.length]])), [procurement.packages]);
  const missing = unlocatedScopes(state, procurement);
  const correctionLog = corrections(state);
  const selectedPackage = selected ? procurement.packages.find(pkg => pkg.id === selected.packageId) : undefined;
  // One trade, one person (Marcel, 24 Oct): the package's owner. People are the project team and today's owners.
  const ownerOf = (packageId: string) => procurement.packages.find(pkg => pkg.id === packageId)?.owner ?? "";
  const team = useMemo(() => ((loadProjects() ?? sampleProjectRecords).find(p => p.id === getActiveProjectId())?.team ?? []).map(m => m.name), []);
  const people = [...new Set([...team, ...procurement.packages.map(pkg => pkg.owner), CURRENT_USER].filter(Boolean))].sort();
  const owners = [...new Set(procurement.packages.map(pkg => pkg.owner).filter(Boolean))].sort();
  const describe = (region: CanvasRegion) => { const pkg = procurement.packages.find(p => p.id === region.packageId); return [`${region.number} · ${region.label}`, pkg?.name, pkg?.owner, region.anchor === "image" ? "approximate position" : ""].filter(Boolean).join(" · "); };
  function setTradeOwner(packageId: string, name: string) {
    const pkg = procurement.packages.find(p => p.id === packageId);
    const issue = runProcurement(current => editPackage(current, packageId, { owner: name }));
    notify(issue ?? (name ? `${pkg?.name} is now ${name}'s trade.` : `${pkg?.name} has no owner now.`));
  }
  const linkedScopes = selected ? procurement.scopes.filter(scope => selected.scopeIds.includes(scope.id)) : [];
  const availableScopes = selected ? procurement.scopes.filter(scope => !selected.scopeIds.includes(scope.id) && (scope.packageId === selected.packageId || scope.allTrades)) : [];
  const comparedEvent = comparison?.regionId === selected?.id ? comparison?.event : null;
  function startRedraw() {
    if (!selected) return;
    setComparison(null); setTrace({ regionId: selected.id, points: [], reason: "", errors: {} }); setFullPage(true);
  }
  const traceActions: TraceActions = {
    onPoint: point => setTrace(current => current && ({ ...current, points: [...current.points, point], errors: {} })),
    onUndo: () => setTrace(current => current && ({ ...current, points: current.points.slice(0, -1), errors: {} })),
    onReason: reason => setTrace(current => current && ({ ...current, reason })),
    onCancel: () => { setTrace(null); notify("Redraw cancelled. Outline unchanged."); },
    onFinish: () => {
      if (!trace || trace.points.length < 3) return;
      const issue = run(current => redrawRegion(current, trace.regionId, trace.points, CURRENT_USER, trace.reason));
      if (issue) { setTrace({ ...trace, errors: issue }); return; }
      setTrace(null); setComparison(null); notify("Outline saved. Trade and review state retained.");
    },
  };
  const history = selected && <RegionHistory region={selected} packages={procurement.packages} comparison={comparedEvent} onCompare={event => { setComparison({ regionId: selected.id, event }); setFullPage(true); }}/>;

  useEffect(() => {
    const scopeId = sessionStorage.getItem("drawing-flip-scope");
    if (!scopeId) return;
    const region = regionsForScope(state, scopeId)[0];
    if (region) { sessionStorage.removeItem("drawing-flip-scope"); setMode("regions"); setPageId(region.pageId); setFilters({ query:"", packageId:"", status:"", origin:"", corrected:false }); setOwner(""); zoomTo(region.id); }
    else setMode("unlocated");
  }, [state]);

  function act(action: Parameters<typeof run>[0], message: string) {
    const issue = run(action);
    if (issue) { setErrors(issue); notify(firstError(issue)); return false; }
    setErrors({}); notify(message); return true;
  }
  async function findOnDrawings(){
    const pkg=procurement.packages.find(p=>p.id===locateTrade);
    if(!pkg)return;
    const items=missing.filter(s=>s.packageId===pkg.id||s.allTrades).map(({id,title,detail,source})=>({id,title,detail,source}));
    const plan=locatePlan(items,drawingRegister(documents),pkg.code);
    if(!plan.length){setProgress("No stored sheets match this trade. Store the drawing set in Project files first.");return;}
    abort.current=new AbortController();setLocating(true);setResult(null);setProgress(`Reading 1 / ${plan.length}: ${plan[0].row.sheet}`);
    try{
      const found=await locateScopes({pkg,plan,pageIdFor:sheet=>state.pages.find(p=>sheetKey(p.sheet)===sheetKey(sheet))?.id??null,signal:abort.current.signal,onProgress:(done,total)=>setProgress(`${done} / ${total} sheets read${done<total?` · Reading ${plan[done].row.sheet}`:""}`)});
      if(found.regions.length){const issues=run(s=>importRegions(s,procurement,found.regions,"Structor AI"));if(issues){notify(firstError(issues));setProgress(firstError(issues));return;}setPageId(found.regions[0].pageId);setFilters({query:"",packageId:pkg.id,status:"",origin:"",corrected:false});setMode("regions");}
      setResult(found);setProgress(`${found.regions.length} regions found · Awaiting review${abort.current.signal.aborted?" · Stopped":""}`);
    }catch(error){setProgress(error instanceof Error?error.message:"Finding scopes failed. Try again.");}finally{setLocating(false);}
  }
  function movePage(next: number) { const target = flipPages[(next + flipPages.length) % flipPages.length]; if (target) { setPageId(target.id); setRegionId(""); } }
  function saveMark() {
    if (!markBox || !page) return;
    if (markBox.width < 0.005 || markBox.height < 0.005) { notify("Drag the box over the area first: it is too small to see."); return; }
    const issue = addScopeOnDrawing({ pageId: page.id, polygon: rectangle(markBox.x, markBox.y, markBox.width, markBox.height), packageId: markDraft.packageId, title: markDraft.title, detail: markDraft.detail }, CURRENT_USER);
    if (issue) { notify(issue); return; }
    notify(`Added to ${procurement.packages.find(p => p.id === markDraft.packageId)?.name ?? "the trade"}'s bid form, highlighted on ${page.sheet}.`);
    // The trade stays chosen for the next line marked on the sheet.
    setMarkBox(null); setMarkDraft(draft => ({ ...draft, title: "", detail: "" }));
  }
  function placeHighlights() {
    const { placed, noPage } = placeAllHighlights();
    if (placed) { setOnlyMarked(true); setPageId(""); setRegionId(""); }
    notify(placed ? `${placed} highlight${placed === 1 ? "" : "s"} placed on the drawings, each in its trade's colour, awaiting your review.${noPage ? ` ${noPage} are on sheets not stored in Project files.` : ""}` : noPage ? `The ${noPage} waiting highlights are on sheets not stored in Project files.` : "No highlights are waiting.");
  }

  if (!state.pages.length) return <div className="flip-view"><PageHeader eyebrow={`${projectName} / Scope coordination`} title="Drawing Flip" description="Flip through drawing pages, assign every marked region to a trade, and connect it to the bid scope." actions={<Button variant="primary" onClick={() => setPageEditor(true)}><FilePlus2 size={16}/>Add drawing page</Button>}/><Panel><Empty title="No drawing pages in this project" description="Add the first sheet, then mark estimator regions or import Structor proposals for contractor review." action={<Button variant="primary" onClick={() => setPageEditor(true)}>Add first page</Button>}/></Panel><PreviewNote>Drawing Flip stores page references and normalized regions with the project. It does not extract drawings in the demo.</PreviewNote>{pageEditor && <PageEditor errors={errors} onClose={() => { setPageEditor(false); setErrors({}); }} onSave={draft => { if (act(current => addPage(current, { ...draft, pageNumber: Number(draft.pageNumber) }), "Drawing page added.")) setPageEditor(false); }}/>}</div>;

  const pickerPages=flipPages.filter(p=>`${p.sheet} ${p.title}`.toLowerCase().includes(sheetQuery.toLowerCase()));
  const disciplines=[...new Set(pickerPages.map(p=>p.discipline||"Other"))];
  const markForm = <form className="flip-mark-card" onSubmit={event => { event.preventDefault(); saveMark(); }}>
    <strong>New scope line on {page.sheet}</strong>
    <small>Drag the box or its corners to fit the area it covers.</small>
    <label className="ui-field">Trade / bid package<select required value={markDraft.packageId} onChange={event => setMarkDraft({ ...markDraft, packageId: event.target.value })}><option value="">Choose the trade…</option>{procurement.packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label>
    <label className="ui-field">Scope line<textarea required rows={2} value={markDraft.title} onChange={event => setMarkDraft({ ...markDraft, title: event.target.value })} placeholder="Provide gypsum board soffit at the lobby"/></label>
    <label className="ui-field">Detail (optional)<input value={markDraft.detail} onChange={event => setMarkDraft({ ...markDraft, detail: event.target.value })} placeholder="Per detail 4 on this sheet"/></label>
    <div className="flip-form-actions"><Button onClick={() => setMarkBox(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={!markDraft.packageId || !markDraft.title.trim()}><Plus size={15}/>Add to bid form</Button></div>
  </form>;
  const fullDetail=selected?<><h3>{selected.number} · {selected.label}</h3><p>{selectedPackage?.name}</p><p>Confidence: {selected.confidence===null?"Estimator reviewed":`${Math.round(selected.confidence*100)}% · Verify on sheet`}</p><p>{selected.evidence}</p><RedrawOutlineButton onClick={startRedraw}/><h4>Linked scope items</h4>{linkedScopes.length?linkedScopes.map(s=><article key={s.id}><strong>{s.title}</strong><p>{s.detail}</p><small>{s.source}</small></article>):<p>No scope items linked.</p>}{selected.status==="pending-review"&&<Button onClick={()=>act(s=>approveRegion(s,selected.id,CURRENT_USER),"Region approved.")}>Approve trade assignment</Button>}<Button onClick={()=>{setFullPage(false);setMode("regions");}}>Review assignment & notes</Button>{history}</>:<p>Select a region to see its scope items.</p>;
  return <div className="flip-view">
    <PageHeader eyebrow={`${projectName} / Scope coordination`} title="Drawing Flip" description="Review every trade region on the drawings, correct Structor's assignments, and confirm where each scope item lives." actions={<><Button onClick={() => navigate("scopes")}><ListFilter size={16}/>Scopes & bid forms</Button><Button onClick={() => setPageEditor(true)}><FilePlus2 size={16}/>Add page</Button><Button variant="primary" onClick={() => setRegionEditor(true)}><Plus size={16}/>Mark region</Button></>}/>
    {waiting > 0 && <Panel className="flip-place-panel" title={`${waiting} highlight${waiting === 1 ? "" : "s"} from the AI's scope readings ${waiting === 1 ? "isn't" : "aren't"} on the drawings yet`} subtitle="Each one marks the printed words a bid-form line was read from, in its trade's colour, linked to that line. They go on as Structor proposals for you to approve or correct here."><Button variant="primary" onClick={placeHighlights}><LocateFixed size={16}/>Show them on the drawings</Button></Panel>}
    <Stats items={[{ label: "Drawing pages", value: state.pages.length, detail: `${summary.regions} mapped regions` }, { label: "Approved regions", value: summary.approved, detail: `${summary.corrected} trade correction${summary.corrected === 1 ? "" : "s"} retained`, tone: "green" }, { label: "Awaiting review", value: summary.pendingReview, detail: "Contractor decision required", tone: summary.pendingReview ? "orange" : "green" }, { label: "Unlocated scope", value: missing.length, detail: "Items without a drawing region", tone: missing.length ? "orange" : "green" }]}/>

    <Panel className="flip-find-panel" title="Find scope on drawings" subtitle="Choose a trade. Marks are AI proposals; check their confidence and position on the original sheet."><div className="flip-ai-controls"><label className="ui-field">Trade<select value={locateTrade} disabled={locating} onChange={e=>{setLocateTrade(e.target.value);setResult(null);setProgress("");}}><option value="">Choose trade…</option>{procurement.packages.map(p=><option key={p.id} value={p.id}>{p.name} · {missing.filter(s=>s.packageId===p.id||s.allTrades).length} unlocated</option>)}</select></label><Button variant="primary" disabled={locating||!locateTrade||!missing.some(s=>s.packageId===locateTrade||s.allTrades)} onClick={()=>void findOnDrawings()}>Find on drawings</Button>{locating&&<Button onClick={()=>abort.current?.abort()}>Stop reading</Button>}</div>{progress&&<p role="status">{progress}</p>}{result&&<div className="flip-ai-results">{!result.regions.length&&<p>No usable marks found. Check the sheet yourself.</p>}{result.regions.map((r,i)=><p key={i}>{state.pages.find(p=>p.id===r.pageId)?.sheet} · {r.label} · {Math.round((r.confidence??0)*100)}% · Awaiting review</p>)}{result.dropped.map((d,i)=><p key={`d-${i}`}>Not marked: {d.what} · {d.reason}</p>)}{result.failures.map((f,i)=><p role="alert" key={`f-${i}`}>{f.sheet}: {f.error}</p>)}</div>}</Panel>
    <div className="flip-toolbar ui-panel">
      <label className="flip-sheet-select flip-sheet-search"><span>Search sheets</span><input type="search" value={sheetQuery} onChange={e=>setSheetQuery(e.target.value)} placeholder="Number or title"/></label>
      {marked.size > 0 && <label className="flip-corrected flip-only-marked"><input type="checkbox" checked={onlyMarked} onChange={event => { setOnlyMarked(event.target.checked); setRegionId(""); }}/>Only sheets with highlights ({marked.size})</label>}
      <label className="flip-sheet-select"><span>Drawing sheet · {pickerPages.length} of {state.pages.length}</span><select value={activePageId} onChange={event=>{setPageId(event.target.value);setRegionId("");}}>{!pickerPages.some(p=>p.id===activePageId)&&<option value={activePageId}>{page.sheet} · Current sheet</option>}{disciplines.map(d=><optgroup key={d} label={`${d} (${pickerPages.filter(p=>(p.discipline||"Other")===d).length})`}>{pickerPages.filter(p=>(p.discipline||"Other")===d).map(p=><option key={p.id} value={p.id}>{p.sheet} · {p.title} · {state.regions.filter(r=>r.pageId===p.id).length} regions</option>)}</optgroup>)}</select>{!pickerPages.length&&<small role="status">No sheets match.</small>}</label>
      <div className="flip-page-nav"><button aria-label="Previous drawing" onClick={() => movePage(pageIndex - 1)}><ArrowLeft size={16}/></button><span>{pageIndex + 1} / {flipPages.length}</span><button aria-label="Next drawing" onClick={() => movePage(pageIndex + 1)}><ArrowRight size={16}/></button></div>
      <div className="flip-page-meta"><strong>{page.discipline} · Revision {page.revision || "—"}</strong><span>{page.documentName} · PDF page {page.pageNumber}</span></div>
      <Badge tone={pageSummary.pendingReview ? "orange" : "green"}>{pageSummary.pendingReview ? `${pageSummary.pendingReview} to review` : !pageSummary.regions ? "No regions" : "Page reviewed"}</Badge>
    </div>

    <div className="flip-workspace">
      <section className="ui-panel flip-viewer-panel">
        <div className="flip-filterbar">
          <label className="flip-search"><Search size={15}/><input aria-label="Search drawing regions" value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Search regions…"/></label>
          <select aria-label="Filter by trade" value={filters.packageId} onChange={event => setFilters({ ...filters, packageId: event.target.value })}><option value="">All trades</option>{procurement.packages.map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.division} · {pkg.name} ({legend.find(item => item.packageId === pkg.id)?.regions ?? 0})</option>)}</select>
          <select aria-label="Filter by person" value={owner} onChange={event => setOwner(event.target.value)}><option value="">All owners</option>{owners.map(name => <option key={name} value={name}>{name}'s trades</option>)}</select>
          <select aria-label="Filter by review status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as Filters["status"] })}><option value="">All review states</option><option value="pending-review">Awaiting review</option><option value="approved">Approved</option></select>
          <select aria-label="Filter by origin" value={filters.origin} onChange={event => setFilters({ ...filters, origin: event.target.value as Filters["origin"] })}><option value="">All origins</option><option value="ai">Structor AI</option><option value="estimator">Estimator</option></select>
          <div className="flip-filter-options">
            <label className="flip-corrected"><input type="checkbox" checked={filters.corrected} onChange={event => setFilters({ ...filters, corrected: event.target.checked })}/>Corrections</label>{guesses > 0 && <label className="flip-corrected" title="AI outlines read from the drawing picture, not pinned to printed words. Hidden by default: highlights sit on the words."><input type="checkbox" checked={showGuesses} onChange={event => setShowGuesses(event.target.checked)}/>Show AI area guesses ({guesses})</label>}
          </div>
        </div>
        <div className="flip-viewer-toolbar">
          <div className="flip-legend" aria-label="Trade color legend">{legend.map(item => <button key={item.packageId} className={filters.packageId === item.packageId ? "active" : ""} onClick={() => setFilters({ ...filters, packageId: filters.packageId === item.packageId ? "" : item.packageId })}><i style={{ background: colors.get(item.packageId) }}/><span>{item.name}{ownerOf(item.packageId) ? ` · ${ownerOf(item.packageId)}` : ""}</span><small>{item.regions}</small></button>)}</div>
          <Button onClick={() => setFullPage(true)}><Maximize2 size={15}/>Open full page</Button>
        </div>
        <div className="flip-drawing">
          {!visible.length && <div className="flip-empty-note" role="status">
            {pageSummary.regions && hasRegionFilters
              ? <>No highlights match these filters. <button onClick={() => { setFilters({ query: "", packageId: "", status: "", origin: "", corrected: false }); setOwner(""); }}>Clear filters</button></>
              : guesses > 0 && !showGuesses
                ? "AI area guesses are hidden."
                : "No highlights yet. Review AI scope proposals or use Mark region to add one."}
          </div>}
          <DrawingCanvas expandable={false} page={page} regions={visible} selectedId={selected?.id ?? ""} colors={colors} onSelect={id=>{setRegionId(id);setMode("regions");}} navigation={{ label: `${page.sheet} · ${pageIndex + 1} / ${flipPages.length}`, onPrev: () => movePage(pageIndex - 1), onNext: () => movePage(pageIndex + 1) }} markScope={{ box: markBox, onBox: setMarkBox, form: markForm }} fullPage={fullPage} onFullPage={setFullPage} regionDetail={fullDetail} trace={trace} traceActions={traceActions} comparison={comparedEvent && selected ? { regionId: selected.id, from: comparedEvent.from } : null} focus={focus} describe={describe} onClearComparison={() => setComparison(null)}/>
        </div>
        <div className="flip-region-strip">{visible.map(region => <button key={region.id} className={selected?.id === region.id ? "selected" : ""} onClick={() => setRegionId(region.id)}><i style={{ background: colors.get(region.packageId) }}/><span><strong>{region.number} · {region.label}</strong><small>{procurement.packages.find(pkg => pkg.id === region.packageId)?.name} · {region.status === "pending-review" ? "Awaiting contractor" : "Approved"}</small></span><ChevronRight size={15}/></button>)}</div>
      </section>

      <aside className="flip-inspector">
        <div className="flip-side-tabs" role="group" aria-label="Drawing inspector"><button aria-pressed={mode === "regions"} className={mode === "regions" ? "active" : ""} onClick={() => setMode("regions")}><MousePointer2 size={14}/>Region</button><button aria-pressed={mode === "corrections"} className={mode === "corrections" ? "active" : ""} onClick={() => setMode("corrections")}><History size={14}/>Corrections</button><button aria-pressed={mode === "unlocated"} className={mode === "unlocated" ? "active" : ""} onClick={() => setMode("unlocated")}><LocateFixed size={14}/>Unlocated</button></div>
        {mode === "regions" && selected && <Panel className="flip-region-detail">
          <div className="flip-detail-title"><span style={{ background: `${colors.get(selected.packageId)}1f`, color: colors.get(selected.packageId) }}>{selected.origin === "ai" ? <Bot size={19}/> : <UserRound size={19}/>}</span><div><small>{selected.number} · {selected.origin === "ai" ? "STRUCTOR PROPOSAL" : "ESTIMATOR REGION"}</small><h2>{selected.label}</h2></div></div>
          <div className={`flip-review-state ${selected.status}`}><ShieldCheck size={18}/><div><strong>{selected.status === "pending-review" ? "Contractor review required" : "Trade assignment approved"}</strong><small>{selected.reviewedBy ? `${selected.reviewedBy} · ${activityDate(selected.reviewedAt)}` : "Review or correct this assignment before it is relied on."}</small></div></div>
          <dl><div><dt>Responsible trade</dt><dd><i style={{ background: colors.get(selected.packageId) }}/>{selectedPackage?.code} · {selectedPackage?.name}</dd></div><div><dt>Trade owner</dt><dd><select className="flip-owner-select" aria-label={`Owner of ${selectedPackage?.name ?? "this trade"}`} value={selectedPackage?.owner ?? ""} onChange={event => selectedPackage && setTradeOwner(selectedPackage.id, event.target.value)}><option value="">Unassigned</option>{people.map(name => <option key={name} value={name}>{name}</option>)}</select></dd></div>{selected.anchor && <div><dt>Position</dt><dd className={selected.anchor === "image" ? "flip-approximate-note" : undefined}>{selected.anchor === "text" ? "On the printed words it cites." : "Approximate: the AI's outline from the sheet image, because the words it cites aren't in the sheet's text. Check it and redraw the outline if it's off."}</dd></div>}<div><dt>Drawing evidence</dt><dd>{selected.evidence || "Estimator marked region"}</dd></div><div><dt>Confidence</dt><dd>{selected.confidence === null ? "Estimator reviewed" : `${Math.round(selected.confidence * 100)}% · AI proposal; verify on sheet`}</dd></div><div><dt>Review notes</dt><dd>{selected.notes || "No notes recorded"}</dd></div></dl>
          {selected.status === "pending-review" && <Button variant="primary" onClick={() => act(current => approveRegion(current, selected.id, CURRENT_USER), `${selected.number} approved.`)}><Check size={15}/>Approve trade assignment</Button>}
          <Button onClick={() => zoomTo(selected.id)}><ZoomIn size={15}/>Zoom to highlight</Button>
          <RedrawOutlineButton onClick={startRedraw}/><div className="flip-detail-actions"><Button onClick={() => { setReassignTo(""); setReassignReason(""); setReassignOpen(true); }}><RotateCcw size={15}/>Correct trade</Button><Button onClick={() => { setNotes(selected.notes); setNotesOpen(true); }}><PencilRuler size={15}/>Notes</Button></div>
          <div className="flip-scope-links"><header><div><Link2 size={15}/><strong>Linked scope items</strong></div><Badge>{linkedScopes.length}</Badge></header>{linkedScopes.map(scope => <article key={scope.id}><div><strong>{scope.title}</strong><small>{scope.source || "No source reference"}</small></div><button aria-label={`Unlink ${scope.title}`} onClick={() => act(current => unlinkScope(current, selected.id, scope.id, CURRENT_USER), "Scope item unlinked.")}><Unlink size={14}/></button></article>)}{!linkedScopes.length && <p>This region is not linked to a bid-form item yet.</p>}{availableScopes.length > 0 && <div className="flip-link-picker"><select aria-label="Scope item to link" value={linkId} onChange={event => setLinkId(event.target.value)}><option value="">Choose scope item…</option>{availableScopes.map(scope => <option value={scope.id} key={scope.id}>{scope.title}</option>)}</select><button disabled={!linkId} aria-label="Link scope item" onClick={() => { if (linkId && act(current => linkScope(current, procurement, selected.id, linkId, CURRENT_USER), "Scope item linked to the drawing.")) setLinkId(""); }}><Link2 size={15}/></button></div>}</div>
          {history}
        </Panel>}
        {mode === "regions" && !selected && <Panel><Empty title="Select a region" description="Choose a numbered drawing overlay to inspect its trade, evidence, and scope links."/></Panel>}
        {mode === "corrections" && <Panel title="Correction log" subtitle="Every trade reassignment stays visible."><div className="flip-log">{correctionLog.map(item => <button key={`${item.regionId}-${item.at}`} onClick={() => { const correctedRegion = state.regions.find(region => region.id === item.regionId); if (correctedRegion) { setPageId(correctedRegion.pageId); setRegionId(correctedRegion.id); setMode("regions"); } }}><RotateCcw size={15}/><span><strong>{item.number}</strong><small>{procurement.packages.find(pkg => pkg.id === item.from)?.name} → {procurement.packages.find(pkg => pkg.id === item.to)?.name}</small><p>{item.reason || "No reason recorded"}</p><em>{item.by} · {activityDate(item.at)}</em></span></button>)}{!correctionLog.length && <Empty title="No corrections yet" description="Trade changes will be retained here."/>}</div></Panel>}
        {mode === "unlocated" && <Panel title="Scope without a drawing location" subtitle="Link these items to a region so estimators can see where the work occurs."><div className="flip-unlocated">{missing.map(scope => <button key={scope.id} onClick={() => { const pkgRegion = state.regions.find(region => region.packageId === scope.packageId); if (pkgRegion) { setPageId(pkgRegion.pageId); setRegionId(pkgRegion.id); setMode("regions"); setLinkId(scope.id); } }}><LocateFixed size={15}/><span><strong>{scope.title}</strong><small>{procurement.packages.find(pkg => pkg.id === scope.packageId)?.name} · {scope.source || "No source"}</small></span><ChevronRight size={14}/></button>)}{!missing.length && <Empty title="Every scope item is located" description="All bid-form items connect to at least one drawing region."/>}</div></Panel>}
      </aside>
    </div>
    <PreviewNote>Check every region against the original sheet. Trade regions, approvals, corrections, scope links, and history are saved with the project.</PreviewNote>

    {pageEditor && <PageEditor errors={errors} onClose={() => { setPageEditor(false); setErrors({}); }} onSave={draft => { if (act(current => addPage(current, { ...draft, pageNumber: Number(draft.pageNumber) }), "Drawing page added.")) setPageEditor(false); }}/>}
    {regionEditor && <RegionEditor packages={procurement.packages} errors={errors} onClose={() => { setRegionEditor(false); setErrors({}); }} onSave={draft => { const x = Number(draft.x) / 100, y = Number(draft.y) / 100, width = Math.min(Number(draft.width) / 100, 1 - x), height = Math.min(Number(draft.height) / 100, 1 - y); if (act(current => addRegion(current, procurement, { pageId: activePageId, label: draft.label, packageId: draft.packageId, polygon: rectangle(x, y, width, height), notes: draft.notes }, CURRENT_USER), "Reviewed estimator region added.")) setRegionEditor(false); }}/>}
    {reassignOpen && selected && <Modal title={`Correct ${selected.number}'s trade`} subtitle="This approves the region and keeps the old assignment in its history." onClose={() => setReassignOpen(false)}><form onSubmit={event => { event.preventDefault(); if (act(current => reassignRegion(current, procurement, selected.id, reassignTo, CURRENT_USER, reassignReason), `${selected.number} reassigned.`)) setReassignOpen(false); }}>{Object.keys(errors).length > 0 && <div className="flip-error"><CircleDot size={15}/>{firstError(errors)}</div>}<label className="ui-field">Correct trade<select autoFocus required value={reassignTo} onChange={event => setReassignTo(event.target.value)}><option value="">Choose trade…</option>{procurement.packages.filter(pkg => pkg.id !== selected.packageId).map(pkg => <option value={pkg.id} key={pkg.id}>{pkg.code} · {pkg.name}</option>)}</select></label><label className="ui-field">Reason for correction<textarea rows={4} value={reassignReason} onChange={event => setReassignReason(event.target.value)} placeholder="Explain why this trade owns the work."/></label><div className="flip-form-actions"><Button onClick={() => setReassignOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save correction</Button></div></form></Modal>}
    {notesOpen && selected && <Modal title={`Notes for ${selected.number}`} subtitle={selected.label} onClose={() => setNotesOpen(false)}><form onSubmit={event => { event.preventDefault(); if (act(current => editRegionNotes(current, selected.id, notes, CURRENT_USER), "Region notes saved.")) setNotesOpen(false); }}><label className="ui-field">Review notes<textarea autoFocus rows={6} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record what the estimator confirmed."/></label><div className="flip-form-actions"><Button onClick={() => setNotesOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save notes</Button></div></form></Modal>}
  </div>;
}
