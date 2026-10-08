// Installed SpriteKit and SceneKit action probes corroborate these curves.
// This is a measured framework reference, not an original-iOS runtime replay.
export function nativeActionProgress(progress,mode=0){
 const t=Math.max(0,Math.min(1,progress));
 if(mode===1)return 2*t*t-t*t*t;
 if(mode===2)return t+t*t-t*t*t;
 if(mode===3)return t*t*(3-2*t);
 return t;
}
