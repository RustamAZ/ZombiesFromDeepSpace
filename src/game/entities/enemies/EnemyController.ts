import { Vector3 } from '@babylonjs/core';
import { NavigationAgent } from '../../navigation/NavigationAgent';
import type { NavigationCell, NavigationGrid } from '../../navigation/NavigationGrid';
import type { EnemyConfig, EnemyState, EnemyTarget } from './Enemy';

export class EnemyController {
  state: EnemyState = 'chase';
  readonly position: Vector3;
  yaw = Math.PI;
  private readonly agent: NavigationAgent;
  private readonly assaultAgent: NavigationAgent;
  private readonly knockbackVelocity = Vector3.Zero();
  private readonly separationDirection = new Vector3(Math.random()-0.5,0,Math.random()-0.5).normalize();
  private timer = 0;
  private hitSlowFor=0;
  playerBlocked=false;
  private attackTarget?: EnemyTarget;
  private stalledFor=0;
  private stallAnchor?: Vector3;
  private stuckDoor?: ReturnType<NavigationGrid['breakableAt']>;
  private assault?: {position:Vector3;cell:NavigationCell;goal:Vector3;revision:number};
  private assaultRetryIn=0;
  private bypass?: { blocker:Vector3; forward:Vector3; side:Vector3; goal:Vector3; revision:number; agent:NavigationAgent };

  constructor(home: Vector3, private readonly grid: NavigationGrid, private readonly cfg: EnemyConfig,
    private readonly crowdPositions: () => readonly Vector3[] = () => [],
    private readonly crowdReservations: () => readonly Vector3[] = () => []) {
    this.position=home.clone();
    this.agent=new NavigationAgent(grid);
    this.assaultAgent=new NavigationAgent(grid);
  }

  get assaultPosition(): Vector3|undefined { return this.assault?.position; }

  get debug() {
    const cell=this.breachCell;
    return {position:this.position,route:this.agent.waypoints,lastSeen:undefined,
      strikePoint:cell?.min.add(cell.max).scaleInPlace(0.5)};
  }
  get breachCell() {
    if (this.state!=='chase') return undefined;
    return this.stuckDoor ?? (this.assault && this.assault.revision===this.grid.revision &&
      Vector3.DistanceSquared(this.position,this.assault.position)<0.25 ? this.assault.cell : undefined)
      ?? this.agent.readyToBreak;
  }
  get isAlerted(): boolean { return true; }
  get attackLean(): number {
    if (this.state==='windup') return 1-Math.max(0,this.timer)/this.cfg.windup;
    if (this.state==='recovery') {
      const visualRecovery=this.cfg.attackVisualRecovery ?? this.cfg.recovery;
      return Math.max(0,1-(this.cfg.recovery-Math.max(0,this.timer))/visualRecovery);
    }
    return 0;
  }

  applyHitSlow(seconds:number):void { this.hitSlowFor=Math.max(this.hitSlowFor,seconds); }

  applyKnockback(direction: Vector3, speed: number): void {
    const horizontal=direction.clone(); horizontal.y=0;
    if (horizontal.lengthSquared()<0.0001) return;
    this.knockbackVelocity.addInPlace(horizontal.normalize().scaleInPlace(speed));
  }

  update(dt: number, target: EnemyTarget, player:EnemyTarget,
    canAttackPlayer:()=>boolean=()=>this.grid.passable(this.position,player.feet)): void {
    if (this.state==='dead') return;
    const movementFactor=this.hitSlowFor>0 ? this.cfg.hitSlowFactor ?? 1 : 1;
    this.hitSlowFor=Math.max(0,this.hitSlowFor-dt);
    this.assaultRetryIn=Math.max(0,this.assaultRetryIn-dt);
    this.applyKnockbackMotion(dt);
    this.applyPersonalSpace(dt);
    this.playerBlocked=this.applyPlayerSpace(player);
    const inReach=(candidate: EnemyTarget) => candidate.isAlive &&
      Vector3.Distance(this.position,candidate.feet)<=this.cfg.attackRange &&
      (candidate===player ? canAttackPlayer() : this.grid.passable(this.position,candidate.feet));
    if (this.state==='windup') {
      this.timer-=dt;
      if (this.timer<=0) {
        if (this.attackTarget && inReach(this.attackTarget)) this.attackTarget.takeDamage(this.cfg.damage);
        this.state='recovery'; this.timer=this.cfg.recovery;
      }
      return;
    }
    if (this.state==='recovery') {
      this.timer-=dt;
      if (this.timer>0) return;
      this.state='chase';
    }
    if (!target.isAlive) { this.bypass=undefined; this.assault=undefined; return; }
    if (this.assault && (this.assault.revision!==this.grid.revision ||
        Vector3.DistanceSquared(this.assault.goal,target.feet)>1)) {
      this.assault=undefined;
      this.assaultAgent.invalidate();
      this.bypass=undefined;
    }
    this.stuckDoor=this.grid.breakableAt(this.position);
    if (this.stuckDoor) {
      this.stalledFor=0;
      return;
    }
    if (inReach(target)) {
      this.bypass=undefined;
      this.assault=undefined;
      this.state='windup'; this.timer=this.cfg.windup; this.attackTarget=target;
      this.yaw=Math.atan2(target.feet.x-this.position.x,target.feet.z-this.position.z);
      return;
    }
    const before=this.position.clone();
    const travel=this.cfg.chaseSpeed*movementFactor*dt;
    let activeAgent=this.assault ? this.assaultAgent : this.agent;
    let movementGoal=this.assault?.position ?? target.feet;
    let movement: ReturnType<NavigationAgent['move']>='waiting';
    if (!this.followBypass(travel,movementGoal,activeAgent)) {
      movement=activeAgent.move(this.position,movementGoal,this.cfg.chaseSpeed*movementFactor,dt,!this.assault,
        (from,to)=>this.canStepPastCrowd(from,to));
      if ((movement==='waiting' || movement==='blocked') && !this.assault &&
          this.assaultRetryIn===0 && this.startAssault(target.feet)) {
        activeAgent=this.assaultAgent;
        movementGoal=this.assault!.position;
        movement=activeAgent.move(this.position,movementGoal,this.cfg.chaseSpeed*movementFactor,dt,false,
          (from,to)=>this.canStepPastCrowd(from,to));
      }
      if (movement==='waiting' && this.startBypass(movementGoal,activeAgent))
        this.followBypass(travel,movementGoal,activeAgent);
    }
    if (this.assault && Vector3.DistanceSquared(this.position,this.assault.position)<0.25) {
      const center=this.assault.cell.min.add(this.assault.cell.max).scaleInPlace(0.5);
      this.stuckDoor=this.grid.breakableAhead(this.position,center,1.3);
    }
    this.playerBlocked=this.applyPlayerSpace(player) || this.playerBlocked;
    const delta=this.position.subtract(before);
    if (!this.stallAnchor || Vector3.DistanceSquared(this.position,this.stallAnchor)>0.12**2) {
      this.stallAnchor=this.position.clone();
      this.stalledFor=0;
    } else this.stalledFor+=dt;
    if (this.stalledFor>=0.3) {
      this.stuckDoor=this.grid.breakableWithinReach(this.position,target.feet,1.55);
    }
    if (delta.x*delta.x+delta.z*delta.z>1e-8) this.yaw=Math.atan2(delta.x,delta.z);
  }

  private applyKnockbackMotion(dt: number): void {
    if (this.knockbackVelocity.lengthSquared()<0.0001) return;
    const next=this.position.add(this.knockbackVelocity.scale(dt));
    if (this.grid.passable(this.position,next)) this.position.copyFrom(next);
    this.knockbackVelocity.scaleInPlace(Math.exp(-9*dt));
  }

  private startAssault(goal:Vector3): boolean {
    this.assaultRetryIn=0.25;
    const spots=this.grid.doorAssaultSpots(this.position,goal,this.agent.plannedBreakTarget);
    const crowd=this.crowdPositions();
    const reservations=this.crowdReservations();
    const spacing=(this.cfg.personalSpaceRadius*2+0.05)**2;
    const available=spots.filter(({position})=>
      this.grid.passable(this.position,position) &&
      crowd.every(other=>Vector3.DistanceSquared(position,other)>=spacing) &&
      reservations.every(other=>Vector3.DistanceSquared(position,other)>=spacing));
    available.sort((a,b)=>Vector3.DistanceSquared(this.position,a.position)-
      Vector3.DistanceSquared(this.position,b.position));
    const spot=available[0];
    if (!spot) return false;
    this.assault={...spot,goal:goal.clone(),revision:this.grid.revision};
    this.assaultAgent.invalidate();
    this.bypass=undefined;
    return true;
  }

  private startBypass(goal:Vector3,agent:NavigationAgent): boolean {
    const waypoint=agent.waypoints[0];
    if (!waypoint) return false;
    const forward=waypoint.subtract(this.position); forward.y=0;
    if (forward.lengthSquared()<0.01) return false;
    forward.normalize();
    const side=new Vector3(forward.z,0,-forward.x);
    const spacing=this.cfg.personalSpaceRadius*2;
    const blocker=this.crowdPositions()
      .filter(other=>{
        const offset=other.subtract(this.position); offset.y=0;
        return Vector3.Dot(offset,forward)>-0.15 && offset.lengthSquared()<(spacing+0.35)**2;
      })
      .sort((a,b)=>Vector3.DistanceSquared(a,this.position)-Vector3.DistanceSquared(b,this.position))[0];
    if (!blocker) return false;
    const lateral=Vector3.Dot(this.position.subtract(blocker),side);
    const preferred=Math.abs(lateral)>0.05 ? Math.sign(lateral) :
      Vector3.Dot(this.separationDirection,side)>=0?1:-1;
    for (const sign of [preferred,-preferred]) {
      const direction=side.scale(sign);
      const probe=this.position.add(direction.scale(spacing+0.02));
      if (!this.grid.passable(this.position,probe) || !this.canStepPastCrowd(this.position,probe)) continue;
      this.bypass={blocker,forward,side:direction,goal:goal.clone(),revision:this.grid.revision,agent};
      return true;
    }
    return false;
  }

  private followBypass(travel:number,goal:Vector3,agent:NavigationAgent): boolean {
    const bypass=this.bypass;
    if (!bypass) return false;
    const waypoint=agent.waypoints[0];
    if (!waypoint || bypass.agent!==agent || bypass.revision!==this.grid.revision ||
        !this.crowdPositions().includes(bypass.blocker) ||
        Vector3.DistanceSquared(bypass.goal,goal)>1) {
      this.bypass=undefined;
      agent.invalidate();
      return false;
    }
    const relative=this.position.subtract(bypass.blocker); relative.y=0;
    const spacing=this.cfg.personalSpaceRadius*2;
    if (Vector3.Dot(relative,bypass.forward)>spacing*0.6 ||
        this.clearCrowdSegment(this.position,waypoint)) {
      this.bypass=undefined;
      agent.invalidate();
      return false;
    }
    const moveSide=Vector3.Dot(relative,bypass.side)<spacing+0.02;
    const direction=moveSide?bypass.side:bypass.forward;
    const next=this.position.add(direction.scale(travel));
    if (this.grid.passable(this.position,next) && this.canStepPastCrowd(this.position,next)) {
      this.position.copyFrom(next);
    } else if (!moveSide && !this.grid.passable(this.position,next)) {
      this.stuckDoor=this.grid.breakableAhead(this.position,next,1.05);
    }
    return true;
  }

  private clearCrowdSegment(from:Vector3,to:Vector3): boolean {
    if (!this.grid.passable(from,to)) return false;
    const dx=to.x-from.x, dz=to.z-from.z;
    const lengthSquared=dx*dx+dz*dz;
    if (lengthSquared<0.0001) return true;
    const spacing=(this.cfg.personalSpaceRadius*2+0.02)**2;
    return this.crowdPositions().every(other=>{
      const projection=Math.max(0,Math.min(1,
        ((other.x-from.x)*dx+(other.z-from.z)*dz)/lengthSquared));
      const x=from.x+dx*projection-other.x, z=from.z+dz*projection-other.z;
      return x*x+z*z>=spacing;
    });
  }

  private canStepPastCrowd(from:Vector3,to:Vector3): boolean {
    const minimumDistance=this.cfg.personalSpaceRadius*2-0.02;
    const minimumSquared=minimumDistance*minimumDistance;
    for (const other of this.crowdPositions()) {
      const dx=to.x-other.x, dz=to.z-other.z;
      const nextDistance=dx*dx+dz*dz;
      if (nextDistance>=minimumSquared) continue;
      const fromDx=from.x-other.x, fromDz=from.z-other.z;
      if (nextDistance<fromDx*fromDx+fromDz*fromDz) return false;
    }
    return true;
  }

  private applyPersonalSpace(dt:number): void {
    const minimumDistance=this.cfg.personalSpaceRadius*2;
    const push=Vector3.Zero();
    for (const other of this.crowdPositions()) {
      const delta=this.position.subtract(other); delta.y=0;
      const distance=delta.length();
      if (distance>=minimumDistance) continue;
      if (distance<0.0001) delta.copyFrom(this.separationDirection);
      else delta.scaleInPlace(1/distance);
      push.addInPlace(delta.scale((minimumDistance-distance)*0.5));
    }
    if (push.lengthSquared()<0.000001) return;
    const maxPush=this.cfg.chaseSpeed*dt;
    if (push.lengthSquared()>maxPush*maxPush) push.normalize().scaleInPlace(maxPush);
    const next=this.position.add(push);
    if (this.grid.passable(this.position,next)) this.position.copyFrom(next);
  }

  private applyPlayerSpace(player:EnemyTarget):boolean {
    if (!player.isAlive) return false;
    const delta=this.position.subtract(player.feet);
    delta.y=0;
    const minimumDistance=this.cfg.personalSpaceRadius+player.visibilityRadius;
    const distance=delta.length();
    if (distance>=minimumDistance) return false;
    if (distance<0.0001) delta.copyFrom(this.separationDirection);
    else delta.scaleInPlace(1/distance);
    const next=this.position.add(delta.scale(minimumDistance-distance+0.01));
    if (this.grid.passable(this.position,next)) this.position.copyFrom(next);
    return true;
  }
}
