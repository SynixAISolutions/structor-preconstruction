"use client";
import { useEffect, useState } from "react";
import { Button, Modal, Panel, Badge, downloadText } from "./shared";
import { useLocalDraft } from "../../lib/use-local-draft";
import { EXHIBITS, EMPTY_CONTRACT_FILES, documentRegister, type CompanyForm, type ContractFiles } from "../../lib/contract-files";
import { assetUrl, uploadDocument, type DocumentAsset } from "../../lib/document-assets";
import { DEFAULT_EXHIBIT_TEMPLATE, generateSampleExhibit, latestExhibit, renderDocumentText, type Award, type DocumentContent } from "../../lib/award";
import type { ContractScopeOutput } from "../../lib/contract-scope-ai";
import { useProjectDocuments } from "../../lib/project-files-client";
import { drawingRegister, latestDocuments } from "../../lib/project-files";

export function AssetLink({ asset }: { asset?: DocumentAsset }) { return asset ? <a href={assetUrl(asset)} target="_blank" rel="noreferrer">{asset.name}</a> : <span>Not uploaded</span>; }
export function AssetUpload({ label, accept = "application/pdf", onSave }: { label: string; accept?: string; onSave: (asset: DocumentAsset) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <label className="ui-field"><span>{label} · up to 3 MB</span><input type="file" accept={accept} disabled={busy} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setBusy(true); setError(""); try { if (!accept.split(",").includes(file.type)) throw new Error("Choose the requested file type."); onSave(await uploadDocument(file)); } catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); } finally { setBusy(false); } }}/>{busy && <small role="status">Saving private file…</small>}{error && <small role="alert">{error}</small>}</label>;
}
export function CompanyFormSettings() {
  const [company, setCompany] = useLocalDraft<CompanyForm>("company-form", { name: "General contractor" });
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Company form & logo</Button>{open && <Modal title="Company form & logo" subtitle="New contract packages copy these settings. Sent contracts keep their saved files." onClose={() => setOpen(false)}><label className="ui-field"><span>Company legal name</span><input value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}/></label><AssetUpload label="Company logo" accept="image/png,image/jpeg" onSave={logo => setCompany(c => ({ ...c, logo }))}/><AssetLink asset={company.logo}/><AssetUpload label="Company agreement form" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onSave={form => setCompany(c => ({ ...c, form }))}/><AssetLink asset={company.form}/><p>The original company form accompanies the generated agreement and exhibits.</p><Button onClick={() => setOpen(false)}>Done</Button></Modal>}</>;
}
export function OtherExhibits({ award, save }: { award: Award; save: (files: ContractFiles) => void }) {
  const [company] = useLocalDraft<CompanyForm>("company-form", { name: "General contractor" });
  const { documents, ready } = useProjectDocuments();
  const drawings = drawingRegister(documents).map(r => ({ id:r.sheet, title:r.title, date:r.date, revision:`V${r.doc.revision}` }));
  const specs = latestDocuments(documents).filter(d=>d.kind==="manual").flatMap(d=>d.sections.map(s=>({id:s.section,title:`${s.title} · ${d.name}, pages ${s.first}–${s.last}; registered ${d.uploadedAt.slice(0,10)}`,date:"",revision:`V${d.revision}`})));
  const reports = latestDocuments(documents).filter(d=>d.kind==="other").map(d=>({name:`${d.name} · registered ${d.uploadedAt.slice(0,10)}`,date:"",revision:`V${d.revision}`}));
  const [defaults, setDefaults] = useState<{ form?: DocumentAsset; shell?: DocumentAsset }>({});
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/contract-assets").then(async r => { if (!r.ok) throw new Error("Original forms are unavailable. Upload your company form below."); setDefaults(await r.json()); }).catch(e => setError(e.message)); }, []);
  const files = award.subcontract?.status !== "draft" && award.subcontract ? award.subcontract.attachments || award.contractFiles || EMPTY_CONTRACT_FILES : award.contractFiles || { ...EMPTY_CONTRACT_FILES, company: { ...company, form: company.form || defaults.form } };
  const locked = !!award.subcontract && award.subcontract.status !== "draft";
  return <Panel title="All other exhibits" subtitle="Build the document list, then upload the department's PDFs. These files are frozen into the subcontract when generated." action={locked ? <Badge>Locked package</Badge> : <Button onClick={() => save({ ...files, company: { ...company, form: company.form || defaults.form } })}>Use company form & logo</Button>}>
    {error && <p role="alert">{error}</p>}<p>Company: <strong>{files.company.name}</strong> · Agreement: <AssetLink asset={files.company.form}/></p><p>Original Exhibit A shell: <AssetLink asset={defaults.shell}/></p>
    {!locked && <AssetUpload label="Agreement form" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onSave={form => save({ ...files, company: { ...files.company, form } })}/>}
    <section className="contract-file-row"><h3>B · List of documents</h3><p>This list uses the stored project documents. Drawing issue dates come from title blocks; other issue dates remain unrecorded, with upload dates labelled separately. Review before sharing.</p>{!locked && <Button disabled={!ready || !documents.length} onClick={() => save({ ...files, b: documentRegister(award.snapshot.projectName, drawings, specs, reports) })}>Build / refresh Exhibit B</Button>}{files.b && <><Button onClick={() => downloadText("exhibit-b.txt", renderDocumentText(files.b!))}>Download Exhibit B</Button><details><summary>Review included documents</summary>{files.b.sections.map(s => <section key={s.heading}><h4>{s.heading}</h4>{s.lines.length ? s.lines.map((l, i) => <p key={i}>{l}</p>) : <p>No documents in this register.</p>}</section>)}</details></>}</section>
    {(Object.entries(EXHIBITS) as [keyof typeof EXHIBITS, string][]).map(([code, label]) => <section className="contract-file-row" key={code}><h3>{code} · {label}</h3><AssetLink asset={files.files[code]}/>{!locked && <AssetUpload label={`Upload Exhibit ${code}`} onSave={asset => save({ ...files, files: { ...files.files, [code]: asset } })}/>}</section>)}
  </Panel>;
}
export function ContractScopeDraft({ award, save }: { award: Award; save: (content: DocumentContent, note: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [draft, setDraft] = useState<DocumentContent | null>(null);
  return <><Button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job: "contract-scope", input: { trade: award.snapshot.packageName, scope: award.snapshot.scope } }) }); const result = await response.json() as ContractScopeOutput & { error?: string }; if (!response.ok) throw new Error(result.error || "AI drafting failed."); const base = generateSampleExhibit(award.snapshot, award, DEFAULT_EXHIBIT_TEMPLATE); base.sections[2].lines = result.lines.map(l => l.text); setDraft(base); } catch (e) { setError(e instanceof Error ? e.message : "Drafting failed."); } finally { setBusy(false); } }}>{busy ? "Drafting Section 3…" : "AI draft · Scope of Work"}</Button>{error && <p role="alert">{error}</p>}{draft && <Modal title="Review Exhibit A · Section 3" subtitle="Review the contractual wording against the retained bid scope. Exclusions and partials stay in the document. Saving creates a new draft revision." onClose={() => setDraft(null)} wide><p>Current revision {latestExhibit(award).number} remains unchanged until you save.</p>{draft.sections[2].lines.map((line, index) => <label className="ui-field" key={index}><span>Scope obligation {index + 1}</span><textarea rows={5} value={line} onChange={e => setDraft(d => d ? { ...d, sections: d.sections.map((s, i) => i === 2 ? { ...s, lines: s.lines.map((l, j) => j === index ? e.target.value : l) } : s) } : d)}/></label>)}<Button variant="primary" onClick={() => { save(draft, "Reviewed AI contractual wording in Section 3; original bid scope and limitations retained."); setDraft(null); }}>Save reviewed draft revision</Button></Modal>}</>;
}
