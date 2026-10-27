import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const T = await import("../lib/text-anchor.ts");
const E = await import("../lib/extraction.ts");
const F = await import("../lib/drawing-flip.ts");

// Highlights pinned to the words on the sheet (Marcel, 24 Oct: the AI's marks landed in random places).
const box = (str, x, y, w = 0.1, h = 0.01) => ({ str, x, y, w, h });
const sheet = [
  box("KEYNOTES", 0.85, 0.10, 0.08),
  box("SF-4 STOREFRONT, ALUMINUM", 0.85, 0.12, 0.12),
  box("09 29 00.A1 GYPSUM BOARD TYPE X", 0.85, 0.14, 0.14),
  box("SF-4", 0.20, 0.40, 0.02), box("SF-4", 0.55, 0.62, 0.02), box("SF-41", 0.30, 0.70, 0.025),
  box("PROVIDE FIRE-RATED HEAD-OF-WALL", 0.10, 0.80, 0.16), box("JOINTS AT RATED ASSEMBLIES.", 0.10, 0.812, 0.14),
];

// A tag is marked everywhere it is printed, as a whole code only.
assert(T.isTag("SF-4") && T.isTag("A8.1") && T.isTag("09") && !T.isTag("Gypsum board") && !T.isTag("TYPE"), "Tags are short codes with a digit");
const tags = T.findOnSheet(sheet, "SF-4");
assert.equal(tags.length, 3, "The legend line and both places on the plan; SF-41 is a different tag");
assert(tags.every(b => b.width < 0.05 && b.height < 0.03), "Each mark is the tag itself, not its whole line");
assert(tags[0].x < 0.86 && tags[0].x + tags[0].width < 0.88, "In a longer line, only the tag's characters are marked");
assert.equal(T.findOnSheet(sheet, "SF-4", 2).length, 2, "At most the limit");

// A sentence is marked where it is written, across the lines it wraps over.
const note = T.findOnSheet(sheet, "Provide fire-rated head-of-wall joints at rated assemblies.");
assert.equal(note.length, 1);
assert(note[0].y < 0.8 && note[0].y + note[0].height > 0.82 && note[0].x < 0.11, "Both lines of the note");
assert.equal(T.findOnSheet(sheet, "09 29 00.A1 Gypsum board Type X").length, 1, "A keynote line by its words");
assert.equal(T.findOnSheet(sheet, "Provide fire-rated head-of-wall joints at every door frame, all floors").length, 1, "The opening words place a quote whose end the AI changed");
assert.deepEqual(T.findOnSheet(sheet, "Hollow metal frames, welded"), [], "Words not on the sheet place nothing");
assert.deepEqual(T.findOnSheet(sheet, "  "), []);
assert.deepEqual(T.boxPolygon({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }).map(p => [p.x, p.y]), [[0.1, 0.2], [0.4, 0.2], [0.4, 0.3], [0.1, 0.3]]);

// A drawing reading's findings: text pins replace the AI's outline; an outline the text can't place stays, approximate.
const cite = (quote) => [{ document: "set.pdf", page: 46, sheet: "A1.1", quote }];
const outline = [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.6, y: 0.6 }];
const drafts = [
  { kind: "scope", key: "d1", packageId: "glazing", title: "Storefront SF-4", detail: "", source: "A1.1", citations: cite("SF-4") },
  { kind: "region", key: "d1-region", packageId: "glazing", label: "Storefront SF-4", sheet: "A1.1", polygon: outline, confidence: 0.5, scopeKeys: ["d1"], citations: cite("SF-4") },
  { kind: "scope", key: "d2", packageId: "drywall", title: "Hollow metal frames", detail: "", source: "A1.1", citations: cite("Hollow metal frames, welded") },
  { kind: "region", key: "d2-region", packageId: "drywall", label: "Frames", sheet: "A1.1", polygon: outline, confidence: 0.5, scopeKeys: ["d2"], citations: cite("Hollow metal frames, welded") },
  { kind: "scope", key: "d3", packageId: "drywall", title: "Head-of-wall joints", detail: "", source: "A1.1", citations: cite("PROVIDE FIRE-RATED HEAD-OF-WALL JOINTS") },
];
const pinned = T.pinFindings(drafts, new Map([["A1.1", sheet]]));
const regions = pinned.filter(d => d.kind === "region");
assert.deepEqual(regions.map(r => [r.key, r.anchor, r.scopeKeys[0]]), [["d2-region", "image", "d2"], ["d1-text-1", "text", "d1"], ["d1-text-2", "text", "d1"], ["d1-text-3", "text", "d1"], ["d3-text-1", "text", "d3"]]);
assert.equal(regions[1].label, "Storefront SF-4 (1 of 3)");
assert.equal(pinned.filter(d => d.kind === "scope").length, 3, "Scope findings are untouched");
assert.deepEqual(T.pinFindings(drafts, new Map()).filter(d => d.kind === "region").map(r => r.anchor), ["image", "image"], "No text layer: the AI's outlines stay, approximate");

// The anchor travels with the finding to the Drawing Flip highlight.
const proc = { packages: [{ id: "glazing", name: "Aluminum & glazing", division: "08", code: "08 40 00", owner: "", due: "" }, { id: "drywall", name: "Drywall", division: "09", code: "09 29 00", owner: "", due: "" }], scopes: [], invitations: [], outreach: [], notifications: [] };
const run = { packageIds: ["glazing", "drywall"], engine: { mode: "live", model: "m" }, documents: [{ name: "set.pdf", pages: 200 }], startedAt: "2026-10-27T00:00:00Z", finishedAt: "2026-10-27T00:00:00Z", drafts: pinned };
const ext = E.recordRun(E.EMPTY_EXTRACTION, proc, run);
const textMark = ext.drafts.find(d => d.kind === "region" && d.anchor === "text");
const flip = F.addPage(F.EMPTY_DRAWING_FLIP, { sheet: "A1.1", documentId: "set", pageNumber: 46 });
let records = { extraction: ext, procurement: proc, flip };
records = E.acceptDraft(records, ext.drafts.find(d => d.kind === "scope" && d.packageId === "glazing").id, "Sadie");
records = E.acceptDraft(records, textMark.id, "Sadie");
assert.equal(records.flip.regions.at(-1).anchor, "text", "Accepted, the highlight remembers it sits on the printed words");
const mine = F.addRegion(flip, proc, { pageId: flip.pages[0].id, label: "Mine", polygon: outline, packageId: "drywall", anchor: "image" }, "Sadie");
assert.equal(mine.regions[0].anchor, undefined, "An estimator's own region has no AI anchor");

// A sheet with no text layer (27 Oct, live: A12.1 is an image): OCR reads it in overlapping tiles.
const tileWord = (text, x0, y0, x1, y1, confidence = 90) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
const tiles = [
  { box: { x: 0, y: 0, width: 0.56, height: 1 }, width: 1120, height: 1000, words: [tileWord("CERAMIC", 100, 100, 240, 130), tileWord("TILE", 250, 100, 330, 130), tileWord("FLOOR", 1080, 500, 1118, 520), tileWord("smudge", 400, 400, 460, 420, 12)] },
  { box: { x: 0.44, y: 0, width: 0.56, height: 1 }, width: 1120, height: 1000, words: [tileWord("FLOOR", 200, 500, 238, 520), tileWord("WALL", 900, 800, 980, 830), tileWord("TlLE", 990, 800, 1060, 830)] },
];
const read = T.sheetWords(tiles);
assert.deepEqual(read.map(w => w.str), ["CERAMIC", "TILE", "FLOOR", "WALL", "TlLE"], "Reading order; unsure words left out; a word read on both tiles kept once");
const ceramic = read[0];
assert(Math.abs(ceramic.x - 0.05) < 1e-9 && Math.abs(ceramic.y - 0.1) < 1e-9 && Math.abs(ceramic.w - 0.07) < 1e-9 && Math.abs(ceramic.h - 0.03) < 1e-9, "Tile pixels become page fractions");
assert(Math.abs(read[2].x - 0.54) < 1e-9 && read.filter(w => w.str === "FLOOR").length === 1, "The overlap's word, read on both tiles at the same place, is kept once");

// Words read by OCR may be a letter or two off: found close, never something unlike them.
assert.deepEqual(T.approximateFind("XXCERAMICTILEYY", "CERAMICTILE", 0), { at: 2, end: 13 });
assert.deepEqual(T.approximateFind("XXCERAMlCTlLEYY", "CERAMICTILE", 2), { at: 2, end: 13 });
assert.equal(T.approximateFind("XXCERAMlCTlLEYY", "CERAMICTILE", 1), null, "Not with more letters wrong than allowed");
assert.equal(T.approximateFind("PORCELAINTILE", "CERAMICTILE", 2), null);
assert.equal(T.findOnSheet(read, "WALL TILE").length, 0, "Exact matching doesn't accept OCR's TlLE");
const wall = T.findOnSheet(read, "WALL TILE", 12, { fuzzy: true });
assert.equal(wall.length, 1, "Fuzzy matching does");
assert(wall[0].x < 0.44 + (900 / 1120) * 0.56 + 0.001 && wall[0].y < 0.8 && wall[0].y + wall[0].height > 0.83, "Over WALL TlLE, not CERAMIC TILE");
assert.equal(T.findOnSheet(read, "CERAMIC TILE", 12, { fuzzy: true })[0].y < 0.2, true, "CERAMIC TILE where it is printed");
assert.deepEqual(T.findOnSheet(read, "MEMBRANE WATERPROOFING", 12, { fuzzy: true }), [], "Words not on the sheet still place nothing");

console.log("Text anchors checked: tags everywhere printed (whole codes only), notes across wrapped lines, opening-words fallback, pinned findings replace AI outlines, leftovers approximate, anchor kept on the accepted highlight.");
