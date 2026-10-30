"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { ArrowRight, BookOpen, FilePlus2, FileStack, GitBranchPlus, Map as MapIcon, Sparkles } from "lucide-react";
import { RUNS_KEY } from "../../lib/auto-scopes";
import { NO_RUNS, runFiles, runSummary, type SavedRuns } from "../../lib/auto-scope-plan";
import { bidDocuments, type BidVolume } from "../../lib/bid-documents";
import { displayDate } from "../../lib/format";
import { revisionLabel, type StoredDocument } from "../../lib/project-files";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Button, Panel, type Screen } from "./shared";

/** What a slot uploads: the drawing sets, the project manual, or something issued later. */
export type BidUpload = "drawings" | "specifications" | "revised-drawings" | "addendum";

/**
 * The bid documents at the top of Project files (Danial, 27 Oct: "a separate section" for the drawings and
 * specifications a project starts with): one slot for the drawing volumes, one for the project-manual volumes,
 * one for what is issued later. Uploading starts the AI on them; its progress shows at the bottom of the page and
 * its result in the notifications.
 */
export function BidDocumentsPanel({ documents, ready, busy, onUpload, onOpen, onRevision, navigate }: {
  documents: StoredDocument[]; ready: boolean; busy: boolean;
  onUpload: (what: BidUpload, files?: File[]) => void; onOpen: (doc: StoredDocument) => void; onRevision: (doc: StoredDocument) => void; navigate: (screen: Screen) => void;
}) {
  const { drawings, manual, later } = bidDocuments(documents);
  const [saved] = useLocalDraft<SavedRuns>(RUNS_KEY, NO_RUNS);
  const run = saved.runs[0];
  const empty = !drawings.length && !manual.length;
  return <Panel className="bid-docs" title="Bid documents" subtitle="The drawings and project manual the bid is based on: upload every volume here at the start. The AI reads them as they arrive and writes the bid packages and their scope items.">
    <div className="bid-docs-slots">
      <Slot icon={<MapIcon size={17}/>} title="Drawings" hint="Every drawing volume: Vol 1, Vol 2…" what="drawings" busy={busy} onUpload={onUpload} action="Add drawings">
        {drawings.map(v => <Volume key={v.doc.id} volume={v} detail={`${v.doc.pageCount} pages · ${v.sheets} sheets`} onOpen={onOpen} onRevision={onRevision}/>)}
      </Slot>
      <Slot icon={<BookOpen size={17}/>} title="Project manual" hint="The specifications, every volume" what="specifications" busy={busy} onUpload={onUpload} action="Add specifications">
        {manual.map(v => <Volume key={v.doc.id} volume={v} detail={`${v.doc.pageCount} pages · ${v.sections} sections`} onOpen={onOpen} onRevision={onRevision}/>)}
      </Slot>
      <Slot icon={<FileStack size={17}/>} title="Addenda & revisions" hint="Issued after the bid documents" what="revised-drawings" busy={busy || empty} onUpload={onUpload} action="Revised drawings" extra={<Button disabled={busy} onClick={() => onUpload("addendum")}><FilePlus2 size={14}/>Addendum</Button>}>
        {later.map(l => <div key={l.doc.id} className="bid-docs-file"><button type="button" onClick={() => onOpen(l.doc)}><strong>{l.doc.name}</strong><small>{l.what} · {displayDate(l.doc.uploadedAt.slice(0, 10))}</small></button></div>)}
      </Slot>
    </div>
    <p className="bid-docs-ai" role="status"><Sparkles size={14}/>{!ready ? "Looking for the project's files…"
      : run ? <>{run.status === "running" ? `The AI is reading ${runFiles(run)} now. Its progress shows at the bottom of the page.` : `The AI read ${runFiles(run)}: ${runSummary(run)}.`}<button type="button" className="bid-docs-link" onClick={() => navigate("scopes")}>Open the scopes<ArrowRight size={13}/></button></>
      : empty ? "Upload the drawings and the project manual: the AI starts reading as soon as they are stored, and lets you know when the scopes are ready."
      : <>New drawings and specifications are read by the AI as soon as they are uploaded.<button type="button" className="bid-docs-link" onClick={() => navigate("scopes")}>Open the scopes<ArrowRight size={13}/></button></>}</p>
  </Panel>;
}

function Slot({ icon, title, hint, what, busy, onUpload, action, extra, children }: { icon: ReactNode; title: string; hint: string; what: BidUpload; busy: boolean; onUpload: (what: BidUpload, files?: File[]) => void; action: string; extra?: ReactNode; children: ReactNode[] }) {
  const [over, setOver] = useState(false);
  const files = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return <section className={`bid-docs-slot${over ? " over" : ""}`} aria-label={title}
    onDragOver={e => { if (busy || !files(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
    onDrop={e => { if (!files(e)) return; e.preventDefault(); e.stopPropagation(); setOver(false); if (!busy) onUpload(what, Array.from(e.dataTransfer.files)); }}>
    <header><span className="bid-docs-icon">{icon}</span><span><strong>{title}</strong><small>{hint}</small></span></header>
    <div className="bid-docs-files">{children.length ? children : <p className="bid-docs-none">{over ? "Drop to upload here" : "None yet. Drop PDFs here."}</p>}</div>
    <div className="bid-docs-actions"><Button disabled={busy} onClick={() => onUpload(what)}><FilePlus2 size={14}/>{action}</Button>{extra}</div>
  </section>;
}

function Volume({ volume, detail, onOpen, onRevision }: { volume: BidVolume; detail: string; onOpen: (doc: StoredDocument) => void; onRevision: (doc: StoredDocument) => void }) {
  const { doc } = volume;
  return <div className="bid-docs-file">
    <button type="button" onClick={() => onOpen(doc)}><strong>{doc.name}</strong><small>{detail} · {revisionLabel(doc)}{volume.revisions > 1 ? ` of ${volume.revisions}` : ""}</small></button>
    <button type="button" className="ui-icon-btn" aria-label={`Upload a new revision of ${doc.name}`} title="Upload a new revision" onClick={() => onRevision(doc)}><GitBranchPlus size={15}/></button>
  </div>;
}
