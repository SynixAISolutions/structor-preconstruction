"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentTemplate, TemplateBlock } from "../../lib/award";
import type { CompanyForm } from "../../lib/contract-files";
import { mapCompanyForm, readFormFile } from "../../lib/company-forms-client";
import { TEMPLATE_FIELDS, type FormKind } from "../../lib/company-forms";
import type { FormParagraph } from "../../lib/docx-text";
import { useLocalDraft } from "../../lib/use-local-draft";
import { AssetLink, AssetUpload } from "./contract-files";
import { Badge, Button, Empty, Panel, PreviewNote } from "./shared";
import "./company-forms.css";

const kinds: TemplateBlock["kind"][] = ["text", "scope", "exclusions", "not-applicable", "clarifications", "alternates", "allowances"];
export function FormText({ text }: { text: string }) {
  return <>{text.split(/(\{[^{}]+\}|\[[^\[\]]+\])/g).map((part, i) => part.startsWith("{") && (TEMPLATE_FIELDS as string[]).includes(part.slice(1, -1)) ? <mark className="cf-field" key={i}>{part}</mark> : part.startsWith("[") || part.startsWith("{") ? <mark className="cf-gap" key={i}>{part} · Needs a value</mark> : part)}</>;
}
export function FormLayout({ template }: { template: DocumentTemplate }) {
  return <article className="cf-paper"><h3><FormText text={template.layout?.title ?? template.name}/></h3>{template.layout?.blocks.map((block, i) => <section key={i}><h4><FormText text={block.heading}/></h4>{block.kind === "text" ? <>{block.lines.map((line, n) => <p key={n}><FormText text={`${block.numbered ? `${n + 1}. ` : ""}${line}`}/></p>)}</> : <>{block.kind === "scope" && block.intro && <p><FormText text={block.intro}/></p>}<div className="cf-slot">{block.kind.replaceAll("-", " ")} slot · Filled from the awarded bid</div>{block.kind === "scope" && block.append?.map((line, n) => <p key={n}><FormText text={line}/></p>)}</>}</section>)}</article>;
}
export function changeFormBlock(block: TemplateBlock, kind: TemplateBlock["kind"]): TemplateBlock {
  if (block.kind === kind) return block;
  return kind === "text" ? { kind, heading: block.heading, lines: block.kind === "scope" ? [block.intro, ...(block.append ?? [])].filter((s): s is string => !!s) : [] } : kind === "scope" ? { kind, heading: block.heading, ...(block.kind === "text" && block.lines.length ? { append: block.lines } : {}) } : { kind, heading: block.heading };
}

export function CompanyForms({ notify }: { notify: (message: string) => void }) {
  const [company, setCompany] = useLocalDraft<CompanyForm>("company-form", { name: "General contractor" });
  const [kind, setKind] = useState<FormKind>("exhibit-a"), [draft, setDraft] = useState<DocumentTemplate | null>(null);
  const [paragraphs, setParagraphs] = useState<FormParagraph[]>([]), [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [fileName, setFileName] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const saved = kind === "exhibit-a" ? company.exhibitTemplate : company.subcontractTemplate;
  function updateBlock(index: number, value: TemplateBlock) { setDraft(current => current?.layout ? { ...current, layout: { ...current.layout, blocks: current.layout.blocks.map((b, i) => i === index ? value : b) } } : current); }
  async function read(file?: File) {
    if (!file) return;
    if (!/\.(docx|pdf)$/i.test(file.name) || file.size > 3_000_000) { setError("Choose a Word (.docx) or PDF form of at most 3 MB."); return; }
    const control = new AbortController(); abort.current = control;
    setBusy(true); setError(""); setDraft(null); setParagraphs([]); setWarnings([]); setFileName(file.name);
    try {
      const [original, mapped] = await Promise.all([readFormFile(file), mapCompanyForm(file, kind, control.signal)]);
      if (control.signal.aborted) return;
      setParagraphs(original); setDraft(mapped.template); setWarnings(mapped.warnings);
    } catch (failure) { if (!control.signal.aborted) setError(failure instanceof Error ? failure.message : "The form could not be read."); }
    finally { if (abort.current === control) { setBusy(false); abort.current = null; } }
  }
  function save() {
    if (!draft?.layout || !draft.layout.title.trim() || !draft.layout.blocks.length) { setError("Keep a title and at least one section before saving."); return; }
    const unnamed = draft.layout.blocks.flatMap((block, i) => block.heading.trim() ? [] : [i + 1]);
    if (unnamed.length) { setError(`Add headings for sections ${unnamed.join(", ")} below before using this form.`); return; }
    if (kind === "exhibit-a" && !draft.layout.blocks.some(b => b.kind === "scope")) { setError("Exhibit A needs a scope slot for the awarded work."); return; }
    setCompany(current => ({ ...current, [kind === "exhibit-a" ? "exhibitTemplate" : "subcontractTemplate"]: structuredClone(draft) }));
    setError(""); notify(`${kind === "exhibit-a" ? "Exhibit A" : "Subcontract"} form saved for new contracts.`);
  }
  return <div className="cf-view"><Panel title="Company forms" subtitle="Company defaults in this browser · New awards and agreements use the saved form.">
    <div className="ui-form-grid"><label className="ui-field">Company legal name<input value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}/></label><div><AssetUpload label="Company logo" accept="image/png,image/jpeg" onSave={logo => setCompany(c => ({ ...c, logo }))}/><AssetLink asset={company.logo}/></div></div>
    <AssetUpload label="Original company agreement attachment" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onSave={form => setCompany(c => ({ ...c, form }))}/><AssetLink asset={company.form}/>
    <PreviewNote>Review the mapped wording and highlighted fields before using the form. Existing awards and sent packages keep their saved templates and files.</PreviewNote>
    <label className="ui-field">Form type<select disabled={busy} value={kind} onChange={e => { setKind(e.target.value as FormKind); setDraft(null); setParagraphs([]); setWarnings([]); setError(""); setFileName(""); }}><option value="exhibit-a">Exhibit A</option><option value="subcontract">Subcontract</option></select></label>
    <p>Current default: <strong>{saved ? `${saved.name} · ${saved.version}` : "Built-in template"}</strong></p>
    {saved && <div className="cf-actions"><Button disabled={busy} onClick={() => { setDraft(structuredClone(saved)); setParagraphs([]); setWarnings([]); setFileName(saved.name); setError(""); }}>Review saved form</Button><Button disabled={busy} onClick={() => { setCompany(c => { const next = { ...c }; delete next[kind === "exhibit-a" ? "exhibitTemplate" : "subcontractTemplate"]; return next; }); setDraft(null); notify("Built-in template restored for new contracts."); }}>Remove saved form</Button></div>}
    <label className="ui-field">Upload company form · Word or PDF<input disabled={busy} type="file" accept=".docx,.pdf" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void read(file); }}/></label>
    {busy && <div className="cf-actions" role="status">Reading and mapping {fileName}…<Button onClick={() => abort.current?.abort()}>Stop mapping</Button></div>}
    {error && <p role="alert">{error}</p>}{warnings.length > 0 && <div className="cf-warnings" role="status">{warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div>}
  </Panel>
  {draft?.layout ? <><div className="cf-columns"><Panel title="Original form" subtitle={`${paragraphs.length || "Saved template; original"} paragraphs${paragraphs.length ? ` · ${fileName}` : " not retained in this browser"}`}><div className="cf-original">{paragraphs.length ? paragraphs.map((p, i) => <p key={i}><small>{i + 1}{p.numbered ? " · Numbered" : ""}{p.style ? ` · ${p.style}` : ""}</small>{p.text}</p>) : <p>Upload the original file again to compare its paragraphs.</p>}</div></Panel><Panel title="Mapped template" subtitle={`${draft.layout.blocks.length} sections · Blue fields are filled from the award; yellow gaps need attention.`}><FormLayout template={draft}/></Panel></div>
    <Panel title="Edit mapped form" subtitle="Renaming and editing change your template. Changing a section kind replaces its body with the selected award slot.">
      <label className="ui-field">Document title<input value={draft.layout.title} onChange={e => setDraft({ ...draft, layout: { ...draft.layout!, title: e.target.value } })}/></label>
      <details><summary>Available fields</summary><p>{TEMPLATE_FIELDS.map(field => `{${field}}`).join(" · ")}</p></details>
      {draft.layout.blocks.map((block, i) => <div className="cf-block-edit" key={i}><div className="ui-form-grid"><label className="ui-field">Section {i + 1} heading<input value={block.heading} onChange={e => updateBlock(i, { ...block, heading: e.target.value })}/></label><label className="ui-field">Section {i + 1} kind<select value={block.kind} onChange={e => updateBlock(i, changeFormBlock(block, e.target.value as TemplateBlock["kind"]))}>{kinds.map(kind => <option key={kind} value={kind}>{kind.replaceAll("-", " ")}</option>)}</select></label></div>{block.kind === "text" && <><label className="ui-field">Section {i + 1} text · One paragraph per line<textarea rows={Math.min(8, Math.max(2, block.lines.length))} value={block.lines.join("\n")} onChange={e => updateBlock(i, { ...block, lines: e.target.value.split("\n") })}/></label><label><input type="checkbox" checked={!!block.numbered} onChange={e => updateBlock(i, { ...block, numbered: e.target.checked })}/>Number paragraphs</label></>}{block.kind === "scope" && <label className="ui-field">Section {i + 1} scope introduction<textarea value={block.intro ?? ""} onChange={e => updateBlock(i, { ...block, intro: e.target.value })}/></label>}<Button onClick={() => setDraft({ ...draft, layout: { ...draft.layout!, blocks: draft.layout!.blocks.filter((_, n) => n !== i) } })}>Delete section {i + 1}</Button></div>)}
      <div className="cf-actions"><Button variant="primary" onClick={save}>Use for new contracts</Button><Badge tone="amber">Draft mapping · Review before sending</Badge></div>
    </Panel></> : !busy && <Panel><Empty title="Upload your company form" description="Compare the original with its mapped sections, edit the fields, then use it for new contracts."/></Panel>}
  </div>;
}
