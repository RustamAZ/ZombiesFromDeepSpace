import type { ShotContext, Weapon } from './Weapon';

export class WeaponSlot {
  private current: Weapon | null = null;

  equip(weapon: Weapon | null): void {
    this.current = weapon;
  }

  tryFire(context: ShotContext): boolean {
    return this.current?.tryFire(context) ?? false;
  }
}
