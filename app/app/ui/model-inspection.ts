import * as THREE from "three";
import type { ModelObject } from "../../lib/model";
import type { AssemblyLayer,ModelDetails } from "../../lib/model-details";
/** An inspection diagram beside the measured model; spacing and layer depths are schematic. */
export function assemblyInspection(object:ModelObject,layers:AssemblyLayer[]):THREE.Group {
  const group=new THREE.Group();
  layers.forEach((layer,i)=>{
    const thickness=.18,material=new THREE.MeshStandardMaterial({color:layer.color,roughness:.75,side:THREE.DoubleSide});let geometry:THREE.BufferGeometry;
    if(object.kind==="floor") {const shape=new THREE.Shape(object.points.map(([x,z])=>new THREE.Vector2(x,-z)));geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});geometry.rotateX(-Math.PI/2);}
    else geometry=new THREE.BoxGeometry(Math.min(object.dimensions.lengthFt||12,12),Math.min(object.height,10),thickness);
    const mesh=new THREE.Mesh(geometry,material);
    if(object.kind==="floor"){mesh.position.y=object.base-i*thickness;mesh.userData.shift=[0,(layers.length-i)*6,0];}
    else{const [a,b]=object.points;const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);mesh.rotation.y=-angle;mesh.position.set((a[0]+b[0])/2,object.base+Math.min(object.height,10)/2,(a[1]+b[1])/2);mesh.userData.shift=[-Math.sin(angle)*(i-(layers.length-1)/2)*1.2,0,Math.cos(angle)*(i-(layers.length-1)/2)*1.2];}
    mesh.userData.origin=mesh.position.clone();group.add(mesh);
  });return group;
}
export function disposeInspection(group:THREE.Group){group.traverse(n=>{const m=n as THREE.Mesh;m.geometry?.dispose();if(m.material)for(const material of Array.isArray(m.material)?m.material:[m.material])material.dispose();});group.clear();}
export function elevationFixtures(objects:ModelObject[],details:ModelDetails):THREE.Group{
  const group=new THREE.Group();
  for(const f of details.fixtures){const wall=objects.find(o=>o.id===f.wallId);if(!wall||wall.kind!=="wall")continue;const[a,b]=wall.points,angle=Math.atan2(b[1]-a[1],b[0]-a[0]);const item=new THREE.Group();item.position.set(a[0]+(b[0]-a[0])*f.along,wall.base,a[1]+(b[1]-a[1])*f.along);item.rotation.y=-angle+(f.side===-1?Math.PI:0);item.userData.wallId=wall.id;
    if(f.kind==="wall-pad"){const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.1,(wall.dimensions.lengthFt||1)-.5),6,.25),new THREE.MeshStandardMaterial({color:"#858b87",roughness:.9}));mesh.position.set(0,3+4/12,.6);item.add(mesh);}
    else {const board=new THREE.Mesh(new THREE.BoxGeometry(6,3.5,.16),new THREE.MeshStandardMaterial({color:"#eef1ee",roughness:.5}));board.position.set(0,11.25,3);item.add(board);const rim=new THREE.Mesh(new THREE.TorusGeometry(.75,.065,8,28),new THREE.MeshStandardMaterial({color:"#d8682e"}));rim.rotation.x=Math.PI/2;rim.position.set(0,10,3.9);item.add(rim);const arm=new THREE.Mesh(new THREE.BoxGeometry(.15,4,.15),new THREE.MeshStandardMaterial({color:"#768481"}));arm.position.set(0,15,3);item.add(arm);}
    group.add(item);
  }return group;
}
