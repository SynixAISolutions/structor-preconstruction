import * as THREE from "three";
import type { Room } from "../../lib/room-detection";

type LocatedPick = { levelId: string; index: number };
export type WallPick = LocatedPick & { kind: "wall"; layer?: number };
export type DoorPick = LocatedPick & { kind: "door" };
export type FloorPick = LocatedPick & { kind: "floor" };
export type GlazingPick = LocatedPick & { kind: "glazing"; part?: number };
export type SchematicPick = WallPick | DoorPick | FloorPick | GlazingPick;

export const CUTAWAY_HEIGHT = 5;

export function isSportsFloor(room: Pick<Room, "name" | "open">): boolean {
  const name = room.name.replace(/\s*\([^)]*\)/g, " ").trim();
  return !room.open && /^(?:(?:main|auxiliary)\s+)?(?:gym(?:nasium)?|(?:basketball|sports?)\s+(?:court|floor|hall))(?:\s+\d+[a-z]?)?$/i.test(name);
}

export function schematicObjectPick(hit: THREE.Intersection): SchematicPick | null {
  const data = hit.object.userData;
  if (typeof data.levelId !== "string") return null;
  if (typeof data.floorIndex === "number") return { kind: "floor", levelId: data.levelId, index: data.floorIndex };
  if (hit.instanceId === undefined || hit.instanceId === data.hidden) return null;
  const wall = data.walls?.[hit.instanceId];
  if (typeof wall === "number") return { kind: "wall", levelId: data.levelId, index: wall };
  const door = data.doors?.[hit.instanceId];
  if (typeof door === "number") return { kind: "door", levelId: data.levelId, index: door };
  const glass = data.glazing?.[hit.instanceId];
  if (typeof glass !== "number") return null;
  const part = data.glazingParts?.[hit.instanceId];
  return { kind: "glazing", levelId: data.levelId, index: glass, ...(typeof part === "number" ? { part } : {}) };
}

/** Fit the projected bounds. A narrow viewer has less horizontal room than the same camera's vertical field of view. */
export function schematicCameraFit(bounds: THREE.Box3, fov: number, aspect: number, top: boolean) {
  const center = bounds.getCenter(new THREE.Vector3());
  const back = new THREE.Vector3(top ? 0 : .9, top ? 1 : 1.1, top ? .001 : 1.2).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize(), up = back.clone().cross(right);
  const vertical = Math.tan(THREE.MathUtils.degToRad(fov / 2)), horizontal = vertical * Math.max(aspect, .2);
  let distance = 12;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center);
        const screen = Math.max(Math.abs(corner.dot(right)) / horizontal, Math.abs(corner.dot(up)) / vertical);
        distance = Math.max(distance, corner.dot(back) + screen * 1.15);
      }
    }
  }
  return { center, position: center.clone().addScaledVector(back, distance) };
}
