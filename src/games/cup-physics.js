import * as THREE from 'three';
import {nativeActionProgress} from '../native-action.js';
import scene from '../../evidence/scenes/beer.json' with {type:'json'};
export const CUP_NATIVE=Object.freeze({radius:.028,grabRadius:.18,baseY:-.597,origin:[0,-.572,-.8],gravity:9.8,step:1/60,damping:.1,angularDamping:1,friction:.35,lag:.15,lagTime:.016,captureRadius:.068,nearRadius:.08,nearRestitution:.1,freeRestitution:.85,restDistance:.001,restFrames:5,minimumFrames:61});
// Installed SceneKit's offscreen packaged-ball probe corroborates this
// full-frame recurrence. Contact substeps must not apply damping twice.
export function cupFlightVelocity(velocity,step=CUP_NATIVE.step,gravity=CUP_NATIVE.gravity){
 velocity.multiplyScalar(Math.pow(1-CUP_NATIVE.damping,step));velocity.y-=gravity*step;return velocity;
}
// BeerView updateShadows, 0x1001d38fc..3ddc: OpenGL/API1 branch.
export function cupFlightShadow(position){
 let opacity=.75;
 if(Math.abs(position.x)>.5)opacity-=8*(Math.abs(position.x)-.5);
 else if(position.z<-2.38)opacity-=8*(Math.abs(position.z)-2.38);
 else if(position.z>.55)opacity-=8*(Math.abs(position.z)-.55);
 return {position:new THREE.Vector3(position.x,-.595,position.z),scale:Math.max(.3,1-.5*(position.y+.4)),opacity:Math.max(0,opacity)};
}
export function nativeCameraFov(width,height){const aspect=height/width;return aspect<1.7?40:aspect*45/1.77;}
export function findCupNode(node,name){if(node.name===name)return node;for(const child of node.children){const found=findCupNode(child,name);if(found)return found;}return null;}
const cupNode=findCupNode(scene.root,'cupp'),upper=findCupNode(cupNode,'ball'),lower=findCupNode(cupNode,'ball2');
export const CUP_MARKERS=Object.freeze({upper:[...upper.position],lower:[...lower.position]});
export function cupMarker(cup,which='lower'){return new THREE.Vector3(cup.x,CUP_NATIVE.baseY,cup.z).add(new THREE.Vector3(...CUP_MARKERS[which]));}
export function capturedCup(position,cups){return cups.find(c=>position.distanceTo(cupMarker(c))<CUP_NATIVE.captureRadius)?.id??null;}
export function nativeThrow({position,lagged,start,end,smoothedX=start.x,cups=[],shots=0,hits=0,ownCount=10,wins=0,ratio=1}){
 const delta=position.clone().sub(lagged);if(Math.abs(delta.y)*17<1)return null;
 // BeerView touchUpAtPoint: weighted hand lag -> predicted landing point.
 const correction=((ratio>=1.35?ratio*.75:ratio)-1)*.9+1;
 const power=Math.max(-3.85,-5.7*Math.hypot(delta.x*.65,delta.y)*correction);
 const directionX=(end.x-smoothedX)/Math.hypot(end.x-smoothedX,start.y-end.y);
 const predicted=new THREE.Vector3(Math.abs(power)/3.62*1.3*(directionX||0)*1.6,-.45,Math.abs(power)/-3.62*1.3-1.05);
 let nearest=null,distance=Infinity;for(const cup of cups){const d=predicted.distanceTo(new THREE.Vector3(cup.x,CUP_NATIVE.baseY,cup.z));if(d<distance){nearest=cup;distance=d;}}
 let assist=wins<2?.23:.21;if(!hits)assist+=.03+(shots>0?.05:0);if(cups.length-ownCount>=4&&ownCount)assist+=.03;
 const target=predicted.clone();if(nearest){target.x+=(nearest.x-target.x)*assist;target.z+=(nearest.z-target.z)*assist;}
 const scale=target.z<=-1.7?1.3:1.35;
 const impulse=new THREE.Vector3((target.x-CUP_NATIVE.origin[0])*scale,target.z<=-1.7?4.12:((Math.abs(target.z)-1.05)/-.6+1)*-3+4,(target.z-CUP_NATIVE.origin[2])*scale);
 return {impulse,predicted,target,assist,nearestCup:nearest?.id??null,power};
}
function box(node,translation=new THREE.Vector3()){
 const vertices=node.geometry.sources.find(s=>s.semantic==='kGeometrySourceSemanticVertex').vectors;
 const bounds=new THREE.Box3().setFromPoints(vertices.map(v=>new THREE.Vector3(...v))),localCenter=bounds.getCenter(new THREE.Vector3()),half=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
 const matrix=new THREE.Matrix4().fromArray(node.transform),center=localCenter.applyMatrix4(matrix).add(translation),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(new THREE.Vector3(),rotation,scale);half.multiply(scale);
 return {center,half,rotation,inverse:rotation.clone().invert(),restitution:node.physics.restitution,friction:node.physics.friction,kind:translation.lengthSq()?'cup':'table'};
}
const cupBoxes=cupNode.children.filter(n=>n.physics&&n.geometry);
export function cupColliders(cup){return cupBoxes.map(n=>box(n,new THREE.Vector3(cup.x,CUP_NATIVE.baseY,cup.z)));}
export const TABLE_COLLIDER=box(scene.root.children.find(n=>n.name==='box'&&n.physics));
export const WALL_COLLIDER=box(scene.root.children.find(n=>n.name==='wall'&&n.physics));
export function sphereBoxContact(position,velocity,shape,restitution=CUP_NATIVE.freeRestitution,dt=CUP_NATIVE.step,angularVelocity=null){
 const local=position.clone().sub(shape.center).applyQuaternion(shape.inverse),closest=local.clone().clamp(shape.half.clone().negate(),shape.half),normal=local.clone().sub(closest);let distance=normal.length();
 if(distance>=CUP_NATIVE.radius)return false;
 if(distance>1e-9)normal.divideScalar(distance);
 else {const gaps=['x','y','z'].map(axis=>({axis,gap:shape.half[axis]-Math.abs(local[axis])})).sort((a,b)=>a.gap-b.gap);normal.set(0,0,0);normal[gaps[0].axis]=local[gaps[0].axis]>=0?1:-1;distance=-gaps[0].gap;}
 normal.applyQuaternion(shape.rotation);position.addScaledVector(normal,CUP_NATIVE.radius-distance+1e-6);
 const impact=velocity.dot(normal);if(impact<0){
  // The packaged-table macOS probe confirms product combination for both
  // coefficients. The full SceneKit contact solver remains a translation.
  const normalImpulse=-(1+shape.restitution*restitution)*impact;
  velocity.addScaledVector(normal,normalImpulse);
  const tangent=velocity.clone().addScaledVector(normal,-velocity.dot(normal));
  const length=tangent.length(),reduction=Math.min(length,CUP_NATIVE.friction*shape.friction*normalImpulse);
  if(length){const frictionImpulse=tangent.multiplyScalar(-reduction/length);velocity.add(frictionImpulse);
   // Mass-one solid sphere I=2/5*r². The original-resource table probe
   // corroborates torque/rotation at a sliding single contact within 7e-7rad.
   if(angularVelocity)angularVelocity.add(new THREE.Vector3().crossVectors(normal.clone().multiplyScalar(-CUP_NATIVE.radius),frictionImpulse).multiplyScalar(2.5/(CUP_NATIVE.radius*CUP_NATIVE.radius)));
  }
  if(Math.abs(velocity.dot(normal))<.025)velocity.addScaledVector(normal,-velocity.dot(normal));
 }
 return true;
}

export const CUP_PRESENTATION=Object.freeze({waiting:[-.38,-.572,-.75],activeFade:.4,waitingFade:.1,promote:.25,hitDelay:1,missDelay:20/60,cleanupDelay:5/60,retire:.5,remove:1.1,pop:.47});
const progress=(age,start,duration)=>Math.max(0,Math.min(1,(age-start)/duration));
// SCNAction modes3/2 are corroborated by the installed-framework probe in
// tools/cup-action-inspect.swift. Its evidence is not an iOS app replay.
export const nativeActionEase=(t,mode=3)=>nativeActionProgress(t,mode);
export function cupRemovalPresentation(age,start){
 const position=start.clone();position.y+=.33*nativeActionEase(progress(age,0,.25));position.y-=.065*nativeActionEase(progress(age,.25,.12));position.x-=.1*nativeActionEase(progress(age,.47,.2));
 const exit=nativeActionEase(progress(age,.72,.7),2);position.x+=(2.7-position.x)*exit;position.y+=(start.y+.33-position.y)*exit;
 return {position,opacity:1-progress(age,.9,.2),removed:age>=CUP_PRESENTATION.remove,pop:age>=CUP_PRESENTATION.pop};
}
export function cupBallPresentation(kind,age){
 const promoting=kind==='promote',t=progress(age,0,promoting?CUP_PRESENTATION.promote:CUP_PRESENTATION.activeFade),position=new THREE.Vector3(...CUP_NATIVE.origin);
 if(promoting)position.lerpVectors(new THREE.Vector3(...CUP_PRESENTATION.waiting),position.clone(),nativeActionEase(t));
 return {position,opacity:promoting?.4+.6*t:t,shadow:promoting?.35+.4*t:.75*t,waiting:kind==='pair',waitingOpacity:.4*progress(age,0,CUP_PRESENTATION.waitingFade),waitingShadow:.35*progress(age,0,CUP_PRESENTATION.waitingFade),complete:t===1};
}
