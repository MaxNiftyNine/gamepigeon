// GolfScene v3's screen → board → translated camera hierarchy. Local handoffs
// initialize at the incoming ball behind the modal; native messages converge.
const half=32.5;
export function createGolfCamera(course,ball,width=420,height=700){
 const ratio=Math.fround(width<=height?Math.min(width/375,height/525):Math.min(width/800,height/375)),stageWidth=width/ratio,stageHeight=height/ratio;
 const bx=ball.x-half,by=course.rows*65-half-ball.y;
 return {width,height,ratio,stageWidth,stageHeight,bx:stageWidth*.5,by:stageHeight*(.35*by/(course.rows*65)+.35),cx:-bx,cy:-by,scale:1.3,zoom:false};
}
export function stepGolfCamera(camera,course,ball,{selected=false,pull=0}={}){
 const width=course.cols*65,height=course.rows*65,bx=ball.x-half,by=height-half-ball.y,positionRatio=Math.fround(.3);
 camera.bx+=(camera.stageWidth*.5-camera.bx)*positionRatio;camera.by+=(camera.stageHeight*(.35*by/height+.35)-camera.by)*positionRatio;
 camera.cx+=(-bx-camera.cx)*positionRatio;camera.cy+=(-by-camera.cy)*positionRatio;
 const target=selected?1.3-.65*pull/300:1.3;camera.scale+=(target-camera.scale)*.1;
 if(camera.zoom){camera.bx=camera.stageWidth*.5;camera.by=camera.stageHeight*.5;camera.cx=-width*.5+half;camera.cy=-height*.5+half;
  const diagonal=Math.fround(Math.sqrt(Math.fround(width*width+height*height))),overview=1.3-.3*diagonal/(Math.min(camera.stageWidth,camera.stageHeight)*.5);
  camera.scale+=(overview-camera.scale)*.1;
 }
 return camera;
}
export function golfCameraView(camera,course){return {scale:camera.ratio*camera.scale,x:camera.ratio*(camera.bx+camera.scale*(camera.cx-half)),y:camera.height-camera.ratio*(camera.by+camera.scale*(camera.cy+course.rows*65-half))};}
