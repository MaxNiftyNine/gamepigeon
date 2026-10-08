// Original portrait layout: table children rotate +pi/2, native positions
// become sprites at *.67, and the board anchor is its center. Exported 3x
// board_top artwork is 1025x1716; host draws it at (0,15,420,690).
export const POOL_TABLE=Object.freeze({centerX:392,centerY:220,spriteScale:.67,scaleX:420/(1025/3),scaleY:690/(1716/3),canvasX:210,canvasY:360});
const sx=POOL_TABLE.scaleX*.67,sy=POOL_TABLE.scaleY*.67;
export function nativeToCanvas(x,y){return {x:210+(220-y)*sx,y:360-(x-392)*sy};}
export function canvasToNative(x,y){return {x:392-(y-360)/sy,y:220-(x-210)/sx};}
export function nativeVelocityToCanvas(x,y){return {x:-y*sx,y:-x*sy};}
export function canvasVelocityToNative(x,y){return {x:-y/sy,y:-x/sx};}
// Keep public pocket indices in clockwise artwork order used by the host.
export const nativePoolPockets=[[744,400],[744,40],[392,412],[392,28],[40,400],[40,40]];
export const poolPockets=nativePoolPockets.map(p=>{const v=nativeToCanvas(...p);return [v.x,v.y];});
export const poolBallRadius=10*(sx+sy)/2;
export function rackPosition(row,col){
 const sc=Math.fround(1.05),x=Math.fround(Math.fround(17.32050895690918*row)*sc+560),y=Math.fround(Math.fround(20*(row/2-col))*sc+220);
 return nativeToCanvas(x,y);
}
export const cueStart=nativeToCanvas(220,220);
// Native setBalls passes different densities for each rack slot. Its random
// draws use drand48; the browser supplies Math.random with the same ranges.
export function rackDensities(random=Math.random){
 const density=(range,base)=>Math.fround(+Math.fround(random()*range+base).toFixed(6));
 const rear=[density(.5,.8),.05,density(.2,.05),.05,density(.5,.8)];
 const row3=[density(.3,.8),density(.3,.7),density(.3,.7),density(.5,.8)];
 const row2=[density(.3,.8),density(.5,1),density(.3,.8)];
 const row1=random()<.5?[.9,1.1]:[1.1,.9];
 return [[1],row1.reverse(),row2.reverse(),row3.reverse(),rear.reverse()];
}
// fixWhiteConflict clamps in native coordinates with a .1 clearance, pushes
// an overlapping ball to 20.2 separation, and restricts initial placement to
// the kitchen (native X <=220). A finite cap avoids a pathological UI loop.
export function placeCue(x,y,balls,kitchen=false,excludeN=0){
 const p=canvasToNative(x,y),others=balls.filter(b=>b.n!==excludeN&&!b.out).map(b=>canvasToNative(b.x,b.y));
 let fallback={x:392-p.x,y:220-p.y},length=Math.hypot(fallback.x,fallback.y);if(length)fallback={x:fallback.x/length,y:fallback.y/length};else fallback={x:1,y:0};let chosen=false;
 for(let pass=0;pass<64;pass++){
  let changed=false;
  if(p.x<60){p.x=60.1;changed=true;}if(p.y<60){p.y=60.1;changed=true;}
  if(p.x>724){p.x=723.9;changed=true;}if(p.y>380){p.y=379.9;changed=true;}
  if(kitchen&&p.x>220){p.x=220;changed=true;}
  let direction=fallback;
  for(const b of others)if(Math.hypot(p.x-b.x,p.y-b.y)<20){
   if(pass<10&&!chosen){const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy);if(d)direction={x:dx/d,y:dy/d};chosen=true;}
   p.x=b.x+direction.x*20.2;p.y=b.y+direction.y*20.2;changed=true;
  }
  if(!changed)return nativeToCanvas(p.x,p.y);
 }
 return null;
}

export const cueReset=nativeToCanvas(392,225);
