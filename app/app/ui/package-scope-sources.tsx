"use client";

import { useEffect, useState } from "react";
import { BookOpen, LocateFixed, Map as MapIcon } from "lucide-react";
import type { ScopeItem } from "../../lib/procurement";
import { readStoredText } from "../../lib/project-files-client";
import { findParagraph, onDrawing, type Evidence } from "../../lib/scope-evidence";
import { useScopeEvidence } from "../../lib/use-scope-evidence";
import { StoredDocumentViewer } from "./project-file-viewer";
import { Empty, Modal } from "./shared";

/** A bid package's items and where each came from; a source opens the document on its words, highlighted. */
export function PackageScopeSources({ items }: { items: ScopeItem[] }) {
  const evidenceOf = useScopeEvidence();
  const [open, setOpen] = useState<{ item: ScopeItem; index: number } | null>(null);
  if (!items.length) return <Empty title="No scope items yet" description="This package's bid form has no items. Write or add scopes in Scopes & bid forms."/>;
  return <>
    <ol className="pkg-scope-sources">{items.map((item, n) => {
      const evidence = evidenceOf(item), quote = evidence.find(e => e.quotes.length)?.quotes[0];
      return <li key={item.id}><b>{String(n + 1).padStart(2, "0")}</b><div>
        <strong>{item.title}</strong>
        {quote && <q>{quote}</q>}
        <span className="pkg-source-chips">{evidence.length ? evidence.map((e, index) => <button key={e.key} type="button" className="pkg-source-chip" title={`${e.documentName}, page ${e.page}${e.quotes.length ? `: ${e.quotes.map(q => `“${q}”`).join(" · ")}` : ""}`} onClick={() => setOpen({ item, index })}><LocateFixed size={12}/>{e.label}</button>) : <small>{item.source || "No source linked"}</small>}</span>
      </div></li>;
    })}</ol>
    {open && <ScopeSourceModal title={open.item.title} evidence={evidenceOf(open.item)} index={open.index} onClose={() => setOpen(null)}/>}
  </>;
}

/** "Where this scope comes from": the item's sources, open on `index`; the others are a click away. */
export function ScopeSourceModal({ title, evidence, index = 0, onClose }: { title: string; evidence: Evidence[]; index?: number; onClose: () => void }) {
  const [shown, setShown] = useState(index);
  return <Modal title="Where this scope comes from" subtitle={title} wide onClose={onClose}>
    <SourceView key={shown} evidence={evidence} index={shown} onIndex={setShown}/>
  </Modal>;
}

/**
 * The button a scope item opens its source with (Danial, 27 Oct: "if clicked on open drawing, it should open that
 * drawing"): its drawing when it has one, else its specification or other file. Nothing when it has no source.
 */
export function OpenSourceButton({ evidence, onOpen }: { evidence: Evidence[]; onOpen: (index: number) => void }) {
  if (!evidence.length) return null;
  const drawing = evidence.findIndex(onDrawing), index = Math.max(0, drawing), source = evidence[index];
  const label = drawing >= 0 ? "Open drawing" : source.kind === "section" || source.doc?.kind === "manual" ? "Open spec" : "Open source";
  return <button type="button" className="scope-open-source" aria-label={`${label}: ${source.label}`} title={`${source.label}${source.quotes.length ? `: ${source.quotes.map(q => `“${q}”`).join(" · ")}` : ""}`} onClick={() => onOpen(index)}>
    {drawing >= 0 ? <MapIcon size={13}/> : <BookOpen size={13}/>}<span>{label}</span>
  </button>;
}

function SourceView({ evidence, index, onIndex }: { evidence: Evidence[]; index: number; onIndex: (index: number) => void }) {
  const source = evidence[index];
  const [page, setPage] = useState(source?.page ?? 1);
  const [quotes, setQuotes] = useState(source?.quotes ?? []);
  // A specification paragraph: find the page it starts on, then highlight its opening words there.
  useEffect(() => {
    if (!source?.doc || !source.paragraph) return;
    let live = true;
    readStoredText(source.doc, source.paragraph.pages).then(pages => {
      const found = live ? findParagraph(pages, source.paragraph!.label) : null;
      if (found) { setPage(found.page); setQuotes([found.quote]); }
    }, () => {});
    return () => { live = false; };
  }, [source?.key, source?.doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!source) return null;
  return <div className="pkg-source-view">
    {evidence.length > 1 && <div className="pkg-source-chips" role="tablist">{evidence.map((e, i) => <button key={e.key} type="button" role="tab" aria-selected={i === index} className={`pkg-source-chip${i === index ? " active" : ""}`} onClick={() => onIndex(i)}><LocateFixed size={12}/>{e.label}</button>)}</div>}
    {source.doc
      ? <StoredDocumentViewer doc={source.doc} page={page} onPageChange={setPage} highlight={quotes} readImage={source.fromImage} outline={source.outline ?? undefined} markPage={source.page}/>
      : source.missing === "section"
        ? <Empty title="This section isn't in the project manual" description={`${source.label.split(" · ")[0]} isn't one of the sections in ${source.documentName}. Check the reference on this scope item.`}/>
        : <Empty title="This file isn't in Project files" description={`Upload ${source.documentName} to Project files to open page ${source.page} here.${source.quotes.length ? ` Look for: ${source.quotes.map(q => `“${q}”`).join(" · ")}` : ""}`}/>}
  </div>;
}
