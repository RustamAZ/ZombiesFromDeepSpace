import { defaultWeaponConfig, type WeaponConfig } from '../config';
import { CubeProjectile } from '../../projectiles/cubeProjectile/CubeProjectile';
import { cubeProjectileConfig } from '../../projectiles/cubeProjectile/config';
import type { ProjectileFactory } from '../../projectiles/Projectile';

export interface CubeBlasterConfig extends WeaponConfig {
  readonly createProjectile: ProjectileFactory;
}

export const cubeBlasterConfig: CubeBlasterConfig = {
  ...defaultWeaponConfig,
  damage: cubeProjectileConfig.damage,
  shotIntervalSeconds: 0.35,
  createProjectile: (direction,source) => new CubeProjectile(direction,source)
};
