// Jelleff wall finishes: what the finish plans (A12.2, A12.3), the interior elevations (A10.1-A10.5) and the
// enlarged plans (A2.1, A2.2) say about each wall face. Types and checks are in lib/model.ts; the records are
// resolved against the model in lib/jelleff-model.ts.
//
// Points are in each level's plan viewBox (A1.1 for Level 01, A1.2 for Level 02). A plan tag's extent is where
// its leaders end. An elevation is tied to a face only by its title (room and direction) and, where one exists,
// its marker on an A2.1 enlarged plan; no sheet transform is applied to A2.x or A10.x. A face nothing names
// stays "not noted": the room finish schedule that A12.2 / A12.3 general note C refers to isn't in the set.

import type { FaceBase, FinishBand, LevelId, Point, SourceRef, WallFinishStatus } from "./model";

const sheet = (name: string, page: number, asset: string) => (detail: string): SourceRef => ({ drawing: "Jelleff drawing set", sheet: name, page, detail, asset: `/models/jelleff/${asset}.png` });
const A122 = sheet("A12.2", 80, "a12-2"), A123 = sheet("A12.3", 81, "a12-3"), A101 = sheet("A10.1", 71, "a10-1"), A102 = sheet("A10.2", 72, "a10-2");
const A103 = sheet("A10.3", 73, "a10-3"), A104 = sheet("A10.4", 74, "a10-4"), A105 = sheet("A10.5", 75, "a10-5"), A21 = sheet("A2.1", 50, "a2-1"), A22 = sheet("A2.2", 51, "a2-2");
const view = (src: (d: string) => SourceRef, n: number, title: string) => src(`${n}/${src("").sheet} ${title}`);

const band = (tags: string[], extra: Partial<FinishBand> = {}): FinishBand => ({ tags, from: null, to: null, height: null, width: null, fullRun: true, ...extra });
const paint = (tag: string, from: string | null, note = "Up the wall; its top isn't dimensioned."): FinishBand => band([tag], { from, note });
/** Level 01 restrooms: tile to 7'-4" with a WT-02 top course, paint above. */
const tileL1 = (): FinishBand[] => [band(["WT-01", "WT-02"], { from: "4\"", to: "7' - 4\"", note: "Tile field to 7'-4\" above the floor, top course WT-02 (12x12); course heights aren't dimensioned." }), paint("PT-02", "7' - 4\"")];
/** Level 02 toilets: tile to 7'-4", paint above. */
const tileL2 = (): FinishBand[] => [band(["WT-01"], { from: "4\"", to: "7' - 4\"", note: "Tile field to 7'-4\" above the floor." }), paint("PT-02", "7' - 4\"")];
const tileBase: FaceBase = { tag: "WT-01", printed: "Tile base WT-01, cut to 4\" x 24\"", basis: "Printed on the elevation", fullRun: true };
const asScheduled = (basis: string): FaceBase => ({ tag: null, printed: "Wall base as scheduled", basis, fullRun: true });
const wb02FromSchedule: FaceBase = { tag: "WB-02", printed: "Not printed; A12.1 schedules WB-02 at PT-02 locations", basis: "A12.1 comment on WB-02", fullRun: true };
const tileBaseConflict = "The elevation prints tile base WT-01 cut to 4\" x 24\"; the model pairs FT-01 floors with TB-01 (A12.1). Not resolved.";
const gymConflicts = ["A10.4 and A10.5 print wall base WB-02 at the gym; A12.1 schedules VWB-01 \"at gym\", which the model's gym floor uses. Not resolved.",
  "A12.1 gives GWP-01 as 2' x 7'6\"; the gym elevations dimension the pads 6'-0\" high. Not resolved."];
const gymBands = (): FinishBand[] => [band(["GWP-01"], { from: "4\"", height: "6' - 0\"", fullRun: false, note: "Wall pads above the base, also at exposed brace frames (A2.2 keynote 5); they stop at doors and other openings, so they aren't measured." }),
  band(["SAW-01"], { fullRun: false, note: "Tectum panels in the upper wall; their heights and extents aren't dimensioned." })];

export type WallFinishData = {
  id: string; level: LevelId; room: string | null; title: string; evidence: SourceRef[];
  wallIds: string[]; toward: Point | null; extent: [Point, Point] | null;
  bands: FinishBand[]; base: FaceBase | null; status: WallFinishStatus; conflicts: string[]; note?: string;
};
const rec = (r: Omit<WallFinishData, "conflicts" | "wallIds" | "toward" | "extent" | "base"> & Partial<WallFinishData>): WallFinishData =>
  ({ wallIds: [], toward: null, extent: null, base: null, conflicts: [], ...r });

/** Level 02 toilets: A2.1 view 4 marks each view; views 18 and 24 carry each other's titles. */
const toilet = (room: string, dir: string, n: number, title: string, wallId: string, extent: [Point, Point], toward: Point, tiled: boolean, extra: string[] = []): WallFinishData => rec({
  id: `wf-l2-${room}-${dir}`, level: "L2", room, title: `Toilet ${room} - ${dir} wall`, evidence: [view(A103, n, title), A21(`4/A2.1 Second floor restroom plan: marker ${n} in toilet ${room}`), ...(tiled ? [A123("WT-01 tag on the toilet's tile wall")] : [])],
  wallIds: [wallId], toward, extent, bands: tiled ? tileL2() : [paint("PT-02", "4\"")], base: tileBase, status: "assigned", conflicts: [tileBaseConflict, ...extra],
});
const titleSwap = "A10.3 views 18 and 24 are titled 'TLT 205 - North' and 'TLT 203 - North', but A2.1 view 4 puts marker 18 in toilet 203 and marker 24 in toilet 205. Both views show the same tile; the face follows the marker.";

/** Level 01 restroom elevations on walls the model doesn't trace. */
const restroomL1 = (id: string, room: string, n: number, title: string, bands: FinishBand[], note?: string): WallFinishData => rec({
  id, level: "L1", room, title, evidence: [view(A103, n, title), A21("3/A2.1 Enlarged locker room plan")], bands, base: tileBase, status: "wall-not-traced", conflicts: [tileBaseConflict],
  note: note ?? "This wall isn't traced in the model's Level 01 restroom block.",
});
const fcr109 = (dir: string, n: number, bands: FinishBand[]): WallFinishData => rec({
  id: `wf-l1-109-${dir.toLowerCase()}`, level: "L1", room: "109", title: `Family restroom 109 - ${dir.toLowerCase()} wall`, evidence: [view(A103, n, `FCR 109 - ${dir}`), A21("2/A2.1 Enlarged FCR and guard room plan")],
  bands, base: tileBase, status: "face-unresolved", conflicts: [tileBaseConflict],
  note: "A2.1 view 2 draws this room square; the model's wing is rotated and coarse, so which traced wall this face is isn't established.",
});
const fcrTile = (): FinishBand[] => [band(["WT-01", "WT-02"], { from: "4\"", note: "Tile field with a WT-02 top course; its height isn't dimensioned on this view." }), paint("PT-02", null)];
const graphic = "Painted graphic: stripes are dimensioned by width and angle, not as areas, so the tags are listed, not measured.";

export const wallFinishData: WallFinishData[] = [
  // ── Level 01: finish plan tags (A12.2) ──
  rec({ id: "wf-l1-105-west", level: "L1", room: "105", title: "Office 105 - west wall", evidence: [A122("PT-02 tag, leaders along office 105's west wall")],
    wallIds: ["office-west"], toward: [1135, 1070], extent: [[1067, 1012], [1067, 1134]], bands: [band(["PT-02"], { note: "Height not dimensioned." })], base: wb02FromSchedule, status: "assigned" }),
  rec({ id: "wf-l1-104-east", level: "L1", room: "104", title: "Office 104 - east wall", evidence: [A122("PT-02 tag, leaders along office 104's east wall")],
    wallIds: ["office-east"], toward: [1257, 1070], extent: [[1310, 1006], [1310, 1132]], bands: [band(["PT-02"], { note: "Height not dimensioned." })], base: wb02FromSchedule, status: "assigned" }),
  rec({ id: "wf-l1-108-north-passage", level: "L1", room: "108", title: "Office 108 entry - storage 107 wall", evidence: [A122("PT-02 tag in the passage at the north end of office 108")],
    bands: [band(["PT-02"])], status: "wall-not-traced", note: "Leaders run along the east face of storage 107's east wall, from about (1561, 1095) to the 107 / 108 corner (1582, 1146); that wall isn't traced." }),
  rec({ id: "wf-l1-108-west", level: "L1", room: "108", title: "Office 108 - west wall", evidence: [A122("PT-02 tag in office 108")],
    bands: [band(["PT-02"])], status: "face-unresolved", note: "Leaders end at the 107 / 108 corner (1582, 1146) and near the south glazing (1585, 1238). No traced wall runs between them: the model's fitness / office 108 wall lies about 35 units west at the top." }),
  rec({ id: "wf-l1-106-north", level: "L1", room: "106", title: "Fitness center 106 - north wall", evidence: [A122("PT-03 tag on the fitness north side"), view(A101, 2, "Fitness Center 106 - North")],
    bands: [band(["PT-03"], { fullRun: false, note: "On the solid wall beside the glazing; its width isn't dimensioned." })], base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.1 view 2", fullRun: false },
    status: "wall-not-traced", note: "The model shows storefront along this side (fitness-corridor-east-glass). A10.1 view 2 shows glazing with a solid PT-03 wall beside it." }),
  rec({ id: "wf-l1-106-south", level: "L1", room: "106", title: "Fitness center 106 - south wall, west end", evidence: [A122("PT-03 tag at the fitness entry, between the lobby corner and the angled south wall"), view(A101, 4, "Fitness Center 106 - South")],
    bands: [band(["PT-03"], { fullRun: false, note: "On the solid west end of the south wall; its width isn't dimensioned." })], base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.1 view 4", fullRun: false },
    status: "wall-not-traced", note: "The model shows storefront along the south side (fitness-south-glass). A10.1 view 4 shows a solid PT-03 end beside the glazing." }),
  rec({ id: "wf-l1-lav-115", level: "L1", room: null, title: "Lavatory wall by janitor 115", evidence: [A122("WT-01 tag, leaders to the lavatory wall")],
    bands: [band(["WT-01"], { fullRun: false, note: "Height not dimensioned." })], status: "wall-not-traced",
    note: "Leaders end on a wall at x ≈ 1418 between y 960 and 992 (the lavatory counter). The wall isn't traced, and the plan doesn't show which room the tag is in." }),

  // ── Level 01: elevations on traced walls ──
  rec({ id: "wf-l1-106-west", level: "L1", room: "106", title: "Fitness center 106 - west wall", evidence: [view(A101, 3, "Fitness Center 106 - West")],
    wallIds: ["fitness-west"], toward: [1300, 1270], extent: [[1274, 1215], [1274, 1330]],
    bands: [band(["PT-03"], { fullRun: false, note: "Accent paint on the solid wall; its extent along the face isn't dimensioned." }), band(["MR-01"], { height: "8' - 8\"", width: "6' - 0\"", fullRun: false, note: "Two 3'-0\" mirror panels." })],
    base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.1 view 3; 'wall base as scheduled' is printed under the mirror", fullRun: false }, status: "assigned",
    note: "A10.1 view 3 shows glazing with window film at the north end of this face." }),
  rec({ id: "wf-l1-106-east", level: "L1", room: "106", title: "Fitness center 106 - east wall", evidence: [view(A101, 1, "Fitness Center 106 - East")],
    wallIds: ["fitness-office"], toward: [1500, 1180], extent: [[1530, 1100], [1579, 1240]],
    bands: [band(["MR-01"], { from: "8\"", height: "8' - 8\"", width: "12' - 0\"", fullRun: false, note: "Four 3'-0\" mirror panels." })], base: asScheduled("A10.1 view 1"), status: "assigned" }),
  rec({ id: "wf-l1-117b-west", level: "L1", room: "117B", title: "Lockers 117B - west wall", evidence: [view(A103, 16, "Lockers 117B - West"), A21("3/A2.1 Enlarged locker room plan: marker 16")],
    wallIds: ["service-locker-north"], toward: [1525, 780], extent: [[1496, 725], [1496, 836]],
    bands: [band(["WT-01"], { from: "4\"", to: "1' - 8\"", fullRun: false, note: "Tile below the lockers; its width along the wall isn't dimensioned." }), paint("PT-02", null, "Above the lockers; heights not dimensioned.")],
    base: tileBase, status: "assigned", conflicts: [tileBaseConflict], note: "Lockers (LOC-01) and the ADA bench are equipment, not finishes." }),
  rec({ id: "wf-l1-116b-west", level: "L1", room: "116B", title: "Lockers 116B - west wall", evidence: [view(A103, 12, "Lockers 116B - West"), A21("3/A2.1 Enlarged locker room plan")],
    wallIds: ["service-locker-south"], toward: [1480, 960], extent: [[1448, 917], [1448, 998]], bands: [paint("PT-02", null, "Above the lockers; heights not dimensioned.")], status: "assigned",
    note: "No base is printed on this view. Lockers and benches are equipment, not finishes." }),
  rec({ id: "wf-l1-102-west", level: "L1", room: "102", title: "Lobby 102 - west wall", evidence: [view(A102, 3, "Lobby 102 - West")],
    wallIds: ["gym-east-pier", "gym-east-south"], toward: [1000, 1260], bands: [band(["PT-03"], { fullRun: false }), band(["PT-04"], { fullRun: false })],
    base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.2 view 3, under the PT-03 band", fullRun: false }, status: "graphic", note: graphic }),
  rec({ id: "wf-l1-102-north", level: "L1", room: "102", title: "Lobby 102 - north wall", evidence: [view(A102, 2, "Lobby 102 - North")],
    wallIds: ["stair-a-south", "office-105-south", "office-104-south"], toward: [1100, 1250],
    bands: ["PT-03", "PT-03B", "PT-04", "PT-04B", "MP-03"].map(t => band([t], { fullRun: false })),
    base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.2 view 2, under the PT-03 panel", fullRun: false }, status: "graphic", note: `${graphic} MP-03 metal panels are drawn but not dimensioned.` }),
  rec({ id: "wf-l1-102-east", level: "L1", room: "102", title: "Lobby 102 - east wall", evidence: [view(A102, 1, "Lobby 102 - East")],
    wallIds: ["fitness-west"], toward: [1250, 1270], bands: ["PT-03", "PT-03B", "PT-04", "PT-04B", "MP-03"].map(t => band([t], { fullRun: false })),
    base: asScheduled("A10.2 view 1"), status: "graphic", note: `${graphic} Window film WF-01 on the storefront is not a wall finish.` }),
  ...([["north", 2, A104, "Gym - North", ["gym-north"], [[460, 725], [970, 725]]], ["west", 1, A104, "Gym - West", ["gym-west-north", "gym-west", "gym-west-south"], [[460, 725], [460, 1445]]],
    ["south", 2, A105, "Gym - South", ["gym-south"], [[460, 1445], [970, 1445]]], ["east", 1, A105, "Gym - East", ["gym-east-north", "gym-east", "gym-east-pier", "gym-east-south"], [[970, 725], [970, 1445]]]] as const)
    .map(([dir, n, src, title, wallIds, extent]) => rec({ id: `wf-l1-103-${dir}`, level: "L1", room: "103", title: `Gym 103 - ${dir} wall`, evidence: [view(src, n, title), A22("Enlarged gym plan, keynote 5: wall pads GWP-01 at exposed brace frames")],
      wallIds: [...wallIds], toward: [715, 1085], extent: [extent[0] as Point, extent[1] as Point], bands: gymBands(), base: { tag: "WB-02", printed: "Wall base: WB-02", basis: `${n}/${src("").sheet}`, fullRun: true },
      status: "assigned", conflicts: gymConflicts, note: "Extent is the traced gym wall; door openings aren't deducted." })),

  // ── Level 01: restroom elevations on untraced walls, and faces not tied to a traced wall ──
  restroomL1("wf-l1-117a-west", "117A", 15, "TLT 117A - West", tileL1()),
  restroomL1("wf-l1-117a-east", "117A", 14, "TLT 117A - East", tileL1(), "This wall isn't traced in the model. The mirror over the lavatories is noted MR (7/A10.6) without a schedule tag."),
  restroomL1("wf-l1-117a-shower-east", "117A", 13, "Shower 117A - East", tileL1()),
  restroomL1("wf-l1-116a-west", "116A", 11, "TLT 116A - West", tileL1()),
  restroomL1("wf-l1-116a-east", "116A", 10, "TLT 116A - East", tileL1()),
  restroomL1("wf-l1-116a-shower-west", "116A", 9, "Shower 116 - West", tileL1(), "This wall isn't traced in the model. The view is titled 'Shower 116'; the showers are in toilet / shower 116A."),
  ...([["north", 4], ["west", 3], ["east", 1]] as const).map(([dir, n]) => rec({ id: `wf-l1-113-${dir}`, level: "L1", room: "113", title: `Toilet 113 - ${dir} wall`,
    evidence: [view(A103, n, `TLT 113 - ${dir.toUpperCase()}`), A21("1/A2.1 Toilet 113"), A122("WT-01 tag in toilet 113")], bands: tileL1(), base: tileBase, status: "wall-not-traced", conflicts: [tileBaseConflict], note: "Toilet 113's walls aren't traced in the model." })),
  rec({ id: "wf-l1-113-south", level: "L1", room: "113", title: "Toilet 113 - south wall", evidence: [view(A103, 2, "TLT 113 - SOUTH"), A21("1/A2.1 Toilet 113")], bands: [], base: tileBase,
    status: "wall-not-traced", conflicts: [tileBaseConflict], note: "Door wall: only the tile base is printed. Toilet 113's walls aren't traced in the model." }),
  fcr109("NORTH", 8, [band(["WT-01"], { from: "4\"", fullRun: false, note: "Tile at the shower only; its width is dimensioned EQ / EQ, not in feet." }), paint("PT-02", null)]),
  fcr109("WEST", 7, fcrTile()), fcr109("SOUTH", 6, fcrTile()), fcr109("EAST", 5, fcrTile()),
  rec({ id: "wf-l1-110-north", level: "L1", room: "110", title: "Guard 110 - north wall", evidence: [view(A101, 5, "Guard 110 - North"), A21("2/A2.1 Enlarged FCR and guard room plan")],
    bands: [band(["WT-01"], { fullRun: false, note: "Tile at the sink; height not dimensioned." })], base: { ...tileBase, printed: "Tile base: WT-01, cut to 4\"x24\"" }, status: "face-unresolved", conflicts: [tileBaseConflict],
    note: "A2.1 view 2 draws the guard room square; the model's wing is rotated and coarse, so which traced wall this face is isn't established." }),

  // ── Level 02 ──
  rec({ id: "wf-l2-206-east", level: "L2", room: "206", title: "Office / reception 206 - east wall", evidence: [A123("PT-02 tag, leaders along office 206's east wall")],
    wallIds: ["l2-elevator-west"], toward: [1383, 1045], extent: [[1417, 1001], [1417, 1080]], bands: [band(["PT-02"], { note: "Height not dimensioned." })], base: wb02FromSchedule, status: "assigned",
    note: "Office 206 has no floor finish tag on A12.3, so there is no base run to split." }),
  rec({ id: "wf-l2-210-west", level: "L2", room: "210", title: "Multipurpose room 1 210 - west wall", evidence: [A123("PT-03 tag on the kitchen / multipurpose room 1 wall"), view(A101, 18, "MPR - West")],
    wallIds: ["l2-kitchen-east"], toward: [1470, 1220], extent: [[1420, 1198], [1460, 1299]], bands: [band(["PT-03"], { note: "Height not dimensioned." })],
    base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.1 view 18", fullRun: true }, status: "assigned",
    note: "A10.1 view 18 settles the face (the multipurpose room side). It also shows the storage 209 wall and coiling counter door 209A; the storage 209 part isn't traced, so the extent is the traced kitchen / MPR 1 wall." }),
  rec({ id: "wf-l2-208-west", level: "L2", room: "208", title: "Kitchen 208 - west wall", evidence: [A123("FRP-01 tag on the kitchen west wall"), view(A101, 13, "Kitchen - West")],
    wallIds: ["l2-kitchen-west"], toward: [1320, 1250], extent: [[1277, 1138], [1277, 1325]],
    bands: [band(["FRP-01"], { height: "8' - 0\"", width: "25' - 10\"", fullRun: false, note: "Six 4'-0\" panels and one 1'-10\" panel; the traced wall is 26.1 ft." })], base: asScheduled("A10.1 view 13"), status: "assigned" }),
  rec({ id: "wf-l2-208-north", level: "L2", room: "208", title: "Kitchen 208 - north side", evidence: [A123("FRP-01 tags at the kitchen's north side (2)"), view(A101, 12, "Kitchen - North")],
    wallIds: ["l2-kitchen-north"], toward: [1310, 1170], bands: [band(["FRP-01"], { height: "8' - 0\"", width: "14' - 1\"", fullRun: false, note: "Three 4'-0\" panels and one 2'-1\" panel." })],
    base: asScheduled("A10.1 view 12"), status: "extent-unresolved",
    note: "The kitchen's north side steps: the traced north wall runs about 9 ft to storage 209, and storage 209's south wall (about 11.7 ft) isn't traced. The elevation's 14'-1\" of panels matches neither, so where it runs isn't resolved." }),
  rec({ id: "wf-l2-215-niche", level: "L2", room: "215", title: "Activity 1 215 - north niche side walls", evidence: [A123("Two PT-02 tags at the corner piers of activity 1's north wall"), view(A101, 11, "Activity 1 / Gameroom - North")],
    bands: [band(["PT-02"], { fullRun: false, note: "Per A12.3." }), band(["PT-03"], { fullRun: false, note: "Per A10.1 view 11 ('side wall: PT-03')." })], status: "wall-not-traced",
    conflicts: ["A12.3 tags the niche side walls PT-02; A10.1 view 11 calls them 'side wall: PT-03'. Not resolved.", "A10.1 view 11 calls the niche ceiling PT-03; A3.2 tags that band GWB-1 7'-6\" with PT-08. Not resolved."],
    note: "The side walls are the faces of the corner piers (x ≈ 1566 and 1700 on A12.3); they aren't traced." }),
  rec({ id: "wf-l2-213-niche", level: "L2", room: "213", title: "Game room 213 - west niche side walls", evidence: [A123("Two PT-02 tags at the piers on the game room's west wall"), view(A101, 10, "Activity 1 / Gameroom - West")],
    bands: [band(["PT-02"], { fullRun: false, note: "Per A12.3." }), band(["PT-03"], { fullRun: false, note: "Per A10.1 view 10 ('side wall: PT-03')." })], status: "wall-not-traced",
    conflicts: ["A12.3 tags the niche side walls PT-02; A10.1 view 10 calls them 'side wall: PT-03'. Not resolved.", "A10.1 view 10 calls the niche ceiling PT-03; A3.2 tags that soffit GWB-1 7'-6\" with PT-08. Not resolved."],
    note: "The side walls are the faces of the piers at y ≈ 877 and 955 on A12.3, 11'-0\" apart on the elevation; they aren't traced." }),
  rec({ id: "wf-l2-213-south", level: "L2", room: "213", title: "Game room 213 - south wall", evidence: [A123("PT-03 tag on the game room's angled south wall"), view(A101, 8, "Activity 1 / Gameroom - South")],
    bands: [band(["PT-03"], { fullRun: false })], status: "wall-not-traced",
    note: "Leaders run along the angled south wall from about (1612, 1018) to the east corner; the model shows storefront there (l2-game-storefront). A10.1 view 8 shows a solid wall beside the glazing, with no paint tag." }),
  rec({ id: "wf-l2-200-north", level: "L2", room: "200", title: "Circulation 200 - north wall", evidence: [view(A102, 4, "Second Floor Corridor - North")],
    wallIds: ["l2-toilets-south", "l2-office-south", "l2-elevator-south"], toward: [1250, 1120], bands: [band(["PT-03"], { fullRun: false }), band(["PT-03B"], { fullRun: false })],
    base: { tag: "WB-03", printed: "Wall base: WB-03", basis: "A10.2 view 4, under the PT-03 band at the drinking fountain; 'wall base as scheduled' elsewhere", fullRun: false }, status: "graphic", note: graphic }),
  toilet("203", "north", 18, "TLT 205 - North", "l2-yard-south", [[1180, 997], [1229, 997]], [1204, 1050], true, [titleSwap]),
  toilet("203", "west", 19, "TLT 203 - West", "l2-it-toilet", [[1180, 997], [1180, 1097]], [1204, 1050], false),
  toilet("203", "east", 17, "TLT 203 - East", "l2-toilets", [[1229, 997], [1229, 1097]], [1204, 1050], false),
  toilet("204", "north", 21, "TLT 204 - North", "l2-yard-south", [[1229, 997], [1287, 997]], [1258, 1050], true),
  toilet("204", "west", 22, "TLT 204 - West", "l2-toilets", [[1229, 997], [1229, 1097]], [1258, 1050], false),
  toilet("204", "east", 20, "TLT 204 - East", "l2-toilet-205-wall", [[1287, 997], [1287, 1097]], [1258, 1050], false),
  toilet("205", "north", 24, "TLT 203 - North", "l2-closet-wall", [[1287, 1034], [1350, 1034]], [1318, 1066], true, [titleSwap]),
  toilet("205", "west", 25, "TLT 205 - West", "l2-toilet-205-wall", [[1287, 1034], [1287, 1097]], [1318, 1066], false),
  toilet("205", "east", 23, "TLT 205 - East", "l2-office-west", [[1350, 1034], [1350, 1097]], [1318, 1066], false),
];

/** Tags on the finish plans and elevations that aren't wall-face finishes, and why. */
export const excludedFinishTags: { level: LevelId; tag: string; source: string; count: number; reason: string }[] = [
  { level: "L1", tag: "PT-07", source: "A12.2", count: 4, reason: "Column paint on the lobby and fitness columns; columns aren't wall faces." },
  { level: "L1", tag: "WF-01", source: "A12.2", count: 1, reason: "Window film on the fitness storefront: glazing." },
  { level: "L1", tag: "WF-01", source: "A10.1 views 2, 3; A10.2 view 1", count: 3, reason: "Window film on storefront: glazing." },
  { level: "L1", tag: "CGD-01", source: "A12.2", count: 4, reason: "Corner guards: accessories at corners, not finish runs." },
  { level: "L2", tag: "CGD-01", source: "A12.3", count: 4, reason: "Corner guards: accessories at corners, not finish runs." },
  { level: "L2", tag: "PL-04", source: "A10.1 views 10, 11", count: 2, reason: "Plastic laminate casework, not a wall finish." },
  { level: "L2", tag: "SSM-01", source: "A10.1 views 10, 11", count: 2, reason: "Counter and backsplash, not a wall finish." },
];

/** What the sources leave open, stated once. */
export const wallFinishGaps: string[] = [
  "A12.2 and A12.3 general note C: floor and wall finishes not noted on the plans are in a room finish schedule. That schedule isn't in the drawing set, so faces nothing names stay 'not noted'; no field paint is assumed.",
  "Elevations name walls by room and direction. A10.x and A2.x views are separate drawings, so a view is tied to a face only by its title and its A2.1 marker, never by a sheet transform.",
  "A2.1 view 2 (family restroom 109 and guard 110) is drawn square while the model's east wing is rotated; those faces stay unresolved.",
  "Areas are given only where a band's height and its run (a printed width, or the traced extent of a face it covers fully) are both dimensioned.",
];
