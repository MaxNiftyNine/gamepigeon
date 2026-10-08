// ConnectScene resize 0x10024dd20; native SpriteKit points and Scale3 assets.
export function connectStage(width=420,height=700){
  const landscape=width>height,[rw,rh]=landscape?[810,325]:[375,525];
  const ratio=Math.fround(Math.min(width/rw,height/rh)),stageWidth=width/ratio,stageHeight=height/ratio;
  const pixel=(x,y)=>({x:x*ratio,y:height-y*ratio});
  return {landscape,ratio,width:stageWidth,height:stageHeight,pitch:45*ratio,
    board:{x:width/2-361*ratio/2,y:height/2-410*ratio/2,width:361*ratio,height:410*ratio},
    disc:{width:45*ratio,height:48*ratio},white:{width:42*ratio,height:42*ratio},
    held:pixel(.1*stageWidth+60,.92*stageHeight),
    center(c,r){return pixel(stageWidth/2-135+45*c,stageHeight/2+112.5-45*r);},
    column(point){
      const b=this.board;if(point.y<b.y||point.y>b.y+b.height)return -1;
      const x=point.x/ratio-stageWidth/2;
      // Native touch uses a truncated int left edge and strict bounds.
      for(let c=0;c<7;c++){const left=Math.trunc(45*c-157.5);if(x>left&&x<left+45)return c;}
      return -1;
    }};
}
