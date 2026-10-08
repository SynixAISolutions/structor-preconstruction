// Jelleff ceilings: the zones on the reflected ceiling plans A3.1 (Level 01) and A3.2 (Level 02), their
// printed tags and heights, the ceiling types, and the rooms with no ceiling shown. Types and checks are
// in lib/model.ts; the model objects are built in lib/jelleff-model.ts.
//
// Zone outlines are the plans' own filled-region boundaries, read from the PDF's vector clip paths and
// moved into each level's plan viewBox (A1.1 / A1.2) with the measured sheet offsets. Where a zone has
// no drawn outline it is traced and says so in `outline`. A zone takes a tag only when the tag sits in
// it or its leader ends in it. Heights are above the room's finished floor (A3.1 general note C).
// Walls keep their own heights: A3.1 general note I says walls run to the underside of the deck.

import type { CeilingSchedule, CeilingStatus, CeilingType, LevelId, Point, SourceRef } from "./model";

export const rcpL1: SourceRef = { drawing: "Jelleff drawing set", sheet: "A3.1", page: 53, detail: "Level 01 - reflected ceiling plan", asset: "/models/jelleff/a3-1.png" };
export const rcpL2: SourceRef = { drawing: "Jelleff drawing set", sheet: "A3.2", page: 54, detail: "Level 02 - reflected ceiling plan", asset: "/models/jelleff/a3-2.png" };
export const ceilingDetails: SourceRef = { drawing: "Jelleff drawing set", sheet: "A11.1", page: 77, detail: "Ceiling details (bulkheads, soffits, perimeter conditions)", asset: "/models/jelleff/a11-1.png" };

/** The A3.1 / A3.2 sheet offsets from A1.1 / A1.2, in the 2400 x 1715 viewBox (same 1/8" scale). */
export const RCP_OFFSETS = { "A3.1": [-35.2, 12.8], "A3.2": [-37.6, 11.2] } as const;

/** Printed tags as on the plans. The legend and A12.1 spell the acoustical panels "ACP"; the tags print "APC". */
export const ceilingTypes: CeilingType[] = [
  { tag: "APC-1", legend: "ACP-1 (2X2)", scheduleLink: { tag: "ACP-01", basis: "interpreted: printed APC-1 read as the legend's ACP-1 and A12.1's ACP-01" },
    conflicts: ["The plan tags print APC-1; the legend prints ACP-1 and A12.1 prints ACP-01."] },
  { tag: "APC-2", legend: "ACP-2 (4X4)", scheduleLink: { tag: "ACP-02", basis: "interpreted: printed APC-2 read as the legend's ACP-2 and A12.1's ACP-02" },
    conflicts: ["The plan tags print APC-2; the legend prints ACP-2 and A12.1 prints ACP-02.",
      "The A3.1 / A3.2 legend gives ACP-2 as 4x4; A12.1 gives ACP-02 (Armstrong Kitchen Zone, at kitchen) as 2x2. Not resolved."] },
  { tag: "GWB-1", legend: "Painted gypsum board", scheduleLink: null, conflicts: [] },
  { tag: "MPC", legend: "MPC - metal panel ceiling (wd. look)", scheduleLink: null, conflicts: ["No A12.1 row and no project manual section for MPC: unscheduled."] },
  { tag: "PSM-1", legend: null, scheduleLink: null, conflicts: ["Not on the legend or A12.1 (\"painted sheet metal\" is written beside the tag): unscheduled."] },
];
export const ceilingSchedule: CeilingSchedule = { types: ceilingTypes };

/** A ceiling zone, in its level's plan viewBox (A1.1 for L1, A1.2 for L2). */
export type CeilingZone = {
  id: string; level: LevelId; room: string | null; name: string;
  tag: string | null; height: string | null; status: CeilingStatus; paintTag?: string;
  /** "clip 273": the plan's own outline (vector clip path); "traced": no outline drawn. */
  outline: string; note?: string; points: Point[];
};
export const ceilingZones: CeilingZone[] = [
  { id: "ceil-l1-120-1", level: "L1", room: "120", name: "Storage 120", tag: "APC-1", height: "10' - 10\"", status: "tagged", outline: "clip 273", points: [[1045.8,  739.3],  [973.6,  739.3],  [973.6,  892.7],  [1045.8,  892.7]] },
  { id: "ceil-l1-103a-1", level: "L1", room: "103A", name: "Fixed bleacher seating 103A", tag: "GWB-1", height: "14' - 0\"", status: "tagged", outline: "clip 409", points: [[1029.6,  943.2],  [969.2,  943.2],  [969.2,  1160.0],  [1029.6,  1160.0]] },
  { id: "ceil-l1-101-1", level: "L1", room: "101", name: "Vestibule 101", tag: "GWB-1", height: "10' - 1\"", status: "tagged", outline: "clip 624", points: [[978.1,  1332.6],  [978.1,  1443.8],  [1099.0,  1443.8],  [1099.0,  1332.6]] },
  { id: "ceil-l1-105-1", level: "L1", room: "105", name: "Office 105", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 29", points: [[1075.1,  1010.2],  [1075.1,  1136.7],  [1158.8,  1136.7],  [1158.8,  1137.4],  [1199.0,  1137.4],  [1199.0,  1136.7],  [1201.5,  1136.7],  [1201.5,  1010.2]] },
  { id: "ceil-l1-104-1", level: "L1", room: "104", name: "Office 104", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "traced", note: "No outline is drawn for this zone; traced from its 2x2 grid lines (x 1210-1303) and the inner wall faces.", points: [[1210.0,  1010.2],  [1303.0,  1010.2],  [1303.0,  1136.7],  [1210.0,  1136.7]] },
  { id: "ceil-l1-117-1", level: "L1", room: "117", name: "RR foyer 117", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 267", points: [[1449.5,  835.0],  [1365.7,  835.0],  [1365.7,  870.7],  [1449.5,  870.7]] },
  { id: "ceil-l1-116-1", level: "L1", room: "116", name: "RR foyer 116", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 260", points: [[1473.0,  874.8],  [1420.8,  874.8],  [1420.8,  912.8],  [1473.0,  912.8]] },
  { id: "ceil-l1-102b-1", level: "L1", room: "102B", name: "Circulation 102B - north", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 313", points: [[1365.7,  878.6],  [1365.7,  1000.7],  [1317.0,  1000.7],  [1317.0,  1069.1],  [1417.9,  1069.1],  [1417.9,  878.6]] },
  { id: "ceil-l1-102b-2", level: "L1", room: "102B", name: "Circulation 102B - south", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 538", note: "Tagged GWB-1 9'-0\" inside the zone, but drawn with a grid, not the stipple A3.1's legend uses for painted gypsum board. Kept as tagged; not resolved.", points: [[1589.0,  1030.3],  [1494.0,  1070.9],  [1494.0,  1073.3],  [1317.1,  1073.3],  [1317.1,  1144.4],  [1275.0,  1144.4],  [1275.0,  1209.9],  [1605.6,  1068.6]] },
  { id: "ceil-l1-117b-1", level: "L1", room: "117B", name: "Lockers / change 117B", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 265", points: [[1548.6,  737.7],  [1508.0,  737.7],  [1508.0,  832.1],  [1548.6,  832.1]] },
  { id: "ceil-l1-117a-1", level: "L1", room: "117A", name: "Toilet / shower 117A - toilets", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 269", points: [[1562.9,  726.1],  [1562.9,  828.0],  [1624.3,  828.0],  [1624.3,  752.9],  [1639.9,  752.9],  [1639.9,  726.1]] },
  { id: "ceil-l1-117a-2", level: "L1", room: "117A", name: "Toilet / shower 117A - chase strip", tag: "GWB-1", height: "8' - 0\"", status: "tagged", outline: "clip 271", points: [[1639.9,  768.4],  [1624.3,  768.4],  [1624.3,  828.0],  [1639.9,  828.0]] },
  { id: "ceil-l1-117a-3", level: "L1", room: "117A", name: "Toilet / shower 117A - showers", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 536", points: [[1642.8,  726.1],  [1642.8,  828.0],  [1671.2,  828.0],  [1671.2,  804.0],  [1709.3,  804.0],  [1709.3,  782.5],  [1685.2,  782.5],  [1685.2,  779.7],  [1709.3,  779.7],  [1709.3,  758.2],  [1685.2,  758.2],  [1685.2,  755.3],  [1706.6,  755.3],  [1706.6,  733.9],  [1685.2,  733.9],  [1685.2,  726.1]] },
  { id: "ceil-l1-117a-4", level: "L1", room: "117A", name: "Toilet / shower 117A - corridor", tag: "GWB-1", height: null, status: "height-unresolved", outline: "clip 662", note: "GWB-1 by its stipple; two height tags end at its edges (GWB-1 8'-8\" at its north edge, GWB-1 9'-0\" at its east end) and neither leader ends clearly inside it.", points: [[1671.2,  835.0],  [1452.3,  835.0],  [1452.3,  870.7],  [1671.2,  870.7]] },
  { id: "ceil-l1-116a-1", level: "L1", room: "116A", name: "Toilet / shower 116A - corridor", tag: "GWB-1", height: "8' - 8\"", status: "tagged", outline: "clip 258", points: [[1671.2,  878.6],  [1476.0,  878.6],  [1476.0,  912.8],  [1671.2,  912.8]] },
  { id: "ceil-l1-116a-2", level: "L1", room: "116A", name: "Toilet / shower 116A - toilets", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 256", points: [[1595.3,  915.7],  [1520.2,  915.7],  [1520.2,  992.7],  [1595.3,  992.7]] },
  { id: "ceil-l1-116a-3", level: "L1", room: "116A", name: "Toilet / shower 116A - chase strip", tag: "GWB-1", height: "8' - 0\"", status: "tagged", outline: "clip 558", points: [[1609.9,  915.7],  [1595.3,  915.7],  [1595.3,  959.7],  [1609.9,  959.7]] },
  { id: "ceil-l1-116a-4", level: "L1", room: "116A", name: "Toilet / shower 116A - showers", tag: null, height: null, status: "untagged", outline: "clip 560", note: "Drawn (stipple) but no ceiling tag ends in it.", points: [[1612.7,  915.7],  [1612.7,  937.1],  [1634.8,  937.1],  [1634.8,  940.0],  [1612.7,  940.0],  [1612.7,  961.4],  [1634.8,  961.4],  [1634.8,  964.3],  [1612.7,  964.3],  [1612.7,  985.8],  [1634.8,  985.8],  [1634.8,  1007.6],  [1664.3,  995.0],  [1664.3,  980.1],  [1671.2,  980.1],  [1671.2,  915.7]] },
  { id: "ceil-l1-116b-1", level: "L1", room: "116B", name: "Lockers / change 116B", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 32", points: [[1450.1,  915.7],  [1450.1,  916.9],  [1459.0,  916.9],  [1459.0,  1002.6],  [1450.1,  1002.6],  [1450.1,  1004.1],  [1507.2,  1004.1],  [1507.2,  915.7]] },
  { id: "ceil-l1-113-1", level: "L1", room: "113", name: "Toilet 113", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 34", points: [[1494.0,  1006.9],  [1494.0,  1067.8],  [1549.1,  1044.3],  [1549.1,  1006.9]] },
  { id: "ceil-l1-32-1", level: "L1", room: "32", name: "Check 32", tag: "MPC", height: "10' - 0\"", status: "tagged", outline: "clip 563", points: [[1679.8,  878.2],  [1679.8,  976.2],  [1683.8,  985.4],  [1718.5,  970.5],  [1718.5,  941.4],  [1704.2,  941.4],  [1704.2,  934.2],  [1717.1,  934.2],  [1717.1,  878.2]] },
  { id: "ceil-l1-unnumbered-1", level: "L1", room: null, name: "East entry - north of check 32", tag: "MPC", height: "10' - 0\"", status: "tagged", outline: "traced", note: "No room number on A3.1. No outline is drawn; traced from the extent of its panel lines.", points: [[1679.8,  812.5],  [1717.3,  812.5],  [1717.3,  871.1],  [1679.8,  871.1]] },
  { id: "ceil-l1-106-1", level: "L1", room: "106", name: "Fitness center 106", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 534", points: [[1521.4,  1107.8],  [1277.2,  1212.2],  [1277.2,  1328.2],  [1261.7,  1328.2],  [1261.7,  1372.3],  [1271.0,  1372.0],  [1408.2,  1313.3],  [1408.5,  1313.1],  [1405.4,  1306.0],  [1457.5,  1283.7],  [1458.2,  1283.5],  [1461.2,  1290.6],  [1578.4,  1240.5]] },
  { id: "ceil-l1-107-1", level: "L1", room: "107", name: "Storage 107", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 546", points: [[1555.6,  1093.1],  [1526.7,  1105.5],  [1548.7,  1157.1],  [1577.9,  1144.7]] },
  { id: "ceil-l1-108-1", level: "L1", room: "108", name: "Office 108", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 550", points: [[1591.1,  1078.0],  [1558.4,  1091.9],  [1581.7,  1146.2],  [1549.9,  1159.8],  [1583.5,  1238.3],  [1609.7,  1227.1],  [1610.6,  1228.1],  [1636.8,  1216.9],  [1636.3,  1215.7],  [1648.1,  1210.8]] },
  { id: "ceil-l1-109-1", level: "L1", room: "109", name: "Family 109", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 552", points: [[1660.3,  1048.3],  [1594.0,  1076.7],  [1602.5,  1096.7],  [1622.9,  1088.1],  [1624.6,  1092.2],  [1614.2,  1096.5],  [1629.4,  1132.2],  [1686.1,  1108.2]] },
  { id: "ceil-l1-110-1", level: "L1", room: "110", name: "Guard 110", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 556", points: [[1692.5,  1034.6],  [1663.2,  1047.1],  [1689.9,  1109.4],  [1678.3,  1114.5],  [1686.7,  1111.2],  [1694.8,  1130.4],  [1696.4,  1133.1],  [1688.0,  1137.0],  [1698.0,  1160.5],  [1698.4,  1160.8],  [1706.5,  1157.3],  [1707.9,  1159.7],  [1699.3,  1163.6],  [1709.6,  1187.9],  [1764.0,  1164.7],  [1760.2,  1162.8],  [1719.4,  1067.1],  [1718.2,  1066.2],  [1707.8,  1041.6],  [1699.4,  1045.0],  [1695.6,  1036.0],  [1693.7,  1036.7]] },
  { id: "ceil-l1-unnumbered-2", level: "L1", room: null, name: "Zone between office 108 and guard 110", tag: null, height: null, status: "untagged", outline: "clip 554", note: "Drawn (2x2 grid) but no ceiling tag ends in it; it lies in the guard 110 area, whose tag leads to the zone east of it.", points: [[1674.2,  1116.3],  [1654.2,  1124.9],  [1659.8,  1138.2],  [1657.1,  1139.2],  [1651.3,  1126.2],  [1620.7,  1139.2],  [1650.7,  1209.6],  [1704.4,  1186.6]] },
  { id: "ceil-l1-111-1", level: "L1", room: "111", name: "Vestibule 111", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 548", points: [[1675.0,  993.6],  [1593.1,  1028.5],  [1609.5,  1066.9],  [1691.6,  1032.0]] },
  { id: "ceil-l2-s202-1", level: "L2", room: "S202", name: "Stair B S202", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 405", points: [[1492.3,  726.3],  [1366.8,  726.3],  [1366.8,  787.0],  [1492.3,  787.0]] },
  { id: "ceil-l2-200-1", level: "L2", room: "200", name: "Circulation 200 - north", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 194", points: [[1499.3,  738.3],  [1499.3,  1044.7],  [1545.4,  1044.7],  [1545.4,  1043.6],  [1546.2,  1043.6],  [1546.2,  738.3]] },
  { id: "ceil-l2-200-2", level: "L2", room: "200", name: "Circulation 200 - east", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 386", points: [[1669.9,  995.9],  [1546.5,  1048.6],  [1499.3,  1048.8],  [1499.3,  1072.7],  [1422.9,  1072.7],  [1422.9,  1097.4],  [1405.3,  1097.4],  [1405.3,  1098.1],  [1403.8,  1098.1],  [1403.8,  1097.4],  [1395.3,  1097.4],  [1395.3,  1135.8],  [1404.1,  1156.1],  [1686.9,  1035.3]] },
  { id: "ceil-l2-200-3", level: "L2", room: "200", name: "Circulation 200 - by the kitchen", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 192", points: [[1392.4,  1097.4],  [1275.8,  1097.4],  [1275.8,  1135.8],  [1392.4,  1135.8]] },
  { id: "ceil-l2-200-4", level: "L2", room: "200", name: "Circulation 200 - west", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "traced", note: "Tag sits in the zone; no outline or stipple is drawn. Traced between the toilet wall, the corridor edge and the stair A wall.", points: [[1111.8,  1097.4],  [1275.8,  1097.4],  [1275.8,  1135.8],  [1111.8,  1135.8]] },
  { id: "ceil-l2-203-1", level: "L2", room: "203", name: "Toilet 203", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 399", points: [[1183.6,  1017.9],  [1183.6,  1094.4],  [1217.4,  1094.4],  [1217.4,  1071.8],  [1234.0,  1071.8],  [1234.0,  1017.9]] },
  { id: "ceil-l2-204-1", level: "L2", room: "204", name: "Toilet 204", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "clip 137", points: [[1236.9,  1017.9],  [1236.9,  1071.8],  [1253.5,  1071.8],  [1253.5,  1094.4],  [1288.0,  1094.4],  [1288.0,  1017.9]] },
  { id: "ceil-l2-205-1", level: "L2", room: "205", name: "Toilet 205", tag: "GWB-1", height: "9' - 0\"", status: "tagged", outline: "traced", note: "No outline is drawn; traced to the room's inner wall lines.", points: [[1290.9,  1041.0],  [1347.7,  1041.0],  [1347.7,  1094.4],  [1290.9,  1094.4]] },
  { id: "ceil-l2-206a-1", level: "L2", room: "206A", name: "Closet 206A", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 557", points: [[1345.1,  1000.2],  [1294.1,  1000.2],  [1294.1,  1030.6],  [1345.1,  1030.6]] },
  { id: "ceil-l2-206-1", level: "L2", room: "206", name: "Office / reception 206", tag: "APC-1", height: "9' - 0\"", status: "tagged", outline: "clip 139", points: [[1348.1,  1000.2],  [1348.1,  1094.4],  [1403.8,  1094.3],  [1403.8,  1093.0],  [1405.3,  1093.0],  [1405.3,  1094.4],  [1418.2,  1094.4],  [1418.2,  1000.2],  [1375.7,  1000.2],  [1375.7,  1009.9],  [1367.9,  1009.9],  [1367.9,  1000.2]] },
  { id: "ceil-l2-208-1", level: "L2", room: "208", name: "Kitchen 208 - west", tag: "APC-2", height: "8' - 6\"", status: "tagged", outline: "clip 394", points: [[1277.1,  1138.7],  [1277.1,  1259.2],  [1323.4,  1259.2],  [1323.4,  1211.0],  [1342.4,  1211.0],  [1342.4,  1138.7]] },
  { id: "ceil-l2-208-2", level: "L2", room: "208", name: "Kitchen 208 - by the counter", tag: "APC-2", height: "8' - 6\"", status: "tagged", outline: "clip 394, second outline", points: [[1406.7,  1213.9],  [1406.7,  1259.2],  [1443.4,  1259.2],  [1424.2,  1213.9]] },
  { id: "ceil-l2-208-3", level: "L2", room: "208", name: "Kitchen 208 - south", tag: null, height: null, status: "untagged", outline: "clip 550", note: "Drawn (2x2 grid) with the room name, but no ceiling tag ends in it.", points: [[1277.1,  1262.1],  [1277.1,  1327.7],  [1252.4,  1327.7],  [1252.4,  1371.8],  [1270.8,  1371.6],  [1408.9,  1312.6],  [1405.9,  1305.4],  [1454.4,  1284.7],  [1444.7,  1262.1]] },
  { id: "ceil-l2-209-1", level: "L2", room: "209", name: "Storage 209", tag: "APC-1", height: "8' - 0\"", status: "tagged", outline: "clip 135", points: [[1345.2,  1138.7],  [1345.2,  1211.0],  [1422.8,  1211.0],  [1404.8,  1168.6],  [1401.5,  1169.7],  [1400.0,  1166.2],  [1399.6,  1165.3],  [1402.7,  1163.8],  [1392.0,  1138.7]] },
  { id: "ceil-l2-210-1", level: "L2", room: "210", name: "Multipurpose room 1 210", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 390", points: [[1511.4,  1114.0],  [1405.4,  1159.4],  [1461.3,  1290.1],  [1578.3,  1240.2],  [1575.0,  1232.5],  [1579.7,  1230.5],  [1581.1,  1230.0],  [1584.3,  1237.6],  [1599.8,  1231.0],  [1551.3,  1117.8],  [1519.1,  1131.5]] },
  { id: "ceil-l2-210-2", level: "L2", room: "210", name: "Multipurpose rooms - partition head", tag: "GWB-1", height: "9' - 8\"", status: "tagged", outline: "clip 388", note: "Strip along the operable partition between rooms 210 and 211.", points: [[1552.7,  1117.1],  [1551.2,  1117.8],  [1551.5,  1118.5],  [1600.1,  1230.9],  [1601.3,  1230.3],  [1601.1,  1229.6]] },
  { id: "ceil-l2-211-1", level: "L2", room: "211", name: "Multipurpose room 2 211", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 392", points: [[1695.4,  1034.8],  [1581.1,  1083.7],  [1588.8,  1101.7],  [1556.7,  1115.4],  [1605.2,  1228.6],  [1752.1,  1165.8],  [1752.5,  1165.7],  [1748.8,  1157.5],  [1754.8,  1155.1],  [1758.3,  1163.2],  [1759.8,  1162.6],  [1707.9,  1041.1],  [1700.3,  1044.1],  [1697.0,  1036.4],  [1696.3,  1036.3]] },
  { id: "ceil-l2-215-1", level: "L2", room: "215", name: "Activity 1 215", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 143", points: [[1549.1,  741.1],  [1549.1,  787.3],  [1571.7,  787.3],  [1571.7,  806.5],  [1717.1,  806.5],  [1717.1,  741.1]] },
  { id: "ceil-l2-215-2", level: "L2", room: "215", name: "Activity 1 215 - north band", tag: "GWB-1", height: "7' - 6\"", status: "tagged", paintTag: "PT-08", outline: "traced", note: "No outline is drawn; traced between the north wall face and the acoustical ceiling.", points: [[1549.1,  725.6],  [1717.1,  725.6],  [1717.1,  741.1],  [1549.1,  741.1]] },
  { id: "ceil-l2-215-3", level: "L2", room: "215", name: "Activity 1 / game room - partition head", tag: "GWB-1", height: "10' - 0\"", status: "tagged", outline: "clip 141", note: "Strip along the operable partition between rooms 215 and 213.", points: [[1716.8,  806.5],  [1571.7,  806.5],  [1571.7,  808.2],  [1716.8,  808.2]] },
  { id: "ceil-l2-213-1", level: "L2", room: "213", name: "Game room 213", tag: "APC-1", height: "10' - 0\"", status: "tagged", outline: "clip 145", points: [[1571.7,  812.2],  [1571.7,  831.8],  [1549.1,  831.8],  [1549.1,  870.2],  [1567.4,  870.2],  [1567.4,  956.5],  [1716.8,  956.5],  [1716.8,  812.2]] },
  { id: "ceil-l2-213-2", level: "L2", room: "213", name: "Game room 213 - west soffit", tag: "GWB-1", height: "7' - 6\"", status: "tagged", paintTag: "PT-08", outline: "traced", note: "No outline is drawn; traced from the notch the acoustical ceiling leaves along the west wall.", points: [[1549.1,  870.2],  [1567.4,  870.2],  [1567.4,  956.5],  [1549.1,  956.5]] },
  { id: "ceil-l2-213-3", level: "L2", room: "213", name: "Game room 213 - band", tag: "GWB-1", height: "9' - 0\"", status: "tagged", paintTag: "PT-01", outline: "traced", note: "No outline is drawn; the band between the acoustical ceiling and the zone south of it. PT-01 is A12.1's field (wall) paint, printed here as on the plan.", points: [[1549.1,  956.5],  [1716.8,  956.5],  [1716.8,  964.2],  [1549.1,  964.2]] },
  { id: "ceil-l2-213-4", level: "L2", room: "213", name: "Game room 213 - south", tag: "GWB-1", height: "9' - 5\"", status: "tagged", paintTag: "PT-08", outline: "clip 567", points: [[1549.1,  964.2],  [1549.1,  1043.6],  [1550.8,  1043.7],  [1673.5,  991.2],  [1672.3,  988.3],  [1717.5,  969.1],  [1717.5,  964.2]] },
];

/** Rooms on A3.1 / A3.2 with no ceiling shown, and why. Nothing is assumed for them. */
export const roomsWithoutCeiling: { level: LevelId; room: string; reason: string }[] = [
  { level: "L1", room: "102", reason: "Lobby: no ceiling tag or pattern; open to the structure above." },
  { level: "L1", room: "103", reason: "Gym: no ceiling; the plan shows the structure and gym equipment." },
  { level: "L1", room: "102A", reason: "Reception: no ceiling tag found." },
  { level: "L1", room: "112", reason: "Mechanical: no ceiling tag." },
  { level: "L1", room: "114", reason: "Elevator: no ceiling tag." },
  { level: "L1", room: "115", reason: "Janitor: no ceiling tag." },
  { level: "L1", room: "118", reason: "Outdoor mechanical yard." },
  { level: "L1", room: "119A", reason: "Electrical utility: no ceiling tag." },
  { level: "L1", room: "S101", reason: "Stair A: no ceiling tag." },
  { level: "L1", room: "S102", reason: "Stair B: no ceiling tag." },
  { level: "L2", room: "201", reason: "IT: no ceiling tag; the structure is drawn through it." },
  { level: "L2", room: "207", reason: "Elevator: a cab outline is drawn but no ceiling tag." },
  { level: "L2", room: "217", reason: "Electrical: no ceiling tag." },
  { level: "L2", room: "218", reason: "Mechanical: no ceiling tag." },
  { level: "L2", room: "221", reason: "Janitor / laundry: no ceiling tag." },
];

/** Tags printed on the plans that aren't tied to a traced zone, and why. */
export const unplacedCeilingTags: { level: LevelId; tag: string; height: string; reason: string }[] = [
  { level: "L1", tag: "GWB-1", height: "8' - 8\"", reason: "Circulation 102B: the leader ends on a thin band between the two corridor ceilings that has no outline." },
  { level: "L1", tag: "GWB-1", height: "9' - 0\"", reason: "By janitor 115: the leader ends on a small stippled area with no outline." },
  { level: "L1", tag: "GWB-1", height: "9' - 0\"", reason: "East side: the leader ends at the east end of toilet / shower 116A, at the 116C passage; 116A's own tag reads 8'-8\"." },
  { level: "L1", tag: "PSM-1", height: "7' - 10\"", reason: "Check 32: the leader ends at the built-in desk; no outline is drawn." },
  { level: "L1", tag: "MPC", height: "13' - 0\"", reason: "Outdoor roof canopy at the main entry: outside this interior pass." },
];
