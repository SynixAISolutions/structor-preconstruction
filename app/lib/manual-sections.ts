// A project manual's pages grouped into its specification sections, so the AI reads one section at
// a time and every citation can name its page. The Jelleff manual prints a header on every page,
// "NON-STRUCTURAL METAL FRAMING 092216 - 2" (title, section, page within the section), and opens
// each section with "SECTION 092216 - NON-STRUCTURAL METAL FRAMING". Pages without either
// (cover, contents, appendices) belong to no section.

export type PageText = { page: number; text: string; sheet?: string; aspect?: number };
export type ManualSection = { section: string; title: string; firstPage: number; lastPage: number; pages: PageText[] };

/** "092216" or "09 22 16" (and "09 22 16.13") → "09 22 16". */
const format = (a: string, b: string, c: string, d?: string) => `${a} ${b} ${c}${d ? `.${d}` : ""}`;
const HEADER = /^(.*?\S)\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?\s*-\s*\d+\s*$/;
const OPENER = /^SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?\s*[-–]\s*(.+?)\s*$/i;

/** The section a page belongs to, read from its first lines; null when it carries no section header. */
export function sectionOfPage(text: string): { section: string; title: string } | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 10);
  for (const line of lines) {
    const m = line.match(OPENER);
    if (m) return { section: format(m[1], m[2], m[3], m[4]), title: m[5] };
  }
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m && !/^(section|part)\b/i.test(m[1])) return { section: format(m[2], m[3], m[4], m[5]), title: m[1] };
  }
  return null;
}

/** The manual's sections in page order, each with its pages. A section printed in two places keeps both runs' pages. */
export function manualSections(pages: PageText[]): ManualSection[] {
  const sections = new Map<string, ManualSection>();
  for (const page of [...pages].sort((a, b) => a.page - b.page)) {
    const found = sectionOfPage(page.text);
    if (!found) continue;
    const existing = sections.get(found.section);
    if (existing) { existing.pages.push(page); existing.lastPage = page.page; }
    else sections.set(found.section, { section: found.section, title: found.title, firstPage: page.page, lastPage: page.page, pages: [page] });
  }
  return [...sections.values()];
}

/** Sections of one CSI division ("09"), for choosing what a trade's run reads. */
export const sectionsInDivision = (sections: ManualSection[], division: string): ManualSection[] =>
  sections.filter(s => s.section.startsWith(`${division} `));

/** A bid form's explicit specification list, including decimal subsections and Division 01. */
export function sectionsFromBidForm(sections: ManualSection[], text: string) {
  const listed = [...new Set([...text.matchAll(/^\s*(\d{2})\s*(\d{2})\s*(\d{2})(?:\.(\d{2}))?\s*[-–]\s*\S/gm)].map(m => format(m[1], m[2], m[3], m[4])))];
  const matches = (section: string, listed: string) => section === listed || section.startsWith(`${listed}.`);
  return { listed, sections: sections.filter(s => listed.some(code => matches(s.section, code)) || /division\s+01\b/i.test(text) && s.section.startsWith("01 ")), missing: listed.filter(code => !sections.some(s => matches(s.section, code))) };
}
