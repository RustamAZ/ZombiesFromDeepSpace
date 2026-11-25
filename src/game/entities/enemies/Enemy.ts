import type { Vector3 } from '@babylonjs/core';
import type { VoxelMaterialType } from '../voxel/VoxelImpact';

export type EnemyState = 'idle'|'chase'|'investigate'|'windup'|'recovery'|'dead';
export interface EnemyConfig {
  material: VoxelMaterialType; lethalLoss: number; damage: number;
  patrolRadius: number; patrolSpeed: number; chaseSpeed: number;
  patrolDesiredDistanceRatio: number; patrolDistanceWeight: number;
  patrolOpenSpaceWeight: number; patrolForwardWeight: number;
  patrolRandomWeight: number; patrolClearanceRadius: number;
  sightRange: number; sightAngle: number; proximityAwarenessRadius: number;
  alertedHearingRadius: number; attackRange: number;
  windup: number; recovery: number; wait: number; thinkInterval: number;
}
export interface EnemyTarget {
  feet: Vector3; eyes: Vector3;
  visibilityHeight: number; visibilityRadius: number;
  takeDamage(amount: number): void;
}
export abstract class Enemy {
  abstract readonly config: EnemyConfig;
  abstract get state(): EnemyState;
  abstract get debug(): { position:Vector3; route:readonly Vector3[]; lastSeen?:Vector3; strikePoint?:Vector3 };
  abstract update(dt: number, target: EnemyTarget): void;
}
