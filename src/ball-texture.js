// CPU counterpart of the shipped pool_ball_shader.fsh. The native shader
// projects an unlit texture; PoolBall's separate shade sprite supplies light.
export function readTexture(image){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}
export function axisDegreesQuaternion(v,pi=Math.PI){const a=Math.hypot(...v);if(!a)return [0,0,0,1];const s=Math.sin(a*.5*pi/180)/a;return [v[0]*s,v[1]*s,v[2]*s,Math.cos(a*.5*pi/180)];}
export function multiplyQuaternion(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function rotate(p,q){const r=multiplyQuaternion(multiplyQuaternion(q,[...p,0]),[-q[0],-q[1],-q[2],q[3]]);return r.slice(0,3);}
const fract=x=>x-Math.floor(x);
// Coordinates are SpriteKit texture coordinates: +Y is up. Rotating the
// intersection is equivalent to rotating both ray and camera in the shader.
export function sphereUV(x,y,q=[0,0,0,1]){const length=Math.hypot(x,y,5),dt=25/length,perpendicular=25-dt*dt;if(perpendicular>=.98*.98)return null;const distance=dt-Math.sqrt(.98*.98-perpendicular);if(distance<=0)return null;const normal=rotate([x/length*distance,y/length*distance,-5+5/length*distance],q).map(v=>v/.98);return [fract(.5+Math.atan2(normal[2],normal[0])/(3.1415926*2)),fract(.5+Math.asin(Math.max(-1,Math.min(1,normal[1])))/3.1415926)];}
function sample(texture,u,v,out,index){const {width:w,height:h,data}=texture,x=u*w-.5,y=(1-v)*h-.5,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;for(let k=0;k<4;k++){let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const tx=((x0+dx)%w+w)%w,ty=((y0+dy)%h+h)%h;sum+=data[(ty*w+tx)*4+k]*(dx?fx:1-fx)*(dy?fy:1-fy);}out[index+k]=sum;}}
export function renderBallPixels(texture,q=[0,0,0,1],size=40){const data=new Uint8ClampedArray(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const uv=sphereUV((x+.5-size/2)/(size/2),-(y+.5-size/2)/(size/2),q);if(uv)sample(texture,...uv,data,(y*size+x)*4);}return data;}
export function makeBall(texture,q=[0,0,0,1]){const size=40,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),im=ctx.createImageData(size,size);im.data.set(renderBallPixels(texture,q,size));ctx.putImageData(im,0,0);return c;}
