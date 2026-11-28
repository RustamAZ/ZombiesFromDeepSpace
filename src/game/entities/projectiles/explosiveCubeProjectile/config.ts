import type { BurstEffect, ProjectileConfig } from '../Projectile';
import { turretProjectileConfig } from '../cubeProjectile/config';

export interface ExplosiveCubeConfig extends ProjectileConfig {
  readonly blastRadius: number;
  readonly effect: BurstEffect;
}

export const explosiveCubeConfig: ExplosiveCubeConfig = {
  ...turretProjectileConfig,
  cubeSize: 0.25,
  blastRadius: 2,
  effect: { count: 12, cubeSize: 0.09, speed: 5, lifetimeSeconds: 0.3 }
};
