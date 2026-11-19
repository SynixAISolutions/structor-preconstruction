// A project manual's pages grouped into its specification sections, so the AI reads one section at
// a time and every citation can name its page. The Jelleff manual prints a header on every page,
// "NON-STRUCTURAL METAL FRAMING 092216 - 2" (title, section, page within the section), and opens
// each section with "SECTION 092216 - NON-STRUCTURAL METAL FRAMING". Pages without either
// (cover, contents, appendices) belong to no section.
//
// 19 Nov, Whittier's two manuals (1,888 pages): most of their pages carry no such header in their first lines, and their
// tables of contents list "SECTION 03 30 00 - CAST-IN-PLACE CONCRETE" the way a section opens. Reading only pages that
// named their section, the fluid-applied air barrier section got 1 page and PVC roofing 1, while cast-in-place concrete ran
// from its contents line on page 8 to its last page, 352, and the sections claimed 4,314 pages in all. Marcel: "it says it
// didn't see anything, but look. Fluid applied air barrier." So a section now runs from its opening page to the next
// section, its END OF SECTION line, or a contents, division or appendix page; contents pages belong to none.

export type PageText = { page: number; text: string; sheet?: string; aspect?: number };
export type ManualSection = { section: string; title: string; firstPage: number; lastPage: number; pages: PageText[] };
/** The splitter's version, saved on a stored manual: a manual split by an older one is split again from its stored text. */
export const SECTIONS_VERSION = 3;

/** "092216" or "09 22 16" (and "09 22 16.13") → "09 22 16". */
const format = (a: string, b: string, c: string, d?: string) => `${a} ${b} ${c}${d ? `.${d}` : ""}`;
// Dashes as printed, or as OCR reads them off a scanned page (an em dash, 19 Nov).
const HEADER = /^(.*?\S)\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s*[-–—]\s*\d+\s*$/;
const OPENER = /^SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s*[-–—]\s*(.+?)\s*$/i;
// A scanned opener read by OCR (19 Nov, Whittier Vol 2): "SECTION 27 0500 TELECOM ROOMS AND PATHWAYS", "SECTION 27 0533.1
// CONDUIT, RACEWAYS AND BOXES", no dash. Capitals only, and a title that ends in a word, so neither "Section includes"
// nor a contents line ("SECTION 092900 GYPSUM BOARD .... 434") counts.
const BARE_OPENER = /^SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s+(?!.*\.\.)([A-Z][A-Z0-9 ,&()/'’–-]*[A-Z)])$/;

/** The section a page belongs to, read from its first lines; null when it carries no section header. */
export function sectionOfPage(text: string): { section: string; title: string } | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 10);
  for (const line of lines) {
    const m = line.match(OPENER) ?? line.match(BARE_OPENER);
    if (m) return { section: format(m[1], m[2], m[3], m[4]), title: m[5] };
  }
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m && !/^(section|part)\b/i.test(m[1])) return { section: format(m[2], m[3], m[4], m[5]), title: m[1] };
  }
  return null;
}

const BARE = /^(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s+[A-Za-z]/;
/**
 * A table of contents or a division's list of sections: five or more sections listed a line each ("SECTION 07 27 26 -
 * FLUID-APPLIED MEMBRANE AIR BARRIERS", "07 27 26 Fluid-Applied ...", "AIR BARRIERS 07 27 26 - 1"), or the words
 * TABLE OF CONTENTS at the top. A section's own first page lists its related sections in sentences, and opens PART 1.
 */
export function listsSections(text: string): boolean {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // The heading, not the words in a sentence (Whittier's 01 78 23: "arranged to match manual's table of contents").
  if (lines.slice(0, 6).some(l => l.length <= 60 && /^(PROJECT\s+MANUAL\s+)?TABLE\s+OF\s+CONTENTS\b/i.test(l))) return true;
  const codes = new Set<string>();
  for (const line of lines) {
    const opener = line.match(OPENER) ?? line.match(BARE_OPENER), bare = line.match(BARE), header = line.match(HEADER);
    if (opener) codes.add(format(opener[1], opener[2], opener[3], opener[4]));
    else if (bare) codes.add(format(bare[1], bare[2], bare[3], bare[4]));
    else if (header && !/^(section|part)\b/i.test(header[1])) codes.add(format(header[2], header[3], header[4], header[5]));
  }
  return codes.size >= 5 && !/^PART\s+1\b/im.test(text);
}

/** A page that starts something other than a section: an appendix, attachment, exhibit, Division 00 document or a division's cover. */
function startsOther(text: string): boolean {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
  return lines.some(l => l.length <= 80 && (/^(APPENDIX|ATTACHMENT|EXHIBIT)\b/i.test(l) || /^DOCUMENT\s+\d{2}\s?\d{2}\s?\d{2}/i.test(l) || /^DIVISION\s+\d{1,2}\b[^a-z]*$/.test(l)));
}
const ENDS = /\bEND\s+OF\s+SECTION\b/i;

/**
 * The manual's sections in page order, each with its pages: a section opens on the page that names it, by its SECTION
 * line or its running header, and goes on over the pages after it that name no section, until the next section, its
 * END OF SECTION line, or a contents, division or appendix page. A section printed in two places keeps its longer run.
 */
export function manualSections(pages: PageText[]): ManualSection[] {
  const runs: ManualSection[] = [];
  let current = null as ManualSection | null;
  for (const page of [...pages].sort((a, b) => a.page - b.page)) {
    if (listsSections(page.text)) { current = null; continue; }
    const found = sectionOfPage(page.text);
    if (found) {
      if (current?.section !== found.section) { current = { section: found.section, title: found.title, firstPage: page.page, lastPage: page.page, pages: [] }; runs.push(current); }
    } else if (startsOther(page.text)) { current = null; continue; }
    if (!current) continue;
    current.pages.push(page);
    current.lastPage = page.page;
    if (ENDS.test(page.text)) current = null;
  }
  const best = new Map<string, ManualSection>();
  for (const run of runs) { const was = best.get(run.section); if (!was || run.pages.length > was.pages.length) best.set(run.section, was ? { ...run, title: was.title } : run); }
  return [...best.values()].sort((a, b) => a.firstPage - b.firstPage);
}

/** What a stored manual keeps of its sections: each one's first and last page (lib/project-files StoredSection). */
export const storedSections = (pages: PageText[]) =>
  manualSections(pages).map(s => ({ section: s.section, title: s.title, first: s.firstPage, last: s.lastPage }));

/** Sections of one CSI division ("09"), for choosing what a trade's run reads. */
export const sectionsInDivision = (sections: ManualSection[], division: string): ManualSection[] =>
  sections.filter(s => s.section.startsWith(`${division} `));

/** A bid form's explicit specification list, including decimal subsections and Division 01. */
export function sectionsFromBidForm(sections: ManualSection[], text: string) {
  const listed = [...new Set([...text.matchAll(/^\s*(\d{2})\s*(\d{2})\s*(\d{2})(?:\.(\d{2}))?\s*[-–]\s*\S/gm)].map(m => format(m[1], m[2], m[3], m[4])))];
  const matches = (section: string, listed: string) => section === listed || section.startsWith(`${listed}.`);
  return { listed, sections: sections.filter(s => listed.some(code => matches(s.section, code)) || /division\s+01\b/i.test(text) && s.section.startsWith("01 ")), missing: listed.filter(code => !sections.some(s => matches(s.section, code))) };
}
