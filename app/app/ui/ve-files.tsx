"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { uploadProjectPdf, uploadProgressText } from "../../lib/project-files-client";
import { useProjectContent } from "../../lib/project-content-client";
import type { VeIdea } from "../../lib/value-engineering";
import { Button } from "./shared";
import { LinkedProjectContent } from "./project-content-links";

/**
 * A VE item's backup (Marcel, 24 Oct: "file attachments (product data backup)"): the PDFs attached to it. A file
 * attached here is stored in Project files, described as the item's product data and linked to it, so it opens
 * in the viewer like any project file and can be linked from Project files too.
 */
export function VeFiles({ idea, projectId, by, notify }: { idea: VeIdea; projectId: string; by: string; notify: (message: string) => void }) {
  const { change } = useProjectContent(projectId);
  const picker = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  async function attach(files: File[]) {
    const pdfs = files.filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!pdfs.length) { setError("Attach PDF files, such as product data sheets."); return; }
    setError("");
    try {
      for (const file of pdfs) {
        setWorking(`Attaching ${file.name}…`);
        const doc = await uploadProjectPdf({ projectId, file, category: "Other", onProgress: p => setWorking(`${file.name}: ${uploadProgressText(p)}`) });
        await change([
          { op: "file-edit", series: doc.series, description: `Product data for VE ${idea.number}: ${idea.description}`.slice(0, 500) },
          { op: "link", target: { series: doc.series }, link: { kind: "ve", id: idea.id, label: `${idea.number} · ${idea.description}`.slice(0, 160) } },
        ], by);
      }
      notify(pdfs.length === 1 ? "File attached to the VE item and stored in Project files." : `${pdfs.length} files attached to the VE item and stored in Project files.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The file could not be attached.");
    } finally {
      setWorking("");
      if (picker.current) picker.current.value = "";
    }
  }

  return <div className="ve-files">
    <LinkedProjectContent kind="ve" recordId={idea.id}/>
    <div className="ve-files-actions">
      <Button disabled={!!working} onClick={() => picker.current?.click()}><Paperclip size={14}/>{working ? "Attaching…" : "Attach product data"}</Button>
      <input ref={picker} type="file" accept=".pdf,application/pdf" multiple hidden aria-label="Choose PDF files to attach" onChange={e => void attach(Array.from(e.target.files ?? []))}/>
      {working ? <small role="status">{working}</small> : error ? <small className="ve-error" role="alert">{error}</small> : <small>PDFs are stored in Project files and linked to this item.</small>}
    </div>
  </div>;
}
