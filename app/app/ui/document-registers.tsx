"use client";

import { useState } from "react";
import { BookOpenText, GitCompareArrows, Layers } from "lucide-react";
import { Badge, Button, Empty, ExportButton, Modal, PageHeader, Panel, SearchBox, Stats, exportRows, type ViewProps } from "./shared";
import { StoredDocumentViewer } from "./project-file-viewer";
import { drawingRegister, exhibitBRows, findManual, revisionLabel, type StoredDocument } from "../../lib/project-files";
import { screenLabel } from "../../lib/screens";
import { CSI_DIVISIONS, csiDivision } from "../../lib/csi";

/**
 * List of drawings read from the stored drawing sets' title blocks (Marcel, 15 Oct: every drawing and
 * its date, as on his Exhibit B). Exports the full Exhibit B list of documents.
 */
export function StoredDrawingRegister({ projectName, navigate, documents }: ViewProps & { documents: StoredDocument[] }) {
  const rows = drawingRegister(documents);
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("All disciplines");
  const [open, setOpen] = useState<{ doc: StoredDocument; page: number } | null>(null);
  const disciplines = [...new Set(rows.map(r => r.discipline))];
  const visible = rows.filter(r => (discipline === "All disciplines" || r.discipline === discipline) && `${r.sheet} ${r.title}`.toLowerCase().includes(query.toLowerCase()));
  const dates = [...new Set(rows.map(r => r.date).filter(Boolean))];
  return <div className="intel-view">
    <PageHeader eyebrow={`${projectName} / Document control`} title={screenLabel("drawings")} description="Every sheet in the stored drawing sets, read from its title block: number, title and issue date. This is Exhibit B's drawing list." actions={<><ExportButton onClick={() => exportRows("exhibit-b-list-of-documents.csv", exhibitBRows(documents))}/><Button onClick={() => navigate("documents")}><Layers size={16}/>Project files</Button></>}/>
    <Stats items={[{ label: "Drawing sheets", value: rows.length, detail: "Named from their title blocks" }, { label: "Disciplines", value: disciplines.length, detail: disciplines.slice(0, 3).join(", ") + (disciplines.length > 3 ? "…" : "") }, { label: "Issue dates", value: dates.length, detail: dates.slice(0, 2).join(", ") || "Not read" }, { label: "Drawing sets", value: new Set(rows.map(r => r.doc.series)).size, detail: "Newest revision of each" }]}/>
    <Panel>
      <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search sheet number or title…"/><select className="intel-select" aria-label="Drawing discipline" value={discipline} onChange={e => setDiscipline(e.target.value)}><option>All disciplines</option>{disciplines.map(d => <option key={d}>{d}</option>)}</select><Button onClick={() => navigate("revisions")}><GitCompareArrows size={16}/>Compare revisions</Button></div>
      <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Drawing</th><th>Discipline</th><th>Issue date</th><th>Set revision</th><th>Document · page</th></tr></thead><tbody>{visible.map(r => <tr key={`${r.doc.id}-${r.page}`}>
        <td><button className="intel-drawing-link" onClick={() => setOpen({ doc: r.doc, page: r.page })}><span className="intel-file-icon drawing"><Layers size={18}/></span><span><strong>{r.sheet}</strong><small>{r.title || "Title not read"}</small></span></button></td>
        <td>{r.discipline}</td><td>{r.date || "—"}</td><td><Badge>{revisionLabel(r.doc)}{r.revisions > 1 ? ` of ${r.revisions}` : ""}</Badge></td><td className="intel-muted">{r.doc.name} · p. {r.page}</td>
      </tr>)}</tbody></table></div>
      {!visible.length && <Empty title="No sheets match" description="Change the discipline filter or search another sheet."/>}
      <div className="intel-panel-foot"><span>{visible.length} of {rows.length} sheets</span><span>Export gives the full Exhibit B list: documents, drawings with dates, specification sections</span></div>
    </Panel>
    {open && <Modal title={open.doc.name} subtitle={`${revisionLabel(open.doc)} · ${open.doc.pageCount} pages`} wide onClose={() => setOpen(null)}><StoredDocumentViewer doc={open.doc} page={open.page} onPageChange={page => setOpen(o => o && { ...o, page })}/></Modal>}
  </div>;
}

/** List of specifications from the stored project manual: every section and its page range, opening the real pages. */
export function StoredSpecRegister({ projectName, navigate, documents }: ViewProps & { documents: StoredDocument[] }) {
  const manual = findManual(documents)!;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ page: number; range: { first: number; last: number } } | null>(null);
  const visible = manual.sections.filter(s => `${s.section} ${s.title}`.toLowerCase().includes(query.toLowerCase()));
  const divisions = [...new Set(manual.sections.map(s => csiDivision(s.section)).filter(Boolean))] as string[];
  const grouped = divisions.sort((a, b) => Number(a) - Number(b)).map(id => ({ id, title: CSI_DIVISIONS[id] ?? "", rows: visible.filter(s => csiDivision(s.section) === id) })).filter(g => g.rows.length);
  return <div className="intel-view">
    <PageHeader eyebrow={`${projectName} / Document control`} title={screenLabel("specifications")} description="The stored project manual by CSI division and section; open any section to read its pages." actions={<><ExportButton onClick={() => exportRows("list-of-specifications.csv", [["CSI section", "Title", "Division", "First page", "Last page", "Document"], ...manual.sections.map(s => [s.section, s.title, CSI_DIVISIONS[csiDivision(s.section) ?? ""] ?? "", s.first, s.last, `${manual.name} (${revisionLabel(manual)})`])])}/><Button onClick={() => navigate("documents")}><BookOpenText size={16}/>Project manual</Button></>}/>
    <Stats items={[{ label: "Specification sections", value: manual.sections.length, detail: manual.name }, { label: "CSI divisions", value: divisions.length, detail: "In this issue" }, { label: "Manual pages", value: manual.pageCount, detail: revisionLabel(manual) }, { label: "Revisions", value: documents.filter(d => d.series === manual.series).length, detail: "Of this manual" }]}/>
    <Panel>
      <div className="ui-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search section number or title…"/></div>
      <div className="intel-spec-register">{grouped.map(group => <section key={group.id}><header><span>Division {group.id}</span><strong>{group.title}</strong><small>{group.rows.length} {group.rows.length === 1 ? "section" : "sections"}</small></header><div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>Section</th><th>Title</th><th>Manual pages</th><th></th></tr></thead><tbody>{group.rows.map(s => <tr key={`${s.section}-${s.first}`}><td><span className="intel-spec-code">{s.section}</span></td><td><strong>{s.title}</strong></td><td>{s.first}–{s.last}</td><td><Button onClick={() => setOpen({ page: s.first, range: { first: s.first, last: s.last } })}>Open</Button></td></tr>)}</tbody></table></div></section>)}</div>
      {!visible.length && <Empty title="No sections match" description="Search another section number or title."/>}
    </Panel>
    {open && <Modal title={manual.name} subtitle={`Pages ${open.range.first}–${open.range.last}`} wide onClose={() => setOpen(null)}><StoredDocumentViewer doc={manual} page={open.page} range={open.range} onPageChange={page => setOpen(o => o && { ...o, page })}/></Modal>}
  </div>;
}
