import { Vector3 } from '@babylonjs/core';

export type VoxelWorldBounds = {
  min: Vector3;
  max: Vector3;
};

export type VoxelMaterialType = 'soft' | 'normal' | 'hard';

export type VoxelContactInfo = {
  projectileSurfaceNormal: Vector3;
  contactPoint: Vector3;
  penetration: number;
  depth: number;
};

export type VoxelDamageCandidate = {
  voxelId: number;
  worldPosition: Vector3;
  depth01: number;
  impactStrength: number;
};

export type VoxelDamageEntry = {
  voxelId: number;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
};

export type VoxelDamagePlan = {
  removedVoxelIds: number[];
  debrisEntries: VoxelDamageEntry[];
};
