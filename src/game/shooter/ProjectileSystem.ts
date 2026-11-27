import { AbstractMesh, Color3, Mesh, MeshBuilder, Ray, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { EnemyTarget } from '../entities/enemies/Enemy';

export interface Impact {
  readonly damage: number;
  readonly penetration: number;
  readonly impactRadius: number;
  readonly forceDestruction?: boolean;
  readonly source?: EnemyTarget;
}

export interface ProjectileSpec extends Impact {
  readonly speedUnitsPerSecond: number;
  readonly cubeSize: number;
  readonly range: number;
}

type Projectile = {
  mesh: Mesh;
  direction: Vector3;
  remaining: number;
  spec: ProjectileSpec;
};

export class ProjectileSystem {
  private readonly active: Projectile[] = [];
  private readonly material: StandardMaterial;

  constructor(private readonly scene: Scene, private readonly hit: (
    mesh: AbstractMesh, point: Vector3, direction: Vector3, normal: Vector3, impact: Impact
  ) => void, private readonly onImpact:()=>void = () => {}) {
    this.material = new StandardMaterial('charge', scene);
    this.material.emissiveColor = Color3.FromHexString('#FFDB47');
  }

  firstHit(ray: Ray) {
    const hit = this.scene.pickWithRay(ray, mesh => mesh.isPickable && mesh.checkCollisions && mesh.isEnabled());
    return hit?.hit && hit.distance <= ray.length ? hit : null;
  }

  impactAlong(ray: Ray, impact: Impact): boolean {
    const hit = this.firstHit(ray);
    if (!hit?.pickedMesh || !hit.pickedPoint) return false;
    const normal = hit.getNormal(true, false) ?? ray.direction.negate();
    if (Vector3.Dot(normal, ray.direction) > 0) normal.negateInPlace();
    this.hit(hit.pickedMesh, hit.pickedPoint, ray.direction, normal, impact);
    this.onImpact();
    return true;
  }

  launch(origin: Vector3, direction: Vector3, spec: ProjectileSpec): void {
    const mesh = MeshBuilder.CreateBox('cube-charge', { size: spec.cubeSize }, this.scene);
    mesh.position.copyFrom(origin);
    mesh.material = this.material;
    mesh.isPickable = false;
    this.active.push({ mesh, direction, remaining: spec.range, spec });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const shot = this.active[i];
      const distance = Math.min(shot.remaining, shot.spec.speedUnitsPerSecond * dt);
      const ray = new Ray(shot.mesh.position, shot.direction, distance);
      if (!this.impactAlong(ray, shot.spec) && shot.remaining > distance) {
        shot.mesh.position.addInPlace(shot.direction.scale(distance));
        shot.mesh.rotation.z += dt * 6;
        shot.remaining -= distance;
        continue;
      }
      shot.mesh.dispose();
      this.active.splice(i, 1);
    }
  }
}
