import type { Vector3 } from '@babylonjs/core';
import type { EnemyTarget } from '../Enemy';
import { zombieConfig } from './config';

export class ZombieTargetPriority {
  private retaliateAgainst?: EnemyTarget;
  private remainingSeconds = 0;
  private playerWasInsideProximity = false;

  constructor(private readonly core: EnemyTarget) {}

  get target(): EnemyTarget {
    return this.remainingSeconds>0 && this.retaliateAgainst?.isAlive ? this.retaliateAgainst : this.core;
  }

  hitBy(source: EnemyTarget | undefined): void {
    if (source?.isAlive && Math.random()<zombieConfig.retaliationChance) {
      this.retaliateAgainst=source;
      this.remainingSeconds=zombieConfig.retaliationSeconds;
    }
  }

  blockedBy(player:EnemyTarget):void {
    if (!player.isAlive) return;
    this.retaliateAgainst=player;
    this.remainingSeconds=zombieConfig.retaliationSeconds;
  }

  checkPlayerProximity(player: EnemyTarget, zombiePosition: Vector3): void {
    const delta=player.feet.subtract(zombiePosition);
    const inside=player.isAlive && delta.x*delta.x+delta.z*delta.z<=
      zombieConfig.proximityAggroRadius*zombieConfig.proximityAggroRadius;
    if (inside && !this.playerWasInsideProximity && Math.random()<zombieConfig.proximityAggroChance) {
      this.retaliateAgainst=player;
      this.remainingSeconds=zombieConfig.retaliationSeconds;
    }
    if (inside && this.retaliateAgainst===player)
      this.remainingSeconds=Math.max(this.remainingSeconds,zombieConfig.retaliationSeconds);
    this.playerWasInsideProximity=inside;
  }

  update(dt: number): void {
    this.remainingSeconds=Math.max(0,this.remainingSeconds-dt);
    if (!this.retaliateAgainst?.isAlive) this.retaliateAgainst=undefined;
  }
}
