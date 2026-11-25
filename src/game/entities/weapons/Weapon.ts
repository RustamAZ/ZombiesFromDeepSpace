import type { Ray } from '@babylonjs/core';
import type { WeaponConfig } from './config';

export interface ShotContext {
  readonly aimRay: Ray;
  readonly timeSeconds: number;
}

export abstract class Weapon<C extends WeaponConfig = WeaponConfig> {
  abstract readonly config: C;
  abstract tryFire(context: ShotContext): boolean;
}
