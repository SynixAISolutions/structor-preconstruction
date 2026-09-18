"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Download, Search, X } from "lucide-react";
import { glossary, manualGroups, manualGuides, manualMarkdown, searchManual } from "../../lib/user-manual";
import { downloadText, type Screen } from "./shared";
import "./user-manual.css";

type Props = { open: boolean; onOpen: () => void; onClose: () => void; currentScreen: Screen; onNavigate: (id: string) => void };

export function UserManual({ open, onOpen, onClose, currentScreen, onNavigate }: Props) {
  const [mounted, setMounted] = useState(false);
  const [article, setArticle] = useState<string>(currentScreen);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const reading = useRef<HTMLDivElement>(null);
  const articleHeading = useRef<HTMLHeadingElement>(null);
  const guide = manualGuides.find(g => g.id === article) || manualGuides[0];
  const results = searchManual(query);
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matchingTerms = glossary.filter(t => words.every(word => `${t.name} ${t.meaning}`.toLowerCase().includes(word)));
  const isSearching = words.length > 0;
  const currentTitle = manualGuides.find(g => g.id === currentScreen)?.title;

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    if (open) {
      setArticle(currentScreen);
      setQuery("");
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) dialog.current.close();
  }, [open, mounted, currentScreen]);
  useEffect(() => { reading.current?.scrollTo({ top: 0 }); }, [article, query, open]);

  function select(id: string) {
    setArticle(id);
    setQuery("");
    requestAnimationFrame(() => articleHeading.current?.focus());
  }
  if (!mounted) return null;

  return createPortal(<>
    <button className="manual-launcher" type="button" onClick={onOpen} aria-label="Open website instruction manual" aria-haspopup="dialog" aria-expanded={open} title="About & help · website instruction manual">
      <CircleHelp size={24} aria-hidden="true"/><span>About & help</span>
    </button>
    <dialog ref={dialog} className="manual-dialog" aria-labelledby="manual-title" onCancel={e => { e.preventDefault(); onClose(); }} onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDownCapture={e => e.stopPropagation()}>
      <header className="manual-header">
        <span className="manual-brand-icon"><BookOpen size={22} aria-hidden="true"/></span>
        <div><span className="manual-eyebrow">STRUCTOR · ABOUT & HELP</span><h2 id="manual-title">Your workspace, explained.</h2></div>
        <button className="manual-close" type="button" onClick={onClose} aria-label="Close instruction manual"><X size={21}/></button>
      </header>
      <div className="manual-search-row">
        <label className="manual-search"><Search size={18} aria-hidden="true"/><input autoFocus aria-label="Search the instruction manual" placeholder="Search pages, steps, or terms…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" aria-label="Clear manual search" onClick={() => setQuery("")}><X size={17}/></button>}</label>
        <button className="manual-download" type="button" onClick={() => downloadText("Structor-Website-Instruction-Manual.md", manualMarkdown(), "text/markdown;charset=utf-8")}><Download size={16}/><span>Download manual</span></button>
      </div>
      <div className="manual-body">
        <nav className="manual-nav" aria-label="Instruction manual contents">
          <button className="manual-current" type="button" onClick={() => select(currentScreen)}><CircleHelp size={17}/><span>Help for this page<small>{currentTitle}</small></span></button>
          {manualGroups.map(group => <div className="manual-nav-group" key={group}><h3>{group}</h3>{manualGuides.filter(g => g.group === group).map(g => <button type="button" key={g.id} onClick={() => select(g.id)} aria-current={!isSearching && article === g.id ? "page" : undefined}>{g.title}<ChevronRight size={13}/></button>)}</div>)}
          <button className="manual-glossary-link" type="button" onClick={() => select("glossary")} aria-current={!isSearching && article === "glossary" ? "page" : undefined}><BookOpen size={16}/>Glossary · {glossary.length} terms</button>
        </nav>
        <div className="manual-reading" ref={reading}>
          <label className="manual-mobile-contents">Jump to a guide<select value={article} onChange={e => select(e.target.value)}>{manualGroups.map(group => <optgroup key={group} label={group}>{manualGuides.filter(g => g.group === group).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</optgroup>)}<option value="glossary">Glossary</option></select></label>
          {isSearching ? <section className="manual-results">
            <div className="manual-eyebrow">FIND YOUR ANSWER</div><h2 ref={articleHeading} tabIndex={-1}>Search results</h2>
            <p role="status">{results.length} guides and {matchingTerms.length} terms for “{query.trim()}”</p>
            {!results.length && !matchingTerms.length && <div className="manual-empty"><Search size={26}/><h3>No matching instructions</h3><p>Try a shorter word, such as “bidder”, “PDF”, “email”, “model”, or “save”.</p><button type="button" onClick={() => select("start")}>Start with the basics<ArrowRight size={15}/></button></div>}
            {results.map(g => <button className="manual-result" type="button" key={g.id} onClick={() => select(g.id)}><small>{g.group}</small><strong>{g.title}<ArrowRight size={16}/></strong><span>{g.purpose}</span></button>)}
            {matchingTerms.length > 0 && <><h3>Matching terms</h3><dl className="manual-definitions">{matchingTerms.map(t => <div key={t.name}><dt>{t.name}</dt><dd>{t.meaning}</dd></div>)}</dl></>}
          </section> : article === "glossary" ? <article>
            <div className="manual-eyebrow">CONSTRUCTION, IN PLAIN LANGUAGE</div><h2 ref={articleHeading} tabIndex={-1}>Glossary</h2><p className="manual-lead">What the words and abbreviations mean. Use the search above to find a term and the pages that explain it.</p>
            <dl className="manual-definitions">{glossary.map(t => <div key={t.name}><dt>{t.name}</dt><dd>{t.meaning}</dd></div>)}</dl>
          </article> : <article>
            <div className="manual-eyebrow">{guide.group} <span>/</span> PAGE GUIDE</div><h2 ref={articleHeading} tabIndex={-1}>{guide.title}</h2>
            <p className="manual-lead">{guide.purpose}</p>
            <aside className="manual-reality"><span><Check size={16}/>What works in this version</span><p>{guide.reality}</p></aside>
            <h3>How to use it</h3><ol className="manual-steps">{guide.steps.map((step, index) => <li key={step}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
            <h3>What the words mean</h3><dl className="manual-definitions">{guide.terms.map(t => <div key={t.name}><dt>{t.name}</dt><dd>{t.meaning}</dd></div>)}</dl>
            <aside className="manual-example"><span>A PRACTICAL EXAMPLE</span><p>{guide.example}</p></aside>
            <footer className="manual-article-footer">
              <div><h3>Related guides</h3><div className="manual-related">{guide.related.map(id => <button type="button" key={id} onClick={() => select(id)}>{id === "glossary" ? "Glossary" : manualGuides.find(g => g.id === id)?.title}<ArrowRight size={14}/></button>)}</div></div>
              {guide.group !== "Start here" && guide.group !== "Reference" && <button className="manual-open-page" type="button" onClick={() => { onClose(); onNavigate(guide.id); }}>{guide.id === currentScreen ? "Return to this page" : "Open this page"}<ArrowRight size={16}/></button>}
            </footer>
          </article>}
        </div>
      </div>
      <footer className="manual-bottom"><span>22 page guides · Step-by-step instructions · Plain-language glossary</span><button type="button" onClick={onClose}>Back to workspace<ArrowRight size={14}/></button></footer>
    </dialog>
  </>, document.body);
}
