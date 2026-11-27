import { Ray, TransformNode, Vector3 } from '@babylonjs/core';
import type { ProjectileSpec, ProjectileSystem } from './ProjectileSystem';
import type { EnemyTarget } from '../entities/enemies/Enemy';

export class ProjectileSpawner {
  constructor(private readonly muzzle: TransformNode, private readonly projectiles: ProjectileSystem,
    private readonly source?: EnemyTarget) {}

  spawn(aim: Ray, spec: ProjectileSpec): void {
    spec={...spec,source:this.source};
    const origin = this.muzzle.computeWorldMatrix(true).getTranslation();
    const toMuzzle = origin.subtract(aim.origin);
    const distance = toMuzzle.length();
    // The first-person weapon can be drawn over a wall even when the muzzle is inside it.
    if (distance > 0 && this.projectiles.impactAlong(new Ray(aim.origin, toMuzzle.scale(1 / distance), distance), spec)) {
      return;
    }

    const sight = new Ray(aim.origin, aim.direction, spec.range);
    const target = this.projectiles.firstHit(sight)?.pickedPoint ?? aim.origin.add(aim.direction.scale(spec.range));
    const toTarget = target.subtract(origin);
    const direction = Vector3.Dot(toTarget, aim.direction) > 0 ? toTarget.normalize() : aim.direction.clone();
    this.projectiles.launch(origin, direction, spec);
  }
}
