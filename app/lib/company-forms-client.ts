"use client";

// Company forms in the browser: read an uploaded Word or PDF form and have it mapped into a template
// (lib/company-forms). The screen previews it and saves it on the "company-form" settings.

import { aiJob } from "./ai-more-client";
import { companyTemplate, type FormKind, type MappedForm } from "./company-forms";
import { readDocx, type FormParagraph } from "./docx-text";

type TextItem = { str: string; transform: number[] };

/** A PDF's lines, top to bottom on each page (items on the same baseline joined). */
async function readPdfLines(file: File): Promise<FormParagraph[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("./pdf-worker")).pdfWorkerSrc();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: FormParagraph[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 60); n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items as TextItem[];
    const rows = new Map<number, TextItem[]>();
    for (const item of items) if (item.str.trim()) { const y = Math.round(item.transform[5]); rows.set(y, [...(rows.get(y) ?? []), item]); }
    for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      const text = row.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, style: "", numbered: /^(\d+(\.\d+)*|[a-z]|[ivx]+)[.)]\s/i.test(text) });
    }
  }
  return out;
}

/** The form's paragraphs, from a .docx or a .pdf. */
export async function readFormFile(file: File): Promise<FormParagraph[]> {
  if (/\.docx$/i.test(file.name)) return readDocx(await file.arrayBuffer());
  if (/\.pdf$/i.test(file.name)) return readPdfLines(file);
  throw new Error("Upload the form as a Word (.docx) or PDF file.");
}

/** Reads and maps a company form; returns the template to preview and the warnings to show. */
export async function mapCompanyForm(file: File, kind: FormKind, signal?: AbortSignal) {
  const paragraphs = await readFormFile(file);
  if (!paragraphs.length) throw new Error("No text could be read from this form. A scanned PDF needs to be converted to text first.");
  const mapped = await aiJob<MappedForm>("template-from-form", { kind, paragraphs }, signal);
  return { template: companyTemplate(kind, file.name, mapped), warnings: mapped.warnings, paragraphs: paragraphs.length };
}
