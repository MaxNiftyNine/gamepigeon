import {PAINT_NATIVE, gunRecoil, outgoingPaintball, enemyReaction, incomingTimeline, incomingHeadMotion, incomingPaintball} from './paint-animation.js';
import {nativeActionProgress} from './native-action.js';

// Native SpriteKit coordinates, positive Y up. See evidence/paint-visual-recovery.md.
export const PAINT_STAGE = Object.freeze({width:375, height:536, nearY:110, farY:255,
  laneSpacing:108, farScale:.584, fpsFarScale:.584*1.3, fpsNearScale:4,
  fpsFarY:697, fpsGroundY:718, cameraTravel:500, targetY:160,
  groundWidth:4000/3, groundHeight:536});
const clamp = n => Math.max(0, Math.min(1, n));
export function paintProjection(width=420,height=700) {
  const ratio=Math.fround(Math.min(width/375,height/536));
  return {ratio,width,height,stageWidth:width/ratio,stageHeight:height/ratio,
    point:(x,y)=>({x:width/2+x*ratio,y:height-y*ratio})};
}
export function paintLayout({own=0,target=0,fps=false,cameraAge=.8,revealAge=-1,fireAge=-1,hit=false,width=420,height=700}={}) {
  const projection=paintProjection(width,height), dudeX=(own-1)*108;
  // Source timing modes, with curves corroborated by the installed-framework probe.
  const travel=500*nativeActionProgress(cameraAge/PAINT_NATIVE.cameraDuration,3);
  const farScale=fps?PAINT_STAGE.fpsFarScale:PAINT_STAGE.farScale;
  const farX=fps?-.33*dudeX:0,farY=fps?697-travel:255;
  const nearX=fps?-4*dudeX:0,nearY=fps?110-travel:110,nearScale=fps?4:1;
  const far=Array.from({length:3},(_,lane)=>({lane,x:farX+(1-lane)*108*farScale,y:farY,scale:farScale}));
  const near=Array.from({length:3},(_,lane)=>({lane,x:nearX+(lane-1)*108*nearScale,y:nearY,scale:nearScale}));
  const gunEnd=[180,90,10][target]-.33*dudeX;
  const gunEase=nativeActionProgress(cameraAge/PAINT_NATIVE.gunAimDuration,2);
  const recoil=gunRecoil(fireAge);
  const gun={x:170+(gunEnd-170)*gunEase+recoil.x,y:124+recoil.y};
  // Projectile origin is captured at firing, so subsequent gun recoil cannot drag it.
  const motion=outgoingPaintball(fireAge,hit);
  const projectile={...motion,x:gunEnd-53+motion.x,y:124+117+motion.y};
  const reaction=enemyReaction(hit?fireAge-PAINT_NATIVE.flightDuration:-1);
  const head={y:100+50*clamp(revealAge/.33)+reaction.rise,scale:4/3*reaction.scale};
  const reticle={x:far[target].x,y:farY+160*farScale,scale:farScale*(fps?1.25:1.3157894736842106)};
  return {projection,far,near,gun,projectile,head,reticle,
    background:{x:fps?-1.3*dudeX:0,y:fps?718-travel:268,scale:fps?1.3:1},
    flashAlpha:fps?1-clamp(cameraAge/.2):0};
}
export function targetPulse(age) {
  const phase=((age%1)+1)%1;
  return phase<.5?1+.2*(phase/.5):1.2-.2*((phase-.5)/.5);
}
export function moveArrow(age) {
  const phase=((age%1)+1)%1;
  return {y:45+(phase<.5?20*phase:20*(1-phase))};
}
export function tireDecoration(random=Math.random,far=false) {
  // PaintTire init reseeds drand48 from arc4random. We preserve distributions and
  // call order, but use injected browser RNG; no claim of native random-seed matching.
  return Array.from({length:5},(_,i)=>{
    let variant=1+Math.floor(random()*2);
    if(far)variant=1+Math.floor(random()*2); // discarded first sprite in native type 2
    let x=(-12+24*random())*.66,y=i*39*.66;
    const sy=.95+.1*random(),sx=.95/sy;
    let rotation=(-5+10*random())*Math.PI/180;
    if(i===0)rotation=0;
    if(i===4){rotation=(-1+2*random())*Math.PI/180;x=0;y=(i*39-1+5*random())*.66;}
    const count=1+Math.floor(random()*4),specks=[];
    for(let j=0;j<count;j++)specks.push({name:`paint_tire_speck000${1+Math.floor(random()*6)}`,
      x:-35+70*random(),y:2-18*random(),sx:.1+.75*random(),sy:.1+.75*random(),
      alpha:.1+.35*random(),rotation:2*Math.PI*random(),hue:random()});
    return {name:far?`paint_tire000${variant}`:`paint_tire${variant}`,x,y,sx,sy,rotation,specks};
  });
}
export function tireHitMark(side=false) {return {name:'paint_tire_speck0001',x:side?-6:-2,y:12.5,scale:1.15,alpha:.8};}

// Only frozen previous-shot fields enter this receiver view. In particular,
// neither an opponent's later movement nor the receiver's future target is read.
export function incomingPaintLayout(record,age,width=420,height=700) {
  const timing=incomingTimeline(age),own=record.recipientLaneAtFire;
  const layout=paintLayout({own,fps:!timing.reset,cameraAge:timing.cameraAge,width,height});
  const direction=Math.sign(record.previousTargetLane-own);
  const motion=incomingHeadMotion(timing.fireAge,direction);
  const shooter=layout.far[record.shooterLaneAtFire];
  const farScale=PAINT_STAGE.fpsFarScale,dudeX=(own-1)*108;
  const start={x:-.33*dudeX+(1-record.shooterLaneAtFire)*108*farScale+(direction===0?5:18*direction),
    y:197+150*farScale-3};
  const end={x:432*(record.previousTargetLane-own),y:350};
  return {...layout,...timing,direction,shooter,
    // Native has a paired outgoing aim here. Local history has no future aim;
    // hold the recovered initial FPS gun pose instead of inventing one.
    gun:{x:170,y:124},head:{x:motion.x,y:100+50*clamp(timing.revealAge/.33)+motion.y,scale:4/3*motion.scale},
    headVisible:timing.revealAge>=0&&!timing.reset,
    projectile:{...incomingPaintball(timing.fireAge,record.hit,start,end),rotation:direction===0?0:direction===1?-2:1},
    muzzle:start,endpoint:end,flashAlpha:timing.flashAlpha};
}

// These are ONLY the default incoming-hit screen splats from heShoot, never an
// outgoing impact burst. Deliberately independent of rules/damage; the local
// controller uses them only while visually replaying a frozen previous shot.
export function incomingPaintSplats(random=Math.random,receivingPlayer=0) {
  return Array.from({length:30},()=>{
    const name=`paint_splat000${1+Math.floor(random()*6)}`,grow=random();
    const dark=random()<.5;
    const base=receivingPlayer===0?[1,31/255,31/255]:[1,1,0];
    const color=base.map(c=>c*(dark?.85:1));
    // Native applies a second independent 50% darken(.9) after style dispatch.
    if(random()<.5)for(let i=0;i<3;i++)color[i]*=.9;
    const opacity=random(),delay=Math.fround(.13+.05*random()),duration=Math.fround(.05+.05*random());
    const rotation=Math.PI*random(),x=-100+200*random(),y=-125+250*random();
    return {name,color,rotation,x,y,startScale:.1,endScale:Math.fround(1+grow),
      endAlpha:Math.fround(.7+.3*opacity),delay,duration};
  });
}
export function incomingSplatFrame(splat,age) {
  const t=clamp((age-splat.delay)/splat.duration);
  return {x:splat.x*t,y:splat.y*t,scale:.1+(splat.endScale-.1)*t,alpha:splat.endAlpha*t,rotation:splat.rotation};
}
