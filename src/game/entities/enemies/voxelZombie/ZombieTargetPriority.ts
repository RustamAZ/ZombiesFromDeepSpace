import type { EnemyTarget } from '../Enemy';
import { targetingConfig as cfg } from './targetingConfig';
export interface TargetContext {
  roomId:string|undefined;player:EnemyTarget;playerAvailable:boolean;playerDistance:number;
  turrets:readonly {target:EnemyTarget;armed:boolean;distance:number}[];
}
export class ZombieTargetPriority {
  private roomId?:string;
  private intent:'player'|'turrets'|'core'='core';
  private current?:EnemyTarget;
  private blocked?:EnemyTarget;
  constructor(private readonly core:EnemyTarget) {}
  get target():EnemyTarget { return this.blocked?.isAlive?this.blocked:this.current?.isAlive?this.current:this.core; }
  blockedBy(player:EnemyTarget):void { if(player.isAlive)this.blocked=player; }
  update(context:TargetContext):void {
    if(this.blocked && (!this.blocked.isAlive || context.playerDistance>cfg.blockedReleaseRange))this.blocked=undefined;
    const turrets=context.turrets.filter(t=>t.target.isAlive);
    if(context.roomId!==undefined && this.roomId!==context.roomId) {
      this.roomId=context.roomId;
      const weights=turrets.some(t=>t.armed)?cfg.armed:turrets.length?cfg.empty:cfg.none;
      const roll=Math.random();
      this.intent=roll<weights.player?(context.playerAvailable?'player':'core'):roll<weights.player+weights.turret?'turrets':'core';
      this.current=undefined;
    }
    if(this.intent==='turrets') {
      if(!this.current?.isAlive || !turrets.some(t=>t.target===this.current)) {
        this.current=[...turrets].sort((a,b)=>Number(b.armed)-Number(a.armed)||a.distance-b.distance)[0]?.target;
        if(!this.current){this.intent='core';this.current=this.core;}
      }
    } else this.current=this.intent==='player'&&context.player.isAlive?context.player:this.core;
  }
}
