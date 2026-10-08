export function sprite(ctx, assets, name, x, y, w, h, rotation=0) {
 const im=assets[name.replace(/\.(png|jpg|jpeg|gif)$/,'')]; if(!im) return false;
 ctx.save(); ctx.translate(x+w/2,y+h/2);ctx.rotate(rotation);ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();return true;
}
export function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
export function text(c,s,x,y,size=18,color='#fff',align='center'){c.font=`${size}px GP, system-ui`;c.fillStyle=color;c.textAlign=align;c.fillText(s,x,y);}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function panel(c,x,y,w,h,color='#ffffff'){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,12);c.fill();}
