import { Vector3 } from '@babylonjs/core';
import type { NavigationCell, NavigationGrid } from './NavigationGrid';

export class NavigationAgent {
  private route: Vector3[]=[];
  private goal?: Vector3;
  private revision=-1;
  private canBreach=false;
  private door?: NavigationCell;

  constructor(private readonly grid: NavigationGrid) {}

  get waypoints(): readonly Vector3[] { return this.route; }
  get plannedBreakTarget(): NavigationCell | undefined {
    return this.revision===this.grid.revision ? this.door : undefined;
  }
  get readyToBreak(): NavigationCell | undefined {
    return this.revision===this.grid.revision && !this.route.length ? this.door : undefined;
  }

  invalidate(): void { this.goal=undefined; this.route=[]; this.door=undefined; }

  move(pos: Vector3, goal: Vector3, speed: number, dt: number, canBreach: boolean,
    canStep: (from: Vector3, to: Vector3) => boolean = () => true): 'moving'|'arrived'|'blocked'|'waiting' {
    if (!this.goal || this.revision!==this.grid.revision || this.canBreach!==canBreach ||
        Vector3.DistanceSquared(this.goal,goal)>(this.route.length ? 0.09 : 0.0025)) {
      const plan=this.grid.path(pos,goal,canBreach);
      this.goal=goal.clone();
      this.canBreach=canBreach;
      this.revision=this.grid.revision;
      this.door=plan.breakTarget;
      this.route=plan.points;
      this.skipVisibleWaypoints(pos);
    }

    let travel=speed*dt;
    while (this.route.length) {
      const next=this.route[0], delta=next.subtract(pos), distance=delta.length();
      if (distance>travel) {
        const step=pos.add(delta.scale(travel/distance));
        if (!canStep(pos,step)) return 'waiting';
        pos.copyFrom(step);
        return 'moving';
      }
      if (!canStep(pos,next)) return 'waiting';
      pos.copyFrom(next);
      travel-=distance;
      this.route.shift();
      this.skipVisibleWaypoints(pos);
    }
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
