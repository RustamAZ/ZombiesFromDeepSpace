import { MeshBuilder, Vector3, type Mesh, type Scene, type StandardMaterial } from '@babylonjs/core';
import type { BurstEffect } from './Projectile';

export class ProjectileEffects {
  private readonly fragments: {mesh: Mesh; velocity: Vector3; left: number; duration: number}[] = [];

  constructor(private readonly scene: Scene, private readonly material: StandardMaterial) {}

  burst(point: Vector3, effect: BurstEffect): void {
    for (let i = 0; i < effect.count; i++) {
      const mesh = MeshBuilder.CreateBox('charge-fragment', { size: effect.cubeSize }, this.scene);
      mesh.material = this.material;
      mesh.position.copyFrom(point);
      mesh.isPickable = false;
      const velocity = new Vector3(Math.random()-0.5, Math.random()-0.4, Math.random()-0.5)
        .normalize().scaleInPlace(effect.speed*(0.4+Math.random()*0.6));
      this.fragments.push({mesh, velocity, left: effect.lifetimeSeconds, duration: effect.lifetimeSeconds});
    }
  }

  update(dt: number): void {
    for (let i = this.fragments.length-1; i >= 0; --i) {
      const fragment = this.fragments[i];
      fragment.left -= dt;
      if (fragment.left <= 0) {
        fragment.mesh.dispose();
        this.fragments.splice(i, 1);
        continue;
      }
      fragment.velocity.y -= 9.8*dt;
      fragment.mesh.position.addInPlace(fragment.velocity.scale(dt));
      fragment.mesh.scaling.setAll(fragment.left/fragment.duration);
    }
  }
}
