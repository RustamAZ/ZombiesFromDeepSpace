import type { AbstractMesh, Vector3 } from '@babylonjs/core';
import type { EnemyTarget } from '../enemies/Enemy';

export interface Impact {
  readonly damage: number;
  readonly penetration: number;
  readonly impactRadius: number;
  readonly forceDestruction?: boolean;
  readonly source?: EnemyTarget;
}

export interface ProjectileConfig extends Impact {
  readonly speedUnitsPerSecond: number;
  readonly cubeSize: number;
  readonly range: number;
}

export interface ProjectileContact {
  readonly mesh: AbstractMesh;
  readonly point: Vector3;
  readonly direction: Vector3;
  readonly normal: Vector3;
}

export interface BurstEffect {
  readonly count: number;
  readonly cubeSize: number;
  readonly speed: number;
  readonly lifetimeSeconds: number;
}

export interface ProjectileImpactContext {
  directHit(contact: ProjectileContact, impact: Impact): void;
  worldHit(contact: ProjectileContact, impact: Impact): void;
  targetsInBlast(contact: ProjectileContact, radius: number): readonly BlastTarget[];
  burst(point: Vector3, effect: BurstEffect): void;
}

export interface BlastTarget {
  hit(impact: Impact): void;
}

export abstract class Projectile {
  abstract readonly direction: Vector3;
  abstract readonly config: ProjectileConfig;
  abstract readonly source?: EnemyTarget;
  abstract readonly effect?: BurstEffect;
  abstract onImpact(contact: ProjectileContact, context: ProjectileImpactContext): void;
}

export type ProjectileFactory = (direction: Vector3, source?: EnemyTarget) => Projectile;
