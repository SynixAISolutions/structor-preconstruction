import { allMaterials, finishScheduleRows, modelForProject, wallFinishRecords, wallBaseBreakdown } from "./jelleff-model";
import { baseBreakdown, parseFeetInches, resolveObjects, resolveWallFinishes, type LevelId, type MaterialInfo, type Point, type SourceRef, type WallFinishInput } from "./model";

export type CornerGuardInput = { id: string; name: string; level: LevelId; room: string; point: Point; source: SourceRef };
export type ModelSupplement = { version: 1; projectId: string; finishes: WallFinishInput[]; cornerGuards: CornerGuardInput[] };
export const EMPTY_MODEL_SUPPLEMENT = { finishes: [], cornerGuards: [] };
const fail = (message: string): never => { throw new Error(message); };
const point = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) < 10_000);
function source(s: SourceRef) {
  if (!s || !Number.isInteger(s.page) || s.page < 1 || typeof s.sheet !== "string" || !s.sheet.trim() || s.sheet.length > 40 || typeof s.detail !== "string" || !s.detail.trim() || s.detail.length > 600 || (s.asset !== "" && !/^\/models\/[a-zA-Z0-9/_-]+\.png$/.test(s.asset))) fail("Every measurement needs a source sheet, page and detail; images must be local model assets.");
}

/** Private measured records augment the prepared model in browser storage; no source records enter Git. */
export function resolveModelSupplement(raw: unknown, projectId: string) {
  const baseObjects = modelForProject(projectId), data = raw as ModelSupplement;
  if (!data || data.version !== 1 || data.projectId !== projectId || !Array.isArray(data.finishes) || !Array.isArray(data.cornerGuards) || data.finishes.length > 500 || data.cornerGuards.length > 500) fail("Choose a version 1 measurement file for this project, with at most 500 finish records and 500 physical guards.");
  if (!baseObjects.length && (data.finishes.length || data.cornerGuards.length)) fail("These measurements need the project's prepared host model.");
  if (!baseObjects.length) return { data, objects: [], records: [], bases: [], materials: [] };
  const ids = new Set<string>();
  for (const record of data.finishes) {
    if (!record || typeof record.id !== "string" || !record.id || record.id.length > 200 || ids.has(record.id) || !["L1", "L2"].includes(record.level) || !Array.isArray(record.bands) || !record.bands.length || record.bands.length > 100 || !Array.isArray(record.evidence) || !record.evidence.length || !Array.isArray(record.wallIds) || !Array.isArray(record.conflicts) || typeof record.title !== "string" || record.title.length > 300) fail("Check finish record ids, levels, bands and evidence.");
    ids.add(record.id); record.evidence.forEach(source);
    for (const band of record.bands) for (const dimension of [band.from, band.to, band.height, band.width]) if (dimension !== null && (typeof dimension !== "string" || dimension.length > 40 || !Number.isFinite(parseFeetInches(dimension)) || parseFeetInches(dimension)! < 0)) fail("Finish dimensions must be finite feet and inches.");
    if (record.toward !== null && !point(record.toward) || record.extent !== null && (!Array.isArray(record.extent) || record.extent.length !== 2 || !record.extent.every(point))) fail("Finish coordinates must be finite model feet.");
    if (!wallFinishRecords.some(r => r.id === record.id) && record.bands.some(b => !Array.isArray(b.tags) || b.tags.some(t => !["FRP-01", "SAW-01"].includes(t)))) fail("New measured finish records are FRP or sound-absorbing panels only.");
  }
  for (const guard of data.cornerGuards) {
    if (!guard || typeof guard.id !== "string" || !guard.id || guard.id.length > 200 || ids.has(guard.id) || baseObjects.some(o => o.id === guard.id) || !["L1", "L2"].includes(guard.level) || !point(guard.point) || typeof guard.name !== "string" || !guard.name.trim() || guard.name.length > 300 || typeof guard.room !== "string") fail("Each physical corner guard needs a unique id, level, room and finite point in model feet.");
    ids.add(guard.id); source(guard.source);
  }
  const scheduled = finishScheduleRows.find(row => row.tag === "CGD-01")!;
  const material: MaterialInfo = { id: "corner-guard", name: "CGD-01 corner guard", color: "#b3b5aa", description: "One guard at each privately traced physical corner; printed tag counts are not quantities.", status: "Documented", sources: [scheduled.source], discipline: "architectural", division: "10", specSection: scheduled.section, tag: scheduled.tag, unit: "EA", views: ["interior"], properties: [] };
  const objects = [...baseObjects, ...resolveObjects(data.cornerGuards.map(guard => ({ id: guard.id, name: guard.name, kind: "fixture" as const, materialId: material.id, level: guard.level, room: guard.room, points: [guard.point], height: 8, thickness: .25, depth: .25, base: guard.level === "L2" ? 14 : 0, source: guard.source, geometry: "traced" as const, description: "Physical guard counted once; review placement against the finish-plan leader.", geometryStatus: "Private manual trace; not a checked Contractor takeoff. The box is a schematic guard profile." })), [...allMaterials, material], finishScheduleRows)];
  const records = resolveWallFinishes([...wallFinishRecords.filter(record => !data.finishes.some(r => r.id === record.id)), ...data.finishes], objects, finishScheduleRows);
  const bases = data.finishes.length ? baseBreakdown(objects, records) : wallBaseBreakdown;
  return { data, objects, records, bases, materials: [...allMaterials, material] };
}
