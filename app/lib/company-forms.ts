// A company's own contract form as a Structor template (15 Oct, Marcel: "we take their form… and we
// accommodate to that"). The AI maps the uploaded form (lib/ai-jobs-more "template-from-form") into
// TemplateLayout blocks; everything here keeps that honest: only known block kinds and placeholders,
// every line's wording found in the uploaded form, and a place for the scope in an Exhibit A.

import type { DocumentTemplate, TemplateBlock, TemplateField, TemplateLayout } from "./award";
import type { CompanyForm } from "./contract-files";
import type { FormParagraph } from "./docx-text";

export type FormKind = "exhibit-a" | "subcontract";
export const TEMPLATE_FIELDS: TemplateField[] = ["owner", "project", "projectAddress", "trade", "tradeCode", "contractor", "subcontractor", "subcontractorContact", "subcontractorEmail", "amount", "basis", "formVersion", "bidRevision", "exhibitRevision", "start", "finish", "template"];
const BLOCK_KINDS = ["text", "scope", "exclusions", "not-applicable", "clarifications", "alternates", "allowances"] as const;
export const MAX_FORM_CHARS = 60_000;

export type MappedForm = { layout: TemplateLayout; warnings: string[]; dropped: number };

const squeeze = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";

/** Unknown {placeholders} become a visible [gap]; known ones stay. */
const keepFields = (s: string) => s.replace(/\{([^{}]{1,40})\}/g, (m, name: string) => (TEMPLATE_FIELDS as string[]).includes(name.trim()) ? `{${name.trim()}}` : `[${name.trim()}]`);

/** Whether a line's own wording (outside placeholders) appears in the form; short fragments always pass. */
function fromSource(line: string, source: string): boolean {
  return line.split(/\{[^{}]+\}|\[[^\][]+\]/).every(part => squeeze(part).length < 12 || source.includes(squeeze(part)));
}

/** Screens the AI's mapping of a form into a template layout. */
export function screenMappedForm(output: unknown, input: { kind: FormKind; paragraphs: FormParagraph[] }): MappedForm {
  const source = squeeze(input.paragraphs.map(p => p.text).join(" "));
  const o = (output ?? {}) as Record<string, unknown>;
  const warnings: string[] = [];
  let dropped = 0;
  const blocks: TemplateBlock[] = (Array.isArray(o.blocks) ? o.blocks : []).slice(0, 120).flatMap((b): TemplateBlock[] => {
    const x = (b ?? {}) as Record<string, unknown>;
    const kind = BLOCK_KINDS.find(k => k === x.kind);
    let heading = keepFields(str(x.heading, 300));
    if (!kind) { dropped++; return []; }
    if (heading && !fromSource(heading, source)) { dropped++; heading = ""; }
    if (kind === "text") {
      const lines = (Array.isArray(x.lines) ? x.lines : []).slice(0, 300).map(l => keepFields(str(l, 3000))).filter(Boolean);
      const kept = lines.filter(l => fromSource(l, source));
      dropped += lines.length - kept.length;
      return kept.length || heading ? [{ kind, heading, lines: kept, ...(x.numbered === true ? { numbered: true } : {}) }] : [];
    }
    if (kind === "scope") {
      const intro = keepFields(str(x.intro, 2000)), append = (Array.isArray(x.append) ? x.append : []).slice(0, 50).map(l => keepFields(str(l, 2000))).filter(l => l && fromSource(l, source));
      return [{ kind, heading: heading || "Scope of work", ...(intro && fromSource(intro, source) ? { intro } : {}), ...(append.length ? { append } : {}) }];
    }
    return [{ kind, heading: heading || kind.replace("-", " ").replace(/^\w/, c => c.toUpperCase()) } as TemplateBlock];
  });
  if (dropped) warnings.push(`${dropped} line${dropped === 1 ? "" : "s"} not found in the uploaded form ${dropped === 1 ? "was" : "were"} left out.`);
  if (input.kind === "exhibit-a" && !blocks.some(b => b.kind === "scope")) {
    blocks.push({ kind: "scope", heading: "Scope of work" });
    warnings.push("No place for the trade's scope was found; a Scope of work section was added at the end.");
  }
  if (input.kind === "exhibit-a" && !blocks.some(b => b.kind === "exclusions")) warnings.push("No exclusions section was found; the bidder's exclusions won't appear.");
  const title = keepFields(str(o.title, 200)) || (input.kind === "exhibit-a" ? "Exhibit A — Scope of Work · {tradeCode} {trade}" : "Subcontract agreement · {trade}");
  if (!blocks.length) warnings.push("Nothing usable was read from the form.");
  return { layout: { title, blocks }, warnings, dropped };
}

/** The mapped layout as a company template; `notice` says where it came from so reviewers check it. */
export function companyTemplate(kind: FormKind, fileName: string, mapped: MappedForm, at = new Date().toISOString()): DocumentTemplate {
  if (!mapped.layout.blocks.length) throw new Error("Nothing usable was read from the form.");
  return {
    id: `company-${kind}-${at.slice(0, 19).replace(/\D/g, "")}`, name: `${kind === "exhibit-a" ? "Company Exhibit A" : "Company subcontract"} (${fileName.replace(/\.[^.]+$/, "")})`,
    version: at.slice(0, 10), sample: false, notice: `Mapped from ${fileName} by AI. Check the wording and placeholders before sending.`, layout: mapped.layout,
  };
}

/** The company's own template for new packages, or the built-in default. Sent packages keep the template they were made with. */
export function templateFor(company: CompanyForm, kind: FormKind, fallback: DocumentTemplate): DocumentTemplate {
  return (kind === "exhibit-a" ? company.exhibitTemplate : company.subcontractTemplate) ?? fallback;
}
