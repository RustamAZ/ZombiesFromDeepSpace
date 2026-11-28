import type { EnemyTarget } from '../Enemy';
import { Vector3 } from '@babylonjs/core';
import { targetingConfig as cfg } from './targetingConfig';
export interface RoomTurret { target:EnemyTarget; readonly armed:boolean; position:Vector3 }
export interface TargetContext {
  roomId:string|undefined; player:EnemyTarget; position:Vector3; turrets:readonly RoomTurret[];
  canReach(point:Vector3):boolean|undefined;
}
export class ZombieTargetPriority {
  private roomId?:string;
  private intent:'player'|'turrets'|'core'='core';
  private current?:EnemyTarget;
  private blocked?:EnemyTarget;
  constructor(private readonly core:EnemyTarget) { this.current=core; }
  resolve(distanceSquared:number):EnemyTarget {
    if(this.blocked && (!this.blocked.isAlive || distanceSquared>cfg.blockedReleaseRange**2))this.blocked=undefined;
    return this.blocked ?? (this.current?.isAlive ? this.current : this.core);
  }
  blockedBy(player:EnemyTarget):void { if(player.isAlive)this.blocked=player; }
  update(context:TargetContext):void {
    if(context.roomId===undefined)return;
    const turrets=context.turrets;
    if(this.roomId!==context.roomId) {
      this.roomId=context.roomId;
      const weights=turrets.some(t=>t.target.isAlive && t.armed)?cfg.armed:
        turrets.some(t=>t.target.isAlive)?cfg.empty:cfg.none;
      const roll=Math.random();
      this.intent=roll<weights.player?'player':roll<weights.player+weights.turret?'turrets':'core';
      this.current=undefined;
    }
    if(this.intent==='core' || this.current?.isAlive)return;
    if(this.intent==='player') {
      if(context.player.isAlive && context.canReach(context.player.feet))this.current=context.player;
      return;
    }
    let best:RoomTurret|undefined, bestDistance=Infinity, pending=false;
    for(const turret of turrets) {
      if(!turret.target.isAlive || (best?.armed && !turret.armed))continue;
      const distance=Vector3.DistanceSquared(context.position,turret.position);
      if(best && turret.armed===best.armed && distance>=bestDistance)continue;
      const reachable=context.canReach(turret.position);
      if(reachable===undefined)pending=true;
      if(reachable){best=turret;bestDistance=distance;}
    }
    if(best)this.current=best.target;
    else if(!pending)this.intent='core';
  }
}
