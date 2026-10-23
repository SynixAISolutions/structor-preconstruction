"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Link2, MessageSquare, Move, Plus, RefreshCw, SquareDashed, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { docMarkups, fileMeta, TAG_COLORS, type Markup, type ContentOp } from "../../lib/project-content";
import { useProjectContent } from "../../lib/project-content-client";
import { drawingLog, sheetAt, revisionLabel, revisionsOf, type SheetVersion, type StoredDocument } from "../../lib/project-files";
import { StoredPage, sheetLabel } from "./project-file-viewer";
import { CONTENT_ACTOR, ContentLinks, useContentRecords, type SaveContent } from "./project-content-links";
import { Button, SearchBox } from "./shared";
import { SheetComparison, SheetVersions, setName } from "./drawing-log";
import "./project-content.css";

export type ContentLocation = { docId: string; page: number; markupId?: string; compare?: boolean };
type Rect = Markup["rect"];
type Gesture = { mode: "draw" | "move" | "nw" | "ne" | "sw" | "se"; start: [number, number]; rect: Rect; id?: string };
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

// All movement stays in page fractions, independent of zoom and the PDF's orientation.
export function keyboardMarkupRect(rect: Rect, key: string, resize: boolean, step = .005): Rect {
  const [x, y, w, h] = rect;
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return resize ? [x, y, clamp(w + dx, .01, 1 - x), clamp(h + dy, .01, 1 - y)] : [clamp(x + dx, 0, 1 - w), clamp(y + dy, 0, 1 - h), w, h];
}

export function gestureMarkupRect(gesture: Gesture, point: [number, number]): Rect {
  const [sx, sy] = gesture.start, [px, py] = point;
  const [x, y, w, h] = gesture.rect;
  if (gesture.mode === "draw") return [Math.min(sx, px), Math.min(sy, py), Math.abs(px - sx), Math.abs(py - sy)];
  if (gesture.mode === "move") return [clamp(x + px - sx, 0, 1 - w), clamp(y + py - sy, 0, 1 - h), w, h];
  const left = gesture.mode.endsWith("w") ? clamp(x + px - sx, 0, x + w - .01) : x;
  const top = gesture.mode.startsWith("n") ? clamp(y + py - sy, 0, y + h - .01) : y;
  const right = gesture.mode.endsWith("e") ? clamp(x + w + px - sx, x + .01, 1) : x + w;
  const bottom = gesture.mode.startsWith("s") ? clamp(y + h + py - sy, y + .01, 1) : y + h;
  return [left, top, right - left, bottom - top];
}

export function ContentViewer({ initial, documents, onClose, backLabel = "Back to Project files" }: { initial: ContentLocation; documents: StoredDocument[]; onClose: () => void; backLabel?: string }) {
  const { content, ready, refresh, change } = useProjectContent();
  const { records, error: recordsError, loading: recordsLoading } = useContentRecords();
  const [docId, setDocId] = useState(initial.docId), [page, setPage] = useState(initial.page);
  const [selectedId, setSelectedId] = useState(initial.markupId ?? "");
  const [query, setQuery] = useState(""), [zoom, setZoom] = useState(1), [tool, setTool] = useState(false);
  const [compare, setCompare] = useState(initial.compare ?? false);
  const [tab, setTab] = useState("Markups");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pageReady, setPageReady] = useState("");
  const [draft, setDraft] = useState<{ id?: string; rect: Rect } | null>(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const gesture = useRef<Gesture | null>(null), lock = useRef(false);
  const frame = useRef<HTMLDivElement>(null), dialog = useRef<HTMLElement>(null), close = useRef(onClose); close.current = onClose;
  const doc = documents.find(d => d.id === docId);
  const sheetVersion = sheetAt(drawingLog(documents), docId, page);
  const openVersion = (v: SheetVersion) => { setDocId(v.doc.id); setPage(v.page); setSelectedId(""); setDraft(null); setTool(false); };
  const all = docMarkups(content, docId), visible = docMarkups(content, docId, query);
  const selected = all.find(m => m.id === selectedId);
  const pageMarkups = all.filter(m => m.page === page);
  const renderingReady = doc && pageReady === `${doc.id}:${page}`;

  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    const app = document.querySelector<HTMLElement>(".product-app");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const listener = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { if (gesture.current) { gesture.current = null; setDraft(null); } else close.current(); }
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]') ?? []).filter(el => {
        const folded = el.closest("details:not([open])");
        return el.getClientRects().length && el.checkVisibility() && (!folded || el === folded.querySelector(":scope > summary"));
      });
      const first = items[0], end = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end?.focus(); }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", listener);
    return () => { document.removeEventListener("keydown", listener); if (app) app.inert = wasInert; last?.focus(); };
  }, []);

  useEffect(() => {
    const sync = () => { if (!lock.current) refresh().catch(e => setError(e instanceof Error ? e.message : "Could not refresh content.")); };
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 15000);
    return () => { window.removeEventListener("focus", sync); clearInterval(timer); };
  }, [refresh]);

  const save: SaveContent = async (ops: ContentOp[]) => {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { const stored = await change(ops, CONTENT_ACTOR); setNotice("Changes saved"); return stored; }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save. Please try again."); return null; }
    finally { lock.current = false; setBusy(false); }
  };

  async function add(rect: Rect) {
    if (!doc) return;
    const before = new Set(content.markups.map(m => m.id));
    const stored = await save([{ op: "markup-add", markup: { docId, page, rect, title: `Review page ${page}`, color: "orange" } }]);
    if (stored) { const created = stored.markups.filter(m => !before.has(m.id) && m.docId === docId && m.createdBy === CONTENT_ACTOR).at(-1); setSelectedId(created?.id ?? ""); setTab("Markups"); setQuery(""); setTool(false); }
  }

  function select(markup: Markup) { setSelectedId(markup.id); setPage(markup.page); setDraft(null); setTool(false); setTab("Markups"); }
  function point(e: PointerEvent): [number, number] { const b = frame.current!.getBoundingClientRect(); return [clamp((e.clientX - b.left) / b.width, 0, 1), clamp((e.clientY - b.top) / b.height, 0, 1)]; }
  function begin(e: PointerEvent, markup?: Markup, corner?: Gesture["mode"]) {
    if (busy || !ready || !renderingReady || e.button !== 0 || (!markup && !tool)) return;
    e.preventDefault(); e.stopPropagation();
    if (markup) { setSelectedId(markup.id); setTab("Markups"); e.currentTarget.closest("button")?.focus(); }
    const start = point(e);
    gesture.current = { mode: markup ? corner ?? "move" : "draw", start, rect: markup?.rect ?? [start[0], start[1], 0, 0], id: markup?.id };
    setDraft({ id: markup?.id, rect: gesture.current.rect });
    frame.current?.setPointerCapture(e.pointerId);
  }
  async function finish(e: PointerEvent) {
    const g = gesture.current; if (!g) return;
    gesture.current = null;
    const rect = gestureMarkupRect(g, point(e));
    if (g.mode === "draw") { if (rect[2] >= .01 && rect[3] >= .01) await add(rect); }
    else if (g.id) await save([{ op: "markup-edit", id: g.id, rect }]);
    setDraft(null);
  }
  function keyboard(e: KeyboardEvent, markup: Markup) {
    if (!e.key.startsWith("Arrow") || busy) return;
    e.preventDefault(); e.stopPropagation();
    const rect = draftRef.current?.id === markup.id ? draftRef.current.rect : markup.rect;
    setDraft({ id: markup.id, rect: keyboardMarkupRect(rect, e.key, e.shiftKey, e.altKey ? .02 : .005) });
  }

  const body = <section className="cm-viewer" ref={dialog} role="dialog" aria-modal="true" aria-label="Content viewer">
    <header className="cm-viewer-header"><Button onClick={onClose}><ArrowLeft size={16}/>{backLabel}</Button><div className="cm-viewer-title"><span>CONTENT VIEWER</span><h1>{doc?.name ?? "File unavailable"}</h1></div>
      {doc && <label className="cm-revision">File revision<select aria-label="Switch revision" value={docId} disabled={busy} onChange={e => { setDocId(e.target.value); setPage(1); setCompare(false); setSelectedId(""); setDraft(null); }}>{revisionsOf(documents, doc.series).map(r => <option key={r.id} value={r.id}>{revisionLabel(r)}</option>)}</select></label>}
      <Button disabled={busy} onClick={async () => { try { await refresh(); setNotice("Content refreshed"); } catch (e) { setError(e instanceof Error ? e.message : "Could not refresh."); } }}><RefreshCw size={15}/>Refresh</Button>
    </header>
    <div className="cm-viewer-status"><span>Markups stay with the revision on which they were drawn.</span><span role="status" aria-live="polite">{busy ? "Saving…" : notice}</span></div>
    {error && <p role="alert" className="cm-error">{error}</p>}
    {!doc ? <p className="cm-error">This file was removed. Return to Project files.</p> : <>
      {sheetVersion && <div className="dl-viewer-history"><strong>{sheetVersion.sheet.sheet} · V{sheetVersion.version.version}</strong><SheetVersions sheet={sheetVersion.sheet} selected={docId} disabled={busy} onOpen={openVersion}/><Button disabled={busy || sheetVersion.sheet.versions.length < 2} onClick={() => { setCompare(c => !c); setPageReady(""); setDraft(null); setTool(false); }}>{compare ? "Back to markups" : "Compare versions"}</Button></div>}
      {sheetVersion && !sheetVersion.current && <div className="dl-superseded" role="status"><span>Superseded by V{sheetVersion.sheet.current.version} · {setName(sheetVersion.sheet.current.doc)}</span><Button disabled={busy} onClick={() => openVersion(sheetVersion.sheet.current)}>Go to current</Button></div>}
      {compare && sheetVersion ? <SheetComparison key={sheetVersion.sheet.key} sheet={sheetVersion.sheet}/> : <><div className="cm-viewer-tools">
        <div className="cm-actions"><button className="ui-icon-btn" aria-label="Previous page" disabled={page <= 1 || busy} onClick={() => { setPage(p => p - 1); setDraft(null); }}><ChevronLeft size={17}/></button><label>Page <input aria-label="Page number" type="number" min={1} max={doc.pageCount} value={page} disabled={busy} onChange={e => { setPage(clamp(Number(e.target.value) || 1, 1, doc.pageCount)); setDraft(null); }}/></label><span>of {doc.pageCount}</span><button className="ui-icon-btn" aria-label="Next page" disabled={page >= doc.pageCount || busy} onClick={() => { setPage(p => p + 1); setDraft(null); }}><ChevronRight size={17}/></button></div>
        {doc.sheets.some(s => s.sheet) && <select aria-label="Go to sheet" value={doc.sheets.some(s => s.page === page && s.sheet) ? page : ""} onChange={e => setPage(Number(e.target.value))}><option value="" disabled>Go to sheet</option>{doc.sheets.filter(s => s.sheet).map(s => <option key={s.page} value={s.page}>{s.sheet} · {s.title}</option>)}</select>}
        <div className="cm-actions"><button className="ui-icon-btn" aria-label="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(z => Math.max(.5, z - .25))}><ZoomOut size={17}/></button><span>{Math.round(zoom * 100)}%</span><button className="ui-icon-btn" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + .25))}><ZoomIn size={17}/></button><Button onClick={() => setZoom(1)}>Fit</Button></div>
        <button className={`ui-btn ${tool ? "primary" : ""}`} aria-pressed={tool} disabled={busy || !ready || !renderingReady} onClick={() => setTool(t => !t)}><SquareDashed size={16}/>Draw rectangle</button><Button disabled={busy || !ready || !renderingReady} onClick={() => void add([.35, .35, .2, .15])}><Plus size={16}/>Add markup</Button>
      </div>
      <div className="cm-viewer-layout">
        <div className="cm-drawing-column"><div className="cm-drawing-caption"><span>{sheetLabel(doc, page)}</span><span>{tool ? "Drag on the page to mark an area" : "Select a rectangle to review"}</span></div><div className="cm-drawing-scroll"><div className="cm-page-sizer" style={{ width: `${zoom * 100}%` }}><div ref={frame} className={`cm-page ${tool ? "drawing" : ""}`} onPointerDown={e => begin(e)} onPointerMove={e => { if (gesture.current) setDraft({ id: gesture.current.id, rect: gestureMarkupRect(gesture.current, point(e)) }); }} onPointerUp={e => void finish(e)} onPointerCancel={() => { gesture.current = null; setDraft(null); }}>
          <StoredPage doc={doc} page={page} size={zoom > 1.5 ? 3600 : 2000} onAspect={() => setPageReady(`${doc.id}:${page}`)}/>
          {renderingReady && pageMarkups.map(markup => {
            const rect = draft?.id === markup.id ? draft.rect : markup.rect;
            const active = selectedId === markup.id;
            return <button key={markup.id} className={`cm-markup cm-color-${markup.color} ${active ? "selected" : ""} ${markup.status === "resolved" ? "resolved" : ""}`} style={{ left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${rect[2] * 100}%`, height: `${rect[3] * 100}%` }} aria-label={`Markup ${all.indexOf(markup) + 1}: ${markup.title}`} aria-pressed={active} aria-describedby="cm-keyboard-help" onClick={e => { e.stopPropagation(); select(markup); }} onFocus={() => setSelectedId(markup.id)} onPointerDown={e => begin(e, markup)} onKeyDown={e => keyboard(e, markup)} onKeyUp={async e => { if (!e.key.startsWith("Arrow") || !draftRef.current || draftRef.current.id !== markup.id) return; const rect = draftRef.current.rect; await save([{ op: "markup-edit", id: markup.id, rect }]); setDraft(null); }}><b>{all.indexOf(markup) + 1}</b>{active && (["nw", "ne", "sw", "se"] as const).map(corner => <i key={corner} className={`cm-handle ${corner}`} aria-hidden="true" onPointerDown={e => begin(e, markup, corner)}/>)}</button>;
          })}
          {draft && !draft.id && <div className="cm-markup cm-color-orange cm-draft" style={{ left: `${draft.rect[0] * 100}%`, top: `${draft.rect[1] * 100}%`, width: `${draft.rect[2] * 100}%`, height: `${draft.rect[3] * 100}%` }}/>}
        </div></div></div><p id="cm-keyboard-help" className="cm-keyboard-help"><Move size={14}/>Focus a rectangle: arrows move, Shift + arrows resize, Alt makes larger steps. Add markup places a rectangle without dragging.</p></div>
        <aside className="cm-review-panels"><div className="cm-panel-tabs" role="tablist" aria-label="Review panels">{["Markups", "Attached to"].map(name => <button key={name} role="tab" aria-selected={tab === name} aria-controls={name === "Markups" ? "cm-markups-panel" : "cm-attached-panel"} onClick={() => setTab(name)}>{name === "Markups" ? <MessageSquare size={15}/> : <Link2 size={15}/>} {name}{name === "Markups" && <span>{all.length}</span>}</button>)}</div>
          <div id="cm-markups-panel" className={`cm-markups-panel ${tab === "Markups" ? "active" : ""}`} role="tabpanel" aria-label="Markups"><h2>Markups <span>{all.length}</span></h2><SearchBox value={query} onChange={setQuery} placeholder="Search markups"/>
            {!visible.length && <p className="cm-panel-empty">{query ? "No matching markups. Try another search." : "No markups on this revision. Draw a rectangle or choose Add markup to start a review."}</p>}
            <div className="cm-markup-list">{Array.from(new Set(visible.map(m => m.page))).map(groupPage => <section key={groupPage}><h3>PAGE {groupPage}</h3>{visible.filter(m => m.page === groupPage).map(m => <button key={m.id} className={`cm-markup-item ${selectedId === m.id ? "active" : ""}`} aria-pressed={selectedId === m.id} onClick={() => select(m)}><span className={`cm-number cm-color-${m.color}`}>{all.indexOf(m) + 1}</span><span><strong>{m.title}</strong><small>{m.status === "open" ? "Open" : "Resolved"} · {m.assignedTo || "Unassigned"}</small><small>{m.comments.length} comments</small></span></button>)}</section>)}</div>
            {selected && <MarkupDetail key={selected.id} markup={selected} save={save} busy={busy} onDelete={() => setSelectedId("")}/>}
          </div>
          <div id="cm-attached-panel" className={`cm-attached-panel ${tab === "Attached to" ? "active" : ""}`} role="tabpanel" aria-label="Attached to"><h2>Attached to</h2><p className="cm-muted">Connect the page evidence to project decisions.</p>{recordsLoading && <p role="status">Loading clarification records…</p>}{recordsError && <p role="alert" className="cm-error">Clarifications: {recordsError}</p>}
            <details open className="cm-attachment-target"><summary>File · All revisions</summary><ContentLinks links={fileMeta(content, doc.series).links} target={{ series: doc.series }} save={save} records={records} disabled={busy}/></details>
            {all.map(m => <details key={m.id} open={m.id === selectedId} className="cm-attachment-target"><summary>Markup {all.indexOf(m) + 1} · {m.title}<small>Page {m.page} · {m.links.length} links</small></summary><Button onClick={() => select(m)}>Show markup</Button><ContentLinks links={m.links} target={{ markupId: m.id }} save={save} records={records} disabled={busy}/></details>)}
          </div>
        </aside>
      </div></>}
    </>}
  </section>;
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

function MarkupDetail({ markup, save, busy, onDelete }: { markup: Markup; save: SaveContent; busy: boolean; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return <section className="cm-markup-detail" aria-label="Markup detail"><h3>Markup detail</h3><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); await save([{ op: "markup-edit", id: markup.id, title: String(data.get("title")), description: String(data.get("description")), assignedTo: String(data.get("assignedTo")), status: data.get("status") as Markup["status"], color: data.get("color") as Markup["color"] }]); }}>
    <label>Title<input name="title" required maxLength={120} defaultValue={markup.title}/></label><label>Description<textarea name="description" maxLength={2000} rows={3} defaultValue={markup.description}/></label><label>Assigned to<input name="assignedTo" maxLength={80} placeholder="Person or company" defaultValue={markup.assignedTo}/></label><div className="cm-field-pair"><label>Status<select name="status" defaultValue={markup.status}><option value="open">Open</option><option value="resolved">Resolved</option></select></label><label>Color<select name="color" defaultValue={markup.color}>{TAG_COLORS.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div><Button type="submit" variant="primary" disabled={busy}>Save markup</Button>
  </form><small className="cm-muted">Created by {markup.createdBy} · {new Date(markup.createdAt).toLocaleString()}</small><h3>Comments <span>{markup.comments.length}</span></h3>
    {markup.comments.map(comment => <article className="cm-comment" key={comment.id}><strong>{comment.by}</strong><time dateTime={comment.at}>{new Date(comment.at).toLocaleString()}</time><p>{comment.text}</p></article>)}
    {!markup.comments.length && <p className="cm-muted">No comments yet.</p>}
    <form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const text = String(new FormData(form).get("comment")); if (await save([{ op: "comment-add", markupId: markup.id, text }])) form.reset(); }}><label>Comment<textarea name="comment" required maxLength={2000} rows={2} placeholder="Add review context…"/></label><Button type="submit" disabled={busy}>Post comment</Button></form>
    {confirm ? <div className="cm-confirm" role="group" aria-label="Confirm markup deletion"><p>Delete this markup, its comments and its links?</p><Button variant="danger" disabled={busy} onClick={async () => { if (await save([{ op: "markup-delete", id: markup.id }])) onDelete(); }}>Delete markup</Button><Button onClick={() => setConfirm(false)}>Keep markup</Button></div> : <Button disabled={busy} onClick={() => setConfirm(true)}><Trash2 size={14}/>Delete markup</Button>}
  </section>;
}
