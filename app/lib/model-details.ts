import type { ModelObject, ModelSource } from "./model";
export type SourceRegion = { sheet: string; tag?: string; detail?: string; label: string; box: { x:number; y:number; width:number; height:number } };
export type AssemblyLayer = { name:string; color:string; basis:string };
export type ModelDetails = { projectId:string; documentId:string; regions:SourceRegion[]; floors:{materialId:string; layers:AssemblyLayer[]; source:ModelSource; note:string}[]; fixtures:{id:string; wallId:string; along:number; kind:"basketball-hoop"|"wall-pad"; side?:1|-1; source:ModelSource}[]; section:ModelSource|null; sectionObjectIds?:string[] };
export const emptyModelDetails=(projectId:string):ModelDetails=>({projectId,documentId:"",regions:[],floors:[],fixtures:[],section:null});
export function parseModelDetails(raw:unknown,projectId:string):ModelDetails {
  const d=raw as ModelDetails;
  const text=(s:unknown)=>typeof s==="string"&&s.length<4000;
  const source=(s:ModelSource)=>s&&text(s.sheet)&&text(s.detail)&&text(s.drawing)&&Number.isInteger(s.page)&&s.page>0;
  if(!d||d.projectId!==projectId||!text(d.documentId)||!Array.isArray(d.regions)||d.regions.length>300||!Array.isArray(d.floors)||d.floors.length>100||!Array.isArray(d.fixtures)||d.fixtures.length>200||d.section&&!source(d.section))throw new Error("The project's model detail record is invalid.");
  if(d.sectionObjectIds!==undefined&&(!Array.isArray(d.sectionObjectIds)||d.sectionObjectIds.length>1000||d.sectionObjectIds.some(id=>!text(id))))throw new Error("The building section's object links are invalid.");
  for(const r of d.regions){const b=r?.box;if(!text(r.sheet)||!text(r.label)||r.tag!==undefined&&!text(r.tag)||r.detail!==undefined&&!text(r.detail)||!b||[b.x,b.y,b.width,b.height].some(n=>!Number.isFinite(n)||n<0||n>1)||!b.width||!b.height||b.x+b.width>1||b.y+b.height>1)throw new Error("A source highlight is outside its sheet.");}
  for(const f of d.floors)if(!text(f.materialId)||!text(f.note)||!source(f.source)||!Array.isArray(f.layers)||!f.layers.length||f.layers.length>12||f.layers.some(l=>!text(l.name)||!text(l.basis)||!/^#[\da-f]{6}$/i.test(l.color)))throw new Error("A floor layer needs its name, basis and source.");
  for(const f of d.fixtures)if(!text(f.id)||!text(f.wallId)||!source(f.source)||!["basketball-hoop","wall-pad"].includes(f.kind)||f.side!==undefined&&![1,-1].includes(f.side)||!Number.isFinite(f.along)||f.along<0||f.along>1)throw new Error("An elevation fixture is invalid.");
  return d;
}
export function sourceRegion(details:ModelDetails,source:ModelSource,tag?:string):SourceRegion|null {
  const rows=details.regions.filter(r=>r.sheet.replace(/[\s_-]/g,"").toUpperCase()===source.sheet.replace(/[\s_-]/g,"").toUpperCase());
  return rows.find(r=>r.detail&&source.detail.toLowerCase().includes(r.detail.toLowerCase()))||rows.find(r=>r.tag&&r.tag===tag)||rows.find(r=>!r.tag&&!r.detail)||null;
}
/** Display layers never alter measured geometry or quantities. */
export function inspectionLayers(object:ModelObject,details:ModelDetails):AssemblyLayer[] {
  if(object.kind==="floor")return details.floors.find(f=>f.materialId===object.materialId)?.layers||[];
  const type=object.partitionType;
  if(object.kind!=="wall")return [];
  if(!type)return [{name:object.assembly,color:"#c8c5bc",basis:"Unresolved wall shell. Layer build-up is not verified; inspect the actual building section."}];
  return [{name:"Gypsum board · tag side",color:"#eee6d5",basis:type.gypsum},{name:`${type.unitWidth} ${type.construction}`,color:"#a7b4bb",basis:type.uniqueCondition},...(type.gypsum.toLowerCase().includes("each side")?[{name:"Gypsum board · opposite side",color:"#eee6d5",basis:type.gypsum}]:[])];
}
