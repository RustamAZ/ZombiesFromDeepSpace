import { playerConfig } from '../../player/config';
import { cubeBlasterConfig } from '../../weapons/cubeBlaster/config';
import { CubeProjectile } from '../../projectiles/cubeProjectile/CubeProjectile';
import { turretProjectileConfig } from '../../projectiles/cubeProjectile/config';
import { ExplosiveCubeProjectile } from '../../projectiles/explosiveCubeProjectile/ExplosiveCubeProjectile';
import type { ProjectileFactory } from '../../projectiles/Projectile';

export interface CubeTurretLevelConfig {
  readonly cost: number;
  readonly fireRateMultiplier: number;
  readonly headScale: number;
  readonly headHeight: number;
  readonly createProjectile: ProjectileFactory;
}

const levels: readonly CubeTurretLevelConfig[] = [
  { cost:0, fireRateMultiplier:1, headScale:1, headHeight:0.58,
    createProjectile:(direction,source)=>new CubeProjectile(direction,source,turretProjectileConfig) },
  { cost:15, fireRateMultiplier:0.8, headScale:1.35, headHeight:0.72,
    createProjectile:(direction,source)=>new ExplosiveCubeProjectile(direction,source) }
];

export const cubeTurretConfig = {
  autoFire: true,
  maxHealth: playerConfig.maxHealth,
  maxAmmo: 50,
  footprint: 1.25,
  startingAmmo: 30,
  repairAmount: 35,
  repairCostGold: 10,
  range: 13,
  targetRefreshSeconds: 0.15,
  turnRadiansPerSecond: 4.8,
  shotIntervalSeconds: cubeBlasterConfig.shotIntervalSeconds,
  levels
} as const;
