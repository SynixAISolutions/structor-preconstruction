"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ScopeSources } from "../../lib/scope-sources";
import { DrawingCanvas } from "./drawing-flip-ui";
import { Badge, Button, Empty, Modal } from "./shared";

export function ScopeSourceDialog({ title, sources, kind, colors, onClose }: {
  title: string;
  sources: ScopeSources;
  kind: "drawings" | "spec";
  colors: Map<string, string>;
  onClose: () => void;
}) {
  const [drawingIndex, setDrawingIndex] = useState(0);
  const [regionId, setRegionId] = useState("");
  // shortcut: the manual lasts for this dialog, share file access when project storage is connected.
  const [manual, setManual] = useState<{ url: string; name: string } | null>(null);
  const [page, setPage] = useState(sources.spec?.pages?.first ?? 1);
  const [error, setError] = useState("");
  const fileRequest = useRef(0);
  useEffect(() => () => { fileRequest.current++; }, []);
  useEffect(() => () => { if (manual) URL.revokeObjectURL(manual.url); }, [manual]);
  const drawing = sources.drawings[drawingIndex];
  const spec = sources.spec;

  async function openManual(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const request = ++fileRequest.current;
    try {
      const header = await file.slice(0, 1024).text();
      if (request !== fileRequest.current) return;
      if (!/\.pdf$/i.test(file.name) || !header.includes("%PDF-")) {
        setError("Choose a PDF project manual.");
        return;
      }
      setManual({ url: URL.createObjectURL(file), name: file.name });
      setError("");
    } catch {
      if (request === fileRequest.current) setError("The file could not be opened. Choose the project manual again.");
    }
  }

  return <Modal title={kind === "drawings" ? "Drawing source" : "Specification source"} subtitle={title} wide onClose={onClose}>
    {kind === "drawings" ? drawing ? <div className="proc-source-dialog">
      {sources.drawings.length > 1 && <label className="ui-field">Source sheet<select value={drawingIndex} onChange={event => { setDrawingIndex(Number(event.target.value)); setRegionId(""); }}>{sources.drawings.map(({ page }, index) => <option key={page.id} value={index}>{page.sheet} · {page.title}</option>)}</select></label>}
      <div className="proc-source-heading"><div><strong>{drawing.page.sheet} · {drawing.page.title}</strong><p>{drawing.page.documentName} · page {drawing.page.pageNumber}</p></div><Badge>{drawing.page.image ? "Source drawing" : "Illustrative diagram"}</Badge></div>
      <DrawingCanvas page={drawing.page} regions={drawing.regions} selectedId={regionId || drawing.regions[0]?.id || ""} colors={colors} onSelect={setRegionId} expandable={false}/>
      {drawing.regions.length ? <ul className="proc-source-regions">{drawing.regions.map(region => <li key={region.id}><button className={(regionId || drawing.regions[0]?.id) === region.id ? "active" : ""} onClick={() => setRegionId(region.id)}>{region.number} · {region.label}</button><p>{region.evidence}</p></li>)}</ul> : <p className="proc-modal-note">This requirement references the whole sheet; no specific region is linked.</p>}
    </div> : <Empty title="No drawing linked" description={sources.unresolved || "This requirement has no linked drawing page yet."}/> : spec ? <div className="proc-source-dialog">
      <div className="proc-source-heading"><div><strong>{spec.section} · {spec.title || "Specification section"}</strong><p>{spec.paragraph || "Whole section"} · {spec.pages ? `Manual pages ${spec.pages.first}–${spec.pages.last}` : "Page range not linked"}</p></div><Badge>Manual reference</Badge></div>
      <p className="proc-modal-note">Open the project manual from your computer to view this reference. The file stays in this browser. Sample page references need checking against your manual.</p>
      <label className="ui-field">Project manual PDF<input type="file" accept="application/pdf,.pdf" onChange={openManual}/></label>
      {error && <p className="proc-source-error" role="alert">{error}</p>}
      {manual && <>
        <div className="proc-source-page-controls"><span>{manual.name}</span>{spec.pages && <><Button disabled={page <= spec.pages.first} onClick={() => setPage(page - 1)}>Previous page</Button><span>Page {page}</span><Button disabled={page >= spec.pages.last} onClick={() => setPage(page + 1)}>Next page</Button></>}</div>
        <a className="proc-manual-download" href={manual.url} download={manual.name}>Download manual</a>
        <object key={`${manual.url}-${page}`} aria-label={`${manual.name} · page ${page}`} type="application/pdf" data={`${manual.url}#page=${page}&view=FitH`} className="proc-manual-frame"><p className="proc-modal-note">The PDF preview is unavailable in this browser. Use Download manual to open it in your PDF viewer.</p></object>
      </>}
    </div> : <Empty title="No specification linked" description={sources.unresolved || "This requirement has no specification section reference yet."}/>}
  </Modal>;
}
