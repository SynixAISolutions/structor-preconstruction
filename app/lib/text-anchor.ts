// Pinning Drawing Flip highlights to the words on the sheet (Marcel, 24 Oct: the AI's marks landed in random
// places; "it should go for the information", the keynotes and notes, not the drawing itself). A drawing PDF
// has a text layer with the exact position of every word, so a finding's quote is looked up there: a keynote
// or tag ("SF-4", "09 29 00.A1") is marked everywhere it is printed, a sentence or note where it is written.
// What isn't in the text layer (a scanned sheet, words read from the image) is looked up in the words OCR read
// off the sheet image (lib/sheet-ocr); what neither holds keeps the AI's outline, marked approximate. Pure: the
// boxes come from lib/project-files-client readPageTextBoxes and sheetWords.

import { rectangle, type Point } from "./drawing-flip";
import type { DraftInput } from "./extraction";

/** One piece of the page's text and its box, 0 to 1 from the page's top-left as the sheet is shown. */
export type TextBox = { str: string; x: number; y: number; w: number; h: number };
export type Box = { x: number; y: number; width: number; height: number };

/** What pdf.js gives for a page: its text items and the viewport the page is rendered in (rotation included). */
type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number };
type PdfViewport = { width: number; height: number; convertToViewportPoint: (x: number, y: number) => number[] };

/**
 * Every piece of a page's text with its box, from pdf.js getTextContent() and getViewport({ scale: 1 }). The one
 * conversion the viewer, the drawing reader and the checks all use (pdf.js 6 has convertToViewportPoint only).
 */
export function pageTextBoxes(items: readonly PdfTextItem[], viewport: PdfViewport): TextBox[] {
  const boxes: TextBox[] = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform) continue;
    const [, , c, d, e, f] = item.transform;
    const height = item.height || Math.hypot(c, d);
    const [x1, y1] = viewport.convertToViewportPoint(e, f), [x2, y2] = viewport.convertToViewportPoint(e + (item.width ?? 0), f + height);
    boxes.push({ str: item.str, x: Math.min(x1, x2) / viewport.width, y: Math.min(y1, y2) / viewport.height, w: Math.abs(x2 - x1) / viewport.width, h: Math.abs(y2 - y1) / viewport.height });
  }
  return boxes;
}

/** Most places one tag is marked on a sheet. */
export const MAX_TAG_MARKS = 12;
const PAD = 0.003;

const norm = (s: string) => s.toUpperCase().replace(/[“”"‘’']/g, "").replace(/\s+/g, " ").trim();
/** A short code with a digit: a keynote, door, wall or finish type, a detail or sheet reference. */
export const isTag = (quote: string) => /^[A-Z0-9][A-Z0-9.\-/]{0,15}$/i.test(quote.trim()) && /\d/.test(quote);

const padded = (b: Box): Box => {
  const x = Math.max(0, b.x - PAD), y = Math.max(0, b.y - PAD);
  return { x, y, width: Math.min(1, b.x + b.width + PAD) - x, height: Math.min(1, b.y + b.height + PAD) - y };
};
const union = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
};
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The part of a text box holding characters [start, end) of its `length` characters, by the share of its width. */
function part(box: TextBox, start: number, end: number, length = box.str.length): Box {
  length = Math.max(1, length);
  return { x: box.x + box.w * (start / length), y: box.y, width: box.w * ((end - start) / length), height: box.h };
}

/** Every place a tag is printed as a whole code (not inside a longer one), at most `max`. */
function findTag(boxes: TextBox[], tag: string, max: number): Box[] {
  const found: Box[] = [];
  const pattern = new RegExp(`(^|[^A-Z0-9.\\-/])(${tag.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")})(?=$|[^A-Z0-9\\-/]|\\.(?![A-Z0-9]))`, "g");
  for (const box of boxes) {
    const text = box.str.toUpperCase();
    for (const match of text.matchAll(pattern)) {
      const start = (match.index ?? 0) + match[1].length;
      const mark = padded(part(box, start, start + tag.length));
      if (!found.some(b => overlaps(b, mark))) found.push(mark);
      if (found.length >= max) return found;
    }
  }
  return found;
}

/**
 * Letters and digits only: the comparison the AI's quote screen makes (lib/ai-jobs quoteOnPage), so a quote that
 * passed the screen is found here too. A PDF splits words into pieces and drops or doubles spaces and punctuation.
 */
const squeeze = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Lines top to bottom (boxes whose middles are within half a line), each left to right. */
function readingLines(boxes: TextBox[]): TextBox[][] {
  const lines: TextBox[][] = [];
  for (const box of [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x)) {
    const line = lines.at(-1), mid = box.y + box.h / 2;
    if (line && Math.abs(line[0].y + line[0].h / 2 - mid) < Math.max(line[0].h, box.h) / 2) line.push(box); else lines.push([box]);
  }
  return lines.map(line => line.sort((a, b) => a.x - b.x));
}
const readingOrder = (boxes: TextBox[]): TextBox[] => readingLines(boxes).flat();

/**
 * The words OCR read on a sheet as the page's text: one line per printed line, top to bottom, a wide gap (another
 * column, a note across the sheet) starting a new line, so a phrase is only found where it is written together.
 */
export function ocrText(words: TextBox[]): string {
  return readingLines(words).flatMap(line => {
    const parts: TextBox[][] = [];
    for (const w of line) {
      const last = parts.at(-1)?.at(-1);
      if (last && w.x - (last.x + last.w) < Math.max(last.h, w.h) * 2.5) parts.at(-1)!.push(w); else parts.push([w]);
    }
    return parts.map(p => p.map(w => w.str).join(" "));
  }).join("\n");
}

/**
 * The closest place `pattern` is written in `text` with at most `maxErrors` letters wrong, missing or extra
 * (Sellers' edit-distance search), for words read by OCR ("CERAM1C TlLE"). Null when nothing is that close.
 */
export function approximateFind(text: string, pattern: string, maxErrors: number): { at: number; end: number } | null {
  const m = pattern.length;
  if (!m) return null;
  let prev = Array.from({ length: m + 1 }, (_, i) => i), prevStart = new Array<number>(m + 1).fill(0);
  let best: { at: number; end: number; errors: number } | null = null;
  for (let j = 1; j <= text.length; j++) {
    const cur = [0], curStart = [j];
    for (let i = 1; i <= m; i++) {
      const swap = prev[i - 1] + (pattern[i - 1] === text[j - 1] ? 0 : 1), extra = prev[i] + 1, missing = cur[i - 1] + 1;
      if (swap <= extra && swap <= missing) { cur[i] = swap; curStart[i] = prevStart[i - 1]; }
      else if (extra <= missing) { cur[i] = extra; curStart[i] = prevStart[i]; }
      else { cur[i] = missing; curStart[i] = curStart[i - 1]; }
    }
    if (cur[m] <= maxErrors && (!best || cur[m] < best.errors)) best = { at: curStart[m], end: j, errors: cur[m] };
    prev = cur; prevStart = curStart;
  }
  return best && { at: best.at, end: best.end };
}

/** Letters OCR may get wrong in a phrase of this length: one in five, at most four. */
const ocrErrors = (length: number) => Math.min(4, Math.floor(length / 5));
/** A printed text layer's second, looser look (20 Nov): an AI quote a letter or two off ("ALUMINUM" for the sheet's
 * "ALUMINIUM", "&" for "AND"), one in eight letters at most three, on phrases long enough not to match by chance. */
const looseErrors = (length: number) => length < 16 ? 0 : Math.min(3, Math.floor(length / 8));

/** Where each part of a quote is written in the boxes, read in this order; null for a part that isn't. */
function placeParts(order: TextBox[], parts: string[], fuzzy: boolean, errors = ocrErrors): (Box | null)[] {
  let page = "";
  const spans = order.map(box => { const start = page.length; page += squeeze(box.str); return { start, end: page.length, box }; });
  return parts.map(quote => {
    // The whole part, else its opening words (a note wraps, or the AI shortened its end).
    const words = quote.split(" ");
    for (const tryWords of [words, words.slice(0, 8), words.slice(0, 5)]) {
      const phrase = squeeze(tryWords.join(" "));
      if (phrase.length < 6) break;
      const exact = page.indexOf(phrase);
      const allowed = fuzzy ? errors(phrase.length) : 0;
      const found = exact >= 0 ? { at: exact, end: exact + phrase.length } : allowed ? approximateFind(page, phrase, allowed) : null;
      if (!found) continue;
      const covered = spans.filter(s => s.end > found.at && s.start < found.end).map(s => part(s.box, Math.max(0, found.at - s.start), Math.min(s.end, found.end) - s.start, s.end - s.start));
      if (covered.length) return padded(union(covered));
    }
    return null;
  });
}

/**
 * Where a sentence or note is written: one box over the words of each part (a quote "A … B" has two). The PDF's
 * own text order first, the order the AI's quote was checked in; then reading order, for a note stored out of order.
 */
function findText(boxes: TextBox[], quote: string, fuzzy: boolean, errors = ocrErrors): Box[] {
  const kept = boxes.filter(b => squeeze(b.str));
  const parts = quote.split(/\.{3}|…/).map(p => p.trim()).filter(p => squeeze(p).length >= 6);
  if (!parts.length) return [];
  let best: Box[] = [];
  for (const order of [kept, readingOrder(kept)]) {
    const found = placeParts(order, parts, fuzzy, errors).filter((b): b is Box => !!b);
    if (found.length === parts.length) return found;
    if (found.length > best.length) best = found;
  }
  return best;
}

/**
 * Where a quote is on a sheet: every place for a tag, the written place for a sentence; empty when it isn't in the
 * text. `fuzzy` is for words read by OCR (sheetWords): a sentence may then be a few letters off. `loose`: a sentence
 * not found exactly on a printed text layer is looked for again a letter or two off (looseErrors). `note`: a sentence
 * is marked over the whole note or keynote it is written in, not only the quoted words (growToNote).
 */
export function findOnSheet(boxes: TextBox[], quote: string, max = MAX_TAG_MARKS, { fuzzy = false, loose = false, note = false } = {}): Box[] {
  const q = norm(quote);
  if (!q) return [];
  if (isTag(q)) return findTag(boxes, q, max);
  let found = findText(boxes, q, fuzzy);
  if (!found.length && loose && !fuzzy) found = findText(boxes, q, true, looseErrors);
  return note ? found.map(box => growToNote(boxes, box)) : found;
}

// ── The whole note (20 Nov, Danial: "how can we make it better and more accurate? especially the highlighted text") ──
// A highlight covered only the words the AI quoted, a sliver of a keynote. On Whittier's sheets a keynote prints its
// number ("D.4.1") left of its first line, its lines about a fifth of a line apart and the next note about two fifths
// below; a table's cells are a whole line apart. So a mark grows up to the line its note starts on and down to the
// line before the next one: never across a bigger gap, a change of print size or another column; where no note is
// numbered, a line ending a sentence ends the note. It stays the quoted words when the note would be implausibly big.

type Run = { box: Box; text: string; line: number };
const asBox = (t: TextBox): Box => ({ x: t.x, y: t.y, width: t.w, height: t.h });
/** Each printed line's runs: its words cut where a wide gap starts another column (ocrText's rule). */
function lineRuns(boxes: TextBox[]): Run[] {
  return readingLines(boxes.filter(b => squeeze(b.str))).flatMap((line, index) => {
    const parts: TextBox[][] = [];
    for (const w of line) {
      const last = parts.at(-1)?.at(-1);
      if (last && w.x - (last.x + last.w) < Math.max(last.h, w.h) * 2.5) parts.at(-1)!.push(w); else parts.push([w]);
    }
    return parts.map(p => ({ box: union(p.map(asBox)), text: p.map(w => w.str).join(" ").trim(), line: index }));
  });
}
/** A note's number or bullet printed on its own left of its first line: "D.4.1", "12", "3.", "A)", "(b)", "•". */
const NOTE_NUMBER = /^(\(?([A-Z]{1,3}[.-]?)?\d{1,3}(\.\d{1,3}){0,3}[A-Z]?[.):]?|\(?[A-Z][.)]|[-–•●▪◦*])$/i;
/** A note numbered at the start of its own first line: "3. REMOVE …", "A) PROVIDE …", "• SEAL …". */
const NOTE_START = /^(\(?\d{1,2}(\.\d{1,2})*[.)]|\(?[A-Z][.)]|[-–•●▪◦*])\s/;
const MAX_NOTE_LINES = 14, MAX_NOTE = { width: 0.5, height: 0.15 };

/** The whole note a mark sits in (see above): the mark itself when it isn't in a printed line. */
export function growToNote(boxes: TextBox[], mark: Box): Box {
  const runs = lineRuns(boxes);
  const core = { x: mark.x + PAD, y: mark.y + PAD, width: Math.max(0, mark.width - 2 * PAD), height: Math.max(0, mark.height - 2 * PAD) };
  const marked = runs.filter(r => r.box.x < core.x + core.width && core.x < r.box.x + r.box.width && r.box.y + r.box.height / 2 >= core.y && r.box.y + r.box.height / 2 <= core.y + core.height);
  // A note's number ("D.4.1", quoted with its text) marks where the note starts; growing from it would run down the
  // column of numbers. It joins the note again below, as its first line's number.
  const inMark = marked.filter(r => !NOTE_NUMBER.test(r.text));
  if (!inMark.length) return mark;
  const h = [...inMark.map(r => r.box.height)].sort((a, b) => a - b)[Math.floor(inMark.length / 2)];
  const numberOf = (r: Run) => runs.find(o => o.line === r.line && o !== r && o.box.x + o.box.width <= r.box.x + h * 0.5 && r.box.x - (o.box.x + o.box.width) <= h * 10 && NOTE_NUMBER.test(o.text));
  const starts = (r: Run) => !!numberOf(r) || NOTE_START.test(r.text);
  const endsSentence = (r: Run) => /[.:;!?]$/.test(r.text);
  const sideways = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const next = (from: Run, down: boolean) => runs
    .filter(o => o.line !== from.line && (down ? o.box.y > from.box.y : o.box.y < from.box.y) && Math.abs(o.box.height - h) <= h * 0.35 && sideways(o.box, from.box) >= 0.5 * Math.min(o.box.width, from.box.width))
    .map(o => ({ o, gap: down ? o.box.y - (from.box.y + from.box.height) : from.box.y - (o.box.y + o.box.height) }))
    .filter(c => c.gap >= -h * 0.3 && c.gap <= h * 0.6)
    .sort((a, b) => a.gap - b.gap)[0]?.o;
  const block = [...inMark].sort((a, b) => a.box.y - b.box.y);
  const numbered = block.some(starts) || [next(block[0], false), next(block.at(-1)!, true)].some(r => r && starts(r));
  while (block.length < MAX_NOTE_LINES && !starts(block[0])) {
    const above = next(block[0], false);
    if (!above || (!numbered && endsSentence(above))) break;
    block.unshift(above);
  }
  while (block.length < MAX_NOTE_LINES) {
    const below = next(block.at(-1)!, true);
    if (!below || starts(below) || (!numbered && endsSentence(block.at(-1)!))) break;
    block.push(below);
  }
  const number = numberOf(block[0]);
  const note = union([...block.map(r => r.box), ...(number ? [number.box] : [])]);
  return note.width > MAX_NOTE.width || note.height > MAX_NOTE.height ? padded(union(inMark.map(r => r.box))) : padded(note);
}

/** Print size OCR reads well (27 Oct, A12.1: at 155 dpi the finish schedule came back garbled, at 300 dpi 90%+ right). */
export const OCR_DPI = 300;
const OCR_TILE_PX = 2400, OCR_OVERLAP = 0.02;

/**
 * How to cut a page `width` × `height` points (1/72") into overlapping tiles OCR reads at OCR_DPI: each tile's
 * place on the page (0–1, reading order) and the pixel size of its longest side. A 42" × 30" sheet is 6 × 4.
 */
export function ocrTiles(width: number, height: number): { boxes: Box[]; size: number } {
  const inchesW = width / 72, inchesH = height / 72;
  const cols = Math.max(1, Math.ceil(inchesW * OCR_DPI / OCR_TILE_PX)), rows = Math.max(1, Math.ceil(inchesH * OCR_DPI / OCR_TILE_PX));
  const w = Math.min(1, 1 / cols + OCR_OVERLAP), h = Math.min(1, 1 / rows + OCR_OVERLAP);
  const boxes: Box[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) boxes.push({ x: Math.min(1 - w, Math.max(0, c / cols - OCR_OVERLAP / 2)), y: Math.min(1 - h, Math.max(0, r / rows - OCR_OVERLAP / 2)), width: w, height: h });
  return { boxes, size: Math.ceil(Math.max(w * inchesW, h * inchesH) * OCR_DPI) };
}

/** The widest strip drawn in one go, in pixels: within what a canvas can keep on the graphics card. */
export const MAX_STRIP_PX = 16_384;

/**
 * The OCR tiles of a page (ocrTiles, in order) grouped into strips drawn in one go (lib/project-files-client
 * renderStoredRow): neighbouring tiles of one row, as many as fit in MAX_STRIP_PX at the tiles' scale. A 42" × 30" sheet
 * is 4 strips of 6 tiles (12,600 px each), so it is drawn 4 times for OCR instead of 24 (13 Nov).
 */
export function ocrStrips(boxes: Box[], width: number, height: number, size: number): number[][] {
  const strips: number[][] = [];
  boxes.forEach((box, i) => {
    const scale = size / Math.max(box.width * width, box.height * height);
    const strip = strips.at(-1), first = strip && boxes[strip[0]];
    if (strip && first && first.y === box.y && (box.x + box.width - first.x) * width * scale <= MAX_STRIP_PX) strip.push(i);
    else strips.push([i]);
  });
  return strips;
}

/** What OCR read on one tile of a sheet: the tile's place on the page (0–1), its size in pixels, and its words. */
export type OcrTile = { box: Box; width: number; height: number; words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] };

/**
 * The words OCR read on a sheet's tiles, as TextBoxes of the whole page in reading order. Tiles overlap so no
 * word is cut in two; a word read on two tiles is kept from the tile whose middle it is nearest. Words OCR
 * isn't sure of (below `minConfidence` of 100) are left out.
 */
export function sheetWords(tiles: OcrTile[], minConfidence = 40): TextBox[] {
  const middle = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const words: TextBox[] = [];
  tiles.forEach((tile, index) => {
    for (const word of tile.words) {
      if (!squeeze(word.text) || word.confidence < minConfidence) continue;
      const x = tile.box.x + (word.bbox.x0 / tile.width) * tile.box.width, y = tile.box.y + (word.bbox.y0 / tile.height) * tile.box.height;
      const w = ((word.bbox.x1 - word.bbox.x0) / tile.width) * tile.box.width, h = ((word.bbox.y1 - word.bbox.y0) / tile.height) * tile.box.height;
      const cx = x + w / 2, cy = y + h / 2;
      const nearest = tiles.map((t, i) => ({ i, inside: cx >= t.box.x && cx <= t.box.x + t.box.width && cy >= t.box.y && cy <= t.box.y + t.box.height, d: Math.hypot(cx - middle(t.box).x, cy - middle(t.box).y) }))
        .filter(t => t.inside).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.i !== index) continue;
      words.push({ str: word.text, x, y, w, h });
    }
  });
  return readingOrder(words);
}

export const boxPolygon = (b: Box): Point[] => rectangle(b.x, b.y, b.width, b.height);

/**
 * The image quotes on one page of a drawing reading, checked against the words OCR read on that sheet image
 * (27 Oct, live: about half of what the AI quoted from A12.1's image isn't printed on it): "printed" where the
 * words are found, "not-printed" where they aren't and OCR read the `wholeSheet`. Otherwise they stay "image".
 */
export function checkImageQuotes(drafts: DraftInput[], at: { document: string; page: number }, words: TextBox[], wholeSheet: boolean): DraftInput[] {
  return drafts.map(draft => !draft.citations.some(c => c.verification === "image" && c.document === at.document && c.page === at.page) ? draft : {
    ...draft,
    citations: draft.citations.map(c => c.verification !== "image" || c.document !== at.document || c.page !== at.page ? c
      : findOnSheet(words, c.quote, 1, { fuzzy: true }).length ? { ...c, verification: "printed" as const }
      : wholeSheet ? { ...c, verification: "not-printed" as const } : c),
  });
}

/**
 * A drawing reading's findings with their marks pinned to the text: each scope finding whose quote is on its
 * sheet gets a mark wherever it's printed (one per place for a tag), replacing the AI's outline for it; an
 * outline left for a finding the text doesn't hold is kept as approximate. `boxes` holds each sheet's text;
 * `ocr` the words read off a sheet's image (sheetWords), looked up allowing OCR's letter slips.
 */
export function pinFindings(drafts: DraftInput[], boxes: Map<string, TextBox[]>, ocr: Map<string, TextBox[]> = new Map(), keepApproximate = true): DraftInput[] {
  const pinned = new Set<string>(), marks: DraftInput[] = [];
  for (const draft of drafts) {
    if (draft.kind !== "scope") continue;
    const cite = draft.citations[0], sheet = cite?.sheet;
    if (!sheet || !cite.quote) continue;
    const inText = findOnSheet(boxes.get(sheet) ?? [], cite.quote, MAX_TAG_MARKS, { loose: true, note: true });
    const found = inText.length ? inText : findOnSheet(ocr.get(sheet) ?? [], cite.quote, MAX_TAG_MARKS, { fuzzy: true, note: true });
    if (!found.length) continue;
    pinned.add(draft.key);
    found.forEach((box, i) => marks.push({
      kind: "region", key: `${draft.key}-text-${i + 1}`, packageId: draft.packageId, sheet, polygon: boxPolygon(box), anchor: "text",
      label: (found.length > 1 ? `${draft.title} (${i + 1} of ${found.length})` : draft.title).slice(0, 200), confidence: 0.9, scopeKeys: [draft.key], citations: draft.citations,
    }));
  }
  const kept = drafts.flatMap((draft): DraftInput[] => draft.kind !== "region" ? [draft] : (draft.scopeKeys ?? []).some(key => pinned.has(key)) || !keepApproximate ? [] : [{ ...draft, anchor: "image" }]);
  return [...kept, ...marks];
}
