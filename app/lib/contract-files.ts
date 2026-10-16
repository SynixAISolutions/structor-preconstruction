import { AwardRuleError, type AwardState, type DocumentContent } from "./award";
import { assetId, assetUrl, type DocumentAsset } from "./document-assets";
export const EXHIBITS = { C: "Insurance requirements", D: "Safety plan", E: "Schedule", F: "Billing package", G: "Quality control plan" } as const;
export type CompanyForm = { name: string; logo?: DocumentAsset; form?: DocumentAsset };
export type ContractFiles = { company: CompanyForm; b: DocumentContent | null; files: Partial<Record<keyof typeof EXHIBITS, DocumentAsset>> };
export const EMPTY_CONTRACT_FILES: ContractFiles = { company: { name: "General contractor" }, b: null, files: {} };
export function setContractFiles(state: AwardState, id: string, files: ContractFiles): AwardState {
  const award = state.awards.find(a => a.id === id);
  if (!award || award.cancelled || award.subcontract && award.subcontract.status !== "draft") throw new AwardRuleError({ subcontract: "The contract files are locked after sending. Keep the signed package unchanged." });
  if (!files.company.name.trim()) throw new AwardRuleError({ contractorName: "Enter your company name." });
  for (const asset of [files.company.logo, files.company.form, ...Object.values(files.files)].filter(Boolean) as DocumentAsset[]) if (!assetId(asset.id) || !asset.name.trim()) throw new AwardRuleError({ subcontract: "An attachment is invalid. Upload it again." });
  return { ...state, awards: state.awards.map(a => a.id === id ? { ...a, contractFiles: structuredClone(files), updatedAt: new Date().toISOString() } : a) };
}
export function contractFileLines(files: ContractFiles): string[] {
  return [`Company: ${files.company.name}`, ...(files.company.form ? [`Agreement form: ${files.company.form.name} — ${assetUrl(files.company.form)}`] : []), "Exhibit B — List of documents", ...(files.b ? files.b.sections.flatMap(s => [s.heading, ...s.lines]) : ["NOT PROVIDED — build Exhibit B before sending"]), ...Object.entries(EXHIBITS).map(([code, name]) => { const file = files.files[code as keyof typeof EXHIBITS]; return `Exhibit ${code} — ${name}: ${file ? `${file.name} — ${assetUrl(file)}` : "NOT PROVIDED"}`; })];
}
export function missingContractFiles(files: ContractFiles): string[] {
  return [...(!files.company.form ? ["Agreement form"] : []), ...(!files.b?.sections.some(s => s.lines.length) ? ["Exhibit B"] : []), ...Object.keys(EXHIBITS).filter(code => !files.files[code as keyof typeof EXHIBITS]).map(code => `Exhibit ${code}`)];
}
export function contractScopeContent(content: DocumentContent, lines: string[]): DocumentContent {
  if (content.sections[2]?.heading.toLowerCase() !== "scope of work") throw new AwardRuleError({ exhibit: "Use the corrected shell before applying the AI draft." });
  return { ...content, sections: content.sections.map((s, i) => i === 2 ? { ...s, lines } : s) };
}
export function documentRegister(project: string, drawings: { id: string; title: string; date: string; revision: string }[], specs: { id: string; title: string; date: string; revision: string }[], reports: { name: string; date: string; revision?: string }[]): DocumentContent {
  const line = (r: { id?: string; title?: string; name?: string; date: string; revision?: string }) => `${r.id ? `${r.id} — ` : ""}${r.title || r.name} · Issued: ${r.date || "not recorded"} · Revision: ${r.revision || "not recorded"}`;
  return { title: `Exhibit B — List of documents · ${project}`, sections: [{ heading: "Drawings", lines: drawings.map(line) }, { heading: "Specifications", lines: specs.map(line) }, { heading: "Reports", lines: reports.map(line) }] };
}
