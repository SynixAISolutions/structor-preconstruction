"use client";

import { useEffect, useRef, useState } from "react";
import { Check, GitCompareArrows, GitBranchPlus, LayoutGrid, Layers, List } from "lucide-react";
import { drawingLog, sheetKey, withSheetNumbers, type DrawingLog, type LogSet, type LogSheet, type SheetVersion, type StoredDocument } from "../../lib/project-files";
import { updateProjectDocument } from "../../lib/project-files-client";
import { displayDate } from "../../lib/format";
import { Button, Empty, SearchBox } from "./shared";
import { StoredPage } from "./project-file-viewer";
import type { ContentLocation } from "./content-viewer";
import "./drawing-log.css";

export const setName = (doc: StoredDocument) => doc.name.replace(/\.pdf$/i, "");
export const uploadTime = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" });

export function VersionPills({ versions, current, selected, onOpen, disabled = false, label = "Versions" }: { versions: { id: string; version: number; uploadedAt: string; name: string }[]; current: string; selected?: string; onOpen: (id: string) => void; disabled?: boolean; label?: string }) {
  return <div className="dl-versions" role="group" aria-label={label}>{versions.map(v => <button type="button" key={v.id} disabled={disabled} className={`${v.id === current ? "current" : ""} ${v.id === selected ? "selected" : ""}`} aria-label={`Open V${v.version} · ${v.name}${v.id === current ? " · Current" : ""}`} aria-pressed={v.id === (selected ?? current)} title={`${v.name} · Uploaded ${uploadTime(v.uploadedAt)}`} onClick={() => onOpen(v.id)}>V{v.version}</button>)}</div>;
}

export function SheetVersions({ sheet, selected, onOpen, disabled }: { sheet: LogSheet; selected?: string; onOpen: (v: SheetVersion) => void; disabled?: boolean }) {
  return <VersionPills label={`Versions of ${sheet.sheet}`} versions={sheet.versions.map(v => ({ id: v.doc.id, version: v.version, uploadedAt: v.doc.uploadedAt, name: setName(v.doc) }))} current={sheet.current.doc.id} selected={selected} disabled={disabled} onOpen={id => { const v = sheet.versions.find(v => v.doc.id === id); if (v) onOpen(v); }}/>;
}

// Render only near the viewport; a full set can contain hundreds of pages.
export function SheetThumbnail({ doc, page }: { doc: StoredDocument; page: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="dl-thumbnail">{visible ? <StoredPage doc={doc} page={page} size={600}/> : <Layers size={28} aria-hidden="true"/>}</div>;
}

export function SetSummary({ set }: { set: LogSet }) {
  const unchanged = set.doc.sheets.filter(s => sheetKey(s.sheet)).length - set.added.length - set.revised.length;
  return <span className="dl-set-summary"><b>{set.revised.length} revised</b> · {set.added.length} new · {unchanged} unchanged</span>;
}

export function DrawingLogView({ log, ready, onOpen, onRevision, onUpload, onReview }: { log: DrawingLog; ready: boolean; onOpen: (location: ContentLocation) => void; onRevision: (sheet: LogSheet) => void; onUpload: () => void; onReview: (id: string) => void }) {
  const [query, setQuery] = useState(""), [discipline, setDiscipline] = useState(""), [setId, setSetId] = useState(""), [grid, setGrid] = useState(true);
  const disciplines = [...new Set(log.sheets.map(s => s.discipline))];
  const selectedSet = log.sets.find(s => s.doc.id === setId);
  const changed = new Set([...(selectedSet?.added ?? []), ...(selectedSet?.revised ?? [])].map(sheetKey));
  const sheets = log.sheets.filter(s => (!discipline || s.discipline === discipline) && (!selectedSet || changed.has(s.key)) && `${s.sheet} ${s.title}`.toLowerCase().includes(query.toLowerCase()));
  const clear = () => { setQuery(""); setDiscipline(""); setSetId(""); };
  return <section className="dl-log" aria-label="Drawing log">
    <div className="dl-heading"><div><span className="dl-eyebrow">DRAWING LOG</span><h2>Every sheet. Its complete story.</h2><p>{log.sheets.length} current sheets across {log.sets.length} uploads. Sheets left out of a new set stay current.</p></div><Layers size={30} aria-hidden="true"/></div>
    {!!log.sets.length && <section className="dl-timeline" aria-label="Sets timeline"><div className="dl-section-title"><h3>Sets timeline</h3><span>Oldest to newest</span></div><ol>{log.sets.map((set, index) => <li key={set.doc.id}><button className={`dl-set ${setId === set.doc.id ? "active" : ""}`} aria-pressed={setId === set.doc.id} onClick={() => setSetId(id => id === set.doc.id ? "" : set.doc.id)}><span className="dl-set-step">{String(index + 1).padStart(2, "0")}</span><span><strong>{setName(set.doc)}</strong><time dateTime={set.doc.uploadedAt} title={uploadTime(set.doc.uploadedAt)}>{displayDate(set.doc.uploadedAt.slice(0, 10))}</time><SetSummary set={set}/></span></button><button className="dl-review-link" onClick={() => onReview(set.doc.id)}>Review upload{set.unnamed.length > 0 && ` · ${set.unnamed.length} unnamed`}{set.repeated.length > 0 && ` · ${set.repeated.length} repeated`}</button></li>)}</ol></section>}
    <div className="dl-discipline-filters" role="group" aria-label="Drawing discipline"><button aria-pressed={!discipline} onClick={() => setDiscipline("")}>All disciplines <span>{log.sheets.length}</span></button>{disciplines.map(d => <button key={d} aria-pressed={discipline === d} onClick={() => setDiscipline(v => v === d ? "" : d)}>{d} <span>{log.sheets.filter(s => s.discipline === d).length}</span></button>)}</div>
    <div className="ui-toolbar dl-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search sheet number or title"/><label className="cm-category">Changed in<select aria-label="Changed in set" value={setId} onChange={e => setSetId(e.target.value)}><option value="">All sets</option>{log.sets.map(s => <option value={s.doc.id} key={s.doc.id}>{setName(s.doc)}</option>)}</select></label><div className="cm-display-toggle"><button className="ui-icon-btn" aria-label="Sheet grid" aria-pressed={grid} onClick={() => setGrid(true)}><LayoutGrid size={18}/></button><button className="ui-icon-btn" aria-label="Sheet list" aria-pressed={!grid} onClick={() => setGrid(false)}><List size={18}/></button></div></div>
    {(query || discipline || setId) && <div className="cm-filter-summary"><span>{sheets.length} matching sheets{selectedSet && ` · Changed in ${setName(selectedSet.doc)}`}</span><button className="cm-text-button" onClick={clear}>Clear filters</button></div>}
    {!ready ? <p className="cm-panel-empty" role="status">Loading drawings…</p> : !log.sheets.length ? <Empty title="No drawing sheets yet" description={log.sets.length ? "The uploaded pages need sheet numbers. Choose Review upload in the timeline to name them." : "Upload a drawing set. We’ll match its sheet numbers and keep every version here."} action={<Button onClick={log.sets.length ? () => onReview(log.sets[0].doc.id) : onUpload}>{log.sets.length ? "Name sheets" : "Upload drawings"}</Button>}/> : !sheets.length ? <Empty title="No sheets match" description="Try another sheet number, discipline or drawing set." action={<Button onClick={clear}>Clear filters</Button>}/> : <SheetCollection sheets={sheets} grid={grid} onOpen={onOpen} onRevision={onRevision}/>}
  </section>;
}

export function SheetCollection({ sheets, grid, onOpen, onRevision }: { sheets: LogSheet[]; grid: boolean; onOpen: (location: ContentLocation) => void; onRevision: (s: LogSheet) => void }) {
  const open = (v: SheetVersion, compare = false) => onOpen({ docId: v.doc.id, page: v.page, compare });
  const versions = (s: LogSheet) => <SheetVersions sheet={s} onOpen={open}/>;
  const from = (s: LogSheet) => <span className="dl-current-from"><strong>{setName(s.current.doc)}</strong><time dateTime={s.current.doc.uploadedAt} title={uploadTime(s.current.doc.uploadedAt)}>{displayDate(s.current.doc.uploadedAt.slice(0, 10))}</time></span>;
  const actions = (s: LogSheet) => <div className="dl-sheet-actions"><Button onClick={() => open(s.current)}>Open</Button><Button disabled={s.versions.length < 2} onClick={() => open(s.current, true)}><GitCompareArrows size={14}/>Compare</Button><Button onClick={() => onRevision(s)}><GitBranchPlus size={14}/>Add revision</Button></div>;
  return grid ? <div className="dl-sheet-grid">{sheets.map(s => <article className="dl-sheet-card" key={s.key}><button className="dl-sheet-preview" aria-label={`Open ${s.sheet} current version`} onClick={() => open(s.current)}><SheetThumbnail doc={s.current.doc} page={s.current.page}/><span className={`dl-change-badge ${s.versions.length > 1 ? "revised" : "new"}`}>{s.versions.length > 1 ? `Revised in ${setName(s.current.doc)}` : "New"}</span></button><div className="dl-sheet-body"><div className="dl-sheet-identity"><strong>{s.sheet}</strong><span>{s.discipline}</span></div><h3>{s.title || "Title not read"}</h3>{versions(s)}<div className="dl-card-from"><span>Current from</span>{from(s)}</div>{actions(s)}</div></article>)}</div> : <div className="ui-table-wrap"><table className="ui-table dl-sheet-table"><thead><tr><th>Sheet</th><th>Title</th><th>Versions</th><th>Current from</th><th>Actions</th></tr></thead><tbody>{sheets.map(s => <tr key={s.key}><td><button className="cm-text-button" onClick={() => open(s.current)}><strong>{s.sheet}</strong></button><small>{s.discipline}</small></td><td>{s.title || "Title not read"}</td><td>{versions(s)}</td><td>{from(s)}</td><td>{actions(s)}</td></tr>)}</tbody></table></div>;
}

export function UploadCheck({ documents, ids, onDone }: { documents: StoredDocument[]; ids: string[]; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const sets = drawingLog(documents).sets.filter(s => ids.includes(s.doc.id));
  return <div className="dl-upload-check"><p className="dl-check-note"><Check size={17}/>Your files are stored. Review the matches or come back from the sets timeline.</p>{sets.map(set => <section className="dl-check-set" key={set.doc.id}><h3>{set.doc.name}</h3><SetSummary set={set}/>{!!set.repeated.length && <p className="dl-warning" role="status">Repeated sheet numbers: {set.repeated.join(", ")}. Only the first page of each number appears in the log. Correct the other page’s number below if it is a different sheet.</p>}<div className="dl-check-pages">{set.doc.sheets.filter(s => set.unnamed.includes(s.page) || [...set.added, ...set.revised, ...set.repeated].some(n => sheetKey(n) === sheetKey(s.sheet))).map(s => <article key={s.page}><SheetThumbnail doc={set.doc} page={s.page}/><div><strong>{s.sheet || `Page ${s.page} · Number not read`}</strong><small>{s.title || `Page ${s.page}`}</small><span className="dl-change-badge">{!s.sheet ? "Needs a number" : set.repeated.some(n => sheetKey(n) === sheetKey(s.sheet)) ? "Repeated number" : set.revised.some(n => sheetKey(n) === sheetKey(s.sheet)) ? "Revised" : "New"}</span>{(!s.sheet || set.repeated.some(n => sheetKey(n) === sheetKey(s.sheet))) && <SheetNaming doc={set.doc} page={s.page} busy={saving} setBusy={setSaving}/>}</div></article>)}</div></section>)}<div className="intel-dialog-actions"><Button variant="primary" onClick={onDone}><Check size={16}/>Looks right</Button></div></div>;
}

function SheetNaming({ doc, page, busy, setBusy }: { doc: StoredDocument; page: number; busy: boolean; setBusy: (busy: boolean) => void }) {
  const [error, setError] = useState("");
  return <form className="dl-naming" onSubmit={async e => { e.preventDefault(); if (busy) return; const data = new FormData(e.currentTarget); setBusy(true); setError(""); try { await updateProjectDocument(withSheetNumbers(doc, [{ page, sheet: String(data.get("sheet")), title: String(data.get("title")) }])); } catch (e) { setError(e instanceof Error ? e.message : "Could not save the sheet number."); } finally { setBusy(false); } }}><label>Sheet number · page {page}<input name="sheet" required maxLength={40} placeholder="e.g. A-101" disabled={busy}/></label><label>Title (optional)<input name="title" maxLength={200} defaultValue={doc.sheets.find(s => s.page === page)?.title} disabled={busy}/></label><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save sheet number"}</Button>{error && <p className="pf-error" role="alert">{error}</p>}</form>;
}

export function SheetComparison({ sheet }: { sheet: LogSheet }) {
  const [from, setFrom] = useState(sheet.versions.at(-2)?.doc.id ?? ""), [to, setTo] = useState(sheet.current.doc.id), [zoom, setZoom] = useState(1);
  const before = sheet.versions.find(v => v.doc.id === from), after = sheet.versions.find(v => v.doc.id === to);
  return <section className="dl-comparison" aria-label={`Compare ${sheet.sheet}`}><div className="dl-compare-controls">{([{ label: "Before version", id: from, set: setFrom, other: to }, { label: "After version", id: to, set: setTo, other: from }]).map(p => <label key={p.label}>{p.label}<select value={p.id} onChange={e => p.set(e.target.value)}>{sheet.versions.map(v => <option key={v.doc.id} value={v.doc.id} disabled={v.doc.id === p.other}>V{v.version} · {setName(v.doc)}</option>)}</select></label>)}<label>Zoom both pages<input aria-label="Comparison zoom" type="range" min="1" max="4" step="0.25" value={zoom} onChange={e => setZoom(Number(e.target.value))}/><span>{Math.round(zoom * 100)}%</span></label></div><p className="cm-muted">Side by side · Each page scrolls independently. Markups stay with the original version.</p><div className="dl-compare-pages">{[before, after].map((v, i) => v && <section key={i}><h3>{i === 0 ? "Before" : "After"} · V{v.version} · {setName(v.doc)}</h3><div className="dl-compare-scroll"><div style={{ width: `${zoom * 100}%` }}><StoredPage doc={v.doc} page={v.page} size={zoom > 1.5 ? 3600 : 2000}/></div></div></section>)}</div></section>;
}
