import { Weapon, type ShotContext } from '../Weapon';
import { cubeBlasterConfig } from './config';
import type { ProjectileSpawner } from '../../../shooter/ProjectileSpawner';

export class CubeBlaster extends Weapon<typeof cubeBlasterConfig> {
  private nextShotTime = 0;

  constructor(private readonly spawner: ProjectileSpawner, readonly config = cubeBlasterConfig) {
    super();
  }

  tryFire(context: ShotContext): boolean {
    if (context.timeSeconds < this.nextShotTime) return false;
    this.spawner.spawn(context.aimRay, this.config.createProjectile);
    this.nextShotTime = context.timeSeconds + this.config.shotIntervalSeconds;
    return true;
  }
}
