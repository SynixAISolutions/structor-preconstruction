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
