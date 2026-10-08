import { BoxGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ModelObject } from "../../lib/model";

/** Keep the traced hinge and swing direction; display the scheduled panel width. */
export function doorLeafGeometry(object: ModelObject) {
  if (!object.door?.leaves.length) return null;
  const parts = object.door.leaves.map(leaf => {
    const angle = Math.atan2(leaf.tip[1] - leaf.hinge[1], leaf.tip[0] - leaf.hinge[0]);
    const width = object.door!.row.widthIn === null ? leaf.lengthFt : object.door!.row.widthIn / 12;
    const geometry = new BoxGeometry(width, object.height, object.thickness);
    geometry.rotateY(-angle);
    geometry.translate(leaf.hinge[0] + Math.cos(angle) * width / 2, 0, leaf.hinge[1] + Math.sin(angle) * width / 2);
    return geometry;
  });
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return geometry;
}
