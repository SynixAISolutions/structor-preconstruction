"use client";

import { useState } from "react";
import type { Citation, RegionDraft } from "../../lib/extraction";
import type { ScopeSources } from "../../lib/scope-sources";
import { DrawingCanvas, type CanvasRegion } from "./drawing-flip-ui";
import { Badge, Empty, Modal, PreviewNote } from "./shared";
import { SourcePdf } from "./source-pdf";

export function ScopeSourceDialog({ title, sources, kind, colors, onClose, citation, proposedRegion, sample = false }: {
  title: string;
  sources: ScopeSources;
  kind: "drawings" | "spec";
  colors: Map<string, string>;
  onClose: () => void;
  citation?: Citation;
  proposedRegion?: RegionDraft;
  sample?: boolean;
}) {
  const [drawingIndex, setDrawingIndex] = useState(0);
  const [regionId, setRegionId] = useState("");
  const [page, setPage] = useState(citation?.page ?? sources.spec?.pages?.first ?? 1);
  const drawing = sources.drawings[drawingIndex];
  const spec = sources.spec;
  const pageRange = citation ? spec?.pages && citation.page >= spec.pages.first && citation.page <= spec.pages.last ? spec.pages : { first: citation.page, last: citation.page } : spec?.pages;
  const preview = proposedRegion && drawing?.page.sheet === proposedRegion.sheet ? proposedRegion : null;
  const regions: CanvasRegion[] = preview ? [{ id: preview.id, number: "D", label: preview.label, polygon: preview.polygon, packageId: preview.packageId, status: "pending-review" }] : drawing?.regions ?? [];

  return <Modal title={citation ? "Source citation" : kind === "drawings" ? "Drawing source" : "Specification source"} subtitle={title} wide onClose={onClose}>
    {sample && <PreviewNote>Illustrative example: no documents were read. The quote and page reference are sample data.</PreviewNote>}
    {citation && <blockquote className="proc-citation-quote"><strong>Cited text</strong><p>{citation.quote}</p></blockquote>}
    {kind === "drawings" ? drawing ? <div className="proc-source-dialog">
      {sources.drawings.length > 1 && <label className="ui-field">Source sheet<select value={drawingIndex} onChange={event => { setDrawingIndex(Number(event.target.value)); setRegionId(""); }}>{sources.drawings.map(({ page }, index) => <option key={page.id} value={index}>{page.sheet} · {page.title}</option>)}</select></label>}
      <div className="proc-source-heading"><div><strong>{drawing.page.sheet} · {drawing.page.title}</strong><p>{drawing.page.documentName} · page {drawing.page.pageNumber}</p></div><Badge>{drawing.page.image ? "Source drawing" : "Illustrative diagram"}</Badge></div>
      <DrawingCanvas page={drawing.page} regions={regions} selectedId={regionId || regions[0]?.id || ""} colors={colors} onSelect={setRegionId} expandable={false}/>
      {preview ? <p className="proc-modal-note">Proposed region: {preview.label}. It stays out of Drawing Flip until accepted.</p> : drawing.regions.length ? <ul className="proc-source-regions">{drawing.regions.map(region => <li key={region.id}><button className={(regionId || drawing.regions[0]?.id) === region.id ? "active" : ""} onClick={() => setRegionId(region.id)}>{region.number} · {region.label}</button><p>{region.evidence}</p></li>)}</ul> : <p className="proc-modal-note">This requirement references the whole sheet; no specific region is linked.</p>}
    </div> : <Empty title="No drawing linked" description={sources.unresolved || "This requirement has no linked drawing page yet."}/> : (spec || citation) ? <div className="proc-source-dialog">
      <div className="proc-source-heading"><div><strong>{citation ? citation.document : `${spec!.section} · ${spec!.title || "Specification section"}`}</strong><p>{citation ? `Cited page ${citation.page}${citation.sheet ? ` · ${citation.sheet}` : ""}` : `${spec!.paragraph || "Whole section"} · ${spec!.pages ? `Manual pages ${spec!.pages.first}–${spec!.pages.last}` : "Page range not linked"}`}</p></div><Badge>Manual reference</Badge></div>
      <SourcePdf page={page} range={pageRange} onPageChange={setPage} label={citation ? "Source PDF" : "Project manual PDF"}/>
    </div> : <Empty title="No specification linked" description={sources.unresolved || "This requirement has no specification section reference yet."}/>}
  </Modal>;
}
