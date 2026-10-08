// PaintScene / PaintTire constants recovered from the shipped arm64 executable.
// Coordinates below are native SpriteKit offsets (positive Y points up).
export const PAINT_NATIVE = Object.freeze({
  cameraDuration: .8, gunAimDuration: .75, revealDuration: .33,
  revealToShot: 1, shotToCountershot: .9, flightDuration: .13,
  missFadeDuration: .2, recoilOutDuration: .07, recoilReturnDuration: .27,
  moveStepDuration: .2, hopHalfDuration: .1, hopHeight: 25,
  targetRotationDuration: 2.1, targetPulseHalfDuration: .5,
});
const clamp = (n) => Math.max(0, Math.min(1, n));
// Stable FPS endpoint on the 420×700 stage; far lanes are mirrored by createSceneContents.
export const enemyCoverX = (lane, own = 0) => 210 + Math.fround(420/375)*((1-lane)*108*(.584*1.3)-.33*(own-1)*108);
export function outgoingPaintball(age, hit) {
  const t = clamp(age / PAINT_NATIVE.flightDuration);
  const fade = hit ? 0 : clamp((age - PAINT_NATIVE.flightDuration) / PAINT_NATIVE.missFadeDuration);
  return {x: -40 * t - 8 * fade || 0, y: 65 * t + 11 * fade,
    scale: 1 - .88 * t, alpha: 1 - fade,
    visible: age >= 0 && age < PAINT_NATIVE.flightDuration + (hit ? 0 : PAINT_NATIVE.missFadeDuration)};
}
export function gunRecoil(age) {
  if (age < 0) return {x: 0, y: 0};
  const amount = age < PAINT_NATIVE.recoilOutDuration
    ? clamp(age / PAINT_NATIVE.recoilOutDuration)
    : 1 - clamp((age - PAINT_NATIVE.recoilOutDuration) / PAINT_NATIVE.recoilReturnDuration);
  return {x: 20 * amount, y: -32.5 * amount || 0};
}
export function coverMovement(from, to, age) {
  const steps = Math.abs(to - from), duration = steps * PAINT_NATIVE.moveStepDuration;
  if (!steps || age >= duration) return {lane: to, hop: 0, finished: true};
  const progress = clamp(age / duration);
  const hop = (age % PAINT_NATIVE.moveStepDuration) / PAINT_NATIVE.hopHalfDuration;
  return {lane: from + (to - from) * progress,
    hop: PAINT_NATIVE.hopHeight * (hop <= 1 ? hop : 2 - hop), finished: false};
}
export function enemyReaction(age) {
  if (age < 0) return {scale: 1, rise: 0};
  const scale = age < .1 ? 1 - .1 * clamp(age / .1) : .9 + .09 * clamp((age - .1) / .1);
  const rise = age < .15 ? 6 * clamp(age / .15) : 6 * (1 - clamp((age - .15) / .15));
  return {scale, rise};
}

// Local history starts at native fpsView (the preceding 1-second anim prezoom is
// omitted). Keep reveal/shot/exit schedules; never schedule the receiver's future
// outgoing meShoot. Source addresses: evidence/paint-local-incoming-native.md.
export const PAINT_INCOMING = Object.freeze({reveal:1, fire:2.9,
  hitTravel:.13, missTravel:.14, missContinue:.1,
  exitFlash:4.9, opaque:5.1, reset:5.4, complete:5.6});
export function incomingTimeline(age) {
  const flash = age < PAINT_INCOMING.exitFlash ? 1-clamp(age/.2)
    : age < PAINT_INCOMING.opaque ? clamp((age-PAINT_INCOMING.exitFlash)/.2)
    : age < PAINT_INCOMING.reset ? 1 : 1-clamp((age-PAINT_INCOMING.reset)/.2);
  return {cameraAge:age,revealAge:age-PAINT_INCOMING.reveal,
    fireAge:age-PAINT_INCOMING.fire,flashAlpha:flash,
    reset:age>=PAINT_INCOMING.reset,complete:age>=PAINT_INCOMING.complete};
}
export function incomingHeadMotion(age,direction=0) {
  if(age<0)return {x:0,y:0,scale:1};
  const out=clamp(age/.05),back=clamp((age-.05)/.15);
  return {x:direction===0?0:-4*direction*out,y:6*(out-back),
    scale:age<.05?1-.1*out:.9+.09*back};
}
export function incomingPaintball(age,hit,start,end) {
  const duration=hit?PAINT_INCOMING.hitTravel:PAINT_INCOMING.missTravel;
  const travel=clamp(age/duration),continuation=hit?0:clamp((age-duration)/.1);
  const dx=end.x-start.x,dy=end.y-start.y;
  return {x:start.x+dx*(travel+continuation),y:start.y+dy*(travel+continuation),
    scale:.1+((hit?3:2.5)-.1)*travel,alpha:1-continuation,
    visible:age>=0&&age<duration+(hit?0:.1)};
}
