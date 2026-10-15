"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Box, Check, CheckCircle2, ChevronDown, Compass, Eye, EyeOff, FileText, Flag, Focus, Footprints, Info, Layers3, Maximize2, Minus, MousePointer2, Plus, RotateCcw, ScanLine, Search, ShieldCheck, X } from "lucide-react";
import { allMaterials, allRooms, planVoids, sheetTransformFor, toSheetPoint } from "../../lib/jelleff-model";
import { LEVELS, MODEL_VIEWS, clearObjectReview, evidenceFor, divisionsIn, filterObjects, findObject, flagObject, reviewOf, reviewStatus, reviewSummary, roomFinishSchedule, sameAssembly, selectionTotals, setDivisionHidden, stepSelection, verifyObject, visibleObjects, type BaseBreakdownRow, type WallFinishRecord, type LevelId, type ModelErrors, type ModelObject, type ModelSource, type ModelView, type ObjectKind, type ObjectReviewStatus } from "../../lib/model";
import type { Screen } from "../../lib/screens";
import { useModelReview } from "../../lib/use-model-review";
import { usePreparedModel } from "../../lib/use-prepared-model";
import { Modal } from "./shared";
import { WalkthroughControls, type WalkDirection } from "./walkthrough-controls";
import { doorLeafGeometry } from "./door-geometry";
import { DoorRecordCard, DoorSchedulePanel } from "./door-panels";
import { CeilingCard, CeilingSchedulePanel } from "./ceiling-panels";
import { isObjectDrawn } from "./model-visibility";
import { BaseBreakdownCard, BaseRuns, WallFaceCard, WallFinishPanel, WallFinishEvidenceCard } from "./wall-finish-panels";
import { displayedFinishHeight, wallFinishColors, wallFinishDisplay } from "./wall-finish-display";
import type { ModelInspection } from "./model-quantity-rows";
import "./model-studio.css";

type StudioProps = { inspection?: ModelInspection | null; view: ModelView; projectId: string; projectName: string; navigate: (screen: Screen) => void; notify: (message: string) => void };
type ViewOptions = { view: ModelView; level: LevelId | ""; voids: boolean; cutaway: boolean; color: boolean; labels: boolean; walls: boolean; ceilings: boolean; finishes: boolean; walkthrough: boolean; selectedIds: string[]; visibleIds: string[]; isolated: string };
type ViewerHandle = { home: () => void; top: () => void; zoom: (factor: number) => void; focus: () => void; walk: (direction: WalkDirection) => void; hold: (direction: WalkDirection, down: boolean) => void; update: (options: ViewOptions) => void };
type Filters = { query: string; level: string; division: string; kind: string; review: string };

const CURRENT_USER = "Marcel Khoury";
const viewCopy: Record<ModelView, { eyebrow: string; description: string; scene: string }> = {
  interior: { eyebrow: "FINISHES, WITH CONTEXT", description: "Inspect rooms, finishes, walls, storefront and doors with quantities and drawing evidence.", scene: "Interior finish and enclosure study" },
  mep: { eyebrow: "SYSTEMS, IN THE SAME SPACE", description: "Review mechanical, plumbing, electrical and fire-protection objects with their assumed routes and properties.", scene: "MEP coordination study" },
  structural: { eyebrow: "STRUCTURE, MADE LEGIBLE", description: "Review slabs, columns and roof framing with measured quantities and explicit assumptions.", scene: "Structural system study" },
  exterior: { eyebrow: "THE ENVELOPE, EXPLAINED", description: "Inspect exterior walls, storefront and roof assemblies with their source and evidence.", scene: "Exterior envelope study" },
};
const kindLabels: Record<ObjectKind, string> = { wall: "Walls", glass: "Glazing", door: "Doors", floor: "Floor finishes", ceiling: "Ceiling zones", transition: "Transitions", slab: "Slabs", roof: "Roofs", column: "Columns", beam: "Beams", duct: "Ductwork", pipe: "Piping", equipment: "Equipment", fixture: "Fixtures" };
const statusLabel: Record<ObjectReviewStatus, string> = { unreviewed: "Not reviewed", verified: "Verified", flagged: "Needs checking" };
const interiorTakeoffKinds: { kind: ObjectKind; label: string }[] = [
  { kind: "floor", label: "Floor finishes" },
  { kind: "ceiling", label: "Ceiling zones" },
  { kind: "wall", label: "Walls" },
  { kind: "door", label: "Doors" },
  { kind: "glass", label: "Glazing" },
  { kind: "transition", label: "Transitions" },
];
const firstError = (errors: ModelErrors) => Object.values(errors)[0] ?? "Review the selected object.";
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const activityDate = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const finishPropertyLabels = new Set(["Tag", "Description", "Manufacturer", "Product", "Color / finish", "Size", "Comments", "Specification"]);
const partitionPropertyLabels = new Set(["Partition type", "Schedule", "Construction", "Height / rating", "Stud width", "Gypsum board", "Unique condition", "Rough thickness", "Fire rating", "Type basis"]);
const doorPropertyLabels = new Set(["Door", "Panels", "Panel size", "Panel material", "Glass", "Panel type", "Frame", "Fire rating", "Hardware set (A8.2)", "Details", "Comments"]);

function geometryFor(object: ModelObject) {
  const leaves = doorLeafGeometry(object);
  if (leaves) return leaves;
  if (object.shape === "polygon") {
    const shape = new THREE.Shape(object.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: object.height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
  if (object.shape === "box") return new THREE.BoxGeometry(object.thickness, object.height, object.depth);
  const [a, b] = object.points;
  return new THREE.BoxGeometry(Math.hypot(b[0] - a[0], b[1] - a[1]), object.height, object.thickness || .08);
}

function positionObject(mesh: THREE.Mesh, object: ModelObject) {
  if (object.door?.leaves.length) { mesh.position.y = object.base + object.height / 2; return; }
  if (object.shape === "polygon") { mesh.position.y = object.base; return; }
  if (object.shape === "box") { const [point] = object.points; mesh.position.set(point[0], object.base + object.height / 2, point[1]); return; }
  const [a, b] = object.points;
  mesh.position.set((a[0] + b[0]) / 2, object.base + object.height / 2, (a[1] + b[1]) / 2);
  mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function labelSprite(title: string, subtitle: string) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#ffffffee"; ctx.beginPath(); ctx.roundRect(8, 14, 496, 100, 24); ctx.fill();
  ctx.textAlign = "center"; ctx.fillStyle = "#2d4941"; ctx.font = "600 30px Arial"; ctx.fillText(title, 256, 58, 460);
  ctx.fillStyle = "#6e8079"; ctx.font = "23px Arial"; ctx.fillText(subtitle, 256, 91, 460);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(23, 5.75, 1); sprite.renderOrder = 5; return sprite;
}

function ModelCanvas({ objects, records, bases, options, onSelect, api, onError, materials }: { objects: ModelObject[]; records: WallFinishRecord[]; bases: BaseBreakdownRow[]; options: ViewOptions; onSelect: (id: string) => void; api: React.RefObject<ViewerHandle | null>; onError: (message: string) => void; materials: typeof allMaterials }) {
  const host = useRef<HTMLDivElement>(null);
  const currentOptions = useRef(options); currentOptions.current = options;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const errorRef = useRef(onError); errorRef.current = onError;
  useEffect(() => {
    const mount = host.current; if (!mount || !objects.length) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { errorRef.current("3D graphics are unavailable in this browser. Object data and source sheets remain available. Try Chrome with graphics acceleration enabled."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0xeef2f0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
    renderer.domElement.setAttribute("aria-label", options.walkthrough ? "First-person project walkthrough. Drag to look. W A S D or arrows to move, Q E to turn, R F to look up or down, Escape to exit. Click an object to inspect it." : "Interactive project model. Drag to rotate, scroll to zoom, right-drag to pan. Use the object selector for keyboard access."); renderer.domElement.tabIndex = 0; mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const planPoints = objects.flatMap(object => object.points.map(([x, z]) => new THREE.Vector3(x, object.base, z)));
    const bounds = new THREE.Box3().setFromPoints(planPoints), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 30);
    const orbitCamera = new THREE.OrthographicCamera(-span, span, span, -span, .1, 2000), walkCamera = new THREE.PerspectiveCamera(62, 1, .1, 2000);
    const camera = options.walkthrough ? walkCamera : orbitCamera;
    const controls = new OrbitControls(orbitCamera, renderer.domElement); controls.enabled = !options.walkthrough; controls.enableDamping = true; controls.dampingFactor = .09; controls.maxPolarAngle = Math.PI / 2.03; controls.minPolarAngle = .02; controls.minZoom = .45; controls.maxZoom = 80; controls.zoomToCursor = true;
    let selectionFocused = false;
    // Leave a perimeter to inspect the exterior while keeping the tour close to the model.
    const walkBounds = bounds.clone().expandByScalar(12);
    const tourLevel = options.view === "interior" && options.level === "L2" ? "L2" : "L1";
    const start = allRooms.find(room => tourLevel === "L1" ? room.id === "lobby" : room.level === "L2" && room.number === "200")?.center ?? [center.x, center.z];
    const eyeHeight = LEVELS.find(level => level.id === tourLevel)!.elevation + 5.25;
    const tourStart = options.view === "exterior" ? new THREE.Vector3(center.x, 5.25, bounds.max.z + 10) : new THREE.Vector3(start[0], eyeHeight, start[1] + (tourLevel === "L1" ? 7 : 0));
    const tour = new WalkthroughControls(walkCamera, walkBounds, tourStart, tourLevel === "L2" ? Math.PI / 2 : 0);
    function fit() { if (options.walkthrough) return; orbitCamera.zoom = 1; orbitCamera.updateProjectionMatrix(); orbitCamera.updateMatrixWorld(); let extent = 0; for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) for (const y of [-1, 30]) { const p = new THREE.Vector3(x, y, z).project(orbitCamera); extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y)); } orbitCamera.zoom = Math.min(3, .88 / Math.max(.1, extent)); orbitCamera.updateProjectionMatrix(); }
    function home() { selectionFocused = false; if (options.walkthrough) { tour.reset(); return; } orbitCamera.position.copy(center).add(new THREE.Vector3(span * .8, span * 1.15, span * 1.15)); controls.target.copy(center); controls.update(); fit(); }
    home(); scene.add(new THREE.HemisphereLight(0xffffff, 0xb0bcaf, 2.5));
    const sun = new THREE.DirectionalLight(0xfff5df, 3.4); sun.position.set(center.x - 55, 170, center.z + 65); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -220; sun.shadow.camera.right = 220; sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220; sun.shadow.camera.far = 500; sun.shadow.normalBias = .2; sun.target.position.copy(center); scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, span * 4), new THREE.MeshStandardMaterial({ color: 0xeef2f0, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, -1, center.z); ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(span * 3, 60, 0xdce3df, 0xe2e8e4); grid.position.set(center.x, -.98, center.z); scene.add(grid);
    const meshes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>(), objectById = new Map(objects.map(object => [object.id, object]));
    for (const object of objects) {
      // Unknown ceiling heights stay in the schedule, never at an invented floor-level position.
      if (object.ceiling && object.ceiling.elevationFt === null) continue;
      const assembly = materials.find(material => material.id === object.materialId)!;
      const material = new THREE.MeshStandardMaterial({ roughness: object.kind === "glass" ? .15 : object.kind === "transition" ? .4 : .76, metalness: object.kind === "transition" ? .6 : ["beam", "column", "duct", "pipe"].includes(object.kind) ? .22 : 0, transparent: object.kind === "glass", opacity: object.kind === "glass" ? .48 : 1, side: THREE.DoubleSide });
      const geometry = geometryFor(object), mesh = new THREE.Mesh(geometry, material); positionObject(mesh, object); mesh.userData.objectId = object.id; mesh.userData.color = object.ceiling?.paint?.tag === "PT-08" ? "#8ca84f" : assembly.color; mesh.castShadow = !["glass", "floor", "ceiling", "transition", "slab", "roof"].includes(object.kind); mesh.receiveShadow = true;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0x586c64, transparent: true, opacity: .2 }))); meshes.set(object.id, mesh); scene.add(mesh);
    }
    const finishMeshes = wallFinishDisplay(objects, records, bases).map(item => {
      const material = new THREE.MeshStandardMaterial({ color: wallFinishColors[item.tag] ?? "#a6b79e", roughness: .8, side: THREE.FrontSide });
      const node = item.kind === "run"
        ? new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-item.length / 2, 0, 0), new THREE.Vector3(item.length / 2, 0, 0)]), new THREE.LineBasicMaterial({ color: wallFinishColors[item.tag] ?? "#a6b79e" }))
        : new THREE.Mesh(new THREE.PlaneGeometry(item.length, item.height), material);
      if (item.kind === "run") material.dispose();
      node.position.set(item.x, item.bottom + item.height / 2, item.z); node.rotation.y = item.rotation;
      node.userData.objectId = item.wallId; scene.add(node); return { node, item };
    });
    const labelGroup = new THREE.Group(); scene.add(labelGroup);
    for (const room of allRooms.filter(room => objects.some(object => object.level === room.level))) {
      const sprite = labelSprite(room.name, room.number); if (!sprite) continue;
      sprite.position.set(room.center[0], LEVELS.find(level => level.id === room.level)!.elevation + 7, room.center[1]);
      sprite.userData.level = room.level; labelGroup.add(sprite);
    }
    const voidGroup = new THREE.Group(); scene.add(voidGroup);
    if (options.view === "interior") for (const area of planVoids) {
      const elevation = LEVELS.find(level => level.id === area.level)!.elevation;
      const points = area.points.map(([x, z]) => new THREE.Vector3(x, elevation + .08, z));
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0x947b51, dashSize: 2, gapSize: 1 }));
      outline.computeLineDistances(); voidGroup.add(outline);
      const label = labelSprite(area.name, "Level 02 · no floor");
      if (label) { const middle = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3()); label.position.set(middle.x, elevation + 1, middle.z); voidGroup.add(label); }
    }
    function update(next: ViewOptions) {
      const visible = new Set(next.visibleIds), selected = new Set(next.selectedIds);
      labelGroup.visible = next.labels && !next.isolated;
      labelGroup.children.forEach(label => { label.visible = !next.level || label.userData.level === next.level; });
      voidGroup.visible = next.view === "interior" && next.voids && !next.isolated && (!next.level || next.level === "L2");
      voidGroup.children.forEach(marker => { marker.visible = !(marker instanceof THREE.Sprite && next.walkthrough); });
      for (const [id, mesh] of meshes) {
        const object = objectById.get(id)!, chosen = selected.has(id);
        mesh.visible = visible.has(id) && isObjectDrawn(object, next);
        const source = String(mesh.userData.color), neutral = object.kind === "glass" ? "#9fc5cf" : ["beam", "column", "duct", "pipe"].includes(object.kind) ? "#a5b0b5" : "#dedfd9";
        mesh.material.color.set(chosen ? "#e8aa57" : next.color ? source : neutral);
        mesh.material.emissive.set(chosen ? "#65421b" : "#000000"); mesh.material.emissiveIntensity = chosen ? .22 : 0;
        if (object.kind === "wall") { const height = next.cutaway ? Math.min(object.height, 5) : object.height; mesh.scale.y = height / object.height; mesh.position.y = object.base + height / 2; }
      }
      for (const { node, item } of finishMeshes) {
        const wall = objectById.get(item.wallId)!, height = displayedFinishHeight(item, next.cutaway);
        node.visible = next.finishes && visible.has(wall.id) && isObjectDrawn(wall, next) && (item.kind === "run" || height > 0);
        node.material.color.set(selected.has(wall.id) ? "#e8aa57" : next.color ? wallFinishColors[item.tag] ?? "#a6b79e" : "#dedfd9");
        if (item.kind !== "run") { node.scale.y = height / item.height; node.position.y = item.bottom + height / 2; }
      }
    }
    api.current = { home, top: () => { selectionFocused = false; if (options.walkthrough) return; orbitCamera.position.copy(center).add(new THREE.Vector3(0, span * 1.8, .1)); controls.target.copy(center); controls.update(); fit(); }, zoom: factor => { orbitCamera.zoom = Math.min(80, Math.max(.45, orbitCamera.zoom * factor)); orbitCamera.updateProjectionMatrix(); }, focus: () => { const mesh = meshes.get(currentOptions.current.selectedIds[0]); if (!mesh) return; selectionFocused = true; const point = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()); if (options.walkthrough) { tour.face(point); renderer.domElement.focus({ preventScroll: true }); } else { const offset = camera.position.clone().sub(controls.target); controls.target.copy(point); camera.position.copy(point).add(offset); orbitCamera.zoom = 1; orbitCamera.updateProjectionMatrix(); controls.update(); orbitCamera.updateMatrixWorld(); const box = new THREE.Box3().setFromObject(mesh); let extent = 0; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const projected = new THREE.Vector3(x, y, z).project(orbitCamera); extent = Math.max(extent, Math.abs(projected.x), Math.abs(projected.y)); } orbitCamera.zoom = Math.min(80, .8 / Math.max(.01, extent)); orbitCamera.updateProjectionMatrix(); } }, walk: direction => { if (options.walkthrough) tour.walk(direction); }, hold: (direction, down) => { if (options.walkthrough) tour.hold(direction, down); }, update };
    update(currentOptions.current);
    const resize = () => { const width = mount.clientWidth, height = mount.clientHeight; if (!width || !height) return; renderer.setSize(width, height); const aspect = width / height; if (options.walkthrough) { walkCamera.aspect = aspect; walkCamera.updateProjectionMatrix(); } else { const half = span * .53; orbitCamera.left = -half * aspect; orbitCamera.right = half * aspect; orbitCamera.top = half; orbitCamera.bottom = -half; if (selectionFocused && currentOptions.current.selectedIds.length) api.current?.focus(); else fit(); } };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize(); const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || drag) return;
      renderer.domElement.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      if (options.walkthrough) renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
      if (options.walkthrough) tour.look(-(event.clientX - drag.x) * .003, -(event.clientY - drag.y) * .003);
      drag.x = event.clientX; drag.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const clicked = !drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 5;
      drag = null;
      if (options.walkthrough && renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (!clicked) return;
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...meshes.values(), ...finishMeshes.map(item => item.node)].filter(mesh => mesh.visible), false)[0]; selectRef.current(hit?.object.userData.objectId || "");
    };
    const cancelDrag = () => { drag = null; };
    const contextLost = (event: Event) => { event.preventDefault(); errorRef.current("The graphics connection was interrupted. Reload this page to restore the 3D view; object data and source sheets remain available."); };
    const keyDown = (event: KeyboardEvent) => { if (!options.walkthrough || event.ctrlKey || event.metaKey || event.altKey || !tour.key(event.code, true)) return; event.preventDefault(); event.stopPropagation(); };
    const keyUp = (event: KeyboardEvent) => { if (!options.walkthrough || !tour.key(event.code, false)) return; event.preventDefault(); event.stopPropagation(); };
    const stop = () => { tour.stop(); cancelDrag(); };
    const listeners = new AbortController(), signal = listeners.signal;
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", pointerDown, { signal }); canvas.addEventListener("pointermove", pointerMove, { signal }); canvas.addEventListener("pointerup", pointerUp, { signal });
    canvas.addEventListener("pointercancel", cancelDrag, { signal }); canvas.addEventListener("lostpointercapture", cancelDrag, { signal });
    canvas.addEventListener("keydown", keyDown, { signal }); canvas.addEventListener("keyup", keyUp, { signal }); canvas.addEventListener("blur", stop, { signal }); canvas.addEventListener("webglcontextlost", contextLost, { signal });
    window.addEventListener("blur", stop, { signal }); document.addEventListener("visibilitychange", stop, { signal });
    if (options.walkthrough) canvas.focus();
    let lastFrame = performance.now(), frame = 0;
    const render = (now = performance.now()) => {
      frame = requestAnimationFrame(render); const delta = (now - lastFrame) / 1000; lastFrame = now;
      if (document.hidden || !mount.clientWidth || !mount.clientHeight) { stop(); return; }
      if (options.walkthrough) tour.step(delta); else controls.update();
      renderer.render(scene, camera);
    }; render();
    return () => { cancelAnimationFrame(frame); listeners.abort(); observer.disconnect(); controls.dispose(); api.current = null; const textures = new Set<THREE.Texture>(); scene.traverse(node => { const mesh = node as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { const map = (material as THREE.MeshStandardMaterial).map; if (map) textures.add(map); material.dispose(); } }); textures.forEach(texture => texture.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [api, objects, records, bases, options.walkthrough, options.level]);
  useEffect(() => { api.current?.update(options); }, [options, api]);
  return <div className="ms-canvas" ref={host}/>;
}

function WalkButton({ direction, label, api, children }: { direction: WalkDirection; label: string; api: React.RefObject<ViewerHandle | null>; children: React.ReactNode }) {
  return <button className={direction} aria-label={label} title={`${label} (hold to move)`}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); api.current?.hold(direction, true); }}
    onPointerUp={event => { api.current?.hold(direction, false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => api.current?.hold(direction, false)} onLostPointerCapture={() => api.current?.hold(direction, false)} onBlur={() => api.current?.hold(direction, false)}
    onClick={event => { if (event.detail === 0) api.current?.walk(direction); }}>{children}</button>;
}

function SourceSheet({ source, selected, finish }: { source: ModelSource; selected?: ModelObject | null; finish?: WallFinishRecord | null }) {
  const [zoom, setZoom] = useState(1); useEffect(() => setZoom(1), [source.asset]);
  if (!source.asset) return <section className="ms-source-sheet ms-reference-only" aria-label="Source reference"><header><div><FileText size={16}/><strong>{source.sheet}</strong><span>PDF page {source.page}</span></div></header><div><span className="ms-section-label">REFERENCE ONLY</span><h3>{source.detail}</h3><p>{source.drawing} · {source.sheet} · page {source.page}</p><p>This document is referenced by the model. Its page is not loaded in the viewer.</p></div></section>;
  const transform = sheetTransformFor(source.sheet);
  const showLocation = finish
    ? !!finish.extent && !!transform?.levels.includes(finish.level) && finish.evidence.some(item => item.sheet === source.sheet)
    : !!selected && !!transform?.levels.includes(selected.level) && (source.sheet === selected.sources[0]?.sheet || selected.kind === "floor");
  const points = showLocation ? (finish?.extent ?? selected!.points).map(point => toSheetPoint(source.sheet, point)!.join(",")).join(" ") : "";
  const firstPoint = points?.split(" ")[0]?.split(",").map(Number) ?? [0, 0];

  return <section className="ms-source-sheet"><header><div><FileText size={16}/><strong>{source.sheet}</strong><span>PDF page {source.page}</span></div><div><button aria-label="Zoom out blueprint" onClick={() => setZoom(value => Math.max(1, value - .5))}><Minus size={15}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in blueprint" onClick={() => setZoom(value => Math.min(4, value + .5))}><Plus size={15}/></button><a href={source.asset} target="_blank" rel="noreferrer" aria-label="Open full source sheet"><ArrowUpRight size={16}/></a></div></header><div className="ms-source-scroll"><div className="ms-source-image" style={{ width: `${zoom * 100}%` }}><img src={source.asset} alt={`${source.sheet}: ${source.detail}. Original project drawing sheet.`}/>{showLocation && <svg viewBox={`0 0 ${transform!.imageWidth} ${transform!.imageHeight}`} aria-label="Approximate selected object location">{!finish && selected?.shape === "polygon" ? <polygon points={points} fill="#efaa4555" stroke="#e98512" strokeWidth="6"/> : !finish && selected?.shape === "box" ? <circle cx={firstPoint[0]} cy={firstPoint[1]} r="22" fill="#efaa4555" stroke="#e98512" strokeWidth="7"/> : <polyline points={points} fill="none" stroke="#ef991d" strokeWidth="12" strokeLinecap="round"/>}</svg>}</div></div><footer>{source.detail} · {source.drawing || "Project drawing"} · {showLocation ? "highlighted location is approximate" : `No location overlay for this reference on ${source.sheet}`}</footer></section>;
}

function QuantityCard({ object, base }: { object: ModelObject; base?: BaseBreakdownRow }) {
  const dimensions = [["Length", object.dimensions.lengthFt, "ft"], ["Area", object.dimensions.areaSf, "SF"], [object.ceiling ? "Gross zone boundary" : base?.accents.length ? "Gross base · all types" : object.baseTag ? `Gross base · ${object.baseTag}` : "Wall-edge run", object.dimensions.perimeterFt, "LF"], ["Height", object.dimensions.heightFt, "ft"], ["Thickness", object.dimensions.thicknessIn, "in."], ["Volume", object.dimensions.volumeCy, "CY"]] as const;
  return <div className="ms-quantity-card"><span className="ms-section-label">MEASURED FROM MODEL GEOMETRY</span><div className="ms-primary-quantity"><strong>{number.format(object.quantity.value)}</strong><span>{object.quantity.unit}</span></div>{object.door && <p className="ms-quantity-note">One opening · {object.door.leaves.length ? `${object.door.leaves.length} hinged ${object.door.leaves.length === 1 ? "leaf" : "leaves"}` : "coiling counter door"}</p>}<dl>{dimensions.filter(([, value]) => value !== null).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{number.format(value!)} {unit}</dd></div>)}</dl>{object.ceiling && <p className="ms-quantity-note">Measured zone area, including unresolved zones. Boundary length is not wall-angle or trim takeoff.</p>}{object.baseTag && <p className="ms-quantity-note">Gross wall-edge run; internal finish lines are excluded. Door openings are not deducted.</p>}</div>;
}

function FinishScheduleCard({ object, onSource }: { object: ModelObject; onSource: (source: ModelSource) => void }) {
  const row = object.schedule;
  if (!row) {
    if (object.kind !== "floor" || object.tag) return null;
    const source = object.sources[0];
    const evidence = object.properties.find(property => property.label === "Finish plan (A12.3)")?.value ?? "No floor finish tag is recorded for this zone.";
    return <section className="ms-finish-schedule unassigned" aria-label="Unassigned floor finish"><span className="ms-section-label">FINISH NOT ASSIGNED</span><h3>No product tag</h3><p>{evidence}</p><p>Floor area is shown without an assigned finish or base.</p>{source && <button onClick={() => onSource(source)}><FileText size={14}/>{source.sheet} · page {source.page}<ArrowUpRight size={13}/></button>}</section>;
  }
  const fields = [["Manufacturer", row.manufacturer], ["Product", row.product], ["Color / finish", row.color], ["Size", row.size], ["Comments", row.comments]];
  return <section className="ms-finish-schedule"><span className="ms-section-label">ARCHITECT'S FINISH SCHEDULE</span><h3>{row.tag} · {row.description}</h3><p>{row.section} · {row.sectionTitle}</p><dl>{fields.filter(([, value]) => value.trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button onClick={() => onSource({ ...row.source, drawing: row.source.drawing ?? "" })}><FileText size={14}/>{row.source.sheet} · page {row.source.page}<ArrowUpRight size={13}/></button></section>;
}

function PartitionTypeCard({ object, onSource }: { object: ModelObject; onSource: (source: ModelSource) => void }) {
  const row = object.partitionType;
  const [sheetRatio, setSheetRatio] = useState(1.5);
  if (!row) return null;
  const basis = object.properties.find(property => property.label === "Type basis")?.value;
  const fields = [["Construction", row.construction], ["Height / rating", row.ratingHeight], ["Stud width", row.unitWidth], ["Gypsum board", row.gypsum], ["Unique condition", row.uniqueCondition], ["Rough thickness", row.roughThickness], ["Fire rating", row.fireRating]];
  return <section className={`ms-finish-schedule ms-partition-type ${object.partitionBasis === "unverified" ? "unverified" : ""}`} aria-label="Partition type details"><span className="ms-section-label">ARCHITECT'S PARTITION SCHEDULE</span><h3>{row.tag}</h3><p>{row.schedule}</p><span className="ms-partition-badge">{object.partitionBasis === "tag" ? "Plan tag read" : object.partitionBasis === "general-note" ? "General note 3" : "Type unverified"}</span>{basis && <p className="ms-partition-basis">{basis}</p>}<dl>{fields.filter(([, value]) => value.trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div><dt>Modeled thickness</dt><dd>{number.format(row.modeledThicknessIn)} in.{row.roughThicknessIn === null && <small>Nominal from the legend; scheduled thickness varies.</small>}</dd></div></dl><figure className="ms-partition-detail"><figcaption>{row.detail.title} · typical section</figcaption><div className="ms-partition-crop" style={{ aspectRatio: sheetRatio * row.detail.crop.width / row.detail.crop.height }}><img src={row.detail.source.asset} alt={`${row.detail.title}: ${row.detail.shows}`} onLoad={event => setSheetRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} style={{ width: `${100 / row.detail.crop.width}%`, left: `${-100 * row.detail.crop.x / row.detail.crop.width}%`, transform: `translateY(${-100 * row.detail.crop.y}%)` }}/></div><p>{row.detail.shows}</p></figure><button onClick={() => onSource({ ...row.detail.source, drawing: row.detail.source.drawing ?? "" })}><FileText size={14}/>Open {row.detail.source.sheet} · page {row.detail.source.page}<ArrowUpRight size={13}/></button></section>;
}

function RoomFinishPanel({ objects, bases, records, onSource, onInspect, onInspectRoom }: { objects: ModelObject[]; bases: BaseBreakdownRow[]; records: WallFinishRecord[]; onSource: (record: WallFinishRecord, source: ModelSource) => void; onInspect: (id: string) => void; onInspectRoom: (room: string, level: LevelId) => void }) {
  const schedule = useMemo(() => roomFinishSchedule(objects), [objects]);
  return <details className="ms-room-schedule"><summary><span><span className="ms-section-label">INTERIOR FINISHES BY ROOM</span><strong>Room finish schedule</strong></span><small>{schedule.length} rooms</small><ChevronDown size={16}/></summary><p>Prepared model quantities. Base runs include door openings and exclude internal finish lines. Base types follow the finish schedule; supported WB-02 / WB-03 accent runs replace the same length of WB-01. Shared transitions appear in both rooms; count each strip once. Door counts use the assigned room; wall runs cover modeled objects only.</p><div className="ms-room-scroll"><table><thead><tr><th scope="col">Room / level</th><th scope="col">Floor finish</th><th scope="col">Floor SF</th><th scope="col">Base · gross LF</th><th scope="col">Transitions</th><th scope="col">Door openings EA</th><th scope="col">Wall run LF</th></tr></thead><tbody>{schedule.map(row => <tr key={`${row.level}-${row.room}`}><th scope="row"><button onClick={() => onInspectRoom(row.room, row.level)} aria-label={`Select room ${row.room} on ${row.level === "L2" ? "Level 02" : "Level 01"}`}><strong>{row.room}</strong><small>{allRooms.find(room => room.number === row.room && room.level === row.level)?.name ?? "Modeled room"} · {row.level}</small><ArrowUpRight size={12}/></button></th><td>{row.floors.map(floor => <button key={floor.id} onClick={() => onInspect(floor.id)} aria-label={`Inspect ${floor.tag ?? floor.assembly} in room ${row.room}`}><strong>{floor.tag ?? "No finish tag"}</strong><small>{floor.assembly} · {number.format(floor.areaSf)} SF</small><ArrowUpRight size={12}/></button>)}</td><td>{number.format(row.areaSf)}</td><td>{row.baseTags.length ? row.floors.map(floor => { const object = findObject(objects, floor.id); const base = bases.find(item => item.floorId === floor.id); return object?.baseTag && base ? <div key={floor.id}><BaseRuns row={base} records={records} onSource={onSource}/><small>{floor.tag ?? floor.assembly}</small></div> : null; }) : "—"}</td><td>{row.transitions.length ? row.transitions.map(item => <button key={item.id} onClick={() => onInspect(item.id)} aria-label={`Inspect ${item.tag} ${number.format(item.lengthFt)} LF ${item.to === row.room ? `within room ${row.room}` : `from room ${row.room} to ${item.to}`}`}><strong>{item.tag} · {number.format(item.lengthFt)} LF</strong><small>{item.to === row.room ? "Within this room" : `To room ${item.to}`}</small><ArrowUpRight size={12}/></button>) : "—"}</td><td>{row.doors}</td><td>{number.format(row.wallLf)}</td></tr>)}</tbody></table></div></details>;
}

export default function ModelStudio({ view, projectId, projectName, navigate, notify, inspection }: StudioProps) {
  const prepared = usePreparedModel(projectId), objects = prepared.objects;
  const viewObjects = useMemo(() => objects.filter(object => object.views.includes(view)), [objects, view]);
  const records = useMemo(() => view === "interior" && objects.length ? prepared.records : [], [objects, prepared.records, view]);
  const bases = useMemo(() => view === "interior" && objects.length ? prepared.bases : [], [objects, prepared.bases, view]);
  const initialInspection = inspection?.projectId === projectId ? inspection : null;
  const requestedObject = initialInspection?.objectId ? viewObjects.find(object => object.id === initialInspection.objectId) : null;
  const { state, run } = useModelReview();
  const [mode, setMode] = useState<"3D model" | "Compare" | "Blueprint">(initialInspection?.source || requestedObject?.ceiling?.elevationFt === null ? "Compare" : "3D model"), [selectedIds, setSelectedIds] = useState<string[]>(requestedObject ? [requestedObject.id] : []);
  const [voids, setVoids] = useState(true), [ceilings, setCeilings] = useState(!!requestedObject?.ceiling), [finishes, setFinishes] = useState(true);
  const [finishId, setFinishId] = useState<string | null>(initialInspection?.finishId ?? null);
  const [cutaway, setCutaway] = useState(true), [color, setColor] = useState(true), [labels, setLabels] = useState(false), [walls, setWalls] = useState(true);
  const [isolated, setIsolated] = useState(""), [error, setError] = useState(""), [about, setAbout] = useState(false), [expanded, setExpanded] = useState(false), [inspectorOpen, setInspectorOpen] = useState(true), [walkthrough, setWalkthrough] = useState(false);
  const [filters, setFilters] = useState<Filters>({ query: "", level: initialInspection?.level ?? "", division: "", kind: "", review: "" });
  const [flagOpen, setFlagOpen] = useState(false), [flagNote, setFlagNote] = useState(""), [reviewError, setReviewError] = useState("");
  const api = useRef<ViewerHandle | null>(null), workspaceRef = useRef<HTMLDivElement>(null), viewDef = MODEL_VIEWS.find(item => item.id === view)!;
  const walkToggle = useRef<HTMLButtonElement>(null);
  const appliedInspection = useRef<ModelInspection | null>(null);
  const beforeTour = useRef<{ mode: typeof mode; cutaway: boolean; walls: boolean; labels: boolean; isolated: string } | null>(null);
  const leaveWalkthrough = useCallback(() => {
    setWalkthrough(false);
    const previous = beforeTour.current;
    if (!previous) return;
    setMode(previous.mode); setCutaway(previous.cutaway); setWalls(previous.walls); setLabels(previous.labels); setIsolated(previous.isolated);
    beforeTour.current = null;
    walkToggle.current?.focus({ preventScroll: true });
  }, []);
  const levelObjects = filters.level ? viewObjects.filter(object => object.level === filters.level) : viewObjects;
  const divisions = divisionsIn(levelObjects, view), shownByLayer = visibleObjects(objects, state, view);
  const visible = filterObjects(shownByLayer, { level: (filters.level || undefined) as LevelId | undefined, division: filters.division || undefined, kind: (filters.kind || undefined) as ObjectKind | undefined, review: (filters.review || undefined) as ObjectReviewStatus | undefined, query: filters.query || undefined }, state);
  const drawnCount = visible.filter(object => isObjectDrawn(object, { isolated, walls, ceilings })).length;
  const primary = findObject(objects, selectedIds[0]), primaryReview = primary ? reviewOf(state, primary.id) : null, summary = reviewSummary(levelObjects, state, view), selection = selectionTotals(viewObjects, selectedIds);
  const primaryEvidence = primary ? evidenceFor(primary, reviewStatus(state, primary.id)) : null;
  const objectProperties = primary?.properties.filter(property => (!primary.schedule || !finishPropertyLabels.has(property.label)) && (!primary.partitionType || !partitionPropertyLabels.has(property.label)) && (!primary.door || !doorPropertyLabels.has(property.label))) ?? [];
  const sourceList = useMemo(() => { const seen = new Set<string>(); return [...viewObjects.flatMap(object => object.sources), ...records.flatMap(record => record.evidence.map(item => ({ ...item, drawing: item.drawing ?? "" })))].filter(source => { const key = `${source.sheet}|${source.asset}`; if (seen.has(key)) return false; seen.add(key); return true; }); }, [viewObjects, records]);
  const [chosenSource, setChosenSource] = useState<ModelSource | null>(initialInspection?.source ?? (requestedObject?.ceiling?.elevationFt === null ? requestedObject.sources[0] : null));
  const source = chosenSource ?? primary?.sources[0] ?? sourceList.find(item => sheetTransformFor(item.sheet)?.levels.includes(filters.level as LevelId)) ?? sourceList[0];
  const selectedFinish = records.find(record => record.id === finishId);
  const kinds = [...new Set(viewObjects.map(object => object.kind))], levels = LEVELS.filter(level => viewObjects.some(object => object.level === level.id)), materialsUsed = prepared.materials.filter(material => visible.some(object => object.materialId === material.id));

  useEffect(() => {
    if (!initialInspection) return;
    if (requestedObject && appliedInspection.current !== initialInspection) {
      appliedInspection.current = initialInspection;
      setSelectedIds([requestedObject.id]);
      setInspectorOpen(true);
      requestAnimationFrame(() => api.current?.focus());
    }
    workspaceRef.current?.scrollIntoView({ block: "start" });
  }, [initialInspection, requestedObject, view]);

  const selectionKinds = new Set(viewObjects.filter(object => selectedIds.includes(object.id)).map(object => object.kind));
  const takeoffs = view === "interior" ? interiorTakeoffKinds.map(item => {
    const members = levelObjects.filter(object => object.kind === item.kind);
    return { ...item, label: item.kind === "floor" && members.some(object => !object.tag) ? "Floor zones" : item.kind === "door" ? "Door openings" : item.label, count: members.length, unresolved: members.filter(object => object.ceiling?.elevationFt === null).length, totals: selectionTotals(members, members.map(object => object.id)).totals };
  }).filter(item => item.count) : [];
  const canvasOptions = { view, level: filters.level as LevelId | "", voids, cutaway, color, labels, walls, ceilings, finishes, walkthrough, selectedIds, visibleIds: visible.map(object => object.id), isolated };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || flagOpen) return;
      if (event.key === "Escape") {
        if (about) setAbout(false); else if (walkthrough) leaveWalkthrough(); else if (expanded) setExpanded(false); else { setIsolated(""); setSelectedIds([]); setFinishId(null); }
        return;
      }
      if (about || walkthrough || event.metaKey || event.ctrlKey || event.altKey || !(event.target instanceof HTMLCanvasElement) || !event.target.closest(".ms-canvas") || !visible.length) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); select(stepSelection(visible, selectedIds[0] ?? null, event.key === "ArrowRight" ? 1 : -1)!); }
    };
    document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown);
  }, [about, expanded, selectedIds, visible, walkthrough, flagOpen, leaveWalkthrough, isolated]);
  function select(id: string) {
    setFinishId(null);
    const object = findObject(viewObjects, id);
    if (object?.ceiling) {
      setCeilings(true); setChosenSource(null);
      if (object.ceiling.elevationFt === null) { leaveWalkthrough(); setMode("Compare"); }
    }
    setSelectedIds(id ? [id] : []); if (id) setInspectorOpen(true); if (isolated) setIsolated(id);
  }
  function changeLevel(level: LevelId | "") { leaveWalkthrough(); setFilters({ ...filters, level }); setSelectedIds([]); setIsolated(""); setChosenSource(null); setFinishId(null); }
  function inspectFromSchedule(id: string) { setFinishId(null); const object = findObject(viewObjects, id); if (!object) return; leaveWalkthrough(); setFilters({ query: "", level: object.level, division: "", kind: "", review: "" }); setChosenSource(null); setIsolated(""); if (object.ceiling) setCeilings(true); setMode(object.ceiling?.elevationFt === null ? "Compare" : "3D model"); setSelectedIds([id]); setInspectorOpen(true); workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function inspectRoom(room: string, level: LevelId) { setFinishId(null); const members = viewObjects.filter(object => object.level === level && (object.room === room || object.adjoins === room)); leaveWalkthrough(); setFilters({ query: "", level, division: "", kind: "", review: "" }); setChosenSource(null); setIsolated(""); setMode("3D model"); setSelectedIds(members.filter(object => ceilings || !object.ceiling).map(object => object.id)); setInspectorOpen(true); workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function viewSource(next: ModelSource) { setFinishId(null); setChosenSource(next); leaveWalkthrough(); setMode("Compare"); workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  function viewFinishSource(record: WallFinishRecord, next: ModelSource) {
    leaveWalkthrough(); setFinishId(record.id); setChosenSource(next); setMode("Compare");
    setFilters({ query: "", level: record.level, division: "", kind: "", review: "" }); setIsolated("");
    setSelectedIds(record.wallIds.length ? [record.wallIds[0]] : []); setWalls(true); setFinishes(true); setInspectorOpen(true);
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function reset() { setFinishId(null); setSelectedIds([]); setIsolated(""); setCutaway(!walkthrough); setWalls(true); api.current?.home(); }
  function toggleWalkthrough() { if (walkthrough) { leaveWalkthrough(); return; } beforeTour.current = { mode, cutaway, walls, labels, isolated }; setWalkthrough(true); setMode("3D model"); setCutaway(false); setWalls(true); setLabels(false); setIsolated(""); }
  function act(action: Parameters<typeof run>[0], message: string) { const issues = run(action); if (issues) { const text = firstError(issues); setReviewError(text); notify(text); return false; } setReviewError(""); notify(message); return true; }
  const viewSwitch = <nav className="ms-view-switch" aria-label="3D model views">{MODEL_VIEWS.map(item => <button key={item.id} className={item.id === view ? "active" : ""} aria-current={item.id === view ? "page" : undefined} onClick={() => navigate(item.screen)}><span>{item.id === "interior" ? "01" : item.id === "mep" ? "02" : item.id === "structural" ? "03" : "04"}</span><strong>{item.label}</strong><small>{reviewSummary(objects, state, item.id).objects} objects</small></button>)}</nav>;

  if (!objects.length) return <div className="model-studio"><header className="ms-heading"><div><span className="ms-eyebrow">{viewCopy[view].eyebrow}</span><h1>{viewDef.label}<span>3D studio</span></h1><p>{projectName}</p></div></header>{viewSwitch}<section className="ms-empty-project"><Box size={38}/><h2>No model for this project yet</h2><p>Add a prepared project model to inspect objects, quantities, assemblies and drawing sources in this view.</p></section><footer className="ms-disclaimer"><Info size={13}/>The demo includes a prepared model only for the Jelleff sample project.</footer></div>;

  const content = <div className={`model-studio ${expanded ? "ms-expanded" : ""}`}>
    <header className="ms-heading"><div><span className="ms-eyebrow">{viewCopy[view].eyebrow}</span><h1>{viewDef.label}<span>3D studio</span></h1><p>{projectName}<span> / </span>{viewCopy[view].description}</p></div><div className="ms-header-actions"><button onClick={() => setAbout(true)}><Info size={15}/>About this model</button><button ref={walkToggle} className={`ms-walk-toggle ${walkthrough ? "active" : ""}`} aria-pressed={walkthrough} onClick={toggleWalkthrough}><Footprints size={16}/>{walkthrough ? "Exit walkthrough" : "Walk through"}</button><button className="ms-primary" onClick={() => { leaveWalkthrough(); setMode(mode === "Compare" ? "3D model" : "Compare"); }}><ScanLine size={16}/>{mode === "Compare" ? "Return to 3D" : "Compare with source"}</button></div></header>
    {viewSwitch}
    <div className="ms-provenance"><span className="ms-live-dot"/><strong>{view === "interior" ? "Traced architectural model" : "Illustrative system placement"}</strong><span>{sourceList.map(item => item.sheet).join(" · ")}</span><small>{view === "interior" ? "Quantities measured from prepared geometry" : "Positions and sizes require discipline drawings"}</small></div>
    <div className="ms-review-summary"><div><span>Objects in view</span><strong>{summary.objects}</strong><small>{divisions.length} CSI divisions</small></div><div><span>Verified</span><strong className="verified">{summary.verified}</strong><small>Contractor reviewed</small></div><div><span>Needs checking</span><strong className="flagged">{summary.flagged}</strong><small>Open review notes</small></div><div><span>Illustrative objects</span><strong className="low">{summary.lowConfidence}</strong><small>Illustrative placement</small></div></div>
    {view === "interior" && <section className="ms-level-controls" aria-label="Interior floor controls"><div role="group" aria-label="Choose model level"><button aria-pressed={!filters.level} onClick={() => changeLevel("")}>Both levels</button>{levels.map(level => <button key={level.id} aria-pressed={filters.level === level.id} onClick={() => changeLevel(level.id)}>{level.name}</button>)}</div>{filters.level !== "L1" && <button className="ms-void-toggle" aria-pressed={voids} onClick={() => setVoids(value => !value)}>{voids ? <Eye size={14}/> : <EyeOff size={14}/>}Open-to-below areas</button>}{filters.level !== "L1" && <p>Level 02 finishes follow A12.3 and the A12.1 schedule. Office 206 and Closet 206A have no product tag. The gym, yard and lobby remain open to below.</p>}</section>}
    {takeoffs.length > 0 && <section className="ms-takeoff-summary" aria-label="Interior takeoff overview"><div className="ms-takeoff-heading"><div><span className="ms-section-label">INTERIOR TAKEOFF</span><h2>Explore the measured objects</h2></div><p>Totals from prepared geometry for {filters.level ? LEVELS.find(level => level.id === filters.level)?.name : "both levels"}. Select a category to inspect each object and its source.</p></div><div className="ms-takeoff-cards">{takeoffs.map(item => <button key={item.kind} aria-pressed={filters.kind === item.kind} onClick={() => { setFilters({ query: "", level: filters.level, division: "", kind: filters.kind === item.kind ? "" : item.kind, review: "" }); if (item.kind === "ceiling") setCeilings(true); setSelectedIds([]); setFinishId(null); leaveWalkthrough(); setIsolated(""); setMode("3D model"); }}><span>{item.label}<ArrowUpRight size={14}/></span><strong>{item.totals.map(total => <span key={total.unit}>{number.format(total.value)} {total.unit}</span>)}</strong><small>{item.count} object{item.count === 1 ? "" : "s"}{item.unresolved ? ` · ${item.unresolved} unresolved` : ""} · {filters.kind === item.kind ? "Show all" : "View in model"}</small></button>)}</div></section>}
    {view === "interior" && <CeilingSchedulePanel objects={viewObjects} level={filters.level as LevelId | ""} onInspect={inspectFromSchedule} onSource={viewSource}/>}{view === "interior" && <WallFinishPanel records={records} bases={bases} level={filters.level as LevelId | ""} onInspect={inspectFromSchedule} onSource={viewFinishSource}/>} {view === "interior" && <RoomFinishPanel objects={levelObjects} bases={bases} records={records} onSource={viewFinishSource} onInspect={inspectFromSchedule} onInspectRoom={inspectRoom}/> }{view === "interior" && <DoorSchedulePanel objects={viewObjects} onInspect={inspectFromSchedule} onSource={viewSource}/> }
    <div className="ms-layer-panel"><span><Layers3 size={14}/>Show / hide by trade</span>{divisions.map(item => { const hidden = state.hidden[view].includes(item.division); return <button key={item.division} aria-pressed={!hidden} className={hidden ? "hidden" : ""} onClick={() => act(current => setDivisionHidden(current, view, item.division, !hidden), `${item.name} ${hidden ? "shown" : "hidden"} in ${viewDef.label}.`)}>{hidden ? <EyeOff size={13}/> : <Eye size={13}/>}<strong>{item.division}</strong>{item.name}<small>{item.count}</small></button>; })}</div>
    <div ref={workspaceRef} className={`ms-workspace ${inspectorOpen ? "" : "no-inspector"}`}><div className="ms-main-view">
      <div className="ms-viewbar"><div role="tablist" aria-label="Model display">{(["3D model", "Compare", "Blueprint"] as const).map(tab => <button role="tab" aria-selected={mode === tab} className={mode === tab ? "active" : ""} key={tab} onClick={() => { if (tab !== "3D model") leaveWalkthrough(); setMode(tab); }}>{tab === "3D model" ? <Box size={14}/> : tab === "Compare" ? <Layers3 size={14}/> : <FileText size={14}/>} {tab}</button>)}</div><div className="ms-viewbar-actions">{initialInspection && <button aria-label="Return to quantity takeoffs" title="Return to quantity takeoffs" onClick={() => navigate("takeoffs")}><ArrowLeft size={16}/></button>}<button aria-label={inspectorOpen ? "Hide object inspector" : "Show object inspector"} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(value => !value)}><MousePointer2 size={15}/></button><button className="ms-expand" aria-label={expanded ? "Exit expanded view" : "Expand model workspace"} onClick={() => setExpanded(value => !value)}>{expanded ? <X size={17}/> : <Maximize2 size={17}/>}</button></div></div>
      <div className="ms-object-toolbar"><label><Search size={14}/><input aria-label="Search model objects" value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} placeholder="Search objects, rooms, assemblies…"/></label><select aria-label="Filter by level" value={filters.level} onChange={event => changeLevel(event.target.value as LevelId | "")}><option value="">All levels</option>{levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select><select aria-label="Filter by division" value={filters.division} onChange={event => setFilters({ ...filters, division: event.target.value })}><option value="">All divisions</option>{divisions.map(item => <option key={item.division} value={item.division}>{item.division} · {item.name}</option>)}</select><select aria-label="Filter by object kind" value={filters.kind} onChange={event => { setFilters({ ...filters, kind: event.target.value }); if (event.target.value === "ceiling") setCeilings(true); }}><option value="">All object types</option>{kinds.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select><select aria-label="Filter by review status" value={filters.review} onChange={event => setFilters({ ...filters, review: event.target.value })}><option value="">All review states</option><option value="verified">Verified</option><option value="flagged">Needs checking</option><option value="unreviewed">Not reviewed</option></select></div>
      <div className={`ms-viewports ${mode === "Compare" ? "is-compare" : ""} ${mode === "Blueprint" ? "is-blueprint" : ""}`}><div className={`ms-scene ${walkthrough ? "is-walkthrough" : ""}`} style={{ display: mode === "Blueprint" ? "none" : undefined }}><ModelCanvas objects={viewObjects} records={records} bases={bases} materials={prepared.materials} options={canvasOptions} onSelect={select} api={api} onError={setError}/><div className="ms-scene-caption"><span>JRC / {walkthrough ? "VIRTUAL WALKTHROUGH" : view.toUpperCase()}</span><strong>{walkthrough ? `First-person tour · ${view === "interior" && filters.level === "L2" ? "Level 02" : "Level 01"}` : viewCopy[view].scene}</strong><small>{walkthrough ? "Prepared model · select any visible object for its evidence" : `${drawnCount} of ${viewObjects.length} objects shown · click any object for detail`}</small></div>{!walkthrough && <button className="ms-compass" onClick={() => api.current?.top()} aria-label="Switch to top view"><span>N</span><Compass size={27}/><small>TOP</small></button>}{walkthrough && <div className="ms-walk-badge"><Footprints size={15}/><span><strong>Tour mode</strong><small>Drag to look · Hold the arrows to walk</small></span><button onClick={leaveWalkthrough}>Exit</button></div>}{error && <div className="ms-error" role="alert"><Info/><p>{error}</p><button onClick={() => { leaveWalkthrough(); setMode("Blueprint"); }}>View source sheet</button></div>}{walkthrough ? <div className="ms-walk-controls" role="group" aria-label="Walkthrough movement controls"><WalkButton direction="forward" label="Walk forward" api={api}><ArrowUp size={20}/></WalkButton><WalkButton direction="left" label="Step left" api={api}><ArrowLeft size={20}/></WalkButton><button className="home" aria-label="Return to walkthrough start" onClick={reset}><RotateCcw size={18}/></button><WalkButton direction="right" label="Step right" api={api}><ArrowRight size={20}/></WalkButton><WalkButton direction="back" label="Walk backward" api={api}><ArrowDown size={20}/></WalkButton></div> : <div className="ms-camera-tools"><button aria-label="Zoom in model" onClick={() => api.current?.zoom(1.2)}><Plus size={18}/></button><button aria-label="Zoom out model" onClick={() => api.current?.zoom(1 / 1.2)}><Minus size={18}/></button><span/><button aria-label="Reset model view" onClick={reset}><RotateCcw size={17}/></button></div>}<div className="ms-scene-hint"><MousePointer2 size={13}/><span>{walkthrough ? <><span className="ms-walk-hint-desktop">Drag to look · WASD / arrows to walk · Q E to turn · R F to look up / down · Esc to exit</span><span className="ms-walk-hint-touch">Drag to look.<br/>Hold arrows to walk.<br/>Tap objects to inspect.</span></> : "Drag to rotate · Scroll to zoom · Click to inspect"}</span></div>{isolated && <button className="ms-show-all" onClick={() => setIsolated("")}><Eye size={14}/>Show all objects</button>}{!visible.length && <div className="ms-filter-empty"><Search size={25}/><strong>No objects match</strong><button onClick={() => setFilters({ query: "", level: "", division: "", kind: "", review: "" })}>Clear filters</button></div>}</div>{mode !== "3D model" && source && <SourceSheet source={source} selected={primary} finish={selectedFinish}/>}</div>
      <div className="ms-bottom-tools"><div>{[{ label: "Cutaway", state: cutaway, set: setCutaway }, { label: "Material colours", state: color, set: setColor }, { label: "Room labels", state: labels, set: setLabels }, { label: "Walls / envelope", state: walls, set: setWalls }, ...(view === "interior" ? [{ label: "Ceilings", state: ceilings, set: setCeilings }, { label: "Wall finishes", state: finishes, set: setFinishes }] : [])].map(toggle => <button key={toggle.label} aria-pressed={toggle.state} className={toggle.state ? "on" : ""} onClick={() => toggle.set(value => !value)}><span>{toggle.state && <Check size={10}/>}</span>{toggle.label}</button>)}</div><span>{filters.level ? LEVELS.find(level => level.id === filters.level)?.name : levels.map(level => level.name).join(" · ")}<ChevronDown size={13}/></span></div>
      {view === "interior" && finishes && <p className="ms-finish-legend">Wall finishes: filled bands = located and dimensioned · thin lines = finish evidence, height unmeasured · low strips = supported accent base. Display colors are approximate.</p>}
      {color && <div className="ms-material-key">{materialsUsed.map(material => <span key={material.id}><i style={{ background: material.color }}/>{material.name}</span>)}</div>}
    </div><aside className="ms-inspector" hidden={!inspectorOpen}><div className="ms-inspector-title"><span><MousePointer2 size={16}/>Object inspector</span>{primary && <div><button aria-label="Previous object" onClick={() => select(stepSelection(visible, primary.id, -1)!)} disabled={!visible.length}><ArrowLeft size={14}/></button><button aria-label="Next object" onClick={() => select(stepSelection(visible, primary.id, 1)!)} disabled={!visible.length}><ArrowRight size={14}/></button><button aria-label="Clear selected object" onClick={() => { setSelectedIds([]); setFinishId(null); setIsolated(""); }}><X size={15}/></button></div>}</div><label className="ms-element-picker"><span>Find an object</span><select value={primary?.id ?? ""} onChange={event => select(event.target.value)}><option value="">Select in the model or browse…</option>{primary && !visible.some(object => object.id === primary.id) && <option value={primary.id}>{primary.name} · not currently shown</option>}{kinds.map(kind => <optgroup key={kind} label={kindLabels[kind].toUpperCase()}>{visible.filter(object => object.kind === kind).map(object => <option key={object.id} value={object.id}>{object.name}</option>)}</optgroup>)}</select></label>
      {primary ? <><div className="ms-selected-heading"><span className="ms-kind">{primary.kind} / {primary.id}</span><h2>{primary.name}</h2><p>{primary.room ? `Room ${primary.room}${primary.adjoins ? ` ↔ Room ${primary.adjoins}` : ""} · ` : ""}{primary.level} · {primary.discipline.replace("-", " ")}</p><div className={`ms-review-chip ${reviewStatus(state, primary.id)}`}>{reviewStatus(state, primary.id) === "verified" ? <CheckCircle2 size={13}/> : reviewStatus(state, primary.id) === "flagged" ? <Flag size={13}/> : <ShieldCheck size={13}/>} {statusLabel[reviewStatus(state, primary.id)]}</div><div className="ms-selection-actions">{state.hidden[view].includes(primary.division) && <button onClick={() => act(current => setDivisionHidden(current, view, primary.division, false), `${primary.divisionName} shown.`)}><Eye size={14}/>Show trade</button>}<button disabled={!!primary.ceiling && primary.ceiling.elevationFt === null} title={primary.ceiling?.elevationFt === null ? "Height unresolved; view the source outline instead." : undefined} onClick={() => api.current?.focus()}><Focus size={14}/>Focus</button><button aria-pressed={isolated === primary.id} onClick={() => setIsolated(isolated ? "" : primary.id)}><Eye size={14}/>{isolated ? "Show all" : "Isolate"}</button><button onClick={() => setSelectedIds(sameAssembly(visible, primary.id).map(object => object.id))}><Layers3 size={14}/>Select alike</button></div></div>{selection.count > 1 && <div className="ms-selection-total"><strong>{selection.count} objects selected</strong>{selectionKinds.size === 1 ? selection.totals.map(total => <span key={total.unit}>{number.format(total.value)} {total.unit}</span>) : <span>Mixed object types · inspect each object for its quantity.</span>}</div>}<QuantityCard object={primary} base={bases.find(row => row.floorId === primary.id)}/><BaseBreakdownCard row={bases.find(row => row.floorId === primary.id)} records={records} onSource={viewFinishSource}/>{view === "interior" && <WallFaceCard object={primary} records={records} onSource={viewFinishSource}/>}<CeilingCard object={primary} onSource={viewSource}/><FinishScheduleCard object={primary} onSource={viewSource}/><PartitionTypeCard object={primary} onSource={viewSource}/>{primary.door && <DoorRecordCard row={primary.door.row} hardware={primary.door.hardware} detail={primary.door} onSource={viewSource}/>}
        <div className="ms-material-card"><span className="ms-section-label">ASSEMBLY / CLASSIFICATION</span><div><i style={{ background: prepared.materials.find(material => material.id === primary.materialId)?.color }}/><h3>{primary.assembly}</h3></div><span className={`ms-evidence ${primary.basis.material === "documented" ? "documented" : ""}`}>{primary.basis.material === "documented" ? "Documented assembly" : "Illustrative assembly"}</span><dl className="ms-classification"><div><dt>CSI division</dt><dd>{primary.division} · {primary.divisionName}</dd></div><div><dt>Spec section</dt><dd>{primary.specSection ?? "Not classified"}</dd></div></dl></div>
        {objectProperties.length > 0 && <div className="ms-properties"><span className="ms-section-label">OBJECT PROPERTIES</span>{objectProperties.map((property, index) => <div key={`${property.label}-${index}`}><span>{property.label}</span><strong>{property.value}</strong></div>)}</div>}
        <div className="ms-element-details"><span className="ms-section-label">MODEL BASIS</span><p>{primary.description}</p><dl><dt>Geometry</dt><dd>{primary.basis.geometry}</dd><dt>Material</dt><dd>{primary.basis.material}</dd></dl>{primaryEvidence && <div className={`ms-model-evidence ${primaryEvidence.level}`}><strong>{primaryEvidence.label}</strong><p>{primaryEvidence.detail}</p></div>}<p className="ms-caution">{primary.caution}</p></div>
        <div className="ms-review-card"><span className="ms-section-label">CONTRACTOR REVIEW</span>{primaryReview && <div className={`ms-review-note ${primaryReview.status}`}><strong>{statusLabel[primaryReview.status]}</strong><p>{primaryReview.note || "No note recorded."}</p><small>{primaryReview.by} · {activityDate(primaryReview.at)} · {primaryReview.history.length} event{primaryReview.history.length === 1 ? "" : "s"}</small></div>}{reviewError && <p className="ms-review-error">{reviewError}</p>}<div><button disabled={reviewStatus(state, primary.id) === "verified"} onClick={() => act(current => verifyObject(current, objects, primary.id, CURRENT_USER), `${primary.name} verified.`)}><CheckCircle2 size={14}/>Verify</button><button onClick={() => { setFlagNote(primaryReview?.status === "flagged" ? primaryReview.note : ""); setFlagOpen(true); }}><Flag size={14}/>Flag</button>{reviewStatus(state, primary.id) !== "unreviewed" && <button onClick={() => act(current => clearObjectReview(current, objects, primary.id, CURRENT_USER), `${primary.name} returned to review.`)}><RotateCcw size={14}/>Clear</button>}</div></div>
        <div className="ms-evidence-links"><span className="ms-section-label">TRACE TO SOURCE</span>{primary.sources.map((item, index) => <button key={`${item.sheet}-${item.detail}-${index}`} onClick={() => viewSource(item)}><FileText size={16}/><span><strong>{item.sheet} · page {item.page}</strong><small>{item.detail}</small></span><ArrowUpRight size={14}/></button>)}</div></> : selectedFinish ? <WallFinishEvidenceCard record={selectedFinish} onSource={viewFinishSource}/> : <div className="ms-inspector-empty"><span className="ms-empty-icon"><Box size={30}/></span><h2>Every object carries its evidence.</h2><p>Select an object to see its measured quantity, assembly, properties, evidence and source.</p><div><span>01</span><p><strong>Choose an object</strong>Click the model or use the object list.</p></div><div><span>02</span><p><strong>Read the detail</strong>See quantities, R-values, sizes and classifications.</p></div><div><span>03</span><p><strong>Review the evidence</strong>Verify it or flag what needs checking.</p></div><button className="ms-start" onClick={() => select(visible[0]?.id ?? viewObjects[0].id)}>Inspect the first object<ArrowUpRight size={15}/></button></div>}
    </aside></div>
    <section className="ms-source-tray"><div><FileText size={17}/><span><strong>Source collection</strong><small>{sourceList.length} source reference{sourceList.length === 1 ? "" : "s"}</small></span></div>{sourceList.map(item => <button key={`${item.sheet}-${item.asset}`} onClick={() => viewSource(item)} className={mode !== "3D model" && source?.asset === item.asset && source?.sheet === item.sheet && source?.page === item.page ? "active" : ""}><strong>{item.sheet}</strong><span>{item.detail}</span><ArrowUpRight size={13}/></button>)}</section>
    <footer className="ms-disclaimer"><Info size={13}/>{view === "interior" ? "Prepared visualization; traced geometry and documented finishes still require contractor review." : "Illustrative system placement; not suitable for coordination, pricing or fabrication without the discipline drawings."}</footer>
    {about && createPortal(<div className="ms-about-backdrop" onClick={event => { if (event.target === event.currentTarget) setAbout(false); }}><section role="dialog" aria-modal="true" aria-label="About this model"><button autoFocus className="ms-close" aria-label="Close about this model" onClick={() => setAbout(false)}><X size={20}/></button><span className="ms-eyebrow">FROM MODEL TO EVIDENCE</span><h2>One model. Four focused views.</h2><p>The studio separates interior, MEP, structural and exterior objects while keeping one inspection workflow.</p><ul><li>Both interior levels are manually traced from the supplied Jelleff architectural sheets, with finishes from A12.2, A12.3 and A12.1. Office 206 and Closet 206A remain unassigned.</li><li>Structural, MEP and roof objects are illustrative placements until their discipline drawings are provided.</li><li>Quantities are calculated from the prepared geometry and shown with their measurement unit. Base types follow the finish schedule; internal finish lines are excluded, door openings are not deducted, and supported accent-base runs are split from the field base without changing the gross total.</li><li>Ceilings follow A3.1 and A3.2 at marked heights above the finished floor. Unresolved zones are listed only. Panels have schematic thickness; source conflicts, unplaced tags and incomplete coverage remain visible. Walls keep their height to the deck.</li><li>Doors use A8.2 sizes with traced hinges and swing directions. Pairs count as one opening. Walls still run across openings, frame profiles are not modeled, and hardware conflicts remain unresolved.</li><li>Wall finishes are recorded by face from the finish plans and interior elevations. Only located bands with dimensioned heights and bottoms are filled in 3D. Thin colored lines mark located evidence with unmeasured heights. Graphics and untraced or unresolved faces are listed; no paint is assumed on unnoted faces. Colors are approximate.</li><li>Every object identifies its assembly, properties, source, basis and evidence.</li><li>Contractor reviews are saved per project in this browser.</li></ul><button className="ms-primary" onClick={() => setAbout(false)}>Explore the model<ArrowUpRight size={16}/></button></section></div>, document.body)}
    {flagOpen && primary && <Modal title={`Flag ${primary.name}`} subtitle="Record exactly what the team needs to verify." onClose={() => { setFlagOpen(false); setReviewError(""); }}><form onSubmit={event => { event.preventDefault(); if (act(current => flagObject(current, objects, primary.id, flagNote, CURRENT_USER), `${primary.name} flagged for checking.`)) setFlagOpen(false); }}>{reviewError && <p className="ms-review-error">{reviewError}</p>}<label className="ui-field">Review note<textarea autoFocus rows={5} value={flagNote} onChange={event => setFlagNote(event.target.value)} placeholder="What needs to be checked against the project documents?"/></label><div className="ms-dialog-actions"><button type="button" onClick={() => setFlagOpen(false)}>Cancel</button><button type="submit" className="ms-primary">Save flag</button></div></form></Modal>}
  </div>;
  return expanded ? createPortal(content, document.body) : content;
}
