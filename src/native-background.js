// BgNode.init: original alpha mask, black colorBlendFactor1, node alpha .38.
// GameScene.resize stretches its original logical375-square texture to view.
export function nativeBackground(image,color='#000'){
  if(!image||typeof document==='undefined')return image;
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);return canvas;
}
