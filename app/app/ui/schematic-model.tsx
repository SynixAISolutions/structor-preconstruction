"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildSchematicModel, useSchematicModel } from "../../lib/schematic-model-client";
import { heightSheet, moveOutlinePoint, polygonArea, setLevelHeight, setUntaggedWallType, type Point, type SchematicLevel, type SchematicModel } from "../../lib/schematic-model";
import { wallTypeTotals } from "../../lib/tag-placement";
import { openStoredPdf, renderStoredPage, useProjectDocuments } from "../../lib/project-files-client";
import { drawingRegister, type StoredDocument } from "../../lib/project-files";
import type { Project } from "../../lib/projects";
import { useLocalDraft } from "../../lib/use-local-draft";
import { alignSheetFrame, footprintValid, openOutline, printedSheetFrame, schematicDoors, schematicGeometry, schematicShape, schematicWalls, sheetPoint, wallTotals, type SheetFrame } from "./schematic-geometry";
import { Badge, Button, Empty, Modal, PageHeader, Panel, PreviewNote, type ViewProps } from "./shared";
import { StoredDocumentViewer } from "./project-file-viewer";
import "./schematic-model.css";

const colors = ["#6d9e9a", "#a193b8", "#d4a66c", "#8fa7c0", "#98ad80"];
type CameraApi = { home: () => void; top: () => void };
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
function SchematicCanvas({ model, visible, explode, pins, roof, walls, camera, onError }: { model: SchematicModel; visible: string[]; explode: boolean; pins: boolean; roof: boolean; walls: boolean; camera: React.RefObject<CameraApi | null>; onError: (error: string) => void }) {
  const host = useRef<HTMLDivElement>(null), sceneRef = useRef<{ group: THREE.Group; fit: (top?: boolean) => void } | null>(null);
  const error = useRef(onError); error.current = onError;
  useEffect(() => {
    const mount = host.current!; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { error.current("3D graphics are unavailable. Source drawings, heights and outline corrections remain available below."); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor("#edf2ef"); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute("aria-label", "Schematic building model. Drag to rotate, scroll to zoom. Use level checkboxes and room lists for keyboard access."); mount.append(renderer.domElement);
    const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
    scene.add(new THREE.HemisphereLight("#ffffff", "#6d857d", 2.7)); const sun = new THREE.DirectionalLight("#fff4df", 2.4); sun.position.set(100, 250, 150); scene.add(sun);
    const view = new THREE.PerspectiveCamera(42, 1, .1, 100000), controls = new OrbitControls(view, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.02;
    const fit = (top = false) => {
      const bounds = new THREE.Box3().setFromObject(group); if (bounds.isEmpty()) return;
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), span = Math.max(size.x, size.y, size.z, 30);
      controls.target.copy(center); view.position.copy(center).add(new THREE.Vector3(top ? 0 : span, top ? span * 2.3 : span * 1.15, top ? .01 : span * 1.2)); view.lookAt(center); controls.update();
    };
    sceneRef.current = { group, fit }; camera.current = { home: () => fit(), top: () => fit(true) };
    const observer = new ResizeObserver(() => { const width = mount.clientWidth, height = mount.clientHeight; if (!width || !height) return; renderer.setSize(width, height); view.aspect = width / height; view.updateProjectionMatrix(); }); observer.observe(mount);
    let frame = 0; const render = () => { frame = requestAnimationFrame(render); controls.update(); renderer.render(scene, view); }; render();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); disposeGroup(group); renderer.dispose(); renderer.domElement.remove(); sceneRef.current = null; camera.current = null; };
  }, []);
  const fitted = useRef(false);
  useEffect(() => {
    const current = sceneRef.current; if (!current) return; disposeGroup(current.group);
    const errors: string[] = [];
      model.levels.forEach((level, index) => {
        if (!visible.includes(level.id)) return;
        try {
        const base = level.elevation + (explode ? index * 15 : 0), color = colors[index % colors.length];
        // With walls read from the drawing, the mass turns into a light envelope so the walls inside show.
        const wallMesh = walls ? schematicWalls(level) : null;
        const body = new THREE.Mesh(schematicGeometry(level), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: wallMesh ? .2 : .72, roughness: .8, side: THREE.DoubleSide, depthWrite: !wallMesh })); body.position.y = base; current.group.add(body);
        if (wallMesh) { wallMesh.position.y = base; current.group.add(wallMesh); }
        const doorMesh = walls ? schematicDoors(level) : null;
        if (doorMesh) { doorMesh.position.y = base; current.group.add(doorMesh); }
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry, 25), new THREE.LineBasicMaterial({ color: "#496361", transparent: true, opacity: .7 })); edges.position.y = base; current.group.add(edges);
        if (roof) { const geometry = new THREE.ShapeGeometry(schematicShape(level)); geometry.rotateX(-Math.PI / 2); const cap = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#4f6c68", transparent: true, opacity: .5, side: THREE.DoubleSide })); cap.position.y = base + level.height + .08; current.group.add(cap); }
        if (pins) level.rooms.forEach(room => {
          const pin = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 8), new THREE.MeshBasicMaterial({ color: "#244f90", depthTest: false })); pin.position.set(room.at[0], base + level.height + .8, -room.at[1]); current.group.add(pin);
          const label = roomLabel(`${room.number} ${room.name}`.trim()); label.position.copy(pin.position).add(new THREE.Vector3(0, 2.5, 0)); label.scale.set(28, 3.94, 1); current.group.add(label);
        });
        } catch (failure) { errors.push(failure instanceof Error ? failure.message : "The schematic could not be drawn."); }
      });
      error.current(errors.join(" ")); if (!fitted.current && current.group.children.length) { current.fit(); fitted.current = true; }
  }, [model, visible, explode, pins, roof, walls]);
  return <div className="sm-canvas" ref={host}/>;
}

function OutlineSheet({ level, doc, frameKey, frames, saveFrame, onMove, editable }: { level: SchematicLevel; doc: StoredDocument; frameKey: string; frames: Record<string, SheetFrame>; saveFrame: (key: string, frame: SheetFrame) => void; onMove: (index: number, point: Point) => void; editable: boolean }) {
  const [page, setPage] = useState<{ image: string; frame: SheetFrame | null } | null>(null), [error, setError] = useState("");
  const [aligning, setAligning] = useState(false), [drag, setDrag] = useState<{ index: number; point: Point } | null>(null), [corner, setCorner] = useState(0);
  const [coordinates, setCoordinates] = useState<Point>(level.outline[0]), [zoom, setZoom] = useState(1), [showWalls, setShowWalls] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
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
    <div className="sm-plan-scroll"><div style={{ width: `${zoom * 100}%` }} className={`sm-plan-image ${aligning ? "is-aligning" : ""}`}><img src={page.image} alt={`${level.source.sheet} original floor plan with schematic outline`}/><svg ref={svg} viewBox={frame ? `0 0 ${frame.width} ${frame.height}` : "0 0 1 1"} preserveAspectRatio="none" aria-label="Editable schematic outline over source drawing" onPointerDown={event => {
      if (!aligning) return;
      try { saveFrame(frameKey, alignSheetFrame(points[corner], fraction(event))); setAligning(false); setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : "The sheet could not be aligned."); }
    }} onPointerMove={event => { if (drag && frame) setDrag({ ...drag, point: sheetPoint(fraction(event), frame) }); }} onPointerUp={event => { if (drag && frame) { commit(drag.index, sheetPoint(fraction(event), frame)); setDrag(null); } }} onPointerCancel={() => setDrag(null)}>
      {frame && showWalls && <g aria-label={`${level.walls?.length ?? 0} walls read from the plan's lines`} pointerEvents="none">{level.walls?.map((w, i) => <line key={i} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="#c2410c" strokeOpacity={.8} strokeWidth={Math.max(w.thickness, frame.width / 900)}/>)}
        {level.doors?.map((d, i) => <g key={`d${i}`}><line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="#1d4ed8" strokeWidth={frame.width / 500}/>{d.hinges.map((h, j) => <line key={j} x1={h[0]} y1={h[1]} x2={d.openTo[j][0]} y2={d.openTo[j][1]} stroke="#15803d" strokeWidth={frame.width / 700}/>)}{d.number && <text x={(d.a[0] + d.b[0]) / 2} y={(d.a[1] + d.b[1]) / 2 - frame.width / 400} fontSize={frame.width / 260} fill="#1d4ed8" textAnchor="middle" fontWeight="600">{d.number}</text>}</g>)}
        {level.walls?.map((w, i) => w.type && !w.typeSet ? <text key={`t${i}`} x={(w.a[0] + w.b[0]) / 2} y={(w.a[1] + w.b[1]) / 2 + frame.width / 250} fontSize={frame.width / 280} fill="#7c2d12" textAnchor="middle">{w.type}</text> : null)}</g>}
      {frame && <><polygon points={outline.map(p => p.join(",")).join(" ")} fill="#4b92ba33" stroke="#245e95" strokeWidth={frame.width / 600}/>{outline.map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={frame.width / 90} fill={i === corner ? "#ed7541" : "#fff"} stroke="#245e95" strokeWidth={frame.width / 650} tabIndex={editable ? 0 : -1} role="button" aria-label={`Move outline corner ${i + 1}; ${point[0]}, ${point[1]} feet`} onPointerDown={event => { if (!editable || aligning) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setCorner(i); setDrag({ index: i, point }); }} onKeyDown={event => {
        if (!editable || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? .1 : 1; const p: Point = [point[0] + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), point[1] + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)]; commit(i, sheetPoint([p[0] / frame.width, p[1] / frame.height], frame));
      }}><title>Corner {i + 1}: {point[0]}, {point[1]} ft</title></circle>)}</>}
    </svg></div></div><p>{editable && frame ? "Drag a corner to correct the outline, or enter its coordinates above. Keyboard: focus a corner, then use arrows for 1 ft or Shift + arrows for 0.1 ft. Changes save when you release." : "Review the outline against the original. Align the source sheet to enable corrections."}</p>
  </>}</div>;
}

export function SchematicModelStudio({ project, navigate, notify }: { project: Project } & Pick<ViewProps, "navigate" | "notify">) {
  const { model, run } = useSchematicModel(), { documents, ready } = useProjectDocuments();
  const [pending, setPending] = useState<SchematicModel | null>(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState(""), [graphicsError, setGraphicsError] = useState("");
  const [selected, setSelected] = useState(""), [hidden, setHidden] = useState<string[]>([]), [explode, setExplode] = useState(false), [pins, setPins] = useState(true), [roof, setRoof] = useState(true), [walls, setWalls] = useState(true), [showOutline, setShowOutline] = useState(false), [source, setSource] = useState<{ documentId: string; sheet: string; page: number; label: string } | null>(null);
  const [untaggedType, setUntaggedType] = useState("");
  const [height, setHeight] = useState("14"), [frames, setFrames] = useLocalDraft<Record<string, SheetFrame>>("schematic-sheet-frames", {});
  const abort = useRef<AbortController | null>(null), camera = useRef<CameraApi | null>(null);
  const current = pending ?? model, level = current?.levels.find(l => l.id === selected) ?? current?.levels[0];
  const visible = useMemo(() => current?.levels.filter(l => !hidden.includes(l.id)).map(l => l.id) ?? [], [current, hidden]);
  const doc = documents.find(d => d.id === level?.source.documentId), sourceDoc = documents.find(d => d.id === source?.documentId);
  const section = heightSheet(drawingRegister(documents));
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { setHeight(String(level?.height ?? 14)); }, [level?.id, level?.height]);
  async function build() {
    const control = new AbortController(); abort.current = control; setBusy(true); setError(""); setProgress("Finding floor plans…");
    try { const built = await buildSchematicModel({ documents, project, signal: control.signal, onProgress: text => { if (!control.signal.aborted) setProgress(text); } }); if (!control.signal.aborted) { setPending(built); setHidden([]); setSelected(built.levels[0]?.id ?? ""); setProgress("Review the schematic and its source sheets before saving."); } }
    catch (failure) { if (!control.signal.aborted) setError(failure instanceof Error ? failure.message : "The schematic model could not be built."); }
    finally { if (abort.current === control) { setBusy(false); abort.current = null; } }
  }
  function change(action: (m: SchematicModel) => SchematicModel) { if (pending) { try { setPending(action(pending)); setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : "The preview could not be corrected."); } return; } const message = run(m => { if (!m) throw new Error("Build and accept a schematic first."); return action(m); }); setError(message ?? ""); }
  return <div className="sm-studio"><PageHeader eyebrow={`${project.name} / Model studio`} title="Schematic model" description="A draft building mass from your floor plans and section heights." actions={<><Button onClick={() => navigate("documents")}>Project files</Button>{busy ? <Button onClick={() => { abort.current?.abort(); setProgress("Build stopped. The saved model is retained."); }}>Stop building</Button> : <Button disabled={!ready || !documents.length} variant="primary" onClick={build}>{model || pending ? "Rebuild schematic model" : "Build a schematic model from the drawings"}</Button>}</>}/>
    <PreviewNote><strong>Schematic: not measured</strong> · Check the footprint, scale and heights. Room names are read by AI; check them.</PreviewNote>
    {(busy || progress) && <p role="status">{progress}</p>}{error && <p role="alert">{error}</p>}
    {pending && <div className="sm-review"><Badge tone="amber">AI preview · Not saved</Badge><Button disabled={busy} variant="primary" onClick={() => { if (pending.levels.some(l => !footprintValid(l.outline) || !Number.isFinite(l.height) || l.height < 6 || l.height > 60)) { setError("Correct crossing or collapsed outlines and heights outside 6 to 60 ft before saving."); return; } const message = run(() => pending); if (message) setError(message); else { setPending(null); setProgress(""); notify("Schematic saved. Check its source sheets and correct the outline or heights as needed."); } }}>Use this schematic model</Button><Button onClick={() => { setPending(null); setProgress(""); }}>Discard preview</Button></div>}
    {!current ? <Panel><Empty title={documents.length ? "Ready to read your floor plans" : "Upload floor plans and building sections"} description="Architectural floor-plan titles identify levels. A section or elevation sheet provides floor heights. Missing scales or heights are labelled as assumptions." action={<Button onClick={() => navigate("documents")}>Open project files</Button>}/></Panel> : <>
      <div className="sm-workspace"><div className="sm-viewer"><div className="sm-toolbar"><Badge tone="amber">Schematic: not measured</Badge><Button onClick={() => camera.current?.home()}>Reset view</Button><Button onClick={() => camera.current?.top()}>Top view</Button></div>{!visible.length && <p role="status">No levels shown. Use the level checkboxes to show the model.</p>}<SchematicCanvas model={current} visible={visible} explode={explode} pins={pins} roof={roof} walls={walls} camera={camera} onError={setGraphicsError}/>{graphicsError && <p role="alert">{graphicsError}</p>}<div className="sm-options"><label><input type="checkbox" checked={explode} onChange={e => setExplode(e.target.checked)}/>Explode levels</label><label><input type="checkbox" checked={pins} onChange={e => setPins(e.target.checked)}/>Room pins and labels</label><label><input type="checkbox" checked={roof} onChange={e => setRoof(e.target.checked)}/>Roof caps</label><label><input type="checkbox" checked={walls} onChange={e => setWalls(e.target.checked)}/>Walls and doors read from the plans</label></div><small>Drag to orbit · Scroll to zoom · Right-drag to pan · Feet</small></div>
      <aside className="sm-levels"><Panel title="Levels and sources" subtitle={`${current.levels.length} levels · ${new Date(current.builtAt).toLocaleDateString()}`}>{current.levels.map((l, i) => <article key={l.id} className={level?.id === l.id ? "active" : ""}><label><input type="checkbox" aria-label={`Show ${l.name}`} checked={!hidden.includes(l.id)} onChange={e => setHidden(ids => e.target.checked ? ids.filter(id => id !== l.id) : [...ids, l.id])}/><span style={{ background: colors[i % colors.length] }}/><button onClick={() => setSelected(l.id)}>{l.name}</button></label><p>Elevation {l.elevation} ft · Height {l.height} ft<br/>{Math.round(polygonArea(l.outline)).toLocaleString()} SF footprint · {l.rooms.length} rooms<br/>{(t => t ? `${t.count.toLocaleString()} walls · ${t.feet.toLocaleString()} ft of wall${t.doors === null ? "" : ` · ${t.doors} doors${t.compartments ? ` (+${t.compartments} toilet-stall doors)` : ""}`}` : "Rebuild to read walls from the plan's lines")(wallTotals(l))}</p><p>{l.sizing}</p><button className="sm-source-link" onClick={() => { setSelected(l.id); setSource({ ...l.source, label: l.name }); }}>{l.source.sheet} · PDF page {l.source.page}</button></article>)}</Panel>
      {level && <Panel title={`${level.name} corrections`}><form onSubmit={e => { e.preventDefault(); change(m => setLevelHeight(m, level.id, Number(height))); }}><label className="ui-field">Floor-to-floor height · ft<input disabled={busy} type="number" min="6" max="60" step=".01" required value={height} onChange={e => setHeight(e.target.value)}/></label><Button disabled={busy} type="submit">Apply height</Button></form><p>Levels above move with this height. Verify AI-read heights against the section drawing.</p>{section && <Button onClick={() => setSource({ documentId: section.doc.id, sheet: section.sheet, page: section.page, label: "Height source" })}>Check heights on {section.sheet}</Button>}<Button onClick={() => setShowOutline(v => !v)}>{showOutline ? "Hide outline correction" : "Correct outline on source sheet"}</Button>{level.wallNote && <p>Walls: {level.wallNote} They are read from the drawing's own lines, not traced by hand; check them on the sheet. Wall quantities are not priced yet.</p>}
      {!!level.walls?.length && <details><summary>Wall length by type · {level.walls.filter(w => w.type && !w.typeSet).length} walls typed from the plan's tags</summary>
        <table className="ui-table"><thead><tr><th>Type</th><th>Walls</th><th>Length · ft</th><th>Face area · SF</th></tr></thead><tbody>{wallTypeTotals(level.walls, level.height).map(t => <tr key={t.type}><td>{t.type}</td><td>{t.walls}</td><td>{t.feet.toLocaleString()}</td><td>{t.squareFeet.toLocaleString()}</td></tr>)}</tbody></table>
        <p>Types come from the partition tags on the plan. Typical partitions are often not tagged; set them below once you have checked the general notes.</p>
        <form onSubmit={e => { e.preventDefault(); change(m => setUntaggedWallType(m, level.id, untaggedType)); }}><label className="ui-field">Set untagged walls to<input disabled={busy} maxLength={16} value={untaggedType} onChange={e => setUntaggedType(e.target.value)} placeholder="e.g. SA3.10"/></label><Button disabled={busy} type="submit">{untaggedType.trim() ? "Apply to untagged walls" : "Clear the type I set"}</Button></form>
      </details>}<details><summary>{level.rooms.length} room names · Check against the plan</summary><ul>{level.rooms.map((room, i) => <li key={i}>{room.number} · {room.name}</li>)}</ul></details></Panel>}</aside></div>
      {current.warnings.length > 0 && <Panel title="Sizing and reading warnings"><ul>{current.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></Panel>}
      {showOutline && level && <Panel title={`${level.name} outline correction`} subtitle="Uses the original stored plan. Printed scale or your explicit alignment fixes the image-to-feet conversion.">{doc ? <OutlineSheet key={`${current.builtAt}:${level.id}`} level={level} doc={doc} frameKey={`${current.builtAt}:${level.id}`} frames={frames} saveFrame={(key, frame) => setFrames(values => ({ ...values, [key]: frame }))} editable={!busy} onMove={(index, point) => change(m => { const original = m.levels.find(l => l.id === level.id)!; const moved = moveOutlinePoint(m, level.id, index, point); return index === 0 && openOutline(original.outline).length !== original.outline.length ? moveOutlinePoint(moved, level.id, original.outline.length - 1, point) : moved; })}/> : <p role="alert">The original source document is unavailable. Restore it in Project files to correct this outline.</p>}</Panel>}
    </>}
    {source && <Modal wide title={`${source.sheet} source drawing`} subtitle={`${source.label} · PDF page ${source.page}`} onClose={() => setSource(null)}>{sourceDoc ? <StoredDocumentViewer doc={sourceDoc} page={source.page} onPageChange={() => {}} range={{ first: source.page, last: source.page }}/> : <p role="alert">This source document is unavailable. Open Project files to restore it.</p>}</Modal>}
  </div>;
}
