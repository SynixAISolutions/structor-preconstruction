"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ArrowUpRight, Box, Check, ChevronDown, Compass, Eye, FileText, Focus, Info, Layers3, Maximize2, Minus, MousePointer2, Plus, RotateCcw, ScanLine, X } from "lucide-react";
import { elements, materials, rooms, planTransform, type ModelElement, type SourceRef } from "../../lib/jelleff-model";
import "./model-studio.css";

type ViewOptions = { cutaway: boolean; color: boolean; labels: boolean; walls: boolean; selected: string; isolated: string };
type ViewerHandle = { home: () => void; top: () => void; zoom: (factor: number) => void; focus: () => void; update: (options: ViewOptions) => void };
const sheetList: SourceRef[] = [
  { sheet: "A1.1", page: 46, detail: "First-floor layout", asset: "/models/jelleff/a1-1.png" },
  { sheet: "A5.1", page: 57, detail: "Building sections & heights", asset: "/models/jelleff/a5-1.png" },
  { sheet: "A8.1", page: 64, detail: "Partition assemblies", asset: "/models/jelleff/a8-1.png" },
  { sheet: "A12.1", page: 79, detail: "Finish schedule", asset: "/models/jelleff/a12-1.png" },
  { sheet: "A12.2", page: 80, detail: "First-floor finish locations", asset: "/models/jelleff/a12-2.png" },
];

function ModelCanvas({ options, onSelect, api, onError }: { options: ViewOptions; onSelect: (id: string) => void; api: React.RefObject<ViewerHandle | null>; onError: (message: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const currentOptions = useRef(options);
  currentOptions.current = options;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const errorRef = useRef(onError); errorRef.current = onError;
  useEffect(() => {
    const mount = host.current; if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { errorRef.current("3D graphics are unavailable in this browser. The source sheets and element information remain available. Try Chrome with graphics acceleration enabled."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xeef2f0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
    renderer.domElement.setAttribute("aria-label", "Interactive Jelleff first-floor model. Drag to rotate, scroll to zoom, right-drag to pan. Use the element selector to inspect with a keyboard.");
    renderer.domElement.tabIndex = 0;
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const bounds = new THREE.Box3().setFromPoints(elements.flatMap(e => e.points.map(p => new THREE.Vector3(p[0], 0, p[1]))));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3()); const span = Math.max(size.x, size.z);
    const camera = new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09; controls.minZoom = .45; controls.maxZoom = 8;
    controls.maxPolarAngle = Math.PI / 2.03; controls.minPolarAngle = .02; controls.zoomToCursor = true;
    controls.listenToKeyEvents(renderer.domElement);
    function fit() {
      camera.zoom = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); let extent = 0;
      for (const x of [bounds.min.x,bounds.max.x]) for(const z of [bounds.min.z,bounds.max.z]) for(const y of [0,28]) {
        const p = new THREE.Vector3(x,y,z).project(camera); extent = Math.max(extent,Math.abs(p.x),Math.abs(p.y));
      }
      camera.zoom = Math.min(3,.88/Math.max(.1,extent)); camera.updateProjectionMatrix();
    }
    function home() { camera.position.copy(center).add(new THREE.Vector3(span * .8, span * 1.15, span * 1.15)); controls.target.copy(center); controls.update(); fit(); }
    home();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0bcaf, 2.5));
    const sun = new THREE.DirectionalLight(0xfff5df, 3.4); sun.position.set(center.x - 55, 170, center.z + 65); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -220; sun.shadow.camera.right = 220; sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220; sun.shadow.camera.far = 500; sun.shadow.normalBias = .2;
    sun.target.position.copy(center); scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, span * 4), new THREE.MeshStandardMaterial({ color: 0xeef2f0, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, -.55, center.z); ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(span * 3, 60, 0xdce3df, 0xe2e8e4); grid.position.set(center.x, -.5, center.z); scene.add(grid);
    const meshes = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>();
    const labelGroup = new THREE.Group(); scene.add(labelGroup);
    for (const e of elements) {
      let geometry: THREE.BufferGeometry;
      if (e.kind === "floor") {
        const shape = new THREE.Shape(e.points.map(([x, z]) => new THREE.Vector2(x, -z)));
        geometry = new THREE.ExtrudeGeometry(shape, { depth: e.height, bevelEnabled: false }); geometry.rotateX(-Math.PI / 2);
      } else {
        const [a, b] = e.points; geometry = new THREE.BoxGeometry(Math.hypot(b[0] - a[0], b[1] - a[1]), e.height, e.thickness || .4);
      }
      const material = new THREE.MeshStandardMaterial({ roughness: e.kind === "glass" ? .15 : .8, metalness: e.kind === "glass" ? .15 : 0, transparent: e.kind === "glass", opacity: e.kind === "glass" ? .46 : 1, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      if (e.kind === "floor") mesh.position.y = e.base || 0;
      else { const [a, b] = e.points; mesh.position.set((a[0] + b[0]) / 2, (e.base || 0) + e.height / 2, (a[1] + b[1]) / 2); mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); }
      mesh.userData.elementId = e.id; mesh.castShadow = e.kind !== "glass"; mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: 0x586c64, transparent: true, opacity: .19 })); mesh.add(edges);
      meshes.set(e.id, mesh); scene.add(mesh);
    }
    // The court graphic is an illustrative orientation aid, not a measured sports layout.
    const gym = elements.find(e => e.kind === "floor" && /gym/i.test(e.name));
    if (gym) {
      const court = document.createElement("canvas"); court.width = 512; court.height = 768;
      const ctx = court.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#b69770"; ctx.fillRect(0, 0, 512, 768);
        ctx.strokeStyle = "#fff8eb"; ctx.lineWidth = 3; ctx.strokeRect(30, 30, 452, 708);
        ctx.beginPath(); ctx.moveTo(30, 384); ctx.lineTo(482, 384); ctx.stroke();
        ctx.beginPath(); ctx.arc(256, 384, 54, 0, Math.PI * 2); ctx.stroke();
        for (const flip of [false, true]) { ctx.save(); if (flip) { ctx.translate(512, 768); ctx.rotate(Math.PI); } ctx.strokeRect(182, 30, 148, 142); ctx.beginPath(); ctx.arc(256, 172, 74, 0, Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(256, 82, 185, 0, Math.PI); ctx.stroke(); ctx.restore(); }
        const texture = new THREE.CanvasTexture(court); texture.colorSpace = THREE.SRGBColorSpace;
        const gb = new THREE.Box3().setFromPoints(gym.points.map(([x,z]) => new THREE.Vector3(x,0,z))); const gs = gb.getSize(new THREE.Vector3()); const gc = gb.getCenter(new THREE.Vector3());
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(gs.x - 4, gs.z - 4), new THREE.MeshStandardMaterial({ map: texture, roughness: .9, polygonOffset: true, polygonOffsetFactor: -1 })); mesh.userData.court = true; meshes.get(gym.id)?.add(mesh); mesh.position.set(gc.x, gym.height + .02, gc.z);
        // Floors have only a vertical translation, so local court coordinates equal plan coordinates.
        mesh.rotation.x = -Math.PI / 2;
      }
    }
    for (const room of rooms) {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
      const ctx = canvas.getContext("2d"); if (!ctx) continue;
      ctx.fillStyle = "#ffffffee"; ctx.beginPath(); ctx.roundRect(8, 14, 496, 100, 24); ctx.fill();
      ctx.textAlign = "center"; ctx.fillStyle = "#2d4941"; ctx.font = "600 30px Arial"; ctx.fillText(room.name, 256, 58); ctx.fillStyle = "#6e8079"; ctx.font = "23px Arial"; ctx.fillText(room.number, 256, 91);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })); sprite.position.set(room.center[0], 7, room.center[1]); sprite.scale.set(23, 5.75, 1); sprite.renderOrder = 5; labelGroup.add(sprite);
    }
    function update(o: ViewOptions) {
      labelGroup.visible = o.labels && !o.isolated;
      for (const e of elements) {
        const mesh = meshes.get(e.id)!; const source = materials.find(m => m.id === e.materialId)!;
        mesh.visible = o.isolated ? e.id === o.isolated : o.walls || e.kind === "floor";
        const selected = o.selected === e.id;
        const neutral = e.kind === "floor" ? source.color : e.kind === "glass" ? "#9fc5cf" : e.kind === "door" ? "#b99366" : "#e8e6df";
        mesh.material.color.set(selected ? "#e8aa57" : o.color ? source.color : neutral);
        mesh.material.emissive.set(selected ? "#64421b" : "#000000"); mesh.material.emissiveIntensity = .18;
        for (const child of mesh.children) if (child.userData.court) (child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.set(selected ? "#ffcb78" : "#ffffff");
        if (e.kind !== "floor") { const height = o.cutaway ? Math.min(e.height, 5) : e.height; mesh.scale.y = height / e.height; mesh.position.y = (e.base || 0) + height / 2; }
      }
    }
    api.current = { home, top: () => { camera.position.copy(center).add(new THREE.Vector3(0, span * 1.8, .1)); controls.target.copy(center); controls.update(); fit(); }, zoom: factor => { camera.zoom = Math.min(8, Math.max(.45, camera.zoom * factor)); camera.updateProjectionMatrix(); }, focus: () => { const mesh = meshes.get(currentOptions.current.selected); if (!mesh) return; const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()); const offset = camera.position.clone().sub(controls.target); controls.target.copy(c); camera.position.copy(c).add(offset); camera.zoom = 2; camera.updateProjectionMatrix(); controls.update(); }, update };
    update(currentOptions.current);
    const resize = () => { const w = mount.clientWidth; const h = mount.clientHeight; if (!w || !h) return; renderer.setSize(w, h); const aspect = w / h; const half = span * .53; camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half; fit(); };
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let down = [0,0];
    const pointerDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const pointerUp = (e: PointerEvent) => { if (e.button !== 0 || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1); raycaster.setFromCamera(pointer,camera); const hit = raycaster.intersectObjects([...meshes.values()].filter(m=>m.visible), false)[0]; selectRef.current(hit?.object.userData.elementId || ""); };
    const contextLost = (event: Event) => { event.preventDefault(); errorRef.current("The graphics connection was interrupted. Reload this page to restore the 3D view; source sheets remain available."); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp); renderer.domElement.addEventListener("webglcontextlost", contextLost);
    let frame = 0; const render = () => { frame = requestAnimationFrame(render); if (document.hidden || !mount.clientWidth) return; controls.update(); renderer.render(scene,camera); }; render();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); api.current = null; renderer.domElement.removeEventListener("pointerdown",pointerDown); renderer.domElement.removeEventListener("pointerup",pointerUp); renderer.domElement.removeEventListener("webglcontextlost",contextLost); const textures = new Set<THREE.Texture>(); scene.traverse(obj => { const mesh = obj as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) { for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { const map = (m as THREE.MeshStandardMaterial).map; if(map)textures.add(map); m.dispose(); } } }); textures.forEach(t=>t.dispose()); renderer.dispose(); renderer.domElement.remove(); };
  }, [api]);
  useEffect(() => { api.current?.update(options); }, [options, api]);
  return <div className="ms-canvas" ref={host}/>;
}

function SourceSheet({ source, selected }: { source: SourceRef; selected?: ModelElement }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [source.asset]);
  const points = selected?.points.map(([x,z]) => `${x / planTransform.feetPerPixel + planTransform.origin[0]},${z / planTransform.feetPerPixel + planTransform.origin[1]}`).join(" ");
  return <section className="ms-source-sheet"><header><div><FileText size={16}/><strong>{source.sheet}</strong><span>PDF page {source.page}</span></div><div><button aria-label="Zoom out blueprint" onClick={()=>setZoom(v=>Math.max(1,v-.5))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in blueprint" onClick={()=>setZoom(v=>Math.min(4,v+.5))}><Plus size={15}/></button><a href={source.asset} target="_blank" rel="noreferrer" aria-label="Open full source sheet"><ArrowUpRight size={16}/></a></div></header><div className="ms-source-scroll"><div className="ms-source-image" style={{width:`${zoom*100}%`}}><img src={source.asset} alt={`${source.sheet}: ${source.detail}. Original Jelleff drawing sheet.`}/>{selected && source.sheet === "A1.1" && <svg viewBox={`0 0 ${planTransform.imageWidth} ${planTransform.imageHeight}`} aria-label="Approximate selected element location">{selected.kind === "floor" ? <polygon points={points} fill="#efaa4555" stroke="#e98512" strokeWidth="6"/> : <polyline points={points} fill="none" stroke="#ef991d" strokeWidth="12" strokeLinecap="round"/>}</svg>}</div></div><footer>Original source sheet · highlighted locations are approximate</footer></section>;
}

export default function ModelStudio() {
  const [mode,setMode] = useState("3D model"); const [selected,setSelected] = useState(""); const [cutaway,setCutaway] = useState(true); const [color,setColor] = useState(false); const [labels,setLabels] = useState(false); const [walls,setWalls] = useState(true); const [isolated,setIsolated] = useState(""); const [source,setSource] = useState(sheetList[0]); const [error,setError] = useState(""); const [about,setAbout] = useState(false); const [expanded,setExpanded] = useState(false);
  const api = useRef<ViewerHandle | null>(null);
  const [inspectorOpen,setInspectorOpen] = useState(true);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if(about)setAbout(false); else setExpanded(false); }
      if (about && e.key === "Tab") {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".ms-about-backdrop button"); const first = buttons[0], last = buttons[buttons.length - 1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();} else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",keydown); return () => {document.removeEventListener("keydown",keydown); if(about)previous?.focus();};
  },[about]);
  const item = elements.find(e=>e.id===selected); const material = materials.find(m=>m.id===item?.materialId);
  const options = {cutaway,color,labels,walls,selected,isolated};
  function select(id:string) { setSelected(id); if(id)setInspectorOpen(true); if(isolated)setIsolated(id); }
  function viewSource(s:SourceRef) { setSource(s); setMode("Compare"); }
  function reset() { setSelected("");setIsolated("");setCutaway(true);setWalls(true);api.current?.home(); }
  const content = <div className={`model-studio ${expanded?"ms-expanded":""}`}>
    <header className="ms-heading"><div><span className="ms-eyebrow">DRAWINGS, WITH DIMENSION</span><h1>Model studio<span>Preview</span></h1><p>Jelleff Recreation Center <span> / </span> Level 01 · First floor</p></div><div className="ms-header-actions"><button onClick={()=>setAbout(true)}><Info size={15}/>About this model</button><button className="ms-primary" onClick={()=>setMode(mode==="Compare"?"3D model":"Compare")}><ScanLine size={16}/>{mode==="Compare"?"Return to 3D":"Compare with blueprint"}</button></div></header>
    <div className="ms-provenance"><span className="ms-live-dot"/><strong>Prepared from your drawings</strong><span>A1.1 · A5.1 · A8.1 · A12.1</span><small>Approximate reconstruction · Not automatic PDF conversion</small></div>
    <div className={`ms-workspace ${inspectorOpen?"":"no-inspector"}`}>
      <div className="ms-main-view">
        <div className="ms-viewbar"><div role="tablist" aria-label="Model display">{["3D model","Compare","Blueprint"].map(v=><button role="tab" aria-selected={mode===v} className={mode===v?"active":""} key={v} onClick={()=>setMode(v)}>{v==="3D model"?<Box size={14}/>:v==="Compare"?<Layers3 size={14}/>:<FileText size={14}/>} {v}</button>)}</div><div className="ms-viewbar-actions"><button aria-label={inspectorOpen?"Hide element inspector":"Show element inspector"} aria-pressed={inspectorOpen} onClick={()=>setInspectorOpen(v=>!v)}><MousePointer2 size={15}/></button><button className="ms-expand" aria-label={expanded?"Exit expanded view":"Expand model workspace"} onClick={()=>setExpanded(v=>!v)}>{expanded?<X size={17}/>:<Maximize2 size={17}/>}</button></div></div>
        <div className={`ms-viewports ${mode==="Compare"?"is-compare":""} ${mode==="Blueprint"?"is-blueprint":""}`}>
          <div className="ms-scene" style={{display:mode==="Blueprint"?"none":undefined}}>
            <ModelCanvas options={options} onSelect={select} api={api} onError={setError}/>
            <div className="ms-scene-caption"><span>JRC / 01</span><strong>{cutaway?"Architectural cutaway":"Full-height study"}</strong><small>{cutaway?"Walls lowered to reveal interior spaces":"First-floor study · upper floor and roof omitted"}</small></div>
            <button className="ms-compass" onClick={()=>api.current?.top()} aria-label="Switch to top view"><span>N</span><Compass size={27}/><small>TOP</small></button>
            {error&&<div className="ms-error" role="alert"><Info/><p>{error}</p><button onClick={()=>setMode("Blueprint")}>View blueprint</button></div>}
            <div className="ms-camera-tools"><button aria-label="Zoom in model" onClick={()=>api.current?.zoom(1.2)}><Plus size={18}/></button><button aria-label="Zoom out model" onClick={()=>api.current?.zoom(1/1.2)}><Minus size={18}/></button><span/><button aria-label="Reset model view" onClick={reset}><RotateCcw size={17}/></button></div>
            <div className="ms-scene-hint"><MousePointer2 size={13}/><span>Drag to rotate · Scroll to zoom · Right-drag to pan</span></div>
            {isolated&&<button className="ms-show-all" onClick={()=>setIsolated("")}><Eye size={14}/>Show all elements</button>}
          </div>
          {mode!=="3D model"&&<SourceSheet source={source} selected={item}/>}
        </div>
        <div className="ms-bottom-tools"><div>{[{label:"Cutaway",state:cutaway,set:setCutaway},{label:"Material colours",state:color,set:setColor},{label:"Room labels",state:labels,set:setLabels},{label:"Walls",state:walls,set:setWalls}].map(t=><button key={t.label} aria-pressed={t.state} className={t.state?"on":""} onClick={()=>t.set(v=>!v)}><span>{t.state&&<Check size={10}/>}</span>{t.label}</button>)}</div><span>Level 01 <ChevronDown size={13}/></span></div>
        {color&&<div className="ms-material-key">{materials.map(m=><span key={m.id}><i style={{background:m.color}}/>{m.name}</span>)}</div>}
      </div>
      <aside className="ms-inspector" hidden={!inspectorOpen}><div className="ms-inspector-title"><span><MousePointer2 size={16}/>Element inspector</span>{item&&<button aria-label="Clear selected element" onClick={()=>{setSelected("");setIsolated("");}}><X size={15}/></button>}</div><label className="ms-element-picker"><span>Find an element</span><select value={selected} onChange={e=>select(e.target.value)}><option value="">Select in the model or browse…</option>{["floor","wall","glass","door"].map(kind=><optgroup key={kind} label={kind.toUpperCase()}>{elements.filter(e=>e.kind===kind).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>)}</select></label>
        {item&&material?<><div className="ms-selected-heading"><span className="ms-kind">{item.kind} / {item.id}</span><h2>{item.name}</h2>{item.room&&<p>{item.room}</p>}<div className="ms-selection-actions"><button onClick={()=>api.current?.focus()}><Focus size={14}/>Focus</button><button aria-pressed={isolated===item.id} onClick={()=>setIsolated(isolated?"":item.id)}><Eye size={14}/>{isolated?"Show all":"Isolate"}</button></div></div><div className="ms-material-card"><span className="ms-section-label">MATERIAL / ASSEMBLY</span><div><i style={{background:material.color}}/><h3>{material.name}</h3></div><span className={`ms-evidence ${material.status==="Documented"?"documented":""}`}>{material.status==="Documented"?"Assembly documented":"Illustrative assignment"}</span><p>{material.description}</p></div><div className="ms-element-details"><span className="ms-section-label">MODEL INFORMATION</span><p>{item.description}</p><dl>{item.kind!=="floor"&&<><dt>Model height</dt><dd>{item.height} ft</dd>{item.thickness&&<><dt>Model thickness</dt><dd>{(item.thickness*12).toFixed(1)} in</dd></>}</>}<dt>Geometry</dt><dd>Approximate</dd></dl><p className="ms-caution">{item.geometryStatus}</p></div><div className="ms-evidence-links"><span className="ms-section-label">TRACE TO SOURCE</span>{[item.source,...material.sources].filter((s,i,a)=>a.findIndex(v=>v.sheet===s.sheet)===i).map(s=><button key={s.sheet} onClick={()=>viewSource(s)}><FileText size={16}/><span><strong>{s.sheet}</strong><small>{s.detail}</small></span><ArrowUpRight size={14}/></button>)}</div></>:<div className="ms-inspector-empty"><span className="ms-empty-icon"><Box size={30}/></span><h2>A drawing you can explore.</h2><p>Select a wall, a floor or a window to see its material and the drawing behind it.</p><div><span>01</span><p><strong>Explore the space</strong>Orbit, zoom or switch to a plan view.</p></div><div><span>02</span><p><strong>Inspect an element</strong>See documented assemblies and assumptions.</p></div><div><span>03</span><p><strong>Check the source</strong>Open the original sheet beside the model.</p></div><button className="ms-start" onClick={()=>select(elements.find(e=>e.kind==="floor"&&/gym/i.test(e.name))?.id||elements[0].id)}>Inspect the gym floor<ArrowUpRight size={15}/></button></div>}
      </aside>
    </div>
    <section className="ms-source-tray"><div><FileText size={17}/><span><strong>Source collection</strong><small>GMP / Building Permit · 09 Dec 2025</small></span></div>{sheetList.map(s=><button key={s.sheet} onClick={()=>viewSource(s)} className={mode!=="3D model"&&source.sheet===s.sheet?"active":""}><strong>{s.sheet}</strong><span>{s.detail}</span><ArrowUpRight size={13}/></button>)}</section>
    <footer className="ms-disclaimer"><Info size={13}/>Prepared visualization, not a construction model. Geometry and material placement need review; not suitable for pricing or fabrication.</footer>
    {about&&createPortal(<div className="ms-about-backdrop" onClick={e=>{if(e.target===e.currentTarget)setAbout(false);}}><section role="dialog" aria-modal="true" aria-label="About this model"><button autoFocus className="ms-close" aria-label="Close about this model" onClick={()=>setAbout(false)}><X size={20}/></button><span className="ms-eyebrow">FROM BLUEPRINT TO UNDERSTANDING</span><h2>Your drawings. A new perspective.</h2><p>This prepared first-floor reconstruction is based on the supplied Jelleff PDF sheets. It is an interactive proof of the viewing and material-inspection workflow.</p><ul><li>Walls, openings and room zones are manually approximated from A1.1.</li><li>A5.1 gives level references; full-height geometry remains simplified.</li><li>Documented material assemblies are distinguished from illustrative assignments. Placement must be checked.</li><li>The model omits the upper floor, roof, structure and detailed services. The courtyard remains open.</li><li>Uploading an arbitrary PDF does not generate a model yet.</li></ul><button className="ms-primary" onClick={()=>setAbout(false)}>Explore the model<ArrowUpRight size={16}/></button></section></div>,document.body)}
  </div>;
  return expanded ? createPortal(content,document.body) : content;
}
