// The 3D model contract (demo, browser-only): what every selectable object in the four model views
// carries, how its quantities are measured, and the contractor's review of it.
//
// Marcel (20 Sep, 37:14–45:23): select any element and see what it is — quantities, assembly, the
// source sheet and detail, and specification properties down to R-values where documented. Danial
// (30 Sep): four distinct views on one model and inspector — interior finishes, MEP coordination,
// structural, exterior.
//
// GEOMETRY is in FEET on the plan: a point is [x, z] (x east, z south, as traced from A1.1); `base`
// is the bottom elevation and `height` the vertical size. Three shapes:
//   segment — 2 points: a wall, glass, door, beam, duct or pipe run; `thickness` is its width.
//   polygon — 3+ points: a floor finish, slab or roof; `height` is its thickness.
//   box     — 1 point, the centre: a column, equipment or fixture; `thickness` × `depth` in plan.
// Quantities are measured from that geometry, never typed in, so they always agree with the model.
// Nothing is extracted from drawings; `basis` and `confidence` say how much comes from them.

import { CSI_DIVISIONS } from "./csi";
import type { Screen } from "./screens";

export type Point = [number, number];
/** A drawing reference: the set, sheet, PDF page, detail, and the sheet image under public/. */
export type SourceRef = { drawing?: string; sheet: string; page: number; detail: string; asset: string };
/** A source on a resolved object always names its drawing set ("" when unknown). */
export type ModelSource = SourceRef & { drawing: string };

export type ModelView = "interior" | "mep" | "structural" | "exterior";
export type Discipline = "architectural" | "structural" | "mechanical" | "plumbing" | "electrical" | "fire-protection";
export type ObjectKind = "wall" | "glass" | "door" | "floor" | "ceiling" | "transition" | "slab" | "roof" | "column" | "beam" | "duct" | "pipe" | "equipment" | "fixture";
export type Shape = "segment" | "polygon" | "box";
export type QuantityUnit = "SF" | "LF" | "EA" | "CY";
export type LevelId = "L1" | "L2" | "roof";
export type ModelProperty = { label: string; value: string };

export const SHAPES: Record<ObjectKind, Shape> = {
  wall: "segment", glass: "segment", door: "segment", transition: "segment", beam: "segment", duct: "segment", pipe: "segment",
  floor: "polygon", ceiling: "polygon", slab: "polygon", roof: "polygon", column: "box", equipment: "box", fixture: "box",
};

/** Levels from building section A5.1: first floor 0 ft, second floor 14 ft, low roof 28 ft. */
export const LEVELS: { id: LevelId; name: string; elevation: number }[] = [
  { id: "L1", name: "Level 01", elevation: 0 }, { id: "L2", name: "Level 02", elevation: 14 }, { id: "roof", name: "Low roof", elevation: 28 },
];

/** The four views and the screen each one is. An object is selectable in the views its assembly lists. */
export const MODEL_VIEWS: { id: ModelView; screen: Screen; label: string; disciplines: Discipline[] }[] = [
  { id: "interior", screen: "model", label: "Interior finishes", disciplines: ["architectural"] },
  { id: "mep", screen: "model-mep", label: "MEP coordination", disciplines: ["mechanical", "plumbing", "electrical", "fire-protection"] },
  { id: "structural", screen: "model-structural", label: "Structural model", disciplines: ["structural"] },
  { id: "exterior", screen: "model-exterior", label: "Exterior model", disciplines: ["architectural"] },
];
export const modelViewForScreen = (screen: Screen): ModelView | null => MODEL_VIEWS.find(v => v.screen === screen)?.id ?? null;

/** An assembly or material type, shared by every object made of it. */
export type MaterialInfo = {
  id: string;
  name: string;
  color: string;
  description: string;
  status: "Documented" | "Illustrative";
  sources: SourceRef[];
  discipline: Discipline;
  /** CSI division, "09". */
  division: string;
  /**
   * Specification section, e.g. "09 67 00": the finish schedule's heading when the assembly has a
   * schedule tag; otherwise a MasterFormat classification, not read from the project manual.
   */
  specSection: string | null;
  /** Finish schedule tag ("FAF-01", "TS-06"), when the assembly is on the finish schedule. */
  tag?: string;
  /** Finish schedule tag of the base along a floor finish's edge ("WB-01", "VWB-01", "TB-01"). */
  base?: string;
  /** Partition type from the A8.1 schedule ("SA3.20"), for a partition assembly. */
  partitionType?: string;
  /** How its objects are counted. */
  unit: QuantityUnit;
  views: ModelView[];
  properties: ModelProperty[];
};

/** The first-floor elements the current studio draws (walls, glass, doors, floor finishes). */
export type ModelElement = {
  id: string;
  name: string;
  kind: "wall" | "floor" | "glass" | "door";
  materialId: string;
  points: Point[];
  height: number;
  thickness?: number;
  base?: number;
  room?: string;
  description: string;
  source: SourceRef;
  geometryStatus: string;
};

/** Any model object as written in the data: a ModelElement, or a structural, MEP or exterior object. */
export type ModelInput = Omit<ModelElement, "kind"> & {
  kind: ObjectKind;
  level?: LevelId;
  /** Plan depth of a box (z), in feet. Defaults to its thickness. */
  depth?: number;
  /** "traced" from a sheet (default) or "illustrative" placement. */
  geometry?: "traced" | "illustrative";
  properties?: ModelProperty[];
  /** For a transition: the room on the other side (room is the side with the special floor). */
  adjoins?: string;
  /** The wall type tag the plan puts on this segment, as read ("SA. 3. 10"). */
  partitionTag?: string;
  /** Why the plan's type for this segment can't be confirmed (a nearby tag whose leader can't be followed). It keeps the default type. */
  partitionUnverified?: string;
  /** For a floor: edges (edge i runs from point i to the next) that are a finish line inside a room, not a wall. No base runs along them. */
  openEdges?: number[];
  /** For a door: its number on the door schedule. Its points are the opening, jamb to jamb, as traced. */
  doorNumber?: string;
  /** For a door: each leaf as drawn on the plan, hinge to open tip (feet). A pair has two. */
  leaves?: [Point, Point][];
  /** For a door: what's unusual about the trace ("leaf drawn at 45°", "read manually"). */
  traceNote?: string;
  /** For a ceiling zone: its tag and height as printed on the reflected ceiling plan, and how they're known. */
  ceiling?: CeilingInput;
};

/** A ceiling type as printed on the reflected ceiling plans, kept apart from its interpreted schedule link. */
export type CeilingType = {
  /** As printed in the plan tags ("APC-1"). */
  tag: string;
  /** The plan legend's entry for it ("ACP-1 (2X2)"), or null when the legend doesn't list it. */
  legend: string | null;
  /** The A12.1 row it is read as ("ACP-01"), and why; null when nothing on the schedule matches. */
  scheduleLink: { tag: string; basis: string } | null;
  /** Where the sources disagree, as found; nothing here is resolved. */
  conflicts: string[];
};
export type CeilingSchedule = { types: CeilingType[] };

/**
 * How a ceiling zone's tag is known: "tagged" (tag and height in or leading into the zone), "height-unresolved"
 * (the type is clear but more than one height tag ends at its edges), "untagged" (a zone is drawn but no tag reaches it).
 */
export type CeilingStatus = "tagged" | "height-unresolved" | "untagged";
export type CeilingInput = {
  /** As printed ("APC-1"); null when untagged. */
  tag: string | null;
  /** As printed ("9' - 0\""), above the room's finished floor; null when unknown. */
  height: string | null;
  status: CeilingStatus;
  /** A paint tag printed on the zone ("PT-08"), or null. */
  paintTag?: string | null;
  note?: string;
};
export type CeilingDetail = {
  tag: string | null; type: CeilingType | null; status: CeilingStatus;
  heightText: string | null;
  /** Above the room's finished floor (A3.1 general note C). */
  heightAffFt: number | null;
  /** The level's floor elevation plus the height: where the ceiling is. Walls keep their own heights. */
  elevationFt: number | null;
  paint: { tag: string; basis: "tagged" | "ceiling-paint-default" } | null;
  note: string | null;
};

/** "9' - 0\"", "10' - 10\"", "7' - 10\"" → feet; anything else → null. */
export const parseFeetInches = (text: string): number | null => {
  const m = text.match(/^(\d+)' - (\d+)(?: (\d+)\/(\d+))?"$/);
  return m ? +m[1] + (+m[2] + (m[3] ? +m[3] / +m[4] : 0)) / 12 : null;
};

/** One row of the door and frame schedule (A8.2), as printed. Sizes are per panel. */
export type DoorScheduleRow = {
  number: string;
  /** Blank on the schedule for the coiling counter door (209A). */
  panels: number | null;
  width: string; height: string; thickness: string;
  widthIn: number | null; heightIn: number | null; thicknessIn: number | null;
  material: string;
  /** The glazing column. Blank on every A8.2 row: no glass type is scheduled. */
  glass: string;
  /** The panel type code and its name from A8.2's legend ("N", "Narrow lite glass"). */
  panelType: string; panelTypeName: string;
  frameMaterial: string; frameType: string;
  fireRating: string;
  /** As printed on A8.2. The project manual may list the door under another set. */
  hardwareSet: string;
  details: { head: string; jambLeft: string; jambRight: string; sill: string };
  comments: string;
  source: SourceRef;
};

/** One line of a hardware set, as stated in the project manual. */
export type HardwareItem = { qty: number; item: string; product: string; finish: string; manufacturer: string };
/** A door hardware set from the project manual (08 71 00), with the doors it lists. */
export type HardwareSet = { number: string; name: string; doors: string[]; items: HardwareItem[]; notes: string[]; source: SourceRef };

/**
 * How A8.2's hardware set for a door compares with the manual: the manual lists the door under that
 * set, under a different one, under several, or nowhere. Door numbers are compared exactly.
 */
export type HardwareStatus = "match" | "different-set" | "in-several-sets" | "not-in-manual";
export type DoorHardware = {
  drawingSet: string; manualSets: string[]; status: HardwareStatus;
  /** Whether A8.2's set number exists in the manual at all. */
  drawingSetInManual: boolean;
  /** The manual sets for A8.2's number and for every set listing the door, without repeats. */
  sets: HardwareSet[];
};

/** The door schedule, the manual's hardware sets, and how far a traced opening may differ from the schedule. */
export type DoorSchedule = { rows: DoorScheduleRow[]; hardwareSets: HardwareSet[]; widthToleranceFt: number };

export type DoorLeaf = { hinge: Point; tip: Point; lengthFt: number };
/** A traced door: its schedule row, leaves, the width check against the schedule, and its hardware. */
export type DoorDetail = {
  row: DoorScheduleRow;
  leaves: DoorLeaf[];
  /** Traced jamb to jamb. */
  openingFt: number;
  /** Panels x panel width; null when the schedule gives no panels (209A). */
  scheduledFt: number | null;
  /** The traced opening and each leaf against the schedule, within toleranceFt or not. Nothing is moved to fit. */
  widthCheck: { openingDeltaFt: number | null; leafDeltaFt: number | null; toleranceFt: number; within: boolean | null };
  hardware: DoorHardware;
  traceNote: string | null;
};

/** A8.2's set for a door against the sets that list it in the manual. */
export function doorHardware(number: string, drawingSet: string, sets: HardwareSet[]): DoorHardware {
  const manualSets = sets.filter(s => s.doors.includes(number)).map(s => s.number);
  const status: HardwareStatus = !manualSets.length ? "not-in-manual" : manualSets.length > 1 ? "in-several-sets" : manualSets[0] === drawingSet ? "match" : "different-set";
  return {
    drawingSet, manualSets, status, drawingSetInManual: sets.some(s => s.number === drawingSet),
    sets: sets.filter(s => s.number === drawingSet || manualSets.includes(s.number)),
  };
}

/** Door numbers the manual's hardware sets list that aren't on the schedule (e.g. 119B, 120A). */
export const hardwareDoorsNotOnSchedule = (rows: DoorScheduleRow[], sets: HardwareSet[]): { door: string; set: string }[] =>
  sets.flatMap(s => s.doors.filter(d => !rows.some(r => r.number === d)).map(door => ({ door, set: s.number })));

/** Openings and leaves, scheduled vs modeled. A pair is one opening with two leaves; 209A has no leaves. */
export type DoorCounts = { openings: { scheduled: number; modeled: number; scheduleOnly: number }; leaves: { scheduled: number; modeled: number; scheduleOnly: number } };
export function doorCounts(rows: DoorScheduleRow[], objects: ModelObject[]): DoorCounts {
  const modeled = new Set(objects.filter(o => o.door).map(o => o.door!.row.number));
  const leaves = (list: DoorScheduleRow[]) => list.reduce((n, r) => n + (r.panels ?? 0), 0);
  const inModel = rows.filter(r => modeled.has(r.number)), only = rows.filter(r => !modeled.has(r.number));
  return {
    openings: { scheduled: rows.length, modeled: inModel.length, scheduleOnly: only.length },
    leaves: { scheduled: leaves(rows), modeled: leaves(inModel), scheduleOnly: leaves(only) },
  };
}

/** One partition type from the A8.1 schedules, with its tag decoded through the A8.1 legend. */
export type PartitionTypeRow = {
  tag: string;
  /** "S_-_-2 non-rated stud partition". */
  schedule: string;
  construction: string; ratingHeight: string; unitWidth: string; gypsum: string; uniqueCondition: string;
  /** As scheduled ("4 7/8\"", "<varies>") and in inches when it is a number. */
  roughThickness: string; roughThicknessIn: number | null;
  /** The rough thickness, or where it says <varies>, the legend's nominal (studs plus 5/8 in. per gypsum layer). */
  modeledThicknessIn: number;
  fireRating: string;
  source: SourceRef;
};

/** The partition schedule and the plan's default type ("interior partitions are SA3.20 unless noted"). */
export type PartitionSchedule = { types: PartitionTypeRow[]; defaultType: string; defaultNote: string };

/** How a partition's type is known: a plan tag on the segment, the general note, or unverified (a nearby tag that can't be tied to it). */
export type PartitionBasis = "tag" | "general-note" | "unverified";

/** "SA. 3. 10", "sa 3.10" → "SA3.10". */
export const normalizePartitionTag = (tag: string): string => {
  const m = tag.toUpperCase().replace(/[\s.]/g, "").match(/^([A-Z]{2})(\d{1,2})(\d)(\d)$/);
  return m ? `${m[1]}${m[2]}.${m[3]}${m[4]}` : tag.trim().toUpperCase();
};

/** One row of the architect's finish schedule (A12.1). */
export type FinishScheduleRow = {
  tag: string;
  /** The schedule's section heading, "09 67 00", and its title. */
  section: string; sectionTitle: string;
  description: string; manufacturer: string; product: string; color: string; size: string; comments: string;
  source: SourceRef;
};

/**
 * perimeterFt is a floor's edge run along walls, the base line: its open edges (finish lines inside a
 * room) are left out. For a ceiling zone it is the gross zone boundary, not a wall-angle or trim quantity.
 */
export type Dimensions = { lengthFt: number | null; areaSf: number | null; perimeterFt: number | null; heightFt: number | null; thicknessIn: number | null; volumeCy: number | null };

/** One selectable object, resolved for the views and the inspector. */
export type ModelObject = {
  id: string; name: string; kind: ObjectKind; shape: Shape;
  points: Point[]; base: number; height: number; thickness: number; depth: number;
  level: LevelId; room: string | null; views: ModelView[];
  discipline: Discipline; division: string; divisionName: string; specSection: string | null;
  materialId: string; assembly: string;
  /** Finish schedule tag and row, when the assembly is scheduled (A12.1). */
  tag: string | null; schedule: FinishScheduleRow | null;
  /** Base tag along a floor finish's edge, from the finish schedule. */
  baseTag: string | null;
  /** For a transition, the room on the other side. */
  adjoins: string | null;
  /** For a partition: its A8.1 type row, and how the type is known. */
  partitionType: PartitionTypeRow | null; partitionBasis: PartitionBasis | null;
  /** For a door: its A8.2 row, leaves, width check and hardware. points are the opening; quantity is 1 opening. */
  door: DoorDetail | null;
  /** For a ceiling zone: printed tag, type, height above floor, elevation, paint and status. */
  ceiling: CeilingDetail | null;
  /** The takeoff quantity in the assembly's unit. */
  quantity: { value: number; unit: QuantityUnit };
  /** Only the dimensions that mean something for the kind; the rest are null. */
  dimensions: Dimensions;
  /** The finish schedule row's fields (and the base), then the assembly's properties, then the object's own. */
  properties: ModelProperty[];
  /** The object's own source first, then the assembly's. */
  sources: ModelSource[];
  basis: { geometry: "traced" | "illustrative"; material: "documented" | "illustrative" };
  /** How much of the object comes from the documents, 0–1 (see confidenceFor). */
  confidence: number;
  description: string;
  /** What is approximate about the geometry. */
  caution: string;
};

// ── Measuring ───────────────────────────────────────────────────────────────

const round = (v: number) => Math.round(v * 100) / 100;
const DIMENSIONS: Record<ObjectKind, (keyof Dimensions)[]> = {
  wall: ["lengthFt", "areaSf", "heightFt", "thicknessIn"], glass: ["lengthFt", "areaSf", "heightFt"], door: ["lengthFt", "heightFt"],
  floor: ["areaSf", "perimeterFt"], ceiling: ["areaSf", "perimeterFt"], transition: ["lengthFt"], slab: ["areaSf", "thicknessIn", "volumeCy"], roof: ["areaSf", "thicknessIn"],
  beam: ["lengthFt", "heightFt"], duct: ["lengthFt"], pipe: ["lengthFt"], column: ["heightFt"], equipment: ["heightFt"], fixture: ["heightFt"],
};

/** Plan area of a polygon in square feet (shoelace formula). */
export function planArea(points: Point[]): number {
  let twice = 0;
  points.forEach(([x, z], i) => { const [nx, nz] = points[(i + 1) % points.length]; twice += x * nz - nx * z; });
  return Math.abs(twice) / 2;
}

/** Every measure of an object's geometry, before choosing the ones that apply to its kind. */
function measures(kind: ObjectKind, points: Point[], height: number, thickness: number, depth: number, openEdges: number[] = []): Dimensions {
  const shape = SHAPES[kind];
  if (shape === "segment") {
    const length = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
    return { lengthFt: length, areaSf: length * height, perimeterFt: null, heightFt: height, thicknessIn: thickness * 12, volumeCy: length * height * thickness / 27 };
  }
  if (shape === "polygon") {
    const area = planArea(points);
    const perimeter = points.reduce((sum, [x, z], i) => { const [nx, nz] = points[(i + 1) % points.length]; return openEdges.includes(i) ? sum : sum + Math.hypot(nx - x, nz - z); }, 0);
    return { lengthFt: null, areaSf: area, perimeterFt: perimeter, heightFt: null, thicknessIn: height * 12, volumeCy: area * height / 27 };
  }
  return { lengthFt: null, areaSf: thickness * depth, perimeterFt: null, heightFt: height, thicknessIn: null, volumeCy: thickness * depth * height / 27 };
}

/**
 * The rule behind `confidence`, not a measurement: geometry traced from a sheet with a documented
 * assembly 0.75; traced geometry whose assembly is not verified 0.5; an illustrative placement 0.25.
 */
export const confidenceFor = (basis: ModelObject["basis"]): number =>
  basis.geometry === "illustrative" ? 0.25 : basis.material === "documented" ? 0.75 : 0.5;

/** A schedule row as inspector properties, skipping empty columns. */
function scheduleProperties(row: FinishScheduleRow): ModelProperty[] {
  return ([["Tag", row.tag], ["Description", row.description], ["Manufacturer", row.manufacturer], ["Product", row.product],
    ["Color / finish", row.color], ["Size", row.size], ["Comments", row.comments], ["Specification", `${row.section} ${row.sectionTitle}`]] as [string, string][])
    .filter(([, value]) => value.trim()).map(([label, value]) => ({ label, value }));
}

/** A partition type as inspector properties. */
function partitionProperties(row: PartitionTypeRow): ModelProperty[] {
  return ([["Partition type", row.tag], ["Schedule", row.schedule], ["Construction", row.construction], ["Height / rating", row.ratingHeight],
    ["Stud width", row.unitWidth], ["Gypsum board", row.gypsum], ["Unique condition", row.uniqueCondition], ["Rough thickness", row.roughThickness], ["Fire rating", row.fireRating]] as [string, string][]).map(([label, value]) => ({ label, value }));
}

/** A door's schedule row as inspector properties. */
function doorProperties(row: DoorScheduleRow): ModelProperty[] {
  return ([["Door", row.number], ["Panels", row.panels === null ? "" : String(row.panels)], ["Panel size", [row.width, row.height, row.thickness].filter(Boolean).join(" x ")],
    ["Panel material", row.material], ["Glass", row.glass || "Not scheduled"], ["Panel type", [row.panelType, row.panelTypeName].filter(Boolean).join(" - ")], ["Frame", [row.frameMaterial, row.frameType && `type ${row.frameType}`].filter(Boolean).join(", ")],
    ["Fire rating", row.fireRating], ["Hardware set (A8.2)", row.hardwareSet],
    ["Details", `head ${row.details.head}, jambs ${row.details.jambLeft} / ${row.details.jambRight}, sill ${row.details.sill}`], ["Comments", row.comments]] as [string, string][])
    .filter(([, value]) => value.trim()).map(([label, value]) => ({ label, value }));
}

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Resolves the data into selectable objects. Throws on a missing assembly, a unit the shape can't
 * measure, a tag that isn't on its schedule, a partition whose plan tag or thickness disagrees
 * with its assembly's A8.1 type, or a door that isn't on the schedule, has the wrong number of
 * leaves, or has a leaf not hinged at a jamb. A door whose width differs from the schedule is
 * resolved as traced, with the difference in its width check.
 */
export function resolveObjects(inputs: ModelInput[], materials: MaterialInfo[], schedule: FinishScheduleRow[] = [], partitions: PartitionSchedule = { types: [], defaultType: "", defaultNote: "" },
  doors: DoorSchedule = { rows: [], hardwareSets: [], widthToleranceFt: 0 }, ceilings: CeilingSchedule = { types: [] }): ModelObject[] {
  const rowOf = (tag: string | undefined, id: string): FinishScheduleRow | null => {
    if (!tag) return null;
    return schedule.find(r => r.tag === tag) ?? (() => { throw new Error(`${id}: ${tag} is not on the finish schedule`); })();
  };
  return inputs.map(input => {
    const material = materials.find(m => m.id === input.materialId);
    if (!material) throw new Error(`${input.id}: no assembly ${input.materialId}`);
    const row = rowOf(material.tag, material.id), baseRow = rowOf(material.base, material.id);
    const partition = material.partitionType
      ? partitions.types.find(r => r.tag === material.partitionType) ?? (() => { throw new Error(`${material.id}: ${material.partitionType} is not on the partition schedule`); })()
      : null;
    const planTag = input.partitionTag ? normalizePartitionTag(input.partitionTag) : null;
    const partitionBasis: PartitionBasis | null = !partition ? null : planTag ? "tag" : input.partitionUnverified ? "unverified" : "general-note";
    if (!partition && (planTag || input.partitionUnverified)) throw new Error(`${input.id}: a partition type note on ${material.id}, which isn't a partition type`);
    if (planTag && input.partitionUnverified) throw new Error(`${input.id}: tagged ${planTag} and unverified at once`);
    if (partition && planTag && planTag !== partition.tag) throw new Error(`${input.id}: the plan tags ${planTag} but the assembly is ${partition.tag}`);
    if (partition && !planTag && partition.tag !== partitions.defaultType) throw new Error(`${input.id}: untagged, so ${partitions.defaultType} by the general note, but the assembly is ${partition.tag}`);
    if (partition && Math.abs((input.thickness ?? 0) * 12 - partition.modeledThicknessIn) > 0.01) {
      throw new Error(`${input.id}: modeled ${round((input.thickness ?? 0) * 12)} in. thick, ${partition.tag} is ${partition.modeledThicknessIn} in.`);
    }
    const door = doorDetail(input, doors);
    const ceiling = ceilingDetail(input, ceilings);
    const thickness = input.thickness ?? 0, depth = input.depth ?? thickness;
    if (input.openEdges?.some(i => input.kind !== "floor" || !Number.isInteger(i) || i < 0 || i >= input.points.length)) throw new Error(`${input.id}: open edges must be edges of a floor`);
    const all = measures(input.kind, input.points, input.height, thickness, depth, input.openEdges);
    const dimensions = Object.fromEntries((Object.keys(all) as (keyof Dimensions)[])
      .map(k => [k, DIMENSIONS[input.kind].includes(k) && all[k] !== null ? round(all[k]!) : null])) as Dimensions;
    const raw = material.unit === "EA" ? 1 : material.unit === "SF" ? all.areaSf : material.unit === "LF" ? all.lengthFt : all.volumeCy;
    if (raw === null) throw new Error(`${input.id}: a ${input.kind} can't be counted in ${material.unit}`);
    const basis = { geometry: input.geometry ?? "traced", material: material.status === "Documented" ? "documented" : "illustrative" } as const;
    const sources = [input.source, ...material.sources.filter(s => s.sheet !== input.source.sheet || s.detail !== input.source.detail)]
      .map(s => ({ ...s, drawing: s.drawing ?? "" }));
    return {
      id: input.id, name: input.name, kind: input.kind, shape: SHAPES[input.kind],
      points: input.points, base: input.base ?? 0, height: input.height, thickness, depth,
      level: input.level ?? "L1", room: input.room ?? null, views: material.views,
      discipline: material.discipline, division: material.division, divisionName: CSI_DIVISIONS[material.division] ?? "",
      specSection: material.specSection, materialId: material.id, assembly: material.name,
      tag: material.tag ?? null, schedule: row, baseTag: material.base ?? null, adjoins: input.adjoins ?? null,
      partitionType: partition, partitionBasis, door, ceiling,
      quantity: { value: round(raw), unit: material.unit }, dimensions,
      properties: [
        ...(row ? scheduleProperties(row) : []),
        ...(baseRow ? [{ label: "Base", value: [baseRow.tag, baseRow.description, baseRow.manufacturer, baseRow.color, baseRow.size].filter(Boolean).join(", ") }] : []),
        ...(partition ? partitionProperties(partition) : []),
        ...(partitionBasis ? [{ label: "Type basis", value: partitionBasis === "tag" ? `Tagged ${planTag} on ${input.source.sheet}`
          : partitionBasis === "unverified" ? `Unverified: ${input.partitionUnverified}. Modeled as ${partitions.defaultType} by the general note.` : partitions.defaultNote }] : []),
        ...(door ? doorProperties(door.row) : []),
        ...(ceiling ? ceilingProperties(ceiling) : []),
        ...material.properties, ...(input.properties ?? []),
      ],
      sources, basis, confidence: confidenceFor(basis),
      description: input.description, caution: input.geometryStatus,
    };
  });
}

/** A ceiling zone's printed tag and height checked against the ceiling types; null for anything else. */
function ceilingDetail(input: ModelInput, ceilings: CeilingSchedule): CeilingDetail | null {
  const c = input.ceiling;
  if (!c) {
    if (input.kind === "ceiling") throw new Error(`${input.id}: a ceiling zone without its tag record`);
    return null;
  }
  if (input.kind !== "ceiling") throw new Error(`${input.id}: a ceiling tag on a ${input.kind}`);
  const type = c.tag === null ? null : ceilings.types.find(t => t.tag === c.tag) ?? (() => { throw new Error(`${input.id}: ceiling tag ${c.tag} is not a ceiling type`); })();
  const heightAffFt = c.height === null ? null : parseFeetInches(c.height) ?? (() => { throw new Error(`${input.id}: can't read the height "${c.height}"`); })();
  const shape = c.status === "tagged" ? !!c.tag && heightAffFt !== null : c.status === "height-unresolved" ? !!c.tag && heightAffFt === null : !c.tag && heightAffFt === null;
  if (!shape) throw new Error(`${input.id}: status ${c.status} doesn't match tag ${c.tag ?? "none"} and height ${c.height ?? "none"}`);
  if (planArea(input.points) <= 0) throw new Error(`${input.id}: a ceiling zone with no area`);
  const floor = LEVELS.find(l => l.id === (input.level ?? "L1"))!.elevation;
  return {
    tag: c.tag, type, status: c.status, heightText: c.height, heightAffFt, elevationFt: heightAffFt === null ? null : floor + heightAffFt,
    paint: c.tag !== "GWB-1" ? null : c.paintTag ? { tag: c.paintTag, basis: "tagged" } : { tag: "PT-05", basis: "ceiling-paint-default" },
    note: c.note ?? null,
  };
}

function ceilingProperties(c: CeilingDetail): ModelProperty[] {
  return ([["Ceiling tag (plan)", c.tag ?? "Not tagged"], ["Legend", c.type?.legend ?? ""], ["Schedule link", c.type?.scheduleLink ? `${c.type.scheduleLink.tag} (${c.type.scheduleLink.basis})` : c.type ? "Not on the finish schedule" : ""],
    ["Height above floor", c.heightText ?? "Not resolved"], ["Paint", c.paint ? `${c.paint.tag}${c.paint.basis === "tagged" ? " (tagged on the plan)" : " (A12.1 ceiling paint; not tagged on the plan)"}` : ""],
    ...(c.type?.conflicts ?? []).map(text => ["Source conflict", text] as [string, string]), ["Ceiling note", c.note ?? ""]] as [string, string][])
    .filter(([, value]) => value.trim()).map(([label, value]) => ({ label, value }));
}

/** One row per room with ceiling zones: each zone's printed tag, height and area, and the room's total. */
export type RoomCeilingRow = {
  /** null for zones with no room number on the plan. */
  room: string | null; level: LevelId;
  zones: { id: string; tag: string | null; heightText: string | null; elevationFt: number | null; areaSf: number; status: CeilingStatus }[];
  areaSf: number; heights: string[]; unresolved: number;
};
export function roomCeilingSchedule(objects: ModelObject[]): RoomCeilingRow[] {
  const zones = objects.filter(o => o.kind === "ceiling" && o.ceiling);
  const keys = [...new Set(zones.map(o => `${o.level}|${o.room ?? ""}`))].sort();
  return keys.map(key => {
    const [level, room] = key.split("|") as [LevelId, string], mine = zones.filter(o => o.level === level && (o.room ?? "") === room);
    return {
      room: room || null, level,
      zones: mine.map(o => ({ id: o.id, tag: o.ceiling!.tag, heightText: o.ceiling!.heightText, elevationFt: o.ceiling!.elevationFt, areaSf: o.quantity.value, status: o.ceiling!.status })),
      areaSf: round(mine.reduce((a, o) => a + o.quantity.value, 0)),
      heights: [...new Set(mine.map(o => o.ceiling!.heightText).filter((h): h is string => !!h))],
      unresolved: mine.filter(o => o.ceiling!.status !== "tagged").length,
    };
  });
}

/** A door input's schedule row, leaves and checks; null for anything that isn't a numbered door. */
function doorDetail(input: ModelInput, doors: DoorSchedule): DoorDetail | null {
  if (!input.doorNumber) {
    if (input.leaves?.length) throw new Error(`${input.id}: leaves without a door number`);
    return null;
  }
  if (input.kind !== "door") throw new Error(`${input.id}: a door number on a ${input.kind}`);
  const row = doors.rows.find(r => r.number === input.doorNumber) ?? (() => { throw new Error(`${input.id}: door ${input.doorNumber} is not on the door schedule`); })();
  const leaves = (input.leaves ?? []).map(([hinge, tip]) => ({ hinge, tip, lengthFt: round(dist(hinge, tip)) }));
  if (leaves.length !== (row.panels ?? 0)) throw new Error(`${input.id}: ${leaves.length} leaves drawn, door ${row.number} has ${row.panels ?? 0} panels`);
  const [jambA, jambB] = input.points;
  for (const leaf of leaves) if (Math.min(dist(leaf.hinge, jambA), dist(leaf.hinge, jambB)) > 0.25) throw new Error(`${input.id}: a leaf is not hinged at a jamb`);
  const openingFt = dist(jambA, jambB), panelFt = row.widthIn === null ? null : row.widthIn / 12;
  const scheduledFt = panelFt === null || row.panels === null ? null : panelFt * row.panels;
  const openingDeltaFt = scheduledFt === null ? null : round(openingFt - scheduledFt);
  const leafDeltaFt = panelFt === null || !leaves.length ? null : round(Math.max(...leaves.map(l => Math.abs(dist(l.hinge, l.tip) - panelFt))));
  const within = openingDeltaFt === null ? null : Math.abs(openingDeltaFt) <= doors.widthToleranceFt && (leafDeltaFt ?? 0) <= doors.widthToleranceFt;
  return {
    row, leaves, openingFt: round(openingFt), scheduledFt: scheduledFt === null ? null : round(scheduledFt),
    widthCheck: { openingDeltaFt, leafDeltaFt, toleranceFt: doors.widthToleranceFt, within },
    hardware: doorHardware(row.number, row.hardwareSet, doors.hardwareSets), traceNote: input.traceNote ?? null,
  };
}

// ── Contractor review and show/hide (project-scoped browser storage) ─────────

export type ObjectReviewStatus = "unreviewed" | "verified" | "flagged";
export type ObjectReviewEvent = { status: ObjectReviewStatus; note: string; by: string; at: string };
export type ObjectReview = { objectId: string; status: ObjectReviewStatus; note: string; by: string; at: string; history: ObjectReviewEvent[] };
/** `hidden`: CSI divisions switched off in each view. */
export type ModelReviewState = { reviews: ObjectReview[]; hidden: Record<ModelView, string[]> };
export const EMPTY_MODEL_REVIEW: ModelReviewState = { reviews: [], hidden: { interior: [], mep: [], structural: [], exterior: [] } };

export type ModelErrors = Partial<Record<"object" | "note" | "by" | "view" | "division", string>>;
export class ModelRuleError extends Error {
  readonly errors: ModelErrors;
  constructor(errors: ModelErrors) {
    super(Object.values(errors).join(" "));
    this.name = "ModelRuleError";
    this.errors = errors;
  }
}
const fail = (errors: ModelErrors): never => { throw new ModelRuleError(errors); };
const now = () => new Date().toISOString();

export const reviewOf = (state: ModelReviewState, objectId: string): ObjectReview | null => state.reviews.find(r => r.objectId === objectId) ?? null;
export const reviewStatus = (state: ModelReviewState, objectId: string): ObjectReviewStatus => reviewOf(state, objectId)?.status ?? "unreviewed";

function record(state: ModelReviewState, objects: ModelObject[], objectId: string, status: ObjectReviewStatus, note: string, by: string, at: string): ModelReviewState {
  if (!objects.some(o => o.id === objectId)) fail({ object: "That object is not in the model." });
  if (!by?.trim()) fail({ by: "Say who reviewed it." });
  const event = { status, note: note.trim(), by: by.trim(), at };
  const current = reviewOf(state, objectId);
  const next: ObjectReview = { objectId, ...event, history: [...(current?.history ?? []), event] };
  return { ...state, reviews: current ? state.reviews.map(r => r.objectId === objectId ? next : r) : [...state.reviews, next] };
}

/** The contractor confirms the object's quantities and properties can be relied on. */
export function verifyObject(state: ModelReviewState, objects: ModelObject[], objectId: string, by: string, note = "", at = now()): ModelReviewState {
  if (reviewStatus(state, objectId) === "verified") fail({ object: "Already verified." });
  return record(state, objects, objectId, "verified", note, by, at);
}

/** Marks an object for checking; the note says what. Flagging again replaces the note. */
export function flagObject(state: ModelReviewState, objects: ModelObject[], objectId: string, note: string, by: string, at = now()): ModelReviewState {
  if (!note?.trim()) fail({ note: "Say what needs checking." });
  return record(state, objects, objectId, "flagged", note, by, at);
}

/** Back to unreviewed; the history is kept. */
export function clearObjectReview(state: ModelReviewState, objects: ModelObject[], objectId: string, by: string, at = now()): ModelReviewState {
  if (reviewStatus(state, objectId) === "unreviewed") return state;
  return record(state, objects, objectId, "unreviewed", "", by, at);
}

/** Shows or hides one CSI division in one view (Marcel: show/hide by trade). */
export function setDivisionHidden(state: ModelReviewState, view: ModelView, division: string, hidden: boolean): ModelReviewState {
  if (!MODEL_VIEWS.some(v => v.id === view)) fail({ view: "Choose a model view." });
  if (!CSI_DIVISIONS[division]) fail({ division: "Choose a CSI division." });
  const current = state.hidden[view] ?? [];
  if (current.includes(division) === hidden) return state;
  const next = hidden ? [...current, division].sort() : current.filter(d => d !== division);
  return { ...state, hidden: { ...state.hidden, [view]: next } };
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type ObjectFilter = {
  view?: ModelView; level?: LevelId; discipline?: Discipline; division?: string; kind?: ObjectKind; room?: string;
  review?: ObjectReviewStatus; query?: string;
};

/** Objects matching every filter given. `review` needs the review state. Model order is kept. */
export function filterObjects(objects: ModelObject[], filter: ObjectFilter = {}, state: ModelReviewState = EMPTY_MODEL_REVIEW): ModelObject[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return objects.filter(o => (!filter.view || o.views.includes(filter.view)) && (!filter.level || o.level === filter.level)
    && (!filter.discipline || o.discipline === filter.discipline) && (!filter.division || o.division === filter.division)
    && (!filter.kind || o.kind === filter.kind) && (!filter.room || o.room === filter.room)
    && (!filter.review || reviewStatus(state, o.id) === filter.review)
    && (!q || [o.id, o.name, o.assembly, o.room ?? "", o.specSection ?? "", ...o.properties.map(p => p.value)].join(" ").toLowerCase().includes(q)));
}

/** What a view draws: its objects, minus the divisions hidden in it. */
export const visibleObjects = (objects: ModelObject[], state: ModelReviewState, view: ModelView): ModelObject[] =>
  objects.filter(o => o.views.includes(view) && !(state.hidden[view] ?? []).includes(o.division));

/** The divisions in a view (or the whole model), for the show/hide controls. In division order. */
export function divisionsIn(objects: ModelObject[], view?: ModelView): { division: string; name: string; count: number }[] {
  const inView = objects.filter(o => !view || o.views.includes(view));
  return [...new Set(inView.map(o => o.division))].sort()
    .map(division => ({ division, name: CSI_DIVISIONS[division] ?? "", count: inView.filter(o => o.division === division).length }));
}

export type ReviewSummary = { objects: number; verified: number; flagged: number; unreviewed: number; lowConfidence: number };
/** Review counts for a view or the whole model. Low confidence is below 0.5. */
export function reviewSummary(objects: ModelObject[], state: ModelReviewState, view?: ModelView): ReviewSummary {
  const list = objects.filter(o => !view || o.views.includes(view));
  const count = (s: ObjectReviewStatus) => list.filter(o => reviewStatus(state, o.id) === s).length;
  return { objects: list.length, verified: count("verified"), flagged: count("flagged"), unreviewed: count("unreviewed"), lowConfidence: list.filter(o => o.confidence < 0.5).length };
}

export type RoomFinishRow = {
  room: string; level: LevelId;
  floors: { id: string; tag: string | null; assembly: string; areaSf: number }[];
  areaSf: number;
  /** Base tags along the room's floor finishes, and their gross run (door openings not deducted). */
  baseTags: string[]; baseLf: number;
  transitions: { id: string; tag: string | null; lengthFt: number; to: string | null }[];
  doors: number;
  /** Walls drawn for the room, by centreline length. */
  wallLf: number;
};

/**
 * The interior takeoff by room, like a finish schedule: floor finishes and areas, base run,
 * transitions at its openings, doors and walls. Rooms come from the floor finish zones; in room order.
 */
export function roomFinishSchedule(objects: ModelObject[]): RoomFinishRow[] {
  const rooms = [...new Set(objects.filter(o => o.kind === "floor" && o.room).map(o => o.room!))].sort();
  const sum = (values: number[]) => round(values.reduce((a, b) => a + b, 0));
  return rooms.map(room => {
    const floors = objects.filter(o => o.kind === "floor" && o.room === room);
    const based = floors.filter(f => f.baseTag);
    return {
      room, level: floors[0].level,
      floors: floors.map(f => ({ id: f.id, tag: f.tag, assembly: f.assembly, areaSf: f.quantity.value })),
      areaSf: sum(floors.map(f => f.quantity.value)),
      baseTags: [...new Set(based.map(f => f.baseTag!))], baseLf: sum(based.map(f => f.dimensions.perimeterFt ?? 0)),
      transitions: objects.filter(o => o.kind === "transition" && (o.room === room || o.adjoins === room))
        .map(t => ({ id: t.id, tag: t.tag, lengthFt: t.quantity.value, to: t.room === room ? t.adjoins : t.room })),
      doors: objects.filter(o => o.kind === "door" && o.room === room).length,
      wallLf: sum(objects.filter(o => o.kind === "wall" && o.room === room).map(o => o.dimensions.lengthFt ?? 0)),
    };
  });
}

// ── Selection ───────────────────────────────────────────────────────────────

export const findObject = (objects: ModelObject[], id: string | null | undefined): ModelObject | null => objects.find(o => o.id === id) ?? null;

/** Every object of the same assembly, the selected one included ("select all like this"). */
export function sameAssembly(objects: ModelObject[], id: string): ModelObject[] {
  const selected = findObject(objects, id);
  return selected ? objects.filter(o => o.materialId === selected.materialId) : [];
}

const UNIT_ORDER: QuantityUnit[] = ["SF", "LF", "EA", "CY"];
/** Totals for a multi-selection, per unit (SF, LF, EA, CY). Unknown ids are ignored. */
export function selectionTotals(objects: ModelObject[], ids: string[]): { count: number; totals: { unit: QuantityUnit; value: number }[] } {
  const picked = objects.filter(o => ids.includes(o.id));
  return {
    count: picked.length,
    totals: UNIT_ORDER.map(unit => ({ unit, value: round(picked.filter(o => o.quantity.unit === unit).reduce((s, o) => s + o.quantity.value, 0)) }))
      .filter(t => picked.some(o => o.quantity.unit === t.unit)),
  };
}

/** The next (1) or previous (-1) object in a list, wrapping; the first one when nothing in the list is selected. */
export function stepSelection(list: ModelObject[], currentId: string | null, step: 1 | -1): string | null {
  if (!list.length) return null;
  const i = list.findIndex(o => o.id === currentId);
  if (i < 0) return list[0].id;
  return list[(i + step + list.length) % list.length].id;
}
