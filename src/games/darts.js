import {DARTS_NATIVE as N,DARTS_VIEW as V,boardPoint,screenPoint,projectDart,heldDart,heldTouchPoint,nativeThrowTarget,nativeDartFlight,nativeDartPose,nativeHeldStep,DARTS_SCENE,advanceDartSpin} from '../darts-flight.js';
import {nativeBackground} from '../native-background.js';
export {nativeThrowTarget,nativeDartFlight,nativeDartPose,nativeHeldStep,DARTS_SCENE,advanceDartSpin} from '../darts-flight.js';
const SECTORS=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
// Native scoring compares float32 world distance against recovered ring radii.
export function dartScore(x,y,radius=1){
  const distance=Math.fround(Math.hypot(x,y)/radius*N.outer);
  if(distance>=N.outer)return {score:0,label:'MISS',multiplier:0,value:0};
  if(distance<N.bull50)return {score:50,label:'BULL · 50',multiplier:1,value:50};
  if(distance<N.bull25)return {score:25,label:'OUTER BULL · 25',multiplier:1,value:25};
  let a=Math.atan2(x,-y);if(a<0)a+=Math.PI*2;
  const value=SECTORS[Math.floor((a+Math.PI/20)/(Math.PI/10))%20];
  const multiplier=distance>=N.double?2:(distance>=N.tripleInner&&distance<N.tripleOuter?3:1);
  return {score:value*multiplier,label:`${multiplier===3?'TRIPLE ':multiplier===2?'DOUBLE ':''}${value}`,multiplier,value};
}
export class DartsRules {
  constructor(start=101){this.scores=[start,start];this.player=1;this.darts=0;this.opening=start;this.finished=false;this.winner=null;this.finalChance=false;this.round=1;}
  throw(score){if(this.finished||!Number.isInteger(score)||score<0||score>60)return null;
    const player=this.player;this.darts++;this.scores[player-1]-=score;let bust=false,next=false;
    if(this.scores[player-1]<0){this.scores[player-1]=this.opening;bust=true;next=true;}
    else if(this.scores[player-1]===0){if(player===1){this.finalChance=true;next=true;}else {this.finished=true;this.winner=this.finalChance?null:2;}}
    else if(this.darts===3)next=true;
    if(next&&!this.finished){if(player===2&&this.finalChance){this.finished=true;this.winner=1;}else {this.player=3-player;this.darts=0;this.opening=this.scores[this.player-1];if(this.player===1)this.round++;}}
    return {score,player,bust,next,finished:this.finished,winner:this.winner,finalChance:this.finalChance};
  }
}
const INSTRUCTION='Swipe up from the dart. Faster, longer swipes throw higher; angle your swipe left or right.';
export default class DartsGame {
  constructor(host){
    this.h=host;this.background=nativeBackground(host.assets.game_background);this.rules=new DartsRules();this.marks=[];this.drag=null;this.flight=null;this.ready=true;this.accumulator=0;this.bob=0;this.bobSlow=1;
    this.spawnAppearance();this.setControls();host.turn(0,'Three darts. Reach exactly zero.');
    if(typeof document!=='undefined'&&host.canvas)import('../darts-renderer.js').then(({DartsRenderer})=>{if(!this.destroyed)this.renderer=new DartsRenderer(host.assets);}).catch(()=>{this.renderer=null;});
  }
  spawnAppearance(){this.appearance={rotationSpeed:Math.fround(.12+Math.random()*.05),shadowVariant:1+Math.floor(Math.random()*3)};}
  setControls(){this.h.controls(`<label>Start score <select id="darts-score"><option>101</option><option>201</option><option>301</option></select></label><p class="instruction">${INSTRUCTION}</p>`);this.h.onControl('#darts-score','change',e=>{if(!this.started){this.rules=new DartsRules(+e.target.value);this.h.status('Three darts per turn. Reach exactly zero.');}});}
  eventTime(p){return p.time??performance.now()/1000;}
  pointerDown(p){
    if(!this.ready||this.rules.finished)return;
    const origin=heldDart(N.originY-Math.sin(this.bob*.05)*.01),center=heldTouchPoint(origin.y),perspective=center.scale;
    const dx=(p.x-center.x)/(V.units*perspective),dy=-(p.y-center.y)/(V.units*perspective);
    // Native touch gate: |x|<.036; -.1<y<.052 near held dart.
    if(Math.abs(dx)>=.036||dy<=-.1||dy>=.052){this.h.status('Start your swipe on the dart below the board.');return;}
    this.drag={start:boardPoint(p),current:boardPoint(p),start0:boardPoint(center),origin,startScreen:{...p},endScreen:{...p},date:this.eventTime(p),age:0,activeStart:0,sampled:boardPoint(p),previousStep:0,frames:0,spin:DARTS_SCENE.childRoll,primed:false};
  }
  pointerMove(p){
    if(!this.drag)return;const d=this.drag;d.current=boardPoint(p);d.endScreen={...p};d.age=Math.max(d.age,this.eventTime(p)-d.date);
    if(!d.primed&&Math.hypot(d.current.x-d.start.x,d.current.y-d.start.y)>N.distanceGate){d.primed=true;this.h.sound('whoosh1.mp3');}
  }
  pointerUp(p){
    if(!this.drag)return;this.pointerMove(p);const d=this.drag;
    if(!d.primed){this.drag=null;this.h.status('Swipe upward farther before releasing.');return;}
    this.launch(d);
  }
  pointerCancel(){this.drag=null;}
  launch(d){
    const target=nativeThrowTarget(d.start,d.current,Math.max(d.age-d.activeStart,1/120),d.start0);
    this.drag=null;
    if(!target){this.h.status('Swipe upward from the dart toward the board.');return;}
    this.started=true;const select=(this.h.canvas?.closest?.('.stage')||this.h.canvas?.parentElement)?.querySelector('#darts-score');if(select)select.disabled=true;
    this.flight={origin:d.origin,target,frames:d.frames,spin:d.spin,player:this.rules.player,...this.appearance};this.ready=false;
  }
  update(dt){
    this.accumulator+=Math.min(dt,.1);
    while(this.accumulator>=1/60){this.accumulator-=1/60;if(this.ready&&!this.flight&&!this.drag?.primed){const held=nativeHeldStep(this.bob,this.bobSlow,!!this.drag);this.bobSlow=held.slow;this.bob=held.phase;if(this.drag)this.drag.origin=heldDart(held.y);}
      if(this.flash)this.flash.age+=1/60;
      if(this.drag){const d=this.drag;d.age+=1/60;
        const step=Math.fround(Math.hypot(d.current.x-d.sampled.x,d.current.y-d.sampled.y));
        if(!d.primed&&step<.03&&step<=d.previousStep&&d.age>.18)d.activeStart=d.age-1/60;
        d.sampled={...d.current};d.previousStep=step;
        if(d.primed){d.frames++;const target=nativeThrowTarget(d.start,d.current,Math.max(d.age-d.activeStart,1/120),d.start0);if(target)d.spin=advanceDartSpin(d.spin,target.x,this.appearance.rotationSpeed);if(d.frames>5)this.launch(d);}
      }
      else if(this.flight){const flight=this.flight;flight.frames++;if(flight.frames<30&&flight.spin!==undefined)flight.spin=advanceDartSpin(flight.spin,flight.target.x,flight.rotationSpeed);if(flight.frames>=30)this.land();}
    }
  }
  land(){
    const f=this.flight;this.flight=null;const screen=screenPoint(f.target),score=dartScore(f.target.x,N.boardY-f.target.y,N.outer);
    const result=this.rules.throw(score.score),pose=nativeDartPose(f.origin,f.target,30,f.rotationSpeed);
    this.marks.push({...screen,position:f.target,player:result.player,...pose,spin:f.spin??pose.spin,shadowVariant:f.shadowVariant,shadow:true});
    if(score.score){const radius=Math.hypot(f.target.x,f.target.y-N.boardY),type=score.score===50?6:score.score===25?5:score.multiplier===3?4:score.multiplier===2?3:radius>=N.tripleOuter?2:1;
      this.flash={type,age:0,angle:(type>=5?0:SECTORS.indexOf(score.value)*Math.PI/10)};}
    this.h.sound('darts_impact.mp3');this.h.status(`${score.label}${result.bust?' — BUST, turn score restored':''}`);
    if(result.finished)this.h.finish(result.winner===null?null:result.winner-1,result.winner?`Player ${result.winner} wins!`:'Both players reached zero — draw!');
    else if(result.next){this.ready=false;this.h.controls(`<button id="darts-next">${result.finalChance?'Player 2: final chance':'Pass to Player '+this.rules.player}</button>`);this.h.onControl('#darts-next','click',()=>{this.marks=[];this.spawnAppearance();this.ready=true;this.h.controls(`<p class="instruction">${INSTRUCTION}</p>`);this.h.turn(this.rules.player-1,this.rules.finalChance?'Final chance to tie.':'Three darts. Reach exactly zero.');});}
    else {this.spawnAppearance();this.ready=true;}
  }
  dartViews(){
    const darts=this.marks.map(m=>({...m}));let moving=this.flight;
    if(this.drag?.primed){const d=this.drag,target=nativeThrowTarget(d.start,d.current,Math.max(d.age-d.activeStart,1/120),d.start0);if(target)moving={origin:d.origin,target,frames:d.frames,spin:d.spin,player:this.rules.player,...this.appearance};}
    if(moving){const t=moving.frames/30;darts.push({position:nativeDartFlight(moving.origin,moving.target,t),player:moving.player,
      ...nativeDartPose(moving.origin,moving.target,moving.frames,moving.rotationSpeed),...(moving.spin===undefined?{}:{spin:moving.spin}),shadow:moving.frames>0,shadowVariant:moving.shadowVariant});}
    else if(this.ready)darts.push({position:this.drag?.origin??heldDart(N.originY-Math.sin(this.bob*.05)*.01),player:this.rules.player,pitch:DARTS_SCENE.heldPitch,spin:DARTS_SCENE.childRoll});
    return darts;
  }
  draw(ctx){
    if(!this.renderer){
    ctx.fillStyle='#2c221c';ctx.fillRect(0,0,420,700);const texture=this.h.assets.darts_board_texture;if(texture){const scale=2.1*V.units*(N.cameraZ-N.boardZ)/N.cameraZ,w=3.9*scale,h=3*scale;ctx.drawImage(texture,210-w/2,350-h/2,w,h);}
    const boardShadow=this.h.assets.darts_dart_board_shadow;if(boardShadow){const p=projectDart({x:.015200000256299973,y:.28904634714126587,z:.019197938963770866}),width=1.3*V.units*p.scale;ctx.globalAlpha=.6399999856948853*.4;ctx.drawImage(boardShadow,p.x-width/2,p.y-width/2,width,width);ctx.globalAlpha=1;}
    const board=this.h.assets.darts_dart_board;if(board)ctx.drawImage(board,V.cx-V.outerWidth/2,V.cy-V.outerWidth/2,V.outerWidth,V.outerWidth);
    else {ctx.fillStyle='#151713';ctx.beginPath();ctx.arc(V.cx,V.cy,V.outerWidth/2,0,Math.PI*2);ctx.fill();}
    if(this.flash&&this.flash.age<.78){const im=this.h.assets[`darts_board_light000${this.flash.type}`];if(im){ctx.save();ctx.globalAlpha=this.flash.age<.05?this.flash.age/.05:Math.max(0,1-(this.flash.age-.05)/.73);ctx.translate(V.cx,V.cy);ctx.rotate(this.flash.angle);ctx.drawImage(im,-V.outerWidth/2,-V.outerWidth/2,V.outerWidth,V.outerWidth);ctx.restore();}}
    }
    const darts=this.dartViews();
    // Mesh rendering uses original vertices and UV textures. Original UI sprite is
    // retained as a fallback for browsers without WebGL.
    if(this.renderer)this.renderer.draw(ctx,darts,this.flash);
    else for(const d of darts){const p=projectDart(d.position),im=this.h.assets[`darts_ui_dart000${d.player-1}`]??this.h.assets.darts_ui_dart0000;
      if(im){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-d.yaw*.35);const height=35*Math.min(3,p.scale);ctx.drawImage(im,-height*.22,-height,height*.44,height);ctx.restore();}}
    if(this.background){ctx.save();ctx.globalAlpha=.38;ctx.drawImage(this.background,0,0,420,700);ctx.restore();}
    // DartsScene.resize puts native score panels at .14/.86W,.07H. Keep
    // local player labels immediately above those panels, below the dart.
    for(let i=0;i<2;i++){const x=420*(i ? .86 : .14),y=651,im=this.h.assets.darts_scoreboard;if(im)ctx.drawImage(im,x-im.width/3*V.ratio/2,y-im.height/3*V.ratio/2,im.width/3*V.ratio,im.height/3*V.ratio);ctx.fillStyle=this.rules.player===i+1?'#ffc657':'#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${17*V.ratio}px GP, system-ui`;ctx.fillText(this.rules.scores[i],x,y-V.ratio);ctx.font='13px GP, system-ui';ctx.fillText(`PLAYER ${i+1}`,x,615);ctx.textBaseline='alphabetic';}
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='16px GP, system-ui';ctx.fillText(!this.ready&&!this.flight?'Turn complete':`Round ${this.rules.round} · Dart ${Math.min(3,this.rules.darts+1)} of 3`,210,675);
    if(this.ready&&!this.drag){const p=heldTouchPoint(N.originY-Math.sin(this.bob*.05)*.01);ctx.strokeStyle='#ffe5a488';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,22,0,Math.PI*2);ctx.stroke();}
    if(this.drag&&!this.drag.primed){ctx.strokeStyle='#fdd96a';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(this.drag.startScreen.x,this.drag.startScreen.y);ctx.lineTo(this.drag.endScreen.x,this.drag.endScreen.y);ctx.stroke();ctx.setLineDash([]);}
  }
  destroy(){this.destroyed=true;this.renderer?.destroy();}
}
