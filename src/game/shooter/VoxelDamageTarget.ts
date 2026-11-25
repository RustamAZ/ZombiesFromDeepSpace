import { Vector3 } from '@babylonjs/core';
import { VoxelImpactMaterialController } from '../entities/voxel/VoxelImpactMaterialController';
import type { VoxelContactInfo, VoxelMaterialType } from '../entities/voxel/VoxelImpact';
import type { VoxelModel } from '../entities/voxel/VoxelModel';
import type { Impact } from './ProjectileSystem';
import { VoxelLayerResolver } from '../entities/voxel/VoxelLayerResolver';

export class VoxelDamageTarget {
  private readonly layers = new VoxelImpactMaterialController();
  private readonly bounds;

  constructor(readonly model: VoxelModel, private readonly material: VoxelMaterialType, floorY?: number) {
    if (floorY === undefined) {
      const layers = new VoxelLayerResolver();
      model.enableCoreSupport(depth => !layers.getLayer(material,depth).destructible);
    } else {
      model.enableFloorSupport(floorY);
      this.bounds = model.getWorldBounds();
    }
  }

  hit(point: Vector3, normal: Vector3, impact: Impact): boolean {
    const radius = impact.impactRadius;
    if (!this.model.hasIntactVoxels()) return false;
    const bounds = this.bounds ?? this.model.getWorldBounds();
    if (Vector3.DistanceSquared(point, Vector3.Clamp(point, bounds.min, bounds.max)) > radius * radius) return false;
    const extent = new Vector3(radius, radius, radius);
    const overlapBounds = { min: point.subtract(extent), max: point.add(extent) };
    const candidates = this.model.getDamageCandidates(overlapBounds)
      .filter(candidate => Vector3.DistanceSquared(candidate.worldPosition, point) <= radius * radius);
    const contact: VoxelContactInfo = {
      contactPoint: point, projectileSurfaceNormal: normal, penetration: impact.penetration, depth: radius
    };
    const request = { contact, candidates, material: this.material };
    const destructible=impact.forceDestruction ? candidates : this.layers.getDestructibleCandidates(request);
    const direct = destructible
      .sort((a, b) => Vector3.DistanceSquared(a.worldPosition, point) - Vector3.DistanceSquared(b.worldPosition, point))
      .slice(0, Math.max(0, Math.floor(impact.damage)));
    if (!direct.length) return false;
    const groups = this.model.getUnsupportedGroups(direct);
    const plan = this.layers.createDamagePlan(request, direct);
    return this.model.applyDamagePlan(plan, groups, groups.length);
  }
}
