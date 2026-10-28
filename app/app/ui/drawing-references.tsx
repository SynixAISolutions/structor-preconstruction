"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Map as MapIcon } from "lucide-react";
import { byDiscipline } from "../../lib/drawing-references";
import { useProjectDocuments } from "../../lib/project-files-client";
import type { TradePackage } from "../../lib/procurement";
import { useDrawingReferences } from "../../lib/use-drawing-references";
import { ocrScannedSheets, stopSheetOcr, useSheetOcr } from "../../lib/sheet-text-ocr";
import { StoredDocumentViewer, type MarkLayer } from "./project-file-viewer";
import { Button, Modal } from "./shared";

/**
 * Where a trade is on the drawings, found by printed text on every sheet (lib/drawing-references), grouped by
 * discipline as Wyre lists them. A sheet opens on the trade's printed lines, highlighted green; "Highlight all
 * packages" adds every other trade's lines on that sheet in its own colour.
 */
export function PackageDrawingReferences({ pkg, packages, colors }: { pkg: TradePackage; packages: TradePackage[]; colors: Map<string, string> }) {
  const { ready, error, sheets, searchable, referencesFor } = useDrawingReferences(packages);
  const { documents } = useProjectDocuments();
  const [index, setIndex] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const ocr = useSheetOcr();
  if (ready && !sheets) return null;
  const refs = ready ? referencesFor(pkg.id) : [];
  const open = index === null ? null : refs[index] ?? null;
  const doc = open ? documents.find(d => d.id === open.docId) : undefined;
  const layers: MarkLayer[] = open && all ? packages.filter(p => p.id !== pkg.id).map(p => ({ key: p.id, label: p.name, color: colors.get(p.id) ?? "#657eae", quotes: referencesFor(p.id).find(r => r.docId === open.docId && r.page === open.page)?.lines ?? [] })).filter(l => l.quotes.length) : [];
  const unsearched = sheets - searchable;
  return <section className="pkg-drawing-refs" aria-label={`${pkg.name} on the drawings`}>
    <header><MapIcon size={14}/><strong>On the drawings</strong>
      <small role="status">{!ready ? "Searching the printed text of every sheet…" : error || (refs.length ? `${refs.length} sheet${refs.length === 1 ? "" : "s"}, found by their printed text: CSI numbers and section titles` : `Not in the printed text of the ${searchable} searchable sheets`)}</small>
    </header>
    {ready && (ocr.running || unsearched > 0 || ocr.failed.length > 0) && <p className="pkg-drawing-ocr" role="status">
      {ocr.running
        ? <>Reading scanned sheet {ocr.sheet} ({Math.min(ocr.done + 1, ocr.total)} of {ocr.total}){ocr.part ? `, part ${ocr.part.done + 1} of ${ocr.part.total}` : ""}. Each sheet is saved as soon as it is read; keep this tab open. <Button onClick={stopSheetOcr}>Stop</Button></>
        : <>{unsearched > 0 && <>{unsearched} scanned sheet{unsearched === 1 ? " has" : "s have"} no text to search. Structor can read {unsearched === 1 ? "it" : "them"} once with OCR in this tab (about a minute a sheet) and save the text for everyone. <Button onClick={() => void ocrScannedSheets(documents)}>Make {unsearched === 1 ? "it" : "them"} searchable</Button></>}{ocr.saved > 0 && ` ${ocr.saved} sheet${ocr.saved === 1 ? "" : "s"} made searchable.`}{ocr.failed.length > 0 && ` Not read: ${ocr.failed.join("; ")}.`}</>}
    </p>}
    {refs.length > 0 && <div className="pkg-drawing-groups">{byDiscipline(refs).map(g => <details key={g.discipline}>
      <summary>{g.discipline} ({g.refs.length})</summary>
      <div className="pkg-drawing-chips">{g.refs.map(r => <button key={`${r.docId}:${r.page}`} type="button" className="pkg-source-chip" title={r.lines.slice(0, 3).join(" · ")} onClick={() => setIndex(refs.indexOf(r))}>{r.sheet}{r.title ? ` · ${r.title}` : ""}</button>)}</div>
    </details>)}</div>}
    {open && <Modal title={`${open.sheet}${open.title ? ` · ${open.title}` : ""}`} subtitle={`${pkg.name} · ${open.lines.length} printed line${open.lines.length === 1 ? "" : "s"} on this sheet`} wide onClose={() => setIndex(null)}>
      <div className="pkg-drawing-bar">
        <span className="stored-viewer-pages"><button className="ui-icon-btn" aria-label="Previous sheet" disabled={index === 0} onClick={() => setIndex(i => (i ?? 1) - 1)}><ChevronLeft size={16}/></button><span>{(index ?? 0) + 1} / {refs.length} sheets</span><button className="ui-icon-btn" aria-label="Next sheet" disabled={index === refs.length - 1} onClick={() => setIndex(i => (i ?? 0) + 1)}><ChevronRight size={16}/></button></span>
        <label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)}/> Highlight all packages on this sheet</label>
      </div>
      {all && <p className="pkg-drawing-legend">{layers.length ? layers.map(l => <span key={l.key}><i style={{ background: l.color }}/>{l.label}</span>) : "No other package's words are printed on this sheet."}<span><i className="selected"/>{pkg.name}</span></p>}
      {doc ? <StoredDocumentViewer key={`${open.docId}:${open.page}`} doc={doc} page={open.page} onPageChange={() => {}} range={{ first: open.page, last: open.page }} highlight={open.lines} layers={all ? layers : undefined}/> : <p role="alert">This drawing set is no longer in Project files.</p>}
    </Modal>}
  </section>;
}
