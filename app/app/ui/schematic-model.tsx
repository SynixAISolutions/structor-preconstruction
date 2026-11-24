"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildSchematicModel, readWallLayers, useSchematicModel } from "../../lib/schematic-model-client";
import { editColumn, editDoorNumber, editGlazing, editPartition, editStair, editWall, heightSheet, keptWalls, levelSpaces, longestWallOfType, moveOutlinePoint, partitionTypeSheet, polygonArea, setLevelHeight, setOpenToBelow, setPartitionTypes, setUntaggedWallType, stairRise, type Point, type SchematicLevel, type SchematicModel } from "../../lib/schematic-model";
import { glazingTotals, scheduleRow, wallTypeTotals, type PartitionType } from "../../lib/tag-placement";
import { dimensionedWallLayers, inchesLabel, layerColor, layersFit, layerSlabs, openedCenter, parseInches } from "../../lib/wall-assemblies";
import { openStoredPdf, renderStoredPage, useProjectDocuments } from "../../lib/project-files-client";
import { drawingRegister, type StoredDocument } from "../../lib/project-files";
import type { Project } from "../../lib/projects";
import { useLocalDraft } from "../../lib/use-local-draft";
import { alignSheetFrame, footprintValid, openOutline, printedSheetFrame, DEFAULT_DOOR_HEIGHT, wallLayerGroup, schematicColumns, schematicDoors, schematicGeometry, schematicGlazing, schematicPartitions, schematicRailings, schematicRoomFloors, schematicStairs, schematicWalls, sheetPoint, wallTotals, type SheetFrame } from "./schematic-geometry";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, type ViewProps } from "./shared";
import { SchematicObjectInspector } from "./schematic-object-inspector";
import { SchematicHeightEvidence } from "./schematic-height-evidence";
import type { DimensionSource } from "../../lib/section-datums";
import { CUTAWAY_HEIGHT, isSportsFloor, schematicCameraFit, schematicObjectPick, type SchematicPick, type WallPick } from "./schematic-scene";
import { StoredDocumentViewer } from "./project-file-viewer";
import type { Room } from "../../lib/room-detection";
import { stairPieces } from "../../lib/stair-detection";
import "./schematic-model.css";

const colors = ["#6d9e9a", "#a193b8", "#d4a66c", "#8fa7c0", "#98ad80"];
type CameraApi = { home: () => void; top: () => void; zoom: (factor: number) => void };
function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    const drawable = object as THREE.Mesh;
    drawable.geometry?.dispose();
    const materials = drawable.material ? Array.isArray(drawable.material) ? drawable.material : [drawable.material] : [];
    materials.forEach(material => { (material as THREE.MeshBasicMaterial).map?.dispose(); material.dispose(); });
  });
  group.clear();
}
function roomLabel(text: string) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 72;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect(0, 0, 512, 72);
  ctx.strokeStyle = "#809894"; ctx.strokeRect(1, 1, 510, 70);
  ctx.font = "600 40px Arial"; ctx.fillStyle = "#294744"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 256, 36, 490);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
}
const NO_TYPES: PartitionType[] = [];
/** Where a level sits in the view: its elevation, or spread apart when the levels are exploded. */
const levelBase = (model: SchematicModel, level: SchematicLevel, explode: boolean) => level.elevation + (explode ? model.levels.indexOf(level) * 15 : 0);
const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
/** The opening: the wall shows its layers in place, then they slide apart; the labels come in as they settle (ms). */
const OPEN_DELAY = 250, OPEN_TIME = 800, FOV = 42;
/** How far the camera stands from an opened wall: enough for its length, its height with the labels above, and the layers' spread. */
const openedDistance = (length: number, height: number, gap: number, count: number) => Math.min(260, Math.max(18, Math.hypot(length, height * 1.6, gap * (count + 1)) / 2 / Math.sin(THREE.MathUtils.degToRad(FOV / 2)) * 1.1));
function layerLabel(text: string, swatch: string) {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 72;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,.96)"; ctx.fillRect(0, 0, 640, 72);
  ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 638, 70);
  ctx.fillStyle = swatch; ctx.fillRect(14, 16, 40, 40); ctx.strokeStyle = "#5b5568"; ctx.lineWidth = 1; ctx.strokeRect(14, 16, 40, 40);
  ctx.font = "600 34px Arial"; ctx.fillStyle = "#2e2440"; ctx.textBaseline = "middle"; ctx.fillText(text, 70, 37, 556);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, opacity: 0 }));
}
type SceneApi = {
  group: THREE.Group; opened: THREE.Group; highlight: THREE.Group; pickables: THREE.Object3D[];
  fit: (top?: boolean) => void; focus: (wall: THREE.Object3D) => void;
  labelsTowardCamera: (wall: THREE.Object3D) => void; invalidate: () => void;
};
function SchematicCanvas({ model, spacesByLevel, visible, explode, pins, walls, cutaway, showOutline3D, schedule, selection, onPick, camera, onError }: {
  model: SchematicModel; spacesByLevel: ReadonlyMap<string, Room[]>; visible: string[]; explode: boolean; pins: boolean;
  walls: boolean; cutaway: boolean; showOutline3D: boolean; schedule: PartitionType[];
  selection: SchematicPick | null; onPick: (pick: SchematicPick | null) => void;
  camera: React.RefObject<CameraApi | null>; onError: (error: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null), sceneRef = useRef<SceneApi | null>(null), fitted = useRef("");
  const pick = selection?.kind === "wall" ? selection : null;
  const error = useRef(onError); error.current = onError;
  const picked = useRef(onPick); picked.current = onPick;
  useEffect(() => {
    const mount = host.current!; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { error.current("3D graphics are unavailable. Source drawings, heights and outline corrections remain available below."); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute("aria-label", "Schematic building model. Drag to orbit, scroll to zoom, and click a wall, door or floor to inspect it. Escape clears the selection. Use the object inspector and level controls for keyboard access."); mount.append(renderer.domElement);
    const scene = new THREE.Scene(), group = new THREE.Group(), opened = new THREE.Group(), highlight = new THREE.Group(); scene.add(group, opened, highlight);
    // The geometry runs plan y (down the sheet) toward -z, which on its own is the building's mirror image. The group flips it
    // back, so south is toward the viewer and east to the right, as on the plan and in the prepared model.
    group.scale.z = -1; opened.scale.z = -1;
    scene.add(new THREE.HemisphereLight("#f5f7ff", "#90968e", 1.9)); const sun = new THREE.DirectionalLight("#fff7ed", 2.0); sun.position.set(100, 250, 150); scene.add(sun);
    const view = new THREE.PerspectiveCamera(FOV, 1, .1, 100000), controls = new OrbitControls(view, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.02;
    let frame = 0;
    const invalidate = () => { if (!frame) frame = requestAnimationFrame(render); };
    let tween: { start: number; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromPos: THREE.Vector3; toPos: THREE.Vector3 } | null = null;
    controls.addEventListener("start", () => { tween = null; }); // the estimator's own drag wins over the move to a wall
    const fit = (top = false) => {
      tween = null;
      const bounds = new THREE.Box3().setFromObject(group); if (bounds.isEmpty()) return;
      const { center, position } = schematicCameraFit(bounds, FOV, view.aspect, top);
      controls.target.copy(center); view.position.copy(position); view.lookAt(center); controls.update(); invalidate();
    };
    // A picked wall's axes in the world: its middle, along its length, across its thickness (each pointing toward the camera).
    const axes = (wall: THREE.Object3D) => {
      wall.updateWorldMatrix(true, false);
      const center = wall.getWorldPosition(new THREE.Vector3()), along = new THREE.Vector3(1, 0, 0).transformDirection(wall.matrixWorld), across = new THREE.Vector3(0, 0, 1).transformDirection(wall.matrixWorld);
      const from = view.position.clone().sub(center), end = along.dot(from) < 0 ? -1 : 1;
      if (across.dot(from) < 0) across.negate(); if (end < 0) along.negate();
      return { center, along, across, end };
    };
    // Turns the camera to look at a picked wall from its end and side, at an angle that shows each opened layer and the gaps.
    const focus = (wall: THREE.Object3D) => {
      const { center, along, across } = axes(wall), { distance, stack } = wall.userData as { distance: number; stack: number };
      const target = center.clone().add(new THREE.Vector3(0, stack / 2, 0));
      const toPos = target.clone().addScaledVector(along.multiplyScalar(.45).addScaledVector(across, .89).normalize(), distance).add(new THREE.Vector3(0, distance * .4, 0));
      // On a wide screen the layer list covers the view's right side (schematic-model.css): the wall goes in the open part.
      if (window.innerWidth > 800) { const right = target.clone().sub(toPos).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(distance * .23); target.add(right); toPos.add(right); }
      tween = { start: performance.now(), fromTarget: controls.target.clone(), toTarget: target, fromPos: view.position.clone(), toPos };
      invalidate();
    };
    // The layer labels go to the wall's end nearer the camera (they are drawn at its -x end).
    const labelsTowardCamera = (wall: THREE.Object3D) => {
      const { end } = axes(wall);
      wall.children.forEach(part => { if (part.userData.label) { if ((part as THREE.Sprite).isSprite) part.position.x = end < 0 ? part.userData.x0 : -part.userData.x0; else part.scale.x = -end; } });
    };
    const api: SceneApi = { group, opened, highlight, pickables: [], fit, focus, labelsTowardCamera, invalidate };
    sceneRef.current = api;
    camera.current = { home: () => fit(), top: () => fit(true), zoom: factor => {
      tween = null;
      view.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
      controls.update();
      invalidate();
    } };
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const hitAt = (x: number, y: number): SchematicPick | null => {
      const box = renderer.domElement.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      pointer.set((x - box.left) / box.width * 2 - 1, -(y - box.top) / box.height * 2 + 1);
      ray.setFromCamera(pointer, view);
      const layers: THREE.Object3D[] = [];
      opened.traverse(o => { if (o.userData.layer !== undefined || o.userData.whole) layers.push(o); });
      for (const hit of ray.intersectObjects([...layers, ...api.pickables], false)) {
        const layer = hit.object;
        if (layer.userData.layer !== undefined || layer.userData.whole) {
          const wall = layer.parent?.userData.pick as WallPick | undefined;
          if (wall) return { ...wall, layer: layer.userData.layer };
        }
        const pick = schematicObjectPick(hit);
        if (pick) return pick;
      }
      return null;
    };
    let down: [number, number] | null = null, hoverFrame = 0;
    const onDown = (e: PointerEvent) => { down = e.button === 0 ? [e.clientX, e.clientY] : null; };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
      picked.current(hitAt(e.clientX, e.clientY));
    };
    const onCancel = () => { down = null; };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        renderer.domElement.style.cursor = hitAt(e.clientX, e.clientY) ? "pointer" : "";
      });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") picked.current(null); };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onCancel);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("keydown", onKey);

    const resize = () => {
      const width = mount.clientWidth, height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      view.aspect = width / height;
      view.updateProjectionMatrix();
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    controls.addEventListener("change", invalidate);

    function render(now: number) {
      frame = 0;
      if (tween) {
        const k = ease(Math.min(1, (now - tween.start) / OPEN_TIME));
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
        view.position.lerpVectors(tween.fromPos, tween.toPos, k);
        if (k >= 1) tween = null;
      }
      let opening = false;
      opened.children.forEach(wall => {
        const t = Math.min(1, Math.max(0, (now - wall.userData.start - OPEN_DELAY) / OPEN_TIME));
        const k = ease(t), labels = Math.min(1, Math.max(0, (t - .55) / .45));
        opening ||= t < 1;
        wall.children.forEach(part => {
          if (part.userData.closed !== undefined) part.position.z = part.userData.closed + (part.userData.opened - part.userData.closed) * k;
          if (part.userData.label) ((part as THREE.Sprite | THREE.Line).material as THREE.Material).opacity = labels;
        });
      });
      controls.update();
      renderer.render(scene, view);
      if (tween || opening) invalidate();
    }
    invalidate();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      observer.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onCancel);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("keydown", onKey);
      disposeGroup(group); disposeGroup(opened); disposeGroup(highlight);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      camera.current = null;
      fitted.current = "";
    };
  }, []);

  useEffect(() => {
    const current = sceneRef.current;
    if (!current) return;
    disposeGroup(current.group);
    current.pickables = [];
    const errors: string[] = [];
    for (const [index, level] of model.levels.entries()) {
      if (!visible.includes(level.id)) continue;
      const scope = new THREE.Group();
      scope.position.y = levelBase(model, level, explode);
      try {
        const display = cutaway ? { ...level, height: Math.min(level.height, CUTAWAY_HEIGHT) } : level;
        const spaces = spacesByLevel.get(level.id) ?? [];
        const wallMesh = walls ? schematicWalls(display) : null;
        if (wallMesh) { wallMesh.userData.levelId = level.id; scope.add(wallMesh); }
        const doorMesh = walls ? schematicDoors(display, Math.min(display.height, DEFAULT_DOOR_HEIGHT)) : null;
        for (const mesh of [
          doorMesh, walls ? schematicGlazing(display) : null, walls ? schematicPartitions(display) : null,
          walls ? schematicRailings(display) : null, walls ? schematicColumns(display) : null,
        ]) if (mesh) scope.add(mesh);
        const stairs = walls ? schematicStairs(level, stairRise(model, level)) : null;
        if (stairs) scope.add(stairs.mesh);
        const floors = walls ? schematicRoomFloors(spaces, stairs?.openings) : null;
        if (floors) {
          floors.children.forEach(floor => { floor.userData.levelId = level.id; });
          scope.add(floors);
        }

        if (showOutline3D) {
          const geometry = schematicGeometry(level);
          const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: colors[index % colors.length], transparent: true, opacity: .24, roughness: .86, depthWrite: false,
          }));
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({
            color: "#7290a2", transparent: true, opacity: .7,
          }));
          scope.add(body, edges);
        }
        if (walls) for (const room of level.rooms) {
          const space = spaces.find(s => s.name === room.name && s.number === room.number);
          const sports = space && isSportsFloor(space);
          if (!pins && !sports) continue;
          const label = roomLabel([room.number, room.name].filter(Boolean).join(" ") + (space ? " · " + space.area.toLocaleString() + " SF" : ""));
          label.position.set(room.at[0], sports ? .9 : display.height + 1.7, -room.at[1]);
          label.scale.set(sports ? 30 : 22, sports ? 4.2 : 3.1, 1);
          scope.add(label);
        }
        scope.traverse(object => {
          const data = object.userData;
          if (data.walls || data.doors || data.glazing || data.floorIndex !== undefined) current.pickables.push(object);
        });
        if (scope.children.length) current.group.add(scope);
      } catch (failure) {
        disposeGroup(scope);
        errors.push(failure instanceof Error ? failure.message : "The schematic could not be drawn.");
      }
    }
    error.current(errors.join(" "));
    const fitKey = [model.builtAt, explode, ...visible].join(":");
    if (current.group.children.length && fitted.current !== fitKey) {
      current.fit();
      fitted.current = fitKey;
    }
    current.invalidate();
  }, [model, spacesByLevel, visible, explode, pins, walls, cutaway, showOutline3D]);

  useEffect(() => {
    const current = sceneRef.current;
    if (!current) return;
    disposeGroup(current.highlight);
    if (selection && selection.kind !== "wall") {
      current.group.updateWorldMatrix(true, true);
      const matrix = new THREE.Matrix4();
      for (const object of current.pickables) {
        if (object.userData.levelId !== selection.levelId) continue;
        const mesh = object as THREE.Mesh | THREE.InstancedMesh;
        const addOutline = (transform: THREE.Matrix4) => {
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: "#608cff" }));
          edges.matrix.copy(transform);
          edges.matrixAutoUpdate = false;
          current.highlight.add(edges);
        };
        if ((selection.kind === "door" || selection.kind === "glazing") && mesh instanceof THREE.InstancedMesh) {
          const indices = selection.kind === "door" ? object.userData.doors : object.userData.glazing;
          (indices as number[] | undefined)?.forEach((index, i) => {
            if (index === selection.index) {
              mesh.getMatrixAt(i, matrix);
              addOutline(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, matrix));
            }
          });
        } else if (selection.kind === "floor" && object.userData.floorIndex === selection.index) {
          addOutline(mesh.matrixWorld);
        }
      }
    }
    current.invalidate();
  }, [model, selection, visible, explode, pins, walls, cutaway, showOutline3D, spacesByLevel]);

  // The picked wall: hidden in the model and drawn again as its layers, which open apart (once per wall: a redraw of the model
  // shows them already open). The camera turns to it the first time.
  const shown = useRef(""), hold = useRef({ mesh: null as THREE.InstancedMesh | null, instance: -1, matrix: new THREE.Matrix4() }).current;
  useEffect(() => {
    const current = sceneRef.current; if (!current) return;
    disposeGroup(current.opened);
    current.invalidate();
    const level = pick ? model.levels.find(l => l.id === pick.levelId) : undefined, wall = level && pick ? level.walls?.[pick.index] : undefined;
    if (!pick || !level || !wall || wall.excluded || !walls || !visible.includes(level.id)) { shown.current = ""; return; }
    const row = wall.type ? scheduleRow(wall.type, schedule) : null;
    const layers = row?.layers ? dimensionedWallLayers(row.layers, row.thickness, wall.thickness) : [];
    const opened = wallLayerGroup(level, pick.index, layers);
    if (!opened) return;
    opened.position.y += levelBase(model, level, explode);
    opened.userData.pick = { kind: "wall", levelId: level.id, index: pick.index } satisfies WallPick;
    let instances: THREE.InstancedMesh | null = null;
    current.group.traverse(o => { if (o.userData.levelId === level.id && o.userData.walls) instances = o as THREE.InstancedMesh; });
    const mesh = instances as THREE.InstancedMesh | null, instance = mesh ? (mesh.userData.walls as number[]).indexOf(pick.index) : -1;
    if (mesh && instance >= 0) { mesh.getMatrixAt(instance, hold.matrix); hold.mesh = mesh; hold.instance = instance; mesh.setMatrixAt(instance, new THREE.Matrix4().makeScale(0, 0, 0)); mesh.instanceMatrix.needsUpdate = true; mesh.userData.hidden = instance; }
    // Labels above each opened layer, stepped up so they don't cover each other, each with a leader down to its layer.
    const { length, height, gap } = opened.userData as { length: number; height: number; gap: number };
    // Labels sized for the distance the camera will stand at, so they read the same on a short wall and a long one.
    const slabs = layers.length ? layerSlabs(layers, wall.thickness) : [], distance = openedDistance(length, height, gap, slabs.length), tall = distance * .032, width = tall * 640 / 72;
    opened.userData.distance = distance; opened.userData.stack = slabs.length ? 1 + slabs.length * tall * 1.3 : 0;
    slabs.forEach((slab, i) => {
      const z = openedCenter(slab, i, slabs.length, gap), y = height / 2 + 1 + tall / 2 + i * tall * 1.3;
      const label = layerLabel(`${i + 1}  ${slab.material}${slab.inches !== null ? ` · ${inchesLabel(slab.inches)}` : slab.inside ? " · in the studs" : ""}`, layerColor(slab.material));
      // Drawn at the wall's -x end; labelsTowardCamera mirrors them to whichever end faces the viewer.
      label.position.set(-length / 2 + width / 2, y, z); label.scale.set(width, tall, 1); label.userData = { label: true, x0: label.position.x }; label.renderOrder = 2; opened.add(label);
      const leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-length / 2 + .3, height / 2, z), new THREE.Vector3(-length / 2 + .3, y - tall / 2, z)]), new THREE.LineBasicMaterial({ color: "#7c3aed", transparent: true, opacity: 0, depthTest: false }));
      leader.userData.label = true; leader.renderOrder = 2; opened.add(leader);
    });
    if (pick.layer !== undefined) opened.children.forEach(part => { if (part.userData.layer === pick.layer) ((part as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set("#5b21b6").multiplyScalar(.35); });
    // The rest of the building fades back while a wall is open, and room labels step aside, so its layers read clearly.
    const faded: { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }[] = [], hiddenLabels: THREE.Object3D[] = [];
    current.group.traverse(o => {
      if ((o as THREE.Sprite).isSprite) { if (o.visible) { o.visible = false; hiddenLabels.push(o); } return; }
      const materials = (o as THREE.Mesh).material; if (!materials) return;
      (Array.isArray(materials) ? materials : [materials]).forEach(material => { faded.push({ material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite }); material.transparent = true; material.opacity *= .1; material.depthWrite = false; material.needsUpdate = true; });
    });
    const key = `${model.builtAt}:${level.id}:${pick.index}:${layers.length}`, fresh = key !== shown.current;
    opened.userData.start = fresh ? performance.now() : -Infinity;
    current.opened.add(opened);
    current.labelsTowardCamera(opened);
    if (fresh) current.focus(opened);
    shown.current = key;
    return () => {
      if (hold.mesh && hold.instance >= 0 && hold.mesh.parent) { hold.mesh.setMatrixAt(hold.instance, hold.matrix); hold.mesh.instanceMatrix.needsUpdate = true; delete hold.mesh.userData.hidden; }
      hold.mesh = null; hold.instance = -1;
      faded.forEach(f => { f.material.opacity = f.opacity; f.material.transparent = f.transparent; f.material.depthWrite = f.depthWrite; f.material.needsUpdate = true; });
      hiddenLabels.forEach(o => { o.visible = true; });
    };
  }, [model, visible, explode, pins, walls, cutaway, showOutline3D, schedule, pick?.levelId, pick?.index, pick?.layer]);
  return <div className="sm-canvas" ref={host}/>;
}

type PlanPick = { kind: "wall" | "door" | "glazing" | "partition" | "column"; index: number };
type PlanFocus = { levelId: string; kind: "wall" | "door" | "glazing"; index: number; at: number };
type Change = { type?: string; excluded?: boolean };
/** The estimator's correction of the wall, door, glass, operable partition, guardrail or column picked on the plan. */
function PickEditor({ level, pick, types, onWall, onDoor, onGlazing, onPartition, onColumn, onClose }: { level: SchematicLevel; pick: PlanPick; types: string[]; onWall: (change: Change) => void; onDoor: (number: string) => void; onGlazing: (change: Change) => void; onPartition: (excluded: boolean) => void; onColumn: (excluded: boolean) => void; onClose: () => void }) {
  const wall = pick.kind === "wall" ? level.walls![pick.index] : null, door = pick.kind === "door" ? level.doors![pick.index] : null, glass = pick.kind === "glazing" ? level.glazing![pick.index] : null, partition = pick.kind === "partition" ? level.partitions![pick.index] : null, column = pick.kind === "column" ? level.columns![pick.index] : null;
  const [value, setValue] = useState(wall ? wall.type ?? "" : glass ? glass.type ?? "" : door?.number ?? "");
  const run = wall ?? glass ?? partition, length = run ? Math.round(Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) * 10) / 10 : 0;
  if (partition) { const rail = partition.kind === "railing", what = rail ? "guardrail" : "partition"; return <div className="sm-pick" role="group" aria-label={`${rail ? "Guardrail" : "Operable partition"} ${pick.index + 1}`}>
    <p><strong>{rail ? "Guardrail" : "Operable partition"} {pick.index + 1}</strong> · {length} ft · {Math.round(partition.thickness * 12 * 10) / 10}" thick · {partition.excluded ? `marked not a ${what}` : "divides the spaces either side"}</p>
    <Button onClick={() => onPartition(!partition.excluded)}>{partition.excluded ? `Restore this ${what}` : `Not a ${what}`}</Button>
    <Button onClick={onClose}>Close</Button>
  </div>; }
  if (column) return <div className="sm-pick" role="group" aria-label={`Column ${pick.index + 1}`}>
    <p><strong>Column {pick.index + 1}</strong> · {Math.round(column.width * 12)}" x {Math.round(column.depth * 12)}"{column.excluded ? " · marked not a column" : ""}</p>
    <Button onClick={() => onColumn(!column.excluded)}>{column.excluded ? "Restore this column" : "Not a column"}</Button>
    <Button onClick={onClose}>Close</Button>
  </div>;
  return <form className="sm-pick" aria-label={wall ? `Wall ${pick.index + 1}` : glass ? `Glass ${pick.index + 1}` : `Door ${door?.number ?? pick.index + 1}`} onSubmit={e => { e.preventDefault(); if (wall) onWall({ type: value }); else if (glass) onGlazing({ type: value }); else onDoor(value); }}>
    {wall ? <p><strong>Wall {pick.index + 1}</strong> · {length} ft · {Math.round(wall.thickness * 12 * 10) / 10}" thick · {wall.excluded ? "marked not a wall" : wall.type ? `${wall.type} ${wall.edited ? "(set by you)" : wall.typeSet ? "(set for untagged walls)" : "(from the plan's tag)"}` : "no type"}</p>
      : glass ? <p><strong>Glass {pick.index + 1}</strong> · {length} ft · {glass.excluded ? "marked not glass" : glass.type ?? "no storefront or window type"}</p>
      : <p><strong>Door{door?.number ? ` ${door.number}` : ""}</strong> · {door?.basis === "tagged-gap" ? "tagged opening" : door?.leaves === 2 ? "pair" : "single"} · {door?.width} ft wide</p>}
    <label className="ui-field">{wall ? "Wall type" : glass ? "Storefront or window type" : "Door number"}<input autoFocus maxLength={16} value={value} onChange={e => setValue(e.target.value)} list={wall ? "sm-wall-types" : undefined}/></label>
    {wall && <datalist id="sm-wall-types">{types.map(t => <option key={t} value={t}/>)}</datalist>}
    <Button type="submit" variant="primary">{wall ? "Save wall type" : glass ? "Save glass type" : "Save door number"}</Button>
    {wall && <Button onClick={() => onWall({ excluded: !wall.excluded })}>{wall.excluded ? "Restore this wall" : "Not a wall"}</Button>}
    {glass && <Button onClick={() => onGlazing({ excluded: !glass.excluded })}>{glass.excluded ? "Restore this glass" : "Not glass"}</Button>}
    <Button onClick={onClose}>Close</Button>
  </form>;
}

function OutlineSheet({ focus, onPickWall, level, spaces, doc, frameKey, frames, saveFrame, onMove, editable, types, onEditWall, onEditDoor, onEditGlazing, onEditPartition, onEditColumn }: { /** An opening or wall to locate in the source plan. */ focus?: PlanFocus | null; /** A wall picked on the plan, to open in 3D too. */ onPickWall?: (index: number) => void; level: SchematicLevel; spaces: Room[]; doc: StoredDocument; frameKey: string; frames: Record<string, SheetFrame>; saveFrame: (key: string, frame: SheetFrame) => void; onMove: (index: number, point: Point) => void; editable: boolean; types: string[]; onEditWall: (index: number, change: Change) => void; onEditDoor: (index: number, number: string) => void; onEditGlazing: (index: number, change: Change) => void; onEditPartition: (index: number, excluded: boolean) => void; onEditColumn: (index: number, excluded: boolean) => void }) {
  const [pick, setPick] = useState<PlanPick | null>(null);
  const [page, setPage] = useState<{ image: string; frame: SheetFrame | null } | null>(null), [error, setError] = useState("");
  const [aligning, setAligning] = useState(false), [drag, setDrag] = useState<{ index: number; point: Point } | null>(null), [corner, setCorner] = useState(0);
  const [coordinates, setCoordinates] = useState<Point>(level.outline[0]), [zoom, setZoom] = useState(1), [showWalls, setShowWalls] = useState(true);
  const svg = useRef<SVGSVGElement>(null), scroller = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null);
  const focusedElement = focus && (focus.kind === "door" ? level.doors?.[focus.index] : focus.kind === "glazing" ? level.glazing?.[focus.index] : level.walls?.[focus.index]);
  useEffect(() => {
    if (focus && focusedElement) { setPick({ kind: focus.kind, index: focus.index }); setShowWalls(true); setZoom(z => Math.max(z, 2)); }
  }, [focus?.at]);
  useEffect(() => {
    const sheet = frames[frameKey] ?? page?.frame;
    if (!focusedElement || !sheet || !image.current) return;
    let live = true;
    image.current.decode().catch(() => undefined).then(() => requestAnimationFrame(() => {
      const box = scroller.current; if (!live || !box) return;
      const x = (focusedElement.a[0] + focusedElement.b[0]) / 2 / sheet.width, y = (focusedElement.a[1] + focusedElement.b[1]) / 2 / sheet.height;
      box.scrollTo({ left: x * box.scrollWidth - box.clientWidth / 2, top: y * box.scrollHeight - box.clientHeight / 2, behavior: "smooth" });
    }));
    return () => { live = false; };
  }, [focus?.at, page, zoom]);
  useEffect(() => {
    let live = true; setPage(null); setError(""); setAligning(false); setDrag(null); setCorner(0);
    Promise.all([renderStoredPage(doc, level.source.page, 2400), openStoredPdf(doc).then(pdf => pdf.getPage(level.source.page))]).then(([render, pdfPage]) => {
      const viewport = pdfPage.getViewport({ scale: 1 });
      if (live) setPage({ image: render.image, frame: printedSheetFrame(level.sizing, viewport.width / 72, viewport.height / 72) });
    }, failure => { if (live) setError(failure instanceof Error ? failure.message : "The source sheet could not be opened."); });
    return () => { live = false; };
  }, [doc.id, level.id, level.source.page, level.sizing]);
  const points = openOutline(level.outline);
  useEffect(() => { setCoordinates(points[corner] ?? points[0]); }, [corner, level.outline]);
  const frame = frames[frameKey] ?? page?.frame, outline = points.map((p, i) => drag?.index === i ? drag.point : p);
  function fraction(event: React.PointerEvent): Point { const box = svg.current!.getBoundingClientRect(); return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]; }
  function commit(index: number, point: Point) {
    if (!footprintValid(points.map((p, i) => i === index ? point : p)) && footprintValid(points)) { setError("Keep a non-crossing outline with at least one square foot of area."); return; }
    setError(""); onMove(index, point);
  }
  return <div className="sm-outline"><p>{level.source.sheet} · PDF page {level.source.page} · {level.sizing}</p>{error && <p role="alert">{error}</p>}{!page && !error && <p role="status">Opening the original plan…</p>}{page && <>
    {!frame && <PreviewNote>Align the sheet before dragging. No printed scale was read; the model's area-based sizing is retained.</PreviewNote>}
    <div className="sm-outline-tools"><label>Outline corner<select aria-label="Outline corner to align or move" value={corner} onChange={e => setCorner(Number(e.target.value))}>{points.map((p, i) => <option key={i} value={i}>Corner {i + 1} · {p[0]}, {p[1]} ft</option>)}</select></label>{editable && <Button onClick={() => { setAligning(!aligning); setError(""); }}>{aligning ? "Cancel alignment" : frame ? "Realign sheet" : "Align sheet"}</Button>}{!!level.walls?.length && <Button aria-pressed={showWalls} onClick={() => setShowWalls(v => !v)}>{showWalls ? "Hide walls and doors read from the plan" : "Show walls and doors read from the plan"}</Button>}</div>
    <form className="sm-corner-form" onSubmit={event => { event.preventDefault(); if (frame) commit(corner, sheetPoint([coordinates[0] / frame.width, coordinates[1] / frame.height], frame)); }}>{(["X", "Y"] as const).map((axis, i) => <label className="ui-field" key={axis}>Corner {axis} · ft<input disabled={!editable || !frame} type="number" step=".1" min="0" max={frame ? i ? frame.height : frame.width : undefined} required value={coordinates[i]} onChange={e => setCoordinates(p => i ? [p[0], Number(e.target.value)] : [Number(e.target.value), p[1]])}/></label>)}<Button disabled={!editable || !frame} type="submit">Apply corner</Button><Button disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - .5))}>Zoom out plan</Button><Button disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + .5))}>Zoom in plan</Button></form>
    {aligning && <p role="status">Click the source plan at corner {corner + 1}'s matching location. The alignment is saved with this model version.</p>}
    <div className="sm-plan-scroll" ref={scroller}><div style={{ width: `${zoom * 100}%` }} className={`sm-plan-image ${aligning ? "is-aligning" : ""}`}><img ref={image} src={page.image} alt={`${level.source.sheet} original floor plan with schematic outline`}/><svg ref={svg} viewBox={frame ? `0 0 ${frame.width} ${frame.height}` : "0 0 1 1"} preserveAspectRatio="none" aria-label="Editable schematic outline over source drawing" onPointerDown={event => {
      if (!aligning) return;
      try { saveFrame(frameKey, alignSheetFrame(points[corner], fraction(event))); setAligning(false); setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : "The sheet could not be aligned."); }
    }} onPointerMove={event => { if (drag && frame) setDrag({ ...drag, point: sheetPoint(fraction(event), frame) }); }} onPointerUp={event => { if (drag && frame) { commit(drag.index, sheetPoint(fraction(event), frame)); setDrag(null); } }} onPointerCancel={() => setDrag(null)}>
      {frame && showWalls && <g aria-label={`${level.walls?.length ?? 0} walls read from the plan's lines`}>
        {spaces.map((r, i) => <g key={`r${i}`} pointerEvents="none">
          <path d={[r.outline, ...(r.holes ?? [])].map(ring => `M${ring.map(p => p.join(",")).join("L")}Z`).join(" ")}
            fillRule="evenodd" fill={r.open ? "none" : r.name ? "#d9a44a33" : "#94a3b833"}/>
          <text x={r.at[0]} y={r.at[1] + (r.name ? frame.width / 140 : 0)} fontSize={frame.width / 260} fill="#78350f" textAnchor="middle">{r.open ? "Open to below · " : ""}{r.area.toLocaleString()} SF</text>
        </g>)}
        {level.walls?.map((w, i) => { const on = pick?.kind === "wall" && pick.index === i; return <g key={i} onClick={editable && !aligning ? () => { setPick({ kind: "wall", index: i }); if (!w.excluded) onPickWall?.(i); } : undefined} style={{ cursor: editable ? "pointer" : undefined }}>
          <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={on ? "#7c3aed" : w.excluded ? "#9ca3af" : "#c2410c"} strokeOpacity={.85} strokeDasharray={w.excluded ? `${frame.width / 300}` : undefined} strokeWidth={Math.max(w.thickness, frame.width / (on ? 450 : 900))}/>
          <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="transparent" strokeWidth={frame.width / 150}><title>Wall {i + 1}{w.type ? ` · ${w.type}` : ""}{w.excluded ? " · not a wall" : ""}</title></line></g>; })}
        {level.doors?.map((d, i) => { const on = pick?.kind === "door" && pick.index === i; return <g key={`d${i}`} onClick={editable && !aligning ? () => setPick({ kind: "door", index: i }) : undefined} style={{ cursor: editable ? "pointer" : undefined }}><line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke={on ? "#7c3aed" : "#1d4ed8"} strokeWidth={frame.width / (on ? 300 : 500)}/>{d.hinges.map((h, j) => <line key={j} x1={h[0]} y1={h[1]} x2={d.openTo[j][0]} y2={d.openTo[j][1]} stroke="#15803d" strokeWidth={frame.width / 700}/>)}<line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="transparent" strokeWidth={frame.width / 150}><title>Door{d.number ? ` ${d.number}` : ""}</title></line>{d.number && <text x={(d.a[0] + d.b[0]) / 2} y={(d.a[1] + d.b[1]) / 2 - frame.width / 400} fontSize={frame.width / 260} fill="#1d4ed8" textAnchor="middle" fontWeight="600" pointerEvents="none">{d.number}</text>}</g>; })}
        {level.glazing?.map((g, i) => { const on = pick?.kind === "glazing" && pick.index === i; return <g key={`g${i}`} onClick={editable && !aligning ? () => setPick({ kind: "glazing", index: i }) : undefined} style={{ cursor: editable ? "pointer" : undefined }}><line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={on ? "#7c3aed" : g.excluded ? "#9ca3af" : "#0d9488"} strokeDasharray={g.excluded ? `${frame.width / 300}` : undefined} strokeWidth={frame.width / (on ? 300 : 550)}/><line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke="transparent" strokeWidth={frame.width / 150}><title>Glass{g.type ? ` · ${g.type}` : ""}{g.excluded ? " · not glass" : ""}</title></line>{g.type && !g.excluded && <text x={(g.a[0] + g.b[0]) / 2} y={(g.a[1] + g.b[1]) / 2 - frame.width / 400} fontSize={frame.width / 280} fill="#0f766e" textAnchor="middle" pointerEvents="none">{g.type}</text>}</g>; })}
        {level.partitions?.map((p, i) => { const on = pick?.kind === "partition" && pick.index === i; return <g key={`p${i}`} onClick={editable && !aligning ? () => setPick({ kind: "partition", index: i }) : undefined} style={{ cursor: editable ? "pointer" : undefined }}><line x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} stroke={on ? "#7c3aed" : p.excluded ? "#9ca3af" : p.kind === "railing" ? "#78350f" : "#a21caf"} strokeDasharray={p.excluded ? `${frame.width / 300}` : undefined} strokeWidth={frame.width / (on ? 300 : 550)}/><line x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} stroke="transparent" strokeWidth={frame.width / 150}><title>{p.kind === "railing" ? "Guardrail" : "Operable partition"}{p.excluded ? " · not one" : ""}</title></line></g>; })}
        {level.columns?.map((c, i) => { const on = pick?.kind === "column" && pick.index === i; return <g key={`c${i}`} transform={`translate(${c.at[0]} ${c.at[1]}) rotate(${c.angle * 180 / Math.PI})`} onClick={editable && !aligning ? () => setPick({ kind: "column", index: i }) : undefined} style={{ cursor: editable ? "pointer" : undefined }}><rect x={-c.width / 2} y={-c.depth / 2} width={c.width} height={c.depth} fill={on ? "#7c3aed" : c.excluded ? "#9ca3af" : "#1f2937"} fillOpacity={c.excluded ? .5 : .85}/><rect x={-1.2} y={-1.2} width={2.4} height={2.4} fill="transparent"><title>Column{c.excluded ? " · not a column" : ""}</title></rect></g>; })}
        {level.walls?.map((w, i) => w.type && !w.typeSet && !w.excluded ? <text key={`t${i}`} x={(w.a[0] + w.b[0]) / 2} y={(w.a[1] + w.b[1]) / 2 + frame.width / 250} fontSize={frame.width / 280} fill="#7c2d12" textAnchor="middle" pointerEvents="none">{w.type}</text> : null)}</g>}
      {frame && <><polygon points={outline.map(p => p.join(",")).join(" ")} fill="#4b92ba33" stroke="#245e95" strokeWidth={frame.width / 600} pointerEvents="none"/>{outline.map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={frame.width / 90} fill={i === corner ? "#ed7541" : "#fff"} stroke="#245e95" strokeWidth={frame.width / 650} tabIndex={editable ? 0 : -1} role="button" aria-label={`Move outline corner ${i + 1}; ${point[0]}, ${point[1]} feet`} onPointerDown={event => { if (!editable || aligning) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setCorner(i); setDrag({ index: i, point }); }} onKeyDown={event => {
        if (!editable || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? .1 : 1; const p: Point = [point[0] + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), point[1] + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)]; commit(i, sheetPoint([p[0] / frame.width, p[1] / frame.height], frame));
      }}><title>Corner {i + 1}: {point[0]}, {point[1]} ft</title></circle>)}</>}
    </svg></div></div>
    {pick && (pick.kind === "wall" ? level.walls?.[pick.index] : pick.kind === "door" ? level.doors?.[pick.index] : pick.kind === "partition" ? level.partitions?.[pick.index] : pick.kind === "column" ? level.columns?.[pick.index] : level.glazing?.[pick.index]) && <PickEditor key={`${pick.kind}${pick.index}`} level={level} pick={pick} types={types} onWall={(change) => onEditWall(pick.index, change)} onDoor={number => onEditDoor(pick.index, number)} onGlazing={(change) => onEditGlazing(pick.index, change)} onPartition={excluded => onEditPartition(pick.index, excluded)} onColumn={excluded => onEditColumn(pick.index, excluded)} onClose={() => setPick(null)}/>}
    {editable && showWalls && !!level.walls?.length && <p>Click a wall, door, glass, operable partition, guardrail or column on the plan to correct it, or to mark one that isn't what was read.</p>}
    <p>{editable && frame ? "Drag a corner to correct the outline, or enter its coordinates above. Keyboard: focus a corner, then use arrows for 1 ft or Shift + arrows for 0.1 ft. Changes save when you release." : "Review the outline against the original. Align the source sheet to enable corrections."}</p>
  </>}</div>;
}

/** The rooms the walls enclose, with their areas, and the room names on the plan that have no enclosed space of their own. */
function RoomsDetails({ level, spaces, onOpen }: { level: SchematicLevel; spaces: Room[]; /** Missing on the lowest level, or while building. */ onOpen?: (space: Room, open: boolean) => void }) {
  const loose = level.rooms.filter(r => !spaces.some(s => s.name === r.name && s.number === r.number));
  const sorted = [...spaces].sort((a, b) => Number(!!b.name) - Number(!!a.name) || a.number.localeCompare(b.number, undefined, { numeric: true }) || b.area - a.area);
  const floors = spaces.filter(r => !r.open), open = spaces.length - floors.length;
  const label = (r: Room) => `${r.number} ${r.name || "unnamed space"} (${r.area.toLocaleString()} SF)`.trim();
  return <details><summary>{spaces.length ? `Rooms · ${floors.length} enclosed by the walls, ${floors.filter(r => r.name).length} named · ${floors.reduce((n, r) => n + r.area, 0).toLocaleString()} SF${open ? ` · ${open} open to below, not counted` : ""}` : `${level.rooms.length} room names`} · Check against the plan</summary>
    {!!spaces.length && <div className="sm-table-wrap"><table className="ui-table"><thead><tr><th>Number</th><th>Room</th><th>Area · SF</th>{onOpen && <th>Floor</th>}</tr></thead><tbody>{sorted.map((r, i) => <tr key={i}><td>{r.number}</td><td>{r.name || "Unnamed space"}{r.open ? " · open to below" : ""}</td><td>{r.open ? <s>{r.area.toLocaleString()}</s> : r.area.toLocaleString()}</td>{onOpen && <td><button type="button" className="ui-btn secondary" aria-label={r.open ? `Restore the floor of ${label(r)}` : `Mark ${label(r)} open to below`} onClick={() => onOpen(r, !r.open)}>{r.open ? "Restore floor" : "Open to below"}</button></td>}</tr>)}</tbody></table></div>}
    {!!loose.length && <p>{spaces.length ? "Named on the plan without an enclosed space of their own (open to another space, or a wall wasn't read)" : "Room names read on the plan"}: {loose.map(r => `${r.number} ${r.name}`.trim()).join(" · ")}.</p>}
    {!!spaces.length && <p>Areas are measured to the wall centerlines, from the walls, doors and glass read on the plan; marking something not a wall or not glass updates them.{onOpen ? " A space open to the level below (a gym's upper volume, an atrium) has no floor in the model and isn't counted; the plan marks these with a large X, and you can correct them here." : ""}</p>}
  </details>;
}

/** The stairs arriving at a level from the one below: what the plan shows, how they rise, and the estimator's "Not a stair". */
function StairsDetails({ level, rise, onExclude }: { level: SchematicLevel; rise: number | null; onExclude?: (index: number, excluded: boolean) => void }) {
  if (!level.stairs?.length || !rise) return null;
  // To the nearest quarter inch, as a drawing prints it: 4'-4 1/4".
  const inches = (feet: number) => { const quarters = Math.round(feet * 48), ft = Math.floor(quarters / 48), whole = Math.floor((quarters % 48) / 4), part = ["", " 1/4", " 1/2", " 3/4"][quarters % 4]; return ft ? `${ft}'-${whole}${part}"` : `${whole}${part}"`; };
  const kept = level.stairs.filter(s => !s.excluded);
  return <details><summary>Stairs · {kept.length} up from the level below · {inches(rise)} floor to floor</summary>
    <div className="sm-table-wrap"><table className="ui-table"><thead><tr><th>Stair</th><th>Flights on the plan</th><th>Risers</th><th>Width</th>{onExclude && <th>Check</th>}</tr></thead><tbody>{level.stairs.map((stair, i) => {
      const pieces = stairPieces(stair.flights, rise), widths = stair.flights.map(f => inches(f.width));
      return <tr key={i}><td>Stair {i + 1}{stair.excluded ? " · marked not a stair" : ""}</td><td>{stair.flights.map(f => f.risers).join(" + ")} risers{pieces?.repeated ? ` · goes round ${pieces.runs - stair.flights.length} more ${pieces.runs - stair.flights.length === 1 ? "time" : "times"} under them to reach the floor below` : ""}</td><td>{pieces ? `${pieces.risers} of ${inches(pieces.riser)}` : "Not read"}</td><td>{[...new Set(widths)].join(", ")}</td>{onExclude && <td><button type="button" className="ui-btn secondary" aria-label={`${stair.excluded ? "Restore" : "Not a stair:"} stair ${i + 1}`} onClick={() => onExclude(i, !stair.excluded)}>{stair.excluded ? "Restore" : "Not a stair"}</button></td>}</tr>;
    })}</tbody></table></div>
    <p>Read from the treads and walkline arrow on this level's plan. Risers are the tread lines the plan shows; where they would rise more than 7" each, the stair goes round again under the flights shown. Check them against the stair sections.</p>
  </details>;
}

/**
 * The wall picked in the 3D view: what it is, its layers as the partition type sheet gives them (from the tag side), whether
 * they add up to the schedule's thickness, and where to check it: on the plan, and on the partition type sheet.
 */
function WallLayersCard({ level, index, layer, schedule, sheet, reading, onLayer, onClose, onShowPlan, onOpenSheet, onRead }: { level: SchematicLevel; index: number; layer?: number; schedule: PartitionType[]; sheet?: string; reading: boolean; onLayer: (layer: number) => void; onClose: () => void; onShowPlan: () => void; onOpenSheet?: () => void; /** Missing while building, or when the sheet already gave layers. */ onRead?: () => void }) {
  const wall = level.walls?.[index];
  if (!wall) return null;
  const length = Math.round(Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) * 10) / 10, row = wall.type ? scheduleRow(wall.type, schedule) : null;
  const layers = row?.layers ?? [], slabs = layerSlabs(layers, wall.thickness), fit = row ? layersFit(layers, row.thickness) : "unknown";
  const hasLayerGeometry = !!row && dimensionedWallLayers(layers, row.thickness, wall.thickness).length > 0;
  const total = slabs.filter(s => !s.inside).reduce((sum, s) => sum + (s.inches ?? 0), 0), measured = Math.round(wall.thickness * 12 * 10) / 10;
  // A wall much thicker or thinner on the plan than its type: likely the wrong type (or a tag read onto the wrong wall).
  const printed = row ? parseInches(row.thickness) : null, mismatch = printed !== null && Math.abs(measured - printed) > Math.max(1.5, printed * .3);
  const why = !wall.type ? "This wall has no type: no tag on the plan points to it. Give it one on the plan, or set the untagged walls' type under Wall length by type."
    : !schedule.length ? sheet ? `The partition types on ${sheet} haven't been read.` : "No partition type sheet was found in the drawings, so this wall's layers can't be read."
    : !row ? `${wall.type} isn't in the partition schedule${sheet ? ` on ${sheet}` : ""}: check its tag on the plan.`
    : !layers.length ? schedule.some(t => t.layers?.length) ? `The legend and sections on ${sheet ?? "the partition type sheet"} didn't give ${wall.type}'s layers. Check it on the sheet.` : `${wall.type}'s layers haven't been read from ${sheet ?? "the partition type sheet"} yet.` : "";
  return <section className="sm-layers" aria-label={`Wall ${index + 1} layers`}>
    <header><div><strong>Wall {index + 1}{wall.type ? ` · ${wall.type}` : ""}</strong><span>{level.name} · {length} ft long · {measured}" thick on the plan</span></div><button type="button" className="sm-layers-close" aria-label="Close the wall's layers" onClick={onClose}>×</button></header>
    {row && <p>{[row.description, row.thickness && `${row.thickness} on the schedule`, row.rating && `Rating ${row.rating}`].filter(Boolean).join(" · ")}</p>}
    {mismatch && <p className="sm-layers-warn">On the plan this wall measures {measured}", but {wall.type} is {row!.thickness}: check its type on the plan.</p>}
    {layers.length ? <>
      <ol className="sm-layer-list">{slabs.map((s, i) => <li key={i}><button type="button" disabled={!hasLayerGeometry} aria-pressed={layer === i} onClick={() => onLayer(i)}><span className="sm-swatch" style={{ background: layerColor(s.material) }}/><span>{i + 1}. {s.material}</span><span>{s.inches !== null ? inchesLabel(s.inches) : s.inside ? "in the stud cavity" : "not given"}</span></button></li>)}</ol>
      {!hasLayerGeometry && <p>3D layers require a thickness for each layer and agreement with the wall on the plan.</p>}
      <p className={fit === "off" ? "sm-layers-warn" : undefined}>{fit === "fits" ? `The layers add up to ${inchesLabel(total)}, the schedule's ${row!.thickness}.` : fit === "off" ? `The layers add up to ${inchesLabel(total)}, but the schedule prints ${row!.thickness}: check ${wall.type} on ${sheet ?? "the partition type sheet"}.` : "Not every thickness is given, so the layers can't be checked against the schedule."}</p>
      <p>Listed from the side the tag is on. Worked out by AI from {sheet ?? "the partition type sheet"}'s legend and typical sections; check them on the sheet.</p>
    </> : <p>{why}</p>}
    <div className="sm-layers-actions">
      <Button onClick={onShowPlan}>Show on the plan</Button>
      {onOpenSheet && <Button onClick={onOpenSheet}>Open {sheet}</Button>}
      {onRead && sheet && wall.type && !layers.length && (!schedule.length || row && !schedule.some(t => t.layers?.length)) && <Button disabled={reading} onClick={onRead}>{reading ? "Reading the layers…" : `Read the wall layers on ${sheet}`}</Button>}
    </div>
  </section>;
}

export function SchematicModelStudio({ project, navigate, notify }: { project: Project } & Pick<ViewProps, "navigate" | "notify">) {
  const { model, run } = useSchematicModel(), { documents, ready } = useProjectDocuments();
  const [pending, setPending] = useState<SchematicModel | null>(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState(""), [graphicsError, setGraphicsError] = useState("");
  const [selected, setSelected] = useState(""), [shown, setShown] = useState<string[] | null>(null), [explode, setExplode] = useState(false), [pins, setPins] = useState(false), [walls, setWalls] = useState(true), [showOutlineEditor, setShowOutlineEditor] = useState(false), [source, setSource] = useState<{ documentId: string; sheet: string; page: number; label: string; quote?: string } | null>(null);
  const [cutaway, setCutaway] = useState(true), [outlinePreference, setOutlinePreference] = useState<boolean | null>(null);
  const [untaggedType, setUntaggedType] = useState("");
  const [height, setHeight] = useState("14"), [frames, setFrames] = useLocalDraft<Record<string, SheetFrame>>("schematic-sheet-frames", {});
  const [selection, setSelection] = useState<SchematicPick | null>(null), [planFocus, setPlanFocus] = useState<PlanFocus | null>(null), [readingLayers, setReadingLayers] = useState(false);
  const abort = useRef<AbortController | null>(null), layersAbort = useRef<AbortController | null>(null), camera = useRef<CameraApi | null>(null), viewer = useRef<HTMLDivElement>(null), outlinePanel = useRef<HTMLDivElement>(null);
  const current = pending ?? model, level = current?.levels.find(l => l.id === selected) ?? current?.levels[0];
  const firstLevelId = current?.levels[0]?.id;
  const visible = useMemo(() => current?.levels.filter(l => shown ? shown.includes(l.id) : l.id === firstLevelId).map(l => l.id) ?? [], [current, shown, firstLevelId]);
  const spacesByLevel = useMemo(() => new Map(current?.levels.map(item => [item.id, levelSpaces(item)])), [current]);
  const spaces = (level && spacesByLevel.get(level.id)) ?? [];
  const hasPlanDetails = current?.levels.some(item => visible.includes(item.id) && (
    item.walls?.some(wall => !wall.excluded) || item.doors?.some(door => door.kind === "door") ||
    [item.glazing, item.partitions, item.columns, item.stairs].some(parts => parts?.some(part => !part.excluded))
  ));
  // Older readings with just a footprint open with it visible, until the user chooses otherwise.
  const showOutline3D = outlinePreference ?? !hasPlanDetails;
  const activePick = walls && selection && visible.includes(selection.levelId) ? selection : null;
  const wallPick = activePick?.kind === "wall" ? activePick : null;
  const doc = documents.find(d => d.id === level?.source.documentId), sourceDoc = documents.find(d => d.id === source?.documentId);
  const register = drawingRegister(documents), section = heightSheet(register);
  const schedule = current?.partitionTypes ?? NO_TYPES, typeSheet = partitionTypeSheet(register), typeSheetName = current?.partitionSheet ?? typeSheet?.sheet;
  const typeSheetRow = register.find(r => r.sheet === typeSheetName), pickLevel = wallPick ? current?.levels.find(l => l.id === wallPick.levelId) : undefined;
  useEffect(() => () => { abort.current?.abort(); layersAbort.current?.abort(); }, []);
  useEffect(() => { setSelection(null); setPlanFocus(null); }, [current?.builtAt]);
  useEffect(() => { if (planFocus) outlinePanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [planFocus]);
  function inspect(pick: SchematicPick) {
    setWalls(true);
    if (!visible.includes(pick.levelId)) { setShown([pick.levelId]); setExplode(false); }
    if (planFocus?.levelId !== pick.levelId) setPlanFocus(null);
    setSelected(pick.levelId);
    setSelection(pick);
  }
  function openWall(levelId: string, index: number) {
    inspect({ kind: "wall", levelId, index });
    viewer.current?.scrollIntoView({ block: "nearest" });
  }
  function showOnPlan(levelId: string, kind: PlanFocus["kind"], index: number) {
    setSelected(levelId);
    setShowOutlineEditor(true);
    setPlanFocus({ levelId, kind, index, at: Date.now() });
  }
  function openDimension(dimension: DimensionSource, label: string) {
    setSource({ ...dimension, label });
  }
  async function readLayers() {
    const control = new AbortController(); layersAbort.current = control; setReadingLayers(true); setError("");
    try {
      const read = await readWallLayers(documents, control.signal);
      if (control.signal.aborted) return;
      change(m => setPartitionTypes(m, read.partitionTypes, read.partitionSheet));
      const withLayers = read.partitionTypes.filter(t => t.layers?.length).length;
      notify(withLayers ? `Layers read for ${withLayers} of ${read.partitionTypes.length} wall types on ${read.partitionSheet}. Check them on the sheet.` : `${read.partitionSheet}'s legend and sections didn't give the wall types' layers.`);
    } catch (failure) { if (!control.signal.aborted) setError(failure instanceof Error ? failure.message : "The wall layers could not be read."); }
    finally { if (layersAbort.current === control) { setReadingLayers(false); layersAbort.current = null; } }
  }
  useEffect(() => { setHeight(String(level?.height ?? 14)); }, [level?.id, level?.height]);
  async function build() {
    const control = new AbortController(); abort.current = control; setBusy(true); setError(""); setProgress("Finding floor plans…");
    try { const built = await buildSchematicModel({ documents, project, signal: control.signal, onProgress: text => { if (!control.signal.aborted) setProgress(text); } }); if (!control.signal.aborted) { setPending(built); setShown(null); setSelected(built.levels[0]?.id ?? ""); setProgress("Review the schematic and its source sheets before saving."); } }
    catch (failure) { if (!control.signal.aborted) setError(failure instanceof Error ? failure.message : "The schematic model could not be built."); }
    finally { if (abort.current === control) { setBusy(false); abort.current = null; } }
  }
  function change(action: (m: SchematicModel) => SchematicModel) {
    if (pending) {
      try { setPending(action(pending)); }
      catch (failure) {
        setError(failure instanceof Error ? failure.message : "The preview could not be corrected.");
        return;
      }
      setError("");
    } else {
      const message = run(m => {
        if (!m) throw new Error("Build and accept a schematic first.");
        return action(m);
      });
      setError(message ?? "");
      if (message) return;
    }
    // Room polygons are derived from the corrected drawing geometry and may have different indices.
    setSelection(pick => pick?.kind === "floor" ? null : pick);
  }
  return <div className="sm-studio"><PageHeader eyebrow={`${project.name} / Model studio`} title="Schematic model" description="Inspect the rooms, openings and levels read from your floor plans." actions={<><Button onClick={() => navigate("documents")}>Project files</Button>{busy ? <Button onClick={() => { abort.current?.abort(); setProgress("Build stopped. The saved model is retained."); }}>Stop building</Button> : <Button disabled={!ready || !documents.length} variant="primary" onClick={build}>{model || pending ? "Rebuild schematic model" : "Build a schematic model from the drawings"}</Button>}</>}/>
    <PreviewNote><strong>Schematic: not measured</strong> · Check the footprint, scale and heights. Room names are read by AI; check them.</PreviewNote>
    {(busy || progress) && <p role="status">{progress}</p>}{error && <p role="alert">{error}</p>}
    {pending && <div className="sm-review"><Badge tone="amber">AI preview · Not saved</Badge><Button disabled={busy} variant="primary" onClick={() => { if (pending.levels.some(l => !footprintValid(l.outline) || !Number.isFinite(l.height) || l.height < 6 || l.height > 60)) { setError("Correct crossing or collapsed outlines and heights outside 6 to 60 ft before saving."); return; } const message = run(() => pending); if (message) setError(message); else { setPending(null); setProgress(""); notify("Schematic saved. Check its source sheets and correct the outline or heights as needed."); } }}>Use this schematic model</Button><Button onClick={() => { setPending(null); setProgress(""); }}>Discard preview</Button></div>}
    {!current ? <Panel><Empty title={documents.length ? "Ready to read your floor plans" : "Upload floor plans and building sections"} description="Architectural floor-plan titles identify levels. A section or elevation sheet provides floor heights. Missing scales or heights are labelled as assumptions." action={<Button onClick={() => navigate("documents")}>Open project files</Button>}/></Panel> : <>
      <div className="sm-workspace">
        <div className="sm-viewer" ref={viewer}>
          <div className="sm-toolbar">
            <span className="sm-view-caption">{visible.length === 1 ? current.levels.find(item => item.id === visible[0])?.name : "Drawing model"}</span>
            <div className="sm-view-buttons">
              <Button onClick={() => { setSelection(null); camera.current?.home(); }}>Reset view</Button>
              <Button onClick={() => { setSelection(null); camera.current?.top(); }}>Top view</Button>
              <div className="sm-zoom" role="group" aria-label="Model zoom">
                <button type="button" className="ui-btn secondary" aria-label="Zoom out" onClick={() => camera.current?.zoom(1.2)}>−</button>
                <button type="button" className="ui-btn secondary" aria-label="Zoom in" onClick={() => camera.current?.zoom(1 / 1.2)}>+</button>
              </div>
            </div>
          </div>
          {!visible.length && <p className="sm-empty-view" role="status">Select a level to show its model.</p>}
          {!!visible.length && !showOutline3D && (!hasPlanDetails || !walls) &&
            <p className="sm-empty-view" role="status">Turn on the 3D outline to see the footprint.</p>}
          <div className="sm-canvas-wrap">
            <SchematicCanvas model={current} spacesByLevel={spacesByLevel} visible={visible} explode={explode} pins={pins}
              walls={walls} cutaway={cutaway} showOutline3D={showOutline3D} schedule={schedule}
              selection={activePick} onPick={pick => { setSelection(pick); if (pick) setSelected(pick.levelId); }}
              camera={camera} onError={setGraphicsError}/>
            {wallPick && pickLevel && <WallLayersCard key={pickLevel.id + ":" + wallPick.index} level={pickLevel} index={wallPick.index}
              layer={wallPick.layer} schedule={schedule} sheet={typeSheetName} reading={readingLayers}
              onLayer={layer => setSelection({ ...wallPick, layer: wallPick.layer === layer ? undefined : layer })}
              onClose={() => setSelection(null)} onShowPlan={() => showOnPlan(pickLevel.id, "wall", wallPick.index)}
              onOpenSheet={typeSheetRow ? () => setSource({ documentId: typeSheetRow.doc.id, sheet: typeSheetRow.sheet, page: typeSheetRow.page, label: "Partition types" }) : undefined}
              onRead={busy || !typeSheet ? undefined : readLayers}/>}
          </div>
          {graphicsError && <p className="sm-empty-view" role="alert">{graphicsError}</p>}
          <div className="sm-options" role="group" aria-label="Model display options">
            <label><input type="checkbox" checked={cutaway} onChange={e => setCutaway(e.target.checked)}/>Cutaway walls</label>
            <label><input type="checkbox" checked={pins} onChange={e => setPins(e.target.checked)}/>All room labels</label>
            <label><input type="checkbox" checked={showOutline3D} onChange={e => setOutlinePreference(e.target.checked)}/>Show 3D outline</label>
            <label><input type="checkbox" checked={walls} onChange={e => setWalls(e.target.checked)}/>Plan details</label>
            {current.levels.length > 1 && <label><input type="checkbox" checked={explode} onChange={e => {
              setExplode(e.target.checked);
              if (e.target.checked) setShown(current.levels.map(item => item.id));
            }}/>Explode levels</label>}
          </div>
          <small>Drag to orbit · Scroll to zoom · Select an element to inspect</small>
        </div>
        <aside className="sm-levels">
          <SchematicObjectInspector levels={current.levels} spaces={spacesByLevel}
            pick={activePick?.kind === "wall" ? null : activePick} canOpenPlan={item => documents.some(document => document.id === item.source.documentId)}
            onPick={(pick, isolateLevel) => {
              inspect(pick);
              if (isolateLevel) {
                setShown([pick.levelId]); setCutaway(true); setExplode(false);
                viewer.current?.scrollIntoView({ block: "nearest" });
              }
            }}
            onClose={() => setSelection(null)} onDimension={openDimension} onPlan={(item, pick) => {
              if (pick.kind === "door" || pick.kind === "glazing") showOnPlan(item.id, pick.kind, pick.index);
              else setSource({ ...item.source, label: item.name });
            }}/>
          <Panel title="Levels and sources" subtitle={current.levels.length + (current.levels.length === 1 ? " level" : " levels")} action={current.levels.length > 1 && visible.length < current.levels.length ? <Button onClick={() => setShown(current.levels.map(item => item.id))}>Show all</Button> : undefined}>{current.levels.map((l, i) => <article key={l.id} className={level?.id === l.id ? "active" : ""}><div className="sm-level-heading"><input type="checkbox" aria-label={"Show " + l.name} checked={visible.includes(l.id)} onChange={e => { setShown(e.target.checked ? [...visible, l.id] : visible.filter(id => id !== l.id)); if (!e.target.checked && selection?.levelId === l.id) setSelection(null); }}/><span aria-hidden="true" style={{ background: colors[i % colors.length] }}/><button type="button" onClick={() => { setSelected(l.id); setShown([l.id]); setExplode(false); setSelection(null); setPlanFocus(null); }}>{l.name}</button></div><p>Elevation {l.elevation} ft · Height {l.height} ft<br/>{Math.round(polygonArea(l.outline)).toLocaleString()} SF footprint · {l.rooms.length} rooms<br/>{(t => t ? `${t.count.toLocaleString()} walls · ${t.feet.toLocaleString()} ft of wall${t.doors === null ? "" : ` · ${t.doors} doors${t.compartments ? ` (+${t.compartments} toilet-stall doors)` : ""}`}${t.glassFeet === null ? "" : ` · ${t.glassFeet.toLocaleString()} ft of glass`}${t.partitionFeet ? ` · ${t.partitionFeet.toLocaleString()} ft of operable partition` : ""}${t.railingFeet ? ` · ${t.railingFeet.toLocaleString()} ft of guardrail` : ""}${t.columns ? ` · ${t.columns} columns` : ""}${t.stairs ? ` · ${t.stairs} ${t.stairs === 1 ? "stair" : "stairs"} up from the level below` : ""}` : "Rebuild to read walls from the plan's lines")(wallTotals(l))}</p><p>{l.sizing}</p><button className="sm-source-link" onClick={() => { setSelected(l.id); setSource({ ...l.source, label: l.name }); }}>{l.source.sheet} · PDF page {l.source.page}</button></article>)}</Panel>
      {level && <Panel title={`${level.name} corrections`}>
        <SchematicHeightEvidence level={level} onOpen={openDimension}/>
        <form onSubmit={event => { event.preventDefault(); change(m => setLevelHeight(m, level.id, Number(height))); }}>
          <label className="ui-field">Floor-to-floor height · ft<input disabled={busy} type="number" min="6" max="60" step=".001" required value={height} onChange={event => setHeight(event.target.value)}/></label>
          <Button disabled={busy} type="submit">Apply height</Button>
        </form>
        <p>Levels above move when you apply a new height.</p>
        {section && !level.vertical?.datum && <Button onClick={() => setSource({ documentId: section.doc.id, sheet: section.sheet, page: section.page, label: "Height source" })}>Check heights on {section.sheet}</Button>}
        <button type="button" className="ui-btn secondary" aria-expanded={showOutlineEditor} onClick={() => setShowOutlineEditor(v => !v)}>{showOutlineEditor ? "Close outline editor" : "Edit outline on source sheet"}</button>
        {level.wallNote && <p>Walls: {level.wallNote} They are read from the drawing's own lines, not traced by hand; check them on the sheet. Wall quantities are not priced yet.</p>}
      {!!level.walls?.length && <details><summary>Wall length by type · {keptWalls(level).filter(w => w.type && !w.typeSet && !w.edited).length} walls typed from the plan's tags{level.walls.some(w => w.edited || w.excluded) ? ` · ${level.walls.filter(w => w.edited || w.excluded).length} corrected by you` : ""}</summary>
        <div className="sm-table-wrap"><table className="ui-table"><thead><tr><th>Type</th><th>What it is</th><th>Rough thickness</th><th>Rating</th><th>Walls</th><th>Length · ft</th><th>Face area · SF</th><th>Layers</th></tr></thead><tbody>{wallTypeTotals(keptWalls(level), level.height).map(t => {
          const row = t.type === "Untagged" ? null : scheduleRow(t.type, current.partitionTypes ?? []), wall = longestWallOfType(level, t.type);
          return <tr key={t.type}><td>{t.type}</td><td>{t.type === "Untagged" ? "No tag on the plan" : row ? row.description : current.partitionTypes?.length ? <strong>Not in the partition schedule: check the tag on the plan</strong> : "—"}</td><td>{row?.thickness ?? ""}</td><td>{row?.rating ?? ""}</td><td>{t.walls}</td><td>{t.feet.toLocaleString()}</td><td>{t.squareFeet.toLocaleString()}</td><td>{wall >= 0 && <button type="button" className="ui-btn secondary" aria-label={`Open the longest ${t.type === "Untagged" ? "untagged wall" : `${t.type} wall`} in 3D${row?.layers?.length ? " to see its layers" : ""}`} onClick={() => openWall(level.id, wall)}>{row?.layers?.length ? `${row.layers.length} layers · Open in 3D` : "Open in 3D"}</button>}</td></tr>;
        })}</tbody></table></div>
        {!!level.glazing?.filter(g => !g.excluded).length && <p>Glass: {glazingTotals(level.glazing.filter(g => !g.excluded)).map(t => `${t.type} ${t.feet.toLocaleString()} ft`).join(" · ")}</p>}
        <p>Types come from the partition tags on the plan{current.partitionSheet ? `; what each one is, from the partition schedule on ${current.partitionSheet}` : ""}. Typical partitions are often not tagged; set them below once you have checked the general notes.</p>
        <form onSubmit={e => { e.preventDefault(); change(m => setUntaggedWallType(m, level.id, untaggedType)); }}><label className="ui-field">Set untagged walls to<input disabled={busy} maxLength={16} value={untaggedType} onChange={e => setUntaggedType(e.target.value)} placeholder="e.g. SA3.10"/></label><Button disabled={busy} type="submit">{untaggedType.trim() ? "Apply to untagged walls" : "Clear the type I set"}</Button></form>
      </details>}<StairsDetails level={level} rise={stairRise(current, level)} onExclude={busy ? undefined : (index, excluded) => change(m => editStair(m, level.id, index, excluded))}/><RoomsDetails level={level} spaces={spaces} onOpen={busy || level.order === Math.min(...current.levels.map(l => l.order)) ? undefined : (space, open) => change(m => setOpenToBelow(m, level.id, space, open))}/></Panel>}</aside></div>
      {current.warnings.length > 0 && <Panel title="Sizing and reading warnings"><ul>{current.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></Panel>}
      {showOutlineEditor && level && <div ref={outlinePanel} className="sm-outline-panel"><Panel title={`${level.name} outline correction`} subtitle="Uses the original stored plan. Printed scale or your explicit alignment fixes the image-to-feet conversion.">{doc ? <OutlineSheet key={`${current.builtAt}:${level.id}`} focus={planFocus?.levelId === level.id ? planFocus : null} onPickWall={index => inspect({ kind: "wall", levelId: level.id, index })} level={level} spaces={spaces} doc={doc} frameKey={`${current.builtAt}:${level.id}`} frames={frames} saveFrame={(key, frame) => setFrames(values => ({ ...values, [key]: frame }))} editable={!busy} types={[...new Set([...current.levels.flatMap(l => (l.walls ?? []).map(w => w.type).filter((t): t is string => !!t)), ...(current.partitionTypes ?? []).map(t => t.tag)])].sort()} onEditWall={(index, edit) => change(m => editWall(m, level.id, index, edit))} onEditDoor={(index, number) => change(m => editDoorNumber(m, level.id, index, number))} onEditGlazing={(index, edit) => change(m => editGlazing(m, level.id, index, edit))} onEditPartition={(index, excluded) => change(m => editPartition(m, level.id, index, excluded))} onEditColumn={(index, excluded) => change(m => editColumn(m, level.id, index, excluded))} onMove={(index, point) => change(m => { const original = m.levels.find(l => l.id === level.id)!; const moved = moveOutlinePoint(m, level.id, index, point); return index === 0 && openOutline(original.outline).length !== original.outline.length ? moveOutlinePoint(moved, level.id, original.outline.length - 1, point) : moved; })}/> : <p role="alert">The original source document is unavailable. Restore it in Project files to correct this outline.</p>}</Panel></div>}
    </>}
    {source && <Modal wide title={`${source.sheet} source drawing`} subtitle={`${source.label} · PDF page ${source.page}`} onClose={() => setSource(null)}>{sourceDoc ? <StoredDocumentViewer doc={sourceDoc} page={source.page} onPageChange={() => {}} range={{ first: source.page, last: source.page }} highlight={source.quote}/> : <p role="alert">This source document is unavailable. Open Project files to restore it.</p>}</Modal>}
  </div>;
}
