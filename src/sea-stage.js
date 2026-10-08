// SeaScene resize1001b2d7c / resetClouds1001ad7f0. Native stage units.
export function seaNativeStage(width=420,height=700){const landscape=width>height,referenceWidth=landscape?825:375,referenceHeight=landscape?375:520,fitWidth=Math.min(width,height/referenceHeight*referenceWidth);let ratio=Math.fround(fitWidth/referenceWidth);if(!landscape&&fitWidth>350)ratio=Math.fround(ratio*Math.fround(.98));return {landscape,ratio,width:width/ratio,height:height/ratio};}
export class SeaClouds {
  constructor(){this.stage=seaNativeStage();this.reset();}
  reset(){this.points=[{x:-300,alpha:.5},{x:300,alpha:.5}];this.remainder=0;}
  update(dt,active=true){this.remainder+=Math.max(0,dt);while(this.remainder+1e-12>=1/60){this.remainder-=1/60;for(const p of this.points){p.x+=.15;p.alpha+=.3*((active?.5:0)-p.alpha);if(p.x>=680){p.x=-340;p.alpha=0;}}}}
  positions(cellSize){const scale=cellSize/37,yOffset=60+(this.stage.landscape?0:-.02*this.stage.height);return this.points.map(p=>({x:210+p.x*scale,y:321-yOffset*scale,alpha:p.alpha,width:1200*scale,height:982.8*scale}));}
  draw(ctx,image,cellSize){if(!image)return;ctx.save();ctx.globalCompositeOperation='screen';const alpha=ctx.globalAlpha;for(const p of this.positions(cellSize)){ctx.globalAlpha=alpha*p.alpha;ctx.drawImage(image,p.x-p.width/2,p.y-p.height/2,p.width,p.height);}ctx.restore();}
}
