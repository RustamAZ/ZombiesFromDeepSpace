import { BoundingInfo, Color3, Matrix, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import '@babylonjs/core/Meshes/thinInstanceMesh';

// Only visual cubes use this buffer. A slot can move when another cube is evicted.
export class BatchedDebrisCube {
  readonly position: Vector3;
  readonly rotation: Vector3;
  readonly scaling: Vector3;
  private readonly bounds = new BoundingInfo(new Vector3(-0.5,-0.5,-0.5), new Vector3(0.5,0.5,0.5));
  private readonly orientation = Quaternion.Identity();
  private readonly size = Vector3.One();
  private readonly matrix = Matrix.Identity();

  constructor(private readonly batch: DebrisCubeBatch, public slot: number, position: Vector3,
    private readonly side: number, source?: Mesh) {
    this.position = position.clone();
    this.rotation = source?.rotationQuaternion?.toEulerAngles() ?? source?.rotation.clone() ?? Vector3.Zero();
    this.scaling = source?.scaling.clone() ?? Vector3.One();
  }

  computeWorldMatrix(_force?: boolean): Matrix {
    Quaternion.FromEulerAnglesToRef(this.rotation.x,this.rotation.y,this.rotation.z,this.orientation);
    this.scaling.scaleToRef(this.side,this.size);
    Matrix.ComposeToRef(this.size,this.orientation,this.position,this.matrix);
    this.bounds.update(this.matrix);
    this.batch.write(this.slot,this.matrix);
    return this.matrix;
  }

  getBoundingInfo(): BoundingInfo { return this.bounds; }
  dispose(): void { this.batch.remove(this.slot); }
}

export class DebrisCubeBatch {
  private static readonly scenes = new WeakMap<Scene,DebrisCubeBatch>();
  private readonly mesh: Mesh;
  private readonly cubes: BatchedDebrisCube[] = [];
  private matrices = new Float32Array(64 * 16);
  private colors = new Float32Array(64 * 4);
  private resize = true;
  private matricesDirty = false;
  private colorsDirty = false;

  static forScene(scene: Scene): DebrisCubeBatch {
    let batch = this.scenes.get(scene);
    if (!batch) {
      batch = new DebrisCubeBatch(scene);
      this.scenes.set(scene,batch);
    }
    return batch;
  }

  private constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateBox('visual-debris-cubes',{size:1},scene);
    const material = new StandardMaterial('visual-debris-material',scene);
    material.specularColor.setAll(0.04);
    this.mesh.material = material;
    this.mesh.isPickable = this.mesh.checkCollisions = false;
    this.mesh.metadata = {voxelDebris:true, batchedDebris:true};
    // The source is at the origin, but the instances have world-space transforms.
    this.mesh.alwaysSelectAsActiveMesh = this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.setEnabled(false);
    scene.onBeforeRenderObservable.add(() => this.flush());
  }

  add(position: Vector3, side: number, color: Color3, source?: Mesh): BatchedDebrisCube {
    const slot = this.cubes.length;
    if (slot * 16 === this.matrices.length) {
      const matrices = new Float32Array(this.matrices.length * 2);
      matrices.set(this.matrices);
      this.matrices = matrices;
      const colors = new Float32Array(this.colors.length * 2);
      colors.set(this.colors);
      this.colors = colors;
      this.resize = true;
    }
    const cube = new BatchedDebrisCube(this,slot,position,side,source);
    this.cubes.push(cube);
    color.toArray(this.colors,slot * 4);
    this.colors[slot * 4 + 3] = 1;
    this.colorsDirty = true;
    cube.computeWorldMatrix();
    return cube;
  }

  write(slot: number, matrix: Matrix): void {
    matrix.copyToArray(this.matrices,slot * 16);
    this.matricesDirty = true;
  }

  remove(slot: number): void {
    const last = this.cubes.pop()!;
    if (slot !== this.cubes.length) {
      this.matrices.copyWithin(slot * 16,last.slot * 16,last.slot * 16 + 16);
      this.colors.copyWithin(slot * 4,last.slot * 4,last.slot * 4 + 4);
      this.cubes[slot] = last;
      last.slot = slot;
      this.colorsDirty = true;
    }
    this.matricesDirty = true;
  }

  private flush(): void {
    if (!this.matricesDirty) return;
    const count = this.cubes.length;
    if (this.resize) {
      this.mesh.thinInstanceSetBuffer('matrix',this.matrices,16,false);
      this.mesh.thinInstanceSetBuffer('color',this.colors,4,false);
      this.resize = false;
    } else if (count) {
      this.mesh.thinInstanceCount = count;
      this.mesh.thinInstanceBufferUpdated('matrix');
      if (this.colorsDirty) this.mesh.thinInstanceBufferUpdated('color');
    }
    this.mesh.thinInstanceCount = count;
    this.mesh.setEnabled(count > 0);
    this.matricesDirty = this.colorsDirty = false;
  }
}
