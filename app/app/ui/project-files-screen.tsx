"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, File, FileText, LayoutGrid, Link2, List, MoreHorizontal, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { Button, Empty, Modal, PageHeader, Panel, SearchBox, type ViewProps } from "./shared";
import { useActiveProject } from "../../lib/project-scope";
import { displayDate } from "../../lib/format";
import { DOCUMENT_CATEGORIES, revisionLabel, revisionsOf, type StoredDocument } from "../../lib/project-files";
import { removeProjectDocument, uploadProjectPdf, useProjectDocuments, type UploadProgress } from "../../lib/project-files-client";
import { contentRows, fileMeta, LINK_KINDS, sourceCounts, TAG_COLORS, type ContentOp, type ContentSource, type ContentTag, type TagColor } from "../../lib/project-content";
import { useProjectContent } from "../../lib/project-content-client";
import { ContentViewer, type ContentLocation } from "./content-viewer";
import { CONTENT_ACTOR, ContentLinks, useContentRecords, type SaveContent } from "./project-content-links";
import "./project-files.css";
import "./project-content.css";

const megabytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const progressText = (p: UploadProgress) => p.stage === "uploading" ? `Uploading ${Math.round((p.done / Math.max(1, p.total)) * 100)}%` : p.stage === "reading" ? `Reading page ${p.done} of ${p.total}` : p.stage === "title-blocks" ? `Reading title blocks ${p.done} of ${p.total}` : `Saving page text ${p.done + 1} of ${p.total}`;
type Pending = { file: File; category: string; progress?: UploadProgress; error?: string; done?: boolean };

export function ProjectFilesScreen({ projectName, notify }: ViewProps) {
  const projectId = useActiveProject();
  const { documents, ready } = useProjectDocuments();
  const { content, ready: contentReady, change, refresh } = useProjectContent();
  const { records, error: recordsError } = useContentRecords();
  const [category, setCategory] = useState("");
  const [source, setSource] = useState<ContentSource>("all"), [tag, setTag] = useState("");
  const [query, setQuery] = useState(""), [grid, setGrid] = useState(false);
  const [upload, setUpload] = useState<{ revisionOf?: StoredDocument } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploadCategory, setUploadCategory] = useState("Drawings");
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState<ContentLocation | null>(null);
  const [edit, setEdit] = useState<StoredDocument | null>(null), [links, setLinks] = useState<StoredDocument | null>(null);
  const [tagEditor, setTagEditor] = useState<ContentTag | "new" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState("");
  const picker = useRef<HTMLInputElement>(null), lock = useRef(false);
  const rows = contentRows(documents, content, { source, tag, category, search: query });
  const counts = sourceCounts(documents, content);
  const filters = source !== "all" || tag || category || query;

  useEffect(() => {
    const sync = () => { if (!lock.current) refresh().catch(e => setError(e instanceof Error ? e.message : "Could not refresh content.")); };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [refresh]);

  const save: SaveContent = async (ops: ContentOp[]) => {
    if (lock.current) return null;
    lock.current = true; setSaving(true); setError("");
    try { return await change(ops, CONTENT_ACTOR); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save this change."); return null; }
    finally { lock.current = false; setSaving(false); }
  };

  function choose(files: File[]) {
    if (busy) return;
    if (upload?.revisionOf && files.length > 1) { notify("Choose one PDF for a new revision."); return; }
    setPending(files.map(file => ({ file, category: upload?.revisionOf?.category ?? uploadCategory })));
  }

  async function startUpload() {
    setBusy(true);
    let stored = 0;
    for (const [i, item] of pending.entries()) {
      if (item.done) continue;
      const isPdf = /\.pdf$/i.test(item.file.name);
      if (!isPdf) {
        setPending(prev => prev.map((p, n) => n === i ? { ...p, error: "Choose a PDF document." } : p));
        continue;
      }
      try {
        await uploadProjectPdf({ projectId, file: item.file, category: item.category, revisionOf: upload?.revisionOf, onProgress: progress => setPending(prev => prev.map((p, n) => n === i ? { ...p, progress } : p)) });
        stored++;
        setPending(prev => prev.map((p, n) => n === i ? { ...p, done: true } : p));
      } catch (error) {
        setPending(prev => prev.map((p, n) => n === i ? { ...p, error: error instanceof Error ? error.message : "The upload failed." } : p));
      }
    }
    setBusy(false);
    if (stored) notify(upload?.revisionOf ? `Revision ${revisionLabel({ revision: upload.revisionOf.revision + 1 })} of ${upload.revisionOf.name} stored.` : `${stored} document${stored === 1 ? "" : "s"} stored in ${projectName}'s files.`);
    setPending(prev => { const left = prev.filter(p => !p.done); if (!left.length) setUpload(null); return left; });
  }

  async function remove(doc: StoredDocument) {
    setConfirmRemove("");
    try { await removeProjectDocument(doc); notify(`${doc.name} ${revisionLabel(doc)} removed.`); }
    catch (error) { notify(error instanceof Error ? error.message : "The document could not be removed."); }
  }

  const startNewUpload = () => { setPending([]); setUpload({}); };
  const resetFilters = () => { setSource("all"); setTag(""); setCategory(""); setQuery(""); };
  const beginRevision = (doc: StoredDocument) => { setPending([]); setUpload({ revisionOf: revisionsOf(documents, doc.series).at(-1) }); };

  return <div className="intel-view cm-library">
    <PageHeader eyebrow={`${projectName} / Project intelligence`} title="Project files" description="Find the latest files, mark up a page, and connect the evidence to the work it supports." actions={<Button variant="primary" onClick={startNewUpload}><Plus size={16}/>Upload files</Button>}/>
    <div role="status" aria-live="polite" className="cm-save-status">{saving ? "Saving changes..." : !ready || !contentReady ? "Loading project content..." : `${counts.all} files / ${content.markups.length} markups`}</div>
    {error && <p className="cm-error" role="alert">{error}</p>}
    <div className="cm-library-layout">
      <aside className="ui-panel cm-library-sidebar" aria-label="File filters"><h2>Sources</h2>
        {([{ kind: "all", label: "All files" }, { kind: "unlinked", label: "Not linked" }, ...LINK_KINDS] as { kind: ContentSource; label: string }[]).map(item => <button className={`cm-source ${source === item.kind ? "active" : ""}`} aria-pressed={source === item.kind} key={item.kind} onClick={() => setSource(item.kind)}>{item.kind === "all" ? <FileText size={16}/> : <Link2 size={16}/>}<span>{item.label}</span><small>{counts[item.kind]}</small></button>)}
        <div className="cm-tag-heading"><h2>Tags</h2><button className="ui-icon-btn" aria-label="Add tag" disabled={!contentReady || saving} onClick={() => setTagEditor("new")}><Plus size={16}/></button></div>
        {!content.tags.length && <p className="cm-panel-empty">No tags yet. Add a tag to organize the project's files.</p>}
        {content.tags.map(item => <div className="cm-tag-filter" key={item.id}><button className={`cm-chip cm-color-${item.color} ${tag === item.id ? "active" : ""}`} aria-pressed={tag === item.id} onClick={() => setTag(t => t === item.id ? "" : item.id)}><Tag size={12}/>{item.name}</button><button className="ui-icon-btn" aria-label={`Edit tag ${item.name}`} disabled={saving} onClick={() => setTagEditor(item)}><Pencil size={13}/></button></div>)}
        <div className="cm-sidebar-note"><CloudUpload size={20}/><strong>One project library</strong><p>Tags, descriptions and file links carry forward to new revisions. Page markups stay with their original revision.</p></div>
      </aside>
      <Panel className="cm-library-main"><div className="ui-toolbar cm-library-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search files, tags or descriptions"/><label className="cm-category">Category<select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><span className="cm-display-toggle"><button className="ui-icon-btn" aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)}><List size={18}/></button><button className="ui-icon-btn" aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)}><LayoutGrid size={18}/></button></span></div>
        {filters && <div className="cm-filter-summary"><span>{rows.length} matching files{tag && ` · ${content.tags.find(t => t.id === tag)?.name || "Tag"}`}</span><button className="cm-text-button" onClick={resetFilters}>Clear filters</button></div>}
        {rows.length > 0 && <div className={grid ? "cm-file-grid" : "ui-table-wrap"}><table className={`ui-table cm-files-table ${grid ? "grid" : ""}`}><thead><tr><th>Name / revision</th><th>Category</th><th>Tags</th><th>Links</th><th>Markups</th><th>Uploaded</th><th>Size</th><th><span className="cm-sr-only">Actions</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.doc.series}>
          <td><button className="cm-file-name" onClick={() => setPreview({ docId: row.doc.id, page: 1 })}><span className="cm-file-symbol"><FileText size={22}/></span><span><strong>{row.doc.name}</strong><small>{revisionLabel(row.doc)} · {row.revisions} revision{row.revisions === 1 ? "" : "s"} · {row.doc.pageCount} pages</small>{row.description && <small className="cm-file-description">{row.description}</small>}</span></button></td>
          <td data-label="Category">{row.doc.category}</td><td data-label="Tags"><div className="cm-chips">{row.tags.length ? row.tags.map(t => <span key={t.id} className={`cm-chip cm-color-${t.color}`}>{t.name}</span>) : <span className="cm-muted">--</span>}</div></td>
          <td data-label="Links"><button className="cm-count-link" aria-label={`${row.links.length} linked records for ${row.doc.name}`} onClick={() => setLinks(row.doc)}><Link2 size={13}/>{row.links.length}</button></td>
          <td data-label="Markups"><button className="cm-count-link" aria-label={`${row.markups} markups for ${row.doc.name}`} onClick={() => setPreview({ docId: row.doc.id, page: 1 })}>{row.markups}</button></td>
          <td data-label="Uploaded">{displayDate(row.doc.uploadedAt.slice(0, 10))}</td><td data-label="Size">{megabytes(row.doc.size)}</td>
          <td><details className="cm-row-menu"><summary aria-label={`Actions for ${row.doc.name}`}><MoreHorizontal size={18}/></summary><div><button onClick={() => setPreview({ docId: row.doc.id, page: 1 })}>Open viewer</button><button onClick={() => { setEdit(row.doc); setConfirmRemove(""); }}>Edit file details</button><button onClick={() => setLinks(row.doc)}>Manage links</button><button onClick={() => beginRevision(row.doc)}>Upload revision</button><button onClick={() => setConfirmRemove(row.doc.id)}>Delete {revisionLabel(row.doc)}</button></div></details>
            {confirmRemove === row.doc.id && <div className="cm-confirm"><p>Delete {row.doc.name} {revisionLabel(row.doc)}?</p><Button variant="danger" onClick={() => void remove(row.doc)}>Delete file</Button><Button onClick={() => setConfirmRemove("")}>Keep file</Button></div>}
          </td></tr>)}</tbody></table></div>}
        {ready && contentReady && !rows.length && <Empty title={counts.all ? "No matching files" : "No project files yet"} description={counts.all ? "Try another source, category, tag or search." : "Upload a PDF drawing set, specification or report to start the project library."} action={<Button onClick={counts.all ? resetFilters : startNewUpload}>{counts.all ? "Clear filters" : "Upload files"}</Button>}/>}
      </Panel>
    </div>
    {upload && <Modal title={upload.revisionOf ? `Upload revision ${revisionLabel({ revision: upload.revisionOf.revision + 1 })}` : "Add project documents"} subtitle={upload.revisionOf ? `New issue of ${upload.revisionOf.name}. ${revisionLabel(upload.revisionOf)} stays for comparison.` : "Upload PDF documents. Drawings and specifications are also available to the project's AI tools."} onClose={() => { if (!busy) setUpload(null); }}>
      <div className="intel-upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(Array.from(e.dataTransfer.files)); }}><CloudUpload size={34}/><h3>Drop your files here</h3><p>{upload.revisionOf ? "One PDF: the new issue" : "Drawing sets, project manual, reports, RFP, contracts"}</p><Button disabled={busy} onClick={() => picker.current?.click()}>Browse files</Button><input ref={picker} type="file" multiple={!upload.revisionOf} accept=".pdf,application/pdf" hidden onChange={e => choose(Array.from(e.target.files || []))}/></div>
      {!upload.revisionOf && <label className="ui-field">Save to category<select disabled={busy} value={uploadCategory} onChange={e => { setUploadCategory(e.target.value); setPending(prev => prev.map(p => p.progress ? p : { ...p, category: e.target.value })); }}>{DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>}
      {pending.length > 0 && <div className="pf-upload-list">{pending.map((p, i) => <div key={`${p.file.name}-${i}`} className="pf-upload-row">
        <span><File size={15}/> {p.file.name} <small>{megabytes(p.file.size)} · {p.category}</small></span>
        {busy || p.done ? <small>{p.done ? "Stored" : p.progress ? progressText(p.progress) : "Waiting…"}</small> : <button className="ui-icon-btn" aria-label={`Remove ${p.file.name}`} onClick={() => setPending(prev => prev.filter((_, n) => n !== i))}><X size={14}/></button>}
        {p.progress && !p.done && <progress value={p.progress.done} max={Math.max(1, p.progress.total)}/>}
        {p.error && <span className="pf-error" role="alert">{p.error}</span>}
      </div>)}</div>}
      <p className="intel-muted intel-small">Large drawing sets take a few minutes: the file is stored, then every page is read. Keep this page open until it finishes.</p>
      <div className="intel-dialog-actions"><Button disabled={busy} onClick={() => setUpload(null)}>Cancel</Button><Button variant="primary" disabled={busy || !pending.some(p => !p.done)} onClick={() => void startUpload()}>{busy ? "Working…" : `Store ${pending.filter(p => !p.done).length || ""} file${pending.length === 1 ? "" : "s"}`}</Button></div>
    </Modal>}


    {tagEditor && <TagEditor key={typeof tagEditor === "string" ? tagEditor : tagEditor.id} tag={tagEditor} save={save} disabled={saving} onClose={() => setTagEditor(null)} onDelete={() => { if (typeof tagEditor !== "string" && tag === tagEditor.id) setTag(""); setTagEditor(null); }}/>}
    {edit && <Modal title="File details" subtitle={`${edit.name} / Details carry across revisions`} onClose={() => setEdit(null)}><form className="cm-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); if (await save([{ op: "file-edit", series: edit.series, description: String(data.get("description")), tags: data.getAll("tag").map(String) }])) setEdit(null); }}><label>Description<textarea name="description" rows={4} maxLength={1000} defaultValue={fileMeta(content, edit.series).description}/></label><fieldset><legend>Tags</legend>{content.tags.length ? content.tags.map(t => <label className="cm-check" key={t.id}><input type="checkbox" name="tag" value={t.id} defaultChecked={fileMeta(content, edit.series).tags.includes(t.id)}/><span className={`cm-chip cm-color-${t.color}`}>{t.name}</span></label>) : <p className="cm-muted">No tags yet. Add tags from the library's side list.</p>}</fieldset><Button variant="primary" type="submit" disabled={saving}>Save file details</Button></form>
      <h3>Revision history</h3><div className="cm-revision-history">{revisionsOf(documents, edit.series).map(r => <div key={r.id}><button className="cm-text-button" onClick={() => { setPreview({ docId: r.id, page: 1 }); setEdit(null); }}>{revisionLabel(r)} / {displayDate(r.uploadedAt.slice(0, 10))}</button>{confirmRemove === r.id ? <><Button variant="danger" onClick={() => void remove(r)}>Delete revision</Button><Button onClick={() => setConfirmRemove("")}>Keep revision</Button></> : <button className="ui-icon-btn" aria-label={`Delete revision ${revisionLabel(r)}`} onClick={() => setConfirmRemove(r.id)}><Trash2 size={14}/></button>}</div>)}</div>
    </Modal>}
    {links && <Modal title="Linked records" subtitle={links.name} onClose={() => setLinks(null)}><h3>File / All revisions</h3>{recordsError && <p role="alert" className="cm-error">Clarifications: {recordsError}</p>}<ContentLinks links={fileMeta(content, links.series).links} target={{ series: links.series }} save={save} records={records} disabled={saving}/>{content.markups.filter(m => documents.some(d => d.series === links.series && d.id === m.docId)).map(m => <details className="cm-attachment-target" key={m.id}><summary>{m.title}<small>{revisionLabel(documents.find(d => d.id === m.docId)!)} / Page {m.page} / {m.links.length} links</small></summary><Button onClick={() => { setLinks(null); setPreview({ docId: m.docId, page: m.page, markupId: m.id }); }}>Open markup</Button><ContentLinks links={m.links} target={{ markupId: m.id }} save={save} records={records} disabled={saving}/></details>)}</Modal>}
    {preview && <ContentViewer key={preview.docId} initial={preview} documents={documents} onClose={() => setPreview(null)}/>}
    {(edit || links || tagEditor) && error && <div className="cm-dialog-error" role="alert">{error}</div>}
  </div>;
}

function TagEditor({ tag, save, disabled, onClose, onDelete }: { tag: ContentTag | "new"; save: SaveContent; disabled: boolean; onClose: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return <Modal title={tag === "new" ? "Add tag" : "Edit tag"} subtitle="Tags are shared across this project's files." onClose={onClose}><form className="cm-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const name = String(data.get("name")), color = data.get("color") as TagColor; if (await save([tag === "new" ? { op: "tag-add", name, color } : { op: "tag-edit", id: tag.id, name, color }])) onClose(); }}><label>Tag name<input name="name" required maxLength={40} defaultValue={tag === "new" ? "" : tag.name}/></label><label>Color<select name="color" defaultValue={tag === "new" ? "orange" : tag.color}>{TAG_COLORS.map(c => <option key={c} value={c}>{c}</option>)}</select></label><Button type="submit" variant="primary" disabled={disabled}>Save tag</Button></form>{tag !== "new" && (confirm ? <div className="cm-confirm"><p>Delete {tag.name} from every file in this project?</p><Button variant="danger" disabled={disabled} onClick={async () => { if (await save([{ op: "tag-delete", id: tag.id }])) onDelete(); }}>Delete tag</Button><Button onClick={() => setConfirm(false)}>Keep tag</Button></div> : <Button onClick={() => setConfirm(true)}><Trash2 size={14}/>Delete tag</Button>)}</Modal>;
}
