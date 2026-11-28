import type { Vector3 } from '@babylonjs/core';
import type { EnemyTarget } from '../../enemies/Enemy';
import { Projectile, type ProjectileContact, type ProjectileImpactContext } from '../Projectile';
import { cubeProjectileConfig } from './config';

export class CubeProjectile extends Projectile {
  readonly effect = undefined;

  constructor(readonly direction: Vector3, readonly source?: EnemyTarget, readonly config = cubeProjectileConfig) {
    super();
  }

  onImpact(contact: ProjectileContact, context: ProjectileImpactContext): void {
    context.directHit(contact, { ...this.config, source: this.source });
  }
}
