// Drawing references by text (Danial, 28 Oct, after the Wyre AI demo Marcel gave on 24 Oct: Wyre lists every sheet a
// scope package is on and highlights the printed words, never an area of the drawing; "if the text is there, it will
// pick it up 100%"). Each bid package is looked for in the text of every sheet: its CSI section numbers however the
// sheet writes them ("033000 CAST-IN-PLACE CONCRETE", "03 30 00") and the titles of its specification sections
// ("GYPSUM BOARD"). A hit is the printed line, which the viewer boxes on the sheet. Nothing reads the drawing as a
// picture. Pure: the text comes from Project files (readStoredText), one entry per current sheet.

/** One current sheet's printed text, as stored when the drawings were uploaded. */
export type SheetText = { docId: string; page: number; sheet: string; title: string; discipline: string; text: string };
/** What a package is looked for by: its CSI numbers and its section titles. */
export type PackageTerms = { codes: RegExp[]; phrases: RegExp[] };
/** A sheet the package is on, and the printed lines that place it there. */
export type DrawingReference = { docId: string; page: number; sheet: string; title: string; discipline: string; lines: string[] };

/** Words too common on drawings to place a package by themselves. */
const GENERIC = new Set(["GENERAL", "SUMMARY", "NOTES", "NOTE", "SCHEDULE", "SCHEDULES", "PLAN", "PLANS", "DETAILS", "DETAIL", "TYPICAL", "EXISTING", "NEW", "WORK", "REQUIREMENTS", "OTHER", "MISCELLANEOUS", "SPECIALTIES", "EQUIPMENT", "SYSTEMS"]);
const MAX_LINES = 20;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A CSI section number as drawings print it: "09 29 00", "092900", "09-29-00", "09.29.00", followed by anything but
 * another digit. null for a whole division ("09 00 00") or a code shorter than a section: too broad to place work.
 */
export function csiPattern(code: string): RegExp | null {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 6) return null;
  const [a, b, c] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  if (b === "00" && c === "00") return null;
  return new RegExp(`(?<!\\d)${a}[ .-]?${b}[ .-]?${c}(?!\\d)`);
}

/** A title as a whole-word pattern that accepts a space or a hyphen between words ("CAST-IN-PLACE CONCRETE") and a plural. */
function phrasePattern(title: string): RegExp | null {
  const words = title.toUpperCase().replace(/[^A-Z0-9 -]+/g, " ").split(/[\s-]+/).filter(Boolean);
  if (!words.length || (words.length === 1 && (words[0].length < 4 || GENERIC.has(words[0])))) return null;
  if (words.every(w => GENERIC.has(w))) return null;
  return new RegExp(`(?<![A-Z0-9])${words.map(escape).join("[\\s-]+")}S?(?![A-Z0-9])`);
}

/** The terms a package is found by: its code and its sections' numbers, and the sections' titles and its own name. */
export function packageTerms(pkg: { code: string; name: string }, sections: { section: string; title: string }[]): PackageTerms {
  const codes = [...new Set([pkg.code, ...sections.map(s => s.section)])].map(csiPattern).filter((r): r is RegExp => !!r);
  const titles = [...new Set([...sections.map(s => s.title), ...(/[&,/]/.test(pkg.name) ? [] : [pkg.name])].map(t => t.trim().toUpperCase()).filter(Boolean))];
  return { codes: dedupe(codes), phrases: dedupe(titles.map(phrasePattern).filter((r): r is RegExp => !!r)) };
}
const dedupe = (patterns: RegExp[]) => [...new Map(patterns.map(p => [p.source, p])).values()];

/**
 * Every sheet whose printed text has one of the package's terms, in sheet order, each with the lines that do (at most
 * 20, each once). A CSI number counts only on a line that also has words, so a stray dimension can't place a trade; a
 * number printed alone above its words ("033000" / "CAST-IN-PLACE CONCRETE") is one callout.
 */
export function findDrawingReferences(sheets: SheetText[], terms: PackageTerms): DrawingReference[] {
  if (!terms.codes.length && !terms.phrases.length) return [];
  const refs: DrawingReference[] = [];
  for (const s of sheets) {
    const lines: string[] = [];
    const raw = s.text.split("\n").map(l => l.replace(/\s+/g, " ").trim());
    for (let i = 0; i < raw.length; i++) {
      let line = raw[i];
      if (/^[\d .-]{6,12}$/.test(line) && /[A-Za-z]{3}/.test(raw[i + 1] ?? "")) line = `${line} ${raw[++i]}`;
      const upper = line.toUpperCase();
      if (!line || lines.includes(line)) continue;
      const byCode = /[A-Z]{3}/.test(upper) && terms.codes.some(r => r.test(upper));
      if (byCode || terms.phrases.some(r => r.test(upper))) lines.push(line.slice(0, 160));
      if (lines.length >= MAX_LINES) break;
    }
    if (lines.length) refs.push({ docId: s.docId, page: s.page, sheet: s.sheet, title: s.title, discipline: s.discipline, lines });
  }
  return refs;
}

/** References grouped by discipline, as Wyre lists them: "Architectural (11) · Civil (2)". */
export function byDiscipline(refs: DrawingReference[]): { discipline: string; refs: DrawingReference[] }[] {
  const groups = new Map<string, DrawingReference[]>();
  for (const r of refs) groups.set(r.discipline, [...(groups.get(r.discipline) ?? []), r]);
  return [...groups.entries()].map(([discipline, list]) => ({ discipline, refs: list }));
}
