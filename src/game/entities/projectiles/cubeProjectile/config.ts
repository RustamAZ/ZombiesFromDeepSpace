import type { ProjectileConfig } from '../Projectile';

export const cubeProjectileConfig: ProjectileConfig = {
  damage: 12, speedUnitsPerSecond: 14, range: 40, cubeSize: 0.14,
  impactRadius: 0.8, penetration: 2
};

export const turretProjectileConfig: ProjectileConfig = {
  damage: 14, speedUnitsPerSecond: 18, range: 18, cubeSize: 0.13,
  impactRadius: 0.55, penetration: 1
};
