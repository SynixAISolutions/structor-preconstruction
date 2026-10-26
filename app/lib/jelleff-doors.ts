// Jelleff doors: the A8.2 door and frame schedule, the doors traced on A1.1 / A1.2, and their
// assemblies. Types and checks are in lib/model.ts; hardware sets are in data/jelleff-hardware.ts.
//
// Traces are measured from the PDF's vector linework, in each plan sheet's 2400 x 1715 viewBox
// (A1.1 for Level 01, A1.2 for Level 02). Most come from the drawn door swings: the arc's centre is
// the hinge, the arc end with the drawn leaf is the open tip, the other end is the strike. A pair's
// opening runs hinge to hinge. Five doors are read from the linework by hand and say so in `note`.

import type { DoorSchedule, DoorScheduleRow, MaterialInfo, Point, SourceRef } from "./model";
import { hardwareSets } from "./data/jelleff-hardware";

export const doorScheduleSource: SourceRef = {
  drawing: "Project 1 drawing set", sheet: "A8.2", page: 65, detail: "Door and frame schedule, door panel and frame types", asset: "/models/jelleff/a8-2.png",
};
const manualSection = (section: string, title: string, page: number): SourceRef => ({ drawing: "Project 1 manual", sheet: section, page, detail: title, asset: "" });

/** How far a traced opening or leaf may differ from the schedule before it's flagged (3 in.). */
export const DOOR_WIDTH_TOLERANCE_FT = 0.25;

/** A8.2's door panel type legend. "ELEV" (the two gates) isn't on it. */
export const doorPanelTypes: Record<string, string> = {
  DG: "Dual lite glass", F: "Flush panel", FG: "Full lite glass", FL: "Full louvered", G: "Half lite glass", GL: "Half lite glass & louvered", L: "Louvered (bottom)",
  LL: "Louvered (top & bottom)", N: "Narrow lite glass", NL: "Narrow lite glass & louvered", TL: "Louvered (top)", V: "Vision lite glass (10\" square)", VL: "Vision lite glass & louvered",
};

/** "3' - 0\"", "8' - 0 3/8\"", "1 3/4\"" → inches; "" → null. */
const inches = (v: string): number | null => {
  const m = v.match(/^(?:(\d+)' - )?(\d+)(?: (\d+)\/(\d+))?"$/);
  return m ? (m[1] ? +m[1] * 12 : 0) + +m[2] + (m[3] ? +m[3] / +m[4] : 0) : null;
};
/** One A8.2 row: number, panels, width, height, material, panel type, frame material, frame type, hardware set, head, jamb left, jamb right, sill. */
const row = (number: string, panels: number | null, width: string, height: string, material: string, panelType: string, frameMaterial: string, frameType: string,
  hardwareSet: string, head: string, jambLeft: string, jambRight: string, sill: string, extra: { fireRating?: string; comments?: string; thickness?: string } = {}): DoorScheduleRow => {
  const thickness = extra.thickness ?? "1 3/4\"";
  return {
    number, panels, width, height, thickness, widthIn: inches(width), heightIn: inches(height), thicknessIn: inches(thickness), material, glass: "", panelType,
    panelTypeName: panelType ? doorPanelTypes[panelType] ?? "Not in the A8.2 panel type legend" : "",
    frameMaterial, frameType, fireRating: extra.fireRating ?? "", hardwareSet, details: { head, jambLeft, jambRight, sill }, comments: extra.comments ?? "", source: doorScheduleSource,
  };
};
const W3 = "3' - 0\"", H7 = "7' - 0\"", H8 = "8' - 0\"";
const IN: [string, string, string] = ["11/A9.10", "12/A9.10", "12/A9.10"];

/** A8.2, every row as printed. P101 also appears, identically, in the pool equipment building schedule. */
export const doorScheduleRows: DoorScheduleRow[] = [
  row("101A", 2, W3, "9' - 10 3/4\"", "ALUM", "FG", "ALUM", "DETAIL", "101", "13/A9.1", "7/A9.10", "7/A9.10", "3/A9.10"),
  row("101B", 2, W3, "8' - 0 3/8\"", "ALUM", "FG", "ALUM", "DETAIL", "200", "13/A9.1", "7/A9.10", "7/A9.10 SIM", "2/A9.10"),
  row("103A", 2, W3, H7, "HM", "N", "HM", "1", "400", ...IN, "A12.2"),
  row("103B", 2, W3, H7, "HM", "N", "HM", "1", "400", ...IN, "A12.2"),
  row("103C", 2, W3, H8, "HM", "F", "HM", "5", "180", "3/A9.2", "3/A9.3", "3/A9.3", "A12.2"),
  row("103D", 2, W3, H8, "HM", "F", "HM", "5", "180", "3/A9.2", "3/A9.3", "3/A9.3", "A12.2"),
  row("104", 1, W3, H7, "WD", "N", "ALUM", "1", "700", "7/A9.10", "4/A9.10 SIM", "7/A9.10", "A12.2"),
  row("105", 1, W3, H7, "WD", "N", "ALUM", "1", "700", "7/A9.10", "7/A9.10", "4/A9.10 SIM", "A12.2"),
  row("106", 2, W3, H7, "WD", "FG", "ALUM", "1", "800", "7/A9.10", "4/A9.10", "4/A9.10", "A12.2"),
  row("107", 1, W3, H7, "WD", "F", "HM", "1", "600", ...IN, "A12.2"),
  row("108", 1, W3, H7, "WD", "F", "HM", "1", "700", ...IN, "A12.2"),
  row("109", 1, W3, H7, "WD", "F", "HM", "1", "920", ...IN, "A12.2"),
  row("110A", 1, W3, H7, "WD", "N", "HM", "1", "720", ...IN, "A12.2"),
  row("110B", 1, W3, H8, "WD", "N", "ALUM", "1", "300", "8/A9.10", "7/A9.10", "7/A9.10 SIM", "13/A9.1"),
  row("111A", 1, W3, "8' - 9 1/2\"", "WD", "N", "ALUM", "1", "480", "7/A9.10", "7/A9.10", "4/A9.10 SIM", "2/A9.10"),
  row("111B", 1, W3, H8, "ALUM", "N", "ALUM", "1", "110", "7/A9.10", "3/A9.3 SIM", "7/A9.10", "3/A9.10"),
  row("112", 1, W3, H7, "WD", "F", "HM", "1", "820", ...IN, "A12.2"),
  row("113", 1, W3, H7, "WD", "F", "HM", "1", "920", ...IN, "A12.2"),
  row("115", 1, "2' - 6\"", H7, "WD", "F", "HM", "1", "860", ...IN, "A12.2"),
  row("116A", 1, W3, H7, "WD", "F", "HM", "1", "910", ...IN, "A12.2"),
  row("116B", 1, W3, H7, "WD", "F", "HM", "1", "900", ...IN, "-"),
  row("116C", 1, W3, H7, "HM", "F", "HM", "2", "320", "2/A9.2", "3/A9.3", "3/A9.3", "A12.2"),
  row("117A", 1, W3, H7, "WD", "F", "HM", "1", "900", ...IN, "A12.2"),
  row("117B", 1, W3, H7, "WD", "F", "HM", "1", "900", ...IN, "-"),
  row("117C", 1, W3, H7, "HM", "F", "HM", "2", "320", "2/A9.2", "3/A9.3", "3/A9.3", "A12.2"),
  row("118A", 1, W3, H7, "HM", "F", "HM", "2", "360", "2/A9.2", "3/A9.3", "3/A9.3", "A12.2"),
  row("118B", 2, W3, H8, "HM", "F", "HM", "5", "360", "1/A9.2", "1/A9.2 SIM", "1/A9.2 SIM", "A12.2"),
  row("119A", 1, W3, H7, "HM", "F", "HM", "1", "800", ...IN, "A12.2"),
  row("120", 2, W3, H7, "HM", "F", "HM", "1", "650", ...IN, "A12.2"),
  row("202", 1, W3, H7, "WD", "F", "HM", "1", "220", ...IN, "A12.2"),
  row("203", 1, W3, H7, "WD", "F", "HM", "1", "920", ...IN, "A12.2"),
  row("204", 1, W3, H7, "WD", "F", "HM", "1", "920", ...IN, "A12.2"),
  row("205", 1, W3, H7, "WD", "F", "HM", "1", "920", ...IN, "A12.2"),
  row("206", 1, W3, H7, "ALUM", "N", "ALUM", "1", "700", "6/A9.10", "4/A9.10 SIM", "7/A9.10", "A12.2"),
  row("206A", 1, W3, H7, "WD", "F", "HM", "1", "600", ...IN, "-"),
  row("208", 1, W3, H7, "WD", "F", "HM", "1", "520", ...IN, "A12.2"),
  row("209", 1, W3, H7, "WD", "F", "HM", "1", "600", ...IN, "-"),
  row("209A", null, "", "", "STL", "", "STL", "6", "890", "-", "20/A9.10", "20/A9.10", "16/A9.10", { thickness: "", comments: "4'0\" high by 8'-0\" wide coiling counter door" }),
  row("210", 1, W3, H7, "WD", "FG", "ALUM", "1", "420", "7/A9.10", "4/A9.10 SIM", "7/A9.10", "A12.2"),
  row("211", 1, W3, H7, "WD", "FG", "ALUM", "1", "420", "7/A9.10", "4/A9.10 SIM", "7/A9.10", "A12.2"),
  row("213", 1, W3, H7, "WD", "FG", "ALUM", "1", "425", "7/A9.10", "4/A9.10 SIM", "7/A9.10", "A12.2"),
  row("215", 1, W3, H7, "WD", "FG", "ALUM", "1", "420", "7/A9.10", "4/A9.10 SIM", "7/A9.10", "A12.2"),
  row("217", 1, W3, H7, "HM", "F", "HM", "1", "810", ...IN, "-"),
  row("219", 2, W3, H7, "HM", "F", "HM", "1", "800", ...IN, "A12.2", { fireRating: "45 MIN" }),
  row("221", 1, W3, H7, "WD", "F", "HM", "1", "850", ...IN, "A12.2"),
  row("G101", 1, W3, H7, "STL", "ELEV", "STL", "1", "380", "RE: DETAIL", "RE: DETAIL", "RE: DETAIL", "-", { comments: "Outdoor gate re: landscape dwgs" }),
  row("G102", 1, W3, H7, "STL", "ELEV", "STL", "1", "380", "RE: DETAIL", "RE: DETAIL", "RE: DETAIL", "-", { comments: "Outdoor gate re: landscape dwgs" }),
  row("P101", 1, "4' - 0\"", H7, "HM", "F", "HM", "2", "340", "2/A9.2 SIM", "3/A9.3 SIM", "3/A9.3 SIM", "-"),
  row("S102", 1, W3, H8, "HM", "F", "HM", "1", "190", "3/A9.2", "3/A9.3 SIM", "3/A9.3 SIM", "A12.2"),
  row("S202", 1, W3, H7, "HM", "N", "HM", "1", "450", "11/A9.10 SIM", "12/A9.10 SIM", "12/A9.10 SIM", "A12.2"),
];

export const doorSchedule: DoorSchedule = { rows: doorScheduleRows, hardwareSets, widthToleranceFt: DOOR_WIDTH_TOLERANCE_FT };

/** On the schedule but not traced, and why. */
export const scheduleOnlyDoors: { number: string; reason: string }[] = [
  { number: "G101", reason: "Outdoor gate; A8.2 refers it to the landscape drawings." },
  { number: "G102", reason: "Outdoor gate; A8.2 refers it to the landscape drawings." },
  { number: "P101", reason: "Pool equipment building door, outside the main building." },
  { number: "S102", reason: "Stair B exit, kept on the schedule only." },
];

/** A traced door, in its plan sheet's viewBox. opening is jamb to jamb (a single leaf's starts at its hinge); leaves are hinge to open tip. */
export type DoorTrace = { number: string; level: "L1" | "L2"; opening: [Point, Point]; leaves: [Point, Point][]; note?: string };
export const doorTraces: DoorTrace[] = [
  { number: "101A", level: "L1", opening: [[1017.5, 1446.9], [1060.4, 1446.9]], leaves: [[[1017.5, 1446.9], [1017.5, 1468.4]], [[1060.4, 1446.9], [1060.4, 1468.4]]] },
  { number: "101B", level: "L1", opening: [[1017.5, 1330.8], [1060.4, 1330.8]], leaves: [[[1017.5, 1330.8], [1017.5, 1352.3]], [[1060.4, 1330.8], [1060.4, 1352.3]]] },
  { number: "103A", level: "L1", opening: [[973.7, 1197.2], [973.7, 1239.9]], leaves: [[[973.7, 1197.2], [995.0, 1197.1]], [[973.7, 1239.9], [995.0, 1240.0]]] },
  { number: "103B", level: "L1", opening: [[973.7, 1251.4], [973.7, 1294.0]], leaves: [[[973.7, 1251.4], [995.0, 1251.2]], [[973.7, 1294.0], [995.0, 1294.1]]] },
  { number: "103C", level: "L1", opening: [[460.8, 1379.4], [460.8, 1335.1]], leaves: [[[460.8, 1379.4], [439.2, 1379.2]], [[460.8, 1335.1], [439.2, 1335.2]]] },
  { number: "103D", level: "L1", opening: [[462.2, 788.6], [462.0, 832.8]], leaves: [[[462.2, 788.6], [440.6, 788.8]], [[462.0, 832.8], [440.6, 832.9]]] },
  { number: "104", level: "L1", opening: [[1213.7, 1137.8], [1235.0, 1137.5]], leaves: [[[1213.7, 1137.8], [1213.6, 1116.5]]] },
  { number: "105", level: "L1", opening: [[1197.2, 1137.8], [1175.9, 1137.5]], leaves: [[[1197.2, 1137.8], [1197.3, 1116.5]]] },
  { number: "106", level: "L1", opening: [[1303.9, 1200.5], [1343.6, 1183.4]], leaves: [[[1303.9, 1200.5], [1312.5, 1220.3]], [[1343.6, 1183.4], [1351.9, 1203.4]]] },
  { number: "107", level: "L1", opening: [[1526.1, 1119.0], [1534.1, 1139.0]], leaves: [[[1526.1, 1119.0], [1506.3, 1127.5]]] },
  { number: "108", level: "L1", opening: [[1562.3, 1090.6], [1581.9, 1082.4]], leaves: [[[1562.3, 1090.6], [1570.5, 1110.2]]] },
  { number: "109", level: "L1", opening: [[1658.2, 1049.3], [1638.7, 1058.2]], leaves: [[[1658.2, 1049.3], [1666.7, 1069.0]]] },
  { number: "110A", level: "L1", opening: [[1665.2, 1046.3], [1685.1, 1038.3]], leaves: [[[1665.2, 1046.3], [1673.7, 1066.1]]] },
  { number: "110B", level: "L1", opening: [[1725.1, 1065.6], [1733.8, 1085.1]], leaves: [[[1725.1, 1065.6], [1744.8, 1057.1]]] },
  { number: "111A", level: "L1", opening: [[1608.4, 1065.5], [1628.1, 1057.2]], leaves: [[[1608.4, 1065.5], [1600.3, 1045.8]]] },
  { number: "111B", level: "L1", opening: [[1696.9, 1025.7], [1688.9, 1005.8]], leaves: [[[1696.9, 1025.7], [1716.7, 1017.2]]] },
  { number: "112", level: "L1", opening: [[1561.3, 1041.9], [1581.0, 1033.5]], leaves: [[[1561.3, 1041.9], [1581.2, 1049.9]]], note: "Leaf drawn 45 degrees open on A1.1; read from the linework (a soffit line crosses the swing)." },
  { number: "113", level: "L1", opening: [[1515.7, 1057.9], [1535.2, 1049.2]], leaves: [[[1515.7, 1057.9], [1507.2, 1038.3]]] },
  { number: "115", level: "L1", opening: [[1417.7, 948.1], [1417.7, 930.0]], leaves: [[[1417.7, 948.1], [1405.1, 935.4]]], note: "Leaf drawn 45 degrees open on A1.1; read from the linework." },
  { number: "116A", level: "L1", opening: [[1421.0, 880.5], [1421.2, 901.8]], leaves: [[[1421.0, 880.5], [1442.3, 880.5]]] },
  { number: "116B", level: "L1", opening: [[1476.1, 880.5], [1476.4, 901.8]], leaves: [[[1476.1, 880.5], [1497.4, 880.5]]] },
  { number: "116C", level: "L1", opening: [[1677.8, 880.3], [1678.2, 901.8]], leaves: [[[1677.8, 880.3], [1699.2, 880.5]]] },
  { number: "117A", level: "L1", opening: [[1377.3, 870.3], [1398.8, 869.9]], leaves: [[[1377.3, 870.3], [1377.3, 848.9]]] },
  { number: "117B", level: "L1", opening: [[1452.4, 868.6], [1452.9, 847.1]], leaves: [[[1452.4, 868.6], [1473.9, 868.6]]] },
  { number: "117C", level: "L1", opening: [[1677.8, 868.6], [1678.2, 847.1]], leaves: [[[1677.8, 868.6], [1699.2, 868.6]]] },
  { number: "118A", level: "L1", opening: [[1320.1, 993.7], [1341.4, 993.4]], leaves: [[[1320.1, 993.7], [1320.0, 972.4]]] },
  { number: "118B", level: "L1", opening: [[1141.1, 718.5], [1097.3, 718.5]], leaves: [[[1141.1, 718.5], [1141.2, 697.2]], [[1097.3, 718.5], [1097.1, 697.2]]] },
  { number: "119A", level: "L1", opening: [[1420.8, 835.6], [1442.1, 835.4]], leaves: [[[1420.8, 835.6], [1399.6, 839.4]]], note: "Leaf drawn folded back against the wall on A1.1, with a 180 degree swing arc; read from the linework." },
  { number: "120", level: "L1", opening: [[968.6, 762.1], [968.6, 804.7]], leaves: [[[968.6, 762.1], [947.3, 762.0]], [[968.6, 804.7], [947.3, 804.9]]] },
  { number: "202", level: "L2", opening: [[1116.2, 1094.0], [1137.6, 1093.6]], leaves: [[[1116.2, 1094.0], [1116.2, 1072.6]]] },
  { number: "203", level: "L2", opening: [[1184.4, 1094.0], [1205.9, 1093.6]], leaves: [[[1184.4, 1094.0], [1184.5, 1072.6]]] },
  { number: "204", level: "L2", opening: [[1285.6, 1094.0], [1264.1, 1093.6]], leaves: [[[1285.6, 1094.0], [1285.5, 1072.6]]] },
  { number: "205", level: "L2", opening: [[1342.7, 1094.0], [1321.2, 1093.6]], leaves: [[[1342.7, 1094.0], [1342.7, 1072.6]]] },
  { number: "206", level: "L2", opening: [[1352.1, 1094.6], [1373.5, 1094.3]], leaves: [[[1352.1, 1094.6], [1352.1, 1073.1]]] },
  { number: "206A", level: "L2", opening: [[1344.8, 1001.7], [1344.4, 1023.1]], leaves: [[[1344.8, 1001.7], [1323.3, 1001.7]]] },
  { number: "208", level: "L2", opening: [[1294.8, 1138.8], [1316.3, 1139.2]], leaves: [[[1294.8, 1138.8], [1294.9, 1160.3]]] },
  { number: "209", level: "L2", opening: [[1417.3, 1199.1], [1408.6, 1179.5]], leaves: [[[1417.3, 1199.1], [1397.6, 1207.5]]] },
  { number: "209A", level: "L2", opening: [[1433.1, 1224.7], [1455.6, 1277.1]], leaves: [], note: "Coiling counter door: no leaves. The opening is the counter between the wall end and the pier on A1.2; shown 4 ft high over a 3 ft counter (A8.2 comments and frame type 6)." },
  { number: "210", level: "L2", opening: [[1416.0, 1151.3], [1435.5, 1142.4]], leaves: [[[1416.0, 1151.3], [1407.5, 1131.5]]] },
  { number: "211", level: "L2", opening: [[1682.9, 1036.9], [1663.2, 1045.0]], leaves: [[[1682.9, 1036.9], [1674.7, 1017.2]]] },
  { number: "213", level: "L2", opening: [[1546.3, 966.0], [1545.9, 987.2]], leaves: [[[1546.3, 966.0], [1538.8, 945.7]]], note: "180 degree swing (hardware set #425, 180 DEG). No open leaf is drawn, so the tip is the end of the swing arc on A1.2." },
  { number: "215", level: "L2", opening: [[1546.3, 746.4], [1545.9, 767.9]], leaves: [[[1546.3, 746.4], [1524.9, 746.5]]] },
  { number: "217", level: "L2", opening: [[1439.9, 837.7], [1461.2, 837.4]], leaves: [[[1439.9, 837.7], [1439.8, 816.4]]] },
  { number: "219", level: "L2", opening: [[1496.6, 886.2], [1496.6, 843.3]], leaves: [[[1496.6, 886.2], [1475.1, 886.2]], [[1496.6, 843.3], [1475.1, 843.3]]] },
  { number: "221", level: "L2", opening: [[1496.0, 999.8], [1495.6, 978.4]], leaves: [[[1496.0, 999.8], [1474.6, 999.8]]] },
  { number: "S202", level: "L2", opening: [[1491.8, 783.4], [1491.5, 761.9]], leaves: [[[1491.8, 783.4], [1470.4, 783.3]]] },
];

/** One assembly per panel material, each with the project manual's section for it. */
const doorAssembly = (id: string, name: string, color: string, specSection: string, section: SourceRef, description: string): MaterialInfo => ({
  id, name, color, status: "Documented", discipline: "architectural", division: "08", specSection, unit: "EA", views: ["interior"], properties: [],
  description, sources: [doorScheduleSource, section],
});
export const doorMaterials: MaterialInfo[] = [
  doorAssembly("door-hm", "Hollow metal door", "#7d8a8f", "08 11 13", manualSection("08 11 13", "Hollow metal doors and frames", 336),
    "A8.2 lists the panel as HM. The project manual's section 08 11 13 covers hollow metal doors and frames. Counted per opening; a pair is one opening with two leaves."),
  doorAssembly("door-wd", "Flush wood door", "#a5825c", "08 14 16", manualSection("08 14 16", "Flush wood doors", 345),
    "A8.2 lists the panel as WD. The project manual's section 08 14 16 covers flush wood doors; frames are as scheduled. Counted per opening."),
  doorAssembly("door-alum", "Aluminum entrance door", "#9aa7ad", "08 41 13", manualSection("08 41 13", "Aluminum-framed entrances and storefronts", 361),
    "A8.2 lists the panel as ALUM. The project manual's section 08 41 13 covers aluminum-framed entrances. Counted per opening."),
  doorAssembly("door-coiling", "Coiling counter door", "#8c8f8a", "08 33 13", manualSection("08 33 13", "Coiling counter doors", 354),
    "A8.2 lists 209A as a steel coiling counter door, 4 ft high by 8 ft wide (comments column). The project manual's section 08 33 13 covers coiling counter doors."),
];
/** The assembly for a schedule row: by panel material, and 209A as the coiling counter door. */
export const doorMaterialFor = (row: DoorScheduleRow): string => row.frameType === "6" ? "door-coiling" : row.material === "HM" ? "door-hm" : row.material === "WD" ? "door-wd" : "door-alum";
