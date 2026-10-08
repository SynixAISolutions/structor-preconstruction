import type { ModelObject } from "../../lib/model";

/** Shared by the renderer and its count: unknown ceiling heights are never placed in 3D. */
export function isObjectDrawn(object: ModelObject, options: { walls: boolean; ceilings: boolean; isolated: string }) {
  return (!options.isolated || object.id === options.isolated)
    && (options.walls || !["wall", "glass"].includes(object.kind))
    && (options.ceilings || object.kind !== "ceiling")
    && (!object.ceiling || object.ceiling.elevationFt !== null);
}
