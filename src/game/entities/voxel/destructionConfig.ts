import type { VoxelMaterialType } from './VoxelImpact';

export const shooterDebrisConfig = {
  maxBodies: 100,
  maxBodiesPerImpact: 24,
  maxCompoundBoxes: 24,
  fallbackGravity: 12,
  fallbackAirDamping: 0.8,
  fallbackGroundDamping: 8,
  fallbackAngularDamping: 5,
  fallbackSettleSpeed: 0.04,
  looseHitKickSpeed: 4.8,
  detachedSplitSpeed: 0.85,
  detachedLiftSpeed: 0.18,
  detachedSpinSpeed: 0.9,
  detachedFractureMinLength: 9,
  detachedFractureDebrisCount: 5,
  detachedFractureSpeed: 1.15,
  detachedFractureSpin: 2.2
} as const;

export const projectileDebrisResponse = {
  soft:   { launchSpeed: 6.8, spread: 1.3, spin: 5 },
  normal: { launchSpeed: 5.8, spread: 1.1, spin: 7 },
  hard:   { launchSpeed: 6.4, spread: 0.95, spin: 9 }
} as const satisfies Record<VoxelMaterialType, {
  launchSpeed: number; spread: number; spin: number;
}>;
