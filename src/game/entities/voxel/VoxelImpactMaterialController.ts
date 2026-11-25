import { Vector3 } from '@babylonjs/core';
import type { VoxelContactInfo, VoxelDamageCandidate, VoxelDamagePlan, VoxelMaterialType } from './VoxelImpact';
import { VoxelLayerResolver } from './VoxelLayerResolver';
import { projectileDebrisResponse } from './destructionConfig';

type VoxelDamageRequest = {
  contact: VoxelContactInfo;
  candidates: VoxelDamageCandidate[];
  material: VoxelMaterialType;
};

export class VoxelImpactMaterialController {
  constructor(private readonly layerResolver = new VoxelLayerResolver()) {}

  getDestructibleCandidates({ candidates, contact, material }: VoxelDamageRequest): VoxelDamageCandidate[] {
    return candidates.filter(candidate => {
      const layer = this.layerResolver.getLayer(material, candidate.depth01);
      return layer.destructible && contact.penetration * candidate.impactStrength >= layer.breakSpeedRatio;
    });
  }

  createDamagePlan({ contact, material }: VoxelDamageRequest, direct: readonly VoxelDamageCandidate[]): VoxelDamagePlan {
    const normal = contact.projectileSurfaceNormal;
    const response = projectileDebrisResponse[material];
    return {
      removedVoxelIds: direct.map(candidate => candidate.voxelId),
      debrisEntries: direct.map(candidate => {
        const layer = this.layerResolver.getLayer(material, candidate.depth01);
        const strength = Math.min(1, Math.max(0, (contact.penetration * candidate.impactStrength - layer.breakSpeedRatio)
          / Math.max(0.001, 1 - layer.breakSpeedRatio)));
        const offset = candidate.worldPosition.subtract(contact.contactPoint).scaleInPlace(1 / Math.max(contact.depth, 0.001));
        const jitter = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        const fan = offset.add(jitter.scale(0.25));
        fan.subtractInPlace(normal.scale(Vector3.Dot(fan, normal)));
        const launch = fan.scale(response.spread).addInPlace(normal.scale(0.8));
        launch.y += 0.25;
        const speed = response.launchSpeed * layer.scatterMultiplier * (0.55 + 0.45 * strength)
          * (1 - 0.35 * Math.min(1, offset.length())) * (0.85 + 0.3 * Math.random());
        return { voxelId: candidate.voxelId, linearVelocity: launch.normalize().scaleInPlace(speed),
          angularVelocity: jitter.scale(response.spin * 2) };
      })
    };
  }
}
