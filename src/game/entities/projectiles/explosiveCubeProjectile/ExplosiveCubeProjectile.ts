import type { Vector3 } from '@babylonjs/core';
import type { EnemyTarget } from '../../enemies/Enemy';
import { Projectile, type ProjectileContact, type ProjectileImpactContext } from '../Projectile';
import { explosiveCubeConfig } from './config';

export class ExplosiveCubeProjectile extends Projectile {
  constructor(readonly direction: Vector3, readonly source?: EnemyTarget, readonly config = explosiveCubeConfig) {
    super();
  }

  get effect() { return this.config.effect; }

  onImpact(contact: ProjectileContact, context: ProjectileImpactContext): void {
    const impact = { ...this.config, source: this.source };
    const targets = context.targetsInBlast(contact, this.config.blastRadius);
    context.worldHit(contact, impact);
    for (const target of targets) target.hit(impact);
    context.burst(contact.point, this.effect);
  }
}
