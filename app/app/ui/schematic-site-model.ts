import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { FloorSurface } from "../../lib/schematic-floor-details";
import { footprintValid, levelFootprints, stairRise, type SchematicModel } from "../../lib/schematic-model";
import { addSchematicPlanGeometry, disposeSchematicGroup, schematicGeometry } from "./schematic-geometry";

const METRES_PER_FOOT = .3048;

/** Bake the plan's reflected Z convention into core glTF primitives. Google Maps does not load instancing extensions. */
function bakeMesh(mesh: THREE.Mesh, toMeters: THREE.Matrix4, buckets: Map<string, { material: THREE.MeshStandardMaterial; parts: THREE.BufferGeometry[] }>) {
  const material = mesh.material;
  // Skip viewer-only marks for tagged door openings.
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const key = [material.color.getHex(), material.roughness, material.metalness, material.opacity, material.transparent, material.side].join(":");
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { material, parts: [] };
    buckets.set(key, bucket);
  }
  const base = new THREE.Matrix4().multiplyMatrices(toMeters, mesh.matrixWorld);
  const instance = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  const instanced = mesh instanceof THREE.InstancedMesh;
  for (let i = 0; i < (instanced ? mesh.count : 1); i++) {
    if (instanced) mesh.getMatrixAt(i, instance);
    transform.multiplyMatrices(base, instance);
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.deleteAttribute("uv");
    geometry.applyMatrix4(transform);
    if (transform.determinant() < 0) {
      // Reflecting Z reverses triangle winding. The normals were transformed above.
      for (const attribute of [geometry.attributes.position, geometry.attributes.normal]) {
        const values = attribute.array;
        for (let j = 0; j < values.length; j += 9) {
          for (let axis = 0; axis < 3; axis++) {
            const a = j + 3 + axis, b = j + 6 + axis;
            [values[a], values[b]] = [values[b], values[a]];
          }
        }
      }
    }
    bucket.parts.push(geometry);
  }
}

/** The address anchors the centre of the first aligned above-grade plan. The viewer's cutaway is independent. */
export async function schematicSiteGlb(model: SchematicModel, floors: ReadonlyMap<string, FloorSurface[]>): Promise<ArrayBuffer> {
  const levels = model.levels.filter(level => !level.alignmentUnverified);
  const grade = levels.filter(level => level.order > 0).reduce<typeof levels[number] | undefined>(
    (lowest, level) => !lowest || level.order < lowest.order ? level : lowest, undefined);
  if (!grade) throw new Error("An aligned above-grade plan is needed to place the building.");

  const plan = new THREE.Box3();
  for (const [x, y] of levelFootprints(grade).flat()) plan.expandByPoint(new THREE.Vector3(x, 0, -y));
  if (plan.isEmpty()) throw new Error("The ground-level plan needs a footprint to place the building.");
  const center = plan.getCenter(new THREE.Vector3());
  const toMeters = new THREE.Matrix4().makeScale(METRES_PER_FOOT, METRES_PER_FOOT, -METRES_PER_FOOT)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -grade.elevation, -center.z));
  const source = new THREE.Group();
  const result = new THREE.Group();
  const buckets = new Map<string, { material: THREE.MeshStandardMaterial; parts: THREE.BufferGeometry[] }>();
  try {
    for (const level of levels) {
      const storey = new THREE.Group();
      source.add(storey);
      storey.position.y = level.elevation;
      addSchematicPlanGeometry(storey, level, floors.get(level.id) ?? [], stairRise(model, level));
      if (!storey.children.length) {
        for (const outline of levelFootprints(level).filter(footprintValid)) {
          storey.add(new THREE.Mesh(schematicGeometry({ ...level, outline }),
            new THREE.MeshStandardMaterial({ color: "#c6c7cc", roughness: .9 })));
        }
      }
    }
    source.updateMatrixWorld(true);
    source.traverse(object => {
      if (object instanceof THREE.Mesh) bakeMesh(object, toMeters, buckets);
    });
    for (const { material, parts } of buckets.values()) {
      const geometry = mergeGeometries(parts);
      if (!geometry) throw new Error("The drawing model could not be prepared for the site map.");
      const indexed = mergeVertices(geometry, 1e-6);
      geometry.dispose();
      result.add(new THREE.Mesh(indexed, material));
    }
    if (!result.children.length) throw new Error("Build a drawing model to show the building on the map.");
    const glb = await new GLTFExporter().parseAsync(result, { binary: true });
    if (!(glb instanceof ArrayBuffer)) throw new Error("The map needs a binary 3D model.");
    return glb;
  } finally {
    for (const { parts } of buckets.values()) parts.forEach(part => part.dispose());
    result.children.forEach(mesh => (mesh as THREE.Mesh).geometry.dispose());
    disposeSchematicGroup(source);
  }
}
