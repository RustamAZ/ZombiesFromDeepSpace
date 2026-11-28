import { Vector3 } from '@babylonjs/core';
import type { NavigationCell, NavigationGrid } from './NavigationGrid';
import type { PathBuildQueue } from './PathBuildQueue';

export class NavigationAgent {
  private route: Vector3[]=[];
  private goal?: Vector3;
  private revision=-1;
  private canBreach=false;
  private door?: NavigationCell;
  private offRoute=false;
  private lastX=NaN;
  private lastZ=NaN;
  private shortcutIn=0;

  constructor(private readonly grid: NavigationGrid, private readonly builds?:PathBuildQueue) {}

  get waypoints(): readonly Vector3[] { return this.route; }
  get plannedBreakTarget(): NavigationCell | undefined {
    return this.revision===this.grid.revision ? this.door : undefined;
  }
  get readyToBreak(): NavigationCell | undefined {
    return this.revision===this.grid.revision && !this.route.length ? this.door : undefined;
  }

  invalidate(): void { this.builds?.cancel(this); this.goal=undefined; this.route=[]; this.door=undefined; }

  move(pos: Vector3, goal: Vector3, speed: number, dt: number, canBreach: boolean,
    steer: (from: Vector3, direct: Vector3, waypoint:Vector3) => Vector3|undefined = (_,step)=>step): 'moving'|'arrived'|'blocked'|'waiting'|'queued' {
    const needsPlan=!this.goal || this.revision!==this.grid.revision || this.canBreach!==canBreach ||
      Vector3.DistanceSquared(this.goal,goal)>(this.route.length ? 0.09 : 0.0025);
    const queued=needsPlan && this.builds!==undefined && !this.builds.tryAcquire(this);
    if (!needsPlan)this.builds?.cancel(this);
    if (needsPlan && !queued) {
      const plan=this.grid.path(pos,goal,canBreach);
      this.goal=goal.clone();
      this.canBreach=canBreach;
      this.revision=this.grid.revision;
      this.door=plan.breakTarget;
      this.route=plan.points;
      this.offRoute=false;
      this.skipVisibleWaypoints(pos);
    }

    // Separation and knockback move the body outside this planner.
    if(pos.x!==this.lastX || pos.z!==this.lastZ)this.offRoute=true;
    this.shortcutIn-=dt;
    let travel=speed*dt;
    while (this.route.length) {
      // A detour may already have carried us past a shared intermediate waypoint.
      if(this.route.length>1 && this.shortcutIn<=0 && Vector3.DistanceSquared(pos,this.route[0])<1.5**2) {
        this.shortcutIn=0.2;
        // Aim just beyond the corner. Neighbours need not all touch the same grid point.
        const corner=this.route[0], following=this.route[1], span=Vector3.Distance(corner,following);
        const exit=span<=1 ? following : Vector3.Lerp(corner,following,1/span);
        if(this.grid.passable(pos,exit)) {
          if(exit===following)this.route.shift();
          else this.route[0]=exit;
          this.offRoute=false;
        }
      }
      const next=this.route[0], delta=next.subtract(pos), distance=delta.length();
      const direct=distance>travel ? pos.add(delta.scale(travel/distance)) : next;
      if ((queued || this.offRoute) && !this.grid.passable(pos,direct)) {
        if (!queued)this.invalidate();
        return 'queued';
      }
      const step=steer(pos,direct,next);
      if(!step)return 'waiting';
      pos.copyFrom(step);
      this.lastX=pos.x;
      this.lastZ=pos.z;
      if(step!==direct){this.offRoute=true;return 'moving';}
      if(direct!==next)return 'moving';
      this.offRoute=false;
      travel-=distance;
      this.route.shift();
      this.skipVisibleWaypoints(pos);
    }
    if(queued)return 'queued';
    return !this.door && Vector3.DistanceSquared(pos,goal)<0.04 ? 'arrived' : 'blocked';
  }

  private skipVisibleWaypoints(pos: Vector3): void {
    for (let i=this.route.length-1;i>0;--i) {
      if (!this.grid.passable(pos,this.route[i])) continue;
      this.route.splice(0,i);
      return;
    }
  }
}
