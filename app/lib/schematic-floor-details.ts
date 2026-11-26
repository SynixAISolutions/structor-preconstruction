import { drawingLengthFeet } from "./drawing-dimensions";
import type { Segment } from "./plan-vectors";
import type { RegisterRow } from "./project-files";
import { floorPlanArea, levelOfTitle, planSource, type SchematicLevel } from "./schematic-model";
import type { DimensionSource } from "./section-datums";
import type { TextBox } from "./text-anchor";
import { inside, insideRoom, type Room } from "./room-detection";
import { assemblyFloorLevel, type FloorDetailReference } from "./schematic-assembly-drawings";

export type FloorLayer = { material: string; thicknessFeet?: number; label?: string; minimum?: boolean };
export type FloorAssemblyNote = { source: DimensionSource; layers: FloorLayer[]; planArea: number | null };
export type FloorFinishNote = { source: DimensionSource; tag: string; material: string; location: string };
export type FloorAssemblyDetail = { source: DimensionSource; layers: FloorLayer[]; detail?: string };
export type FloorAssemblySelection = FloorAssemblyDetail & { basis: "matched" | "reference"; matchedBy?: "callout" | "level" };

export function floorPlanAreaAt(level: SchematicLevel, at: [number, number]) {
  if (!level.planAreas?.length) return 0;
  const area = level.planAreas.findIndex(area => inside(at, area.outline ?? level.outline));
  return area < 0 ? null : area;
}

/** Select by explicit printed scope. One typical detail can be inspected without assigning it to a room. */
export function floorAssemblyForRoom(level: SchematicLevel, room: Pick<Room, "at" | "outline" | "holes">, details: FloorAssemblyDetail[] = []): FloorAssemblySelection | null {
  const references = (level.floorReferences ?? []).filter(ref => insideRoom(ref.at, room));
  const pointed = details.filter(detail => detail.detail && references.some(ref =>
    ref.detail === detail.detail && ref.sheet === detail.source.sheet.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  if (pointed.length === 1) return { ...pointed[0], basis: "matched", matchedBy: "callout" };
  if (pointed.length > 1) return null;
  const planArea = floorPlanAreaAt(level, room.at);
  const concrete = (level.floorAssemblies ?? []).filter(note => note.planArea === null || note.planArea === planArea);
  const scoped = details.filter(detail => assemblyFloorLevel(detail.source.quote) === level.order);
  if (scoped.length === 1) return { ...scoped[0], basis: "matched", matchedBy: "level" };
  if (scoped.length > 1) return null;
  if (concrete.length === 1) return { ...concrete[0], basis: "reference" };
  const typical = details.filter(detail => /^(?:TYP\.?|TYPICAL)\s+(?:FLOOR|SLAB)\b/i.test(detail.source.quote));
  if (!concrete.length && typical.length === 1) return { ...typical[0], basis: "reference" };
  return null;
}

type Title = Pick<RegisterRow, "discipline" | "title">;
export function slabNoteLevel(row: Title): number | null {
  return row.discipline === "Structural" && /\b(?:SLAB|FOUNDATION|FRAMING)\s+PLAN\b/i.test(row.title) ? levelOfTitle(row.title) : null;
}

export function slabNoteArea(row: Title, level: SchematicLevel, register: Pick<RegisterRow, "sheet" | "title">[]) {
  const area = floorPlanArea(row.title);
  if (!area) return null;
  const sources = level.planAreas?.map(part => part.source) ?? [planSource(level)];
  const matches = sources.flatMap((source, index) =>
    register.some(plan => plan.sheet === source.sheet && floorPlanArea(plan.title) === area) ? [index] : []);
  return matches.length === 1 ? matches[0] : undefined;
}

const THICKNESS = /^((?:\d+(?:\.\d+)?(?:[ -]\d+\/\d+)?|\d+\/\d+)\s*(?:["″”]|MM|CM))(?=$|[\s,;])/i;
const NEXT_NOTE = /^\d{1,2}[.)]\s/;

function thickness(text: string): { thicknessFeet: number; label: string; rest: string } | null {
  const match = THICKNESS.exec(text.trim());
  if (!match) return null;
  const label = match[1].trim(), feet = drawingLengthFeet(label) ?? NaN;
  return feet > 0 && feet <= 4 ? { thicknessFeet: feet, label, rest: text.trim().slice(match[0].length).trim() } : null;
}

/** A written section or plan note defines the stack in order. A minimum depth stays a minimum. */
export function printedSlabNotes(text: string): { quote: string; layers: FloorLayer[] }[] {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  return lines.flatMap((line, index) => {
    const written = /^(?:\d{1,2}[.)]\s*)?SLAB[ -]ON[ -]GRADE\s*(?:(?:SHALL|TO)\s+BE|:)\s*(.+)$/i.exec(line);
    if (!written) return [];
    const continuation: string[] = [];
    for (const next of lines.slice(index + 1, index + 4)) {
      if (!next || NEXT_NOTE.test(next)) break;
      continuation.push(next);
    }
    const note = [written[1], ...continuation].join(" ");
    const slab = thickness(note);
    if (!slab || !/\bCONCRETE\b/i.test(slab.rest.split(/\b(?:OVER|REINFORCE)\b/i)[0])) return [];
    const layers: FloorLayer[] = [{ material: "Concrete slab", thicknessFeet: slab.thicknessFeet, label: slab.label }];
    const underneath = /\bOVER\s+(.+?)(?=\b(?:REINFORCE|MAINTAIN|PROVIDE|SEE)\b|$)/i.exec(slab.rest)?.[1] ?? "";
    const membrane = /^(?:(\d+(?:\.\d+)?)\s*(MIL|MM)\s+)?(?:CONTINUOUS\s+)?VAPOU?R\s+(BARRIER|RETARDER)\b/i.exec(underneath);
    if (membrane) {
      const depth = membrane[1] ? Number(membrane[1]) / (membrane[2].toUpperCase() === "MIL" ? 12000 : 304.8) : undefined;
      layers.push({ material: "Vapor " + membrane[3].toLowerCase(), ...(depth ? { thicknessFeet: depth, label: membrane[1] + " " + membrane[2].toLowerCase() } : {}) });
    }
    const baseText = membrane ? underneath.slice(membrane[0].length).replace(/^\s*(?:,?\s+AND|OVER|,)\s+/i, "") : underneath;
    const base = thickness(baseText);
    if (base) {
      const label = /^(?:(?:MIN(?:IMUM)?\.?)\s+)?(?:OF\s+)?(?:COMPACTED\s+)?(GRAVEL(?: FILL)?|CRUSHED STONE|STONE BASE|GRANULAR (?:BASE|FILL)|AGGREGATE BASE)\b/i.exec(base.rest);
      if (label) layers.push({ material: label[1][0].toUpperCase() + label[1].slice(1).toLowerCase(),
        thicknessFeet: base.thicknessFeet, label: base.label, ...(/^\s*MIN/i.test(base.rest) ? { minimum: true } : {}) });
    }
    return [{ quote: line.replace(/^\d{1,2}[.)]\s*/, "").trim().slice(0, 105), layers }];
  });
}

const boxMiddle = (box: TextBox) => box.y + box.h / 2;
const boxWords = (box: TextBox) => box.str.trim().replace(/\s+/g, " ").toUpperCase();

/** Read the code, material and location from their drawn table columns in the Floor group. */
export function printedFloorFinishes(boxes: TextBox[], segments: Segment[], page: { width: number; height: number }) {
  const headings = boxes.filter(box => /^(?:CODE|TAG)$/.test(boxWords(box)));
  return headings.flatMap(code => {
    const y = boxMiddle(code), peer = boxes.filter(box => Math.abs(boxMiddle(box) - y) < code.h * .55 && box.x > code.x);
    const type = peer.find(box => boxWords(box) === "TYPE"), location = peer.find(box => boxWords(box) === "LOCATION");
    if (!type || !location || location.x <= type.x) return [];
    const grid = segments.flatMap(({ a, b }) => Math.abs(a[0] - b[0]) < .2 &&
      Math.min(a[1], b[1]) <= y * page.height && Math.max(a[1], b[1]) >= y * page.height ? [a[0] / page.width] : []);
    const column = (box: TextBox): [number, number] => [
      Math.max(0, ...grid.filter(x => x <= box.x)),
      Math.min(1, ...grid.filter(x => x >= box.x + box.w)),
    ];
    const [tagColumn, materialColumn, roomColumn] = [code, type, location].map(column);
    if (tagColumn[0] === 0 || roomColumn[1] === 1 ||
      Math.abs(tagColumn[1] - materialColumn[0]) > .001 || Math.abs(materialColumn[1] - roomColumn[0]) > .001) return [];
    const inColumn = (box: TextBox, [left, right]: [number, number]) => box.x >= left - .0002 && box.x + box.w <= right + .0002;
    const first = boxes.filter(box => boxMiddle(box) > y && inColumn(box, tagColumn));
    const group = first.find(box => /^FLOORS?$/.test(boxWords(box)));
    if (!group) return [];
    const next = first.filter(box => boxMiddle(box) > boxMiddle(group) && /^(?:WALL(?:S| BASE)?|BASE|MILLWORK|CEILINGS?|SPECIALTIES|MISC(?:ELLANEOUS)?|TRANSITIONS?)$/.test(boxWords(box)))
      .sort((a, b) => a.y - b.y)[0];
    if (!next) return [];
    return first.flatMap(box => {
      const tag = boxWords(box), row = boxMiddle(box);
      if (row <= boxMiddle(group) || row >= boxMiddle(next) || !/^[A-Z]{1,5}-?\d{1,3}[A-Z]?$/.test(tag)) return [];
      const entries = boxes.filter(entry => Math.abs(boxMiddle(entry) - row) < box.h * .55);
      const materials = entries.filter(entry => inColumn(entry, materialColumn));
      const places = entries.filter(entry => inColumn(entry, roomColumn));
      return materials.length === 1 && places.length === 1 ?
        [{ tag, material: materials[0].str.trim(), location: places[0].str.trim() }] : [];
    });
  });
}

function roomKey(text: string) {
  return text.toUpperCase().replace(/\s+\([^)]*\)\s*$/, "").replace(/\bGYMNASIUM\b/g, "GYM").replace(/\s+/g, " ").trim();
}

/** A location in the finish legend is evidence of a finish, and does not define the limits of its zone. */
export function finishesForRoom(room: { name: string; number: string }, notes: FloorFinishNote[] = []) {
  const name = roomKey(room.name), number = roomKey(room.number);
  return notes.filter(note => {
    const location = roomKey(note.location);
    return !!location && (location === name || location === number || location === number + " " + name || location === name + " " + number);
  });
}
