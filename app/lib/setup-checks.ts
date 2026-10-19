// Project setup, phase 2 (18 Oct plan, UI dev's point 7): completeness checks that only say
// "missing" when they can prove it, documents the specifications refer to, what an uploaded file
// is, and addenda. Pure; the browser runs them once per document version (lib/use-project-setup).

import { drawingRegister, sheetKey, type StoredDocument, type StoredSection } from "./project-files";
import type { SetupChecks } from "./project-setup";

export type CompletenessCheck = { docId: string; status: "checked" | "not-checked"; reason: string; listed: number; missing: string[] };
export type ReferencedDoc = { kind: "geotech" | "survey" | "hazmat" | "existing" | "other"; title: string; page: number; quote: string };

const prefix = (s: string) => s.match(/^[A-Z]+/)?.[0] ?? "";
const shape = (s: string) => s.replace(/\d/g, "9");

/** The sheet that lists the set: titled index, sheet list, cover or title sheet; else the first sheet. */
export function indexSheet<T extends { title: string }>(register: T[]): T | null {
  return register.find(r => /SHEET (INDEX|LIST)|DRAWING (INDEX|LIST)|INDEX OF DRAWINGS|COVER|TITLE SHEET/i.test(r.title)) ?? register[0] ?? null;
}

/**
 * Sheets the drawing index lists that weren't uploaded. A token counts as a sheet only when its
 * letters and digit pattern match sheets actually in the set (so grid "A1" or "NFPA13" never does),
 * and the index is trusted only when it names at least 8 such sheets and most uploaded sheets are in it.
 */
export function drawingIndexCheck(docId: string, indexText: string, uploaded: string[]): CompletenessCheck {
  const have = new Set(uploaded.map(sheetKey));
  const shapes = new Set(uploaded.map(s => `${prefix(s.toUpperCase())}|${shape(sheetKey(s))}`));
  const tokens = [...new Set((indexText.toUpperCase().match(/\b[A-Z]{1,4}[-.]?\d{1,4}(?:\.\d{1,3})?[A-Z]?\b/g) ?? []))];
  const listed = [...new Map(tokens.filter(t => shapes.has(`${prefix(t)}|${shape(sheetKey(t))}`)).map(t => [sheetKey(t), t])).values()];
  const covered = uploaded.filter(s => listed.some(t => sheetKey(t) === sheetKey(s))).length;
  if (!indexText.trim()) return { docId, status: "not-checked", reason: "The index sheet has no readable text.", listed: 0, missing: [] };
  if (listed.length < 8 || covered / Math.max(1, uploaded.length) < 0.6) return { docId, status: "not-checked", reason: "No sheet index could be read with confidence.", listed: listed.length, missing: [] };
  return { docId, status: "checked", reason: `${listed.length} sheets listed in the index.`, listed: listed.length, missing: listed.filter(t => !have.has(sheetKey(t))) };
}

const sectionCode = (a: string, b: string, c: string, d?: string) => `${a} ${b} ${c}${d ? `.${d}` : ""}`;

/** Section numbers a table of contents lists (a number at the start of a line, then a title). */
export function tocSections(text: string): string[] {
  return [...new Set([...text.matchAll(/^\s*(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?\s+[-–]?\s*[A-Za-z]/gm)].map(m => sectionCode(m[1], m[2], m[3], m[4])))].filter(code => code !== "00 00 00");
}

/** The contents pages among a manual's first pages: those with at least 8 lines starting with a section number. */
export function tocText(pages: { page: number; text: string }[], firstPages = 40): string {
  return pages.filter(p => p.page <= firstPages && tocSections(p.text).length >= 8).map(p => p.text).join("\n");
}

/**
 * Sections the manual's table of contents lists that weren't found in the manual. `present(code)`
 * lets the caller confirm a candidate against the full text first (front-matter sections often have
 * no page header). Trusted only when the contents list at least 10 sections covering most found ones.
 */
export function specTocCheck(docId: string, tocText: string, sections: StoredSection[], present: (code: string) => boolean = () => false): CompletenessCheck {
  const listed = tocSections(tocText);
  const found = new Set(sections.map(s => s.section));
  const covered = sections.filter(s => listed.includes(s.section)).length;
  if (listed.length < 10 || covered / Math.max(1, sections.length) < 0.6) return { docId, status: "not-checked", reason: "No table of contents could be read with confidence.", listed: listed.length, missing: [] };
  return { docId, status: "checked", reason: `${listed.length} sections listed in the table of contents.`, listed: listed.length, missing: listed.filter(code => !found.has(code) && !present(code)) };
}

/** Whether a section's number appears as a section opener or page header anywhere in the text ("SECTION 000110", "… 000110 - 2"). */
export function sectionInText(code: string, text: string): boolean {
  const digits = code.replace(/\D/g, "").slice(0, 6), [a, b, c] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  const dec = code.match(/\.(\d{2})$/)?.[1];
  const num = `${a}\\s?${b}\\s?${c}${dec ? `\\s?\\.\\s?${dec}` : "(?!\\s?\\.\\d)"}`;
  return new RegExp(`(?:SECTION\\s+${num}|\\b${num}\\s*-\\s*\\d+\\s*$)`, "im").test(text);
}

/** Manual pages worth searching for referenced reports: those naming geotechnical, survey, hazardous-material or existing-conditions documents. */
export const REFERENCE_WORDS = /geotechnical|subsurface (investigation|exploration)|soils? (report|investigation)|boring logs?|hazardous materials?|asbestos|lead[- ]based paint|environmental (site )?assessment|existing conditions (survey|report|drawings)|topographic survey|boundary survey|utility survey/i;

/**
 * The pages to send: those naming a report, most matches first, at most 14. Pages that only list
 * section titles (contents) are skipped.
 */
export function referencePages(pages: { page: number; text: string }[], max = 14): { page: number; text: string }[] {
  const count = (text: string) => (text.match(new RegExp(REFERENCE_WORDS.source, "gi")) ?? []).length;
  return pages.filter(p => count(p.text) > 0 && tocSections(p.text).length < 8).sort((a, b) => count(b.text) - count(a.text) || a.page - b.page).slice(0, max).sort((a, b) => a.page - b.page);
}

// ── Running the checks ──────────────────────────────────────────────────────

export type CheckName = "drawingIndex" | "specToc" | "references";
type PageText = { page: number; text: string };
export type CheckIo = {
  text: (doc: StoredDocument, pages?: { first: number; last: number }) => Promise<PageText[]>;
  /** The "referenced-documents" AI job; only called when some page names a report. */
  references: (pages: PageText[]) => Promise<ReferencedDoc[]>;
};

/** The checks still due for the newest drawing set and manual, given the results so far. */
export function dueChecks(drawings: StoredDocument | null, manual: StoredDocument | null, have: SetupChecks): CheckName[] {
  const due: CheckName[] = [];
  if (drawings && have.drawingIndex?.docId !== drawings.id) due.push("drawingIndex");
  if (manual && have.specToc?.docId !== manual.id) due.push("specToc");
  if (manual && have.references?.docId !== manual.id) due.push("references");
  return due;
}

/**
 * Runs the due checks. Each is independent: one failing (the AI request, a text chunk) keeps the
 * others' results, and its message comes back in `error` so the screen can offer a retry. Never throws.
 */
export async function runSetupChecks(drawings: StoredDocument | null, manual: StoredDocument | null, have: SetupChecks, io: CheckIo): Promise<{ found: SetupChecks; error: string | null }> {
  const due = dueChecks(drawings, manual, have), found: SetupChecks = {}, errors: string[] = [];
  const attempt = async (what: string, step: () => Promise<void>) => {
    try { await step(); } catch (error) { errors.push(`${what}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  if (drawings && due.includes("drawingIndex")) await attempt("Drawing index", async () => {
    const register = drawingRegister([drawings]), row = indexSheet(register);
    const [page] = row ? await io.text(drawings, { first: row.page, last: row.page }) : [];
    found.drawingIndex = drawingIndexCheck(drawings.id, page?.text ?? "", register.map(r => r.sheet));
  });
  if (manual && (due.includes("specToc") || due.includes("references"))) await attempt("Project manual", async () => {
    const pages = await io.text(manual);
    if (due.includes("specToc")) {
      const full = pages.map(p => p.text).join("\n");
      found.specToc = specTocCheck(manual.id, tocText(pages), manual.sections, code => sectionInText(code, full));
    }
    if (due.includes("references")) await attempt("Referenced reports", async () => {
      const chosen = referencePages(pages).map(p => ({ page: p.page, text: p.text.slice(0, 9000) }));
      found.references = { docId: manual.id, documents: chosen.length ? await io.references(chosen) : [] };
    });
  });
  if (!errors.length && dueChecks(drawings, manual, { ...have, ...found }).length) errors.push("Some document checks did not finish.");
  return { found, error: errors.length ? errors.join(" ") : null };
}

// ── What an uploaded file is ────────────────────────────────────────────────

export type FileGuess = { category: "Drawings" | "Specifications" | "RFP" | "Contracts" | "Addenda" | "Reports" | "Other"; confidence: "high" | "low"; reason: string };

/**
 * A rule-based guess from the file name and its first pages' text; "low" confidence means the screen
 * should ask (or use the AI's "classify-document" job). Sheet numbers in title blocks mean drawings.
 */
export function classifyFile(name: string, firstPages: string, sheetsRead = 0): FileGuess {
  const n = name.toLowerCase(), t = firstPages.slice(0, 20_000).toLowerCase();
  if (/addend(um|a)\b/.test(n) || /\baddendum\s+(no\.?\s*)?\d+/.test(t.slice(0, 2000))) return { category: "Addenda", confidence: "high", reason: "It says it is an addendum." };
  if (/\b(rfp|itb|ifb|invitation to bid|request for proposals?)\b/.test(n) || /request for proposals?|invitation (to|for) bid/.test(t.slice(0, 3000))) return { category: "RFP", confidence: "high", reason: "It reads as a request for proposals or an invitation to bid." };
  if (/project manual|specifications?|specs?\b/.test(n) || (t.match(/^\s*section\s+\d{2}\s?\d{2}\s?\d{2}/gm) ?? []).length >= 3 || /table of contents/.test(t) && (t.match(/\b\d{2} \d{2} \d{2}\b/g) ?? []).length >= 10) return { category: "Specifications", confidence: "high", reason: "It has specification sections." };
  if (sheetsRead >= 2 || /drawings?|plans?\b|sheets?\b|\bdwg\b|permit set|gmp set|cd set/.test(n)) return { category: "Drawings", confidence: sheetsRead >= 2 ? "high" : "low", reason: sheetsRead >= 2 ? `${sheetsRead} sheet numbers were read.` : "The file name suggests drawings." };
  if (/subcontract|agreement|contract|exhibit [a-i]\b|general conditions|a201|a101/.test(n) || /this agreement|general conditions of the contract/.test(t.slice(0, 4000))) return { category: "Contracts", confidence: "high", reason: "It reads as a contract document." };
  if (/geotech|soils?|boring|survey|hazmat|hazardous|asbestos|environmental|report|assessment/.test(n) || /geotechnical|subsurface|boring log|hazardous materials? survey|phase i environmental/.test(t.slice(0, 6000))) return { category: "Reports", confidence: "high", reason: "It reads as a site or condition report." };
  return { category: "Other", confidence: "low", reason: "Nothing identified it." };
}
