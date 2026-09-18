export type Point = [number, number];

export type SourceRef = {
  sheet: string;
  page: number;
  detail: string;
  asset: string;
};

export type MaterialInfo = {
  id: string;
  name: string;
  color: string;
  description: string;
  status: "Documented" | "Illustrative";
  sources: SourceRef[];
};

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

export const planTransform = {
  origin: [460, 725] as Point,
  feetPerPixel: (177 + 4 / 12) / 1270,
  imageWidth: 2400,
  imageHeight: 1715,
};

const plan: SourceRef = {
  sheet: "A1.1", page: 46, detail: "Level 01 - first floor plan", asset: "/models/jelleff/a1-1.png",
};
const partitions: SourceRef = {
  sheet: "A8.1", page: 64, detail: "SA3.20 non-rated stud partition, 4 7/8 in. rough thickness", asset: "/models/jelleff/a8-1.png",
};
const finishSchedule: SourceRef = {
  sheet: "A12.1", page: 79, detail: "Finish schedules and details", asset: "/models/jelleff/a12-1.png",
};
const finishPlan: SourceRef = {
  sheet: "A12.2", page: 80, detail: "Level 01 - finish plan", asset: "/models/jelleff/a12-2.png",
};
export const levelSource: SourceRef = {
  sheet: "A5.1", page: 57, detail: "Building sections: first floor 0 ft, second floor 14 ft, low roof 28 ft", asset: "/models/jelleff/a5-1.png",
};

export const materials: MaterialInfo[] = [
  {
    id: "partition", name: "SA3.20 - gypsum board / metal stud", color: "#e7e1d5", status: "Documented",
    description: "A8.1 lists a non-rated, 4 7/8 in. stud partition with gypsum wall board both sides and sound attenuation where required. A1.1 names SA3.20 as the default interior partition unless noted. Individual segment assignments are simplified; verify local tags before estimating.",
    sources: [partitions, plan],
  },
  {
    id: "envelope", name: "Exterior / existing wall - schematic", color: "#c8c5bc", status: "Illustrative",
    description: "Neutral exterior wall representation. Its layers, finish, and nominal 12 in. model thickness have not been verified from the envelope details.",
    sources: [plan],
  },
  {
    id: "storefront", name: "Aluminum storefront / glazing", color: "#89c9d7", status: "Documented",
    description: "Aluminum storefront is called out on A1.1 at the lobby and fitness area. Glass tint, simplified frames, height, and placement of individual panels are illustrative; no glazing specification is inferred.",
    sources: [plan],
  },
  {
    id: "gym-floor", name: "FAF-01 - poured sports flooring", color: "#b69770", status: "Documented",
    description: "A12.2 tags the gym FAF-01. A12.1 schedules Tarkett Sports Indoor, Polyturf Plus Pad + Pour; Desert base with grey and white striping. Display color and court markings are approximate.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "concrete", name: "PLC-01 - polished concrete", color: "#c5c2b9", status: "Documented",
    description: "The lobby and circulation are tagged PLC-01 on A12.2. A12.1 lists Ardex, Ultraflor Diamatic, low gloss. The slab thickness and display color are illustrative.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "carpet", name: "CPT-01 - carpet", color: "#959d92", status: "Documented",
    description: "Office areas are tagged CPT-01 on A12.2. A12.1 lists Shaw Contract Observe, color Radiant Nature 05326, 9 x 36 in., installed ashlar. Pattern and display color are simplified.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "fitness-floor", name: "RF-01 - resilient sports flooring", color: "#786e55", status: "Documented",
    description: "Fitness 106 is tagged RF-01 on A12.2. A12.1 schedules Mondo Sports Impact, 136 Brown, installed ashlar. Display color and floor thickness are approximate.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "tile", name: "FT-01 - taupe floor tile", color: "#b8b2a0", status: "Documented",
    description: "Wet-area floors are tagged FT-01 on A12.2. A12.1 lists Tilebar Nashville, taupe matte, 12 x 24 in.; shower areas use FT-02. Small shower transitions are omitted from this room-level model.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "entry-grille", name: "WOG-01 - entrance floor grille", color: "#7d8989", status: "Documented",
    description: "Vestibules are tagged WOG-01 on A12.2. A12.1 schedules Construction Specialties Gridline G6 stainless steel entrance grilles. Individual bars are omitted.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "service-floor", name: "SCE-01 - sealed concrete", color: "#a9aca6", status: "Documented",
    description: "Storage 120 and electrical utility 119A are tagged SCE-01 on A12.2. A12.1 lists sealed concrete with a clear, premium-quality, low-VOC sealer. The grouped service zone also includes a simplified stair footprint.",
    sources: [finishPlan, finishSchedule],
  },
  {
    id: "door", name: "Door leaf - schematic", color: "#81876f", status: "Illustrative",
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

export const rooms: { id: string; name: string; number: string; center: Point }[] = [
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
];
