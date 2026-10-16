"use client";

import { useRef, useState } from "react";
import { Check, CloudUpload, FileText, ListChecks } from "lucide-react";
import { Badge, Button, ExportButton, Modal, Panel, exportRows } from "./shared";
import { StoredDocumentViewer } from "./project-file-viewer";
import { exhibitBRows, revisionLabel, type StoredDocument } from "../../lib/project-files";
import { uploadProjectPdf, useProjectDocuments } from "../../lib/project-files-client";
import { exhibitFileName, exhibitStatus } from "../../lib/exhibits";
import { useActiveProject } from "../../lib/project-scope";

/**
 * All other exhibits (Marcel, 15 Oct): Exhibit A is written here, Exhibit B is generated from Project
 * files, and the contracts department uploads C–I. Uploads are stored as project files named
 * "Exhibit C - …" so they travel with the project and open anywhere.
 */
export function OtherExhibits({ hasScope, notify, onOpenScope, onOpenDrawings }: { hasScope: boolean; notify: (text: string) => void; onOpenScope: () => void; onOpenDrawings: () => void }) {
  const projectId = useActiveProject();
  const { documents } = useProjectDocuments();
  const documentList = exhibitBRows(documents);
  const slots = exhibitStatus(documents, hasScope, documentList.length > 1);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<StoredDocument | null>(null);
  const [page, setPage] = useState(1);
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef("");

  async function upload(file: File) {
    const letter = target.current;
    const replacing = slots.find(s => s.letter === letter)?.doc ?? undefined;
    setBusy(letter);
    try {
      const named = new File([file], exhibitFileName(letter, file.name), { type: file.type || "application/pdf" });
      await uploadProjectPdf({ projectId, file: named, category: "Contracts", revisionOf: replacing });
      notify(`Exhibit ${letter} stored with the project's files.`);
    } catch (error) { notify(error instanceof Error ? error.message : "The exhibit could not be stored."); }
    finally { setBusy(""); }
  }

  return <Panel title="Subcontract exhibits" subtitle={`${slots.filter(s => s.ready).length} of ${slots.length} ready · carried into the subcontract with Exhibit A`}>
    <input ref={picker} type="file" accept=".pdf,application/pdf" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }}/>
    <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Exhibit</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>{slots.map(slot => <tr key={slot.letter}>
      <td><strong>Exhibit {slot.letter}</strong><small className="cm-cell-note">{slot.title}</small></td>
      <td className="intel-muted">{slot.source === "scope" ? "Written in Structor (Exhibit A tab)" : slot.source === "generated" ? "Generated from Project files: documents, drawings with dates, specification sections" : slot.doc ? `${slot.doc.name} · ${revisionLabel(slot.doc)}` : "Uploaded by the contracts department"}</td>
      <td>{slot.ready ? <Badge tone="green"><Check size={12}/> Ready</Badge> : <Badge tone="amber">{slot.source === "upload" ? "Not uploaded" : "Not ready"}</Badge>}</td>
      <td><span className="pf-actions">
        {slot.source === "scope" && <Button onClick={onOpenScope}><FileText size={14}/>Open</Button>}
        {slot.source === "generated" && <><ExportButton onClick={() => exportRows("exhibit-b-list-of-documents.csv", documentList)}/><Button onClick={onOpenDrawings}><ListChecks size={14}/>List of drawings</Button></>}
        {slot.source === "upload" && <>{slot.doc && <Button onClick={() => { setOpen(slot.doc); setPage(1); }}><FileText size={14}/>Open</Button>}<Button disabled={!!busy} onClick={() => { target.current = slot.letter; picker.current?.click(); }}><CloudUpload size={14}/>{busy === slot.letter ? "Storing…" : slot.doc ? "Replace" : "Upload"}</Button></>}
      </span></td>
    </tr>)}</tbody></table></div>
    {open && <Modal title={open.name} subtitle={`${revisionLabel(open)} · ${open.pageCount} pages`} wide onClose={() => setOpen(null)}><StoredDocumentViewer doc={open} page={page} onPageChange={setPage}/></Modal>}
  </Panel>;
}
