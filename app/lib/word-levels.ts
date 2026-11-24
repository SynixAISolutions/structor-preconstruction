// The list level of each paragraph of a Word file (lib/scope-checklist). A checklist's text alone loses its indentation:
// "Receiving … of materials furnished by others, including the following:" and its sub-items "Toilet accessories.",
// "Access doors and frames." come out as lines of equal standing, and a sub-item on its own reads as work the trade
// furnishes. Word keeps each paragraph's list level (its "ilvl"), so the server reads it from the file: from a .doc's
// paragraph properties (Word 97–2003 binary, [MS-DOC]) or a .docx's document.xml, then matches it to the text lines.
// Pure: the caller opens the file's container (app/api/checklist-text).

/**
 * One paragraph: its text, its list level (0 = the outermost) and which list it is in, or null for both when it isn't
 * in a list. Levels compare only within one list: a list started under an item ("The following specialty items:")
 * begins again at level 0.
 */
export type LeveledLine = { text: string; level: number | null; list?: number | null };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const i16 = (b: Uint8Array, o: number) => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
/** Windows-1252's 0x80–0x9F (curly quotes, dashes) in a .doc's 8-bit text. */
const CP1252: Record<number, number> = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178 };
/** A sprm's operand size by its spra (bits 13–15); 6 is variable, its first byte giving the size. */
const OPERAND = [1, 1, 2, 4, 2, 2, -1, 3];
const SPRM_ILVL = 0x260a, SPRM_ILFO = 0x460b;

/**
 * A .doc's main-text paragraphs with their list levels. `doc`: the WordDocument stream; `table`: the table stream the
 * file header names (0Table or 1Table). Field instructions are left out and their results kept, as Word shows them.
 * Throws on a file that isn't Word 97–2003.
 */
export function docParagraphs(doc: Uint8Array, tables: { "0Table": Uint8Array | null; "1Table": Uint8Array | null }): LeveledLine[] {
  if (u16(doc, 0) !== 0xa5ec) throw new Error("Not a Word 97–2003 document.");
  const table = u16(doc, 0x0a) & 0x0200 ? tables["1Table"] : tables["0Table"];
  if (!table) throw new Error("The document's table stream is missing.");
  let o = 0x20;
  o += 2 + u16(doc, o) * 2; // fibRgW
  const lw = o + 2;
  const ccpText = u32(doc, lw + 3 * 4);
  o += 2 + u16(doc, o) * 4; // fibRgLw
  const fcLcb = o + 2;
  const pair = (i: number) => ({ fc: u32(doc, fcLcb + i * 8), lcb: u32(doc, fcLcb + i * 8 + 4) });
  const papx = pair(13), clx = pair(33);

  // The piece table: which file bytes hold each run of characters.
  let p = clx.fc;
  while (table[p] === 0x01) p += 3 + u16(table, p + 1);
  if (table[p] !== 0x02) throw new Error("The document's text table couldn't be read.");
  const n = (u32(table, p + 1) - 4) / 12;
  p += 5;
  const pieces = Array.from({ length: n }, (_, i) => {
    const raw = u32(table, p + (n + 1) * 4 + i * 8 + 2);
    const compressed = (raw & 0x40000000) !== 0;
    return { cp: u32(table, p + i * 4), end: u32(table, p + (i + 1) * 4), fc: compressed ? (raw & 0x3fffffff) / 2 : raw, compressed };
  });

  // Paragraph properties: file-byte ranges, each with its list level.
  const runs: { start: number; end: number; level: number | null; list: number | null }[] = [];
  const nb = (papx.lcb - 4) / 8;
  for (let i = 0; i < nb; i++) {
    const page = (u32(table, papx.fc + (nb + 1) * 4 + i * 4) & 0x3fffff) * 512;
    const fkp = doc.subarray(page, page + 512);
    const crun = fkp[511];
    for (let r = 0; r < crun; r++) {
      const at = fkp[(crun + 1) * 4 + r * 13] * 2;
      let ilvl: number | null = null, ilfo = 0;
      if (at) {
        let cb = fkp[at], q = at + 1, len = cb * 2 - 1;
        if (cb === 0) { cb = fkp[q]; q++; len = cb * 2; }
        const end = Math.min(q + len, 511);
        for (let s = q + 2; s + 2 <= end;) {
          const sprm = u16(fkp, s); s += 2;
          let size = OPERAND[sprm >> 13];
          if (size < 0) size = fkp[s] + 1;
          if (sprm === SPRM_ILVL) ilvl = fkp[s];
          if (sprm === SPRM_ILFO) ilfo = i16(fkp, s);
          s += size;
        }
      }
      runs.push({ start: u32(fkp, r * 4), end: u32(fkp, (r + 1) * 4), level: ilfo > 0 ? ilvl ?? 0 : null, list: ilfo > 0 ? ilfo : null });
    }
  }
  const listAt = (fc: number) => { const run = runs.find(r => fc >= r.start && fc < r.end); return { level: run?.level ?? null, list: run?.list ?? null }; };

  const out: LeveledLine[] = [];
  let text = "";
  const fields: ("code" | "result")[] = [];
  for (const piece of pieces) {
    for (let cp = piece.cp; cp < piece.end && cp < ccpText; cp++) {
      const fc = piece.compressed ? piece.fc + (cp - piece.cp) : piece.fc + (cp - piece.cp) * 2;
      let ch = piece.compressed ? doc[fc] : u16(doc, fc);
      if (piece.compressed && CP1252[ch]) ch = CP1252[ch];
      if (ch === 0x13) { fields.push("code"); continue; }
      if (ch === 0x14) { if (fields.length) fields[fields.length - 1] = "result"; continue; }
      if (ch === 0x15) { fields.pop(); continue; }
      if (fields.includes("code")) continue;
      if (ch === 0x0d || ch === 0x07 || ch === 0x0c) { out.push({ text: text.replace(/\s+/g, " ").trim(), ...listAt(fc) }); text = ""; continue; }
      if (ch === 0x0b || ch === 0x09 || ch === 0xa0) { text += " "; continue; }
      if (ch === 0x1e) { text += "-"; continue; }
      if (ch < 0x20) continue;
      text += String.fromCharCode(ch);
    }
  }
  if (text.trim()) out.push({ text: text.replace(/\s+/g, " ").trim(), level: null, list: null });
  return out;
}

const XML_ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENTITY[e.toLowerCase()]);

/** A .docx's paragraphs (word/document.xml) with their list levels. */
export function docxParagraphs(xml: string): LeveledLine[] {
  const body = xml.slice(Math.max(0, xml.indexOf("<w:body")));
  return [...body.matchAll(/<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(([p]) => {
    const numId = p.match(/<w:numId\s+w:val="(\d+)"/)?.[1];
    const ilvl = p.match(/<w:ilvl\s+w:val="(\d+)"/)?.[1];
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br)\s*\/>/g)].map(m => m[1] === undefined ? " " : unescapeXml(m[1])).join("");
    const listed = !!numId && numId !== "0";
    return { text: text.replace(/\s+/g, " ").trim(), level: listed ? Number(ilvl ?? 0) : null, list: listed ? Number(numId) : null };
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** How far ahead a line is looked for among the paragraphs, past ones the text left out. */
const LOOKAHEAD = 12;

/**
 * Each text line with the level of the paragraph it came from: matched in order by its letters and digits, so a curly
 * quote or a tab doesn't stop it; a line split from its paragraph matches it too. Null where none matches.
 */
export function alignLevels(lines: string[], paragraphs: LeveledLine[]): LeveledLine[] {
  const paras = paragraphs.map(p => ({ key: norm(p.text), level: p.level, list: p.list ?? null })).filter(p => p.key);
  let at = 0;
  return lines.map(text => {
    const key = norm(text);
    if (!key) return { text, level: null, list: null };
    for (let j = at; j < Math.min(paras.length, at + LOOKAHEAD); j++) {
      if (paras[j].key === key) { at = j + 1; return { text, level: paras[j].level, list: paras[j].list }; }
      if (key.length >= 12 && paras[j].key.includes(key)) { at = j; return { text, level: paras[j].level, list: paras[j].list }; }
    }
    return { text, level: null, list: null };
  });
}
