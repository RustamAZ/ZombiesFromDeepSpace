import { Vector3 } from '@babylonjs/core';
import type { CrowdIndex } from './CrowdIndex';
import type { NavigationGrid } from './NavigationGrid';

const turns=[0,Math.PI/7,Math.PI/3.5,Math.PI/2].map(a=>({cos:Math.cos(a),sin:Math.sin(a)}));

// Neighbours affect the next few steps, never the shared path-building budget.
export class LocalCrowdFlow {
  private readonly lookAhead:number;
  private readonly interval=0.15+Math.random()*0.09;
  private readonly near:Vector3[]=[];
  private readonly probe=Vector3.Zero();
  private readonly step=Vector3.Zero();
  private readonly heading=Vector3.Zero();
  private side=Math.random()<0.5?-1:1;
  private retryIn=Math.random()*this.interval;
  private steering=false;

  constructor(private readonly grid:NavigationGrid, private readonly crowd:CrowdIndex,
    private readonly spacing:number) { this.lookAhead=spacing*(0.6+Math.random()*0.25); }

  tick(dt:number):void { this.retryIn-=dt; }

  readonly steer=(p:Vector3,direct:Vector3,waypoint:Vector3):Vector3|undefined=>{
    const dx=direct.x-p.x,dz=direct.z-p.z,travel=Math.hypot(dx,dz);
    if(travel<1e-6)return direct;
    const fx=dx/travel,fz=dz/travel;
    if(this.retryIn<=0) {
      this.retryIn=this.interval;
      this.steering=false;
      const reach=Math.min(Math.max(travel,this.lookAhead),Math.hypot(waypoint.x-p.x,waypoint.z-p.z));
      const radius=reach+this.spacing;
      this.near.length=0;
      this.crowd.some(p,p,p,radius,n=>{
        if((n.x-p.x)**2+(n.z-p.z)**2<radius*radius)this.near.push(n);
        return false;
      });
      if(this.freeDistance(p,fx,fz,reach)<reach) {
        let best=0;
        for(const {cos,sin} of turns) {
          for(let i=0;i<(sin===0?1:2);i++) {
            const sign=i===0?this.side:-this.side;
            const x=fx*cos+fz*sin*sign,z=fz*cos-fx*sin*sign;
            const free=this.freeDistance(p,x,z,reach);
            const score=free*(0.4+0.6*cos);
            if(free>=travel && score>best+0.001) {
              this.probe.set(p.x+x*free,p.y,p.z+z*free);
              if(this.grid.passable(p,this.probe)) {
                best=score;
                this.heading.set(x,0,z);
                this.steering=sin!==0;
              }
            }
          }
        }
        if(this.steering)this.side=Math.sign(this.heading.x*fz-this.heading.z*fx);
      }
      this.near.length=0;
    }
    if(this.steering && this.heading.x*fx+this.heading.z*fz>=-0.2) {
      this.step.set(p.x+this.heading.x*travel,p.y,p.z+this.heading.z*travel);
      if(this.canStep(p,this.step) && this.grid.passable(p,this.step))return this.step;
    }
    return this.canStep(p,direct)?direct:undefined;
  };

  private freeDistance(p:Vector3,x:number,z:number,limit:number):number {
    for(const n of this.near) {
      const dx=n.x-p.x,dz=n.z-p.z,along=dx*x+dz*z;
      if(along<=1e-8)continue;
      const cross=dx*z-dz*x, chord=this.spacing*this.spacing-cross*cross;
      if(chord>0)limit=Math.min(limit,Math.max(0,along-Math.sqrt(chord)));
    }
    return limit;
  }

  canStep(from:Vector3,to:Vector3):boolean {
    const dx=to.x-from.x,dz=to.z-from.z,len2=dx*dx+dz*dz;
    if(len2===0)return true;
    return !this.crowd.some(from,from,to,this.spacing,n=>{
      const x=n.x-from.x,z=n.z-from.z,dot=x*dx+z*dz;
      if(dot<=0)return false; // Allow overlapping bodies to separate.
      const t=Math.min(1,dot/len2);
      return (x-t*dx)**2+(z-t*dz)**2<this.spacing*this.spacing;
    });
  }
}
