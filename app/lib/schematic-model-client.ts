"use client";

// Builds a project's schematic model in the browser (lib/schematic-model): finds the floor-plan and
// section sheets in Project files, has the AI read their images, and turns the readings into levels.

import { useCallback, useRef } from "react";
import { aiJob } from "./ai-more-client";
import type { PartitionTypeRead, PlanReading, PlanTag } from "./ai-jobs-more";
import { mergePartitionTypes, scheduleRow, type PartitionType } from "./tag-placement";
import { drawingRegister, type StoredDocument } from "./project-files";
import { openStoredPdf, readStoredText, renderStoredPage, renderStoredRegion, renderStoredTiles } from "./project-files-client";
import type { Project } from "./projects";
import { vectorsFromOperators } from "./plan-vectors";
import { consensusMarkers, feetPerInch, heightSheet, levelHeights, levelName, contentTiles, levelDoors, levelGlazing, levelPlanSheets, levelTags, levelWalls, partitionTypeSheet, tagTiles, toFeet, type Marker, type SchematicLevel, type SchematicModel, type SchematicRoom } from "./schematic-model";
import { useLocalDraft } from "./use-local-draft";

async function pageSize(doc: StoredDocument, page: number) {
  const viewport = (await (await openStoredPdf(doc)).getPage(page)).getViewport({ scale: 1 });
  return { widthIn: viewport.width / 72, heightIn: viewport.height / 72 };
}

/**
 * The level markers on a section sheet. It is read in 3 × 2 tiles at about three times the resolution
 * of one image (small print was misread at full-sheet size), at most 3 requests at a time. A marker the
 * tiles disagree on (26 or 28 ft) is read once more close up, around where it was read, and that
 * reading counts double. Only values that agree and fit together are kept (consensusMarkers).
 */
export async function readLevelMarkers(doc: StoredDocument, page: number, sheet: string, title: string, signal?: AbortSignal): Promise<{ markers: Marker[]; read: number; warnings: string[] }> {
  const ask = (image: string) => aiJob<{ levels: Marker[] }>("level-heights", { sheet, title, image }, signal).then(r => r.levels);
  const tiles = await renderStoredTiles(doc, page, 3, 2, 2000);
  const readings: Marker[][] = [], boxes: [number, number, number, number][] = [];
  let failed = 0;
  for (let i = 0; i < tiles.length; i += 3) {
    const batch = tiles.slice(i, i + 3);
    (await Promise.allSettled(batch.map(tile => ask(tile.image)))).forEach((result, n) => {
      if (result.status === "fulfilled") { readings.push(result.value); boxes.push(batch[n].box); } else failed++;
    });
  }
  signal?.throwIfAborted();
  if (failed === tiles.length) throw new Error(`The level elevations on ${sheet} could not be read.`);
  let found = consensusMarkers(readings);
  const weights = readings.map(() => 1);
  for (const { reading, at } of found.disputed.slice(0, 3)) {
    const [bx, by, bw, bh] = boxes[reading], px = bx + at[0] * bw, py = by + at[1] * bh;
    const box: [number, number, number, number] = [Math.min(0.85, Math.max(0, px - 0.075)), Math.min(0.92, Math.max(0, py - 0.04)), 0.15, 0.08];
    const closeUp = await renderStoredRegion(doc, page, box, 1600).then(ask).catch(() => null);
    if (closeUp) { readings.push(closeUp); weights.push(2); }
  }
  if (weights.length > boxes.length) found = consensusMarkers(readings, weights);
  return { markers: found.markers, read: readings.filter(r => r.length).length, warnings: [...(failed ? [`${failed} of ${tiles.length} parts of ${sheet} could not be read.`] : []), ...found.warnings] };
}

/** One AI image request per level (a second try if the outline is unusable) plus six small ones for the heights; progress is reported as text. */
export async function buildSchematicModel(args: { documents: StoredDocument[]; project: Project; onProgress?: (text: string) => void; signal?: AbortSignal }): Promise<SchematicModel> {
  const register = drawingRegister(args.documents);
  const plans = levelPlanSheets(register);
  if (!plans.length) throw new Error("No floor plan sheets were found. Upload the architectural drawings in Project files first.");
  const warnings: string[] = [];
  let read: { name: string; elevation: number }[] = [];
  const section = heightSheet(register);
  if (section) {
    args.onProgress?.(`Reading the level elevations on ${section.sheet} (in six parts)…`);
    try {
      const found = await readLevelMarkers(section.doc, section.page, section.sheet, section.title, args.signal);
      read = found.markers;
      warnings.push(...found.warnings);
    } catch (error) {
      if (args.signal?.aborted) throw error;
      warnings.push(`The level elevations on ${section.sheet} could not be read.`);
    }
  } else warnings.push("No section or elevation sheet was found.");
  const heights = levelHeights(plans.map(p => p.level), read);
  warnings.push(...heights.warnings);
  type PlanRead = { level: number; row: (typeof plans)[number]["row"]; reading: PlanReading; page: { widthIn: number; heightIn: number }; scale: number | null; scaleAt: [number, number] | null; borrowed?: string };
  // The printed scale is read close up (at full-sheet size 1/8" was misread as 3/32"): around where it
  // was seen, else along the bottom of the sheet, where drawing titles sit (the title block is on the right).
  const scaleIn = (row: PlanRead["row"], box: [number, number, number, number]) => renderStoredRegion(row.doc, row.page, box, 2000)
    .then(image => aiJob<{ scale: string; title: string }>("drawing-scale", { sheet: row.sheet, image }, args.signal)).catch(() => null);
  const scaleNear = async (row: PlanRead["row"], [sx, sy]: [number, number]) => feetPerInch((await scaleIn(row, [Math.min(0.84, Math.max(0, sx - 0.08)), Math.min(0.95, Math.max(0, sy - 0.025)), 0.16, 0.05]))?.scale ?? "");
  const scaleAlongBottom = async (row: PlanRead["row"]) => {
    const found = await Promise.all(([[0, 0.8, 0.3, 0.2], [0.27, 0.8, 0.3, 0.2], [0.54, 0.8, 0.3, 0.2]] as [number, number, number, number][]).map(box => scaleIn(row, box)));
    const read = found.filter(f => f && feetPerInch(f.scale));
    return feetPerInch((read.find(f => /FLOOR|LEVEL|PLAN/i.test(f!.title)) ?? read[0])?.scale ?? "");
  };
  const plansRead: PlanRead[] = [];
  for (const { level, row } of plans) {
    args.onProgress?.(`Reading the ${levelName(level)} plan (${row.sheet})…`);
    const [{ image }, page, text] = await Promise.all([renderStoredPage(row.doc, row.page, 1800), pageSize(row.doc, row.page), readStoredText(row.doc, { first: row.page, last: row.page })]);
    const ask = () => aiJob<PlanReading>("plan-outline", { sheet: row.sheet, title: row.title, image }, args.signal);
    // ponytail: one retry; readings vary between requests, and an unusable outline is the usual failure.
    const reading = await ask().catch(error => { if (args.signal?.aborted) throw error; return ask(); });
    if (reading.note) warnings.push(`${row.sheet}: ${reading.note}`);
    const closeUp = reading.scaleAt ? await scaleNear(row, reading.scaleAt) : null;
    const scale = closeUp ?? feetPerInch(text[0]?.text ?? "") ?? await scaleAlongBottom(row) ?? feetPerInch(reading.scale);
    plansRead.push({ level, row, reading, page, scale, scaleAt: closeUp ? reading.scaleAt! : null });
  }
  // Floor plans of one set share a sheet size, layout and (nearly always) scale. A plan whose scale
  // wasn't read is read again where a sibling's scale was found; failing that it takes the sibling's
  // scale, so the levels line up instead of one being sized by area.
  const siblingsOf = (o: PlanRead) => plansRead.filter(p => p !== o && p.scale && p.row.doc.id === o.row.doc.id && Math.abs(p.page.widthIn - o.page.widthIn) < 0.5 && Math.abs(p.page.heightIn - o.page.heightIn) < 0.5);
  for (const o of plansRead.filter(p => !p.scale)) {
    for (const sibling of siblingsOf(o).filter(p => p.scaleAt)) { o.scale = await scaleNear(o.row, sibling.scaleAt!); if (o.scale) break; }
    if (!o.scale) { const sibling = siblingsOf(o)[0]; if (sibling) { o.scale = sibling.scale; o.borrowed = sibling.row.sheet; } }
  }
  const scales = plansRead.filter(o => o.scale && !o.borrowed);
  if (new Set(scales.map(o => o.scale)).size > 1) warnings.push(`The floor plans read different scales (${scales.map(o => `${o.row.sheet} ${o.scale} ft per inch`).join(", ")}); check them on the sheets.`);
  const levels: SchematicLevel[] = [];
  for (const { level, row, reading, page, scale, borrowed } of plansRead) {
    const sized = toFeet({ outline: reading.outline, rooms: reading.rooms, page, feetPerInch: scale, targetSf: args.project.squareFeet > 0 ? args.project.squareFeet / plans.length : 0 });
    if (borrowed) { sized.sizing += ` (from ${borrowed}; this sheet's scale wasn't read)`; warnings.push(`${row.sheet}: no printed scale was read; ${borrowed}'s scale is used (same set and sheet size).`); }
    else if (!scale) warnings.push(`${row.sheet}: no printed scale was read; ${sized.sizing.toLowerCase()}.`);
    args.onProgress?.(`Finding the walls on ${row.sheet}…`);
    const found = await planVectorWalls(row.doc, row.page, row.sheet, sized.frame, reading.outline, !!scale, args.signal, args.onProgress).catch(error => { if (args.signal?.aborted) throw error; return { walls: [], doors: [], glazing: [], rooms: [], note: "The sheet's lines could not be read for walls.", tagWarning: "" }; });
    if (!found.walls.length) warnings.push(`${row.sheet}: ${found.note}`);
    if (found.tagWarning) warnings.push(`${row.sheet}: ${found.tagWarning}`);
    levels.push({ id: `L${level}`, name: levelName(level), order: level, elevation: heights.elevations.get(level) ?? 0, height: heights.heights.get(level) ?? 14, outline: sized.outline, rooms: found.rooms.length ? found.rooms : sized.rooms, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page }, sizing: sized.sizing, frame: sized.frame, walls: found.walls, wallNote: found.note, doors: found.doors, glazing: found.glazing });
  }
  // The partition type schedule, to describe the wall types and catch codes it doesn't list.
  const typeSheet = partitionTypeSheet(register);
  let partitionTypes: PartitionType[] | undefined;
  if (typeSheet && levels.some(l => l.walls?.some(w => w.type))) {
    args.onProgress?.(`Reading the partition types on ${typeSheet.sheet}…`);
    try { partitionTypes = await readPartitionTypes(typeSheet.doc, typeSheet.page, typeSheet.sheet, args.signal); }
    catch (error) { if (args.signal?.aborted) throw error; warnings.push(`${typeSheet.sheet}: the partition types could not be read.`); }
    const unknown = [...new Set(levels.flatMap(l => (l.walls ?? []).filter(w => w.type && !w.typeSet && partitionTypes?.length && !scheduleRow(w.type, partitionTypes)).map(w => w.type!)))];
    if (unknown.length) warnings.push(`Wall tags not in the partition schedule on ${typeSheet.sheet} (check them on the plan; they may be misread): ${unknown.join(", ")}.`);
  }
  return { levels, warnings, builtAt: new Date().toISOString(), ...(partitionTypes ? { partitionTypes, partitionSheet: typeSheet!.sheet } : {}) };
}

/** The wall types a partition type sheet schedules, read on the parts of the sheet that hold drawing (lib/ai-jobs-more "partition-types"). */
async function readPartitionTypes(doc: StoredDocument, pageNumber: number, sheetName: string, signal?: AbortSignal): Promise<PartitionType[]> {
  const [pdfjs, pdf] = await Promise.all([import("pdfjs-dist"), openStoredPdf(doc)]);
  const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale: 1 });
  const { segments } = vectorsFromOperators(await page.getOperatorList(), pdfjs.OPS as unknown as Record<string, number>, viewport.transform);
  const rows: PartitionType[] = [];
  const tiles = contentTiles(segments, { widthPt: viewport.width, heightPt: viewport.height });
  for (let i = 0; i < tiles.length; i += 3) await Promise.all(tiles.slice(i, i + 3).map(async tile => {
    rows.push(...(await aiJob<{ types: PartitionTypeRead[] }>("partition-types", { sheet: sheetName, image: await renderStoredRegion(doc, pageNumber, tile, 2000) }, signal)).types);
  }));
  return mergePartitionTypes(rows);
}

/**
 * A plan sheet's walls and doors from its vector lines (lib/plan-vectors, wall- and door-detection), in the
 * level's frame; then their door numbers and wall types from the tags the AI reads on small tiles of the
 * plan (3 at a time), placed through the plan's own tag ovals and leaders (lib/tag-placement).
 */
async function planVectorWalls(doc: StoredDocument, pageNumber: number, sheetName: string, frame: { widthFeet: number; heightFeet: number }, outline: [number, number][], printedScale: boolean, signal?: AbortSignal, onProgress?: (text: string) => void) {
  const [pdfjs, pdf] = await Promise.all([import("pdfjs-dist"), openStoredPdf(doc)]);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 }), sheet = { widthPt: viewport.width, heightPt: viewport.height };
  const { segments, curves } = vectorsFromOperators(await page.getOperatorList(), pdfjs.OPS as unknown as Record<string, number>, viewport.transform);
  const walls = levelWalls(segments, sheet, frame, outline, printedScale);
  const doors = levelDoors(segments, curves, sheet, frame, outline, walls.walls);
  const glazing = levelGlazing(segments, sheet, frame, outline, walls.weight, walls.walls, doors);
  if (!walls.walls.length) return { ...walls, doors, glazing, rooms: [] as SchematicRoom[], tagWarning: "" };
  const tiles = tagTiles(sheet, frame, outline), read: { tile: [number, number, number, number]; tags: PlanTag[] }[] = [];
  let failed = 0;
  for (let i = 0; i < tiles.length; i += 3) {
    onProgress?.(`Reading the door, wall and room tags on ${sheetName} (part ${Math.min(i + 3, tiles.length)} of ${tiles.length})…`);
    await Promise.all(tiles.slice(i, i + 3).map(async tile => {
      try { read.push({ tile, tags: (await aiJob<{ tags: PlanTag[] }>("plan-tags", { sheet: sheetName, image: await renderStoredRegion(doc, pageNumber, tile, 1200) }, signal)).tags }); }
      catch (error) { if (signal?.aborted) throw error; failed++; }
    }));
  }
  const tagged = levelTags(read, segments, curves, sheet, frame, walls.walls, doors, glazing);
  // Room tags read on the tiles are sharper than the whole-sheet reading's; the level keeps those when there are any.
  const rooms: SchematicRoom[] = tagged.tags.filter(t => t.kind === "room").map(t => ({ name: t.name ?? "", number: t.text, at: t.at }));
  return { note: walls.note, walls: tagged.walls, doors: tagged.doors, glazing: tagged.glazing, rooms, tagWarning: failed ? `${failed} of ${tiles.length} parts of the plan could not be read for door and wall tags; some doors and walls have no number or type.` : "" };
}

/** The open project's schematic model under "schematic-model"; `run` applies a correction (moveOutlinePoint, setLevelHeight) or a rebuild and returns null or the error. */
export function useSchematicModel() {
  const [model, setModel] = useLocalDraft<SchematicModel | null>("schematic-model", null);
  const latest = useRef(model);
  latest.current = model;
  const run = useCallback((action: (m: SchematicModel | null) => SchematicModel | null): string | null => {
    try { const next = action(latest.current); latest.current = next; setModel(next); return null; }
    catch (error) { return error instanceof Error ? error.message : "The model could not be changed."; }
  }, [setModel]);
  return { model, run };
}
