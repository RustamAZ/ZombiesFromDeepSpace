import { Color3, Mesh, MeshBuilder, Ray, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Projectile, ProjectileImpactContext } from '../entities/projectiles/Projectile';
import { ProjectileEffects } from '../entities/projectiles/ProjectileEffects';
import type { ProjectileFrameStats } from '../navigation/NavigationFrameStats';

type Flight = {
  mesh: Mesh;
  remaining: number;
  projectile: Projectile;
};

export class ProjectileSystem {
  private readonly active: Flight[] = [];
  private readonly material: StandardMaterial;
  private readonly effects: ProjectileEffects;
  private readonly impactContext: ProjectileImpactContext;

  constructor(private readonly scene: Scene, world: Omit<ProjectileImpactContext,'burst'>,
    private readonly onImpact:()=>void = () => {},
    private readonly getStats?:()=>ProjectileFrameStats|undefined) {
    this.material = new StandardMaterial('charge', scene);
    this.material.emissiveColor = Color3.FromHexString('#FFDB47');
    this.effects = new ProjectileEffects(scene, this.material);
    this.impactContext = { ...world, burst: (point,effect) => {
      const stats=this.getStats?.(), start=stats ? performance.now() : 0;
      this.effects.burst(point,effect);
      if(stats) stats.effectsMs+=performance.now()-start;
    } };
  }

  firstHit(ray: Ray) {
    const stats=this.getStats?.(), start=stats ? performance.now() : 0;
    const hit = this.scene.pickWithRay(ray, mesh => mesh.isPickable && mesh.checkCollisions && mesh.isEnabled());
    if(stats) {
      stats.collisionMs+=performance.now()-start;
      ++stats.checks;
    }
    return hit?.hit && hit.distance <= ray.length ? hit : null;
  }

  impactAlong(ray: Ray, projectile: Projectile): boolean {
    const hit = this.firstHit(ray);
    if (!hit?.pickedMesh || !hit.pickedPoint) return false;
    const stats=this.getStats?.(), start=stats ? performance.now() : 0, effectsBefore=stats?.effectsMs ?? 0;
    const normal = hit.getNormal(true, false) ?? ray.direction.negate();
    if (Vector3.Dot(normal, ray.direction) > 0) normal.negateInPlace();
    projectile.onImpact({mesh:hit.pickedMesh,point:hit.pickedPoint,direction:ray.direction,normal}, this.impactContext);
    this.onImpact();
    if(stats) {
      // Burst creation is nested inside onImpact and is already charged to effects.
      stats.impactMs+=performance.now()-start-(stats.effectsMs-effectsBefore);
      ++stats.hits;
    }
    return true;
  }

  launch(origin: Vector3, projectile: Projectile): void {
    const mesh = MeshBuilder.CreateBox('cube-charge', { size: projectile.config.cubeSize }, this.scene);
    mesh.position.copyFrom(origin);
    mesh.material = this.material;
    mesh.isPickable = false;
    this.active.push({ mesh, remaining: projectile.config.range, projectile });
  }

  update(dt: number): void {
    const stats=this.getStats?.(), start=stats ? performance.now() : 0;
    this.effects.update(dt);
    if(stats) {
      stats.effectsMs+=performance.now()-start;
      stats.active=this.active.length;
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const shot = this.active[i];
      const { projectile } = shot;
      const distance = Math.min(shot.remaining, projectile.config.speedUnitsPerSecond * dt);
      const ray = new Ray(shot.mesh.position, projectile.direction, distance);
      if (!this.impactAlong(ray, projectile) && shot.remaining > distance) {
        shot.mesh.position.addInPlace(projectile.direction.scale(distance));
        shot.mesh.rotation.z += dt * 6;
        shot.remaining -= distance;
        continue;
      }
      shot.mesh.dispose();
      this.active.splice(i, 1);
    }
  }
}
