// GolfScene createMap: 0x100174c90..0x1001760ac.
// Native units are 65 per cell, with +y upward. Evidence: golf-obstacles-native.md.
const CELL=65;
// ARM64 FMADD rounds once. BigInt preserves its binary64 result in JavaScript,
// including the occasional one-ulp difference in scale and endpoint jitter.
const ieee=new DataView(new ArrayBuffer(8)),fractionMask=(1n<<52n)-1n;
function parts(value){
  ieee.setFloat64(0,value);const bits=ieee.getBigUint64(0),exponent=Number((bits>>52n)&2047n);
  const mantissa=(bits&fractionMask)+(exponent?1n<<52n:0n);
  return {mantissa:bits>>63n?-mantissa:mantissa,exponent:exponent?exponent-1075:-1074};
}
function fmadd(a,b,c){
  const pa=parts(a),pb=parts(b),pc=parts(c),productExponent=pa.exponent+pb.exponent;
  const exponent=Math.min(productExponent,pc.exponent);
  let n=(pa.mantissa*pb.mantissa<<BigInt(productExponent-exponent))+(pc.mantissa<<BigInt(pc.exponent-exponent));
  const sign=n<0n?1n<<63n:0n;if(n<0n)n=-n;if(!n)return 0;
  let roundedExponent=Math.max(exponent+n.toString(2).length-53,-1074),shift=roundedExponent-exponent,mantissa;
  if(shift>0){const amount=BigInt(shift),half=1n<<(amount-1n),remainder=n&((1n<<amount)-1n);mantissa=n>>amount;if(remainder>half||(remainder===half&&(mantissa&1n)))mantissa++;}
  else mantissa=n<<BigInt(-shift);
  if(mantissa>=1n<<53n){mantissa>>=1n;roundedExponent++;}
  const storedExponent=mantissa>=1n<<52n?roundedExponent+1075:0;
  const bits=sign|(BigInt(storedExponent)<<52n)|(mantissa&fractionMask);
  ieee.setBigUint64(0,bits);return ieee.getFloat64(0);
}
const MATERIAL={density:1,friction:0,restitution:.5};
const LARGE_ASSETS=['golf_obstacle_square2','golf_obstacle_bar2','golf_obstacle_triangle2','golf_obstacle_round2','golf_obstacle_cross'];
const SMALL_ASSETS=['golf_obstacle_square','golf_obstacle_bar','golf_obstacle_triangle','golf_obstacle_round'];
const LARGE_TYPES=['square','bar','triangle','round','cross'];
const SMALL_TYPES=['square','bar','triangle','bouncy'];
const raw=(grid,x,y)=>grid[y]?.[x]??-1;
const polygon=vertices=>({shape:'polygon',vertices,skinRadius:0,...MATERIAL});
const box=(hx,hy)=>polygon([[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]]);
const circle=radius=>({shape:'circle',radius,...MATERIAL});

function descriptor(pass,index,cellX,cellY,x,y,rotation,scale){
  const large=pass==='large',type=(large?LARGE_TYPES:SMALL_TYPES)[index],asset=(large?LARGE_ASSETS:SMALL_ASSETS)[index];
  const half=Math.fround((large?35:15)*scale);
  let fixtures;
  if(type==='square')fixtures=[box(half,half)];
  else if(type==='bar')fixtures=[box(large?47.5:22,3)];
  else if(type==='triangle')fixtures=[polygon([[-half,-half],[half,half],[half,-half]])];
  else if(type==='round')fixtures=[circle(half)];
  else if(type==='cross')fixtures=[box(47.5,3),box(3,47.5),circle(10)];
  else fixtures=[circle(18)]; // Circle passed to makeFixture2:, despite unused SetAsBox(10,10).
  const obstacle={pass,type,asset,cellX,cellY,x,y,rotation,scale,
    bodyX:Math.fround(x),bodyY:Math.fround(y),bodyRotation:Math.fround(rotation),bodyType:'static',bullet:true,
    bouncy:type==='bouncy',fixtures,
    shadow:{asset,x,y:y-2,rotation,scale,alpha:.25,color:'#000'},
  };
  if(fixtures.length===1){if(fixtures[0].vertices)obstacle.vertices=fixtures[0].vertices;else obstacle.radius=fixtures[0].radius;}
  return obstacle;
}

/** Resume the native drand48 stream immediately after nativeTerrain.
 * Occupancy is copied; returned occupied contains every new reservation (value3).
 * Obstacles are ordered by creation: ascending row/column large pass, then
 * accepted random small placements. Local fixture vertices already include scale.
 * x/y/rotation are double SpriteKit transforms; body* are Box2D float transforms.
 */
export function nativeObstacles(grid,occupied,random){
  const used=occupied.map(row=>row.slice()),rows=used.length,cols=used[0]?.length??0,obstacles=[];
  for(let y=0;y<rows;y++)for(let x=0;x<used[y].length;x++){
    const cells=[[x,y],[x+1,y],[x,y+1],[x+1,y+1]];
    // grid_get2 preserves raw3; no draw is consumed for an ineligible anchor.
    if(cells.some(([cx,cy])=>raw(grid,cx,cy)!==0||raw(used,cx,cy)!==0)||random()>=.5)continue;
    for(const [cx,cy] of cells)used[cy][cx]=3;
    const choice=Math.fround(random());
    const index=choice<.2?0:choice<.4?1:choice<.6?2:choice<.8?3:4;
    const scale=[0,2,3].includes(index) ? fmadd(random(),.3,.7) : 1;
    // Native performs (r*pi)+(r*pi), rather than r*(2*pi).
    const angle=random()*Math.PI,rotation=angle+angle;
    obstacles.push(descriptor('large',index,x,y,Math.fround(x*CELL)+32.5,Math.fround(y*CELL)+32.5,rotation,scale));
  }
  const largeCount=obstacles.length,eligible=used.flat().filter(value=>value===0).length;
  const base=Math.floor((eligible+eligible)/3),r=random(); // Consumed even when base=0.
  const smallCount=Math.floor(base/3)+Math.floor((r*base+r*base)/3);
  for(let i=0;i<smallCount;i++){
    let x,y;
    do{x=Math.floor(random()*cols);y=Math.floor(random()*rows);}while(used[y][x]!==0);
    used[y][x]=3;
    const choice=Math.fround(random()),index=choice<.25?0:choice<.5?1:choice<.75?2:3;
    const scale=index===0||index===2 ? fmadd(random(),.5,.5) : 1;
    const angle=random()*Math.PI,rotation=angle+angle;
    const px=fmadd(random(),20,Math.fround(x*CELL))-10,py=fmadd(random(),20,Math.fround(y*CELL))-10;
    obstacles.push(descriptor('small',index,x,y,px,py,rotation,scale));
  }
  return {obstacles,occupied:used,count:obstacles.length,largeCount,smallCount,eligible,base};
}
