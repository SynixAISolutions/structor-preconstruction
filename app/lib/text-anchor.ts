// Pinning Drawing Flip highlights to the words on the sheet (Marcel, 24 Oct: the AI's marks landed in random
// places; "it should go for the information", the keynotes and notes, not the drawing itself). A drawing PDF
// has a text layer with the exact position of every word, so a finding's quote is looked up there: a keynote
// or tag ("SF-4", "09 29 00.A1") is marked everywhere it is printed, a sentence or note where it is written.
// What isn't in the text layer (a scanned sheet, words read from the image) keeps the AI's outline, marked
// approximate. Pure: the boxes come from lib/project-files-client readPageTextBoxes.

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
function readingOrder(boxes: TextBox[]): TextBox[] {
  const lines: TextBox[][] = [];
  for (const box of [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x)) {
    const line = lines.at(-1), mid = box.y + box.h / 2;
    if (line && Math.abs(line[0].y + line[0].h / 2 - mid) < Math.max(line[0].h, box.h) / 2) line.push(box); else lines.push([box]);
  }
  return lines.flatMap(line => line.sort((a, b) => a.x - b.x));
}

/** Where each part of a quote is written in the boxes, read in this order; null for a part that isn't. */
function placeParts(order: TextBox[], parts: string[]): (Box | null)[] {
  let page = "";
  const spans = order.map(box => { const start = page.length; page += squeeze(box.str); return { start, end: page.length, box }; });
  return parts.map(quote => {
    // The whole part, else its opening words (a note wraps, or the AI shortened its end).
    const words = quote.split(" ");
    for (const tryWords of [words, words.slice(0, 8), words.slice(0, 5)]) {
      const phrase = squeeze(tryWords.join(" "));
      if (phrase.length < 6) break;
      const at = page.indexOf(phrase);
      if (at < 0) continue;
      const covered = spans.filter(s => s.end > at && s.start < at + phrase.length).map(s => part(s.box, Math.max(0, at - s.start), Math.min(s.end, at + phrase.length) - s.start, s.end - s.start));
      if (covered.length) return padded(union(covered));
    }
    return null;
  });
}

/**
 * Where a sentence or note is written: one box over the words of each part (a quote "A … B" has two). The PDF's
 * own text order first, the order the AI's quote was checked in; then reading order, for a note stored out of order.
 */
function findText(boxes: TextBox[], quote: string): Box[] {
  const kept = boxes.filter(b => squeeze(b.str));
  const parts = quote.split(/\.{3}|…/).map(p => p.trim()).filter(p => squeeze(p).length >= 6);
  if (!parts.length) return [];
  let best: Box[] = [];
  for (const order of [kept, readingOrder(kept)]) {
    const found = placeParts(order, parts).filter((b): b is Box => !!b);
    if (found.length === parts.length) return found;
    if (found.length > best.length) best = found;
  }
  return best;
}

/** Where a quote is on a sheet: every place for a tag, the written place for a sentence; empty when it isn't in the text. */
export function findOnSheet(boxes: TextBox[], quote: string, max = MAX_TAG_MARKS): Box[] {
  const q = norm(quote);
  if (!q) return [];
  return isTag(q) ? findTag(boxes, q, max) : findText(boxes, q);
}

export const boxPolygon = (b: Box): Point[] => rectangle(b.x, b.y, b.width, b.height);

/**
 * A drawing reading's findings with their marks pinned to the text: each scope finding whose quote is on its
 * sheet gets a mark wherever it's printed (one per place for a tag), replacing the AI's outline for it; an
 * outline left for a finding the text doesn't hold is kept as approximate. `boxes` holds each sheet's text.
 */
export function pinFindings(drafts: DraftInput[], boxes: Map<string, TextBox[]>): DraftInput[] {
  const pinned = new Set<string>(), marks: DraftInput[] = [];
  for (const draft of drafts) {
    if (draft.kind !== "scope") continue;
    const cite = draft.citations[0], sheet = cite?.sheet, onSheet = sheet ? boxes.get(sheet) : undefined;
    if (!sheet || !onSheet?.length || !cite.quote) continue;
    const found = findOnSheet(onSheet, cite.quote);
    if (!found.length) continue;
    pinned.add(draft.key);
    found.forEach((box, i) => marks.push({
      kind: "region", key: `${draft.key}-text-${i + 1}`, packageId: draft.packageId, sheet, polygon: boxPolygon(box), anchor: "text",
      label: (found.length > 1 ? `${draft.title} (${i + 1} of ${found.length})` : draft.title).slice(0, 200), confidence: 0.9, scopeKeys: [draft.key], citations: draft.citations,
    }));
  }
  const kept = drafts.flatMap((draft): DraftInput[] => draft.kind !== "region" ? [draft] : (draft.scopeKeys ?? []).some(key => pinned.has(key)) ? [] : [{ ...draft, anchor: "image" }]);
  return [...kept, ...marks];
}
