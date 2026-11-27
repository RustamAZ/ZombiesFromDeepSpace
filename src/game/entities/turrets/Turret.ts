import type { Vector3 } from '@babylonjs/core';

export abstract class Turret {
  abstract readonly range: number;
  abstract readonly level: number;
  abstract readonly health: number;
  abstract readonly maxHealth: number;
  abstract readonly ammo: number;
  abstract readonly maxAmmo: number;
  abstract readonly isDestroyed: boolean;
  abstract readonly position: Readonly<Vector3>;
  abstract update(dt: number, timeSeconds: number): void;
  abstract tryFire(timeSeconds: number): boolean;
  abstract takeDamage(amount: number): void;
  abstract die(): void;
  abstract repair(amount: number): number;
  abstract reload(amount: number): number;
  abstract upgrade(): boolean;
}
