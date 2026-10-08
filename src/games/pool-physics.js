import {nativePoolEdges} from './pool-walls.js';
import {canvasToNative,nativeToCanvas,canvasVelocityToNative,nativeVelocityToCanvas} from './pool-table.js';
import {World,Vec2,Circle,Edge,Settings} from 'planck';

// Native constants recovered from PoolScene init/create/update/shoot and
// PoolContactListener::BeginContact; detailed addresses in evidence/pool-physics.md.
export const POOL_NATIVE=Object.freeze({radius:10,holeRadius:20,step:1/60,velocityIterations:60,positionIterations:60,ballFriction:0,ballRestitution:1,wallFriction:.5,wallRestitution:.75,clothMultiplier:.99,clothSubtract:.5,stopSpeed:2,angularDamping:.5,spinDecay:.94,spinThreshold:.1,maxPower:2000,maxTranslation:100000,maxRotation:314159.28125});
const NATIVE_PER_WORLD=100;
// Normalize native positions/velocities to a compact browser world. Solver
// tolerances use the same normalization; the original compiled Box2D
// other tolerance values have not been fully recovered. Translation/rotation
// caps come from the shipped b2Island::Solve, rather than Planck defaults.
// Native setSlop(.005f) controls TOI separately from the compiled zero
// position-correction slop. Planck shares the value, but correction stays0.
Settings.linearSlop=Math.fround(.005)/NATIVE_PER_WORLD;
Settings.maxLinearCorrection=0;
Settings.aabbExtension=.1/NATIVE_PER_WORLD;
Settings.velocityThreshold=1/NATIVE_PER_WORLD;
Settings.maxTranslation=POOL_NATIVE.maxTranslation/NATIVE_PER_WORLD;
Settings.maxRotation=POOL_NATIVE.maxRotation;

function configureContact(contact){
 const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();
 if(a?.kind==='ball'&&b?.kind==='ball'){
  contact.setFriction(a.ball.n===0||b.ball.n===0?0:.5);contact.setRestitution(1);
 } else {contact.setFriction(.5);contact.setRestitution(.75);}
}

export class PoolPhysics {
 constructor(balls,{radius=8.4,pockets=[],rails=true,onBallContact=()=>{},onRail=()=>{},onPocket=()=>{}}={}){
  this.nativeTable=rails;this.balls=balls;this.radius=radius;this.pixelsPerWorld=radius/(POOL_NATIVE.radius/NATIVE_PER_WORLD);this.pockets=pockets;this.onBallContact=onBallContact;this.onRail=onRail;this.onPocket=onPocket;this.accumulator=0;
  this.world=new World(Vec2(0,0));this.bodies=new Map();this.spinState=null;
  if(rails)this.createRails();
  for(const ball of balls){const body=this.world.createDynamicBody({position:this.toWorld(ball.x,ball.y),linearVelocity:this.velocityToWorld(ball.vx||0,ball.vy||0),angularDamping:POOL_NATIVE.angularDamping,bullet:true,userData:{kind:'ball',ball}});
   body.createFixture(Circle(POOL_NATIVE.radius/NATIVE_PER_WORLD),{density:ball.n===0?.99:ball.density??1,friction:0,restitution:1});body.setActive(!ball.out);this.bodies.set(ball,body);}
  this.world.on('pre-solve',configureContact);
  this.world.on('begin-contact',contact=>{
   const a=contact.getFixtureA().getBody().getUserData(),b=contact.getFixtureB().getBody().getUserData();
   if(a?.kind==='ball'&&b?.kind==='ball'){
    if((a.ball.n===0||b.ball.n===0)&&this.spinState?.delay===-1)this.spinState.delay=0;
    this.onBallContact(a.ball,b.ball);
   }else if(a?.kind==='ball'||b?.kind==='ball')this.onRail(a?.kind==='ball'?a.ball:b.ball);
  });
 }
 toWorld(x,y){const p=this.nativeTable?canvasToNative(x,y):{x:x*NATIVE_PER_WORLD/this.pixelsPerWorld,y:y*NATIVE_PER_WORLD/this.pixelsPerWorld};return Vec2(p.x/NATIVE_PER_WORLD,p.y/NATIVE_PER_WORLD);}
 velocityToWorld(x,y){const p=this.nativeTable?canvasVelocityToNative(x,y):{x:x*NATIVE_PER_WORLD/this.pixelsPerWorld,y:y*NATIVE_PER_WORLD/this.pixelsPerWorld};return Vec2(p.x/NATIVE_PER_WORLD,p.y/NATIVE_PER_WORLD);}
 toCanvas(x,y){return this.nativeTable?nativeToCanvas(x*NATIVE_PER_WORLD,y*NATIVE_PER_WORLD):{x:x*this.pixelsPerWorld,y:y*this.pixelsPerWorld};}
 velocityToCanvas(x,y){return this.nativeTable?nativeVelocityToCanvas(x*NATIVE_PER_WORLD,y*NATIVE_PER_WORLD):{x:x*this.pixelsPerWorld,y:y*this.pixelsPerWorld};}
 createRails(){
  const rail=this.world.createBody({userData:{kind:'rail'}});
  // Preserve the 47 original two-sided b2EdgeShape fixtures, including the
  // duplicated first cushion edge and each pocket throat closure. The local
  // new-game path uses v2=v3=1; other native version paths remain in evidence.
  for(const {a,b}of nativePoolEdges){const edge=Edge(Vec2(a[0]/100,a[1]/100),Vec2(b[0]/100,b[1]/100));edge.m_radius=0;rail.createFixture(edge,{density:1,friction:.5,restitution:.75});}
 }
 syncFromBalls(){
  this.accumulator=0;this.spinState=null;
  for(const [ball,body]of this.bodies){body.setActive(!ball.out);body.setTransform(this.toWorld(ball.x,ball.y),0);body.setLinearVelocity(this.velocityToWorld(ball.vx||0,ball.vy||0));body.setAngularVelocity(0);body.setAwake(!ball.out);}
 }
 strikeCue(angle,power,spin=null){
  const ball=this.balls.find(b=>b.n===0),body=this.bodies.get(ball);if(!body||ball.out)return false;
  const direction=this.nativeTable?canvasVelocityToNative(Math.cos(angle),Math.sin(angle)):{x:Math.cos(angle),y:Math.sin(angle)},length=Math.hypot(direction.x,direction.y),x=direction.x/length,y=direction.y/length,nativePower=Math.max(0,Math.min(POOL_NATIVE.maxPower,power));
  body.setLinearVelocity(Vec2(x*nativePower/NATIVE_PER_WORLD,y*nativePower/NATIVE_PER_WORLD));body.setAwake(true);
  // The recovered native function takes spin_x/spin_y parameters. Browser
  // inset coordinates map to the original +/-50 dot range. Native shoot2
  // uses spin_x=dot.x/50*230 and spin_y=(dot.y+22)/50*65; screen Y is inverted.
  const sx=(spin?.x||0)*230,sy=(.44-(spin?.y||0))*65,angular=nativePower/2000*sx;
  body.setAngularVelocity(Math.abs(angular)>=50?angular:0);
  this.spinState={ball,power:nativePower/2000*Math.abs(sy),x:sy>=0?x:-x,y:sy>=0?y:-y,delay:-1};
  return true;
 }
 step(dt){
  this.accumulator+=Math.max(0,Math.min(dt,.25));
  while(this.accumulator+1e-12>=POOL_NATIVE.step){this.fixedStep();this.accumulator-=POOL_NATIVE.step;}
  return this.isMoving();
 }
 fixedStep(){
  const previous=new Map([...this.bodies].map(([ball,body])=>[ball,body.getPosition().clone()]));
  this.world.step(POOL_NATIVE.step,POOL_NATIVE.velocityIterations,POOL_NATIVE.positionIterations);
  for(const [ball,body]of this.bodies){
   if(ball.out||!body.isActive())continue;
   const velocity=body.getLinearVelocity(),oldNativeSpeed=velocity.length()*NATIVE_PER_WORLD;
   let speed=(oldNativeSpeed-POOL_NATIVE.clothSubtract)*POOL_NATIVE.clothMultiplier;if(speed<POOL_NATIVE.stopSpeed)speed=0;
   body.setLinearVelocity(oldNativeSpeed?Vec2(velocity.x*speed/oldNativeSpeed,velocity.y*speed/oldNativeSpeed):Vec2(0,0));
   let angular=body.getAngularVelocity();if(Math.abs(angular)<3)angular*=.8;if(Math.abs(angular)<.1)angular=0;body.setAngularVelocity(angular);
   const position=body.getPosition();
   for(let index=0;index<this.pockets.length;index++){
    const hole=this.toWorld(...this.pockets[index]),dx=hole.x-position.x,dy=hole.y-position.y,distance=Math.hypot(dx,dy);
    if(distance<POOL_NATIVE.holeRadius*.5/NATIVE_PER_WORLD){this.pocket(ball,index);break;}
    if(distance<POOL_NATIVE.holeRadius/NATIVE_PER_WORLD){const v=body.getLinearVelocity();body.setLinearVelocity(Vec2(v.x+dx*5,v.y+dy*5));}
   }
  }
  const spin=this.spinState;
  if(spin&&!spin.ball.out){spin.power*=POOL_NATIVE.spinDecay;if(spin.delay>=0)spin.delay++;if(spin.delay>=3&&spin.power>POOL_NATIVE.spinThreshold){const body=this.bodies.get(spin.ball),v=body.getLinearVelocity(),extra=spin.power*Math.trunc(spin.delay/3)/NATIVE_PER_WORLD;body.setLinearVelocity(Vec2(v.x+spin.x*extra,v.y+spin.y*extra));}}
  for(const [ball,body]of this.bodies){
   if(ball.out)continue;const position=body.getPosition(),velocity=body.getLinearVelocity(),prev=previous.get(ball);
   const screen=this.toCanvas(position.x,position.y),speed=this.velocityToCanvas(velocity.x,velocity.y),delta=this.velocityToCanvas(position.x-prev.x,position.y-prev.y);
   ball.x=screen.x;ball.y=screen.y;ball.vx=speed.x;ball.vy=speed.y;
   ball.yaw=(ball.yaw??Math.PI/2)+delta.x/this.radius;ball.pitch=(ball.pitch||0)+delta.y/this.radius;
  }
 }
 pocket(ball,index){if(ball.out)return;ball.out=true;ball.vx=ball.vy=0;const body=this.bodies.get(ball);body.setLinearVelocity(Vec2(0,0));body.setAngularVelocity(0);body.setActive(false);this.onPocket(ball,index);}
 isMoving(){for(const [ball,body]of this.bodies)if(!ball.out&&(body.getLinearVelocity().lengthSquared()>0||body.getAngularVelocity()!==0))return true;return false;}
 stop(){this.spinState=null;for(const [ball,body]of this.bodies){body.setLinearVelocity(Vec2(0,0));body.setAngularVelocity(0);ball.vx=ball.vy=0;}}
 destroy(){this.stop();this.world.off('pre-solve',configureContact);}
}

