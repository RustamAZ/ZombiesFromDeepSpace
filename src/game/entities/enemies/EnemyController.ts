import { Vector3 } from '@babylonjs/core';
import { NavigationAgent } from '../../navigation/NavigationAgent';
import type { NavigationGrid } from '../../navigation/NavigationGrid';
import type { EnemyConfig, EnemyState, EnemyTarget } from './Enemy';

export class EnemyController {
  state: EnemyState = 'idle';
  readonly position: Vector3;
  yaw = Math.PI;
  private readonly agent: NavigationAgent;
  private lastSeen?: Vector3;
  private patrol?: Vector3;
  private alerted = false;
  private senseIn = 0;
  private timer = 0;

  get debug() {
    const cell=this.breachCell;
    return {position:this.position, route:this.agent.waypoints, lastSeen:this.lastSeen,
      strikePoint:cell?.min.add(cell.max).scaleInPlace(0.5)};
  }
  get breachCell() {
    return this.state==='chase' || this.state==='investigate' ? this.agent.readyToBreak : undefined;
  }
  get isAlerted(): boolean { return this.alerted; }

  constructor(home: Vector3, private grid: NavigationGrid, private cfg: EnemyConfig,
    private sees: (target: EnemyTarget) => boolean) {
    this.position=home.clone();
    this.agent=new NavigationAgent(grid);
  }

  update(dt: number, player: EnemyTarget): void {
    if (this.state==='dead') return;
    this.timer-=dt;
    const inReach = () => Vector3.Distance(this.position,player.feet)<=this.cfg.attackRange &&
      this.grid.passable(this.position,player.feet);
    if (this.state==='windup') {
      if (this.timer<=0) {
        if (inReach() && this.sees(player)) player.takeDamage(this.cfg.damage);
        this.state='recovery'; this.timer=this.cfg.recovery;
      }
      return;
    }
    if (this.state==='recovery') {
      if (this.timer>0) return;
      this.state='investigate'; this.senseIn=0;
    }
    this.senseIn-=dt;
    if (this.senseIn<=0) {
      this.senseIn=this.cfg.thinkInterval;
      const visible=this.sees(player);
      if (visible) this.alerted=true;
      const heard=this.alerted &&
        Math.hypot(player.feet.x-this.position.x,player.feet.z-this.position.z)<=this.cfg.alertedHearingRadius;
      if (visible || heard) {
        this.lastSeen=player.feet.clone();
        this.patrol=undefined;
        this.state='chase';
        if (visible && inReach()) { this.state='windup'; this.timer=this.cfg.windup; return; }
      } else if (this.state==='chase') {
        this.state='investigate';
        this.patrol=undefined;
      }
    }
    if (this.state==='idle' && !this.patrol) {
      if (this.timer>0) return;
      const forward=new Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
      this.patrol=this.grid.findWanderTarget(this.position,forward,this.cfg.patrolRadius,{
        desiredDistanceRatio:this.cfg.patrolDesiredDistanceRatio,
        distanceWeight:this.cfg.patrolDistanceWeight,
        openSpaceWeight:this.cfg.patrolOpenSpaceWeight,
        forwardWeight:this.cfg.patrolForwardWeight,
        randomWeight:this.cfg.patrolRandomWeight,
        clearanceRadius:this.cfg.patrolClearanceRadius
      });
      if (!this.patrol) { this.timer=this.cfg.wait; return; }
    }
    const goal=this.state==='idle' ? this.patrol : this.lastSeen;
    if (!goal) return;
    const before=this.position.clone();
    const result=this.agent.move(this.position,goal,this.state==='idle'?this.cfg.patrolSpeed:this.cfg.chaseSpeed,
      dt,this.state!=='idle');
    const delta=this.position.subtract(before);
    if (delta.x*delta.x+delta.z*delta.z>1e-8) this.yaw=Math.atan2(delta.x,delta.z);
    if (result==='arrived' && this.state==='investigate') {
      this.lastSeen=undefined;
      this.state='idle';
      this.patrol=undefined;
      this.timer=this.cfg.wait;
    } else if ((result==='arrived' || result==='blocked') && this.state==='idle') {
      this.patrol=undefined;
      this.timer=result==='arrived' ? this.cfg.wait : 0;
    }
  }
}
