"use client";

import { useRef, useState } from "react";
import { CloudUpload, File, FileSpreadsheet, FileText, Folder, GitBranchPlus, Layers, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, SearchBox, type ViewProps } from "./shared";
import { StoredDocumentViewer } from "./project-file-viewer";
import { useLocalDraft } from "../../lib/use-local-draft";
import { useActiveProject } from "../../lib/project-scope";
import { categories, sampleFiles, type LibraryFile } from "../../lib/data/preconstruction";
import { displayDate } from "../../lib/format";
import { latestDocuments, revisionLabel, revisionsOf, type StoredDocument } from "../../lib/project-files";
import { removeProjectDocument, uploadProjectPdf, useProjectDocuments, type UploadProgress } from "../../lib/project-files-client";
import "./project-files.css";

const megabytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const progressText = (p: UploadProgress) => p.stage === "uploading" ? `Uploading ${Math.round((p.done / Math.max(1, p.total)) * 100)}%` : p.stage === "reading" ? `Reading page ${p.done} of ${p.total}` : `Saving page text ${p.done + 1} of ${p.total}`;
type Pending = { file: File; category: string; progress?: UploadProgress; error?: string; done?: boolean };

/**
 * Project files (Marcel, 15 Oct): the drawings and project manual uploaded here are the project's
 * documents. They are stored once and read from here by the AI and by every source pop-up; a newer
 * issue of a document is uploaded as its next revision (V1, V2, V3) for Revision comparison.
 */
export function ProjectFilesScreen({ projectName, notify, navigate }: ViewProps) {
  const projectId = useActiveProject();
  const { documents, ready } = useProjectDocuments();
  const [details, setDetails] = useLocalDraft("library", sampleFiles);
  const [category, setCategory] = useState("All files");
  const [query, setQuery] = useState("");
  const [upload, setUpload] = useState<{ revisionOf?: StoredDocument } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploadCategory, setUploadCategory] = useState("Drawings");
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ doc: StoredDocument; page: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  // Real documents replace the placeholder entries of their category; other file details stay.
  const storedCategories = new Set(documents.map(d => d.category));
  const otherFiles = details.filter(f => !(f.sample && (storedCategories.has(f.category) || f.type === "PDF" && ["Drawings", "Specifications"].includes(f.category))));
  const latest = latestDocuments(documents).map(doc => documents.find(d => d.id === chosen[doc.series]) ?? doc);
  const matches = (name: string, cat: string) => (category === "All files" || cat === category) && `${name} ${cat}`.toLowerCase().includes(query.toLowerCase());
  const visibleDocs = latest.filter(d => matches(d.name, d.category));
  const visibleOther = otherFiles.filter(f => matches(f.name, f.category));
  const count = (c: string) => c === "All files" ? latest.length + otherFiles.length : latest.filter(d => d.category === c).length + otherFiles.filter(f => f.category === c).length;

  function choose(files: File[]) {
    setPending(files.map(file => ({ file, category: upload?.revisionOf?.category ?? uploadCategory })));
  }

  async function startUpload() {
    setBusy(true);
    let stored = 0;
    for (const [i, item] of pending.entries()) {
      if (item.done) continue;
      const isPdf = /\.pdf$/i.test(item.file.name);
      if (!isPdf) {
        // Non-PDF files keep their details only (no reading); PDFs are the documents the AI reads.
        const date = new Date().toISOString().slice(0, 10);
        setDetails(prev => [{ id: crypto.randomUUID(), name: item.file.name, category: item.category, type: item.file.name.split(".").pop()?.toUpperCase() || "FILE", size: megabytes(item.file.size), date, revision: "New" }, ...prev]);
        setPending(prev => prev.map((p, n) => n === i ? { ...p, done: true } : p));
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

  return <div className="intel-view">
    <PageHeader eyebrow={`${projectName} / Project intelligence`} title="Project files" description="The drawings, project manual and documents for this project. The AI writes scopes from these files, and every source reference opens the real page." actions={<Button variant="primary" onClick={() => { setPending([]); setUpload({}); }}><Plus size={16}/>Upload files</Button>}/>
    <div className="intel-library-layout">
      <aside className="ui-panel intel-folders"><div className="intel-folder-heading">PROJECT FILES</div>{categories.map((c, i) => <button key={c} className={c === category ? "active" : ""} onClick={() => setCategory(c)}>{i === 0 ? <Layers size={17}/> : <Folder size={17}/>}<span>{c}</span><small>{count(c)}</small></button>)}
        <div className="intel-library-tip"><CloudUpload size={22}/><strong>Upload once</strong><p>Scopes &amp; bid forms reads the drawings and project manual stored here — no second upload.</p><button onClick={() => navigate("scopes")}>Open Scopes &amp; bid forms</button></div>
      </aside>
      <div className="intel-library-main">
        <Panel>
          <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search documents…"/><span className="intel-muted">{ready ? `${latest.length} stored · ${otherFiles.length} other` : "Loading project files…"}</span></div>
          <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Document name</th><th>Revision</th><th>Added</th><th>Size</th><th></th></tr></thead><tbody>
            {visibleDocs.map(doc => {
              const revisions = revisionsOf(documents, doc.series);
              return <tr key={doc.series}>
                <td><button className="intel-file-link" onClick={() => setPreview({ doc, page: 1 })}><span className="intel-file-icon pdf"><FileText size={19}/></span><span><strong>{doc.name}</strong><small>{doc.category} · {doc.pageCount} pages{doc.kind === "drawings" ? ` · ${doc.sheets.filter(s => s.sheet).length} sheets` : doc.kind === "manual" ? ` · ${doc.sections.length} sections` : ""}</small></span></button></td>
                <td><span className="pf-revisions">{revisions.map(r => <button key={r.id} className={r.id === doc.id ? "active" : ""} onClick={() => setChosen(prev => ({ ...prev, [doc.series]: r.id }))} title={`Uploaded ${displayDate(r.uploadedAt.slice(0, 10))}`}>{revisionLabel(r)}</button>)}</span></td>
                <td>{displayDate(doc.uploadedAt.slice(0, 10))}</td>
                <td className="intel-muted">{megabytes(doc.size)}</td>
                <td><span className="pf-actions">
                  <Button onClick={() => { setPending([]); setUpload({ revisionOf: revisions.at(-1) }); }}><GitBranchPlus size={15}/>Upload revision</Button>
                  {confirmRemove === doc.id ? <><Button variant="danger" onClick={() => void remove(doc)}>Remove {revisionLabel(doc)}</Button><Button onClick={() => setConfirmRemove("")}>Keep</Button></> : <button className="ui-icon-btn" aria-label={`Remove ${doc.name} ${revisionLabel(doc)}`} onClick={() => setConfirmRemove(doc.id)}><Trash2 size={15}/></button>}
                </span></td>
              </tr>;
            })}
            {visibleOther.map(f => <OtherFileRow key={f.id} file={f}/>)}
          </tbody></table></div>
          {ready && !visibleDocs.length && !visibleOther.length && <Empty title="No documents yet" description="Upload the drawing set and project manual. The AI reads them from here." action={<Button onClick={() => { setPending([]); setUpload({}); }}>Upload files</Button>}/>}
        </Panel>
        <div className="intel-inline-note"><ShieldCheck size={17}/><span>Stored privately for this project and only reachable with the site password. Use Upload revision when a newer issue of a document arrives; earlier revisions stay for comparison.</span></div>
      </div>
    </div>

    {upload && <Modal title={upload.revisionOf ? `Upload revision ${revisionLabel({ revision: upload.revisionOf.revision + 1 })}` : "Add project documents"} subtitle={upload.revisionOf ? `New issue of ${upload.revisionOf.name}. ${revisionLabel(upload.revisionOf)} stays for comparison.` : "PDF drawings and the project manual are read by the AI; other files keep their details."} onClose={() => { if (!busy) setUpload(null); }}>
      <div className="intel-upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(Array.from(e.dataTransfer.files)); }}><CloudUpload size={34}/><h3>Drop your files here</h3><p>{upload.revisionOf ? "One PDF: the new issue" : "Drawing sets, project manual, reports, RFP, contracts"}</p><Button onClick={() => picker.current?.click()}>Browse files</Button><input ref={picker} type="file" multiple={!upload.revisionOf} accept={upload.revisionOf ? ".pdf,application/pdf" : undefined} hidden onChange={e => choose(Array.from(e.target.files || []))}/></div>
      {!upload.revisionOf && <label className="ui-field">Save to category<select value={uploadCategory} onChange={e => { setUploadCategory(e.target.value); setPending(prev => prev.map(p => p.progress ? p : { ...p, category: e.target.value })); }}>{categories.slice(1).map(c => <option key={c}>{c}</option>)}</select></label>}
      {pending.length > 0 && <div className="pf-upload-list">{pending.map((p, i) => <div key={`${p.file.name}-${i}`} className="pf-upload-row">
        <span><File size={15}/> {p.file.name} <small>{megabytes(p.file.size)} · {p.category}</small></span>
        {busy || p.done ? <small>{p.done ? "Stored" : p.progress ? progressText(p.progress) : "Waiting…"}</small> : <button className="ui-icon-btn" aria-label={`Remove ${p.file.name}`} onClick={() => setPending(prev => prev.filter((_, n) => n !== i))}><X size={14}/></button>}
        {p.progress && !p.done && <progress value={p.progress.done} max={Math.max(1, p.progress.total)}/>}
        {p.error && <span className="pf-error" role="alert">{p.error}</span>}
      </div>)}</div>}
      <p className="intel-muted intel-small">Large drawing sets take a few minutes: the file is stored, then every page is read. Keep this page open until it finishes.</p>
      <div className="intel-dialog-actions"><Button disabled={busy} onClick={() => setUpload(null)}>Cancel</Button><Button variant="primary" disabled={busy || !pending.some(p => !p.done)} onClick={() => void startUpload()}>{busy ? "Working…" : `Store ${pending.filter(p => !p.done).length || ""} file${pending.length === 1 ? "" : "s"}`}</Button></div>
    </Modal>}

    {preview && <Modal title={preview.doc.name} subtitle={`${preview.doc.category} · ${revisionLabel(preview.doc)} · ${preview.doc.pageCount} pages`} wide onClose={() => setPreview(null)}>
      <StoredDocumentViewer doc={preview.doc} page={preview.page} onPageChange={page => setPreview(p => p && { ...p, page })}/>
    </Modal>}
  </div>;
}

function OtherFileRow({ file }: { file: LibraryFile }) {
  return <tr><td><span className="intel-file-link"><span className={`intel-file-icon ${file.type.toLowerCase()}`}>{file.type === "XLSX" ? <FileSpreadsheet size={19}/> : <FileText size={19}/>}</span><span><strong>{file.name}</strong><small>{file.category} · {file.sample ? "Placeholder entry" : "Details only"}</small></span></span></td><td><Badge>{file.revision}</Badge></td><td>{displayDate(file.date)}</td><td className="intel-muted">{file.size}</td><td/></tr>;
}
