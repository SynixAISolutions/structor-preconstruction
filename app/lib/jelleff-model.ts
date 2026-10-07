// The Jelleff Recreation Center model: the traced first floor the studio has always shown, plus
// illustrative structural, MEP and roof objects for the four views. Types and measuring rules are
// in lib/model.ts.

import { resolveObjects, type FinishScheduleRow, type LevelId, type MaterialInfo, type ModelElement, type ModelInput, type ModelObject, type ModelReviewState, type Point, type SourceRef } from "./model";
import { SAMPLE_PROJECT_ID } from "./project-scope";

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
  drawing: "Jelleff drawing set", sheet: "A8.1", page: 64, detail: "SA3.20 non-rated stud partition, 4 7/8 in. rough thickness", asset: "/models/jelleff/a8-1.png",
};
const finishSchedule: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A12.1", page: 79, detail: "Finish schedules and details", asset: "/models/jelleff/a12-1.png",
};
const finishPlan: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A12.2", page: 80, detail: "Level 01 - finish plan", asset: "/models/jelleff/a12-2.png",
};
export const levelSource: SourceRef = {
  drawing: "Jelleff drawing set", sheet: "A5.1", page: 57, detail: "Building sections: first floor 0 ft, second floor 14 ft, low roof 28 ft", asset: "/models/jelleff/a5-1.png",
};

export const materials: MaterialInfo[] = [
  {
    id: "partition", name: "SA3.20 - gypsum board / metal stud", color: "#e7e1d5", status: "Documented",
    discipline: "architectural", division: "09", specSection: "09 21 16", unit: "SF", views: ["interior"],
    properties: [{ label: "Type", value: "SA3.20" }, { label: "Rating", value: "Non-rated" }, { label: "Rough thickness", value: "4 7/8 in." }, { label: "Construction", value: "Metal studs, gypsum board both sides" }, { label: "Acoustic", value: "Sound attenuation where required" }],
    description: "A8.1 lists a non-rated, 4 7/8 in. stud partition with gypsum wall board both sides and sound attenuation where required. A1.1 names SA3.20 as the default interior partition unless noted. Individual segment assignments are simplified; verify local tags before estimating.",
    sources: [partitions, plan],
  },
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
    description: "The lobby and circulation are tagged PLC-01 on A12.2. A12.1 lists Ardex, Ultraflor Diamatic, low gloss. The slab thickness and display color are illustrative.",
    sources: [finishPlan, finishSchedule],
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
    description: "Wet-area floors are tagged FT-01 on A12.2. A12.1 lists Tilebar Nashville, taupe matte, 12 x 24 in.; shower areas use FT-02. Small shower transitions are omitted from this room-level model.",
    sources: [finishPlan, finishSchedule],
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
    description: "Storage 120 and electrical utility 119A are tagged SCE-01 on A12.2. A12.1 lists sealed concrete with a clear, premium-quality, low-VOC sealer. The grouped service zone also includes a simplified stair footprint.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "door", name: "Door leaf - schematic", color: "#81876f", status: "Illustrative",
    discipline: "architectural", division: "08", specSection: null, unit: "EA", views: ["interior"],
    properties: [{ label: "Leaf", value: "Schematic: material, handing and hardware not checked" }, { label: "Model height", value: "7 ft" }],
    description: "Open leaves locate selected circulation openings. Leaf material, handing, hardware and 7 ft model height are illustrative and have not been checked against the door schedule.",
    sources: [plan],
  },
];

const point = ([x, y]: Point): Point => [
  (x - planTransform.origin[0]) * planTransform.feetPerPixel,
  (y - planTransform.origin[1]) * planTransform.feetPerPixel,
];

// ponytail: this is one hand-traced demo, not a PDF parser; measured use needs validated reconstruction.
const simplified = "Simplified manual trace for visualization; not surveyed geometry, quantities, or construction coordination.";

function wall(id: string, name: string, a: Point, b: Point, materialId = "partition", height = 14, room?: string): ModelElement {
  return {
    id, name, kind: "wall", materialId, points: [point(a), point(b)], height,
    thickness: materialId === "partition" ? 4.875 / 12 : 1,
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

function door(id: string, name: string, a: Point, b: Point, room?: string): ModelElement {
  return {
    id, name, kind: "door", materialId: "door", points: [point(a), point(b)], height: 7, thickness: 0.15,
    room, source: plan, geometryStatus: simplified,
    description: "Selected door represented as an open leaf so the passage remains visible. Opening width, handing, and leaf height are approximate.",
  };
}

function floor(id: string, name: string, materialId: string, points: Point[], room: string): ModelElement {
  return {
    id, name, kind: "floor", materialId, points: points.map(point), height: 0.18, base: -0.18,
    room, source: finishPlan, geometryStatus: simplified,
    description: "Room-level finish zone traced to the A1.1 plan and assigned from A12.2. Edges, minor recesses, finish transitions, and slab thickness are simplified.",
  };
}

export const elements: ModelElement[] = [
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
  wall("office-divider", "Offices 104 / 105 - dividing partition", [1204, 1004], [1204, 1140], "partition"),
  wall("office-east", "Office 104 - east partition", [1310, 1004], [1310, 1140], "partition", 14, "104"),
  wall("office-105-south", "Office 105 - lobby partition", [1067, 1140], [1166, 1140], "partition", 14, "105"),
  wall("office-104-south", "Office 104 - lobby partition", [1245, 1140], [1310, 1140], "partition", 14, "104"),
  wall("stair-a-west", "Stair A - gym-side boundary", [1028, 942], [1028, 1185], "envelope"),
  wall("stair-a-south", "Stair A - lobby return", [970, 1185], [1028, 1185], "envelope"),
  wall("fitness-west", "Fitness - lobby return", [1274, 1215], [1274, 1330], "partition", 14, "106"),
  wall("fitness-entry-return", "Fitness - south entrance return", [1254, 1330], [1254, 1378], "envelope", 14, "106"),
  wall("fitness-office", "Fitness / office 108 partition", [1530, 1100], [1579, 1240], "partition", 14, "106"),
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
  door("main-entry-west-door", "Main entry - open west leaf", [1015, 1445], [1015, 1413], "101"),
  door("main-entry-east-door", "Main entry - open east leaf", [1060, 1445], [1060, 1413], "101"),
  door("lobby-entry-door", "Vestibule to lobby - open leaf", [1015, 1330], [1015, 1298], "102"),
  door("gym-lobby-north-door", "Lobby to gym - north open leaf", [970, 1186], [938, 1186], "103"),
  door("gym-lobby-south-door", "Lobby to gym - south open leaf", [970, 1295], [938, 1295], "103"),
  door("gym-west-exit", "Gym - west open exit leaf", [460, 835], [493, 835], "103"),
  door("office-105-door", "Office 105 - open leaf", [1166, 1140], [1166, 1108], "105"),
  door("office-104-door", "Office 104 - open leaf", [1245, 1140], [1245, 1108], "104"),
  door("fitness-door", "Fitness - open access leaf", [1410, 1157], [1396, 1125], "106"),
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
  row("TB-01", "09 30 00", "Tiling", "Tile base", "Tilebar", "Nashville", "Beige, matte finish", "6\" x TBD", ""),
  row("RF-01", "09 65 00", "Resilient flooring", "Resilient flooring", "Mondo", "Sports Impact", "136 Brown", "7/16\" thk; 91 cm x 91 cm", "Install: ashlar"),
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
];

const atOpening = "Traced at the door opening on A1.1; the strip type follows the two finishes and the A12.1 schedule. Confirm on the finish plan.";
const transition = (id: string, name: string, materialId: string, a: Point, b: Point, room: string, adjoins: string, between: string): ModelInput => ({
  id, name, kind: "transition", materialId, points: [point(a), point(b)], base: 0, height: 0.05, thickness: 0.17, level: "L1", room, adjoins,
  source: plan, geometryStatus: atOpening, description: transitionMaterials.find(m => m.id === materialId)!.description,
  properties: [{ label: "Between", value: between }],
});

export const interiorTransitions: ModelInput[] = [
  transition("ts-gym-lobby-north", "Gym / lobby - north doors", "transition-gym", [970, 1186], [970, 1238], "103", "102", "103 Gym (FAF-01) / 102 Lobby (PLC-01)"),
  transition("ts-gym-lobby-south", "Gym / lobby - south doors", "transition-gym", [970, 1254], [970, 1295], "103", "102", "103 Gym (FAF-01) / 102 Lobby (PLC-01)"),
  transition("ts-office-105", "Office 105 / lobby", "transition-carpet", [1166, 1140], [1204, 1140], "105", "102", "105 Office (CPT-01) / 102 Lobby (PLC-01)"),
  transition("ts-office-104", "Office 104 / lobby", "transition-carpet", [1204, 1140], [1245, 1140], "104", "102", "104 Office (CPT-01) / 102 Lobby (PLC-01)"),
  transition("ts-fitness", "Fitness 106 / circulation", "transition-gym", [1410, 1157], [1442, 1143], "106", "102B", "106 Fitness (RF-01) / 102B Circulation (PLC-01)"),
];

// ── Level 02 (A1.2) ─────────────────────────────────────────────────────────
// Traced from A1.2, which is plotted at the same position and scale as A1.1, so it uses the same
// plan transform. The floor sits 14 ft up (A5.1). The Level 02 finish plan isn't among the app's
// sheets, so its floors carry no finish tag; partition type tags are kept as read on A1.2.

const planL2: SourceRef = { drawing: "Jelleff drawing set", sheet: "A1.2", page: 47, detail: "Level 02 - second floor plan", asset: "/models/jelleff/a1-2.png" };
const L2 = 14;
const tracedL2 = "Simplified manual trace from A1.2 for visualization; not surveyed geometry, quantities, or construction coordination.";

export const level2Materials: MaterialInfo[] = [
  { id: "l2-floor", name: "Level 02 floor zone - finish not scheduled", color: "#d2cec4", status: "Illustrative", sources: [planL2],
    description: "Room-level floor zone traced from A1.2. The Level 02 finish plan isn't among the app's sheets, so no finish is assigned.",
    discipline: "architectural", division: "09", specSection: null, unit: "SF", views: ["interior"],
    properties: [{ label: "Finish", value: "Not scheduled in the sheets available (Level 02 finish plan needed)" }] },
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

const tag = (value?: string) => value ? [{ label: "Partition tag (A1.2)", value }] : [];
const wall2 = (id: string, name: string, a: Point, b: Point, materialId: string, partitionTag?: string, room?: string): ModelInput => ({
  id, name, kind: "wall", materialId, points: [point(a), point(b)], base: L2, height: 14, thickness: materialId === "partition" ? 4.875 / 12 : 1,
  level: "L2", room, source: planL2, geometryStatus: tracedL2, properties: tag(partitionTag),
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
const floor2 = (id: string, name: string, pixels: Point[], room: string): ModelInput => ({
  id, name, kind: "floor", materialId: "l2-floor", points: pixels.map(point), base: L2 - 0.18, height: 0.18, level: "L2", room,
  source: planL2, geometryStatus: tracedL2, description: "Level 02 room zone traced from A1.2. Edges and recesses are simplified.",
});

const circulation2: Point[] = [[1500, 790], [1545, 790], [1548, 1043], [1705, 983], [1705, 1000], [1662, 1043], [1445, 1138], [1405, 1150], [1308, 1140], [1140, 1140], [1140, 1099], [1350, 1099], [1350, 1092], [1417, 1092], [1417, 1082], [1500, 1082]];
/** `label` where a room's middle falls outside it (the L-shaped corridor). */
const level2Floors: { id: string; name: string; number: string; pixels: Point[]; label?: Point }[] = [
  { id: "l2-circulation", name: "Circulation", number: "200", pixels: circulation2, label: [1420, 1118] },
  { id: "l2-it", name: "IT", number: "201", pixels: [[1144, 1003], [1178, 1003], [1178, 1095], [1144, 1095]] },
  { id: "l2-toilet-203", name: "Toilet", number: "203", pixels: [[1182, 1003], [1227, 1003], [1227, 1095], [1182, 1095]] },
  { id: "l2-toilet-204", name: "Toilet", number: "204", pixels: [[1231, 1003], [1285, 1003], [1285, 1095], [1231, 1095]] },
  { id: "l2-toilet-205", name: "Toilet", number: "205", pixels: [[1289, 1036], [1348, 1036], [1348, 1095], [1289, 1095]] },
  { id: "l2-closet", name: "Closet", number: "209A", pixels: [[1289, 1003], [1348, 1003], [1348, 1032], [1289, 1032]] },
  { id: "l2-office", name: "Office / reception", number: "206", pixels: [[1352, 1003], [1415, 1003], [1415, 1088], [1352, 1088]] },
  { id: "l2-kitchen", name: "Kitchen", number: "208", pixels: [[1310, 1142], [1378, 1142], [1378, 1196], [1398, 1196], [1452, 1302], [1310, 1302]] },
  { id: "l2-storage", name: "Storage", number: "209", pixels: [[1381, 1142], [1404, 1150], [1398, 1192], [1381, 1192]] },
  { id: "l2-mpr-1", name: "Multipurpose room 1", number: "210", pixels: [[1405, 1150], [1445, 1138], [1543, 1094], [1600, 1218], [1455, 1300], [1400, 1196]] },
  { id: "l2-mpr-2", name: "Multipurpose room 2", number: "211", pixels: [[1543, 1094], [1662, 1043], [1705, 1000], [1768, 1166], [1600, 1218]] },
  { id: "l2-game", name: "Game room", number: "213", pixels: [[1550, 807], [1723, 807], [1723, 970], [1705, 983], [1550, 1041]] },
  { id: "l2-activity", name: "Activity 1", number: "215", pixels: [[1550, 723], [1723, 723], [1723, 803], [1550, 803]] },
  { id: "l2-stair-b", name: "Stair B", number: "S202", pixels: [[1364, 723], [1497, 723], [1497, 788], [1364, 788]] },
  { id: "l2-elec", name: "Electrical", number: "217", pixels: [[1407, 792], [1497, 792], [1497, 834], [1407, 834]] },
  { id: "l2-mech", name: "Mechanical", number: "218", pixels: [[1364, 838], [1497, 838], [1497, 942], [1364, 942]] },
  { id: "l2-janitor", name: "Janitor / laundry", number: "221", pixels: [[1430, 946], [1497, 946], [1497, 994], [1430, 994]] },
];

export const level2Elements: ModelInput[] = [
  ...level2Floors.map(f => floor2(f.id, `${f.name} ${f.number} - Level 02 floor`, f.pixels, f.number)),
  // Envelope around the Level 02 wing (schematic, like Level 01's).
  wall2("l2-north", "Level 02 - north wall", [1362, 720], [1725, 720], "envelope"),
  wall2("l2-east", "Level 02 - east wall, activity and game rooms", [1725, 720], [1725, 975], "envelope"),
  wall2("l2-mpr-east", "Level 02 - multipurpose room 2 east wall", [1708, 995], [1770, 1168], "envelope", undefined, "211"),
  wall2("l2-south", "Level 02 - angled south wall, multipurpose rooms", [1770, 1168], [1455, 1302], "envelope"),
  wall2("l2-kitchen-south", "Level 02 - kitchen south wall", [1455, 1302], [1308, 1305], "envelope", undefined, "208"),
  wall2("l2-yard-east", "Level 02 - wall along the mechanical yard (east)", [1362, 720], [1362, 995], "envelope"),
  wall2("l2-yard-south", "Level 02 - wall along the mechanical yard (south)", [1140, 997], [1420, 997], "envelope"),
  // Partitions.
  wall2("l2-stair-b-south", "Stair B - south partition", [1362, 790], [1497, 790], "partition", "SA.3.10", "S202"),
  wall2("l2-elec-west", "Electrical 217 - west partition", [1405, 792], [1405, 836], "partition", "SA.3.10", "217"),
  wall2("l2-mech-north", "Mechanical 218 - north partition", [1362, 836], [1497, 836], "partition", "SA.3.10", "218"),
  wall2("l2-mech-south", "Mechanical 218 - south partition", [1362, 944], [1497, 944], "partition", "SA.3.10", "218"),
  wall2("l2-janitor-west", "Janitor / laundry 221 - west partition", [1428, 944], [1428, 996], "partition", "SA.3.10", "221"),
  wall2("l2-corridor-west", "Corridor - west partition (rooms 217-221, elevator)", [1500, 790], [1500, 1080], "partition", undefined, "200"),
  wall2("l2-game-west", "Game room 213 - corridor partition", [1548, 722], [1548, 985], "partition", "SA.3.10", "213"),
  wall2("l2-it-west", "IT 201 - west partition", [1142, 997], [1142, 1097], "partition", "SA.3.21", "201"),
  wall2("l2-it-toilet", "IT 201 / toilet 203 partition", [1180, 997], [1180, 1097], "partition", undefined, "203"),
  wall2("l2-toilets", "Toilets 203 / 204 partition", [1229, 997], [1229, 1097], "partition", undefined, "204"),
  wall2("l2-toilet-205-wall", "Toilet 204 / 205 partition", [1287, 997], [1287, 1097], "partition", undefined, "205"),
  wall2("l2-closet-wall", "Closet 209A / toilet 205 partition", [1287, 1034], [1350, 1034], "partition", undefined, "209A"),
  wall2("l2-office-west", "Office / reception 206 - west partition", [1350, 997], [1350, 1097], "partition", "SA.3.21", "206"),
  wall2("l2-toilets-south", "Toilets - corridor partition", [1142, 1097], [1350, 1097], "partition", undefined, "200"),
  wall2("l2-office-south", "Office / reception 206 - corridor partition", [1350, 1090], [1417, 1090], "partition", "SA.3.21", "206"),
  wall2("l2-elevator-west", "Elevator 207 - west shaft wall", [1417, 997], [1417, 1080], "partition", "SA.1.21"),
  wall2("l2-elevator-south", "Elevator 207 - south shaft wall", [1417, 1080], [1502, 1080], "partition", "SA.1.21"),
  wall2("l2-kitchen-north", "Kitchen 208 - north partition", [1308, 1138], [1395, 1138], "partition", undefined, "208"),
  wall2("l2-kitchen-west", "Kitchen 208 - west partition", [1308, 1138], [1308, 1305], "partition", "SA.6.20", "208"),
  wall2("l2-kitchen-east", "Kitchen 208 / multipurpose room 1 partition", [1398, 1195], [1455, 1305], "partition", "SA.6.20", "210"),
  // Corridor storefronts, operable partitions, guardrail.
  glass2("l2-game-storefront-west", "Game room 213 - storefront at the corridor (west)", [1548, 985], [1548, 1043], "213"),
  glass2("l2-game-storefront", "Game room 213 - angled corridor storefront", [1548, 1043], [1705, 983], "213"),
  glass2("l2-mpr-storefront", "Multipurpose rooms - angled corridor storefront", [1445, 1138], [1662, 1043], "211"),
  operable("l2-operable-activity", "Operable partition - activity 1 / game room", [1552, 805], [1722, 805], 10, "10'-0\" high", "215"),
  operable("l2-operable-mpr", "Operable partition - multipurpose rooms 1 / 2", [1543, 1094], [1600, 1218], 9 + 8 / 12, "9'-8\" high", "210"),
  { id: "l2-guardrail", name: "Guardrail over the lobby", kind: "wall", materialId: "guardrail", points: [point([1030, 1180]), point([1300, 1180])], base: L2, height: 3.5, thickness: 0.15,
    level: "L2", room: "200", source: planL2, geometryStatus: tracedL2, description: "Woven wire mesh guardrail along the Level 02 edge over the lobby (A1.2)." },
];

const centroid = (pixels: Point[]): Point => [pixels.reduce((s, p) => s + p[0], 0) / pixels.length, pixels.reduce((s, p) => s + p[1], 0) / pixels.length];
/** Level 02 room labels, at the middle of each traced room. */
export const level2Rooms: { id: string; name: string; number: string; center: Point; level: LevelId }[] =
  level2Floors.map(f => ({ id: f.id, name: f.name, number: f.number, center: point(f.label ?? centroid(f.pixels)), level: "L2" as LevelId }));
/** Every room label, both levels. */
export const allRooms = [...rooms, ...level2Rooms];

/** Areas with no floor at a level: the double-height volumes seen from above. Plan feet, like everything else. */
export const planVoids: { id: string; level: LevelId; name: string; points: Point[]; source: SourceRef }[] = [
  { id: "void-gym", level: "L2", name: "Open to gym below", points: ([[460, 725], [970, 725], [970, 1445], [460, 1445]] as Point[]).map(point), source: planL2 },
  { id: "void-yard", level: "L2", name: "Open to mechanical yard below", points: ([[1045, 725], [1362, 725], [1362, 995], [1045, 995]] as Point[]).map(point), source: planL2 },
  { id: "void-lobby", level: "L2", name: "Open to lobby below", points: ([[977, 1180], [1300, 1180], [1300, 1330], [977, 1330]] as Point[]).map(point), source: planL2 },
];

// ── Sheet coordinates ───────────────────────────────────────────────────────

/**
 * Where plan feet land on each sheet image, in the image's 2400 x 1715 viewBox (the PNGs are
 * 3000 x 2143; scale the viewBox to the image). A1.2 is plotted exactly over A1.1; A12.2 is the same
 * 1/8" scale shifted on its sheet (measured by matching the gym and east-wing linework).
 */
export type SheetTransform = { sheet: string; asset: string; origin: Point; feetPerPixel: number; imageWidth: number; imageHeight: number; levels: LevelId[] };
export const sheetTransforms: SheetTransform[] = [
  { sheet: "A1.1", asset: "/models/jelleff/a1-1.png", ...planTransform, levels: ["L1"] },
  { sheet: "A1.2", asset: "/models/jelleff/a1-2.png", ...planTransform, levels: ["L2"] },
  { sheet: "A12.2", asset: "/models/jelleff/a12-2.png", ...planTransform, origin: [planTransform.origin[0] + 97.6, planTransform.origin[1] + 102.4], levels: ["L1"] },
];
export const sheetTransformFor = (sheet: string): SheetTransform | null => sheetTransforms.find(t => t.sheet === sheet) ?? null;
/** A plan point (feet) on a sheet's viewBox, or null when there is no transform for that sheet. */
export function toSheetPoint(sheet: string, [x, z]: Point): Point | null {
  const t = sheetTransformFor(sheet);
  return t ? [x / t.feetPerPixel + t.origin[0], z / t.feetPerPixel + t.origin[1]] : null;
}

/** Every assembly: the studio's first-floor materials, the transitions, Level 02, then the illustrative system ones. */
export const allMaterials: MaterialInfo[] = [...materials, ...transitionMaterials, ...level2Materials, ...systemMaterials];

/** Every selectable object in the four views, resolved with quantities and sources. */
export const modelObjects: ModelObject[] = resolveObjects([...elements, ...interiorTransitions, ...level2Elements, ...systemElements], allMaterials, finishScheduleRows);

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
