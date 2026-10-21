import * as THREE from "three";
import { polygonArea, type Point, type SchematicLevel } from "../../lib/schematic-model";

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
 * along its centerline with its thickness, full level height. Plan y is world -z, as for the outline.
 */
export function schematicWalls(level: SchematicLevel): THREE.InstancedMesh | null {
  const walls = level.walls ?? [];
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
/** Count and total centerline length of a level's walls; null for a model built before walls were read. */
export function wallTotals(level: SchematicLevel): { count: number; feet: number } | null {
  if (!level.walls) return null;
  return { count: level.walls.length, feet: Math.round(level.walls.reduce((sum, w) => sum + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0)) };
}
