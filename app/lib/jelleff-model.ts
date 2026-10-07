// The Jelleff Recreation Center model: the traced first floor the studio has always shown, plus
// illustrative structural, MEP and roof objects for the four views. Types and measuring rules are
// in lib/model.ts.

import { resolveObjects, type FinishScheduleRow, type PartitionSchedule, type PartitionTypeRow, type LevelId, type MaterialInfo, type ModelElement, type ModelInput, type ModelObject, type ModelReviewState, type Point, type SourceRef } from "./model";
import { SAMPLE_PROJECT_ID } from "./project-scope";
import { doorMaterialFor, doorMaterials, doorSchedule, doorScheduleRows, doorTraces } from "./jelleff-doors";

export type { MaterialInfo, ModelElement, Point, SourceRef } from "./model";

export const planTransform = {
  origin: [460, 725] as Point,
  feetPerPixel: (177 + 4 / 12) / 1270,
  imageWidth: 2400,
  imageHeight: 1715,
};

const plan: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A1.1", page: 46, detail: "Level 01 - first floor plan", asset: "/models/jelleff/a1-1.png",
};
const partitions: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A8.1", page: 64, detail: "Partition schedules S_-_-1 and S_-_-2, and the partition type legend", asset: "/models/jelleff/a8-1.png",
};
const finishSchedule: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A12.1", page: 79, detail: "Finish schedules and details", asset: "/models/jelleff/a12-1.png",
};
const finishPlan: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A12.2", page: 80, detail: "Level 01 - finish plan", asset: "/models/jelleff/a12-2.png",
};
const finishPlanL2: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A12.3", page: 81, detail: "Level 02 - finish plan", asset: "/models/jelleff/a12-3.png",
};
export const levelSource: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A5.1", page: 57, detail: "Building sections: first floor 0 ft, second floor 14 ft, low roof 28 ft", asset: "/models/jelleff/a5-1.png",
};

// A8.1 partition type legend. A tag reads construction, rating/height, stud width, gypsum layers,
// unique condition: SA3.21 = steel studs, full height, 3 5/8" metal, one layer each side, sound
// attenuation full height. Only the codes the schedules use are listed.
const partitionLegend = {
  construction: { S: "Steel (metal studs)" } as Record<string, string>,
  rating: { A: "Full height / underside of structure (not rated)" } as Record<string, string>,
  width: { "2": [2.5, "2 1/2\" metal"], "3": [3.625, "3 5/8\" metal"], "6": [6, "6\" metal"], "8": [8, "8\" metal"] } as Record<string, [number, string]>,
  gypsum: { "1": [1, "One layer, tag side"], "2": [2, "One layer, each side"] } as Record<string, [number, string]>,
  unique: { "0": "No unique condition", "1": "Sound attenuation full height", "2": "Impact resistant gypsum board" } as Record<string, string>,
};
/** Both A8.1 partition schedules, as printed: every row is non-rated (NR), no STC or details. */
const partitionScheduleRows: [tag: string, schedule: string, rough: string][] = [
  ["SA2.10", "S_-_-1 non-rated stud partition", "<varies>"], ["SA2.13", "S_-_-1 non-rated stud partition", "3 1/8\""],
  ["SA3.10", "S_-_-1 non-rated stud partition", "4 1/4\""], ["SA6.10", "S_-_-1 non-rated stud partition", "6 5/8\""],
  ["SA3.20", "S_-_-2 non-rated stud partition", "4 7/8\""], ["SA3.21", "S_-_-2 non-rated stud partition", "4 7/8\""],
  ["SA6.20", "S_-_-2 non-rated stud partition", "<varies>"], ["SA6.21", "S_-_-2 non-rated stud partition", "7 1/4\""],
  ["SA8.20", "S_-_-2 non-rated stud partition", "9 1/4\""],
];
const inches = (v: string) => { const m = v.match(/^(\d+)(?: (\d+)\/(\d+))?"$/); return m ? +m[1] + (m[2] ? +m[2] / +m[3] : 0) : null; };
export const partitionTypes: PartitionTypeRow[] = partitionScheduleRows.map(([tag, schedule, rough]) => {
  const [c, r, w, g, u] = [tag[0], tag[1], tag.slice(2, -3), tag.at(-2)!, tag.at(-1)!];
  const width = partitionLegend.width[w], gypsum = partitionLegend.gypsum[g];
  if (!width || !gypsum) throw new Error(`${tag}: stud width or gypsum code not in the A8.1 legend`);
  return {
    tag, schedule, construction: partitionLegend.construction[c], ratingHeight: partitionLegend.rating[r], unitWidth: width[1], gypsum: gypsum[1],
    uniqueCondition: partitionLegend.unique[u] ?? `${u} (not in the A8.1 legend)`,
    roughThickness: rough, roughThicknessIn: inches(rough), modeledThicknessIn: inches(rough) ?? width[0] + gypsum[0] * 5 / 8,
    fireRating: "Not rated (NR)", source: partitions,
  };
});
export const partitionSchedule: PartitionSchedule = {
  types: partitionTypes, defaultType: "SA3.20",
  defaultNote: "General note 3 on A1.1 and A1.2: all interior partitions are wall type SA.3.20 unless noted otherwise.",
};
const typeRow = (tag: string) => partitionTypes.find(r => r.tag === tag)!;
const partitionAssembly = (id: string, type: string, color: string, note: string): MaterialInfo => {
  const row = typeRow(type);
  return {
    id, name: `${type} - ${row.unitWidth} studs, ${row.gypsum.toLowerCase()}`, color, status: "Documented",
    discipline: "architectural", division: "09", specSection: "09 21 16", unit: "SF", views: ["interior"], partitionType: type, properties: [],
    description: `A8.1 ${row.schedule}: ${row.unitWidth} studs, ${row.gypsum.toLowerCase()}, ${row.uniqueCondition.toLowerCase()}; rough thickness ${row.roughThickness}. ${note}`,
    sources: [partitions],
  };
};
const partitionAssemblies: MaterialInfo[] = [
  partitionAssembly("partition", "SA3.20", "#e7e1d5", "The plan's default interior partition (general note 3 on A1.1 and A1.2)."),
  partitionAssembly("partition-sa2-10", "SA2.10", "#d9cdb8", "A8.1 leaves the thickness to the condition; the model uses the legend's nominal 3 1/8 in."),
  partitionAssembly("partition-sa3-10", "SA3.10", "#ddd3bf", "Gypsum board on the tag side only."),
  partitionAssembly("partition-sa3-21", "SA3.21", "#d3dadb", "Full-height sound attenuation."),
  partitionAssembly("partition-sa6-20", "SA6.20", "#d6c6a8", "A8.1 leaves the thickness to the condition; the model uses the legend's nominal 7 1/4 in."),
  partitionAssembly("partition-sa8-20", "SA8.20", "#cdb995", ""),
];
/** A wall's model thickness in feet: its partition type's, or 12 in. for the schematic envelope. */
const wallThickness = (materialId: string) => {
  const type = partitionAssemblies.find(m => m.id === materialId)?.partitionType;
  return type ? typeRow(type).modeledThicknessIn / 12 : 1;
};

export const materials: MaterialInfo[] = [
  ...partitionAssemblies,
  {
    id: "envelope", name: "Exterior / existing wall - schematic", color: "#c8c5bc", status: "Illustrative",
    discipline: "architectural", division: "04", specSection: null, unit: "SF", views: ["interior", "exterior"],
    properties: [{ label: "Assembly", value: "Not verified from the envelope details" }, { label: "Model thickness", value: "12 in. nominal" }],
    description: "Neutral exterior wall representation. Its layers, finish, and nominal 12 in. model thickness have not been verified from the envelope details.",
    sources: [plan],
  },
  {
    id: "storefront", name: "Aluminum storefront / glazing", color: "#89c9d7", status: "Documented",
    discipline: "architectural", division: "08", specSection: "08 41 13", unit: "SF", views: ["interior", "exterior"],
    properties: [{ label: "System", value: "Aluminum storefront" }, { label: "Glazing", value: "Not specified in the model" }],
    description: "Aluminum storefront is called out on A1.1 at the lobby and fitness area. Glass tint, simplified frames, height, and placement of individual panels are illustrative; no glazing specification is inferred.",
    sources: [plan],
  },
  {
    id: "gym-floor", name: "FAF-01 - poured sports flooring", color: "#b69770", status: "Documented",
    discipline: "architectural", division: "09", specSection: "09 67 00", tag: "FAF-01", base: "VWB-01", unit: "SF", views: ["interior"],
    properties: [],
    description: "A12.2 tags the gym FAF-01. A12.1 schedules Tarkett Sports Indoor, Polyturf Plus Pad + Pour; Desert base with grey and white striping. Display color and court markings are approximate.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "concrete", name: "PLC-01 - polished concrete", color: "#c5c2b9", status: "Documented",
    discipline: "architectural", division: "03", specSection: "03 33 00", tag: "PLC-01", base: "WB-01", unit: "SF", views: ["interior"],
    properties: [],
    description: "Tagged PLC-01 on A12.2 (lobby and circulation) and A12.3 (Level 02 corridor). A12.1 lists Ardex, Ultraflor Diamatic, low gloss. WB-01 is the field base; A12.1 puts WB-02 along PT-02 walls and WB-03 along PT-03 walls, which the model doesn't split out. The slab thickness and display color are illustrative.",
    sources: [finishSchedule],
  },
  {
    id: "carpet", name: "CPT-01 - carpet", color: "#959d92", status: "Documented",
    discipline: "architectural", division: "09", specSection: "09 68 00", tag: "CPT-01", base: "WB-01", unit: "SF", views: ["interior"],
    properties: [],
    description: "Office areas are tagged CPT-01 on A12.2. A12.1 lists Shaw Contract Observe, color Radiant Nature 05326, 9 x 36 in., installed ashlar. Pattern and display color are simplified.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "fitness-floor", name: "RF-01 - resilient sports flooring", color: "#786e55", status: "Documented",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "RF-01", base: "WB-01", unit: "SF", views: ["interior"],
    properties: [],
    description: "Fitness 106 is tagged RF-01 on A12.2. A12.1 schedules Mondo Sports Impact, 136 Brown, installed ashlar. Display color and floor thickness are approximate.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "tile", name: "FT-01 - taupe floor tile", color: "#b8b2a0", status: "Documented",
    discipline: "architectural", division: "09", specSection: "09 30 00", tag: "FT-01", base: "TB-01", unit: "SF", views: ["interior"],
    properties: [{ label: "Showers", value: "FT-02, 2\" x 2\" (not modeled)" }],
    description: "Tagged FT-01 on A12.2 (Level 01 wet areas) and A12.3 (toilets 203-205). A12.1 lists Tilebar Nashville, taupe matte, 12 x 24 in.; shower areas use FT-02. Small shower transitions are omitted from this room-level model.",
    sources: [finishSchedule],
  },
  {
    id: "entry-grille", name: "WOG-01 - entrance floor grille", color: "#7d8989", status: "Documented",
    discipline: "architectural", division: "12", specSection: "12 48 16", tag: "WOG-01", unit: "SF", views: ["interior"],
    properties: [],
    description: "Vestibules are tagged WOG-01 on A12.2. A12.1 schedules Construction Specialties Gridline G6 stainless steel entrance grilles. Individual bars are omitted.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "service-floor", name: "SCE-01 - sealed concrete", color: "#a9aca6", status: "Documented",
    discipline: "architectural", division: "03", specSection: "03 33 00", tag: "SCE-01", unit: "SF", views: ["interior"],
    properties: [],
    description: "Tagged SCE-01 on A12.2 (storage 120, electrical utility 119A) and A12.3 (IT 201, electrical 217, mechanical 218, janitor 221). A12.1 lists sealed concrete with a clear, premium-quality, low-VOC sealer. The grouped Level 01 service zone also includes a simplified stair footprint.",
    sources: [finishSchedule],
  },
];

const point = ([x, y]: Point): Point => [
  (x - planTransform.origin[0]) * planTransform.feetPerPixel,
  (y - planTransform.origin[1]) * planTransform.feetPerPixel,
];

// ponytail: this is one hand-traced demo, not a PDF parser; measured use needs validated reconstruction.
const simplified = "Simplified manual trace for visualization; not surveyed geometry, quantities, or construction coordination.";

function wall(id: string, name: string, a: Point, b: Point, materialId = "partition", height = 14, room?: string, partitionTag?: string): ModelInput {
  return {
    id, name, kind: "wall", materialId, points: [point(a), point(b)], height,
    thickness: wallThickness(materialId), partitionTag,
    room, source: plan, geometryStatus: simplified,
    description: height === 28
      ? "Gym enclosure traced from A1.1. A 28 ft visualization height represents a tall gym volume; the low-roof datum is documented, but this wall height is not verified."
      : "First-floor segment traced from A1.1. The 14 ft model height follows the second-floor datum on A5.1; local tops, offsets, and structural details are simplified.",
  };
}

function glass(id: string, name: string, a: Point, b: Point, room?: string): ModelElement {
  return {
    id, name, kind: "glass", materialId: "storefront", points: [point(a), point(b)], height: 10, thickness: 0.15,
    room, source: plan, geometryStatus: simplified,
    description: "Storefront location approximated from A1.1. The 10 ft glazing height, tint, mullions, and simplified panel extent are illustrative.",
  };
}

function floor(id: string, name: string, materialId: string, points: Point[], room: string): ModelElement {
  return {
    id, name, kind: "floor", materialId, points: points.map(point), height: 0.18, base: -0.18,
    room, source: finishPlan, geometryStatus: simplified,
    description: "Room-level finish zone traced to the A1.1 plan and assigned from A12.2. Edges, minor recesses, finish transitions, and slab thickness are simplified.",
  };
}

export const elements: ModelInput[] = [
  // The gym stays separate from the low-rise wing; the central yard has no floor or roof mesh.
  wall("gym-north", "Gym - north enclosure", [460, 725], [970, 725], "envelope", 28, "103"),
  wall("gym-west-north", "Gym - northwest pier", [460, 725], [460, 789], "envelope", 28, "103"),
  wall("gym-west", "Gym - west enclosure", [460, 835], [460, 1340], "envelope", 28, "103"),
  wall("gym-west-south", "Gym - southwest pier", [460, 1385], [460, 1445], "envelope", 28, "103"),
  wall("gym-south", "Gym - south enclosure", [460, 1445], [970, 1445], "envelope", 28, "103"),
  wall("gym-east-north", "Gym - northeast return", [970, 725], [970, 761], "envelope", 28, "103"),
  wall("gym-east", "Gym - east enclosure / bleacher side", [970, 805], [970, 1186], "envelope", 28, "103"),
  wall("gym-east-pier", "Gym - lobby door pier", [970, 1238], [970, 1254], "envelope", 28, "103"),
  wall("gym-east-south", "Gym - southeast enclosure", [970, 1295], [970, 1445], "envelope", 28, "103"),
  wall("storage-north", "Storage 120 - north", [970, 725], [1045, 725], "envelope", 14, "120"),
  wall("storage-south", "Storage 120 - shaft-side partition", [970, 895], [1045, 895], "partition", 14, "120"),
  wall("yard-west", "Open mechanical yard - west boundary", [1045, 725], [1045, 998], "envelope"),
  wall("yard-north-west", "Mechanical yard - north return", [1045, 725], [1100, 725], "envelope"),
  wall("yard-north-east", "Mechanical yard - north enclosure", [1142, 725], [1363, 725], "envelope"),
  wall("yard-east", "Mechanical yard - utility-side enclosure", [1363, 725], [1363, 998], "envelope"),
  wall("yard-south-west", "Mechanical yard - south return", [1045, 998], [1100, 998], "envelope"),
  wall("yard-south-east", "Mechanical yard - south return / gate", [1292, 998], [1308, 998], "envelope"),
  wall("service-north", "Locker and utility block - north", [1363, 725], [1725, 725], "envelope"),
  wall("service-east-north", "Locker block - east enclosure", [1725, 725], [1725, 838], "envelope"),
  wall("service-east-south", "Locker block - east return", [1725, 885], [1725, 978], "envelope"),
  wall("service-utility-south", "Electrical utility - south partition", [1363, 836], [1435, 836], "partition", 14, "119A"),
  wall("service-locker-north", "North locker room - west partition", [1496, 725], [1496, 836], "partition", 14, "117B"),
  wall("service-restroom-middle", "Toilet / shower blocks - dividing partition", [1363, 875], [1680, 875], "partition"),
  wall("service-locker-south", "South locker room - west partition", [1448, 917], [1448, 998], "partition", 14, "116B"),
  wall("service-south", "South toilet / shower - corridor partition", [1448, 998], [1668, 998], "partition", 14, "116A"),
  wall("office-west", "Office 105 - west partition", [1067, 1004], [1067, 1185], "partition", 14, "105"),
  { ...wall("office-divider", "Offices 104 / 105 - dividing partition", [1204, 1004], [1204, 1140], "partition-sa2-10", 14, undefined, "SA. 2. 10"),
    description: "First-floor segment traced from A1.1. A1.1 tags SA2.10 on both faces, around a solid-filled core the supplied sheets don't type; the model shows one SA2.10 wall at 14 ft." },
  wall("office-east", "Office 104 - east partition", [1310, 1004], [1310, 1140], "partition-sa2-10", 14, "104", "SA. 2. 10"),
  wall("office-105-south", "Office 105 - lobby partition", [1067, 1140], [1166, 1140], "partition-sa6-20", 14, "105", "SA. 6. 20"),
  wall("office-104-south", "Office 104 - lobby partition", [1245, 1140], [1310, 1140], "partition", 14, "104"),
  wall("stair-a-west", "Stair A - gym-side boundary", [1028, 942], [1028, 1185], "envelope"),
  wall("stair-a-south", "Stair A - lobby return", [970, 1185], [1028, 1185], "envelope"),
  { ...wall("fitness-west", "Fitness - lobby return", [1274, 1215], [1274, 1330], "partition", 14, "106"),
    partitionUnverified: "SA6.20 and SA3.10 tags sit beside this segment on A1.1, but neither leader can be followed to it" },
  wall("fitness-entry-return", "Fitness - south entrance return", [1254, 1330], [1254, 1378], "envelope", 14, "106"),
  wall("fitness-office", "Fitness / office 108 partition", [1530, 1100], [1579, 1240], "partition-sa8-20", 14, "106", "SA. 8. 20"),
  wall("office-108-north", "Office 108 - storage partition", [1549, 1155], [1598, 1134], "partition", 14, "108"),
  wall("guard-divider", "Guard / office partition", [1598, 1070], [1660, 1205], "partition", 14, "110"),
  wall("family-south", "Family room - guard partition", [1624, 1140], [1677, 1117], "partition", 14, "109"),
  wall("wing-east", "Angled wing - guard-side enclosure", [1732, 1074], [1766, 1165], "envelope", 14, "110"),
  wall("vestibule-west", "Main vestibule - gym-side wall", [977, 1330], [977, 1445], "envelope", 14, "101"),
  // Storefronts leave visible gaps at the main entry and fitness access.
  glass("yard-office-glass", "Office windows to mechanical yard", [1100, 998], [1292, 998]),
  glass("entry-west-glass", "Main entrance - west glazed panel", [977, 1445], [1015, 1445], "101"),
  glass("entry-east-glass", "Main entrance - east glazed panel", [1060, 1445], [1100, 1445], "101"),
  glass("vestibule-east-glass", "Main vestibule - east storefront", [1100, 1330], [1100, 1445], "101"),
  glass("lobby-south-west-glass", "Lobby storefront - west panel", [977, 1330], [1015, 1330], "102"),
  glass("lobby-south-east-glass", "Lobby storefront - south glazing", [1060, 1330], [1274, 1330], "102"),
  glass("fitness-corridor-west-glass", "Fitness / circulation storefront - west", [1310, 1200], [1410, 1157], "106"),
  glass("fitness-corridor-east-glass", "Fitness / circulation storefront - east", [1442, 1143], [1530, 1100], "106"),
  glass("fitness-south-glass", "Fitness - angled exterior storefront", [1254, 1378], [1579, 1240], "106"),
  glass("office-108-south-glass", "Office 108 - angled exterior storefront", [1579, 1240], [1660, 1205], "108"),
  glass("guard-south-glass", "Guard room - angled exterior storefront", [1660, 1205], [1766, 1165], "110"),
  glass("side-entry-glass", "Side vestibule storefront", [1681, 998], [1732, 1074], "111"),
  floor("floor-gym", "Gym 103 - sports floor", "gym-floor", [[467, 732], [964, 732], [964, 1438], [467, 1438]], "103"),
  floor("floor-vestibule", "Vestibule 101 - entrance grille", "entry-grille", [[977, 1330], [1100, 1330], [1100, 1445], [977, 1445]], "101"),
  floor("floor-lobby", "Lobby 102 - polished concrete", "concrete", [[977, 1185], [1067, 1185], [1067, 1140], [1310, 1140], [1310, 1200], [1274, 1215], [1274, 1330], [977, 1330]], "102"),
  floor("floor-office-105", "Office 105 - carpet", "carpet", [[1067, 1004], [1204, 1004], [1204, 1140], [1067, 1140]], "105"),
  floor("floor-office-104", "Office 104 - carpet", "carpet", [[1204, 1004], [1310, 1004], [1310, 1140], [1204, 1140]], "104"),
  floor("floor-fitness", "Fitness 106 - resilient sports flooring", "fitness-floor", [[1274, 1215], [1530, 1100], [1579, 1240], [1254, 1378], [1254, 1330], [1274, 1330]], "106"),
  floor("floor-office-108", "Office 108 - carpet", "carpet", [[1549, 1155], [1622, 1124], [1660, 1205], [1579, 1240]], "108"),
  floor("floor-storage-107", "Storage 107 - resilient flooring", "fitness-floor", [[1530, 1100], [1598, 1070], [1622, 1124], [1549, 1155]], "107"),
  floor("floor-guard", "Guard 110 - floor tile", "tile", [[1624, 1140], [1708, 1104], [1732, 1074], [1766, 1165], [1660, 1205]], "110"),
  floor("floor-family", "Family 109 - floor tile", "tile", [[1598, 1070], [1678, 1037], [1708, 1104], [1624, 1140]], "109"),
  floor("floor-side-entry", "Vestibule 111 - entrance grille", "entry-grille", [[1540, 1050], [1681, 998], [1704, 1032], [1598, 1070]], "111"),
  floor("floor-north-lockers", "Toilet / shower and lockers 117 - tile", "tile", [[1496, 732], [1718, 732], [1718, 869], [1369, 869], [1369, 842], [1496, 842]], "117A / 117B"),
  floor("floor-south-lockers", "Toilet / shower and lockers 116 - tile", "tile", [[1369, 881], [1718, 881], [1718, 975], [1668, 998], [1448, 998], [1448, 917], [1369, 917]], "116A / 116B"),
  floor("floor-utility", "Electrical utility / stair B - service zone", "service-floor", [[1369, 732], [1490, 732], [1490, 830], [1369, 830]], "119A"),
  floor("floor-storage-120", "Storage 120 - sealed concrete", "service-floor", [[977, 732], [1038, 732], [1038, 890], [977, 890]], "120"),
  floor("floor-circulation", "Circulation 102B - polished concrete", "concrete", [[1316, 998], [1417, 998], [1417, 1072], [1500, 1072], [1500, 1005], [1580, 1005], [1540, 1050], [1598, 1070], [1530, 1100], [1316, 1197]], "102B"),
];

/** Room labels, Level 01. Level 02 labels are in level2Rooms; allRooms has both. */
export const rooms: { id: string; name: string; number: string; center: Point; level: LevelId }[] = ([
  { id: "gym", name: "Gym", number: "103", center: point([716, 1090]) },
  { id: "lobby", name: "Lobby", number: "102", center: point([1120, 1250]) },
  { id: "vestibule", name: "Vestibule", number: "101", center: point([1040, 1390]) },
  { id: "fitness", name: "Fitness center", number: "106", center: point([1430, 1225]) },
  { id: "office-105", name: "Office (BGCGW)", number: "105", center: point([1133, 1075]) },
  { id: "office-104", name: "Office (DPR)", number: "104", center: point([1255, 1075]) },
  { id: "office-108", name: "Office", number: "108", center: point([1600, 1190]) },
  { id: "guard", name: "Guard", number: "110", center: point([1700, 1160]) },
  { id: "family", name: "Family", number: "109", center: point([1650, 1100]) },
  { id: "lockers-north", name: "Toilet / shower + lockers", number: "117", center: point([1610, 807]) },
  { id: "lockers-south", name: "Toilet / shower + lockers", number: "116", center: point([1570, 950]) },
  { id: "yard", name: "Open mechanical yard", number: "118", center: point([1203, 855]) },
  { id: "storage", name: "Storage", number: "120", center: point([1008, 817]) },
] as { id: string; name: string; number: string; center: Point }[]).map(r => ({ ...r, level: "L1" as LevelId }));

// ── Structural, MEP and roof objects (illustrative) ─────────────────────────
// Placed for the demo on the traced gym and service areas. Footprints follow A1.1 and heights the
// A5.1 levels; positions, sizes and products are NOT from structural, MEP or roofing drawings.

const placed = "Illustrative placement for the demo; not taken from structural, MEP or roofing drawings.";
const illustrative = (properties: [string, string][]) => properties.map(([label, value]) => ({ label, value }));

export const systemMaterials: MaterialInfo[] = [
  { id: "slab-on-grade", name: "Concrete slab on grade", color: "#a8a49b", status: "Illustrative", sources: [plan],
    description: "Slab under the traced floor finishes. Thickness, reinforcing and vapour retarder are assumed for the demo.",
    discipline: "structural", division: "03", specSection: "03 30 00", unit: "CY", views: ["structural"],
    properties: illustrative([["Thickness", "5 in. (illustrative)"], ["Reinforcing", "Not modeled"], ["Concrete", "4,000 psi (illustrative)"]]) },
  { id: "steel-column", name: "Structural steel column", color: "#6f7f8f", status: "Illustrative", sources: [plan, levelSource],
    description: "Columns at the gym wall lines, rising to the low-roof datum. Grid, section and base plates are assumed.",
    discipline: "structural", division: "05", specSection: "05 12 00", unit: "EA", views: ["structural"],
    properties: illustrative([["Section", "W10 (illustrative)"], ["Base", "Not modeled"]]) },
  { id: "roof-framing", name: "Steel roof girder", color: "#7c8a96", status: "Illustrative", sources: [levelSource],
    description: "Girders spanning the gym under the roof. Spacing, depth and bearing are assumed.",
    discipline: "structural", division: "05", specSection: "05 12 00", unit: "LF", views: ["structural"],
    properties: illustrative([["Depth", "24 in. (illustrative)"], ["Spacing", "About 25 ft (illustrative)"]]) },
  { id: "roof-membrane", name: "TPO roof assembly", color: "#d9d6cf", status: "Illustrative", sources: [levelSource],
    description: "Roof over the gym at the low-roof datum. Membrane and insulation follow the demo's specification list, not the Jelleff roof details.",
    discipline: "architectural", division: "07", specSection: "07 54 23", unit: "SF", views: ["exterior"],
    properties: illustrative([["Membrane", "60-mil reinforced TPO (illustrative)"], ["Insulation", "Tapered polyiso, R-30 (illustrative)"], ["Assembly thickness", "6 in. (illustrative)"]]) },
  { id: "ductwork", name: "Galvanized supply and return ductwork", color: "#b9c4cc", status: "Illustrative", sources: [plan],
    description: "Main duct runs from the mechanical yard into the gym. Sizes, routing and insulation are assumed.",
    discipline: "mechanical", division: "23", specSection: "23 31 13", unit: "LF", views: ["mep"],
    properties: illustrative([["Size", "24 × 14 in. (illustrative)"], ["Insulation", "Duct wrap R-6 (illustrative)"]]) },
  { id: "air-handler", name: "Packaged air-handling unit", color: "#9aa7a0", status: "Illustrative", sources: [plan],
    description: "Equipment in the open mechanical yard. Tag, capacity and footprint are assumed.",
    discipline: "mechanical", division: "23", specSection: "23 73 13", unit: "EA", views: ["mep"],
    properties: illustrative([["Tag", "AHU-1 (illustrative)"], ["Capacity", "Not verified"]]) },
  { id: "sprinkler-main", name: "Wet-pipe sprinkler main", color: "#c75b4a", status: "Illustrative", sources: [plan],
    description: "Main across the gym below the roof. Size, hazard class and head layout are assumed.",
    discipline: "fire-protection", division: "21", specSection: "21 13 13", unit: "LF", views: ["mep"],
    properties: illustrative([["Size", "4 in. (illustrative)"], ["System", "Wet pipe"]]) },
  { id: "water-pipe", name: "Domestic water piping", color: "#5b8fc7", status: "Illustrative", sources: [plan],
    description: "Cold-water main to the locker rooms. Size, material and route are assumed.",
    discipline: "plumbing", division: "22", specSection: "22 11 16", unit: "LF", views: ["mep"],
    properties: illustrative([["Size", "2 in. (illustrative)"], ["Material", "Copper type L (illustrative)"]]) },
  { id: "panelboard", name: "Electrical panelboard", color: "#8a8170", status: "Illustrative", sources: [plan],
    description: "Panel in electrical utility 119A. Rating and circuits are assumed.",
    discipline: "electrical", division: "26", specSection: "26 24 16", unit: "EA", views: ["mep"],
    properties: illustrative([["Rating", "225 A, 208Y/120 V (illustrative)"]]) },
  { id: "high-bay", name: "High-bay LED light fixture", color: "#e2c86b", status: "Illustrative", sources: [plan],
    description: "Gym light fixtures below the roof. Type, count and mounting height are assumed.",
    discipline: "electrical", division: "26", specSection: "26 51 00", unit: "EA", views: ["mep"],
    properties: illustrative([["Type", "LED high-bay (illustrative)"], ["Mounting", "About 25 ft (illustrative)"]]) },
];

const gym: Point[] = [[460, 725], [970, 725], [970, 1445], [460, 1445]];
const system = (id: string, name: string, kind: ModelInput["kind"], materialId: string, pixels: Point[], base: number, height: number, thickness: number, level: ModelInput["level"], source: SourceRef, room?: string, depth?: number): ModelInput =>
  ({ id, name, kind, materialId, points: pixels.map(point), base, height, thickness, depth, level, room, source, geometry: "illustrative", geometryStatus: placed, description: systemMaterials.find(m => m.id === materialId)!.description });

export const systemElements: ModelInput[] = [
  system("slab-gym", "Gym 103 - slab on grade", "slab", "slab-on-grade", gym, -0.18 - 5 / 12, 5 / 12, 0, "L1", plan, "103"),
  system("slab-wing", "Lobby and offices - slab on grade (part)", "slab", "slab-on-grade", [[977, 998], [1310, 998], [1310, 1445], [977, 1445]], -0.18 - 5 / 12, 5 / 12, 0, "L1", plan),
  ...([["gw-n", "west, north end", 460, 725], ["gw-m", "west, middle", 460, 1085], ["gw-s", "west, south end", 460, 1445], ["ge-n", "east, north end", 970, 725], ["ge-m", "east, middle", 970, 1085], ["ge-s", "east, south end", 970, 1445]] as [string, string, number, number][])
    .map(([id, where, x, z]) => system(`col-${id}`, `Gym column - ${where}`, "column", "steel-column", [[x, z]], 0, 28, 10 / 12, "L1", plan, "103")),
  ...[905, 1085, 1265].map((z, i) => system(`girder-${i + 1}`, `Gym roof girder ${i + 1}`, "beam", "roof-framing", [[460, z], [970, z]], 26, 2, 0.75, "roof", levelSource, "103")),
  system("roof-gym", "Gym roof", "roof", "roof-membrane", gym, 28, 0.5, 0, "roof", levelSource, "103"),
  system("ahu-1", "AHU-1 in the mechanical yard", "equipment", "air-handler", [[1203, 860]], 0, 6, 8, "L1", plan, "118", 14),
  system("duct-yard", "Supply duct - yard to gym", "duct", "ductwork", [[1150, 860], [970, 860]], 20, 14 / 12, 2, "L1", plan),
  system("duct-gym-supply", "Supply duct - gym main", "duct", "ductwork", [[970, 860], [520, 860]], 20, 14 / 12, 2, "L1", plan, "103"),
  system("duct-gym-return", "Return duct - gym", "duct", "ductwork", [[970, 1310], [520, 1310]], 20, 14 / 12, 2, "L1", plan, "103"),
  system("sprinkler-gym", "Sprinkler main - gym", "pipe", "sprinkler-main", [[520, 1085], [940, 1085]], 25, 4 / 12, 4 / 12, "L1", plan, "103"),
  system("water-lockers", "Domestic water main - locker rooms", "pipe", "water-pipe", [[1370, 950], [1700, 950]], 9, 2 / 12, 2 / 12, "L1", plan),
  system("panel-119a", "Panelboard in electrical utility 119A", "equipment", "panelboard", [[1400, 765]], 1, 6, 1.75, "L1", plan, "119A", 0.5),
  ...([[590, 905], [840, 905], [590, 1265], [840, 1265]] as Point[]).map((p, i) => system(`light-hb-${i + 1}`, `Gym high-bay light ${i + 1}`, "fixture", "high-bay", [p], 25, 1, 2, "L1", plan, "103", 2)),
];


// ── Finish schedule (A12.1), the rows the interior model uses ───────────────

const a12: SourceRef = { ...finishSchedule, detail: "Finish schedule" };
const row = (tag: string, section: string, sectionTitle: string, description: string, manufacturer: string, product: string, color: string, size: string, comments: string): FinishScheduleRow =>
  ({ tag, section, sectionTitle, description, manufacturer, product, color, size, comments, source: a12 });

/** Rows transcribed from the A12.1 finish schedule for the finishes, bases and transitions in the model. */
export const finishScheduleRows: FinishScheduleRow[] = [
  row("PLC-01", "03 33 00", "Concrete finishing", "Polished concrete", "Ardex", "Ultraflor Diamatic", "Low gloss", "", ""),
  row("SCE-01", "03 33 00", "Concrete finishing", "Sealed concrete (BOH)", "Ardex", "", "", "", "Clear sealer, premium quality, low VOC"),
  row("FT-01", "09 30 00", "Tiling", "Floor tile", "Tilebar", "Nashville", "Taupe, matte finish", "12\" x 24\"", "Install: soldier course; see plans"),
  row("QT-01", "09 30 00", "Tiling", "Quarry tile", "Daltile", "Quarry Tile", "Ashen grey, abrasive", "6\" x 6\"", ""),
  row("TB-01", "09 30 00", "Tiling", "Tile base", "Tilebar", "Nashville", "Beige, matte finish", "6\" x TBD", ""),
  row("TB-02", "09 30 00", "Tiling", "Tile base", "Daltile", "Quarry Tile Round Top Cove Base Q3565", "Ashen grey", "5\" x 6\"", "Include outside and inside corner profiles as needed"),
  row("LVT-01", "09 65 00", "Resilient flooring", "Resilient flooring (wood-look)", "Interface", "Northern Grain A025", "A02611 Oak Satin", "3 mm; 25 cm x 1 m", ""),
  row("LVT-02", "09 65 00", "Resilient flooring", "Resilient flooring (yellow)", "Interface", "Studioset A007", "A00712 Marigold", "3 mm; 25 cm x 1 m", ""),
  row("LVT-03", "09 65 00", "Resilient flooring", "Resilient flooring (green)", "Interface", "Studioset A007", "A00715 Chartreuse", "3 mm; 25 cm x 1 m", ""),
  row("RF-01", "09 65 00", "Resilient flooring", "Resilient flooring", "Mondo", "Sports Impact", "136 Brown", "7/16\" thk; 91 cm x 91 cm", "Install: ashlar"),
  row("RF-02", "09 65 00", "Resilient flooring", "Resilient flooring (stairs)", "Nora", "Norament Grano", "5302 Angelica Root", "Article 468 (5' wide)", "Include black anti-slip nosing strip"),
  row("TS-02", "09 65 00", "Resilient flooring", "Resilient floor transition", "Schluter", "Vinpro-U", "Stainless steel V2A", "", "Concrete to LVT"),
  row("TS-03", "09 65 00", "Resilient flooring", "Concrete transition", "Johnsonite", "Reno-U", "Finish TBD", "", "Concrete to floor tile"),
  row("TS-04", "09 65 00", "Resilient flooring", "Carpet transition", "Schluter", "Reno TK", "Stainless steel V2A", "", "Concrete to carpet"),
  row("TS-06", "09 65 00", "Resilient flooring", "Gym floor transition", "Johnsonite", "Threshold", "Grey", "VT-XX-M2 3' pieces 5-1/2\" exposed threshold", "Concrete to gym floor"),
  row("TS-07", "09 65 00", "Resilient flooring", "Resilient floor transition", "Johnsonite", "Slimline", "Grey", "CTA-XX-C", "Resilient to resilient"),
  row("TS-08", "09 65 00", "Resilient flooring", "Tile transition", "Schluter", "Schiene", "Stainless steel V2A", "", ""),
  row("VWB-01", "09 65 00", "Resilient flooring", "Vented wall base", "Johnsonite", "TBD", "47 Brown", "", "At gym"),
  row("WB-01", "09 65 00", "Resilient flooring", "Resilient base (field)", "Roppe", "", "694 Parchment", "4\" H base", "Cove base at hard surfaces, straight base at carpet"),
  row("FAF-01", "09 67 00", "Fluid applied flooring", "Fluid applied flooring", "Tarkett Sports Indoor", "Polyturf Plus Pad + Pour", "Base - Desert, line 1 - grey, line 2 - white", "", "At gyms, logo and lettering included, see plans"),
  row("CPT-01", "09 68 00", "Carpet", "Carpet", "Shaw Contract", "Observe color 5T309", "Radiant Nature 05326", "9\" x 36\"", "Install: ashlar"),
  row("WOG-01", "12 48 16", "Entrance floor grilles", "Walk off grilles", "Construction Specialties", "Gridline G6", "Stainless steel", "", "At vestibules"),
];

// ── Floor transitions at the traced openings (A1.1), typed from A12.1 ────────
// The strip at each opening follows the two finishes it joins: concrete to carpet is TS-04
// (detail A), concrete to the gym or fitness floor is TS-06 (detail E). Locations are the door
// openings traced on A1.1; the assignment is read from the schedule, not from a tagged plan.

const detail = (letter: string, title: string): SourceRef => ({ ...finishSchedule, detail: `Transition detail ${letter}: ${title}` });
export const transitionMaterials: MaterialInfo[] = [
  { id: "transition-carpet", name: "TS-04 - carpet transition", color: "#9aa0a4", status: "Documented", sources: [detail("A", "carpet to concrete"), finishSchedule],
    description: "Reducer strip where carpet meets polished concrete (A12.1 detail A).",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "TS-04", unit: "LF", views: ["interior"], properties: [] },
  { id: "transition-gym", name: "TS-06 - gym floor transition", color: "#8b8f92", status: "Documented", sources: [detail("E", "concrete to fitness flooring"), finishSchedule],
    description: "Continuous extruded aluminum cover plate where the gym or fitness floor meets concrete (A12.1 detail E).",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "TS-06", unit: "LF", views: ["interior"], properties: [] },
  { id: "transition-resilient-concrete", name: "TS-02 - resilient floor transition", color: "#a2a6a8", status: "Documented", sources: [detail("B", "resilient to concrete"), finishSchedule],
    description: "Reducer strip where resilient flooring meets concrete (A12.1 detail B).",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "TS-02", unit: "LF", views: ["interior"], properties: [] },
  { id: "transition-tile", name: "TS-03 - concrete transition", color: "#959a9c", status: "Documented", sources: [detail("D", "concrete to tile"), finishSchedule],
    description: "Metal edge strip where tile meets concrete (A12.1 detail D).",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "TS-03", unit: "LF", views: ["interior"], properties: [] },
  { id: "transition-resilient", name: "TS-07 - resilient floor transition", color: "#9fa3a1", status: "Documented", sources: [detail("F", "resilient floor to resilient floor"), finishSchedule],
    description: "Transition strip between two resilient floors (A12.1 detail F).",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "TS-07", unit: "LF", views: ["interior"], properties: [] },
];

/** A traced door's opening, jamb to jamb, in its plan sheet's viewBox: strips at doors sit on it. */
const opening = (number: string): [Point, Point] => (doorTraces.find(t => t.number === number) ?? (() => { throw new Error(`door ${number} isn't traced`); })()).opening;
const atOpening = "On the door's traced opening (A1.1); the strip type follows the two finishes and the A12.1 schedule. Confirm on the finish plan.";
const transition = (id: string, name: string, materialId: string, a: Point, b: Point, room: string, adjoins: string, between: string): ModelInput => ({
  id, name, kind: "transition", materialId, points: [point(a), point(b)], base: 0, height: 0.05, thickness: 0.17, level: "L1", room, adjoins,
  source: plan, geometryStatus: atOpening, description: transitionMaterials.find(m => m.id === materialId)!.description,
  properties: [{ label: "Between", value: between }],
});

export const interiorTransitions: ModelInput[] = [
  transition("ts-gym-lobby-north", "Gym / lobby - north doors", "transition-gym", ...opening("103A"), "103", "102", "103 Gym (FAF-01) / 102 Lobby (PLC-01)"),
  transition("ts-gym-lobby-south", "Gym / lobby - south doors", "transition-gym", ...opening("103B"), "103", "102", "103 Gym (FAF-01) / 102 Lobby (PLC-01)"),
  transition("ts-office-105", "Office 105 / lobby", "transition-carpet", ...opening("105"), "105", "102", "105 Office (CPT-01) / 102 Lobby (PLC-01)"),
  transition("ts-office-104", "Office 104 / lobby", "transition-carpet", ...opening("104"), "104", "102", "104 Office (CPT-01) / 102 Lobby (PLC-01)"),
  transition("ts-fitness", "Fitness 106 / circulation", "transition-gym", ...opening("106"), "106", "102B", "106 Fitness (RF-01) / 102B Circulation (PLC-01)"),
];

// ── Level 02 (A1.2) ─────────────────────────────────────────────────────────
// Traced from A1.2, which is plotted at the same position and scale as A1.1, so it uses the same
// plan transform. The floor sits 14 ft up (A5.1). Floor finishes, finish lines and transition
// marks are read from the Level 02 finish plan (A12.3) and resolved through A12.1.

const planL2: SourceRef = { drawing: "Jelleff drawing set", sheet: "A1.2", page: 47, detail: "Level 02 - second floor plan", asset: "/models/jelleff/a1-2.png" };
const L2 = 14;
const tracedL2 = "Simplified manual trace from A1.2 for visualization; not surveyed geometry, quantities, or construction coordination.";

export const level2Materials: MaterialInfo[] = [
  { id: "l2-floor", name: "Level 02 floor zone - no finish tag", color: "#d2cec4", status: "Illustrative", sources: [finishPlanL2],
    description: "Room-level floor zone traced from A1.2 where A12.3 shows no floor finish tag, so no finish is assigned.",
    discipline: "architectural", division: "09", specSection: null, unit: "SF", views: ["interior"],
    properties: [{ label: "Finish", value: "Not tagged on A12.3" }] },
  { id: "lvt-wood", name: "LVT-01 - wood-look resilient flooring", color: "#b89a74", status: "Documented", sources: [finishSchedule],
    description: "A12.3 tags activity 215, game room 213, storage 209 and both multipurpose rooms LVT-01. A12.1 lists Interface Northern Grain A025, A02611 Oak Satin, 3 mm, 25 cm x 1 m. WB-01 is the field base; A12.1 puts WB-02 along PT-02 walls and WB-03 along PT-03 walls, which the model doesn't split out. Display color is approximate.",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "LVT-01", base: "WB-01", unit: "SF", views: ["interior"], properties: [] },
  { id: "lvt-yellow", name: "LVT-02 - yellow resilient flooring", color: "#d6b04a", status: "Documented", sources: [finishSchedule],
    description: "A12.3 tags the band along the south side of game room 213 LVT-02, split from its LVT-01 floor by a resilient-to-resilient finish line. A12.1 lists Interface Studioset A007, A00712 Marigold, 3 mm, 25 cm x 1 m.",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "LVT-02", base: "WB-01", unit: "SF", views: ["interior"], properties: [] },
  { id: "lvt-green", name: "LVT-03 - green resilient flooring", color: "#a8b552", status: "Documented", sources: [finishSchedule],
    description: "A12.3 tags the west band of multipurpose room 1 LVT-03, split from its LVT-01 floor by a resilient-to-resilient finish line. A12.1 lists Interface Studioset A007, A00715 Chartreuse, 3 mm, 25 cm x 1 m.",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "LVT-03", base: "WB-01", unit: "SF", views: ["interior"], properties: [] },
  { id: "quarry-tile", name: "QT-01 - quarry tile", color: "#9c9a94", status: "Documented", sources: [finishSchedule],
    description: "A12.3 tags kitchen 208 QT-01. A12.1 lists Daltile quarry tile, Ashen Grey abrasive, 6 x 6 in. The base is TB-02, the schedule's quarry tile cove base; A12.3 doesn't tag bases. FRP-01 wall panels are not modeled.",
    discipline: "architectural", division: "09", specSection: "09 30 00", tag: "QT-01", base: "TB-02", unit: "SF", views: ["interior"], properties: [] },
  { id: "stair-rubber", name: "RF-02 - stair rubber flooring", color: "#8f7f74", status: "Documented", sources: [finishSchedule],
    description: "A12.3 tags stair B RF-02. A12.1 lists Nora Norament Grano, 5302 Angelica Root, with a black anti-slip nosing strip. The stair is shown as a flat zone at the second floor, and no base is scheduled for it.",
    discipline: "architectural", division: "09", specSection: "09 65 00", tag: "RF-02", unit: "SF", views: ["interior"], properties: [] },
  { id: "interior-storefront", name: "Aluminum storefront - interior", color: "#9fd0dc", status: "Documented", sources: [planL2],
    description: "Interior aluminum storefront along the Level 02 corridor (A1.2, \"aluminum storefront typ.\"). Height, mullions and glass type are illustrative.",
    discipline: "architectural", division: "08", specSection: null, unit: "SF", views: ["interior"],
    properties: [{ label: "System", value: "Aluminum storefront (interior)" }, { label: "Glazing", value: "Not specified in the model" }] },
  { id: "operable-partition", name: "Operable partition", color: "#a7a196", status: "Documented", sources: [planL2],
    description: "Operable partitions shown and dimensioned on A1.2. Panel system and acoustic rating are not in the sheets available.",
    discipline: "architectural", division: "10", specSection: null, unit: "LF", views: ["interior"],
    properties: [{ label: "Type", value: "Operable partition, height as noted on A1.2" }] },
  { id: "guardrail", name: "Woven wire mesh guardrail", color: "#8f9294", status: "Documented", sources: [planL2],
    description: "Guardrail at the Level 02 edge over the lobby, noted on A1.2 (woven wire mesh, stainless supports and handrail). Height is assumed.",
    discipline: "architectural", division: "05", specSection: null, unit: "LF", views: ["interior"],
    properties: [{ label: "Infill", value: "Woven wire mesh" }, { label: "Supports", value: "Stainless steel supports and handrail" }, { label: "Model height", value: "42 in. (assumed)" }] },
];

const wall2 = (id: string, name: string, a: Point, b: Point, materialId: string, partitionTag?: string, room?: string): ModelInput => ({
  id, name, kind: "wall", materialId, points: [point(a), point(b)], base: L2, height: 14, thickness: wallThickness(materialId),
  level: "L2", room, source: planL2, geometryStatus: tracedL2, partitionTag,
  description: "Level 02 segment traced from A1.2; 14 ft model height from the second floor to the low roof (A5.1).",
});
const glass2 = (id: string, name: string, a: Point, b: Point, room?: string): ModelInput => ({
  id, name, kind: "glass", materialId: "interior-storefront", points: [point(a), point(b)], base: L2, height: 10, thickness: 0.15, level: "L2", room,
  source: planL2, geometryStatus: tracedL2, description: "Aluminum storefront on A1.2; the 10 ft height and panel extent are illustrative.",
});
const operable = (id: string, name: string, a: Point, b: Point, heightFt: number, noted: string, room: string): ModelInput => ({
  id, name, kind: "wall", materialId: "operable-partition", points: [point(a), point(b)], base: L2, height: heightFt, thickness: 0.5, level: "L2", room,
  source: planL2, geometryStatus: tracedL2, properties: [{ label: "Height (A1.2)", value: noted }],
  description: `Operable partition noted on A1.2 as ${noted}.`,
});
/** A Level 02 floor zone: a room, or a band where A12.3 draws a finish line inside it (`zone`, no label). */
type Level2Floor = { id: string; name: string; number: string; finish: string; pixels: Point[]; label?: Point; zone?: string; openEdges?: number[]; note?: string };
const floor2 = (f: Level2Floor): ModelInput => ({
  id: f.id, name: `${f.name} ${f.number}${f.zone ? ` - ${f.zone}` : ""} - Level 02 floor`, kind: "floor", materialId: f.finish, points: f.pixels.map(point),
  base: L2 - 0.18, height: 0.18, level: "L2", room: f.number, openEdges: f.openEdges, source: finishPlanL2, geometryStatus: tracedL2,
  properties: f.note ? [{ label: "Finish plan (A12.3)", value: f.note }] : [],
  description: "Level 02 room zone traced from A1.2 and checked against A12.3, where its finish is read. Edges and recesses are simplified.",
});
const concreteDoor = "Door mark SLE / PLC (sealed to polished concrete). A12.1 has no transition strip for concrete to concrete.";

const circulation2: Point[] = [[1500, 723], [1545, 723], [1548, 1043], [1705, 983], [1705, 1000], [1683, 1037], [1662, 1043], [1445, 1138], [1400, 1150], [1394, 1140], [1072, 1140], [1072, 1099], [1350, 1099], [1350, 1092], [1417, 1092], [1417, 1082], [1500, 1082]];
/**
 * Finishes as tagged on A12.3. `label` where a room's middle falls outside it (the L-shaped corridor).
 * Game room 213 and multipurpose room 1 each have a band A12.3 splits off with an RF / RF finish
 * line; that line is an open edge (no wall, no base) of both zones.
 */
const level2Floors: Level2Floor[] = [
  { id: "l2-circulation", name: "Circulation", number: "200", finish: "concrete", pixels: circulation2, label: [1420, 1118] },
  { id: "l2-it", name: "IT", number: "201", finish: "service-floor", pixels: [[1114, 1003], [1178, 1003], [1178, 1095], [1114, 1095]], note: concreteDoor },
  { id: "l2-toilet-203", name: "Toilet", number: "203", finish: "tile", pixels: [[1182, 1003], [1227, 1003], [1227, 1095], [1182, 1095]] },
  { id: "l2-toilet-204", name: "Toilet", number: "204", finish: "tile", pixels: [[1231, 1003], [1285, 1003], [1285, 1095], [1231, 1095]] },
  { id: "l2-toilet-205", name: "Toilet", number: "205", finish: "tile", pixels: [[1289, 1036], [1348, 1036], [1348, 1095], [1289, 1095]] },
  { id: "l2-closet", name: "Closet", number: "206A", finish: "l2-floor", pixels: [[1289, 1003], [1348, 1003], [1348, 1032], [1289, 1032]], note: "No floor tag, and no finish mark at its door." },
  { id: "l2-office", name: "Office / reception", number: "206", finish: "l2-floor", pixels: [[1352, 1003], [1415, 1003], [1415, 1088], [1352, 1088]],
    note: "No floor tag. The door mark reads RF, so the floor is resilient, but A12.3 doesn't say which product." },
  { id: "l2-kitchen", name: "Kitchen", number: "208", finish: "quarry-tile", pixels: [[1279, 1140], [1342, 1140], [1342, 1213], [1426, 1213], [1460, 1299], [1279, 1302]] },
  { id: "l2-storage", name: "Storage", number: "209", finish: "lvt-wood", pixels: [[1346, 1140], [1394, 1140], [1425, 1211], [1346, 1211]] },
  { id: "l2-mpr-1", name: "Multipurpose room 1", number: "210", finish: "lvt-wood", pixels: [[1463.4, 1129.8], [1543, 1094], [1600, 1218], [1520.9, 1263.8]], openEdges: [3] },
  { id: "l2-mpr-1-band", name: "Multipurpose room 1", number: "210", zone: "LVT-03 band", finish: "lvt-green",
    pixels: [[1400, 1150], [1445, 1138], [1463.4, 1129.8], [1520.9, 1263.8], [1460, 1299], [1420, 1198], [1410, 1177]], openEdges: [2] },
  { id: "l2-mpr-2", name: "Multipurpose room 2", number: "211", finish: "lvt-wood", pixels: [[1543, 1094], [1662, 1043], [1683, 1037], [1705, 1000], [1768, 1166], [1600, 1218]] },
  { id: "l2-game", name: "Game room", number: "213", finish: "lvt-wood", pixels: [[1550, 807], [1723, 807], [1723, 963], [1550, 963]], openEdges: [2] },
  { id: "l2-game-band", name: "Game room", number: "213", zone: "LVT-02 band", finish: "lvt-yellow", pixels: [[1550, 963], [1723, 963], [1723, 970], [1705, 983], [1550, 1041]], openEdges: [0] },
  { id: "l2-activity", name: "Activity 1", number: "215", finish: "lvt-wood", pixels: [[1550, 723], [1723, 723], [1723, 803], [1550, 803]] },
  { id: "l2-stair-b", name: "Stair B", number: "S202", finish: "stair-rubber", pixels: [[1364, 723], [1497, 723], [1497, 788], [1364, 788]] },
  { id: "l2-elec", name: "Electrical", number: "217", finish: "service-floor", pixels: [[1407, 792], [1497, 792], [1497, 834], [1407, 834]] },
  { id: "l2-mech", name: "Mechanical", number: "218", finish: "service-floor", pixels: [[1364, 838], [1497, 838], [1497, 942], [1426, 942], [1426, 996], [1364, 996]], note: concreteDoor },
  { id: "l2-janitor", name: "Janitor / laundry", number: "221", finish: "service-floor", pixels: [[1430, 946], [1497, 946], [1497, 994], [1430, 994]], note: concreteDoor },
];

const serviceCoreTags = "SA3.10 tags sit around the stair B / mechanical / janitor walls on A1.2, but their leaders can't be followed to this segment";
export const level2Elements: ModelInput[] = [
  ...level2Floors.map(floor2),
  // Envelope around the Level 02 wing (schematic, like Level 01's).
  wall2("l2-north", "Level 02 - north wall", [1362, 720], [1725, 720], "envelope"),
  wall2("l2-east", "Level 02 - east wall, activity and game rooms", [1725, 720], [1725, 975], "envelope"),
  wall2("l2-mpr-east", "Level 02 - multipurpose room 2 east wall", [1708, 995], [1770, 1168], "envelope", undefined, "211"),
  wall2("l2-south", "Level 02 - angled south wall, multipurpose rooms", [1770, 1168], [1455, 1302], "envelope"),
  wall2("l2-kitchen-south", "Level 02 - kitchen south wall", [1455, 1302], [1277, 1305], "envelope", undefined, "208"),
  wall2("l2-yard-east", "Level 02 - wall along the mechanical yard (east)", [1362, 720], [1362, 995], "envelope"),
  wall2("l2-yard-south", "Level 02 - wall along the mechanical yard (south)", [1140, 997], [1420, 997], "envelope"),
  // Partitions.
  { ...wall2("l2-stair-b-south", "Stair B - south partition", [1362, 790], [1497, 790], "partition", undefined, "S202"), partitionUnverified: serviceCoreTags },
  wall2("l2-elec-west", "Electrical 217 - west partition", [1405, 792], [1405, 836], "partition-sa3-10", "SA. 3. 10", "217"),
  { ...wall2("l2-mech-north", "Mechanical 218 - north partition", [1362, 836], [1497, 836], "partition", undefined, "218"), partitionUnverified: serviceCoreTags },
  { ...wall2("l2-mech-south", "Mechanical 218 / janitor 221 partition", [1428, 944], [1497, 944], "partition", undefined, "218"), partitionUnverified: serviceCoreTags },
  { ...wall2("l2-janitor-west", "Janitor / laundry 221 - west partition", [1428, 944], [1428, 996], "partition", undefined, "221"), partitionUnverified: serviceCoreTags },
  wall2("l2-corridor-west", "Corridor - west partition (rooms 217-221, elevator)", [1500, 790], [1500, 1080], "partition", undefined, "200"),
  wall2("l2-game-west", "Game room 213 - corridor partition", [1548, 722], [1548, 985], "partition-sa3-10", "SA. 3. 10", "213"),
  { ...wall2("l2-it-west", "IT 201 - west partition", [1112, 997], [1112, 1097], "partition", undefined, "201"),
    partitionUnverified: "An SA3.21 tag sits inside IT 201 on A1.2 with no leader, midway between its walls, so it can't be tied to this one" },
  wall2("l2-it-toilet", "IT 201 / toilet 203 partition", [1180, 997], [1180, 1097], "partition", undefined, "203"),
  wall2("l2-toilets", "Toilets 203 / 204 partition", [1229, 997], [1229, 1097], "partition", undefined, "204"),
  wall2("l2-toilet-205-wall", "Toilet 204 / 205 partition", [1287, 997], [1287, 1097], "partition", undefined, "205"),
  wall2("l2-closet-wall", "Closet 206A / toilet 205 partition", [1287, 1034], [1350, 1034], "partition", undefined, "206A"),
  wall2("l2-office-west", "Office / reception 206 - west partition", [1350, 997], [1350, 1097], "partition", undefined, "206"),
  wall2("l2-toilets-south", "Toilets - corridor partition", [1112, 1097], [1350, 1097], "partition", undefined, "200"),
  wall2("l2-office-south", "Office / reception 206 - corridor partition", [1350, 1090], [1417, 1090], "partition", undefined, "206"),
  wall2("l2-elevator-west", "Office 206 / elevator 207 partition", [1417, 997], [1417, 1080], "partition-sa3-21", "SA. 3. 21", "206"),
  wall2("l2-elevator-south", "Elevator 207 - south shaft wall", [1417, 1080], [1502, 1080], "partition"),
  wall2("l2-kitchen-north", "Kitchen 208 - north partition", [1277, 1138], [1395, 1138], "partition", undefined, "208"),
  wall2("l2-kitchen-west", "Kitchen 208 - west partition", [1277, 1138], [1277, 1305], "partition-sa6-20", "SA. 6. 20", "208"),
  wall2("l2-kitchen-east", "Kitchen 208 / multipurpose room 1 partition", [1420, 1198], [1460, 1299], "partition-sa6-20", "SA. 6. 20", "210"),
  // Corridor storefronts, operable partitions, guardrail.
  glass2("l2-game-storefront-west", "Game room 213 - storefront at the corridor (west)", [1548, 985], [1548, 1043], "213"),
  glass2("l2-game-storefront", "Game room 213 - angled corridor storefront", [1548, 1043], [1705, 983], "213"),
  glass2("l2-mpr-storefront", "Multipurpose rooms - angled corridor storefront", [1445, 1138], [1662, 1043], "211"),
  operable("l2-operable-activity", "Operable partition - activity 1 / game room", [1552, 805], [1722, 805], 10, "10'-0\" high", "215"),
  operable("l2-operable-mpr", "Operable partition - multipurpose rooms 1 / 2", [1543, 1094], [1600, 1218], 9 + 8 / 12, "9'-8\" high", "210"),
  { id: "l2-guardrail", name: "Guardrail over the lobby", kind: "wall", materialId: "guardrail", points: [point([1072, 1141]), point([1275, 1141])], base: L2, height: 3.5, thickness: 0.15,
    level: "L2", room: "200", source: planL2, geometryStatus: tracedL2, description: "Woven wire mesh guardrail along the Level 02 edge over the lobby (A1.2)." },
];

// ── Level 02 transitions: where A12.3 marks a finish change (an X with the two finishes), typed by
// the A12.1 detail for that pair: RF / PLC is detail B (TS-02), tile / PLC detail D (TS-03), RF / RF
// detail F (TS-07). Door strips span the opening drawn on A1.2. SLE / PLC (concrete to concrete) has
// no strip in A12.1, so none is added there.
const atMark = "Placed where A12.3 marks the finish change; the strip type is A12.1's detail for the two finishes. Door strips sit on the door's traced opening (A1.2).";
const transition2 = (id: string, name: string, materialId: string, a: Point, b: Point, room: string, adjoins: string, between: string): ModelInput => ({
  id, name, kind: "transition", materialId, points: [point(a), point(b)], base: L2, height: 0.05, thickness: 0.17, level: "L2", room, adjoins,
  source: finishPlanL2, geometryStatus: atMark, description: transitionMaterials.find(m => m.id === materialId)!.description,
  properties: [{ label: "Between", value: between }],
});
export const level2Transitions: ModelInput[] = [
  transition2("ts2-activity", "Activity 1 215 / corridor", "transition-resilient-concrete", ...opening("215"), "215", "200", "215 Activity 1 (LVT-01) / 200 Circulation (PLC-01)"),
  transition2("ts2-game", "Game room 213 / corridor", "transition-resilient-concrete", ...opening("213"), "213", "200", "213 Game room band (LVT-02) / 200 Circulation (PLC-01)"),
  transition2("ts2-game-band", "Game room 213 - LVT-01 / LVT-02 finish line", "transition-resilient", [1550, 963], [1723, 963], "213", "213", "213 Game room (LVT-01) / 213 band (LVT-02)"),
  transition2("ts2-mpr-1", "Multipurpose room 1 210 / corridor", "transition-resilient-concrete", ...opening("210"), "210", "200", "210 MPR 1 band (LVT-03) / 200 Circulation (PLC-01)"),
  transition2("ts2-mpr-1-band", "Multipurpose room 1 210 - LVT-03 / LVT-01 finish line", "transition-resilient", [1463.4, 1129.8], [1520.9, 1263.8], "210", "210", "210 MPR 1 band (LVT-03) / 210 MPR 1 (LVT-01)"),
  transition2("ts2-mpr-2", "Multipurpose room 2 211 / corridor", "transition-resilient-concrete", ...opening("211"), "211", "200", "211 MPR 2 (LVT-01) / 200 Circulation (PLC-01)"),
  transition2("ts2-storage", "Storage 209 / multipurpose room 1", "transition-resilient", ...opening("209"), "209", "210", "209 Storage (LVT-01) / 210 MPR 1 band (LVT-03)"),
  transition2("ts2-office", "Office / reception 206 / corridor", "transition-resilient-concrete", ...opening("206"), "206", "200", "206 Office (RF, product not tagged) / 200 Circulation (PLC-01)"),
  transition2("ts2-toilet-203", "Toilet 203 / corridor", "transition-tile", ...opening("203"), "203", "200", "203 Toilet (FT-01) / 200 Circulation (PLC-01)"),
  transition2("ts2-toilet-204", "Toilet 204 / corridor", "transition-tile", ...opening("204"), "204", "200", "204 Toilet (FT-01) / 200 Circulation (PLC-01)"),
  transition2("ts2-toilet-205", "Toilet 205 / corridor", "transition-tile", ...opening("205"), "205", "200", "205 Toilet (FT-01) / 200 Circulation (PLC-01)"),
  transition2("ts2-kitchen", "Kitchen 208 / corridor", "transition-tile", ...opening("208"), "208", "200", "208 Kitchen (QT-01) / 200 Circulation (PLC-01)"),
];

const centroid = (pixels: Point[]): Point => [pixels.reduce((s, p) => s + p[0], 0) / pixels.length, pixels.reduce((s, p) => s + p[1], 0) / pixels.length];
/** Level 02 room labels, at the middle of each traced room. */
export const level2Rooms: { id: string; name: string; number: string; center: Point; level: LevelId }[] =
  level2Floors.filter(f => !f.zone).map(f => ({ id: f.id, name: f.name, number: f.number, center: point(f.label ?? centroid(f.pixels)), level: "L2" as LevelId }));
/** Every room label, both levels. */
export const allRooms = [...rooms, ...level2Rooms];

/** Areas with no floor at a level: the double-height volumes seen from above. Plan feet, like everything else. */
export const planVoids: { id: string; level: LevelId; name: string; points: Point[]; source: SourceRef }[] = [
  { id: "void-gym", level: "L2", name: "Open to gym below", points: ([[460, 725], [970, 725], [970, 1445], [460, 1445]] as Point[]).map(point), source: planL2 },
  { id: "void-yard", level: "L2", name: "Open to mechanical yard below", points: ([[1045, 725], [1362, 725], [1362, 995], [1045, 995]] as Point[]).map(point), source: planL2 },
  { id: "void-lobby", level: "L2", name: "Open to lobby below", points: ([[977, 1180], [1072, 1180], [1072, 1141], [1275, 1141], [1275, 1330], [977, 1330]] as Point[]).map(point), source: planL2 },
];

// ── Doors (A8.2), traced on A1.1 / A1.2 ──────────────────────────────────────
// Each door is one opening (jamb to jamb) with its leaves as drawn. Its rooms come from the traced
// floor zones 1.5 ft either side of the opening: room is the side the leaves swing into, adjoins the
// other. A side with no floor zone (outside, or a room not traced) stays null. Walls aren't cut.

const insidePolygon = ([x, z]: Point, poly: Point[]): boolean => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};
const floorZones = [...elements, ...level2Elements].filter(e => e.kind === "floor");
const zoneAt = (p: Point, level: LevelId) => floorZones.find(z => (z.level ?? "L1") === level && insidePolygon(p, z.points))?.room ?? null;

/** Each traced door's rooms, from the floor zones either side of its opening. */
export const doorAssociations: { number: string; level: LevelId; swingSide: string | null; otherSide: string | null }[] = doorTraces.map(t => {
  const [a, b] = t.opening.map(point), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len], mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const leaf = t.leaves[0]?.map(point);
  const sign = leaf ? Math.sign((leaf[1][0] - leaf[0][0]) * n[0] + (leaf[1][1] - leaf[0][1]) * n[1]) || 1 : 1;
  const side = (k: number): Point => [mid[0] + n[0] * 1.5 * k, mid[1] + n[1] * 1.5 * k];
  return { number: t.number, level: t.level, swingSide: zoneAt(side(sign), t.level), otherSide: zoneAt(side(-sign), t.level) };
});

export const doorInputs: ModelInput[] = doorTraces.map((t, i) => {
  const row = doorScheduleRows.find(r => r.number === t.number)!, sheet = t.level === "L2" ? planL2 : plan;
  const coiling = row.panels === null, floorLevel = t.level === "L2" ? L2 : 0, { swingSide, otherSide } = doorAssociations[i];
  return {
    id: `door-${t.number.toLowerCase()}`, name: `Door ${t.number}`, kind: "door", materialId: doorMaterialFor(row), doorNumber: t.number,
    points: t.opening.map(point), leaves: t.leaves.map(([hinge, tip]) => [point(hinge), point(tip)] as [Point, Point]),
    base: coiling ? floorLevel + 3 : floorLevel, height: coiling ? 4 : row.heightIn! / 12, thickness: (row.thicknessIn ?? 1.75) / 12,
    level: t.level, room: swingSide ?? otherSide ?? undefined, adjoins: (swingSide ? otherSide : null) ?? undefined, source: sheet, traceNote: t.note,
    geometryStatus: `Traced from the door on ${sheet.sheet} (vector linework): the opening runs jamb to jamb, each leaf hinge to open tip. Walls run through the opening; it isn't cut.`,
    description: coiling ? `Door ${row.number}: ${row.comments} (A8.2), steel frame type ${row.frameType}.`
      : `Door ${row.number}: ${row.panels === 2 ? "pair of " : ""}${row.width} x ${row.height} ${row.material} panel${row.panels === 2 ? "s" : ""}, ${row.frameMaterial} frame type ${row.frameType}, hardware set ${row.hardwareSet} on A8.2.`,
  };
});

// ── Sheet coordinates ───────────────────────────────────────────────────────

/**
 * Where plan feet land on each sheet image, in the image's 2400 x 1715 viewBox (the PNGs are
 * 3000 x 2143; scale the viewBox to the image). A1.2 is plotted exactly over A1.1. A12.2 and A12.3
 * are the same 1/8" scale shifted on their sheets, measured by cross-correlating their linework with
 * A1.1 / A1.2 (A12.3: +150.4, +86.4; 0.5% off scale halves the overlap).
 */
export type SheetTransform = { sheet: string; asset: string; origin: Point; feetPerPixel: number; imageWidth: number; imageHeight: number; levels: LevelId[] };
export const sheetTransforms: SheetTransform[] = [
  { sheet: "A1.1", asset: "/models/jelleff/a1-1.png", ...planTransform, levels: ["L1"] },
  { sheet: "A1.2", asset: "/models/jelleff/a1-2.png", ...planTransform, levels: ["L2"] },
  { sheet: "A12.2", asset: "/models/jelleff/a12-2.png", ...planTransform, origin: [planTransform.origin[0] + 97.6, planTransform.origin[1] + 102.4], levels: ["L1"] },
  { sheet: "A12.3", asset: "/models/jelleff/a12-3.png", ...planTransform, origin: [planTransform.origin[0] + 150.4, planTransform.origin[1] + 86.4], levels: ["L2"] },
];
export const sheetTransformFor = (sheet: string): SheetTransform | null => sheetTransforms.find(t => t.sheet === sheet) ?? null;
/** A plan point (feet) on a sheet's viewBox, or null when there is no transform for that sheet. */
export function toSheetPoint(sheet: string, [x, z]: Point): Point | null {
  const t = sheetTransformFor(sheet);
  return t ? [x / t.feetPerPixel + t.origin[0], z / t.feetPerPixel + t.origin[1]] : null;
}

/** Every assembly: the studio's first-floor materials, the transitions, Level 02, then the illustrative system ones. */
export const allMaterials: MaterialInfo[] = [...materials, ...transitionMaterials, ...level2Materials, ...doorMaterials, ...systemMaterials];

/** Every selectable object in the four views, resolved with quantities and sources. */
export const modelObjects: ModelObject[] = resolveObjects([...elements, ...interiorTransitions, ...level2Elements, ...level2Transitions, ...doorInputs, ...systemElements], allMaterials, finishScheduleRows, partitionSchedule, doorSchedule);

/** The model for a project: Jelleff has one; other projects have none yet. */
export const modelForProject = (projectId: string): ModelObject[] => projectId === SAMPLE_PROJECT_ID ? modelObjects : [];

/** Jelleff's starting review: one finish checked, one wall waiting on the envelope details. */
export const sampleModelReview: ModelReviewState = {
  reviews: [
    { objectId: "floor-gym", status: "verified", note: "Matches the FAF-01 tag on A12.2.", by: "Safi", at: "2026-09-29T15:00:00.000Z", history: [{ status: "verified", note: "Matches the FAF-01 tag on A12.2.", by: "Safi", at: "2026-09-29T15:00:00.000Z" }] },
    { objectId: "gym-north", status: "flagged", note: "Exterior wall layers not verified; check the wall sections.", by: "Vijay", at: "2026-09-29T15:10:00.000Z", history: [{ status: "flagged", note: "Exterior wall layers not verified; check the wall sections.", by: "Vijay", at: "2026-09-29T15:10:00.000Z" }] },
  ],
  hidden: { interior: [], mep: [], structural: [], exterior: [] },
};
