"use client";

import { useEffect, useState } from "react";
import { LocateFixed } from "lucide-react";
import type { ScopeItem } from "../../lib/procurement";
import { readStoredText } from "../../lib/project-files-client";
import { findParagraph, type Evidence } from "../../lib/scope-evidence";
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
      const evidence = evidenceOf(item), quote = evidence.find(e => e.quote)?.quote;
      return <li key={item.id}><b>{String(n + 1).padStart(2, "0")}</b><div>
        <strong>{item.title}</strong>
        {quote && <q>{quote}</q>}
        <span className="pkg-source-chips">{evidence.length ? evidence.map((e, index) => <button key={e.key} type="button" className="pkg-source-chip" title={e.quote ? `${e.documentName}, page ${e.page}: “${e.quote}”` : `${e.documentName}, page ${e.page}`} onClick={() => setOpen({ item, index })}><LocateFixed size={12}/>{e.label}</button>) : <small>{item.source || "No source linked"}</small>}</span>
      </div></li>;
    })}</ol>
    {open && <Modal title="Where this scope comes from" subtitle={open.item.title} wide onClose={() => setOpen(null)}>
      <SourceView key={open.index} evidence={evidenceOf(open.item)} index={open.index} onIndex={index => setOpen({ ...open, index })}/>
    </Modal>}
  </>;
}

function SourceView({ evidence, index, onIndex }: { evidence: Evidence[]; index: number; onIndex: (index: number) => void }) {
  const source = evidence[index];
  const [page, setPage] = useState(source?.page ?? 1);
  const [quote, setQuote] = useState(source?.quote ?? null);
  // A specification paragraph: find the page it starts on, then highlight its opening words there.
  useEffect(() => {
    if (!source?.doc || !source.paragraph) return;
    let live = true;
    readStoredText(source.doc, source.paragraph.pages).then(pages => {
      const found = live ? findParagraph(pages, source.paragraph!.label) : null;
      if (found) { setPage(found.page); setQuote(found.quote); }
    }, () => {});
    return () => { live = false; };
  }, [source?.key, source?.doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!source) return null;
  return <div className="pkg-source-view">
    {evidence.length > 1 && <div className="pkg-source-chips" role="tablist">{evidence.map((e, i) => <button key={e.key} type="button" role="tab" aria-selected={i === index} className={`pkg-source-chip${i === index ? " active" : ""}`} onClick={() => onIndex(i)}><LocateFixed size={12}/>{e.label}</button>)}</div>}
    {source.doc
      ? <StoredDocumentViewer doc={source.doc} page={page} onPageChange={setPage} highlight={quote ?? undefined} outline={source.outline ?? undefined} markPage={source.page}/>
      : <Empty title="This file isn't in Project files" description={`Upload ${source.documentName} to Project files to open page ${source.page} here.${source.quote ? ` Look for: “${source.quote}”` : ""}`}/>}
  </div>;
}
