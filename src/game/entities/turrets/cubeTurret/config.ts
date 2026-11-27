import { playerConfig } from '../../player/config';
import { cubeBlasterConfig } from '../../weapons/cubeBlaster/config';

export const cubeTurretConfig = {
  autoFire: true,
  maxHealth: playerConfig.maxHealth,
  maxAmmo: 50,
  startingAmmo: 30,
  repairAmount: 35,
  repairCostGold: 10,
  range: 13,
  turnRadiansPerSecond: 4.8,
  shotIntervalSeconds: cubeBlasterConfig.shotIntervalSeconds,
  damage: 14,
  projectileSpeedUnitsPerSecond: 18,
  projectileRange: 18,
  projectileCubeSize: 0.13,
  impactRadius: 0.55,
  penetration: 1
} as const;
