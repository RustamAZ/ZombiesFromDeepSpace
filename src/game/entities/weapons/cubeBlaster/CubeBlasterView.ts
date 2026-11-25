import { Camera, Color3, MeshBuilder, Scene, StandardMaterial, TransformNode } from '@babylonjs/core';

export class CubeBlasterView {
  readonly muzzle: TransformNode;
  private readonly root: TransformNode;
  private kick = 0;

  constructor(scene: Scene, camera: Camera) {
    this.root = new TransformNode('held-blaster', scene);
    this.root.parent = camera;
    this.root.rotation.y = -0.24;
    const part = (hex: string, x: number, y: number, z: number, width: number, height: number, depth: number) => {
      const mesh = MeshBuilder.CreateBox('blaster-part', { width, height, depth }, scene);
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      const mat = scene.getMaterialByName(hex) ?? new StandardMaterial(hex, scene);
      if (mat instanceof StandardMaterial) {
        mat.diffuseColor = Color3.FromHexString(hex);
        mat.specularColor = Color3.Black();
      }
      mesh.material = mat;
      mesh.renderingGroupId = 1;
      mesh.isPickable = false;
      return mesh;
    };
    part('#244353', 0, -0.09, 0, 0.15, 0.24, 0.18);
    part('#268F91', 0, 0, 0.07, 0.23, 0.18, 0.43);
    part('#EFD98F', 0, 0.073, 0.04, 0.24, 0.06, 0.26);
    const barrel = part('#DB603F', 0, 0.01, 0.31, 0.2, 0.18, 0.12);
    this.muzzle = new TransformNode('cube-blaster-muzzle', scene);
    this.muzzle.parent = barrel;
    this.muzzle.position.z = barrel.getBoundingInfo().boundingBox.maximum.z;
    part('#244353', 0, 0.1, 0.2, 0.065, 0.06, 0.075);
    part('#FFE15A', 0, 0.135, 0.2, 0.04, 0.02, 0.05);
  }

  fired(): void { this.kick = 1; }

  update(dt: number, aspect: number): void {
    this.kick = Math.max(0, this.kick - dt * 7);
    this.root.position.set(Math.min(0.31, aspect * 0.21), -0.25, 0.54 - this.kick * 0.065);
    this.root.rotation.x = -this.kick * 0.08;
  }
}
