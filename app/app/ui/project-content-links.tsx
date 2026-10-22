"use client";

import { useState } from "react";
import { FileText, Link2, Unlink } from "lucide-react";
import { LINK_KINDS, linkedTo, type ContentLink, type ContentLinkKind, type ContentOp, type ContentTarget, type ProjectContent } from "../../lib/project-content";
import { useProjectContent } from "../../lib/project-content-client";
import { useProjectDocuments } from "../../lib/project-files-client";
import { useActiveProject } from "../../lib/project-scope";
import { useProcurement } from "../../lib/use-procurement";
import { packageStatus } from "../../lib/procurement";
import { useStructorCheck } from "../../lib/use-structor-check";
import { useValueEngineering } from "../../lib/use-value-engineering";
import { useClarifications } from "../../lib/clarifications-client";
import { revisionLabel } from "../../lib/project-files";
import { Button, Empty, SearchBox } from "./shared";
import { ContentViewer, type ContentLocation } from "./content-viewer";
import "./project-content.css";

export const CONTENT_ACTOR = "Marcel Khoury";
export type ContentRecord = ContentLink & { status: string };
export type SaveContent = (ops: ContentOp[]) => Promise<ProjectContent | null>;

export function useContentRecords() {
  const projectId = useActiveProject();
  const { state: procurement } = useProcurement();
  const { state: check } = useStructorCheck();
  const { state: ve } = useValueEngineering();
  const { requests, error, loading } = useClarifications(projectId);
  const records: ContentRecord[] = [
    ...check.issues.map(r => ({ kind: "issue" as const, id: r.id, label: `${r.number} · ${r.title}`, status: r.status })),
    ...check.rfis.map(r => ({ kind: "rfi" as const, id: r.id, label: `${r.number} · ${r.subject}`, status: r.status })),
    ...procurement.packages.map(r => ({ kind: "package" as const, id: r.id, label: `${r.code} · ${r.name}`, status: packageStatus(procurement, r.id) })),
    ...requests.filter(r => r.projectId === projectId).map(r => ({ kind: "clarification" as const, id: r.id, label: `${r.trade} · ${r.bidder}`, status: r.status })),
    ...ve.ideas.map(r => ({ kind: "ve" as const, id: r.id, label: `${r.number} · ${r.description}`, status: r.status })),
  ];
  return { records, error, loading };
}

export function ContentLinks({ links, target, save, records, disabled = false, onLocate }: { links: ContentLink[]; target?: ContentTarget; save?: SaveContent; records: ContentRecord[]; disabled?: boolean; onLocate?: (link: ContentLink) => void }) {
  const [picker, setPicker] = useState(false);
  const [kind, setKind] = useState<ContentLinkKind>("package");
  const [query, setQuery] = useState("");
  const [pendingUnlink, setPendingUnlink] = useState<ContentLink | null>(null);
  const options = records.filter(r => r.kind === kind && r.label.toLowerCase().includes(query.toLowerCase()) && !links.some(l => l.kind === r.kind && l.id === r.id));
  return <div className="cm-links">
    {LINK_KINDS.map(group => {
      const grouped = links.filter(l => l.kind === group.kind);
      return <section key={group.kind} className="cm-link-group"><h4>{group.label}<span>{grouped.length}</span></h4>
        {!grouped.length && <p className="cm-muted">No linked records</p>}
        {grouped.map(link => {
          const live = records.find(r => r.kind === link.kind && r.id === link.id);
          const confirming = pendingUnlink?.kind === link.kind && pendingUnlink.id === link.id;
          return <article key={link.id} className="cm-linked-record"><div>{onLocate ? <button className="cm-text-button" onClick={() => onLocate(link)}>{live?.label || link.label || link.id}</button> : <strong>{live?.label || link.label || link.id}</strong>}<small>{live ? live.status.replaceAll("-", " ") : "Saved reference · record unavailable"}</small></div>
            {target && save && (confirming ? <span className="cm-actions"><Button disabled={disabled} variant="danger" onClick={async () => { if (await save([{ op: "unlink", target, kind: link.kind, id: link.id }])) setPendingUnlink(null); }}>Unlink</Button><Button onClick={() => setPendingUnlink(null)}>Keep link</Button></span> : <button className="ui-icon-btn" aria-label={`Unlink ${live?.label || link.label}`} disabled={disabled} onClick={() => setPendingUnlink(link)}><Unlink size={15}/></button>)}
          </article>;
        })}
      </section>;
    })}
    {target && save && <Button disabled={disabled} onClick={() => setPicker(true)}><Link2 size={15}/>Link record</Button>}
    {picker && target && save && <section className="cm-inline-picker" aria-label="Link a project record"><h3>Link a project record</h3><p className="cm-muted">{"series" in target ? "Attach this file across all revisions." : "Attach this markup to the decision it supports."}</p><Button onClick={() => setPicker(false)}>Close picker</Button>
      <label className="ui-field">Record kind<select aria-label="Record kind" value={kind} onChange={e => setKind(e.target.value as ContentLinkKind)}>{LINK_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select></label>
      <SearchBox value={query} onChange={setQuery} placeholder="Search records"/>
      <div className="cm-record-options">{options.map(record => <button className="cm-record-option" disabled={disabled} key={record.id} onClick={async () => { if (await save([{ op: "link", target, link: { kind: record.kind, id: record.id, label: record.label } }])) setPicker(false); }}><Link2 size={16}/><span><strong>{record.label}</strong><small>{record.status.replaceAll("-", " ")}</small></span><span>Link</span></button>)}</div>
      {!options.length && <Empty title="No records to link" description="Try another kind or search. Records already attached are excluded."/>}
    </section>}
  </div>;
}

export function LinkedProjectContent({ kind, recordId }: { kind: ContentLinkKind; recordId: string }) {
  const { content, ready } = useProjectContent();
  const { documents, ready: filesReady } = useProjectDocuments();
  const [location, setLocation] = useState<ContentLocation | null>(null);
  const linked = linkedTo(content, documents, kind, recordId);
  return <section className="cm-record-files" aria-label="Files and markups"><h3><FileText size={16}/>Files and markups <span>{linked.files.length + linked.markups.length}</span></h3>
    {!ready || !filesReady ? <p role="status">Loading linked files…</p> : !linked.files.length && !linked.markups.length ? <p className="cm-muted">No files or markups attached. Link them from Project files or the content viewer.</p> : <div className="cm-record-file-list">
      {linked.files.map(doc => <button key={doc.id} onClick={() => setLocation({ docId: doc.id, page: 1 })}><FileText size={16}/><span>{doc.name}<small>{revisionLabel(doc)} · File</small></span></button>)}
      {linked.markups.map(markup => { const doc = documents.find(d => d.id === markup.docId)!; return <button key={markup.id} onClick={() => setLocation({ docId: doc.id, page: markup.page, markupId: markup.id })}><span className={`cm-number cm-color-${markup.color}`}>↗</span><span>{markup.title}<small>{doc.name} · {revisionLabel(doc)} · Page {markup.page} · {markup.status}</small></span></button>; })}
    </div>}
    {location && <ContentViewer key={location.docId} initial={location} documents={documents} backLabel="Back to record" onClose={() => setLocation(null)}/>}
  </section>;
}
