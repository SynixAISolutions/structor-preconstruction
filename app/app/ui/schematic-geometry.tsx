import * as THREE from "three";
import { isSportsFloor } from "./schematic-scene";
import { glazingPlacement, placedGlazingElevation } from "../../lib/glazing-detail-references";
import { edgesIntersect, footprintValid, openOutline, polygonArea, type Point, type SchematicLevel } from "../../lib/schematic-model";
import { inside, insideRoom, type Room } from "../../lib/room-detection";
import { stairPieces } from "../../lib/stair-detection";
import type { FloorAssemblySelection, FloorSurface } from "../../lib/schematic-floor-details";
import { layerColor, layerGap, layerSlabs, openedCenter, type WallLayer } from "../../lib/wall-assemblies";

export { footprintValid, openOutline } from "../../lib/schematic-model";

export type SheetFrame = { width: number; height: number };
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
  // Which wall each instance is, by its index in level.walls, so a click on the model finds the wall.
  mesh.userData.walls = (level.walls ?? []).flatMap((w, i) => w.excluded ? [] : [i]);
  return mesh;
}
/**
 * One wall, opened into its layers (lib/wall-assemblies): a slab per layer at the wall's length and the level's height,
 * coloured by what it's made of, placed where schematicWalls places the wall. Each slab's userData holds its place across the
 * wall closed and opened (local z, feet) and its layer number; the view slides it from one to the other. A violet outline
 * keeps the wall's own place. Without layers, the wall alone, highlighted.
 */
export function wallLayerGroup(level: SchematicLevel, index: number, layers: WallLayer[], diagram = false): THREE.Group | null {
  const wall = level.walls?.[index];
  if (!wall) return null;
  const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], length = Math.max(Math.hypot(dx, dy), .01), thick = Math.max(wall.thickness, .05);
  const group = new THREE.Group();
  group.position.set((wall.a[0] + wall.b[0]) / 2, level.height / 2, -(wall.a[1] + wall.b[1]) / 2);
  group.rotation.set(0, Math.atan2(dy, dx), 0);
  group.userData = { length, height: level.height, gap: 0 };
  const envelope = new THREE.BoxGeometry(length, level.height, thick);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(envelope), new THREE.LineBasicMaterial({ color: "#7c3aed" }));
  envelope.dispose();
  group.add(outline);
  if (!layers.length) {
    const whole = new THREE.Mesh(new THREE.BoxGeometry(length, level.height, thick), new THREE.MeshStandardMaterial({ color: "#a78bfa", roughness: .8 }));
    whole.userData.whole = true; group.add(whole);
    return group;
  }
  const slabs = diagram ? [] : layerSlabs(layers, wall.thickness);
  const gap = layerGap(length);
  group.userData.gap = gap;
  layers.forEach((layer, i) => {
    const slab = slabs[i], center = slab?.center ?? 0;
    const geometry = slab ? new THREE.BoxGeometry(length, level.height, slab.depth) : new THREE.PlaneGeometry(length, level.height);
    const mesh = new THREE.Mesh(geometry,
      new THREE.MeshStandardMaterial({ color: layerColor(layer.material), roughness: .85, side: THREE.DoubleSide }));
    mesh.position.z = center;
    mesh.userData = { layer: i, axis: "z", closed: center, opened: openedCenter({ center }, i, layers.length, gap) };
    group.add(mesh);
  });
  return group;
}
/** Door height used until the door schedule supplies each door's own (most doors are 7'-0"). */
export const DEFAULT_DOOR_HEIGHT = 7;
/**
 * Swings get a leaf and a header. Tagged gaps get only a clickable marker at the floor.
 */
export function schematicDoors(level: SchematicLevel, doorHeight = DEFAULT_DOOR_HEIGHT): THREE.Group | null {
  const doors = (level.doors ?? []).flatMap((door, index) => door.kind === "door" && !door.excluded ? [{ door, index }] : []);
  if (!doors.length) return null;
  const group = new THREE.Group(), place = new THREE.Object3D();
  const box = (a: Point, b: Point, base: number, height: number, thickness: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    place.position.set((a[0] + b[0]) / 2, base + height / 2, -(a[1] + b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), height, thickness);
    place.updateMatrix(); return place.matrix.clone();
  };
  const openings = doors.filter(({ door }) => door.basis === "tagged-gap");
  const swings = doors.filter(({ door }) => door.basis !== "tagged-gap");
  const heights = swings.map(({ door, index }) => ({ door, index, height: Math.min(level.height, door.scheduledSize?.height ?? doorHeight) }));
  const above = heights.filter(({ height }) => height < level.height);
  if (above.length) {
    const headers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#d8d1c4", roughness: .9 }), above.length);
    above.forEach(({ door, height }, i) => headers.setMatrixAt(i, box(door.a, door.b, height, level.height - height, door.thickness)));
    headers.userData = { levelId: level.id, doors: above.map(({ index }) => index) };
    headers.instanceMatrix.needsUpdate = true; group.add(headers);
  }
  const leaves = heights.flatMap(({ door, index, height }) => door.hinges.flatMap((hinge, i) => {
    const open = door.openTo[i];
    return open ? [{ hinge, open, index, height }] : [];
  }));
  if (leaves.length) {
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#a16e46", roughness: .7 }), leaves.length);
    leaves.forEach(({ hinge, open, height }, i) => panels.setMatrixAt(i, box(hinge, open, 0, height, .15)));
    panels.userData = { levelId: level.id, doors: leaves.map(({ index }) => index) };
    panels.instanceMatrix.needsUpdate = true; group.add(panels);
  }
  if (openings.length) {
    const markers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#917041" }), openings.length);
    openings.forEach(({ door }, i) => markers.setMatrixAt(i, box(door.a, door.b, .06, .04, Math.max(.25, door.thickness))));
    markers.userData = { levelId: level.id, doors: openings.map(({ index }) => index) };
    markers.instanceMatrix.needsUpdate = true;
    group.add(markers);
  }
  return group;
}
/** Glazing uses the plan run and the matching frame elevation when its size is supported. */
export function schematicGlazing(level: SchematicLevel, viewLimit = Infinity): THREE.InstancedMesh | null {
  const glass = (level.glazing ?? []).flatMap((run, index) => {
    if (run.excluded || placedGlazingElevation(run, level)) return [];
    const { base, height } = glazingPlacement(run, level);
    return base < viewLimit ? [{ run, index, base, height: Math.min(height, viewLimit - base) }] : [];
  });
  if (!glass.length) return null;
  const place = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#7cc4e8", transparent: true, opacity: .45, roughness: .1 }), glass.length);
  glass.forEach(({ run: g, base, height }, i) => {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
    place.position.set((g.a[0] + g.b[0]) / 2, base + height / 2, -(g.a[1] + g.b[1]) / 2);
    place.rotation.set(0, Math.atan2(dy, dx), 0);
    place.scale.set(Math.max(Math.hypot(dx, dy), .01), height, .15);
    place.updateMatrix(); mesh.setMatrixAt(i, place.matrix);
  });
  mesh.userData = { levelId: level.id, glazing: glass.map(({ index }) => index) };
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  return mesh;
}
/** Visible elevation faces, with no manufactured profile depth. Each instance points to its source part. */
export function schematicGlazingParts(level: SchematicLevel, viewLimit = Infinity): THREE.InstancedMesh[] {
  const faces = (level.glazing ?? []).flatMap((run, index) => {
    if (run.excluded) return [];
    const elevation = placedGlazingElevation(run, level);
    if (!elevation) return [];
    const { base } = glazingPlacement(run, level);
    const dx = run.b[0] - run.a[0], dy = run.b[1] - run.a[1], length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    return elevation.parts.flatMap((part, partIndex) => {
      const bottom = base + part.y, height = Math.min(part.height, viewLimit - bottom);
      if (height <= 0) return [];
      const offset = (part.x + part.width / 2 - elevation.width / 2) / length;
      const x = (run.a[0] + run.b[0]) / 2 + dx * offset;
      const z = -((run.a[1] + run.b[1]) / 2 + dy * offset);
      return [{ x, y: bottom + height / 2, z, width: part.width, height, angle, index, partIndex, pane: part.kind === "Pane" }];
    });
  });
  const place = new THREE.Object3D();
  return [...Map.groupBy(faces, face => face.pane)].map(([pane, instances]) => {
    const material = new THREE.MeshStandardMaterial(pane ?
      { color: "#7cc4e8", transparent: true, opacity: .45, roughness: .1, depthWrite: false, side: THREE.DoubleSide } :
      { color: "#87919a", roughness: .6, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, instances.length);
    instances.forEach((face, i) => {
      place.position.set(face.x, face.y, face.z);
      place.rotation.set(0, face.angle, 0);
      place.scale.set(face.width, face.height, 1);
      place.updateMatrix();
      mesh.setMatrixAt(i, place.matrix);
    });
    mesh.userData = { levelId: level.id, glazing: instances.map(face => face.index), glazingParts: instances.map(face => face.partIndex) };
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    return mesh;
  });
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
 * level below has no floor. Nested rooms and stair wells cut holes in their surrounding floors.
 */
export function schematicRoomFloors(rooms: FloorSurface[], openings: Point[][] = []): THREE.Group | null {
  if (rooms.every(room => room.open)) return null;
  const group = new THREE.Group();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  for (const [index, room] of rooms.entries()) {
    if (room.open) continue;
    const sports = isSportsFloor(room), color = sports ? "#d8af6d" : room.name ? "#e2d9cc" : "#c7d0d2";
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: .9, side: THREE.DoubleSide });
      materials.set(color, material);
    }
    const shape = new THREE.Shape(room.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const roomHoles = room.holes ?? [];
    const boundaries = [room.outline, ...roomHoles];
    // Triangulation needs separate rings. Only cut a stair well wholly in the surrounding floor.
    const stairWells = room.structural ? [] : openings.filter(well => well.every(p => insideRoom(p, room)) &&
      !roomHoles.some(hole => hole.some(p => inside(p, well))) &&
      !boundaries.some(ring => ring.some((a, i) => well.some((c, j) =>
        edgesIntersect(a, ring[(i + 1) % ring.length], c, well[(j + 1) % well.length]),
      ))));
    for (const hole of [...roomHoles, ...stairWells]) {
      shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geometry, material);
    floor.position.y = room.structural ? .02 : .05;
    floor.userData.floorIndex = index;
    group.add(floor);
  }
  return group;
}
/** Use the same room surface and voids as the selectable model floor. */
export function floorLayerGroup(geometry: THREE.ShapeGeometry, assembly: FloorAssemblySelection | null): THREE.Group {
  const group = new THREE.Group();
  const layers = assembly?.layers ?? [];
  const shape = geometry.parameters.shapes;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const gap = Math.min(9, Math.max(1.5, Math.max(size.x, size.z) / 7));
  if (!layers.length) {
    const mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial({ color: "#a78bfa", side: THREE.DoubleSide, roughness: .85 }));
    mesh.userData.whole = true;
    group.add(mesh);
    return group;
  }
  let top = 0;
  for (const [index, layer] of layers.entries()) {
    const depth = assembly?.basis === "matched" && !layer.minimum ? layer.thicknessFeet ?? 0 : 0;
    top -= depth;
    const meshGeometry = depth ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2) : geometry.clone();
    const mesh = new THREE.Mesh(meshGeometry,
      new THREE.MeshStandardMaterial({ color: layerColor(layer.material), side: THREE.DoubleSide, roughness: .85 }));
    mesh.position.y = top;
    mesh.userData = { layer: index, axis: "y", closed: top, opened: top - index * gap };
    group.add(mesh);
  }
  group.userData.spread = (layers.length - 1) * gap;
  return group;
}

/** Count and total centerline length of a level's walls; null for a model built before walls were read. */
export function wallTotals(level: SchematicLevel): { count: number; feet: number; doors: number | null; compartments: number; glassFeet: number | null; partitionFeet: number | null; railingFeet: number | null; columns: number | null; stairs: number | null } | null {
  if (!level.walls) return null;
  const doors = level.doors?.filter(door => !door.excluded) ?? null, walls = level.walls.filter(w => !w.excluded);
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
