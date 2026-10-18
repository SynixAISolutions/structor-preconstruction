"use client";

// Builds a project's schematic model in the browser (lib/schematic-model): finds the floor-plan and
// section sheets in Project files, has the AI read their images, and turns the readings into levels.

import { useCallback, useRef } from "react";
import { aiJob } from "./ai-more-client";
import type { PlanReading } from "./ai-jobs-more";
import { drawingRegister, type StoredDocument } from "./project-files";
import { openStoredPdf, readStoredText, renderStoredPage } from "./project-files-client";
import type { Project } from "./projects";
import { feetPerInch, heightSheet, levelHeights, levelName, levelPlanSheets, toFeet, type SchematicLevel, type SchematicModel } from "./schematic-model";
import { useLocalDraft } from "./use-local-draft";

async function pageSize(doc: StoredDocument, page: number) {
  const viewport = (await (await openStoredPdf(doc)).getPage(page)).getViewport({ scale: 1 });
  return { widthIn: viewport.width / 72, heightIn: viewport.height / 72 };
}

/** About one AI image request per level plus one for the heights; progress is reported as text. */
export async function buildSchematicModel(args: { documents: StoredDocument[]; project: Project; onProgress?: (text: string) => void; signal?: AbortSignal }): Promise<SchematicModel> {
  const register = drawingRegister(args.documents);
  const plans = levelPlanSheets(register);
  if (!plans.length) throw new Error("No floor plan sheets were found. Upload the architectural drawings in Project files first.");
  const warnings: string[] = [];
  let read: { name: string; elevation: number }[] = [];
  const section = heightSheet(register);
  if (section) {
    args.onProgress?.(`Reading the level elevations on ${section.sheet}…`);
    try {
      const { image } = await renderStoredPage(section.doc, section.page, 2000);
      read = (await aiJob<{ levels: { name: string; elevation: number }[] }>("level-heights", { sheet: section.sheet, title: section.title, image }, args.signal)).levels;
    } catch { warnings.push(`The level elevations on ${section.sheet} could not be read.`); }
  } else warnings.push("No section or elevation sheet was found.");
  const heights = levelHeights(plans.map(p => p.level), read);
  warnings.push(...heights.warnings);
  const levels: SchematicLevel[] = [];
  for (const { level, row } of plans) {
    args.onProgress?.(`Reading the ${levelName(level)} plan (${row.sheet})…`);
    const [{ image }, page, text] = await Promise.all([renderStoredPage(row.doc, row.page, 1800), pageSize(row.doc, row.page), readStoredText(row.doc, { first: row.page, last: row.page })]);
    const reading = await aiJob<PlanReading>("plan-outline", { sheet: row.sheet, title: row.title, image }, args.signal);
    const scale = feetPerInch(reading.scale) ?? feetPerInch(text[0]?.text ?? "");
    const sized = toFeet({ outline: reading.outline, rooms: reading.rooms, page, feetPerInch: scale, targetSf: args.project.squareFeet > 0 ? args.project.squareFeet / plans.length : 0 });
    if (!scale) warnings.push(`${row.sheet}: no printed scale was read; ${sized.sizing.toLowerCase()}.`);
    levels.push({ id: `L${level}`, name: levelName(level), order: level, elevation: heights.elevations.get(level) ?? 0, height: heights.heights.get(level) ?? 14, outline: sized.outline, rooms: sized.rooms, source: { documentId: row.doc.id, sheet: row.sheet, page: row.page }, sizing: sized.sizing });
  }
  return { levels, warnings, builtAt: new Date().toISOString() };
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
