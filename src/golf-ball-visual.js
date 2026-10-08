// Static GolfBall/GolfScene evidence; no original app execution. Units are native
// course units. Public directions/positions use browser Y-down coordinates.
export const GOLF_BALL_VISUAL = Object.freeze({
  ball:Object.freeze({asset:'golf_ball',width:10,height:10,blend:0,z:6}),
  shadow:Object.freeze({asset:'golf_ball',width:10,height:10,tint:'#000000',blend:1,alpha:.2,offsetX:0,offsetY:2}),
  halo:Object.freeze({asset:'knock_round',width:41,height:41,tint:'#ffffff',blend:1,z:0}),
  dot:Object.freeze({asset:'golf_dot',width:5,height:5,scale:.75,count:13,z:0}),
  arrow:Object.freeze({asset:'knock_arrow',width:60,height:30,tint:'#ffffff',blend:1,alpha:.9,z:6,anchor:[0,.5],centerRect:[.3,0,.41,1],hidden:true}),
  trail:Object.freeze({supported:false,reason:'No moving-ball trail handler verified in GolfBall or inspected GolfScene update.'}),
});
const f=Math.fround;
const finite=(value,label)=>{if(!Number.isFinite(value))throw new RangeError(`${label} must be finite`);return value;};

export function createGolfBallVisual(){return {direction:0,distance:0,dotsVisible:false,blink:null,shadowAlpha:.2,frameRemainder:0};}
export function setGolfBallAim(state,direction,distance){
  direction=f(finite(direction,'direction'));distance=f(finite(distance,'distance'));
  if(distance<5)distance=0;
  // setDir:dist: explicitly unhides each dot before checking the 5-unit gate.
  return {...state,direction,distance,dotsVisible:distance>=5};
}
export function hideGolfBallDots(state){return {...state,dotsVisible:false};}
export function showGolfBallDots(state){return {...state,dotsVisible:true};}
export function blinkGolfBall(state,randomUnit=0){
  finite(randomUnit,'randomUnit');if(randomUnit<0||randomUnit>=1)throw new RangeError('randomUnit must be in [0,1)');
  // blink removes old actions, unhides, resets alpha0/scale1, then waits.
  return {...state,blink:{elapsed:0,delay:randomUnit*.5,hidden:false}};
}
export function unblinkGolfBall(state){
  // Native only hides the halo; its existing actions keep their elapsed time.
  return state.blink?{...state,blink:{...state.blink,hidden:true}}:{...state};
}
export function golfBlinkFrame(blink){
  if(!blink)return {hidden:true,alpha:0,scale:1};
  const time=blink.elapsed-blink.delay;
  if(time<=0)return {hidden:blink.hidden,alpha:0,scale:1};
  const cycle=Math.floor(time/.9),phase=time-cycle*.9;
  if(phase<.45){const t=phase/.45,startScale=cycle===0?1:.93,startAlpha=cycle===0?0:.15;
    return {hidden:blink.hidden,scale:startScale+(1.15-startScale)*t,alpha:startAlpha+(.3-startAlpha)*t};}
  const t=(phase-.45)/.45;
  return {hidden:blink.hidden,scale:1.15+(.93-1.15)*t,alpha:.3+(.15-.3)*t};
}
export function updateGolfBallVisual(state,dt,{ballScale=1}={}){
  finite(dt,'dt');finite(ballScale,'ballScale');if(dt<0)throw new RangeError('dt must be nonnegative');
  const elapsed=state.frameRemainder+dt,ticks=Math.floor((elapsed+1e-10)*60),frameRemainder=Math.max(0,elapsed-ticks/60);
  // GolfScene fades the detached shadow per fixed native tick below scale .9.
  const shadowAlpha=ballScale<.9?state.shadowAlpha*Math.pow(.6,ticks):state.shadowAlpha;
  return {...state,frameRemainder,shadowAlpha,blink:state.blink?{...state.blink,elapsed:state.blink.elapsed+dt}:null};
}
export function golfAimDots(direction,distance){
  direction=f(finite(direction,'direction'));distance=f(finite(distance,'distance'));if(distance<5)distance=0;
  // __sincosf_stret returns float32 sin/cos, promoted to double for CGPoint.
  const cos=f(Math.cos(direction)),sin=f(Math.sin(direction));
  return Array.from({length:13},(_,index)=>({index,x:distance/13*index*cos,y:distance/13*index*sin}));
}
function sprite(spec,x,y,scale=1,alpha=1){return {...spec,x,y,width:spec.width*scale,height:spec.height*scale,alpha};}
export function describeGolfBallVisual(state,{x,y,scale=1,alpha=1,shadowAlpha=state.shadowAlpha}){
  [x,y,scale,alpha,shadowAlpha].forEach((value)=>finite(value,'ball visual property'));
  const pulse=golfBlinkFrame(state.blink),ball=GOLF_BALL_VISUAL.ball,shadow=GOLF_BALL_VISUAL.shadow;
  return {
    ball:sprite(ball,x,y,scale,alpha),
    // Native shadow is detached from the ball node: neither root scale nor root
    // alpha applies. Native (0,-2) offset becomes (0,+2) in browser coordinates.
    shadow:sprite(shadow,x+shadow.offsetX,y+shadow.offsetY,1,shadowAlpha),
    halo:{...sprite(GOLF_BALL_VISUAL.halo,x,y,scale*pulse.scale,alpha*pulse.alpha),hidden:pulse.hidden},
    aim:golfAimDots(state.direction,state.distance).map(p=>({...sprite(GOLF_BALL_VISUAL.dot,x+p.x*scale,y+p.y*scale,GOLF_BALL_VISUAL.dot.scale*scale,alpha),index:p.index,hidden:!state.dotsVisible})),
    // setDir only moves aim dots; no inspected caller unhides the ball arrow.
    arrow:{...sprite(GOLF_BALL_VISUAL.arrow,x,y,scale,alpha*.9),hidden:true},
    trail:GOLF_BALL_VISUAL.trail,
  };
}
