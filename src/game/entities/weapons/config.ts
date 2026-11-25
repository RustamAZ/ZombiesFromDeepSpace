export interface WeaponConfig {
  readonly damage: number;
  readonly shotIntervalSeconds: number;
}

export const defaultWeaponConfig: WeaponConfig = {
  damage: 1,
  shotIntervalSeconds: 0.25
};
