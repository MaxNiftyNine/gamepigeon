import {PAINT_NATIVE, PAINT_INCOMING, coverMovement} from '../paint-animation.js';
import {paintLayout, incomingPaintLayout, incomingPaintSplats, incomingSplatFrame, tireDecoration, tireHitMark, targetPulse, moveArrow} from '../paint-visuals.js';
export class PaintRules {
  constructor(health=3){this.hp=[health,health];this.positions=[0,0];this.player=0;this.moved=false;this.finished=false;this.winner=null;this.shots=0;this.choices=[null,null];this.round=1;} 
  move(lane){if(this.finished||!Number.isInteger(lane)||lane<0||lane>2||lane===this.positions[this.player])return false;this.positions[this.player]=lane;this.moved=true;return true;}
  target(lane=this.positions[1-this.player]){const layout=paintLayout({own:this.positions[this.player],target:lane,fps:true});return layout.projection.point(layout.reticle.x,layout.reticle.y);}
  submit(lane){
    if(this.finished||!Number.isInteger(lane)||lane<0||lane>2||this.choices[this.player])return null;
    const player=this.player;this.choices[player]=Object.freeze({player,cover:this.positions[player],target:lane});
    if(!this.choices[1-player]){this.player=1-player;this.moved=false;return {pending:true};}
    const choices=this.choices,hpBefore=[...this.hp],hits=choices.map((c,p)=>c.target===choices[1-p].cover);
    for(let p=0;p<2;p++)if(hits[p])this.hp[1-p]--;
    this.shots+=2;this.finished=this.hp.some(h=>h<=0);
    this.winner=this.finished?(this.hp[0]<=0&&this.hp[1]<=0?null:this.hp[0]<=0?1:0):null;
    const records=choices.map((c,p)=>Object.freeze({shooter:p,recipient:1-p,shooterLaneAtFire:c.cover,recipientLaneAtFire:choices[1-p].cover,previousTargetLane:c.target,hit:hits[p],hpBefore:Object.freeze([...hpBefore]),hpAfter:Object.freeze([...this.hp])}));
    return {pending:false,records,hits,finished:this.finished,winner:this.winner};
  }
  nextRound(){if(this.finished)return;this.round++;this.choices=[null,null];this.player=(this.round-1)%2;this.moved=false;}


}
export default class PaintGame {
  constructor(host){this.h=host;this.rules=new PaintRules();this.phase='move';this.selectedTarget=0;this.aim={x:210,y:316};this.drag=false;this.flight=null;this.last=null;this.elapsed=0;this.phaseAge=0;this.shot=null;this.pendingIncoming=null;this.incoming=null;this.committedShot=null;this.movement=null;this.tints=new Map();this.decorations={near:[0,1,2].map(()=>tireDecoration()),far:[0,1,2].map(()=>tireDecoration(Math.random,true))};this.prepare();host.turn(0,'Choose the enemy cover, move behind a tire stack, then shoot.');}
  prepare(){this.pendingIncoming=null;this.incoming=null;this.committedShot=null;this.phase='move';this.phaseAge=0;this.shot=null;this.last=null;this.flight=null;this.movement=null;this.drag=false;this.selectedTarget=0;this.overviewControls();}
  overviewControls(){this.h.controls(`<div class="control-row">${[0,1,2].map(lane=>`<button data-move="${lane}" ${lane===this.rules.positions[this.rules.player]?'disabled':''}>Move ${['left','center','right'][lane]}</button>`).join('')}<button id="paint-aim">Aim</button></div><p class="instruction">Your opponent is hiding. Choose an enemy tire stack, move behind cover, then shoot.</p>`);this.h.onControl('[data-move]','click',e=>this.move(Number(e.currentTarget.dataset.move)));this.h.onControl('#paint-aim','click',()=>this.aimView());}
  move(lane){const from=this.movement?coverMovement(this.movement.from,this.movement.to,this.movement.age).lane:this.rules.positions[this.rules.player];if(this.phase!=='move'||!this.rules.move(lane))return;this.movement={from,to:lane,age:0};this.h.sound('paint_grass.mp3');this.h.status('Position changed. Choose an enemy tire stack to target.');this.overviewControls();}
  aimView(){if(this.phase!=='move')return;this.movement=null;this.phase='zoom';this.phaseAge=0;this.h.sound('whoosh2.mp3');this.aim=this.rules.target(this.selectedTarget);this.h.controls('<p class="instruction">Moving into position…</p>');}
  aimControls(){this.h.controls('<button id="paint-shoot">Shoot</button><button id="paint-back">Change target</button><p class="instruction">Lock your cover and target. Both shots replay after the other player chooses.</p>');this.h.onControl('#paint-shoot','click',()=>this.shoot());this.h.onControl('#paint-back','click',()=>{if(this.phase!=='aim')return;this.phase='move';this.phaseAge=0;this.overviewControls();});}
  pointerDown(p){
    if(this.phase!=='move')return;
    const layout=paintLayout(),project=layout.projection.point;
    if(p.y>=430&&p.y<=630){
      const lane=layout.near.find(c=>Math.abs(p.x-project(c.x,c.y).x)<=58);
      if(lane)this.move(lane.lane);
    }else if(p.y>=280&&p.y<=430){
      const lane=layout.far.find(c=>Math.abs(p.x-project(c.x,c.y).x)<=36);
      if(lane){this.selectedTarget=lane.lane;this.h.sound('sea_target.mp3');this.h.status(`Targeting the ${['right','center','left'][lane.lane]} enemy cover.`);}
    }
  }
  pointerMove(){}
  pointerUp(){this.drag=false;}
  pointerCancel(){this.drag=false;}
  shoot(){
    if(this.phase!=='aim')return;
    const result=this.rules.submit(this.selectedTarget);if(!result)return;
    this.shot=null;this.last=null;this.flight=null;this.movement=null;this.selectedTarget=0;this.h.controls('');
    if(result.pending){this.phase='choice-pass';this.h.turn(this.rules.player,'Choose your own cover and target. The other player’s choices are locked and hidden.');return;}
    this.roundResult=result;this.displayHP=[...result.records[0].hpBefore];
    const r=result.records[0];this.shot={player:0,lane:r.previousTargetLane,enemyLane:r.recipientLaneAtFire,ownLane:r.shooterLaneAtFire,hit:r.hit,age:0,fired:false,impacted:false};
    this.phase='reveal';this.phaseAge=0;this.h.status('Both choices locked — watch the round together.');this.h.sound('whoosh1.mp3');
  }
  update(dt,time){
    this.elapsed=time??this.elapsed+dt;
    if(this.phase==='choice-pass'){this.prepare();this.h.status('Choose your cover and enemy target.');return;}
    if(this.phase==='incoming'){this.updateIncoming(dt);return;}
    this.phaseAge+=dt;
    if(this.movement){this.movement.age+=dt;if(coverMovement(this.movement.from,this.movement.to,this.movement.age).finished)this.movement=null;}
    if(this.phase==='zoom'&&this.phaseAge>=PAINT_NATIVE.cameraDuration){this.phase='aim';this.phaseAge=0;this.aimControls();}
    if(!this.shot||this.phase==='result')return;
    const shot=this.shot;shot.age+=dt;const fireAge=shot.age-PAINT_NATIVE.revealToShot;
    if(fireAge>=0&&!shot.fired){shot.fired=true;this.phase='flight';this.h.sound('paint_me_shot.mp3');}
    if(fireAge>=PAINT_NATIVE.flightDuration&&!shot.impacted){shot.impacted=true;this.last={hit:shot.hit};if(shot.hit){this.displayHP[1]--;this.h.sound('paint_me_hit.mp3');}this.h.status(`Player 1: ${shot.hit?'hit':'miss'}.`);}
    if(fireAge>=PAINT_NATIVE.shotToCountershot){const record=this.roundResult.records[1];this.shot=null;this.last=null;this.incoming={record,age:0,fired:false,impacted:false,splats:record.hit?incomingPaintSplats(Math.random,record.recipient):[]};this.phase='incoming';this.h.sound('whoosh2.mp3');}
  }
  updateIncoming(dt){
    const replay=this.incoming,old=replay.age;replay.age+=dt;
    if(old<PAINT_INCOMING.reveal&&replay.age>=PAINT_INCOMING.reveal)this.h.sound('whoosh1.mp3');
    if(!replay.fired&&replay.age>=PAINT_INCOMING.fire){replay.fired=true;this.h.sound('paint_me_shot.mp3',.2);if(!replay.record.hit)this.h.sound('paint_fly.mp3',.9);}
    if(!replay.impacted&&replay.age>=PAINT_INCOMING.fire+(replay.record.hit?PAINT_INCOMING.hitTravel:PAINT_INCOMING.missTravel)){replay.impacted=true;if(replay.record.hit){this.displayHP[0]--;this.h.sound('paint_he_hit.mp3');}this.h.status(`Player 2: ${replay.record.hit?'hit':'miss'}.`);}
    if(replay.age>=PAINT_INCOMING.complete){
      this.incoming=null;this.displayHP=null;this.phase='result';const r=this.roundResult;
      this.h.status(`Round ${this.rules.round}: Player 1 ${r.hits[0]?'hit':'miss'} · Player 2 ${r.hits[1]?'hit':'miss'}.`);
      if(r.finished)this.h.finish(r.winner,r.winner===null?'Both players were hit — draw!':`Player ${r.winner+1} wins!`);
      else {this.h.controls('<button id="paint-next">Next round</button>');this.h.onControl('#paint-next','click',()=>{if(this.phase!=='result')return;this.rules.nextRound();this.roundResult=null;this.prepare();this.h.turn(this.rules.player,'Choose your cover and target privately.');});}
    }
  }
  tinted(ctx,name,color,x,y,w,h,alpha=1){const im=this.h.assets[name];if(!im)return false;let tint=this.tints.get(name+color);if(!tint&&typeof document!=='undefined'){tint=document.createElement('canvas');tint.width=im.width;tint.height=im.height;const tc=tint.getContext('2d');tc.drawImage(im,0,0);tc.globalCompositeOperation='source-in';tc.fillStyle=color;tc.fillRect(0,0,tint.width,tint.height);this.tints.set(name+color,tint);}ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(tint||im,x,y,w,h);ctx.restore();return true;}
  sprite(ctx,name,x,y,w,h){const im=this.h.assets[name];if(im)ctx.drawImage(im,x,y,w,h);return !!im;}
  // Draw sprites upright while the surrounding stage uses native positive-Y-up coordinates.
  nativeSprite(ctx,name,x,y,scale=1,sx=1,sy=1,rotation=0,color=null,alpha=1){
    const im=this.h.assets[name];if(!im)return false;
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale*sx,-scale*sy);
    const w=im.width/3,h=im.height/3;
    if(color)this.tinted(ctx,name,color,-w/2,-h/2,w,h,alpha);
    else{ctx.globalAlpha*=alpha;ctx.drawImage(im,-w/2,-h/2,w,h);}
    ctx.restore();return true;
  }
  tires(ctx,cover,decoration,head=null,hit=false,color='#ffff00',side=0){
    ctx.save();ctx.translate(cover.x,cover.y);ctx.scale(cover.scale,cover.scale);
    // showEnemy inserts at index 0, so the rising head is masked by all five tires.
    if(head){
      ctx.save();ctx.translate(head.x??0,head.y);ctx.scale(head.scale*(side===-1?-1:1),head.scale);
      this.nativeSprite(ctx,side===0?'paint_enemy_front':'paint_enemy_side',0,0);
      if(hit){const mark=tireHitMark(side!==0);this.nativeSprite(ctx,mark.name,mark.x,mark.y,mark.scale,1,1,0,color,mark.alpha);}
      ctx.restore();
    }
    this.nativeSprite(ctx,'paint_tire_shadow',0,-12.54);
    for(const tire of decoration){
      ctx.save();ctx.translate(tire.x,tire.y);ctx.rotate(tire.rotation);ctx.scale(tire.sx,tire.sy);
      if(!this.nativeSprite(ctx,tire.name,0,0))this.nativeSprite(ctx,'paint_tire1',0,0);
      for(const mark of tire.specks){
        // UIColor hue/saturation/brightness uses brightness 1 and saturation .2.
        const rgb=hueColor(mark.hue,.2);
        this.nativeSprite(ctx,mark.name,mark.x,mark.y,1,mark.sx,mark.sy,mark.rotation,rgb,mark.alpha);
      }
      ctx.restore();
    }
    this.nativeSprite(ctx,'paint_grass',0,-17.16);
    ctx.restore();
  }
  draw(ctx,time){
    ctx.fillStyle='#b0e0f4';ctx.fillRect(0,0,420,700);if(this.phase==='choice-pass'){ctx.fillStyle='#173127';ctx.textAlign='center';ctx.font='22px GP, system-ui';ctx.fillText('Choices locked and hidden',210,330);return;}
    const shot=this.shot,replay=this.incoming,record=replay?.record;
    const player=record?.recipient??shot?.player??this.rules.player;
    const own=record?.recipientLaneAtFire??shot?.ownLane??this.rules.positions[player];
    const layout=replay?incomingPaintLayout(record,replay.age):paintLayout({own,target:shot?.lane??this.selectedTarget,
      fps:this.phase!=='move'&&this.phase!=='incoming-wait',cameraAge:this.phase==='zoom'?this.phaseAge:.8,
      revealAge:shot?.age??-1,fireAge:shot?shot.age-PAINT_NATIVE.revealToShot:-1,hit:shot?.hit??false});
    const fps=replay?!layout.reset:this.phase!=='move'&&this.phase!=='incoming-wait';
    const ratio=layout.projection.ratio,color=(record?.shooter??player)===0?'#ffff00':record?'#ff1f1f':'#ff0000';
    ctx.save();ctx.beginPath();ctx.rect(0,103,420,597);ctx.clip();
    ctx.translate(210,700);ctx.scale(ratio,-ratio);
    const bg=layout.background,im=this.h.assets['paint_bg@3x'];
    if(im){
      // Three background copies meet edge-to-edge; the JPEG is 4000×1608 @3x.
      ctx.fillStyle='#74974a';ctx.fillRect(-2000,-2000,4000,bg.y-536*bg.scale/2+2000);
      for(let i=-1;i<=1;i++)this.nativeSprite(ctx,'paint_bg@3x',bg.x+i*(4000/3)*bg.scale,bg.y,bg.scale);
    }
    for(const cover of layout.far){
      // Opponent position is read for drawing only during this shot's reveal. Pass
      // clears the shot before host.turn opens the handoff shield.
      const revealed=replay?layout.headVisible&&cover.lane===record.shooterLaneAtFire:shot&&cover.lane===shot.enemyLane;
      // Native dir uses the opponent's serialized target2. A one-device shot has no
      // paired incoming target; own versus opponent lane supplies a documented facing adaptation.
      const side=replay?layout.direction:own===shot?.enemyLane?0:own<shot?.enemyLane?1:-1;
      this.tires(ctx,cover,this.decorations.far[cover.lane],revealed?layout.head:null,!!(revealed&&this.last?.hit),color,side);
    }
    for(const cover of layout.near)this.tires(ctx,cover,this.decorations.near[cover.lane]);
    if(!fps){
      const move=this.movement?coverMovement(this.movement.from,this.movement.to,this.movement.age):{lane:own,hop:0};
      const x=(move.lane-1)*108;
      this.nativeSprite(ctx,'paint_dude',x,110+35+move.hop);
      this.nativeSprite(ctx,'paint_dude_shadow',x,110+35-76);
      for(const cover of layout.near)if(cover.lane!==own)this.nativeSprite(ctx,'paint_move',cover.x,cover.y+moveArrow(this.elapsed).y);
    }else{
      const f=layout.projectile;
      if((replay?.fired||shot?.fired)&&f.visible)this.nativeSprite(ctx,'paint_ball1',f.x,f.y,f.scale,1,1,f.rotation??0,color,f.alpha);
      this.nativeSprite(ctx,'paint_gun',layout.gun.x,layout.gun.y);
    }
    if(!replay&&this.phase!=='incoming-wait'&&(!fps||this.phase==='aim'||this.phase==='zoom'||this.phase==='reveal')){
      const fade=shot?Math.max(0,1-(shot.age-(shot.hit ? .33 : .4))/.2):1;
      this.nativeSprite(ctx,'paint_target',layout.reticle.x,layout.reticle.y,layout.reticle.scale*targetPulse(this.elapsed),1,1,-this.elapsed*2*Math.PI/2.1,null,fade);
    }
    if(replay&&!layout.reset&&record.hit){
      // Screen effect is a stage child, not an outgoing impact actor. Each static
      // original splat grows independently and remains until the native reset.
      for(const splat of replay.splats){
        const f=incomingSplatFrame(splat,layout.fireAge);
        if(f.alpha>0)this.nativeSprite(ctx,splat.name,f.x,350/ratio+f.y,f.scale,1,1,f.rotation,
          `rgb(${splat.color.map(v=>Math.round(v*255)).join(',')})`,f.alpha);
      }
    }
    if(layout.flashAlpha){ctx.fillStyle=`rgba(255,255,255,${layout.flashAlpha})`;ctx.fillRect(-210/ratio,0,420/ratio,700/ratio);}
    ctx.restore();
    ctx.fillStyle='#173127';ctx.fillRect(0,0,420,103);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 27px GP, system-ui';ctx.fillText('Paintball',210,39);
    for(let p=0;p<2;p++){ctx.font='13px GP, system-ui';ctx.fillStyle=player===p?'#ffe27c':'#fff';ctx.fillText(`PLAYER ${p+1}`,105+210*p,67);if(!this.sprite(ctx,`paint_hp${(this.displayHP??this.rules.hp)[p]}`,84+210*p,79,42,12)){ctx.font='16px GP, system-ui';ctx.fillText('♥'.repeat((this.displayHP??this.rules.hp)[p]),105+210*p,94);}}
    if(this.phase==='move'){ctx.font='16px GP, system-ui';ctx.fillStyle='#173127';ctx.fillText('Choose your cover and enemy target',210,136);}
    if(replay){ctx.fillStyle='#173127';ctx.font='16px GP, system-ui';ctx.fillText('Player 2 replay',210,136);}
    if(this.last){ctx.fillStyle=this.last.hit?'#e87528':'#173127';ctx.font='bold 22px GP, system-ui';ctx.fillText(this.last.hit?'HIT!':'MISS',210,155);}
  }
}
function hueColor(h,s){
  const v=h*6,i=Math.floor(v),f=v-i,p=1-s,q=1-s*f,t=1-s*(1-f);
  const rgb=[[1,t,p],[q,1,p],[p,1,t],[p,q,1],[t,p,1],[1,p,q]][i%6];
  return `rgb(${rgb.map(v=>Math.round(v*255)).join(',')})`;
}
