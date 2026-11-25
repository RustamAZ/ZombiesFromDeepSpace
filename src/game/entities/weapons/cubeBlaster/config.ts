import { defaultWeaponConfig, type WeaponConfig } from '../config';

export interface CubeBlasterConfig extends WeaponConfig {
  readonly speedUnitsPerSecond: number;
  readonly range: number;
  readonly cubeSize: number;
  readonly impactRadius: number;
  readonly penetration: number;
}

export const cubeBlasterConfig: CubeBlasterConfig = {
  ...defaultWeaponConfig,
  damage: 12,
  shotIntervalSeconds: 0.35,
  speedUnitsPerSecond: 14,
  range: 40,
  cubeSize: 0.14,
  impactRadius: 0.8,
  penetration: 2
};
