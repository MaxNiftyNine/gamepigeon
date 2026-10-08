import * as THREE from 'three';
import settings from './darts-rendering.json' with {type:'json'};
export const dartsSceneData=settings.root;
export function dartsNode(name,node=dartsSceneData){if(node.name===name)return node;for(const child of node.children){const found=dartsNode(name,child);if(found)return found;}return null;}
export function dartsMaterial(detail,texture){
  const channel=detail.channels,diffuse=channel.diffuse.contents,emission=channel.emission.contents;
  const color=Array.isArray(diffuse)?new THREE.Color().setRGB(...diffuse.slice(0,3),THREE.SRGBColorSpace):new THREE.Color(1,1,1);
  const map=typeof diffuse==='string'?texture(diffuse):null;
  const opacity=detail.transparencyMode===1?1-detail.transparency:detail.transparency;
  const options={color,map,opacity,transparent:!!map||opacity<1,alphaTest:map ? .001 : 0,side:detail.doubleSided?THREE.DoubleSide:THREE.FrontSide,depthWrite:detail.writesToDepthBuffer,depthTest:detail.readsFromDepthBuffer};
  if(detail.lightingModel==='SCNLightingModelConstant')return new THREE.MeshBasicMaterial(options);
  options.emissive=typeof emission==='string'?new THREE.Color(1,1,1):new THREE.Color().setRGB(...emission.slice(0,3),THREE.SRGBColorSpace);
  options.emissiveMap=typeof emission==='string'?texture(emission):null;
  options.emissiveIntensity=channel.emission.intensity;
  if(detail.lightingModel==='SCNLightingModelPhysicallyBased')return new THREE.MeshStandardMaterial({...options,roughness:channel.roughness.contents,metalness:channel.metalness.contents});
  return new THREE.MeshLambertMaterial(options);
}
export function dartsLights(){
  const lights=[];
  for(const name of ['ambient','directional','directional_bottom']){
    const node=dartsNode(name),spec=node.light,color=new THREE.Color().setRGB(...spec.colorLinearSRGB.slice(0,3));
    // API1 createScene sets ambient1800. Installed legacy Lambert transfer has
    // intensity/1000; Three's Lambert BRDF introduces a compensating factor pi.
    const intensity=(name==='ambient'?1800:spec.intensity)/1000*Math.PI;
    const light=name==='ambient'?new THREE.AmbientLight(color,intensity):new THREE.DirectionalLight(color,intensity);
    if(light.isDirectionalLight){light.position.fromArray(specPosition(node));light.target.position.copy(light.position).add(new THREE.Vector3().fromArray(spec.worldForwardMinusZ));lights.push(light.target);}
    lights.push(light);
  }
  return lights;
}
function specPosition(node){return node.transform.slice(12,15);}
