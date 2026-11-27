import type { AbstractMesh, Vector3 } from '@babylonjs/core';
import type { VoxelMaterialType } from '../voxel/VoxelImpact';

export type EnemyState = 'idle'|'chase'|'investigate'|'windup'|'recovery'|'dead';
export interface EnemyConfig {
  material: VoxelMaterialType; maxHealth: number; damage: number;
  patrolRadius: number; patrolSpeed: number; chaseSpeed: number;
  personalSpaceRadius: number;
  patrolDesiredDistanceRatio: number; patrolDistanceWeight: number;
  patrolOpenSpaceWeight: number; patrolForwardWeight: number;
  patrolRandomWeight: number; patrolClearanceRadius: number;
  sightRange: number; sightAngle: number; proximityAwarenessRadius: number;
  alertedHearingRadius: number; attackRange: number;
  windup: number; recovery: number; wait: number; thinkInterval: number;
  attackVisualRecovery?:number; hitSlowFactor?:number;
}
export interface EnemyTarget {
  feet: Vector3; eyes: Vector3;
  visibilityHeight: number; visibilityRadius: number;
  isAlive: boolean;
  takeDamage(amount: number): void;
}
export abstract class Enemy {
  abstract readonly config: EnemyConfig;
  abstract get state(): EnemyState;
  abstract get deathComplete(): boolean;
  abstract get aimPoint(): Vector3;
  abstract ownsMesh(mesh: AbstractMesh): boolean;
  abstract get debug(): { position:Vector3; route:readonly Vector3[]; lastSeen?:Vector3; strikePoint?:Vector3 };
  abstract update(dt: number, target: EnemyTarget): void;
}
