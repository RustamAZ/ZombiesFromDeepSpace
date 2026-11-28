import { Vector3 } from '@babylonjs/core';
import { NavigationAgent } from '../../navigation/NavigationAgent';
import { LocalCrowdFlow } from '../../navigation/LocalCrowdFlow';
import type { PathBuildQueue } from '../../navigation/PathBuildQueue';
import type { CrowdIndex } from '../../navigation/CrowdIndex';
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
  private readonly stallProbeInterval=0.30+Math.random()*0.12;
  private stallAnchor?: Vector3;
  private stuckDoor?: ReturnType<NavigationGrid['breakableAt']>;
  private assault?: {position:Vector3;cell:NavigationCell;goal:Vector3;revision:number};
  private assaultRetryIn=0;
  private readonly flow:LocalCrowdFlow;

  constructor(home: Vector3, private readonly grid: NavigationGrid, private readonly cfg: EnemyConfig,
    private readonly crowd:CrowdIndex,
    private readonly pathfinding=true, builds?:PathBuildQueue) {
    this.position=home.clone();
    this.agent=new NavigationAgent(grid,builds);
    this.assaultAgent=new NavigationAgent(grid,builds);
    this.flow=new LocalCrowdFlow(grid,crowd,cfg.personalSpaceRadius*2-0.02);
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
    if (!target.isAlive) { this.assault=undefined; return; }
    if (this.assault && (this.assault.revision!==this.grid.revision ||
        Vector3.DistanceSquared(this.assault.goal,target.feet)>1)) {
      this.assault=undefined;
      this.assaultAgent.invalidate();
    }
    this.stuckDoor=this.grid.breakableAt(this.position);
    if (this.stuckDoor) {
      this.stalledFor=0;
      return;
    }
    if (inReach(target)) {
      this.assault=undefined;
      this.state='windup'; this.timer=this.cfg.windup; this.attackTarget=target;
      this.yaw=Math.atan2(target.feet.x-this.position.x,target.feet.z-this.position.z);
      return;
    }
    const before=this.position.clone();
    const travel=this.cfg.chaseSpeed*movementFactor*dt;
    if (!this.pathfinding) {
      const delta=target.feet.subtract(this.position);
      delta.y=0;
      const distance=delta.length();
      if (distance>0.001) {
        this.yaw=Math.atan2(delta.x,delta.z);
        const next=this.position.add(delta.scale(Math.min(1,travel/distance)));
        if (!this.grid.passable(this.position,next)) {
          this.stuckDoor=this.grid.breakableAhead(this.position,next,1.05);
        } else if (this.flow.canStep(this.position,next)) {
          this.position.copyFrom(next);
          this.playerBlocked=this.applyPlayerSpace(player) || this.playerBlocked;
        }
      }
      return;
    }
    this.flow.tick(dt);
    const speed=this.cfg.chaseSpeed*movementFactor;
    const activeAgent=this.assault ? this.assaultAgent : this.agent;
    let movement=activeAgent.move(this.position,this.assault?.position ?? target.feet,speed,dt,!this.assault,this.flow.steer);
    if ((movement==='blocked' || (movement==='waiting' && this.agent.plannedBreakTarget)) &&
        !this.assault && this.assaultRetryIn===0 && this.startAssault(target.feet)) {
      movement=this.assaultAgent.move(this.position,this.assault!.position,speed,dt,false,this.flow.steer);
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
    if (this.stalledFor>=this.stallProbeInterval && !this.stuckDoor && movement!=='moving') {
      this.stalledFor=0;
      const toward=activeAgent.waypoints[0] ?? target.feet;
      this.stuckDoor=this.grid.breakableAhead(this.position,toward,this.cfg.wallBreakReach);
      if (!this.stuckDoor && (this.assault || this.agent.plannedBreakTarget)) {
        this.stuckDoor=this.grid.breakableWithinReach(this.position,toward,this.cfg.wallBreakReach);
      }
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
    const spacing=this.cfg.personalSpaceRadius*2+0.05;
    let spot:(typeof spots)[number]|undefined, best=Infinity;
    for(const candidate of spots) {
      const p=candidate.position,d=Vector3.DistanceSquared(this.position,p);
      if(d>=best || !this.grid.passable(this.position,p))continue;
      const occupied=(other:Vector3)=>Vector3.DistanceSquared(p,other)<spacing*spacing;
      if(this.crowd.some(this.position,p,p,spacing,occupied) ||
         this.crowd.some(this.position,p,p,spacing,occupied,true))continue;
      best=d;spot=candidate;
    }
    if (!spot) return false;
    this.assault={...spot,goal:goal.clone(),revision:this.grid.revision};
    this.assaultAgent.invalidate();
    return true;
  }


  private applyPersonalSpace(dt:number): void {
    const minimumDistance=this.cfg.personalSpaceRadius*2;
    const push=Vector3.Zero();
    const p=this.position;
    this.crowd.some(p,p,p,minimumDistance,other=>{
      const x=p.x-other.x,z=p.z-other.z,squared=x*x+z*z;
      if(squared<minimumDistance*minimumDistance) {
        const distance=Math.sqrt(squared),weight=(minimumDistance-distance)*0.5;
        push.x+=(distance<0.0001 ? this.separationDirection.x : x/distance)*weight;
        push.z+=(distance<0.0001 ? this.separationDirection.z : z/distance)*weight;
      }
      return false;
    });
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
