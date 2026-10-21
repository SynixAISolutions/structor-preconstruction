"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Copy, Download, Printer } from "lucide-react";
import { basisOfEstimate, type BasisSection } from "../../lib/basis-of-estimate";
import type { BudgetState } from "../../lib/budget";
import type { StoredDocument } from "../../lib/project-files";
import { useProjectDocuments } from "../../lib/project-files-client";
import type { SetupState } from "../../lib/project-setup";
import type { Project } from "../../lib/projects";
import { useProjectSetup } from "../../lib/use-project-setup";
import { Button, PageHeader, downloadText, type ViewProps } from "./shared";
import "./basis-of-estimate.css";

export function BasisDocument({ projectName, date, sections }: { projectName: string; date: string; sections: BasisSection[] }) {
  return <article className="boe-document" aria-label={`Basis of estimate for ${projectName}`}>
    <header><p className="boe-kicker">BASIS OF ESTIMATE</p><h2>{projectName}</h2><p>Prepared <time dateTime={date}>{date}</time></p></header>
    {sections.map(section => <section key={section.heading}><h3>{section.heading}</h3><ul>{section.lines.map((line, index) => <li key={index}>{line}</li>)}</ul></section>)}
  </article>;
}

export function BasisOfEstimatePreview({ project, budget, documents, setup, ready, navigate, onBack }: {
  project: Project; budget: BudgetState; documents: StoredDocument[]; setup: SetupState;
  ready: boolean; navigate: ViewProps["navigate"]; onBack: () => void;
}) {
  const heading = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const today = new Date();
    setDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    heading.current?.focus();
  }, []);
  // No project-level not-carried decision is exposed yet; bidder exclusions alone are not that decision.
  const estimate = basisOfEstimate({ project, documents, budget, setup });
  const noBudget = budget.lines.length === 0;
  const noDocuments = documents.length === 0;
  const empty = noBudget && noDocuments && budget.allowances.length === 0;
  const canExport = ready && !empty;
  async function copy() {
    try { await navigator.clipboard.writeText(estimate.markdown); setMessage("Basis of estimate copied."); }
    catch { setMessage("Copy could not access the clipboard. Use Download .md to save the text."); }
  }
  const document = <BasisDocument projectName={project.name} date={date} sections={estimate.sections}/>;
  return <div className="cm-view boe-view">
    <div className="boe-toolbar"><Button onClick={onBack}><ArrowLeft size={16}/>Back to Budget summary</Button></div>
    <div ref={heading} tabIndex={-1} className="boe-heading"><PageHeader eyebrow="ESTIMATE DOCUMENT" title="Basis of estimate" description="What the estimate includes and assumes, assembled from this project's records." actions={<>
      <Button disabled={!canExport} onClick={() => void copy()}><Copy size={16}/>Copy as text</Button>
      <Button disabled={!canExport} onClick={() => { downloadText(`basis-of-estimate-${project.id}.md`, estimate.markdown, "text/markdown;charset=utf-8"); setMessage("Basis of estimate downloaded."); }}><Download size={16}/>Download .md</Button>
      <Button disabled={!canExport} onClick={() => window.print()}><Printer size={16}/>Print</Button>
    </>}/></div>
    <p className="boe-feedback" role="status">{message}</p>
    {!ready ? <p role="status">Loading project documents…</p> : <>
      {(noBudget || noDocuments) && <section className="boe-missing" aria-label="Missing project information">
        <h2>{empty ? "Build this project's basis of estimate" : "This estimate has missing information"}</h2>
        <p>{empty ? "Add budget lines and project documents to assemble the document." : "Review the missing records before sharing this document."}</p>
        {noBudget && <p>No budget lines recorded. Cost totals remain $0 until a budget is entered.</p>}
        {noDocuments && <p>No project documents recorded. Add drawings, a project manual or addenda to establish the document basis.</p>}
        <div className="boe-actions">{noBudget && <Button onClick={onBack}>Open Budget summary</Button>}{noDocuments && <Button onClick={() => navigate("documents")}>Open Project files</Button>}</div>
      </section>}
      {!empty && <>
        <aside className="boe-review"><p>Review before sharing. This preview follows the budget, allowances, project files and saved setup decisions in this browser.</p><div className="boe-actions"><Button onClick={() => navigate("allowances")}>Review Allowances</Button><Button onClick={() => navigate("setup")}>Review Project setup</Button></div></aside>
        {document}
        {typeof window !== "undefined" && createPortal(<div className="boe-print">{document}</div>, window.document.body)}
      </>}
    </>}
  </div>;
}

export function BasisOfEstimateView({ project, budget, navigate, onBack }: { project: Project; budget: BudgetState; navigate: ViewProps["navigate"]; onBack: () => void }) {
  const { documents, ready } = useProjectDocuments(project.id);
  const { state: setup } = useProjectSetup(project);
  return <BasisOfEstimatePreview key={project.id} project={project} budget={budget} documents={documents} setup={setup} ready={ready} navigate={navigate} onBack={onBack}/>;
}
