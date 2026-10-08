import * as THREE from 'three';
import originalScene from '../../evidence/scenes/beer.json' with {type:'json'};
import {text} from '../draw.js';

import {CUP_NATIVE,cupFlightVelocity,cupFlightShadow,nativeCameraFov,nativeThrow,cupMarker,capturedCup,cupColliders,sphereBoxContact,TABLE_COLLIDER,WALL_COLLIDER,CUP_PRESENTATION,cupRemovalPresentation,cupBallPresentation} from './cup-physics.js';
import originalLayout from '../../evidence/cup-layout.json' with {type:'json'};
import {cupNodeDetails,cupNativeMaterial,cupNativeLights,cupBackground} from '../cup-rendering.js';

export function cupFormation(count=10,layout='triangle',random=Math.random){
 const template=originalLayout.layouts[String(count)]?.cups;
 if(!template)throw new RangeError('Unsupported cup formation');
 if(layout!=='random')return template.map(c=>({id:c.id,x:c.position[0],z:c.position[2]}));
 const p=originalLayout.randomLayout,cups=[];
 for(let tries=0;tries<20000&&cups.length<count;tries++){
  const candidate={id:cups.length,x:p.xMin+random()*p.xSpan,z:p.zMin+random()*p.zSpan};
  if(cups.every(c=>Math.hypot(c.x-candidate.x,c.z-candidate.z)>=p.minimumSeparation))cups.push(candidate);
 }
 // A deterministic RNG can fail to provide distinct points; retain a playable board.
 return cups.length===count?cups:cupFormation(count);
}
// Rule state is separate from rendering and uses zero-index players throughout.
export class CupRules {
 constructor({cups=10,layout='triangle'}={}){
  this.cupCount=cups;this.layout=layout;this.layouts=[cupFormation(cups,layout),cupFormation(cups,layout)];
  this.remaining=[new Set(cupFormation(cups).map(c=>c.id)),new Set(cupFormation(cups).map(c=>c.id))];
  this.player=0;this.shots=0;this.hits=0;this.finished=false;this.winner=null;this.redemption=null;this.overtime=0;
 }
 rerack(player){
  const live=[...this.remaining[player]],count=live.length;
  if(this.layout==='triangle'&&(count===6||count===3))this.layouts[player]=cupFormation(count).map((c,i)=>({...c,id:live[i]}));
 }
 shot(cupId=null){
  if(this.finished)return null;
  const player=this.player,enemy=1-player,target=this.remaining[enemy];
  const hit=target.has(cupId);if(hit)target.delete(cupId);
  this.shots++;if(hit)this.hits++;
  const result={player,cupId:hit?cupId:null,hit,turnEnded:false,ballsBack:false,redemption:false,overtime:false,finished:false,winner:null};
  if(!target.size){
   if(this.redemption!==null){this.overtime++;this.cupCount=3;this.remaining=[new Set([0,1,2]),new Set([0,1,2])];this.layouts=[cupFormation(3),cupFormation(3)];this.player=this.redemption;this.redemption=null;this.shots=0;this.hits=0;result.overtime=true;result.turnEnded=true;}
   else {this.redemption=player;this.player=enemy;this.shots=0;this.hits=0;result.redemption=true;result.turnEnded=true;}
  } else if(this.redemption!==null){
   // Redemption continues while the defending player makes each cup.
   if(!hit){this.finished=true;this.winner=this.redemption;}
  } else if(this.shots===2){
   if(this.hits===2){this.shots=0;this.hits=0;result.ballsBack=true;}
   else {this.player=enemy;this.shots=0;this.hits=0;result.turnEnded=true;}
  }
  if(result.turnEnded){this.rerack(0);this.rerack(1);}
  result.finished=this.finished;result.winner=this.winner;return result;
 }
}

const TABLE=-.600,CUP_BASE=CUP_NATIVE.baseY;
function findNode(node,name){if(node.name===name)return node;for(const c of node.children){const found=findNode(c,name);if(found)return found;}return null;}
function applyMatrix(object,node){new THREE.Matrix4().fromArray(node.transform).decompose(object.position,object.quaternion,object.scale);}
function geometry(data){
 const g=new THREE.BufferGeometry();
 for(const source of data.sources){const key={kGeometrySourceSemanticVertex:'position',kGeometrySourceSemanticNormal:'normal',kGeometrySourceSemanticTexcoord:'uv'}[source.semantic];if(key)g.setAttribute(key,new THREE.Float32BufferAttribute(source.vectors.flat(),source.vectors[0].length));}
 const indices=[];for(let i=0;i<data.elements.length;i++){const e=data.elements[i];if(e.primitiveType!==0)continue;const start=indices.length;indices.push(...e.indices);g.addGroup(start,e.indices.length,i%Math.max(1,data.materials.length));}
 g.setIndex(indices);if(!g.attributes.normal)g.computeVertexNormals();return g;
}

export default class CupGame {
 constructor(host){this.h=host;this.rules=new CupRules();this.formation=cupFormation();this.flight=null;this.drag=null;this.feedback='';this.feedbackTime=0;this.ready=false;this.removals=new Map();this.retiredBalls=[];this.createRenderer();this.setControls();this.h.status('Cup Pong • 10 cups each • two throws per turn');this.beginTurn();}
 createRenderer(){
  this.scene=new THREE.Scene();this.scene.background=cupBackground.clone();this.textures=new Map();this.resources=[];
  try {this.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});this.renderer.setSize(420,700);this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;}
  catch(error){this.renderError=String(error);return;}
  const cameraNode=findNode(originalScene.root,'cam');this.camera=new THREE.PerspectiveCamera(cameraNode.camera.fieldOfView,420/700,cameraNode.camera.zNear,cameraNode.camera.zFar);applyMatrix(this.camera,cameraNode);
  // BeerView update derives the field of view from the view aspect ratio.
  this.camera.fov=nativeCameraFov(420,700);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  for(const node of originalScene.root.children){if(['cam','cups','ball','ball_shadow','cup_shadow','directional','ambient'].includes(node.name)||node.opacity===0)continue;this.scene.add(this.buildNode(node));}
  this.scene.add(...cupNativeLights());
  this.cupTemplate=this.buildNode(findNode(originalScene.root,'cuppy_new'));this.cupShadowTemplate=this.buildNode(findNode(originalScene.root,'cup_shadow'));
  const originalBall=findNode(originalScene.root,'ball');this.ball=this.buildNode(originalBall);this.ballInitialOrientation=this.ball.quaternion.clone();this.ball.position.set(...CUP_NATIVE.origin);this.scene.add(this.ball);
  this.shadow=this.buildNode(findNode(originalScene.root,'ball_shadow'));this.shadow.position.set(0,TABLE+.002,CUP_NATIVE.origin[2]);this.scene.add(this.shadow);
  this.waitingBall=this.cloneVisual(this.ball);this.waitingShadow=this.cloneVisual(this.shadow);this.scene.add(this.waitingBall,this.waitingShadow);
  this.cupMeshes=[];this.rebuildCups();
 }
 texture(filename){const name=filename.split('/').pop().replace(/\.[^.]+$/,'');if(this.textures.has(name))return this.textures.get(name);const image=this.h.assets[name];if(!image)return null;const t=new THREE.Texture(image);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;this.textures.set(name,t);return t;}
 material(data,detail){
  const material=cupNativeMaterial(data,detail,name=>this.texture(name));this.resources.push(material);return material;
 }
 buildNode(node){
  let object;
  if(node.geometry){const g=geometry(node.geometry);this.resources.push(g);object=new THREE.Mesh(g,node.geometry.materials.map((m,i)=>this.material(m,cupNodeDetails(node)?.materials[i])));}
  else object=new THREE.Group();
  object.name=node.name;applyMatrix(object,node);object.visible=!node.hidden&&node.opacity>0;
  if(object.isMesh)for(const m of object.material)m.opacity*=node.opacity;
  for(const child of node.children)object.add(this.buildNode(child));return object;
 }
 cloneVisual(template){const clone=template.clone(true);clone.traverse(node=>{if(node.isMesh){node.material=(Array.isArray(node.material)?node.material:[node.material]).map(m=>{const copy=m.clone();this.resources.push(copy);return copy;});}});return clone;}
 disposeVisual(object){object?.traverse(node=>{if(node.isMesh)for(const material of (Array.isArray(node.material)?node.material:[node.material]))material.dispose();});}
 opacity(object,value){object?.traverse(node=>{if(node.isMesh)for(const material of (Array.isArray(node.material)?node.material:[node.material])){material.transparent=true;material.opacity=value;}});}
 applyCupTextures(object){object.traverse(node=>{
  const filename=node.name==='front'?(this.rules.player===0?'beer_cup0000':'beer_cup00002'):node.name==='back'?'beer_cup_inner0000':null;
  if(filename&&node.isMesh)for(const material of (Array.isArray(node.material)?node.material:[node.material])){material.map=this.texture(filename);material.color.setRGB(1,1,1);material.needsUpdate=true;}
 });}
 rebuildCups(){
  this.colliders=new Map(this.rules.layouts[1-this.rules.player].map(c=>[c.id,cupColliders(c)]));
  if(!this.renderer||!this.scene)return;this.removals?.clear();this.displayRemaining=null;for(const obj of this.cupMeshes){this.scene.remove(obj);this.disposeVisual(obj);}this.cupMeshes=[];
  this.viewPlayer=this.rules.player;this.formation=this.rules.layouts[1-this.rules.player];
  for(const cup of this.formation){const obj=new THREE.Group();obj.position.set(cup.x,CUP_BASE,cup.z);const shadow=this.cloneVisual(this.cupShadowTemplate);shadow.position.set(0,-.5999-CUP_BASE,.005);this.opacity(shadow,.65);obj.add(shadow);const body=this.cloneVisual(this.cupTemplate);this.applyCupTextures(body);obj.add(body);obj.userData.cupId=cup.id;obj.userData.shadow=shadow;this.scene.add(obj);this.cupMeshes.push(obj);}
 }
 setControls(){this.h.controls('<p class="instruction">Flick upward from the ball. Direction and flick speed control the throw.</p><button id="cup-next" hidden>Pass device</button><details><summary>Game options</summary><label>Formation <select id="cup-layout"><option value="triangle">Triangle</option><option value="random">Random</option></select></label><button id="cup-restart">New game</button></details>');
  this.h.onControl('#cup-next','click',()=>this.beginTurn());
  this.h.onControl('#cup-restart','click',()=>{const controls=this.h.canvas?.closest?.('.stage')||this.h.canvas?.parentElement;this.rules=new CupRules({layout:controls?.querySelector('#cup-layout')?.value||'triangle'});this.flight=null;this.drag=null;this.shotTransition=null;this.rebuildCups();this.beginTurn();});
 }
 beginTurn(){this.rebuildCups();this.ready=true;this.togglePass(false);this.resetBall(this.rules.redemption!==null?'solo':'pair');this.h.turn(this.rules.player, this.rules.redemption!==null?'Redemption: keep sinking cups. A miss ends the game.':`You have two throws. Sink both to get the balls back.`);this.updateStatus();}
 togglePass(show){const button=(this.h.canvas?.closest?.('.stage')||this.h.canvas?.parentElement)?.querySelector('#cup-next');if(button)button.hidden=!show;}
 resetBall(kind='pair'){
  this.origin=new THREE.Vector3(...CUP_NATIVE.origin);if(this.ballInitialOrientation)this.ball.quaternion.copy(this.ballInitialOrientation);this.ballVisual={kind,age:0};this.applyBallVisual();
 }
 applyBallVisual(){
  if(!this.ballVisual)return;const state=cupBallPresentation(this.ballVisual.kind,this.ballVisual.age);
  if(this.ball){this.ball.position.copy(state.position);this.ball.visible=true;this.opacity(this.ball,state.opacity);}
  if(this.shadow){this.shadow.position.set(state.position.x,-.595,state.position.z);const shadow=cupFlightShadow(state.position);this.shadow.scale.set(shadow.scale,shadow.scale,1);this.shadow.visible=true;this.opacity(this.shadow,state.shadow);}
  if(this.waitingBall){this.waitingBall.position.set(...CUP_PRESENTATION.waiting);this.waitingBall.visible=state.waiting;this.opacity(this.waitingBall,state.waitingOpacity);}
  if(this.waitingShadow){this.waitingShadow.position.set(CUP_PRESENTATION.waiting[0],-.595,CUP_PRESENTATION.waiting[2]);const shadow=cupFlightShadow(new THREE.Vector3(...CUP_PRESENTATION.waiting));this.waitingShadow.scale.set(shadow.scale,shadow.scale,1);this.waitingShadow.visible=state.waiting;this.opacity(this.waitingShadow,state.waitingShadow);}
 }
 removeCup(cupId){
  const cup=this.cupMeshes?.find(c=>c.userData.cupId===cupId),layout=this.formation.find(c=>c.id===cupId);
  if(!layout)return;this.removals??=new Map();this.removals.set(cupId,{age:0,cup,start:cup?.position.clone()||new THREE.Vector3(layout.x,CUP_BASE,layout.z),playedPop:false});this.h.sound('whoosh1.mp3');
 }
 updatePresentation(dt){
  let justSpawned=false;
  for(const [id,removal]of this.removals||[]){removal.age+=dt;const state=cupRemovalPresentation(removal.age,removal.start);
   if(state.pop&&!removal.playedPop){this.h.sound('whoosh2.mp3');removal.playedPop=true;}
   if(removal.cup){removal.cup.position.copy(state.position);removal.cup.visible=!state.removed;for(const child of removal.cup.children)if(child!==removal.cup.userData.shadow)this.opacity(child,state.opacity);const shadow=removal.cup.userData.shadow;if(shadow){shadow.position.y=-.5999-state.position.y;this.opacity(shadow,Math.max(0,.65-Math.max(0,state.position.x-.5)*8));}}
   if(state.removed)this.removals.delete(id);
  }
  for(const retired of this.retiredBalls||[]){
   retired.age+=dt;
   if(retired.flight){const f=retired.flight;f.accumulator+=Math.min(dt,.25);while(f.accumulator+1e-12>=CUP_NATIVE.step){f.accumulator-=CUP_NATIVE.step;this.motionStep(f,retired.cups,false,retired.colliders);}retired.ball.position.copy(f.position);retired.ball.quaternion.copy(f.orientation);if(!retired.cleanup){const state=cupFlightShadow(f.position);retired.shadow.position.copy(state.position);retired.shadow.scale.set(state.scale,state.scale,1);}}
   const fade=Math.max(0,1-retired.age/CUP_PRESENTATION.retire);this.opacity(retired.ball,fade);
   // The native fade action acts independently of the manually updated shadow.
   this.opacity(retired.shadow,retired.shadowOpacity*fade);
   if(retired.age+1e-12>=CUP_PRESENTATION.retire){this.scene.remove(retired.ball,retired.shadow);this.disposeVisual(retired.ball);this.disposeVisual(retired.shadow);}
  }
  if(this.retiredBalls)this.retiredBalls=this.retiredBalls.filter(b=>b.age+1e-12<CUP_PRESENTATION.retire);
  if(this.shotTransition){const transition=this.shotTransition;transition.age+=dt;
   if(!transition.started&&transition.age+1e-12>=transition.delay){transition.started=true;const result=transition.result;
    if(result.finished){this.shotTransition=null;this.h.finish(result.winner,'The last cup is down.');return;}
    if(result.turnEnded){this.shotTransition=null;if(result.overtime)this.rebuildCups();if(this.ball)this.ball.visible=false;if(this.shadow)this.shadow.visible=false;if(this.waitingBall)this.waitingBall.visible=false;if(this.waitingShadow)this.waitingShadow.visible=false;this.togglePass(true);this.h.status(`${this.feedback} • Pass to ${this.h.names?.[this.rules.player]||`Player ${this.rules.player+1}`}.`);return;}
    this.resetBall(result.ballsBack?'pair':this.rules.redemption!==null?'solo':'promote');this.ballVisual.age=Math.max(0,transition.age-transition.delay);justSpawned=true;
   }
  }
  if(this.ballVisual){if(!justSpawned)this.ballVisual.age+=dt;this.applyBallVisual();const complete=cupBallPresentation(this.ballVisual.kind,this.ballVisual.age).complete;
   if(complete&&this.shotTransition?.started){this.shotTransition=null;this.ready=true;this.updateStatus();}
  }
 }
 updateStatus(){const own=this.rules.remaining[this.rules.player].size,enemy=this.rules.remaining[1-this.rules.player].size;const mode=this.rules.redemption!==null?'REDEMPTION':this.rules.overtime?`OVERTIME ${this.rules.overtime}`:`Throw ${this.rules.shots+1} of 2`;this.h.status(`${this.h.names?.[this.rules.player]||`Player ${this.rules.player+1}`} • ${mode} • your cups ${own}, opponent ${enemy}`);}
 project(v){const p=v.clone().project(this.camera);return {x:(p.x+1)*210,y:(1-p.y)*350};}
 handPosition(point,clamp=true){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(point.x/210-1,1-point.y/350),this.camera);const hit=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),.8),hit))return null;if(clamp)hit.y=Math.max(CUP_NATIVE.origin[1],hit.y);return hit;}
 pointerDown(point){if(!this.ready||this.flight||this.rules.finished||!this.renderer)return;const raw=this.handPosition(point,false);if(!raw||raw.distanceTo(this.origin)>=CUP_NATIVE.grabRadius){this.h.status('Start your flick on the white ball.');return;}const position=this.handPosition(point);if(position)this.drag={start:point,last:point,position,lagged:position.clone(),smoothedX:point.x};}
 pointerMove(point){if(this.drag){const position=this.handPosition(point);if(position){this.drag.last=point;this.drag.position.copy(position);}}}
 pointerCancel(){this.drag=null;}
 pointerUp(point){if(!this.drag)return;this.pointerMove(point);const drag=this.drag;this.drag=null;const cups=this.formation.filter(c=>this.rules.remaining[1-this.rules.player].has(c.id));const shot=nativeThrow({...drag,end:point,cups,shots:this.rules.shots,hits:this.rules.hits,ownCount:this.rules.remaining[this.rules.player].size,ratio:Math.min(420/375,700/525)});if(!shot){this.h.status('Flick upward quickly from the ball to throw.');return;}this.lastThrow=shot;this.launch(shot.impulse);}
 launch(velocity){this.flight={orientation:this.ball?.quaternion.clone()||new THREE.Quaternion(),angularVelocity:new THREE.Vector3(),position:this.origin.clone(),velocity:velocity.clone(),age:0,nativeTime:-1,bounces:0,accumulator:0,restFrames:0,nearCup:null,restitution:CUP_NATIVE.freeRestitution};this.h.sound('beer_ball.mp3');this.ready=false;this.ballVisual=null;if(this.ball)this.opacity(this.ball,1);if(this.shadow)this.opacity(this.shadow,.75);}
 bounce(strength){
  const now=this.soundTime??0;if(this.lastBounceTime!==undefined&&now-this.lastBounceTime<.1)return;this.lastBounceTime=now;this.h.sound(Math.random()<.5?'beer_ball3.mp3':'beer_ball2.mp3',Math.fround(strength*.8));
 }
 rim(){
  const now=this.soundTime??0;if(this.lastRimTime!==undefined&&now-this.lastRimTime<.5)return;this.lastRimTime=now;this.bounce(.8);this.h.sound('beer_cup.mp3',.8);
 }
 update(dt){
  this.soundTime=(this.soundTime??0)+dt;this.feedbackTime=Math.max(0,this.feedbackTime-dt);this.updatePresentation(dt);
  if(this.renderer){const enemy=this.displayRemaining||this.rules.remaining[1-this.viewPlayer];for(const cup of this.cupMeshes)cup.visible=enemy.has(cup.userData.cupId)||this.removals?.has(cup.userData.cupId);}
  if(this.drag){const factor=Math.min(1,dt/CUP_NATIVE.lagTime*CUP_NATIVE.lag);this.drag.lagged.lerp(this.drag.position,factor);this.drag.smoothedX+=(this.drag.last.x-this.drag.smoothedX)*factor;}
  if(!this.flight)return;
  const f=this.flight;f.accumulator+=Math.min(dt,.25);
  while(this.flight&&f.accumulator+1e-12>=CUP_NATIVE.step){f.accumulator-=CUP_NATIVE.step;this.flightStep(f);}
  if(this.flight&&this.ball){this.ball.position.copy(f.position);this.ball.quaternion.copy(f.orientation);const shadow=cupFlightShadow(f.position);this.shadow.position.copy(shadow.position);this.shadow.scale.set(shadow.scale,shadow.scale,1);this.opacity(this.shadow,shadow.opacity);this.shadow.visible=shadow.opacity>0;}
 }
 motionStep(f,live,tracked=true,colliders=this.colliders){
  const step=CUP_NATIVE.step;f.age+=step;f.angularVelocity.multiplyScalar(Math.pow(1-CUP_NATIVE.angularDamping,step));
  cupFlightVelocity(f.velocity,step);
  // Position/contact substeps prevent skipping thin authored cup wall boxes;
  // free-flight velocity still follows SceneKit's full 1/60-step recurrence.
  for(let i=0;i<2;i++){
   const dt=step/2;f.position.addScaledVector(f.velocity,dt);
   if(tracked&&f.position.y>-.375)f.restitution=CUP_NATIVE.freeRestitution;
   if(tracked&&f.nearCup===null){const cup=live.find(c=>f.position.distanceTo(cupMarker(c,'upper'))<CUP_NATIVE.nearRadius);if(cup){f.nearCup=cup.id;f.restitution=CUP_NATIVE.nearRestitution;}}
   for(const cup of live){if(Math.hypot(f.position.x-cup.x,f.position.z-cup.z)>.16)continue;const shapes=colliders?.get(cup.id)||cupColliders(cup);for(const shape of shapes)if(sphereBoxContact(f.position,f.velocity,shape,f.restitution,dt,f.angularVelocity)){f.bounces++;if(tracked)this.rim();}}
   for(const shape of [TABLE_COLLIDER,WALL_COLLIDER])if(sphereBoxContact(f.position,f.velocity,shape,f.restitution,dt,f.angularVelocity)){f.bounces++;if(tracked&&f.nativeTime>=5){const strength=Math.fround(f.velocity.length()*.25);if(strength>.1)this.bounce(Math.min(1,strength));}}
  }
  const speed=f.angularVelocity.length();if(speed)f.orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(f.angularVelocity.clone().divideScalar(speed),speed*step)).normalize();
 }
 flightStep(f){
  const previous=f.position.clone(),live=this.formation.filter(c=>this.rules.remaining[1-this.rules.player].has(c.id));this.motionStep(f,live);
  f.restFrames=f.position.distanceTo(previous)<CUP_NATIVE.restDistance&&f.nativeTime>=CUP_NATIVE.minimumFrames?f.restFrames+1:0;
  if(f.restFrames>=CUP_NATIVE.restFrames){const score=capturedCup(f.position,live);this.resolveShot(score);return;}
  f.nativeTime++;if(f.position.y<-1||Math.fround(f.position.z)>-.6)f.nativeTime=600;
  if(f.nativeTime>=201)this.resolveShot(null,{cleanup:true});
 }
 resolveShot(cupId,{cleanup=false}={}){
  const flight=this.flight,visibleBefore=new Set(this.rules.remaining[1-(this.viewPlayer??this.rules.player)]);visibleBefore.delete(cupId);this.flight=null;const result=this.rules.shot(cupId);if(!result)return;this.feedback=result.hit?'IN!':'MISS';this.feedbackTime=1.5;this.ready=false;this.ballVisual=null;
  if(result.hit)this.removeCup(cupId);
  else if(this.ball&&this.scene){if(flight){this.ball.position.copy(flight.position);this.ball.quaternion.copy(flight.orientation);}const ball=this.cloneVisual(this.ball),shadow=this.cloneVisual(this.shadow);this.scene.add(ball,shadow);this.retiredBalls??=[];const state=flight?{...flight,position:flight.position.clone(),velocity:flight.velocity.clone(),orientation:flight.orientation.clone(),angularVelocity:flight.angularVelocity.clone(),accumulator:0}:null;
   // Cleanup fades/detaches the SCN nodes without disabling their physics body.
   // Retain the pre-handoff colliders and physics state, but never score twice.
   this.retiredBalls.push({ball,shadow,age:0,flight:state,cleanup,colliders:this.colliders,cups:this.formation.filter(c=>visibleBefore.has(c.id)),shadowOpacity:flight?cupFlightShadow(flight.position).opacity:.75});}
  if(this.ball)this.ball.visible=false;if(this.shadow)this.shadow.visible=false;
  if(result.overtime){this.feedback='OVERTIME';this.displayRemaining=visibleBefore;}if(result.ballsBack)this.feedback='BALLS BACK!';if(result.redemption)this.feedback='REDEMPTION';
  this.shotTransition={age:0,delay:result.hit?CUP_PRESENTATION.hitDelay:cleanup?CUP_PRESENTATION.cleanupDelay:CUP_PRESENTATION.missDelay,result,started:false};
  this.h.status(`${this.feedback} • ${result.turnEnded?'Finishing turn.':'Next ball incoming.'}`);
 }
 draw(ctx){
  if(this.renderer){this.renderer.render(this.scene,this.camera);ctx.drawImage(this.renderer.domElement,0,0,420,700);}else {ctx.fillStyle='#cabca1';ctx.fillRect(0,0,420,700);text(ctx,'WebGL is required for Cup Pong.',210,350,18,'#222');return;}
  ctx.save();ctx.fillStyle='#ffffffdd';ctx.beginPath();ctx.roundRect(12,13,396,60,12);ctx.fill();text(ctx,this.rules.redemption!==null?'REDEMPTION':this.rules.overtime?'OVERTIME':'CUP PONG',210,37,20,'#28302b');
  text(ctx,`${this.h.names?.[this.viewPlayer]||`Player ${this.viewPlayer+1}`}  •  ${this.displayRemaining?.size??this.rules.remaining[1-this.viewPlayer].size} cups to go`,210,59,14,'#54645a');
  if(this.feedbackTime>0){text(ctx,this.feedback,210,385,28,this.feedback==='MISS'?'#53483e':'#fff');}
  if(!this.flight&&!this.rules.finished){const p=this.project(this.origin);ctx.strokeStyle=this.ready?'#ffffffc0':'#ffffff60';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,26,0,Math.PI*2);ctx.stroke();text(ctx,this.ready?'Flick ↑':this.shotTransition?'Next ball incoming':'Pass device to continue',210,p.y+49,15,'#fff');}
  if(this.drag){const p=this.project(this.origin);ctx.strokeStyle='#ffffff99';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(this.drag.last.x,this.drag.last.y);ctx.stroke();ctx.setLineDash([]);}
  ctx.restore();
 }
 destroy(){this.renderer?.dispose();for(const resource of this.resources)resource.dispose();for(const texture of this.textures.values())texture.dispose();}
}
