// Static native evidence: DartsView shoot:target:pre:, update, darts_scene.scn.
export const DARTS_NATIVE = Object.freeze({boardY: .34438443183898926, boardZ: .019999999552965164,
  outer: .4998499816656113, double: .46994998276233674, tripleOuter: .31589998841285705,
  tripleInner: .2859999895095825, bull25: .04614999830722808, bull50: .018654999315738677,
  originZ: 1.8029999732971191, originY: -.0949999988079071, cameraZ: 2.5, distanceGate: .3});
// GameViewController.lay makes SCNView fill the gameplay view. DartsView.update
// selects camera2 at aspect<.66; preserve its horizontal30.5-degree projection.
const focal=210/Math.tan(30.5*Math.PI/360),units=focal/(DARTS_NATIVE.cameraZ-DARTS_NATIVE.boardZ);
export const DARTS_VIEW = Object.freeze({cx:210,cy:350-DARTS_NATIVE.boardY*units,outerWidth:1.3*units,units,ratio:Math.fround(420/375)});
const f = Math.fround;
export function boardPoint(p) {return {x: f((p.x - DARTS_VIEW.cx) / DARTS_VIEW.units),
  y: f(DARTS_NATIVE.boardY - (p.y - DARTS_VIEW.cy) / DARTS_VIEW.units), z: DARTS_NATIVE.boardZ};}
export function screenPoint(p) {return {x: DARTS_VIEW.cx + p.x * DARTS_VIEW.units,
  y: DARTS_VIEW.cy - (p.y - DARTS_NATIVE.boardY) * DARTS_VIEW.units};}
export function projectDart(p) {
  const perspective = (DARTS_NATIVE.cameraZ - DARTS_NATIVE.boardZ) / (DARTS_NATIVE.cameraZ - p.z);
  return {x: DARTS_VIEW.cx + p.x * DARTS_VIEW.units * perspective,
    y: DARTS_VIEW.cy + DARTS_NATIVE.boardY * DARTS_VIEW.units - p.y * DARTS_VIEW.units * perspective,
    scale: perspective};
}
export function heldDart(y = DARTS_NATIVE.originY) {return {x: 0, y, z: DARTS_NATIVE.originZ};}
export function heldTouchPoint(y = DARTS_NATIVE.originY) {return projectDart({x: 0, y, z: DARTS_NATIVE.originZ + .17399999499320984});}

// Start/current are unprojected to board depth. Native computes an intersection
// with y=boardY-.7, then extends in the actual swipe direction by a timed power.
// start0 is the projected held mesh center, also unprojected to board depth.
export function nativeThrowTarget(start, current, elapsed, start0 = start, ratio = DARTS_VIEW.ratio) {
  const dx = start.x - current.x, dy = start.y - current.y, distance = f(Math.hypot(dx, dy));
  if (!Number.isFinite(elapsed) || elapsed <= 0 || distance <= DARTS_NATIVE.distanceGate || Math.abs(dy) < 1e-8) return null;
  const baselineY = DARTS_NATIVE.boardY - .7;
  const intersect = {x: start.x + (baselineY - start.y) * dx / dy, y: baselineY};
  // Segment intersection in native uses a 20-unit line in each direction.
  if (Math.hypot(intersect.x - start.x, intersect.y - start.y) > 10 || Math.abs(intersect.x) > 10) return null;
  const reference = start.y < start0.y ? start0 : start;
  const vx = reference.x - current.x, vy = reference.y - current.y, length = f(Math.hypot(vx, vy));
  if (!length) return null;
  const maxSpeed = f(f(1 / f(ratio)) * 8.5);
  const speed = f(Math.min(f(length / elapsed), maxSpeed));
  const fraction = f(length > f(.6) ? 1 : f(length / f(.6)));
  const extension = fraction * -1.225 * f(speed / maxSpeed);
  return {x: f(intersect.x + vx / length * extension), y: f(intersect.y + vy / length * extension), z: DARTS_NATIVE.boardZ,
    power: -extension / 1.225, speed, distance};
}

export function nativeDartFlight(origin, target, progress) {
  const t = f(Math.max(0, Math.min(1, progress)));
  return {x: f(origin.x + f(target.x - origin.x) * t),
    y: f(f(origin.y + f(target.y - origin.y) * t) + Math.sin(t * Math.PI) * .25),
    z: f(origin.z + f(target.z - origin.z) * t)};
}

// Archive: camera is vertical 45°, camera2 horizontal 30.5°. update selects
// camera2 below aspect .66.
export function nativeDartsCamera(width, height) {
  const aspect=width/height,portrait=aspect<.66,fov=portrait?30.5:45;
  return {name:portrait?'camera2':'camera',axis:portrait?'horizontal':'vertical',fov,
    verticalFov:portrait?2*Math.atan(Math.tan(fov*Math.PI/360)/aspect)*180/Math.PI:fov,
    near:.11113358289003372,far:27.783395767211914,z:DARTS_NATIVE.cameraZ};
}
export const DARTS_SCENE = Object.freeze({
  childRoll:-.7814289331436157,heldPitch:.12559999525547028,
  shadowRotation:.10471975058317184,shadowScale:[.5774999856948853,.5789999961853027,1],
  shadowChildPosition:[.0560000017285347,-.10999999940395355,0],shadowChildScale:.2199999839067459,
  // Directional lights point along local -Z; these are transformed +Z columns.
  lights:[{direction:[.18852083384990692,.785082995891571,-.5900025367736816],color:[1,1,1]},
    {direction:[-.09239670634269714,-.4074316918849945,-.9085493087768555],color:[1,.8561348915100098,.83916175365448]}],
});

// SceneKit's eulerAngles compose Z*Y*X, verified against static SCNNode fixtures.
// Native first aligns +Z with origin-target, then overwrites only Euler X.
export function nativeDartAim(origin,target) {
  let dx=f(origin.x-target.x),dy=f(origin.y-target.y),dz=f(origin.z-target.z);
  const length=f(Math.hypot(dx,dy,dz));if(!length)return {pitch:0,yaw:0,roll:0};
  dx=f(dx/length);dy=f(dy/length);dz=f(dz/length);
  const axisLength=Math.hypot(dx,dy),angle=Math.acos(Math.max(-1,Math.min(1,dz)));
  const sin=Math.sin(angle/2),qx=axisLength?-dy/axisLength*sin:0,qy=axisLength?dx/axisLength*sin:0,qw=Math.cos(angle/2);
  return {pitch:f(Math.atan2(2*qw*qx,1-2*(qx*qx+qy*qy))),
    yaw:f(Math.asin(Math.max(-1,Math.min(1,2*qw*qy)))),roll:f(Math.atan2(2*qx*qy,1-2*qy*qy))};
}
export function advanceDartSpin(spin,targetX,rotationSpeed){return f(spin+(targetX<0?1:-1)*rotationSpeed);}
export function nativeDartPose(origin,target,frames,rotationSpeed=.145) {
  // anim>=30 stops orientation/spin updates, retaining the frame-29 pose.
  const ticks=Math.max(0,Math.min(29,Math.floor(frames))),t=f(ticks/30),aim=nativeDartAim(origin,target);
  if(!ticks)return {pitch:DARTS_SCENE.heldPitch,yaw:0,roll:0,spin:DARTS_SCENE.childRoll};
  const impact=f(2*f(target.y-DARTS_NATIVE.boardY)*15*.017444444444444446);
  let spin=DARTS_SCENE.childRoll;
  for(let i=0;i<ticks;i++)spin=advanceDartSpin(spin,target.x,rotationSpeed);
  return {...aim,pitch:f(f(impact-.6142188906669617)*t+.6142188906669617),spin};
}
export function nativeDartShadow(position) {
  const depth=position.z-DARTS_NATIVE.boardZ;
  return {position:{x:f(position.x+depth*.2),y:f(position.y-depth*.6),z:f(DARTS_NATIVE.boardZ+.05)},opacity:.6-depth*.1875};
}
export function nativeHeldStep(phase,slow,touched) {
  slow=f(slow+((touched?0:1)-slow)*.15);phase=f(phase+slow);
  return {phase,slow,y:f(DARTS_NATIVE.originY-Math.sin(phase*.05)*.01)};
}

export function dartsShellCamera(){return {...nativeDartsCamera(420,700),principalOffsetY:0};}
