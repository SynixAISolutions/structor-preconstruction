"use client";

// Builds a project's schematic model in the browser (lib/schematic-model): finds the floor-plan and
// section sheets in Project files, has the AI read their images, and turns the readings into levels.

import { useCallback, useRef } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { aiJob } from "./ai-more-client";
import type { PartitionKeyRead, PartitionTypeRead, PlanReading, PlanTag } from "./ai-jobs-more";
import { doorNumber, doorScheduleSheets, matchDoorSizes, printedDoorSizes, type SourcedDoorSize } from "./door-schedule-dimensions";
import { printedPlanLevels } from "./floor-plan-label";
import { glazingDetailSheets, glazingDetailSource, glazingSizeForTag, printedGlazingElevations, printedGlazingReferences, printedWindowSizes, type GlazingDetailReference } from "./glazing-detail-references";
import type { WallLayer } from "./wall-assemblies";
import { mergePartitionTypes, scheduleRow, tagKey, type PartitionType } from "./tag-placement";
import { drawingRegister, type RegisterRow, type StoredDocument } from "./project-files";
import { openStoredPdf, readPageTextBoxes, readStoredText, renderStoredPage, renderStoredRegion, renderStoredRow, renderStoredTiles } from "./project-files-client";
import { pageTurn } from "./page-turns";
import type { Project } from "./projects";
import { vectorsFromOperators, type Point } from "./plan-vectors";
import { drawingLengthFeet, drawingTextRuns } from "./drawing-dimensions";
import { isFinishSchedule } from "./finish-schedule";
import { printedFloorFinishes, printedSlabNotes, slabNoteArea, slabNoteLevel, type FloorAssemblyDetail, type FloorFinishNote } from "./schematic-floor-details";
import { assemblyCaptions, assemblyTextMatches, assemblyThickness, floorAssemblySheet, floorLeaderLayers, printedFloorDetailReferences, wallAssemblySheet, type AssemblyKind, type AssemblyRead, type FloorDetailReference } from "./schematic-assembly-drawings";
import { holdOutsidePlanRuns } from "./schematic-plan-review";
import { matchPrintedWallTags, printedWallTags, typeWallContinuations } from "./schematic-printed-wall-tags";
import { pageTextBoxes } from "./text-anchor";
import { planRegistration } from "./schematic-plan-alignment";
import { assembleFloorPlans, type FloorPlanBuild, type ReadFloorPlan } from "./schematic-plan-areas";
import { clipPlanBox, containsPlanPoint, pointOnPlanSheet, separatedPlanViews, type PlanBox, type PlanView } from "./schematic-plan-views";
import { alignStackedPlan, printedPlanGrid, type PlanGrid } from "./schematic-stack-grid";
import { slabDimension, structuralFloorLevels, structuralFloorView, structuralSlabOutline, type StructuralSlab } from "./schematic-structural-slabs";
import { addTaggedDoorOpenings, printedDoorTags } from "./tagged-door-openings";
import { consensusMarkers, feetPerInch, floorPlanArea, heightSheets, levelHeights, levelName, contentTiles, levelColumns, levelDoors, levelGlazing, levelOpenings, levelPartitions, levelFlights, levelPlanSheets, levelTags, levelWalls, stairsArriving, type LevelFlights, partitionTypeSheet, tagTiles, toFeet, type Marker, type SchematicLevel, type PlanSource, type SchematicModel, type SchematicRoom } from "./schematic-model";
import { printedSectionDatums, resolveSectionDatums, sectionDatumLevel, type SourcedDatum } from "./section-datums";
import { useLocalDraft } from "./use-local-draft";

async function pageSize(doc: StoredDocument, page: number) {
  const viewport = (await (await openStoredPdf(doc)).getPage(page)).getViewport({ scale: 1 });
  return { widthIn: viewport.width / 72, heightIn: viewport.height / 72 };
}

async function readDetailDrawing(doc: StoredDocument, pageNumber: number, signal?: AbortSignal, readClipRings = false) {
  const [pdfjs, pdf] = await Promise.all([import("pdfjs-dist"), openStoredPdf(doc)]);
  const page: PDFPageProxy = await pdf.getPage(pageNumber);
  const view = page.getViewport({ scale: 1 });
  const { items } = await pageTurn(() => page.getTextContent(), true);
  const words = items.filter(item => "str" in item);
  const operators = await pageTurn(() => page.getOperatorList(), true).catch(() => null);
  signal?.throwIfAborted();
  const vectors = operators ? vectorsFromOperators(operators, pdfjs.OPS as unknown as Record<string, number>, view.transform, readClipRings) : null;
  return {
    boxes: pageTextBoxes(words, view),
    text: drawingTextRuns(words, view),
    segments: vectors?.segments ?? [],
    curves: vectors?.curves ?? [],
    clips: vectors?.clips ?? [],
    page: { width: view.width, height: view.height },
  };
}

type PlanRow = RegisterRow & { view?: PlanView; viewLevel?: number; typicalView?: boolean };
const sourceOfPlan = (row: PlanRow): PlanSource => ({
  documentId: row.doc.id, sheet: row.sheet, page: row.page, ...(row.view ? { quote: row.view.title } : {}),
});

/** Use the view captions from a shared sheet and keep its original sheet and page as evidence. */
async function readPlanRows(register: RegisterRow[], warnings: string[], onProgress?: (text: string) => void, signal?: AbortSignal): Promise<PlanRow[]> {
  const rows: PlanRow[] = [];
  for (const row of register) {
    const listed = row.discipline === "Architectural" ? printedPlanLevels(row.title) : [];
    if (listed.length < 2) { rows.push(row); continue; }
    signal?.throwIfAborted();
    onProgress?.(`Separating the floor-plan views on ${row.sheet}…`);
    const drawing = await readDetailDrawing(row.doc, row.page, signal).catch(() => null);
    signal?.throwIfAborted();
    const views = drawing ? separatedPlanViews(drawing.page, drawing.text, drawing.segments) : [];
    if (!views.length || views.length === 1 && views[0].levels.length < listed.length) {
      warnings.push(`${row.sheet} contains multiple floor plans. Their separate view boundaries could not be verified.`);
      continue;
    }
    const shown = new Set(views.flatMap(view => view.levels));
    if (shown.size !== listed.length || listed.some(level => !shown.has(level))) {
      warnings.push(`${row.sheet} has different level numbers in its sheet title and view captions. The model follows the printed view captions.`);
    }
    for (const view of views) {
      for (const viewLevel of view.levels) rows.push({ ...row, title: view.title, view, viewLevel, typicalView: view.levels.length > 1 });
    }
  }
  return rows;
}

/**
 * The level markers on a section sheet. It is read in 3 × 2 tiles at about three times the resolution
 * of one image (small print was misread at full-sheet size), at most 3 requests at a time. A marker the
 * tiles disagree on (26 or 28 ft) is read once more close up, around where it was read, and that
 * reading counts double. Only values that agree and fit together are kept (consensusMarkers).
 */
export async function readLevelMarkers(doc: StoredDocument, page: number, sheet: string, title: string, signal?: AbortSignal): Promise<{ markers: Marker[]; read: number; warnings: string[] }> {
  const ask = (image: string) => aiJob<{ levels: Marker[] }>("level-heights", { sheet, title, image }, signal).then(r => r.levels);
  const tiles = await renderStoredTiles(doc, page, 3, 2, 2000, 0.06, true);
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
    const closeUp = await renderStoredRegion(doc, page, box, 1600, true).then(ask).catch(() => null);
    if (closeUp) { readings.push(closeUp); weights.push(2); }
  }
  if (weights.length > boxes.length) found = consensusMarkers(readings, weights);
  return { markers: found.markers, read: readings.filter(r => r.length).length, warnings: [...(failed ? [`${failed} of ${tiles.length} parts of ${sheet} could not be read.`] : []), ...found.warnings] };
}

/** Build from the current drawings, preferring printed dimensions; use image readings for drawings without usable text. */
export async function buildSchematicModel(args: { documents: StoredDocument[]; project: Project; onProgress?: (text: string) => void; signal?: AbortSignal }): Promise<SchematicModel> {
  const register = drawingRegister(args.documents);
  const warnings: string[] = [];
  const plans = levelPlanSheets(await readPlanRows(register, warnings, args.onProgress, args.signal));
  if (!plans.length) throw new Error(warnings.length ? warnings.join(" ") : "No floor plan sheets were found. Upload the architectural drawings in Project files first.");
  const alignStack = plans.some(({ row, areas }) => row.view || areas?.some(area => area.view));
  const sections = heightSheets(register).slice(0, 3), section = sections[0];
  const datums: SourcedDatum[] = [];
  for (const row of sections) {
    args.signal?.throwIfAborted();
    args.onProgress?.(`Reading printed level elevations on ${row.sheet}…`);
    const boxes = await pageTurn(() => readPageTextBoxes(row.doc, row.page), true).catch(() => []);
    for (const { name, elevation, quote } of printedSectionDatums(boxes)) {
      datums.push({ name, elevation, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote } });
    }
  }
  let read: Marker[] = [];
  if (datums.length) {
    const found = resolveSectionDatums(datums);
    read = found.markers;
    warnings.push(...found.warnings);
  } else if (section) {
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
  const planOrders = plans.map(p => p.level);
  if (alignStack) {
    const sectionOnly = read.flatMap(datum => {
      const order = sectionDatumLevel(datum.name);
      return order !== null && Number.isFinite(order) && !planOrders.includes(order) ? [levelName(order)] : [];
    });
    if (sectionOnly.length) warnings.push(`Section datums with no corresponding floor-plan view: ${[...new Set(sectionOnly)].join(", ")}.`);
  }
  const heights = levelHeights(planOrders, read);
  warnings.push(...heights.warnings);
  type ReadPlan = { reading: PlanReading; page: { widthIn: number; heightIn: number }; scale: number | null; scaleAt: Point | null };
  type PlanRead = ReadPlan & { level: number; row: PlanRow; borrowed?: string };
  // The printed scale is read close up (at full-sheet size 1/8" was misread as 3/32"): around where it
  // was seen, else along the bottom of the sheet, where drawing titles sit (the title block is on the right).
  const scaleIn = (row: PlanRow, box: PlanBox) => {
    const crop = row.view ? clipPlanBox(box, row.view.box) : box;
    return crop ? renderStoredRegion(row.doc, row.page, crop, 2000, true)
      .then(image => aiJob<{ scale: string; title: string }>("drawing-scale", { sheet: row.sheet, image }, args.signal)).catch(() => null) : Promise.resolve(null);
  };
  const scaleNear = async (row: PlanRead["row"], [sx, sy]: [number, number]) => feetPerInch((await scaleIn(row, [Math.min(0.84, Math.max(0, sx - 0.08)), Math.min(0.95, Math.max(0, sy - 0.025)), 0.16, 0.05]))?.scale ?? "");
  const scaleAlongBottom = async (row: PlanRead["row"]) => {
    const found = await Promise.all(([[0, 0.8, 0.3, 0.2], [0.27, 0.8, 0.3, 0.2], [0.54, 0.8, 0.3, 0.2]] as [number, number, number, number][]).map(box => scaleIn(row, box)));
    const read = found.filter(f => f && feetPerInch(f.scale));
    return feetPerInch((read.find(f => /FLOOR|LEVEL|PLAN/i.test(f!.title)) ?? read[0])?.scale ?? "");
  };
  const plansRead: PlanRead[] = [];
  const readView = async (row: PlanRow): Promise<ReadPlan> => {
    const view = row.view;
    const imageRead = view ? renderStoredRegion(row.doc, row.page, view.box, 2000, true)
      : renderStoredPage(row.doc, row.page, 1800, true).then(r => r.image);
    const [image, page, text] = await Promise.all([imageRead, pageSize(row.doc, row.page),
      view ? [] : readStoredText(row.doc, { first: row.page, last: row.page })]);
    const ask = () => aiJob<PlanReading>("plan-outline", { sheet: row.sheet, title: row.title, image }, args.signal);
    const result = await ask().catch(error => { if (args.signal?.aborted) throw error; return ask(); });
    const reading: PlanReading = view ? {
      ...result,
      outline: result.outline.map(point => pointOnPlanSheet(point, view.box)),
      rooms: result.rooms.map(room => ({ ...room, at: pointOnPlanSheet(room.at, view.box) })),
      scaleAt: result.scaleAt ? pointOnPlanSheet(result.scaleAt, view.box) : result.scaleAt,
    } : result;
    if (reading.note) warnings.push(row.sheet + ": " + reading.note);
    const closeUp = reading.scaleAt && !view?.scale ? await scaleNear(row, reading.scaleAt) : null;
    const scale = view ? view.scale ?? closeUp ?? feetPerInch(reading.scale)
      : closeUp ?? feetPerInch(text[0]?.text ?? "") ?? await scaleAlongBottom(row) ?? feetPerInch(reading.scale);
    return { reading, page, scale, scaleAt: closeUp ? reading.scaleAt! : null };
  };
  const viewReads = new Map<PlanView, Promise<ReadPlan>>();
  const splitLevels = new Set(plans.filter(plan => plan.areas?.length).map(plan => plan.level));
  const unreadPlans = new Map<number, PlanSource[]>();
  for (const { level, row } of plans.flatMap(({ level, row, areas }) => [row, ...(areas ?? [])].map(row => ({ level, row })))) {
    args.onProgress?.("Reading the " + levelName(level) + " plan (" + row.sheet + ")…");
    try {
      const result = row.view && viewReads.get(row.view) || readView(row);
      if (row.view) viewReads.set(row.view, result);
      plansRead.push({ level, row, ...await result });
    } catch (error) {
      if (args.signal?.aborted || !row.view && !splitLevels.has(level)) throw error;
      warnings.push(`${row.sheet}: the ${levelName(level)} view could not be read. Check the source plan.`);
      const source = sourceOfPlan(row);
      unreadPlans.set(level, [...(unreadPlans.get(level) ?? []), source]);
    }
  }
  if (!plansRead.length) throw new Error("The floor plan outlines could not be read.");
  // Floor plans of one set share a sheet size, layout and (nearly always) scale. A plan whose scale
  // wasn't read is read again where a sibling's scale was found; failing that it takes the sibling's
  // scale, so the levels line up instead of one being sized by area.
  const siblingsOf = (o: PlanRead) => plansRead.filter(p => p !== o && !p.row.view && p.scale && p.row.doc.id === o.row.doc.id && Math.abs(p.page.widthIn - o.page.widthIn) < 0.5 && Math.abs(p.page.heightIn - o.page.heightIn) < 0.5);
  for (const o of plansRead.filter(p => !p.scale && !p.row.view)) {
    for (const sibling of siblingsOf(o).filter(p => p.scaleAt)) { o.scale = await scaleNear(o.row, sibling.scaleAt!); if (o.scale) break; }
    if (!o.scale) { const sibling = siblingsOf(o)[0]; if (sibling) { o.scale = sibling.scale; o.borrowed = sibling.row.sheet; } }
  }
  const scales = plansRead.filter(o => o.scale && !o.borrowed);
  if (new Set(scales.map(o => o.scale)).size > 1) warnings.push(`The floor plans read different scales (${scales.map(o => `${o.row.sheet} ${o.scale} ft per inch`).join(", ")}); check them on the sheets.`);
  const partitionTypes = await readModelWallTypes(register, warnings, args.signal, args.onProgress);
  const floorSheets = register.filter(floorAssemblySheet);
  const slabPlans = register.filter(row => row.discipline === "Structural" && structuralFloorLevels(row.title).length);
  const floorSheetKeys = new Set(floorSheets.map(row => row.sheet.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  const areasOf = new Map<number, ReadFloorPlan[]>();
  const viewGeometry = new Map<PlanView, Awaited<ReturnType<typeof planVectorWalls>>>();
  for (const { level, row, reading, page, scale, borrowed } of plansRead) {
    const sized = toFeet({ outline: reading.outline, rooms: reading.rooms, page, feetPerInch: scale, targetSf: args.project.squareFeet > 0 && !row.view && !splitLevels.has(level) ? args.project.squareFeet / plans.length : 0 });
    if (borrowed) { sized.sizing += ` (from ${borrowed}; this sheet's scale wasn't read)`; warnings.push(`${row.sheet}: no printed scale was read; ${borrowed}'s scale is used (same set and sheet size).`); }
    else if (!scale) warnings.push(`${row.sheet}: no printed scale was read; ${sized.sizing.toLowerCase()}.`);
    args.onProgress?.(`Finding the walls on ${row.sheet}…`);
    const found = row.view && viewGeometry.get(row.view) || await planVectorWalls(row.doc, row.page, row.sheet, sized.frame, reading.outline,
      { scaled: !!scale, printedScale: !borrowed && !!scale, alignAreas: splitLevels.has(level), alignStack, readSlabGrid: slabPlans.length > 0, view: row.view, partitionTypes, floorSheetKeys, signal: args.signal, onProgress: args.onProgress })
      .catch(error => {
        if (args.signal?.aborted) throw error;
        return { walls: [], doors: [], glazing: [], partitions: [], columns: [], openings: [], flights: { arriving: [], rising: [] } as LevelFlights, rooms: [], floorReferences: [] as FloorDetailReference[], note: "The sheet's lines could not be read for walls.", tagWarning: "", registration: null, grid: [] };
      });
    if (row.view) viewGeometry.set(row.view, found);
    if (!found.walls.length) warnings.push(`${row.sheet}: ${found.note}`);
    if (found.tagWarning) warnings.push(`${row.sheet}: ${found.tagWarning}`);
    const area: ReadFloorPlan = {
      area: floorPlanArea(row.title),
      registration: found.registration,
      grid: found.grid,
      flights: found.flights,
      level: {
        id: "L" + level, name: levelName(level), order: level,
        elevation: heights.elevations.get(level) ?? 0, height: heights.heights.get(level) ?? 14,
        vertical: heights.vertical.get(level), outline: sized.outline, rooms: found.rooms.length ? found.rooms : sized.rooms,
        source: sourceOfPlan(row), sizing: sized.sizing, frame: sized.frame, floorReferences: found.floorReferences,
        walls: found.walls, wallNote: found.note, doors: found.doors, glazing: found.glazing, partitions: found.partitions,
        columns: found.columns, openings: level === plansRead[0].level ? [] : found.openings,
      },
    };
    const other = areasOf.get(level);
    if (other) other.push(area);
    else areasOf.set(level, [area]);
  }
  const levels: SchematicLevel[] = [], flightsOf = new Map<number, LevelFlights>();
  const gridCandidates = [areasOf.get(1)?.[0], ...[...areasOf.values()].map(areas => areas[0])];
  const anchorGrid = alignStack ? gridCandidates.find(plan => plan && alignStackedPlan(plan.grid, plan.grid))?.grid : undefined;
  let previous: FloorPlanBuild["placement"] | undefined;
  for (const [order, areas] of areasOf) {
    const offset = anchorGrid ? alignStackedPlan(anchorGrid, areas[0].grid) : null;
    const built = assembleFloorPlans(areas, alignStack ? undefined : previous, offset ?? undefined);
    if (alignStack && !offset) {
      built.level.alignmentUnverified = true;
      warnings.push(`${built.level.name} can be inspected separately. Its position needs review because the printed grids could not be matched.`);
    }
    const unread = unreadPlans.get(order);
    if (unread?.length) built.level.unplacedPlans = [...(built.level.unplacedPlans ?? []), ...unread];
    levels.push(built.level);
    flightsOf.set(order, built.flights);
    warnings.push(...built.warnings);
    previous = built.placement;
  }
  if (slabPlans.length) await readStructuralSlabs(slabPlans, levels, areasOf, warnings, args.signal, args.onProgress);
  // Stairs arrive at a level from the one below; a stair its plan draws without an arrow takes its direction from the plan below.
  const lowest = Math.min(...levels.map(l => l.order));
  for (const l of levels) {
    const below = [...flightsOf.keys()].filter(k => k < l.order).sort((p, q) => q - p)[0];
    const alignedBelow = below !== undefined && !l.alignmentUnverified && !levels.find(level => level.order === below)?.alignmentUnverified;
    l.stairs = l.order === lowest ? [] : stairsArriving(flightsOf.get(l.order) ?? { arriving: [], rising: [] },
      alignedBelow ? flightsOf.get(below) ?? null : null);
  }
  // A schedule supplies the door size independently of the plan. Match only doors on scaled plans.
  const scaledLevels = new Set(plansRead.filter(plan => plan.scale && !plan.borrowed).map(plan => plan.level));
  if (levels.some(level => scaledLevels.has(level.order) && level.doors?.some(door => door.kind === "door" && door.number))) {
    const sizes: SourcedDoorSize[] = [];
    for (const row of doorScheduleSheets(register)) {
      args.signal?.throwIfAborted();
      args.onProgress?.(`Matching scheduled door sizes on ${row.sheet}…`);
      try {
        const boxes = await pageTurn(() => readPageTextBoxes(row.doc, row.page), true);
        for (const size of printedDoorSizes(boxes)) {
          sizes.push({ ...size, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote: size.number } });
        }
      } catch (error) {
        if (args.signal?.aborted) throw error;
        warnings.push(`${row.sheet}: could not read the door schedule.`);
      }
    }
    const numbers = levels.flatMap(level => (level.doors ?? []).flatMap(door => door.kind === "door" && door.number ? [doorNumber(door.number)] : []));
    const uniqueMarks = new Set([...Map.groupBy(numbers, number => number)].filter(([, marks]) => marks.length === 1).map(([number]) => number));
    const conflicts = new Set<string>();
    for (const level of levels) {
      if (!level.doors || !scaledLevels.has(level.order)) continue;
      const matched = matchDoorSizes(level.doors, sizes, uniqueMarks);
      level.doors = matched.doors;
      for (const mark of matched.conflicts) conflicts.add(mark);
    }
    if (conflicts.size) {
      const list = [...conflicts];
      warnings.push(`Door sizes need review for ${list.slice(0, 15).join(", ")}${list.length > 15 ? ` and ${list.length - 15} more` : ""}. Check repeated marks and differences between the plans and schedules.`);
    }
  }
  if (levels.some(level => level.glazing?.some(glass => glass.type))) {
    const refs: GlazingDetailReference[] = [];
    for (const row of glazingDetailSheets(register)) {
      args.signal?.throwIfAborted();
      args.onProgress?.("Reading glazing dimensions on " + row.sheet + "…");
      try {
        const detail = await readDetailDrawing(row.doc, row.page, args.signal);
        const reads = [
          ...printedGlazingElevations(detail.text, detail.segments),
          ...printedWindowSizes(detail.boxes),
        ];
        for (const { tag, quote, size } of reads) {
          refs.push({ tag, size, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote } });
        }
      } catch (error) {
        if (args.signal?.aborted) throw error;
        const boxes = await pageTurn(() => readPageTextBoxes(row.doc, row.page), true).catch(() => []);
        for (const { tag, quote } of printedGlazingReferences(boxes)) {
          refs.push({ tag, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote } });
        }
      }
    }
    for (const level of levels) {
      level.glazing = level.glazing?.map(glass => {
        if (!glass.type) return glass;
        const elevationDetail = glazingDetailSource(glass.type, refs);
        const dimensions = glazingSizeForTag(glass.type, refs);
        return { ...glass, ...(elevationDetail ? { elevationDetail } : {}), ...(dimensions ? { dimensions } : {}) };
      });
    }
  }
  const floorFinishes: FloorFinishNote[] = [];
  for (const row of register) {
    const order = slabNoteLevel(row);
    const level = order === null ? undefined : levels.find(level => level.order === order);
    if (!level && !(row.discipline === "Architectural" && isFinishSchedule(row.title))) continue;
    args.signal?.throwIfAborted();
    args.onProgress?.("Reading floor details on " + row.sheet + "…");
    const source = { documentId: row.doc.id, sheet: row.sheet, page: row.page };
    try {
      if (level) {
        const planArea = slabNoteArea(row, level, register);
        if (planArea === undefined) continue;
        const saved = await readStoredText(row.doc, { first: row.page, last: row.page });
        const notes = printedSlabNotes(saved[0]?.text ?? "");
        if (notes.length) level.floorAssemblies = [...(level.floorAssemblies ?? []),
          ...notes.map(({ quote, layers }) => ({ source: { ...source, quote }, layers, planArea }))];
      } else {
        const detail = await readDetailDrawing(row.doc, row.page, args.signal);
        for (const finish of printedFloorFinishes(detail.boxes, detail.segments, detail.page)) {
          floorFinishes.push({ ...finish, source: { ...source, quote: finish.tag } });
        }
      }
    } catch (error) {
      if (args.signal?.aborted) throw error;
      warnings.push(row.sheet + ": the floor details could not be read.");
    }
  }
  const floorDetails: FloorAssemblyDetail[] = [];
  for (const row of floorSheets) {
    args.signal?.throwIfAborted();
    args.onProgress?.("Reading floor assembly diagrams on " + row.sheet + "…");
    try {
      const detail = await readAssemblySheet(row, "floor", args.signal);
      floorDetails.push(...detail.floorDetails);
      if (detail.failed || !detail.floorDetails.length) warnings.push(row.sheet + ": some floor assembly labels need review.");
    } catch (error) {
      if (args.signal?.aborted) throw error;
      warnings.push(row.sheet + ": the floor assembly diagrams could not be read.");
    }
  }
  const unknown = [...new Set(levels.flatMap(l => (l.walls ?? []).flatMap(w =>
    w.type && partitionTypes.length && !scheduleRow(w.type, partitionTypes) ? [w.type] : [])))];
  if (unknown.length) warnings.push("Wall types awaiting a unique detail match: " + unknown.join(", ") + ".");
  const sheets = new Set(partitionTypes.map(type => type.source?.sheet).filter(Boolean));
  const partitionSheet = sheets.size === 1 ? [...sheets][0] : undefined;
  return { levels, warnings, builtAt: new Date().toISOString(), ...(floorFinishes.length ? { floorFinishes } : {}),
    ...(partitionTypes.length ? { partitionTypes, partitionSheet } : {}), ...(floorDetails.length ? { floorDetails } : {}) };
}

/**
 * The partition type sheet read again for each wall type's layers, for a model built before layers were read: that one
 * sheet's parts and one text reading, not a rebuild. Pass the result to setPartitionTypes.
 */
export async function readWallLayers(documents: StoredDocument[], signal?: AbortSignal): Promise<{ partitionTypes: PartitionType[]; partitionSheet: string }> {
  const register = drawingRegister(documents), warnings: string[] = [];
  const partitionTypes = await readModelWallTypes(register, warnings, signal);
  const partitionSheet = partitionTypes.find(type => type.source)?.source?.sheet ?? partitionTypeSheet(register)?.sheet;
  if (!partitionSheet || !partitionTypes.length) throw new Error(warnings.join(" ") || "Upload the wall types or assembly details to read the layers.");
  return { partitionTypes, partitionSheet };
}

/** Register structural contours in the same coordinate frame as each placed architectural plan. */
async function readStructuralSlabs(
  rows: RegisterRow[], levels: SchematicLevel[], areas: ReadonlyMap<number, ReadFloorPlan[]>, warnings: string[],
  signal?: AbortSignal, progress?: (text: string) => void,
) {
  const matches = new Map<string, StructuralSlab[]>();
  for (const row of rows) {
    const applicable = levels.filter(level => structuralFloorLevels(row.title).includes(level.order));
    if (!applicable.length) continue;
    signal?.throwIfAborted();
    progress?.("Checking slab edges on " + row.sheet + "…");
    try {
      const drawing = await readDetailDrawing(row.doc, row.page, signal, true);
      const view = structuralFloorView(row.title, drawing.text, drawing.page);
      if (!view || !drawing.clips.length) continue;
      const grid = printedPlanGrid(drawing.text, drawing.segments, drawing.curves, view.scale / 72);
      const source = { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote: view.caption.text };
      const dimension = slabDimension(drawing.text, view, source);
      for (const level of applicable) {
        const area = areas.get(level.order);
        // An area-only sheet cannot replace the shape of a combined floor.
        if (level.planAreas && level.planAreas.length !== 1 || area?.length !== 1 || floorPlanArea(row.title)) continue;
        const offset = alignStackedPlan(area[0].grid, grid);
        if (!offset) continue;
        const placed = level.planAreas?.[0]?.offset ?? [0, 0];
        const shape = structuralSlabOutline(drawing.clips, drawing.segments, view, [offset[0] + placed[0], offset[1] + placed[1]], level.outline);
        if (shape) matches.set(level.id, [...(matches.get(level.id) ?? []), { ...shape, source, dimension }]);
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(row.sheet + ": the structural slab could not be read.");
    }
  }
  for (const level of levels) {
    const candidates = matches.get(level.id) ?? [];
    if (candidates.length === 1) level.structuralSlab = candidates[0];
    else if (rows.some(row => structuralFloorLevels(row.title).includes(level.order))) {
      warnings.push(level.name + ": slab edges need review. Floor surfaces follow the architectural room outlines.");
    }
  }
}

async function readAssemblySheet(row: RegisterRow, kind: AssemblyKind, signal?: AbortSignal) {
  const drawing = await readDetailDrawing(row.doc, row.page, signal);
  const captions = assemblyCaptions(drawing.boxes, drawing.segments, drawing.page, kind);
  const wallTypes: PartitionType[] = [], floorDetails: FloorAssemblyDetail[] = [];
  let failed = 0;
  for (let i = 0; i < captions.length; i += 3) {
    await Promise.all(captions.slice(i, i + 3).map(async caption => {
      signal?.throwIfAborted();
      const source = { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote: caption.title };
      let reads: AssemblyRead[] = [];
      // A vector floor section with readable leaders already supplies its printed callouts.
      const native = kind === "floor" ? floorLeaderLayers(caption, drawing.segments, drawing.page, drawing.text) : [];
      if (!native.length) {
        try {
          const image = await renderStoredRegion(row.doc, row.page, caption.box, 2000, true);
          const { details } = await aiJob<{ details: AssemblyRead[] }>("assembly-detail", { image, kind, title: caption.title, tags: caption.tags }, signal);
          reads = details ?? [];
        } catch (error) {
          if (signal?.aborted) throw error;
          failed++;
        }
      }
      const cited = (value: string) => assemblyTextMatches(value, caption.labels);
      const checked = (read: AssemblyRead | undefined) => (read?.layers ?? []).filter(layer => cited(layer.material));
      if (kind === "wall") {
        for (const tag of caption.tags) {
          const matches = reads.filter(candidate => tagKey(candidate.tag) === tagKey(tag));
          const read = matches.length === 1 ? matches[0] : undefined;
          const layers = checked(read).map(layer => {
            const feet = assemblyThickness(layer.thickness, layer.material);
            return { material: layer.material, inches: feet === null ? null : feet * 12 };
          });
          const thickness = read && cited(read.thickness) && drawingLengthFeet(read.thickness) !== null ? read.thickness : "";
          const rating = read && cited(read.rating) ? read.rating : "";
          wallTypes.push({ tag, description: caption.title, thickness, rating, source, ...(layers.length ? { layers } : {}) });
        }
      } else {
        const layers = native.length ? native : checked(reads.length === 1 && !reads[0].tag ? reads[0] : undefined).map(layer => ({ ...layer, thicknessFeet: undefined }));
        if (layers.length) floorDetails.push({ source, detail: caption.detail, layers: layers.map(({ material, thickness, thicknessFeet: drawn }) => {
          const thicknessFeet = drawn ?? assemblyThickness(thickness, material);
          return { material, ...(thicknessFeet === null ? {} : { thicknessFeet, label: thickness }) };
        }) });
      }
    }));
  }
  return { wallTypes, floorDetails, failed, captions: captions.length };
}

async function readModelWallTypes(register: RegisterRow[], warnings: string[], signal?: AbortSignal, progress?: (message: string) => void) {
  const matches = register.filter(wallAssemblySheet);
  const legacy = partitionTypeSheet(register);
  const rows = matches.length ? matches : legacy ? [legacy] : [];
  const types: PartitionType[] = [];
  for (const row of rows) {
    signal?.throwIfAborted();
    progress?.("Reading wall assembly diagrams on " + row.sheet + "…");
    try {
      const detail = await readAssemblySheet(row, "wall", signal);
      if (detail.captions) {
        types.push(...detail.wallTypes);
        if (detail.failed) warnings.push(row.sheet + ": some wall assembly diagrams could not be read.");
      } else {
        const scheduled = await readPartitionTypes(row.doc, row.page, row.sheet, signal);
        types.push(...scheduled.map(type => ({ ...type, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page, quote: type.tag } })));
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(row.sheet + ": the wall assembly details could not be read.");
    }
  }
  return types.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
}

/**
 * The wall types a partition type sheet schedules, read on the parts of the sheet that hold drawing (lib/ai-jobs-more
 * "partition-types"), with each type's layers worked out from the sheet's legend and typical sections ("wall-layers": one
 * text-only reading). Without layers the types still come back: the schedule alone describes them.
 */
async function readPartitionTypes(doc: StoredDocument, pageNumber: number, sheetName: string, signal?: AbortSignal): Promise<PartitionType[]> {
  const [pdfjs, pdf] = await Promise.all([import("pdfjs-dist"), openStoredPdf(doc)]);
  const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale: 1 });
  const { segments } = vectorsFromOperators(await pageTurn(() => page.getOperatorList(), true), pdfjs.OPS as unknown as Record<string, number>, viewport.transform);
  const rows: PartitionType[] = [], legend: string[] = [], sections: PartitionKeyRead["sections"] = [];
  const tiles = contentTiles(segments, { widthPt: viewport.width, heightPt: viewport.height });
  for (let i = 0; i < tiles.length; i += 3) await Promise.all(tiles.slice(i, i + 3).map(async tile => {
    const read = await aiJob<{ types: PartitionTypeRead[] } & Partial<PartitionKeyRead>>("partition-types", { sheet: sheetName, image: await renderStoredRegion(doc, pageNumber, tile, 2000, true) }, signal);
    rows.push(...read.types);
    // Tiles overlap: a legend line or a section read twice counts once.
    for (const line of read.legend ?? []) if (!legend.includes(line)) legend.push(line);
    for (const section of read.sections ?? []) if (!sections.some(s => s.title === section.title && s.labels.join() === section.labels.join())) sections.push(section);
  }));
  const types = mergePartitionTypes(rows);
  if (!types.length) return types;
  try {
    const read = await aiJob<{ types: { tag: string; layers: WallLayer[] }[] }>("wall-layers", { types, legend, sections }, signal);
    return types.map(t => { const found = read.types.find(r => tagKey(r.tag) === tagKey(t.tag)); return found ? { ...t, layers: found.layers } : t; });
  } catch (error) { if (signal?.aborted) throw error; return types; }
}

/**
 * A plan sheet's walls and doors from its vector lines (lib/plan-vectors, wall- and door-detection), in the
 * level's frame; then their door numbers and wall types from the tags the AI reads on small tiles of the
 * plan (3 at a time), placed through the plan's own tag ovals and leaders (lib/tag-placement).
 */
async function planVectorWalls(doc: StoredDocument, pageNumber: number, sheetName: string, frame: { widthFeet: number; heightFeet: number }, outline: Point[],
  { scaled, printedScale, alignAreas, alignStack, readSlabGrid, view, partitionTypes, floorSheetKeys, signal, onProgress }: {
    scaled: boolean; printedScale: boolean; alignAreas: boolean; alignStack: boolean; readSlabGrid: boolean; view?: PlanView; partitionTypes: PartitionType[]; floorSheetKeys: ReadonlySet<string>; signal?: AbortSignal; onProgress?: (text: string) => void;
  }) {
  const [pdfjs, pdf] = await Promise.all([import("pdfjs-dist"), openStoredPdf(doc)]);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 }), sheet = { widthPt: viewport.width, heightPt: viewport.height };
  const drawing = vectorsFromOperators(await pageTurn(() => page.getOperatorList(), true), pdfjs.OPS as unknown as Record<string, number>, viewport.transform);
  const inView = ([x, y]: Point) => !view || containsPlanPoint([x / sheet.widthPt, y / sheet.heightPt], view.box);
  const segments = view ? drawing.segments.filter(line => inView(line.a) && inView(line.b)) : drawing.segments;
  const curves = view ? drawing.curves.filter(line => [line.from, line.to, line.c1, line.c2].every(inView)) : drawing.curves;
  const fills = view ? drawing.fills.filter(fill => fill.every(inView)) : drawing.fills;
  const printed = printedScale || partitionTypes.length || floorSheetKeys.size ? await pageTurn((): Promise<{ items: Parameters<typeof printedDoorTags>[0] }> => page.getTextContent(), true).catch(() => null) : null;
  signal?.throwIfAborted();
  const text = printed && (alignAreas || alignStack || readSlabGrid) ? drawingTextRuns(printed.items, viewport).filter(run => inView(run.a) && inView(run.b)) : null;
  const registration = alignAreas && text ? planRegistration(segments, text, frame.widthFeet * 72 / viewport.width) : null;
  const grid: PlanGrid = (alignStack || readSlabGrid) && printedScale && text ? printedPlanGrid(text, segments, curves, frame.widthFeet / viewport.width) : [];
  const walls = levelWalls(segments, sheet, frame, outline, scaled);
  const doors = levelDoors(segments, curves, sheet, frame, outline, walls.walls);
  const glazing = levelGlazing(segments, sheet, frame, outline, walls.weight, walls.walls, doors);
  const partitions = levelPartitions(segments, sheet, frame, outline, walls.weight, walls.walls, glazing);
  const columns = levelColumns(segments, sheet, frame, outline, walls.weight, walls.walls);
  const openings = levelOpenings(segments, sheet, frame, outline);
  const flights = levelFlights(segments, fills, sheet, frame, outline, walls.weight);
  const sourceBoxes = printed ? pageTextBoxes(printed.items.filter(item => "str" in item), viewport)
    .filter(box => !view || containsPlanPoint([box.x, box.y], view.box)) : [];
  const floorReferences = printedFloorDetailReferences(sourceBoxes, { width: sheet.widthPt, height: sheet.heightPt }, floorSheetKeys)
    .map(ref => ({ ...ref, at: [ref.at[0] * frame.widthFeet, ref.at[1] * frame.heightFeet] as Point }));
  if (!walls.walls.length) return { ...walls, doors, glazing, partitions, columns, openings, flights, floorReferences, rooms: [] as SchematicRoom[], tagWarning: "", registration, grid };
  const tiles = tagTiles(sheet, frame, outline).flatMap(tile => {
    const crop = view ? clipPlanBox(tile, view.box) : tile;
    return crop ? [crop] : [];
  });
  const read: { tile: PlanBox; tags: PlanTag[] }[] = [];
  let failed = 0, done = 0;
  const rows = Map.groupBy(tiles, tile => [tile[1], tile[3]].join(":")).values();
  for (const row of rows) {
    signal?.throwIfAborted();
    // Keep the rendering strip bounded separately from the three simultaneous AI requests.
    const strip = row.length > 1 && row.length <= 6 ? await renderStoredRow(doc, pageNumber, row, 1200, true).catch(() => null) : null;
    for (let i = 0; i < row.length; i += 3) {
      signal?.throwIfAborted();
      const batch = row.slice(i, i + 3);
      done += batch.length;
      onProgress?.(`Reading the door, wall and room tags on ${sheetName} (part ${done} of ${tiles.length})…`);
      const parts = strip ? strip.slice(i, i + batch.length) : batch.length > 1 ? await renderStoredRow(doc, pageNumber, batch, 1200, true).catch(() => null) : null;
      await Promise.all(batch.map(async (tile, index) => {
        try {
          const part = parts?.[index];
          const image = part?.image ?? await renderStoredRegion(doc, pageNumber, tile, 1200, true);
          const { tags } = await aiJob<{ tags: PlanTag[] }>("plan-tags", { sheet: sheetName, image }, signal);
          read.push({ tile: part?.box ?? tile, tags });
        } catch (error) { if (signal?.aborted) throw error; failed++; }
      }));
    }
  }
  const scheduleKeys = new Set(partitionTypes.map(type => tagKey(type.tag)));
  const containsNativeText = sourceBoxes.some(box => box.str.length > 3);
  const nativeCodes = Map.groupBy(sourceBoxes.filter(box => /^\s*\d/.test(box.str)), box => tagKey(box.str));
  const reviewedReads = read.map(part => {
    const [left, top, width, height] = part.tile;
    const tags = part.tags.filter(tag => {
      if (tag.kind !== "wall" || !scheduleKeys.size) return true;
      const key = tagKey(tag.text);
      if (!scheduleKeys.has(key)) return false;
      if (!containsNativeText || !/^\s*\d/.test(tag.text)) return true;
      const [x, y] = [left + tag.at[0] * width, top + tag.at[1] * height];
      return nativeCodes.get(key)?.some(box => Math.hypot((box.x + box.w / 2 - x) * frame.widthFeet,
        (box.y + box.h / 2 - y) * frame.heightFeet) <= 3) ?? false;
    });
    return { ...part, tags };
  });
  const tagged = levelTags(reviewedReads, segments, curves, sheet, frame, walls.walls, doors, glazing);
  const printedWalls = printedWallTags(sourceBoxes, segments, { width: sheet.widthPt, height: sheet.heightPt }, frame, scheduleKeys);
  tagged.walls = matchPrintedWallTags(tagged.walls, printedWalls, partitionTypes);

  signal?.throwIfAborted();
  const printedTags = printed && printedScale ? printedDoorTags(printed.items, viewport, frame).filter(({ at: [x, y] }) =>
    !view || containsPlanPoint([x / frame.widthFeet, y / frame.heightFeet], view.box)) : [];
  const footprint = printedScale ? outline.map(([x, y]): Point => [x * frame.widthFeet, y * frame.heightFeet]) : [];
  const verifiedWalls = holdOutsidePlanRuns(tagged.walls, tagged.walls, footprint);
  const reviewedGlazing = holdOutsidePlanRuns(tagged.glazing, verifiedWalls, footprint);
  const reviewedPartitions = holdOutsidePlanRuns(partitions, verifiedWalls, footprint);
  const held = [...verifiedWalls, ...reviewedGlazing, ...reviewedPartitions].filter(run => run.outsidePlan).length;
  const note = walls.note + (held ? " " + held + " detached exterior traces held for review on the source plan." : "");
  const verifiedDoors = addTaggedDoorOpenings(tagged.doors, verifiedWalls, printedTags);
  // Room tags read on the tiles are sharper than the whole-sheet reading's; the level keeps those when there are any.
  const rooms: SchematicRoom[] = tagged.tags.filter(t => t.kind === "room").map(t => ({ name: t.name ?? "", number: t.text, at: t.at }));
  return { note, walls: typeWallContinuations(verifiedWalls, verifiedDoors), doors: verifiedDoors, glazing: reviewedGlazing, partitions: reviewedPartitions, columns, openings, flights, rooms, floorReferences, registration, grid, tagWarning: failed ? `${failed} of ${tiles.length} parts of the plan could not be read for door and wall tags; some doors and walls have no number or type.` : "" };
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
