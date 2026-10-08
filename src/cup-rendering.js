import * as THREE from 'three';
import settings from './cup-rendering.json' with {type:'json'};
import scene from '../evidence/scenes/beer.json' with {type:'json'};
const details=new WeakMap();
function align(node,entry){details.set(node,entry);node.children.forEach((child,i)=>align(child,entry.children[i]));}
align(scene.root,settings.root);
export const cupNodeDetails=node=>details.get(node);
export const cupNativeColor=rgba=>new THREE.Color().setRGB(...rgba.slice(0,3),THREE.SRGBColorSpace);
export const cupBackground=cupNativeColor(settings.background);
export function cupNativeMaterial(data,detail,texture){
 const channels=detail?.channels||{},diffuse=channels.diffuse?.contents??data.diffuse,emission=channels.emission?.contents??data.emission;
 const map=typeof diffuse==='string'?texture(diffuse):null,color=Array.isArray(diffuse)?cupNativeColor(diffuse):new THREE.Color(1,1,1);
 color.multiplyScalar(channels.diffuse?.intensity??1);
 const mode=detail?.transparencyMode??0,transparency=detail?.transparency??data.transparency;
 // All archived RGBZero cup materials have black transparent contents and
 // transparency0: zero transmitted light leaves their surfaces opaque.
 const opacity=mode===1?1-transparency:transparency;
 const options={color,map,opacity,side:data.doubleSided?THREE.DoubleSide:THREE.FrontSide,transparent:!!map||opacity<1,alphaTest:map ? .001 : 0,depthWrite:detail?.writesToDepthBuffer??true,depthTest:detail?.readsFromDepthBuffer??true};
 if(data.lightingModel==='SCNLightingModelConstant')return new THREE.MeshBasicMaterial(options);
 options.emissive=typeof emission==='string'?new THREE.Color(1,1,1):Array.isArray(emission)?cupNativeColor(emission):new THREE.Color(0,0,0);
 options.emissiveMap=typeof emission==='string'?texture(emission):null;options.emissiveIntensity=channels.emission?.intensity??1;
 if(data.lightingModel==='SCNLightingModelPhysicallyBased'){
  const scalar=(channel,fallback)=>typeof channel?.contents==='number'?channel.contents:channel?.contentsLinearSRGB?.[0]??fallback;
  return new THREE.MeshStandardMaterial({...options,roughness:scalar(channels.roughness,1),metalness:scalar(channels.metalness,0)});
 }
 // Blinn collision helpers have black specular, so their visible diffuse
 // component is Lambert. The rendered table, ball and cup meshes are Lambert.
 return new THREE.MeshLambertMaterial(options);
}
export function cupNativeLights(){
 const directional=scene.root.children.find(n=>n.name==='directional'),ambient=scene.root.children.find(n=>n.name==='ambient');
 // SceneKit intensity/1000; Three Lambert includes a diffuse/pi factor.
 const fill=new THREE.AmbientLight(cupNativeColor(ambient.light.color),ambient.light.intensity/1000*.75*Math.PI);
 const sun=new THREE.DirectionalLight(cupNativeColor(directional.light.color),directional.light.intensity/1000*Math.PI),matrix=new THREE.Matrix4().fromArray(directional.transform);
 sun.position.setFromMatrixPosition(matrix);sun.target.position.copy(sun.position).add(new THREE.Vector3(0,0,-1).transformDirection(matrix));sun.castShadow=false;
 return [fill,sun,sun.target];
}
