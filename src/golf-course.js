// Recovered from GolfScene createMap:/check:/getLongest: and PathFinder.
// Addresses and remaining fidelity gaps: evidence/golf-topology-implementation.md.
import {nativeObstacles} from './golf-obstacles.js';
const CARDINAL = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const DIAGONAL = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
const DIMENSIONS = {3: [[6, 4], [7, 5], [7, 7]], 5: [[6, 4], [7, 5], [7, 7], [10, 6], [9, 8]]};
function nativeBackground(hue){
  const h=hue*6,c=.76*.09,x=c*(1-Math.abs(h%2-1)),m=.76-c;
  const rgb=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h)%6];
  return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}

export function rng(seed, resumeState) {
  let state = resumeState === undefined ? (BigInt(seed >>> 0) << 16n) | 0x330en : BigInt(resumeState);
  let draws = 0;
  const next = () => {
    state = (state * 0x5deece66dn + 0xbn) & 0xffffffffffffn;
    draws++;
    return Number(state) / 281474976710656;
  };
  Object.defineProperties(next, {state: {get: () => state}, draws: {get: () => draws}});
  return next;
}

// The first post-topology pass consumes one draw per ordinary floor cell,
// excluding the selected endpoints. At .5 it chamfers eligible corners.
// GolfScene createMap: 0x10017133c..1001717f0; four rotations at 100171b54.
export function nativeCorners(grid,path,random){
  const result=grid.map(row=>row.slice()),corners=[];
  const ends=[path[0],path.at(-1)];
  for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++){
    if(result[y][x]!==0||ends.some(p=>p.x===x&&p.y===y)||random()>=.5)continue;
    const below=get(result,x,y-1)!==0,above=get(result,x,y+1)!==0,left=get(result,x-1,y)!==0,right=get(result,x+1,y)!==0;
    if(below===above||left===right)continue;
    const rotation=below?(left?Math.PI/2:Math.PI):(left?0:Math.PI*1.5);
    result[y][x]=3;corners.push({x,y,rotation});
  }
  return {grid:result,corners};
}

// Ascending cells: endpoint jitter, .5 single-corridor slopes, then .4
// paired slopes. Occupancy is copied separately from the terrain grid.
// GolfScene createMap: 100171ee0..100173f64, especially 100172aec/100172b48.
export function nativeTerrain(grid,path,random){
  const occupied=grid.map(row=>row.slice()),slopes=[];let start,hole;
  const addSlope=(x,y,down,horizontal=false)=>slopes.push({x,y,asset:down?'golf_slope_down':'golf_slope_up',
    rotation:horizontal?Math.PI/2:0,vx:horizontal?(down?1:-1):0,vy:horizontal?0:(down?-1:1)});
  for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y].length;x++){
    if(grid[y][x]!==0)continue;
    if(x===path[0].x&&y===path[0].y){occupied[y][x]=3;start={x:x*65+random()*20-10,y:y*65+random()*20-10};}
    if(x===path.at(-1).x&&y===path.at(-1).y){occupied[y][x]=3;hole={x:x*65+random()*20-10,y:y*65+random()*20-10};}
    if(random()<.5&&occupied[y][x]===0){
      const below=get(grid,x,y-1)!==0,above=get(grid,x,y+1)!==0,left=get(grid,x-1,y)!==0,right=get(grid,x+1,y)!==0;
      if(!below&&!above&&left&&right){occupied[y][x]=3;addSlope(x,y,random()<.5);}
      else if(below&&above&&!left&&!right){occupied[y][x]=3;addSlope(x,y,random()<.5,true);}
    }
    if(random()<.4&&occupied[y][x]===0&&get(grid,x,y-1)===0&&get(grid,x,y+1)===0&&
      get(grid,x-1,y)!==0&&get(grid,x+1,y)===0&&get(grid,x+2,y)!==0&&get(grid,x+1,y+1)===0&&get(grid,x+1,y-1)===0){
      occupied[y][x]=occupied[y][x+1]=3;const down=Math.fround(random())<.5;addSlope(x,y,down);addSlope(x+1,y,down);
    }
  }
  return {occupied,slopes,start,hole};
}

function get(grid, x, y) {
  const value = grid[y]?.[x];
  return value === undefined ? -1 : value === 3 ? 0 : value;
}

// Native g is always 10, not accumulated distance. Thus this is greedy search,
// with |dx| + 10|dy| as h. Existing open nodes are never reparented.
// Native NSMutableDictionary enumeration breaks equal-priority ties; its order
// is not recovered. Stable insertion order is the sole path-search approximation.
export function nativePath(grid, origin, target) {
  const cols = grid[0]?.length ?? 0, rows = grid.length;
  if (!cols || !rows || grid[origin.y]?.[origin.x] !== 0 || grid[target.y]?.[target.x] !== 0) return [];
  const count = cols * rows, visited = new Uint8Array(count);
  const first = {x: origin.x, y: origin.y, parent: null, priority: 0};
  const open = [first];
  visited[first.y * cols + first.x] = 1;
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].priority < open[best].priority) best = i;
    const node = open.splice(best, 1)[0];
    if (node.x === target.x && node.y === target.y) {
      const path = [];
      for (let p = node; p; p = p.parent) path.push({x: p.x, y: p.y});
      return path; // RetracePath: returns target first, origin last.
    }
    for (const [dx, dy] of CARDINAL) {
      const x = node.x + dx, y = node.y + dy, index = y * cols + x;
      if (x < 0 || y < 0 || x >= cols || y >= rows || grid[y][x] !== 0 || visited[index]) continue;
      visited[index] = 1;
      open.push({x, y, parent: node, priority: 10 + Math.abs(x - target.x) + 10 * Math.abs(y - target.y)});
    }
  }
  return [];
}

// check: tests two crossed pairs of floor extrema on the first/last row.
// It does not demand that every floor component be connected.
export function nativeCheck(grid) {
  const first = [], last = [];
  for (let x = 0; x < (grid[0]?.length ?? 0); x++) {
    if (grid[0][x] === 0) first.push(x);
    if (grid.at(-1)[x] === 0) last.push(x);
  }
  if (!first.length || !last.length) return false;
  const y = grid.length - 1;
  return nativePath(grid, {x: first[0], y: 0}, {x: last.at(-1), y}).length > 0 &&
    nativePath(grid, {x: first.at(-1), y: 0}, {x: last[0], y}).length > 0;
}

export function nativeLongest(grid) {
  const floor = [];
  for (let y = grid.length - 1; y >= 0; y--)
    for (let x = grid[y].length - 1; x >= 0; x--) if (grid[y][x] === 0) floor.push({x, y});
  let best = [];
  for (const origin of floor) for (const target of floor) {
    if (origin.x === target.x && origin.y === target.y) continue;
    const path = nativePath(grid, origin, target);
    if (path.length > best.length || (path.length > 0 && path.length === best.length && path[0].y < best[0].y)) best = path;
  }
  return best;
}

function locallyEligible(grid, x, y) {
  if (grid[y][x] === 1) return false;
  // Boundary cells bypass both the neighbor and diagonal conditions natively.
  if (x === 0 || y === 0 || x === grid[0].length - 1 || y === grid.length - 1) return true;
  if (!CARDINAL.some(([dx, dy]) => get(grid, x + dx, y + dy) === 1)) return false;
  return !DIAGONAL.some(([dx, dy]) => get(grid, x + dx, y + dy) === 1 &&
    get(grid, x + dx, y) === 0 && get(grid, x, y + dy) === 0);
}

export function generateTopology(seed, hole = 1, holes = 3) {
  if (!DIMENSIONS[holes] || !Number.isInteger(hole) || hole < 1 || hole > holes) throw new RangeError('Golf uses 3 or 5 holes, numbered from 1.');
  // Native arrays are outer rows then inner columns, despite map_size naming.
  const [rows, cols] = DIMENSIONS[holes][hole - 1], area = rows * cols;
  const random = rng(seed);
  for (let i = 0; i < hole - 1; i++) random();
  const threshold = Math.fround(Math.floor(random() * area * .5) + area * .13);
  const grid = Array.from({length: rows}, () => Array(cols).fill(0));
  for (let iteration = 0; Math.fround(iteration) < threshold; iteration++) {
    for (let rejected = 0; rejected <= area; rejected++) {
      let x, y;
      do {
        x = Math.floor(random() * cols);
        y = Math.floor(random() * rows);
      } while (!locallyEligible(grid, x, y));
      grid[y][x] = 1;
      if (nativeCheck(grid)) break;
      grid[y][x] = 0;
    }
  }
  // Fill cells with no cardinal floor neighbor, in ascending row/column order.
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (grid[y][x] === 0 && CARDINAL.every(([dx, dy]) => get(grid, x + dx, y + dy) !== 0)) grid[y][x] = 1;
  }
  // The subsequent pass inserts isolated solid cells with probability .24.
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (grid[y][x] === 0 && [...CARDINAL, ...DIAGONAL].every(([dx, dy]) => get(grid, x + dx, y + dy) === 0) && random() < .24) grid[y][x] = 1;
  }
  return {grid, rows, cols, threshold, draws: random.draws, rngState: random.state.toString(16), path: nativeLongest(grid)};
}

export function makeCourse(seed, hole = 1, holes = 3) {
  const native = generateTopology(seed, hole, holes), {rows, cols, path} = native, size = 65;
  const random=rng(seed,`0x${native.rngState}`),decorated=nativeCorners(native.grid,path,random),grid=decorated.grid;
  const cornerPassDraws=random.draws,cornerPassRngState=random.state.toString(16),terrain=nativeTerrain(grid,path,random);
  const terrainPassDraws=random.draws-cornerPassDraws,terrainPassRngState=random.state.toString(16);
  const nativeObjects=nativeObstacles(grid,terrain.occupied,random);
  const obstaclePassDraws=random.draws-cornerPassDraws-terrainPassDraws,obstaclePassRngState=random.state.toString(16);
  const background=nativeBackground(random()*.6);
  // SpriteKit y-up -> Canvas y-down, adding half a cell to native centers.
  const cell = p => ({x: p.x, y: rows - 1 - p.y});
  const center = p => ({x: (p.x + .5) * size, y: (p.y + .5) * size});
  const startCell = cell(path[0]), goalCell = cell(path.at(-1));
  const cornerTiles=decorated.corners.map(p=>({...cell(p),rotation:-p.rotation}));
  const slopes=terrain.slopes.map(p=>({...cell(p),asset:p.asset,rotation:-p.rotation,vx:p.vx,vy:-p.vy}));
  const nativePosition=p=>({x:p.x+32.5,y:(rows-.5)*size-p.y});
  const obstacles=nativeObjects.obstacles.map(p=>({...p,...nativePosition(p),rotation:-p.rotation,
    bodyX:p.bodyX+32.5,bodyY:(rows-.5)*size-p.bodyY,bodyRotation:-p.bodyRotation,
    shadow:{...p.shadow,...nativePosition(p.shadow),rotation:-p.shadow.rotation},
    fixtures:p.fixtures.map(f=>({...f,...(f.vertices?{vertices:f.vertices.map(([x,y])=>[x,-y])}:{})}))}));
  const tiles = [], walls = [];
  const terrainColliders=[];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const nativeY = rows - 1 - y;
    if(grid[nativeY][x]===1)terrainColliders.push([[x*65,y*65],[(x+1)*65,y*65],[(x+1)*65,(y+1)*65],[x*65,(y+1)*65]]);
    if (get(grid,x,nativeY) !== 0) continue;
    tiles.push([x, y]);
    const corner=cornerTiles.find(p=>p.x===x&&p.y===y);
    if(corner){
      const cs=Math.cos(corner.rotation),sn=Math.sin(corner.rotation),cx=(x+.5)*size,cy=(y+.5)*size;
      const point=(a,b)=>({x:cx+a*cs-b*sn,y:cy+a*sn+b*cs});
      const a=point(-32.5,32.5),b=point(32.5,-32.5);
      const cut=point(-32.5,-32.5);terrainColliders.push([[a.x,a.y],[b.x,b.y],[cut.x,cut.y]]);
      walls.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,asset:'golf_wall2'});continue;
    }
    for (const [dx, dy, a, b] of [[0, -1, [0, 0], [1, 0]], [1, 0, [1, 0], [1, 1]],
      [0, 1, [1, 1], [0, 1]], [-1, 0, [0, 1], [0, 0]]]) {
      if (get(grid, x + dx, nativeY - dy) !== 0) walls.push({ax: (x + a[0]) * size, ay: (y + a[1]) * size,
        bx: (x + b[0]) * size, by: (y + b[1]) * size});
    }
  }
  const width=cols*65,height=rows*65;
  terrainColliders.push([[-130,-130],[width+130,-130],[width+130,0],[-130,0]],
    [[-130,height],[width+130,height],[width+130,height+130],[-130,height+130]],
    [[-130,0],[0,0],[0,height],[-130,height]],[[width,0],[width+130,0],[width+130,height],[width,height]]);
  return {seed, size, cols, rows, tiles, walls, terrainColliders,start: nativePosition(terrain.start), hole: nativePosition(terrain.hole), obstacles,slopes,background,
    startCell, goalCell, nativeGrid: native.grid, decoratedGrid:grid,cornerTiles,nativePath: path, topologyDraws: native.draws, topologyRngState: native.rngState,
    cornerPassDraws,cornerPassRngState,terrainPassDraws,terrainPassRngState,obstaclePassDraws,obstaclePassRngState,
    courseDraws:native.draws+random.draws,courseRngState:random.state.toString(16),
    fidelity: {topology: 'native algorithm', pathTies: 'stable insertion order; native dictionary order unresolved',
      endpoints: 'native selected cells and interleaved ±10 jitter', decorations: 'native chamfers, slopes and two obstacle passes'}};
}
