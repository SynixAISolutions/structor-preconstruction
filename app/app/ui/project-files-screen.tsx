"use client";

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, CloudUpload, File, FileText, Folder, FolderInput, FolderOpen, FolderPlus, GitBranchPlus, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Plus, Tag, Trash2, Upload, X } from "lucide-react";
import { Button, Empty, Modal, PageHeader, Panel, SearchBox, type ViewProps } from "./shared";
import { useActiveProject } from "../../lib/project-scope";
import { displayDate } from "../../lib/format";
import { DOCUMENT_CATEGORIES, drawingLog, revisionLabel, revisionsOf, withSheetNumbers, type LogSheet, type StoredDocument } from "../../lib/project-files";
import { removeProjectDocument, removeProjectFile, renameProjectDocument, updateProjectDocument, uploadProjectPdf, useProjectDocuments, type UploadProgress, uploadProgressText } from "../../lib/project-files-client";
import { contentRows, fileMeta, TAG_COLORS, type ContentOp, type ContentRow, type ContentTag, type ProjectContent, type TagColor } from "../../lib/project-content";
import { allFolders, defaultFolder, filesIn, findFolder, folderAndInside, folderOf, folderPath, ROOT, SYSTEM_FOLDERS, subfolders, type FolderEntry } from "../../lib/project-folders";
import { useProjectContent } from "../../lib/project-content-client";
import { ContentViewer, type ContentLocation } from "./content-viewer";
import { CONTENT_ACTOR, ContentLinks, useContentRecords, type SaveContent } from "./project-content-links";
import { DrawingLogView, UploadCheck, VersionPills } from "./drawing-log";
import { BidDocumentsPanel, type BidUpload } from "./bid-documents";
import "./project-files.css";
import "./project-content.css";

const megabytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const progressText = uploadProgressText;
type Pending = { file: File; category: string; progress?: UploadProgress; error?: string; done?: boolean; storedDoc?: StoredDocument };

/** Something in the explorer: a file (its latest revision, with what the team added) or a folder. */
type Item = { kind: "file"; row: ContentRow } | { kind: "folder"; folder: FolderEntry };
/** What is being dragged inside the explorer (files dragged in from the computer arrive as Files instead). */
type Dragged = { kind: "file"; series: string } | { kind: "folder"; id: string };
const DRAG_TYPE = "application/x-structor-item";
const itemKey = (item: Item) => item.kind === "file" ? `file:${item.row.doc.series}` : `folder:${item.folder.id}`;
const folderName = (content: ProjectContent, id: string) => id === ROOT ? "Project files" : findFolder(content, id)?.name ?? "Project files";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function ProjectFilesScreen({ projectName, notify, navigate }: ViewProps) {
  const projectId = useActiveProject();
  const { documents, ready } = useProjectDocuments();
  const { content, ready: contentReady, change, refresh } = useProjectContent();
  const { records, error: recordsError } = useContentRecords();
  const [folder, setFolder] = useState(ROOT);
  const [tag, setTag] = useState(""), [query, setQuery] = useState(""), [grid, setGrid] = useState(false);
  const [upload, setUpload] = useState<{ revisionOf?: StoredDocument; sheet?: LogSheet; folder?: string } | null>(null);
  const [view, setView] = useState("Files"), [dragRow, setDragRow] = useState(""), [dropFolder, setDropFolder] = useState("");
  const [checkIds, setCheckIds] = useState<string[]>([]);
  const uploadLock = useRef(false);
  const log = drawingLog(documents);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploadCategory, setUploadCategory] = useState("Drawings");
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<ContentLocation | null>(null);
  const [edit, setEdit] = useState<StoredDocument | null>(null), [links, setLinks] = useState<StoredDocument | null>(null);
  const [tagEditor, setTagEditor] = useState<ContentTag | "new" | null>(null), [tagsOpen, setTagsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; item: Item | null } | null>(null);
  const [naming, setNaming] = useState<{ kind: "new-folder"; parent: string } | { kind: "rename"; item: Item } | null>(null);
  const [moving, setMoving] = useState<Item | null>(null), [deleting, setDeleting] = useState<Item | null>(null);
  const picker = useRef<HTMLInputElement>(null), lock = useRef(false);

  // The folder being shown may be deleted by someone else, or this browser may have opened another project.
  useEffect(() => { if (folder !== ROOT && contentReady && !findFolder(content, folder)) setFolder(ROOT); }, [content, contentReady, folder]);
  useEffect(() => {
    const sync = () => { if (!lock.current) refresh().catch(e => setError(e instanceof Error ? e.message : "Could not refresh content.")); };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [refresh]);

  const allRows = contentRows(documents, content, { tag, search: query });
  const searching = !!query.trim() || !!tag;
  const rows = searching ? allRows : allRows.filter(row => folderOf(content, row.doc) === folder);
  const folders = searching ? (tag ? [] : allFolders(content).filter(f => query.trim().toLowerCase().split(/\s+/).every(w => f.name.toLowerCase().includes(w)))) : subfolders(content, folder);
  const items: Item[] = [...folders.map(f => ({ kind: "folder" as const, folder: f })), ...rows.map(row => ({ kind: "file" as const, row }))];
  const path = folderPath(content, folder);
  const here = findFolder(content, folder);
  const totalFiles = contentRows(documents, content).length;

  const save: SaveContent = async (ops: ContentOp[]) => {
    if (lock.current) return null;
    lock.current = true; setSaving(true); setError("");
    try { return await change(ops, CONTENT_ACTOR); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save this change."); return null; }
    finally { lock.current = false; setSaving(false); }
  };
  /** Saves `ops` and returns null, or the reason they could not be saved (for a dialog to show). */
  async function tryOps(ops: ContentOp[]): Promise<string | null> {
    if (lock.current) return "Another change is still saving. Try again.";
    lock.current = true; setSaving(true);
    try { await change(ops, CONTENT_ACTOR); return null; }
    catch (e) { return e instanceof Error ? e.message : "Could not save this change."; }
    finally { lock.current = false; setSaving(false); }
  }
  async function act(ops: ContentOp[], done: string) {
    const result = await save(ops);
    if (result) notify(done);
    return !!result;
  }

  // ── Upload ──
  const uploadInto = (target: string, files: File[] = [], type?: string) => {
    const system = SYSTEM_FOLDERS.find(f => f.id === target || f.id === folderPath(content, target)[0]?.id);
    const category = type ?? system?.upload ?? uploadCategory;
    setUploadCategory(category);
    setPending(files.map(file => ({ file, category })));
    setUpload({ folder: target });
  };
  /** The Bid documents slots: drawings and specifications go to Project Drawings, an addendum to the RFP folder. */
  const uploadBid = (what: BidUpload, files: File[] = []) => what === "addendum" ? uploadInto("rfp", files, "Addenda") : uploadInto("drawings", files, what === "specifications" ? "Specifications" : "Drawings");
  function choose(files: File[]) {
    if (busy) return;
    if ((upload?.revisionOf || upload?.sheet) && files.length > 1) { notify("Choose one PDF for a new revision."); return; }
    setPending(files.map(file => ({ file, category: upload?.sheet ? "Drawings" : upload?.revisionOf?.category ?? uploadCategory })));
  }
  async function startUpload() {
    if (uploadLock.current) return;
    uploadLock.current = true; setBusy(true);
    let stored = 0;
    const checked: string[] = [], remaining: Pending[] = [], moves: ContentOp[] = [];
    const target = upload?.folder;
    for (const [i, item] of pending.entries()) {
      if (item.done) continue;
      if (!/\.pdf$/i.test(item.file.name)) {
        setPending(prev => prev.map((p, n) => n === i ? { ...p, error: "Choose a PDF document." } : p));
        remaining.push(item);
        continue;
      }
      setPending(prev => prev.map((p, n) => n === i ? { ...p, error: undefined } : p));
      let doc = item.storedDoc;
      try {
        if (upload?.sheet && !doc) {
          const { PDFDocument } = await import("pdf-lib");
          const pdf = await PDFDocument.load(await item.file.arrayBuffer());
          if (pdf.getPageCount() !== 1) throw new Error("Choose a one-page PDF for a sheet revision. Upload a drawing set with Upload files.");
        }
        doc ??= await uploadProjectPdf({ projectId, file: item.file, category: item.category, revisionOf: upload?.revisionOf, onProgress: progress => setPending(prev => prev.map((p, n) => n === i ? { ...p, progress } : p)) });
        if (doc.kind === "drawings") {
          if (upload?.sheet) doc = withSheetNumbers(doc, [{ page: 1, sheet: upload.sheet.sheet, title: upload.sheet.title }]);
          await updateProjectDocument(doc);
          checked.push(doc.id);
        }
        // A file uploaded into a folder its category wouldn't choose stays where it was dropped; at the top, its type picks the folder.
        if (target && target !== ROOT && !upload?.revisionOf && defaultFolder(item.category) !== target) moves.push({ op: "file-move", series: doc.series, folder: target });
        stored++;
        setPending(prev => prev.map((p, n) => n === i ? { ...p, done: true } : p));
      } catch (error) {
        if (doc?.kind === "drawings") checked.push(doc.id);
        remaining.push({ ...item, storedDoc: doc });
        setPending(prev => prev.map((p, n) => n === i ? { ...p, storedDoc: doc, error: `${doc ? "File stored. Retry to save sheet details: " : ""}${error instanceof Error ? error.message : "The upload failed."}` } : p));
      }
    }
    if (moves.length) await save(moves);
    uploadLock.current = false; setBusy(false);
    if (checked.length) setCheckIds(ids => [...new Set([...ids, ...checked])]);
    if (stored) notify(upload?.revisionOf ? `Revision ${revisionLabel({ revision: upload.revisionOf.revision + 1 })} of ${upload.revisionOf.name} stored.` : `${plural(stored, "document")} stored in ${target ? folderName(content, target) : `${projectName}'s files`}.`);
    if (!remaining.length) { setPending([]); setUpload(null); }
  }
  const beginRevision = (doc: StoredDocument) => { setPending([]); setUpload({ revisionOf: revisionsOf(documents, doc.series).at(-1) }); };
  function dropRevision(doc: StoredDocument, files: File[]) {
    setDragRow("");
    if (busy) return;
    if (files.length !== 1 || !/\.pdf$/i.test(files[0].name)) { notify("Drop one PDF to add a revision."); return; }
    beginRevision(doc);
    setPending([{ file: files[0], category: doc.category }]);
  }

  // ── Explorer actions ──
  async function moveInto(dragged: Dragged, target: string) {
    if (dragged.kind === "file") {
      const row = allRows.find(r => r.doc.series === dragged.series) ?? contentRows(documents, content).find(r => r.doc.series === dragged.series);
      if (!row || folderOf(content, row.doc) === target) return;
      await act([{ op: "file-move", series: dragged.series, folder: target }], `${row.doc.name} moved to ${folderName(content, target)}.`);
    } else {
      const moved = findFolder(content, dragged.id);
      if (!moved || moved.parent === target || dragged.id === target) return;
      if (moved.system) { notify("The built-in folders stay where they are."); return; }
      if (folderAndInside(content, dragged.id).has(target)) { notify("A folder can't go inside itself."); return; }
      await act([{ op: "folder-move", id: dragged.id, parent: target }], `${moved.name} moved to ${folderName(content, target)}.`);
    }
  }
  async function removeItem(item: Item) {
    setDeleting(null);
    if (item.kind === "folder") { await act([{ op: "folder-delete", id: item.folder.id }], `${item.folder.name} deleted. What was in it moved to ${folderName(content, item.folder.parent)}.`); return; }
    const revisions = revisionsOf(documents, item.row.doc.series);
    try { await removeProjectFile(revisions); notify(`${item.row.doc.name} deleted.`); }
    catch (e) { notify(e instanceof Error ? e.message : "The file could not be deleted."); }
  }
  async function removeRevision(doc: StoredDocument) {
    setConfirmRemove("");
    try { await removeProjectDocument(doc); notify(`${doc.name} ${revisionLabel(doc)} removed.`); }
    catch (e) { notify(e instanceof Error ? e.message : "The document could not be removed."); }
  }
  async function submitName(name: string): Promise<string | null> {
    if (!naming) return null;
    if (naming.kind === "new-folder") return tryOps([{ op: "folder-add", name, parent: naming.parent }]);
    const item = naming.item;
    if (item.kind === "folder") return tryOps([{ op: "folder-rename", id: item.folder.id, name }]);
    try { await renameProjectDocument(item.row.doc, name); return null; }
    catch (e) { return e instanceof Error ? e.message : "The file could not be renamed."; }
  }
  const open = (item: Item) => { setMenu(null); if (item.kind === "folder") { setFolder(item.folder.id); setQuery(""); setTag(""); } else setPreview({ docId: item.row.doc.id, page: 1 }); };

  // ── Drag and drop: items onto folders and breadcrumbs; files from the computer upload where they land ──
  const dragStart = (item: Item) => (e: DragEvent) => {
    if (item.kind === "folder" && item.folder.system) { e.preventDefault(); return; }
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item.kind === "file" ? { kind: "file", series: item.row.doc.series } : { kind: "folder", id: item.folder.id }));
    e.dataTransfer.effectAllowed = "move";
  };
  const dropZone = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      if (busy || (!types.includes(DRAG_TYPE) && !types.includes("Files"))) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = types.includes(DRAG_TYPE) ? "move" : "copy";
      setDropFolder(target);
    },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setDropFolder(f => f === target ? "" : f); },
    onDrop: (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDropFolder("");
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      if (raw) { void moveInto(JSON.parse(raw) as Dragged, target); return; }
      const files = Array.from(e.dataTransfer.files);
      if (files.length) uploadInto(target, files);
    },
  });
  const contextMenu = (item: Item | null) => (e: ReactMouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, item }); };
  const menuButton = (item: Item) => (e: ReactMouseEvent<HTMLButtonElement>) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 4, y: r.bottom + 4, item }); };

  function menuActions(item: Item | null): { label: string; icon: ReactNode; run: () => void; danger?: boolean }[] {
    if (!item) return [
      { label: "New folder", icon: <FolderPlus size={15}/>, run: () => setNaming({ kind: "new-folder", parent: folder }) },
      { label: `Upload files to ${folderName(content, folder)}`, icon: <Upload size={15}/>, run: () => uploadInto(folder) },
    ];
    if (item.kind === "folder") {
      const f = item.folder;
      return [
        { label: "Open", icon: <FolderOpen size={15}/>, run: () => open(item) },
        { label: "New folder inside", icon: <FolderPlus size={15}/>, run: () => setNaming({ kind: "new-folder", parent: f.id }) },
        { label: "Upload files here", icon: <Upload size={15}/>, run: () => uploadInto(f.id) },
        ...(f.system ? [] : [
          { label: "Rename", icon: <Pencil size={15}/>, run: () => setNaming({ kind: "rename", item }) },
          { label: "Move to…", icon: <FolderInput size={15}/>, run: () => setMoving(item) },
          { label: "Delete folder", icon: <Trash2 size={15}/>, run: () => setDeleting(item), danger: true },
        ]),
      ];
    }
    const doc = item.row.doc;
    return [
      { label: "Open", icon: <FileText size={15}/>, run: () => open(item) },
      { label: "Rename", icon: <Pencil size={15}/>, run: () => setNaming({ kind: "rename", item }) },
      { label: "Move to…", icon: <FolderInput size={15}/>, run: () => setMoving(item) },
      { label: "Details & tags", icon: <Tag size={15}/>, run: () => { setEdit(doc); setConfirmRemove(""); } },
      { label: "Upload new revision", icon: <GitBranchPlus size={15}/>, run: () => beginRevision(doc) },
      { label: "Linked records", icon: <Link2 size={15}/>, run: () => setLinks(doc) },
      { label: "Delete file", icon: <Trash2 size={15}/>, run: () => setDeleting(item), danger: true },
    ];
  }

  const crumbs = [{ id: ROOT, name: "Project files" }, ...path];
  const where = (doc: StoredDocument) => folderPath(content, folderOf(content, doc)).map(f => f.name).join(" / ") || "Project files";
  const folderRow = (f: FolderEntry) => {
    const item: Item = { kind: "folder", folder: f };
    const count = filesIn(content, documents, f.id);
    return <tr key={itemKey(item)} className={`pf-folder-row ${dropFolder === f.id ? "pf-drop-active" : ""}`} draggable={!f.system} onDragStart={dragStart(item)} onContextMenu={contextMenu(item)} {...dropZone(f.id)}>
      <td><button className="cm-file-name" onClick={() => open(item)} onDoubleClick={() => open(item)}><span className={`cm-file-symbol pf-folder-symbol ${f.system ? "system" : ""}`}><Folder size={22}/></span><span><strong>{f.name}</strong><small>{searching ? `${folderPath(content, f.parent).map(p => p.name).join(" / ") || "Project files"} · ` : ""}{f.system ? f.hint : plural(count, "file")}</small></span></button></td>
      <td data-label="Type">{f.system ? "Built-in folder" : "Folder"}</td><td data-label="Tags"><span className="cm-muted">--</span></td><td data-label="Markups"><span className="cm-muted">--</span></td><td data-label="Uploaded"><span className="cm-muted">--</span></td><td data-label="Size">{plural(count, "file")}</td>
      <td><button className="ui-icon-btn" aria-label={`Actions for folder ${f.name}`} onClick={menuButton(item)}><MoreHorizontal size={18}/></button></td>
    </tr>;
  };
  const fileRow = (row: ContentRow) => {
    const item: Item = { kind: "file", row };
    return <tr key={itemKey(item)} draggable onDragStart={dragStart(item)} onContextMenu={contextMenu(item)} className={dragRow === row.doc.series ? "dl-drop-active" : ""}
      onDragOver={e => { if (busy || !e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG_TYPE)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragRow(row.doc.series); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragRow(""); }}
      onDrop={e => { if (!e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG_TYPE)) return; e.preventDefault(); e.stopPropagation(); dropRevision(row.doc, Array.from(e.dataTransfer.files)); }}>
      <td><button className="cm-file-name" onClick={() => open(item)}><span className="cm-file-symbol"><FileText size={22}/></span><span><strong>{row.doc.name}</strong><small>{searching ? `${where(row.doc)} · ` : ""}{revisionLabel(row.doc)} · {plural(row.revisions, "revision")} · {row.doc.pageCount} pages</small>{row.description && <small className="cm-file-description">{row.description}</small>}</span></button>
        <div className="dl-file-history"><VersionPills label={`Versions of ${row.doc.name}`} versions={revisionsOf(documents, row.doc.series).map(r => ({ id: r.id, version: r.revision, uploadedAt: r.uploadedAt, name: r.name }))} current={row.doc.id} onOpen={id => setPreview({ docId: id, page: 1 })}/></div>
        {dragRow === row.doc.series && <div className="dl-drop-message" role="status">Drop to add V{row.doc.revision + 1} of {row.doc.name}</div>}</td>
      <td data-label="Type">{row.doc.category}</td>
      <td data-label="Tags"><div className="cm-chips">{row.tags.length ? row.tags.map(t => <span key={t.id} className={`cm-chip cm-color-${t.color}`}>{t.name}</span>) : <span className="cm-muted">--</span>}</div></td>
      <td data-label="Markups"><button className="cm-count-link" aria-label={`${row.markups} markups for ${row.doc.name}`} onClick={() => setPreview({ docId: row.doc.id, page: 1 })}>{row.markups}</button></td>
      <td data-label="Uploaded">{displayDate(row.doc.uploadedAt.slice(0, 10))}</td><td data-label="Size">{megabytes(row.doc.size)}</td>
      <td><button className="ui-icon-btn" aria-label={`Actions for ${row.doc.name}`} onClick={menuButton(item)}><MoreHorizontal size={18}/></button></td>
    </tr>;
  };

  return <div className="intel-view cm-library">
    <PageHeader eyebrow={`${projectName} / Project intelligence`} title="Project files" description="Organize the project's files like a drive: folders, drag and drop, right-click for more. The AI finds the drawings and specifications wherever they are." actions={<><Button onClick={() => { setView("Files"); setNaming({ kind: "new-folder", parent: folder }); }}><FolderPlus size={16}/>New folder</Button><Button variant="primary" onClick={() => uploadInto(view === "Sheets" ? "drawings" : folder)}><Plus size={16}/>Upload files</Button></>}/>
    <div role="status" aria-live="polite" className="cm-save-status">{saving ? "Saving changes..." : !ready || !contentReady ? "Loading project content..." : `${plural(totalFiles, "file")} / ${content.markups.length} markups`}</div>
    {error && <p className="cm-error" role="alert">{error}</p>}
    <div className="dl-view-switch" role="group" aria-label="Project files view">{["Files", "Sheets"].map(name => <button key={name} aria-pressed={view === name} onClick={() => setView(name)}>{name === "Files" ? <FileText size={17}/> : <LayoutGrid size={17}/>} {name}<span>{name === "Files" ? totalFiles : log.sheets.length}</span></button>)}</div>
    {view === "Files" && folder === ROOT && !searching && <BidDocumentsPanel documents={documents} ready={ready} busy={busy} onUpload={uploadBid} onOpen={doc => setPreview({ docId: doc.id, page: 1 })} onRevision={beginRevision} navigate={navigate}/>}
    {view === "Sheets" ? <DrawingLogView log={log} ready={ready} onOpen={setPreview} onRevision={sheet => { setPending([]); setUpload({ sheet }); }} onUpload={() => uploadInto("drawings")} onReview={id => setCheckIds([id])}/> : <Panel className="cm-library-main pf-explorer">
      <div className="ui-toolbar cm-library-toolbar">
        <nav className="pf-crumbs" aria-label="Folder path">{crumbs.map((c, i) => <span key={c.id} className="pf-crumb-wrap">{i > 0 && <ChevronRight size={14} aria-hidden/>}<button className={`pf-crumb ${dropFolder === c.id ? "pf-drop-active" : ""}`} aria-current={i === crumbs.length - 1 && !searching ? "page" : undefined} onClick={() => { setFolder(c.id); setQuery(""); setTag(""); }} {...dropZone(c.id)}>{i === 0 ? <FolderOpen size={14}/> : null}{c.name}</button></span>)}</nav>
        <SearchBox value={query} onChange={setQuery} placeholder="Search all files and folders"/>
        <label className="cm-category">Tag<select aria-label="Filter by tag" value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{content.tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <Button onClick={() => setTagsOpen(true)}><Tag size={14}/>Tags</Button>
        <span className="cm-display-toggle"><button className="ui-icon-btn" aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)}><List size={18}/></button><button className="ui-icon-btn" aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)}><LayoutGrid size={18}/></button></span>
      </div>
      {searching ? <div className="cm-filter-summary"><span>{plural(items.length, "result")} in all folders{tag && ` · ${content.tags.find(t => t.id === tag)?.name || "Tag"}`}</span><button className="cm-text-button" onClick={() => { setQuery(""); setTag(""); }}>Clear search</button></div>
        : here?.hint && <p className="pf-folder-hint">{here.hint}</p>}
      <div className={`pf-drop-area ${dropFolder === folder && !searching ? "pf-drop-active" : ""}`} onContextMenu={contextMenu(null)} {...(searching ? {} : dropZone(folder))}>
        {items.length > 0 && <div className={grid ? "cm-file-grid" : "ui-table-wrap"}><table className={`ui-table cm-files-table ${grid ? "grid" : ""}`}><thead><tr><th>Name</th><th>Type</th><th>Tags</th><th>Markups</th><th>Uploaded</th><th>Size</th><th><span className="cm-sr-only">Actions</span></th></tr></thead><tbody>{items.map(item => item.kind === "folder" ? folderRow(item.folder) : fileRow(item.row))}</tbody></table></div>}
        {ready && contentReady && !items.length && <Empty title={searching ? "Nothing matches" : "This folder is empty"} description={searching ? "Try another word or tag. Search looks through every folder." : `${here?.hint ? `${here.hint} ` : ""}Drop PDFs here, or right-click for a new folder.`} action={searching ? <Button onClick={() => { setQuery(""); setTag(""); }}>Clear search</Button> : <Button onClick={() => uploadInto(folder)}><Upload size={14}/>Upload files</Button>}/>}
        {!searching && items.length > 0 && <p className="pf-drop-note"><CloudUpload size={15}/>Drag files onto a folder to move them, or drop PDFs from your computer to upload them here. Right-click for more.</p>}
      </div>
    </Panel>}

    {menu && <ContextMenu x={menu.x} y={menu.y} actions={menuActions(menu.item)} onClose={() => setMenu(null)}/>}
    {naming && <NameDialog title={naming.kind === "new-folder" ? "New folder" : naming.item.kind === "folder" ? "Rename folder" : "Rename file"} subtitle={naming.kind === "new-folder" ? `In ${folderName(content, naming.parent)}` : naming.item.kind === "file" ? "Every revision takes the new name." : undefined}
      initial={naming.kind === "new-folder" ? "" : naming.item.kind === "folder" ? naming.item.folder.name : naming.item.row.doc.name.replace(/\.pdf$/i, "")} suffix={naming.kind === "rename" && naming.item.kind === "file" ? ".pdf" : ""} busy={saving}
      onSubmit={async name => { const message = await submitName(name); if (message === null) { notify(naming.kind === "new-folder" ? `Folder ${name} created.` : `Renamed to ${name}.`); setNaming(null); } return message; }} onClose={() => setNaming(null)}/>}
    {moving && <MoveDialog content={content} item={moving} busy={saving} current={moving.kind === "file" ? folderOf(content, moving.row.doc) : moving.folder.parent} onMove={async target => { const item = moving; setMoving(null); await moveInto(item.kind === "file" ? { kind: "file", series: item.row.doc.series } : { kind: "folder", id: item.folder.id }, target); }} onClose={() => setMoving(null)}/>}
    {deleting && <Modal title={deleting.kind === "folder" ? `Delete ${deleting.folder.name}?` : `Delete ${deleting.row.doc.name}?`} onClose={() => setDeleting(null)}><div className="cm-confirm pf-confirm">{deleting.kind === "folder"
      ? <p>Only the folder is removed. What's inside ({plural(filesIn(content, documents, deleting.folder.id), "file")}{subfolders(content, deleting.folder.id).length ? ` and ${plural(subfolders(content, deleting.folder.id).length, "folder")}` : ""}) moves to {folderName(content, deleting.folder.parent)}.</p>
      : <p>This deletes the file{deleting.row.revisions > 1 ? ` and all ${deleting.row.revisions} revisions` : ""} from the project, with any markups on it. It can't be undone.</p>}
      <Button variant="danger" disabled={saving} onClick={() => void removeItem(deleting)}>{deleting.kind === "folder" ? "Delete folder" : "Delete file"}</Button><Button onClick={() => setDeleting(null)}>Cancel</Button></div></Modal>}

    {upload && <Modal title={upload.sheet ? `Add revision · ${upload.sheet.sheet}` : upload.revisionOf ? `Add revision ${revisionLabel({ revision: upload.revisionOf.revision + 1 })}` : `Upload to ${folderName(content, upload.folder ?? ROOT)}`} subtitle={upload.sheet ? `One PDF page becomes V${upload.sheet.versions.length + 1} of ${upload.sheet.sheet}. Its sheet number will be matched to this drawing.` : upload.revisionOf ? `New issue of ${upload.revisionOf.name}. ${revisionLabel(upload.revisionOf)} stays for comparison.` : "Upload PDF documents. Drawings and specifications are also read for the project's AI tools, whatever folder they are in."} onClose={() => { if (busy) notify("The upload continues in the background. Its progress shows at the bottom of the page."); setUpload(null); }}>
      <div className="intel-upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(Array.from(e.dataTransfer.files)); }}><CloudUpload size={34}/><h3>Drop your files here</h3><p>{upload.sheet ? "One PDF page: the next version of this sheet" : upload.revisionOf ? "One PDF: the new issue" : "Drawing sets, project manual, reports, RFP, contracts, budgets"}</p><Button disabled={busy} onClick={() => picker.current?.click()}>Browse files</Button><input ref={picker} type="file" multiple={!upload.revisionOf && !upload.sheet} accept=".pdf,application/pdf" hidden disabled={busy} aria-label="Choose PDF files" onChange={e => choose(Array.from(e.target.files || []))}/></div>
      {!upload.revisionOf && !upload.sheet && <label className="ui-field">File type<select disabled={busy} value={uploadCategory} onChange={e => { setUploadCategory(e.target.value); setPending(prev => prev.map(p => p.progress ? p : { ...p, category: e.target.value })); }}>{DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>}
      {pending.length > 0 && <div className="pf-upload-list">{pending.map((p, i) => <div key={`${p.file.name}-${i}`} className="pf-upload-row">
        <span><File size={15}/> {p.file.name} <small>{megabytes(p.file.size)} · {p.category}</small></span>
        {busy || p.done ? <small>{p.done ? "Stored" : p.progress ? progressText(p.progress) : "Waiting…"}</small> : <button className="ui-icon-btn" aria-label={`Remove ${p.file.name}`} onClick={() => setPending(prev => prev.filter((_, n) => n !== i))}><X size={14}/></button>}
        {p.progress && !p.done && <progress value={p.progress.done} max={Math.max(1, p.progress.total)}/>}
        {p.error && <span className="pf-error" role="alert">{p.error}</span>}
      </div>)}</div>}
      <p className="intel-muted intel-small">Large drawing sets take a few minutes: the file is stored, then every page is read. Keep this page open until it finishes.</p>
      <div className="intel-dialog-actions"><Button onClick={() => { if (busy) notify("The upload continues in the background. Its progress shows at the bottom of the page."); setUpload(null); }}>{busy ? "Continue in background" : "Cancel"}</Button><Button variant="primary" disabled={busy || !pending.some(p => !p.done)} onClick={() => void startUpload()}>{busy ? "Working…" : `Store ${pending.filter(p => !p.done).length || ""} file${pending.length === 1 ? "" : "s"}`}</Button></div>
    </Modal>}

    {!!checkIds.length && !upload && <Modal title="Upload check" subtitle="Review the sheet numbers and what this upload changed. Your upload is already saved." wide onClose={() => setCheckIds([])}><UploadCheck documents={documents} ids={checkIds} onDone={() => setCheckIds([])}/></Modal>}
    {tagsOpen && !tagEditor && <Modal title="Tags" subtitle="Tags are shared across this project's files. Add them to a file from Details & tags." onClose={() => setTagsOpen(false)}><div className="pf-tag-list">{content.tags.length ? content.tags.map(t => <div key={t.id}><span className={`cm-chip cm-color-${t.color}`}><Tag size={12}/>{t.name}</span><button className="ui-icon-btn" aria-label={`Edit tag ${t.name}`} disabled={saving} onClick={() => setTagEditor(t)}><Pencil size={13}/></button></div>) : <p className="cm-muted">No tags yet.</p>}</div><Button onClick={() => setTagEditor("new")} disabled={!contentReady || saving}><Plus size={14}/>Add tag</Button></Modal>}
    {tagEditor && <TagEditor key={typeof tagEditor === "string" ? tagEditor : tagEditor.id} tag={tagEditor} save={save} disabled={saving} onClose={() => setTagEditor(null)} onDelete={() => { if (typeof tagEditor !== "string" && tag === tagEditor.id) setTag(""); setTagEditor(null); }}/>}
    {edit && <Modal title="Details & tags" subtitle={`${edit.name} / Details carry across revisions`} onClose={() => setEdit(null)}><form className="cm-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); if (await save([{ op: "file-edit", series: edit.series, description: String(data.get("description")), tags: data.getAll("tag").map(String) }])) setEdit(null); }}><label>Description<textarea name="description" rows={4} maxLength={1000} defaultValue={fileMeta(content, edit.series).description}/></label><fieldset><legend>Tags</legend>{content.tags.length ? content.tags.map(t => <label className="cm-check" key={t.id}><input type="checkbox" name="tag" value={t.id} defaultChecked={fileMeta(content, edit.series).tags.includes(t.id)}/><span className={`cm-chip cm-color-${t.color}`}>{t.name}</span></label>) : <p className="cm-muted">No tags yet. Add them with Tags in the toolbar.</p>}</fieldset><Button variant="primary" type="submit" disabled={saving}>Save details</Button></form>
      <h3>Revision history</h3><div className="cm-revision-history">{revisionsOf(documents, edit.series).map(r => <div key={r.id}><button className="cm-text-button" onClick={() => { setPreview({ docId: r.id, page: 1 }); setEdit(null); }}>{revisionLabel(r)} / {displayDate(r.uploadedAt.slice(0, 10))}</button>{confirmRemove === r.id ? <><Button variant="danger" onClick={() => void removeRevision(r)}>Delete revision</Button><Button onClick={() => setConfirmRemove("")}>Keep revision</Button></> : <button className="ui-icon-btn" aria-label={`Delete revision ${revisionLabel(r)}`} onClick={() => setConfirmRemove(r.id)}><Trash2 size={14}/></button>}</div>)}</div>
    </Modal>}
    {links && <Modal title="Linked records" subtitle={links.name} onClose={() => setLinks(null)}><h3>File / All revisions</h3>{recordsError && <p role="alert" className="cm-error">Clarifications: {recordsError}</p>}<ContentLinks links={fileMeta(content, links.series).links} target={{ series: links.series }} save={save} records={records} disabled={saving}/>{content.markups.filter(m => documents.some(d => d.series === links.series && d.id === m.docId)).map(m => <details className="cm-attachment-target" key={m.id}><summary>{m.title}<small>{revisionLabel(documents.find(d => d.id === m.docId)!)} / Page {m.page} / {m.links.length} links</small></summary><Button onClick={() => { setLinks(null); setPreview({ docId: m.docId, page: m.page, markupId: m.id }); }}>Open markup</Button><ContentLinks links={m.links} target={{ markupId: m.id }} save={save} records={records} disabled={saving}/></details>)}</Modal>}
    {preview && <ContentViewer key={preview.docId} initial={preview} documents={documents} onClose={() => setPreview(null)}/>}
    {(edit || links || tagEditor || moving || deleting) && error && <div className="cm-dialog-error" role="alert">{error}</div>}
  </div>;
}

/** A right-click menu at the pointer; Escape, a click elsewhere or scrolling closes it. */
function ContextMenu({ x, y, actions, onClose }: { x: number; y: number; actions: { label: string; icon: ReactNode; run: () => void; danger?: boolean }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // Placed inside the window before it is shown, and focused without scrolling: a scroll closes the menu.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, innerHeight - r.height - 8)) });
  }, [x, y]);
  useLayoutEffect(() => { if (at) ref.current?.querySelector("button")?.focus({ preventScroll: true }); }, [at]);
  useEffect(() => {
    const el = ref.current;
    const close = (e: Event) => { if (!(e.target instanceof Node && el?.contains(e.target))) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const buttons = Array.from(el?.querySelectorAll("button") ?? []), now = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(now + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); e.preventDefault();
      }
    };
    document.addEventListener("mousedown", close); document.addEventListener("contextmenu", close, true); document.addEventListener("keydown", key); window.addEventListener("scroll", onClose, true); window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("contextmenu", close, true); document.removeEventListener("keydown", key); window.removeEventListener("scroll", onClose, true); window.removeEventListener("resize", onClose); };
  }, [x, y, onClose]);
  // On the page itself, so no scrolling or animated container around the list can move or clip it.
  return createPortal(<div ref={ref} className="pf-menu" role="menu" style={{ left: at?.left ?? x, top: at?.top ?? y, visibility: at ? "visible" : "hidden" }}>{actions.map(a => <button key={a.label} role="menuitem" className={a.danger ? "danger" : ""} onClick={() => { onClose(); a.run(); }}>{a.icon}{a.label}</button>)}</div>, document.body);
}

function NameDialog({ title, subtitle, initial, suffix, busy, onSubmit, onClose }: { title: string; subtitle?: string; initial: string; suffix: string; busy: boolean; onSubmit: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // The dialog focuses its close button as it opens; the name is what you came to type, so it takes focus after.
  useEffect(() => { const t = setTimeout(() => { input.current?.focus(); input.current?.select(); }); return () => clearTimeout(t); }, []);
  return <Modal title={title} subtitle={subtitle} onClose={onClose}><form className="cm-form" onSubmit={async e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name") ?? "").trim(); if (!name) { setMessage("Give it a name."); return; } setMessage((await onSubmit(name)) ?? ""); }}>
    <label>Name<span className="pf-name-field"><input ref={input} name="name" required maxLength={250} defaultValue={initial}/>{suffix && <span>{suffix}</span>}</span></label>
    {message && <p className="cm-error" role="alert">{message}</p>}
    <div className="intel-dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={busy}>{title === "New folder" ? "Create folder" : "Rename"}</Button></div>
  </form></Modal>;
}

/** Choose a folder to move into: every folder, indented, except where the item can't go. */
function MoveDialog({ content, item, current, busy, onMove, onClose }: { content: ProjectContent; item: Item; current: string; busy: boolean; onMove: (target: string) => void; onClose: () => void }) {
  const blocked = item.kind === "folder" ? folderAndInside(content, item.folder.id) : new Set<string>();
  const [target, setTarget] = useState(current);
  const tree: { id: string; name: string; depth: number }[] = [{ id: ROOT, name: "Project files", depth: 0 }];
  const walk = (parent: string, depth: number) => subfolders(content, parent).forEach(f => { tree.push({ id: f.id, name: f.name, depth }); walk(f.id, depth + 1); });
  walk(ROOT, 1);
  return <Modal title={`Move ${item.kind === "file" ? item.row.doc.name : item.folder.name}`} subtitle="Choose the folder it goes in." onClose={onClose}>
    <div className="pf-move-tree" role="radiogroup" aria-label="Folders">{tree.map(f => <label key={f.id} className={blocked.has(f.id) ? "disabled" : ""} style={{ paddingLeft: 10 + f.depth * 18 }}><input type="radio" name="target" value={f.id} disabled={blocked.has(f.id)} checked={target === f.id} onChange={() => setTarget(f.id)}/>{f.id === ROOT ? <FolderOpen size={15}/> : <Folder size={15}/>}{f.name}{f.id === current && <small>Current</small>}</label>)}</div>
    <div className="intel-dialog-actions"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || target === current} onClick={() => onMove(target)}>Move here</Button></div>
  </Modal>;
}

function TagEditor({ tag, save, disabled, onClose, onDelete }: { tag: ContentTag | "new"; save: SaveContent; disabled: boolean; onClose: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return <Modal title={tag === "new" ? "Add tag" : "Edit tag"} subtitle="Tags are shared across this project's files." onClose={onClose}><form className="cm-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const name = String(data.get("name")), color = data.get("color") as TagColor; if (await save([tag === "new" ? { op: "tag-add", name, color } : { op: "tag-edit", id: tag.id, name, color }])) onClose(); }}><label>Tag name<input name="name" required maxLength={40} defaultValue={tag === "new" ? "" : tag.name}/></label><label>Color<select name="color" defaultValue={tag === "new" ? "orange" : tag.color}>{TAG_COLORS.map(c => <option key={c} value={c}>{c}</option>)}</select></label><Button type="submit" variant="primary" disabled={disabled}>Save tag</Button></form>{tag !== "new" && (confirm ? <div className="cm-confirm"><p>Delete {tag.name} from every file in this project?</p><Button variant="danger" disabled={disabled} onClick={async () => { if (await save([{ op: "tag-delete", id: tag.id }])) onDelete(); }}>Delete tag</Button><Button onClick={() => setConfirm(false)}>Keep tag</Button></div> : <Button onClick={() => setConfirm(true)}><Trash2 size={14}/>Delete tag</Button>)}</Modal>;
}
