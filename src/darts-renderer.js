import * as THREE from 'three';
import meshData from './darts-mesh.json';
import {DARTS_NATIVE, DARTS_VIEW,DARTS_SCENE,nativeDartsCamera,nativeDartShadow,dartsShellCamera} from './darts-flight.js';
import {dartsSceneData,dartsNode,dartsMaterial,dartsLights} from './darts-rendering.js';

// Original archived dart mesh/UVs; offscreen WebGL is composited into host Canvas.
export class DartsRenderer {
  constructor(assets) {
    this.assets=assets;this.textureCache=new Map();this.resources=[];
    this.renderer = new THREE.WebGLRenderer({alpha: true, antialias: false, preserveDrawingBuffer: true});
    this.renderer.setSize(420, 700);this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    const shellCamera=dartsShellCamera();
    this.nativeCamera=nativeDartsCamera(420,700);
    this.camera = new THREE.PerspectiveCamera(shellCamera.verticalFov, 420 / 700, this.nativeCamera.near, this.nativeCamera.far);
    this.camera.position.z = DARTS_NATIVE.cameraZ;
    this.scene.add(...dartsLights());
    for(const name of ['background','board_shadow','game_board','game_board_rail']){
      const data=dartsNode(name);this.scene.add(this.plane(data,name==='board_shadow' ? .4 : 1));
    }
    // The second game_board node is the larger glow plane behind the board.
    const glow=dartsSceneData.children.find(n=>n.materials?.[0].channels.diffuse.contents==='../../darts_board_glow.png');this.scene.add(this.plane(glow));
    this.flashNode=this.plane(dartsNode('game_board_light'));this.scene.add(this.flashNode);
    this.geometry = new THREE.BufferGeometry();
    for (const [semantic, attr, size] of [['kGeometrySourceSemanticVertex','position',3], ['kGeometrySourceSemanticNormal','normal',3], ['kGeometrySourceSemanticTexcoord','uv',2]]) {
      this.geometry.setAttribute(attr, new THREE.Float32BufferAttribute(meshData.sources.find(s => s.semantic === semantic).vectors.flat(), size));
    }
    this.geometry.setIndex(meshData.elements[0].indices);
    this.textures = [assets.dart_uv0000, assets.dart_uv0001].map(im => {
      if (!im) return null;const t = new THREE.Texture(im);t.colorSpace = THREE.SRGBColorSpace;t.flipY=false;t.needsUpdate = true;return t;
    });
    this.materials = this.textures.map((map,i) => {const m=dartsMaterial(dartsNode('subdart').materials[0],name=>map);if(!map)m.color.set(i?0xffd234:0xed4444);return m;});
    this.shadowGeometry=new THREE.PlaneGeometry(.5099999904632568,1);
    this.shadowTextures=[1,2,3].map(i=>{const im=assets[`darts_dart_shadow000${i}`];if(!im)return null;const t=new THREE.Texture(im);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;});
    this.nodes=[];this.shadows=[];
  }
  texture(filename){const name=filename.split('/').pop().replace(/\.[^.]+$/,'');if(this.textureCache.has(name))return this.textureCache.get(name);const im=this.assets[name];if(!im)return null;const t=new THREE.Texture(im);t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.needsUpdate=true;this.textureCache.set(name,t);return t;}
  plane(data,opacity=1){const g=new THREE.BufferGeometry();for(const source of data.geometry.sources){const key={kGeometrySourceSemanticVertex:'position',kGeometrySourceSemanticNormal:'normal',kGeometrySourceSemanticTexcoord:'uv'}[source.semantic];if(key)g.setAttribute(key,new THREE.Float32BufferAttribute(source.vectors.flat(),source.vectors[0].length));}g.setIndex(data.geometry.elements[0].indices);const m=dartsMaterial(data.materials[0],name=>this.texture(name));m.opacity*=data.opacity*opacity;const node=new THREE.Mesh(g,m);new THREE.Matrix4().fromArray(data.transform).decompose(node.position,node.quaternion,node.scale);node.visible=!data.hidden;this.resources.push(g,m);return node;}
  node(index, player) {
    if (!this.nodes[index]) {
      const parent = new THREE.Group(), mesh = new THREE.Mesh(this.geometry, this.materials[player-1]);
      mesh.position.fromArray(meshData.position);mesh.rotation.z=DARTS_SCENE.childRoll;mesh.scale.fromArray(meshData.scale);parent.add(mesh);this.scene.add(parent);this.nodes[index]=parent;
      const shadow=new THREE.Group(),plane=new THREE.Mesh(this.shadowGeometry,dartsMaterial(dartsNode('plane').materials[0],name=>null));
      shadow.rotation.z=DARTS_SCENE.shadowRotation;shadow.scale.fromArray(DARTS_SCENE.shadowScale);
      plane.position.fromArray(DARTS_SCENE.shadowChildPosition);plane.scale.setScalar(DARTS_SCENE.shadowChildScale);shadow.add(plane);this.scene.add(shadow);this.shadows[index]=shadow;
    }
    this.nodes[index].children[0].material=this.materials[player-1];return this.nodes[index];
  }
  draw(ctx, darts,flash) {
    this.flashNode.visible=!!flash&&flash.age<.78;
    if(this.flashNode.visible){const map=this.texture(`darts_board_light000${flash.type}.png`),material=this.flashNode.material;material.map=map;material.emissiveMap=map;material.opacity=flash.age<.05?flash.age/.05:Math.max(0,1-(flash.age-.05)/.73);this.flashNode.rotation.z=-flash.angle;}
    this.nodes.forEach(n => n.visible=false);this.shadows.forEach(n=>n.visible=false);
    darts.forEach((d,i) => {const n=this.node(i,d.player);n.visible=true;n.position.set(d.position.x,d.position.y,d.position.z);
      n.rotation.set(d.pitch ?? DARTS_SCENE.heldPitch,d.yaw ?? 0,d.roll ?? 0,'ZYX');n.children[0].rotation.z=d.spin ?? DARTS_SCENE.childRoll;
      const shadow=this.shadows[i],map=this.shadowTextures[(d.shadowVariant??1)-1];
      if(d.shadow&&map){const state=nativeDartShadow(d.position);shadow.visible=true;shadow.position.set(state.position.x,state.position.y,state.position.z);shadow.children[0].material.map=map;shadow.children[0].material.opacity=state.opacity*dartsNode('plane').opacity;}});
    this.renderer.render(this.scene,this.camera);ctx.drawImage(this.renderer.domElement,0,0);
  }
  destroy(){this.resources.forEach(r=>r.dispose());this.textureCache.forEach(t=>t.dispose());this.geometry.dispose();this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t?.dispose());this.shadowGeometry.dispose();this.shadowTextures.forEach(t=>t?.dispose());this.shadows.forEach(n=>n.children[0].material.dispose());this.renderer.dispose();this.renderer.forceContextLoss();}
}
