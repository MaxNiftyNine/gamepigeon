import {World, Vec2, Circle, Polygon, Edge, Settings} from 'planck';

// GolfScene createMap: 0x100171044..1001711f0, Shoot 0x10017caac,
// update 0x100178f58..1001792ac, GolfContactListener 0x10000dc7c.
// Native world coordinates are divided by 100 to keep Box2D tolerances small.
export const GOLF_NATIVE = Object.freeze({radius:4, step:1/60, iterations:60,
  linearDamping:1, friction:0, restitution:.5, density:1, wallReflect:.95,
  stopSpeed:1, maxPull:300, launchMultiplier:2, captureRadius:6.5,
  captureMaxSpeed:400, insideRadius:2, holeMinSpeed:14, insideDamping:.95});
const UNIT=100;
Settings.linearSlop=Math.fround(.005)/UNIT; // Native mutable TOI slop, separate from zero position slop.
Settings.maxLinearCorrection=0;
Settings.aabbExtension=.1/UNIT;
Settings.velocityThreshold=1/UNIT;
// Native b2Island::Solve 0x1000cb580..59c has enlarged motion limits.
Settings.maxTranslation=100000/UNIT;
Settings.maxRotation=314159.28125;
const vector=(x,y)=>Vec2(x/UNIT,y/UNIT);

export function golfPull(distance){const pull=Math.min(300,2*Math.max(0,distance)-15);return pull<15?0:pull;}
export function reflectedVelocity(v,n,multiplier=.95){const dot=v.x*n.x+v.y*n.y;return {x:(v.x-2*dot*n.x)*multiplier,y:(v.y-2*dot*n.y)*multiplier};}

export class GolfPhysics {
  constructor(course,ball,{onContact=()=>{},onInside=()=>{}}={}){
    this.course=course;this.ball=ball;this.onContact=onContact;this.onInside=onInside;
    this.accumulator=0;this.world=new World(Vec2(0,0));
    this.body=this.world.createDynamicBody({position:vector(ball.x,ball.y),linearDamping:1,bullet:true,userData:{kind:'ball'}});
    this.body.createFixture(Circle(4/UNIT),{density:1,friction:0,restitution:.5});
    const walls=this.world.createBody({userData:{kind:'wall'}});
    for(const vertices of course.terrainColliders||[]){
      const shape=Polygon(vertices.map(p=>vector(...p)));shape.m_radius=0;
      walls.createFixture(shape,{density:1,friction:0,restitution:.5});
    }
    for(const w of course.terrainColliders?[]:course.walls){
      // Course wall segments run clockwise around floor. Put the 6-wide solid
      // cushion outside the floor, matching native half-width 3 / offset 35.5.
      const dx=w.bx-w.ax,dy=w.by-w.ay,len=Math.hypot(dx,dy),nx=dy/len*6,ny=-dx/len*6;
      const shape=Polygon([[w.ax,w.ay],[w.bx,w.by],[w.bx+nx,w.by+ny],[w.ax+nx,w.ay+ny]].map(p=>vector(...p)));
      shape.m_radius=0;
      walls.createFixture(shape,{density:1,friction:0,restitution:.5});
    }
    for(const obstacle of course.obstacles||[]){
      const body=this.world.createBody({position:vector(obstacle.bodyX,obstacle.bodyY),angle:obstacle.bodyRotation,
        userData:{kind:'obstacle',bouncy:obstacle.bouncy,obstacle}});
      for(const fixture of obstacle.fixtures){
        const shape=fixture.shape==='circle'?Circle(fixture.radius/UNIT):Polygon(fixture.vertices.map(p=>vector(...p)));
        if(fixture.shape!=='circle')shape.m_radius=(fixture.skinRadius??0)/UNIT;
        body.createFixture(shape,{density:fixture.density,friction:fixture.friction,restitution:fixture.restitution});
      }
    }
    const hole=this.world.createBody({position:vector(course.hole.x,course.hole.y),userData:{kind:'hole'}}),r=5.4;
    for(const [a,b] of [[[-r,-r],[r,-r]],[[r,-r],[r,r]],[[r,r],[-r,r]],[[-r,r],[-r,-r]]]){
      const shape=Edge(vector(...a),vector(...b));shape.m_radius=0;
      hole.createFixture(shape,{friction:0,restitution:.5});
    }
    this.world.on('pre-solve',contact=>{
      const kinds=[contact.getFixtureA(),contact.getFixtureB()].map(f=>f.getBody().getUserData()?.kind);
      if(kinds.includes('hole')&&!this.ball.inside)contact.setEnabled(false);
    });
    this.world.on('begin-contact',contact=>{
      const objects=[contact.getFixtureA(),contact.getFixtureB()].map(f=>f.getBody().getUserData());
      if(!objects.some(o=>o?.kind==='wall'||o?.kind==='obstacle'))return;
      const normal=contact.getWorldManifold(null)?.normal;if(!normal)return;
      const previous=this.body.getLinearVelocity();
      const velocity=objects.some(o=>o?.bouncy)?{x:previous.x+normal.x*750/UNIT,y:previous.y+normal.y*750/UNIT}:reflectedVelocity(previous,normal);
      this.body.setLinearVelocity(Vec2(velocity.x,velocity.y));this.onContact(objects.find(o=>o?.kind==='obstacle')||{kind:'wall'});
    });
  }
  strike(angle,pull){
    if(this.ball.inside||pull<=0)return false;
    this.accumulator=0;this.ball.captured=false;this.ball.holeSpeed=0;this.ball.scale=1;this.ball.alpha=1;
    this.body.setTransform(vector(this.ball.x,this.ball.y),0);
    const speed=Math.min(300,pull)*2;
    this.body.setLinearVelocity(vector(Math.cos(angle)*speed,Math.sin(angle)*speed));this.body.setAwake(true);
    this.sync();return true;
  }
  step(dt){
    this.accumulator+=Math.max(0,Math.min(dt,.25));
    while(this.accumulator+1e-12>=GOLF_NATIVE.step){this.fixedStep();this.accumulator-=GOLF_NATIVE.step;}
    return this.isMoving();
  }
  fixedStep(){
    this.world.step(GOLF_NATIVE.step,60,60);
    // Native containsPoint uses the sprite position from the previous frame;
    // the world has stepped but the rendered ball is synchronized later.
    for(const slope of this.course.slopes||[]){
      const dx=this.ball.x-(slope.x+.5)*65,dy=this.ball.y-(slope.y+.5)*65,angle=slope.rotation||0;
      const x=dx*Math.cos(angle)+dy*Math.sin(angle),y=-dx*Math.sin(angle)+dy*Math.cos(angle);
      if(Math.abs(x)<=32.5&&Math.abs(y)<=26){
        const v=this.body.getLinearVelocity();this.body.setLinearVelocity(Vec2(v.x+slope.vx*2/UNIT,v.y+slope.vy*2/UNIT));
      }
    }
    const b=this.ball,p=this.body.getPosition(),v=this.body.getLinearVelocity();
    const dx=this.course.hole.x-p.x*UNIT,dy=this.course.hole.y-p.y*UNIT,distance=Math.hypot(dx,dy),speed=v.length()*UNIT;
    if(distance<6.5&&speed<400)b.captured=true;
    if(b.captured&&!b.inside){const pullSpeed=Math.max(14,speed);this.body.setLinearVelocity(distance?vector(dx/distance*pullSpeed,dy/distance*pullSpeed):Vec2(0,0));}
    if(distance<2&&speed<400){if(!b.inside)this.onInside();b.inside=true;const vv=this.body.getLinearVelocity();this.body.setLinearVelocity(Vec2(vv.x*.95,vv.y*.95));}
    if(distance<3&&b.captured){b.holeSpeed=(b.holeSpeed||0)+.005;b.scale=Math.max(.8,(b.scale??1)-b.holeSpeed);b.alpha=1-(1-b.scale)*.5;}
    if(this.body.getLinearVelocity().length()*UNIT<1){this.body.setLinearVelocity(Vec2(0,0));this.body.setAngularVelocity(0);}
    this.sync();
  }
  sync(){const p=this.body.getPosition(),v=this.body.getLinearVelocity();Object.assign(this.ball,{x:p.x*UNIT,y:p.y*UNIT,vx:v.x*UNIT,vy:v.y*UNIT});}
  isMoving(){return this.body.getLinearVelocity().length()*UNIT>=1;}
  destroy(){this.body.setLinearVelocity(Vec2(0,0));this.world.destroyBody(this.body);}
}
