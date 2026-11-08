import * as THREE from "three";
import { polygonArea, type Point, type SchematicLevel } from "../../lib/schematic-model";
import { inside, type Room } from "../../lib/room-detection";
import { stairPieces } from "../../lib/stair-detection";

export type SheetFrame = { width: number; height: number };
export function openOutline(points: Point[]): Point[] {
  const first = points[0], last = points.at(-1);
  return points.length > 3 && first[0] === last![0] && first[1] === last![1] ? points.slice(0, -1) : points;
}
export function printedSheetFrame(sizing: string, widthIn: number, heightIn: number): SheetFrame | null {
  const scale = Number(sizing.match(/^Printed scale, ([\d.]+) ft per inch$/)?.[1]);
  return scale > 0 && widthIn > 0 && heightIn > 0 ? { width: widthIn * scale, height: heightIn * scale } : null;
}
export function alignSheetFrame(point: Point, fraction: Point): SheetFrame {
  if (!point.every(v => Number.isFinite(v) && v > 0) || !fraction.every(v => Number.isFinite(v) && v > .001 && v <= 1)) throw new Error("Choose a corner away from the sheet edges, then click its matching position.");
  const frame = { width: point[0] / fraction[0], height: point[1] / fraction[1] };
  if (frame.width > 100000 || frame.height > 100000) throw new Error("That alignment is too large. Choose the matching plan corner again.");
  return frame;
}
export function sheetPoint(fraction: Point, frame: SheetFrame): Point {
  return fraction.map((f, i) => Math.round(Math.max(0, Math.min(1, f)) * (i ? frame.height : frame.width) * 10) / 10) as Point;
}
export function footprintValid(points: Point[]): boolean {
  points = openOutline(points);
  if (points.length < 3 || points.some(p => !p.every(Number.isFinite)) || polygonArea(points) < 1) return false;
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) {
      if (Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) && Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))) return false;
    }
  }
  return true;
}
export function schematicShape(level: SchematicLevel) {
  if (!footprintValid(level.outline)) throw new Error(`${level.name}: correct the outline's crossing edges or collapsed footprint before viewing it in 3D.`);
  const shape = new THREE.Shape(openOutline(level.outline).map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath(); return shape;
}
export function schematicGeometry(level: SchematicLevel) {
  const geometry = new THREE.ExtrudeGeometry(schematicShape(level), { depth: level.height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2); return geometry;
}
/**
 * The walls the app read from the plan's own lines (level.walls) as one instanced mesh of boxes: each runs
 * along its centerline with its thickness, full level height. Plan y is -z here, as for the outline; the scene's group
 * flips z, so the building isn't shown mirrored.
 */
export function schematicWalls(level: SchematicLevel): THREE.InstancedMesh | null {
  const walls = (level.walls ?? []).filter(w => !w.excluded); // the estimator marked the rest not a wall
  if (!walls.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#d8d1c4", roughness: .9 }), walls.length);
  const place = new THREE.Object3D();
  walls.forEach((wall, i) => {
    const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1];
    place.position.set((wall.a[0] + wall.b[0]) / 2, level.height / 2, -(wall.a[1] + wall.b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), level.height, Math.max(wall.thickness, .05));
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
/** Door height used until the door schedule supplies each door's own (most doors are 7'-0"). */
export const DEFAULT_DOOR_HEIGHT = 7;
/**
 * A level's doors (level.doors, kind "door") as two instanced meshes: the header above each opening,
 * up to the level's height, at the host wall's thickness; and each leaf as a thin panel, standing open.
 */
export function schematicDoors(level: SchematicLevel, doorHeight = DEFAULT_DOOR_HEIGHT): THREE.Group | null {
  const doors = (level.doors ?? []).filter(d => d.kind === "door");
  if (!doors.length) return null;
  const group = new THREE.Group(), place = new THREE.Object3D();
  const box = (a: Point, b: Point, base: number, height: number, thickness: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    place.position.set((a[0] + b[0]) / 2, base + height / 2, -(a[1] + b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), height, thickness);
    place.updateMatrix(); return place.matrix.clone();
  };
  const above = Math.max(level.height - doorHeight, 0);
  if (above > 0) {
    const headers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#d8d1c4", roughness: .9 }), doors.length);
    doors.forEach((d, i) => headers.setMatrixAt(i, box(d.a, d.b, doorHeight, above, d.thickness)));
    headers.instanceMatrix.needsUpdate = true; group.add(headers);
  }
  const leaves = doors.flatMap(d => d.hinges.map((h, i) => [h, d.openTo[i]] as [Point, Point]));
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#9a6b3f", roughness: .7 }), leaves.length);
  leaves.forEach(([h, open], i) => panels.setMatrixAt(i, box(h, open, 0, doorHeight, .15)));
  panels.instanceMatrix.needsUpdate = true; group.add(panels);
  return group;
}
/** Glass is drawn up to 10 ft (a storefront's usual head), or the level's height if lower. */
export const GLASS_HEIGHT = 10;
/** A level's glass (level.glazing) as one instanced mesh of thin translucent panels from the floor. */
export function schematicGlazing(level: SchematicLevel): THREE.InstancedMesh | null {
  const glass = (level.glazing ?? []).filter(g => !g.excluded);
  if (!glass.length) return null;
  const height = Math.min(level.height, GLASS_HEIGHT), place = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#7cc4e8", transparent: true, opacity: .45, roughness: .1 }), glass.length);
  glass.forEach((g, i) => {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
    place.position.set((g.a[0] + g.b[0]) / 2, height / 2, -(g.a[1] + g.b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), height, .15);
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
/** Operable partitions are drawn up to 10 ft, or the level's height if lower, until their printed height is read (Project 1's are 9'-8" and 10'-0"). */
export const PARTITION_HEIGHT = 10;
/** A level's operable partitions (level.partitions) as one instanced mesh of panels from the floor, darker than the walls. */
export function schematicPartitions(level: SchematicLevel): THREE.InstancedMesh | null {
  const partitions = (level.partitions ?? []).filter(p => !p.excluded && p.kind !== "railing");
  if (!partitions.length) return null;
  const height = Math.min(level.height, PARTITION_HEIGHT), place = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#8f7f9e", roughness: .8 }), partitions.length);
  partitions.forEach((p, i) => {
    const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1];
    place.position.set((p.a[0] + p.b[0]) / 2, height / 2, -(p.a[1] + p.b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), height, Math.max(p.thickness, .05));
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
/** Guardrails are drawn 42" high, the height codes usually call for, until a printed height is read. */
export const RAILING_HEIGHT = 3.5;
/** A level's guardrails (level.partitions, kind "railing") as one instanced mesh of thin panels from the floor. */
export function schematicRailings(level: SchematicLevel): THREE.InstancedMesh | null {
  const rails = (level.partitions ?? []).filter(p => !p.excluded && p.kind === "railing");
  if (!rails.length) return null;
  const height = Math.min(level.height, RAILING_HEIGHT), place = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#5b6770", roughness: .5 }), rails.length);
  rails.forEach((r, i) => {
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1];
    place.position.set((r.a[0] + r.b[0]) / 2, height / 2, -(r.a[1] + r.b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), height, Math.max(r.thickness, .05));
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
/** A level's columns (level.columns) as one instanced mesh of boxes, full level height. */
export function schematicColumns(level: SchematicLevel): THREE.InstancedMesh | null {
  const columns = (level.columns ?? []).filter(c => !c.excluded);
  if (!columns.length) return null;
  const place = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#3f4a4f", roughness: .6 }), columns.length);
  columns.forEach((c, i) => {
    place.position.set(c.at[0], level.height / 2, -c.at[1]);
    place.rotation.set(0, c.angle, 0);
    place.scale.set(c.width, level.height, c.depth);
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
/**
 * The stairs arriving at a level (level.stairs, lib/stair-detection stairPieces) as one instanced mesh of treads and landings,
 * in the level's frame: from its floor (0) down `rise` to the floor below. Also where the level's floor is open over them.
 */
export function schematicStairs(level: SchematicLevel, rise: number | null): { mesh: THREE.InstancedMesh; openings: Point[][] } | null {
  if (!rise) return null;
  const pieces = (level.stairs ?? []).filter(s => !s.excluded).map(s => stairPieces(s.flights, rise)).filter(p => p !== null);
  const boxes = pieces.flatMap(p => [...p.treads, ...p.landings]);
  if (!boxes.length) return null;
  const place = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#b8b1a4", roughness: .85 }), boxes.length);
  boxes.forEach((b, i) => {
    place.position.set(b.at[0], b.top - b.thickness / 2, -b.at[1]);
    place.rotation.set(0, Math.atan2(b.along[1], b.along[0]), 0);
    place.scale.set(Math.max(b.length, .01), b.thickness, Math.max(b.width, .01));
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return { mesh, openings: pieces.flatMap(p => p.openings) };
}
/**
 * A level's rooms (levelSpaces) as flat floors just above the slab: named rooms warm, unnamed spaces grey. A space open to the
 * level below has no floor; `openings` (a stair's well) are cut from the room they lie wholly inside.
 */
export function schematicRoomFloors(rooms: Room[], openings: Point[][] = []): THREE.Group | null {
  rooms = rooms.filter(r => !r.open);
  if (!rooms.length) return null;
  const group = new THREE.Group(), named = new THREE.MeshStandardMaterial({ color: "#e6cf9f", roughness: .9, side: THREE.DoubleSide }), unnamed = new THREE.MeshStandardMaterial({ color: "#cdd8d4", roughness: .9, side: THREE.DoubleSide });
  for (const room of rooms) {
    const shape = new THREE.Shape(room.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of openings) if (hole.every(p => inside(p, room.outline))) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geometry, room.name ? named : unnamed); floor.position.y = .05; group.add(floor);
  }
  return group;
}
/** Count and total centerline length of a level's walls; null for a model built before walls were read. */
export function wallTotals(level: SchematicLevel): { count: number; feet: number; doors: number | null; compartments: number; glassFeet: number | null; partitionFeet: number | null; railingFeet: number | null; columns: number | null; stairs: number | null } | null {
  if (!level.walls) return null;
  const doors = level.doors ?? null, walls = level.walls.filter(w => !w.excluded);
  const run = (lines: { a: Point; b: Point }[]) => Math.round(lines.reduce((sum, l) => sum + Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 0));
  return {
    count: walls.length, feet: Math.round(walls.reduce((sum, w) => sum + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0)),
    doors: doors && doors.filter(d => d.kind === "door").length, compartments: doors?.filter(d => d.kind === "compartment").length ?? 0,
    glassFeet: level.glazing ? Math.round(level.glazing.filter(g => !g.excluded).reduce((sum, g) => sum + Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), 0)) : null,
    partitionFeet: level.partitions ? run(level.partitions.filter(p => !p.excluded && p.kind !== "railing")) : null,
    railingFeet: level.partitions ? run(level.partitions.filter(p => !p.excluded && p.kind === "railing")) : null,
    columns: level.columns ? level.columns.filter(c => !c.excluded).length : null,
    stairs: level.stairs ? level.stairs.filter(s => !s.excluded).length : null,
  };
}
