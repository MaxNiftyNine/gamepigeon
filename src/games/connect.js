import {advanceConnectDrop,connectBlink} from '../connect-animation.js';
import {connectStage} from '../connect-stage.js';
export class ConnectRules {
  constructor(){ this.board=Array.from({length:6},()=>Array(7).fill(0)); this.player=1; this.winner=null; this.finished=false; this.moves=0; this.winning=[]; }
  drop(column){
    if(this.finished||!Number.isInteger(column)||column<0||column>6)return null;
    let row=5; while(row>=0&&this.board[row][column])row--; if(row<0)return null;
    const player=this.player; this.board[row][column]=player; this.moves++;
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
      const cells=[[column,row]];
      for(const direction of [-1,1])for(let i=1;i<7;i++){
        const x=column+dx*i*direction,y=row+dy*i*direction;
        if(this.board[y]?.[x]!==player)break; cells.push([x,y]);
      }
      if(cells.length>=4){this.winner=player; this.winning=cells; this.finished=true;break;}
    }
    if(this.moves===42)this.finished=true;
    if(!this.finished)this.player=3-player;
    return {row,column,player,winner:this.winner,finished:this.finished};
  }
}

export default class ConnectGame {
  constructor(host){this.h=host;this.background=this.makeBackground(host.assets.game_background);this.rules=new ConnectRules();this.stage=connectStage();this.hover=3;this.fall=null;this.lastDrop=null;this.elapsed=0;this.blinkStart=0;host.controls('<p class="instruction">Tap a column to drop your disc.</p>');host.turn(0,'Drop your disc on the board.');}
  makeBackground(image){if(!image||typeof document==='undefined')return image;const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);return canvas;}
  center(c,r){return this.stage.center(c,r);}
  pointerDown(p){if(this.fall||this.rules.finished)return;const column=this.stage.column(p);if(column<0)return;const result=this.rules.drop(column);if(!result){this.h.status('That column is full. Choose another.');return;}const dest=this.center(column,result.row),{x,y:startY}=this.stage.held,scale=this.stage.ratio;this.fall={...result,x,targetX:dest.x,y:startY,startY,targetY:dest.y,scale,nativeY:0,nativeVelocity:0,distance:(dest.y-startY)/scale,remainder:0};this.h.status('Disc dropping…');}
  pointerMove(p){const column=this.stage.column(p);if(column>=0)this.hover=column;}
  pointerUp(){}
  update(dt){this.elapsed+=dt;if(!this.fall)return;if(advanceConnectDrop(this.fall,dt)){const r=this.fall;this.fall=null;this.lastDrop=r;this.blinkStart=this.elapsed;this.h.sound('renju_put2.mp3');if(r.finished)this.h.finish(r.winner===null?null:r.winner-1,r.winner?`Player ${r.winner} connected four!`:'The board is full — draw.');else this.h.turn(this.rules.player-1,'Drop your disc on the board.');}}
  piece(ctx,player,x,y){const im=this.h.assets[`connect_piece${player}`],size=this.stage.disc;if(im)ctx.drawImage(im,x-size.width/2,y-size.height/2,size.width,size.height);else {ctx.fillStyle=player===1?'#ed484e':'#ffe151';ctx.beginPath();ctx.arc(x,y,19*this.stage.ratio,0,Math.PI*2);ctx.fill();}}
  draw(ctx,time){ctx.fillStyle='rgb(229.5,229.5,229.5)';ctx.fillRect(0,0,420,700);if(this.background){ctx.save();ctx.globalAlpha=.38;ctx.drawImage(this.background,0,0,420,700);ctx.restore();}ctx.fillStyle='#27323d';ctx.font='700 26px GP, system-ui';ctx.textAlign='center';ctx.fillText('Four in a Row',210,106);
    const board=this.h.assets.connect_board,front=this.h.assets['connect_board2@3x'],b=this.stage.board;if(board)ctx.drawImage(board,b.x,b.y,b.width,b.height);else {ctx.strokeStyle='#3e98ec';ctx.lineWidth=12;ctx.strokeRect(30,225,360,325);}
    if(!this.rules.finished&&!this.fall){const p=this.stage.held;this.piece(ctx,this.rules.player,p.x,p.y);}
    for(let r=0;r<6;r++)for(let c=0;c<7;c++){const p=this.center(c,r);if(!board){ctx.fillStyle='#0b1525';ctx.beginPath();ctx.arc(p.x,p.y,19,0,Math.PI*2);ctx.fill();}const player=this.rules.board[r][c];if(player&&!(this.fall?.column===c&&this.fall?.row===r))this.piece(ctx,player,p.x,p.y);}
    if(this.fall)this.piece(ctx,this.fall.player,this.fall.x,this.fall.y);
    if(!this.fall){const white=this.h.assets.connect_piece_white,size=this.stage.white,cells=this.rules.winning.length?this.rules.winning:this.lastDrop?[[this.lastDrop.column,this.lastDrop.row]]:[];if(white){ctx.save();ctx.globalAlpha=connectBlink(this.elapsed-this.blinkStart,this.rules.winning.length>0);for(const [c,r] of cells){const p=this.center(c,r);ctx.drawImage(white,p.x-size.width/2,p.y-size.height/2,size.width,size.height);}ctx.restore();}}
    if(front)ctx.drawImage(front,b.x,b.y,b.width,b.height);
    ctx.font='15px GP, system-ui';ctx.fillStyle='#536273';ctx.fillText('Connect four horizontally, vertically, or diagonally.',210,634);
  }
}
