import { type AbstractMesh, Color3, Color4, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { SolidParticleSystem } from '@babylonjs/core/Particles/solidParticleSystem';
import type { SolidParticle } from '@babylonjs/core/Particles/solidParticle';
import { VoxelDebrisController } from './VoxelDebrisController';
import { BatchedDebrisCube, DebrisCubeBatch } from './DebrisCubeBatch';
import { findUnsupportedGroups, fractureConnectedGroup } from './VoxelStructure';
import { createVoxelSolidBody } from './VoxelSolidBody';
import { buildRigidVoxelFragment } from './RigidVoxelFragment';
import { shooterDebrisConfig } from './destructionConfig';
import type { VoxelDamageCandidate, VoxelDamageEntry, VoxelDamagePlan, VoxelWorldBounds } from './VoxelImpact';
import { defaultVoxPalette, parseVox, type ParsedVoxModel } from './VoxAsset';

type Debris = {
  mesh: Mesh | BatchedDebrisCube;
  aggregate?: Pick<PhysicsAggregate, 'body' | 'dispose'>;
  mass: number;
  fallbackVelocity?: Vector3;
  fallbackAngularVelocity?: Vector3;
};

type VoxelPiece = {
  id: number;
  localPosition: Vector3;
  restLocalPosition: Vector3;
  colorIndex: number;
  particleIndex: number;
  gridX: number;
  gridY: number;
  gridZ: number;
  gridKey: number;
  chunkKey: string;
  isActive: boolean;
  depth01: number;
};

type RawVoxelPiece = {
  localPosition: Vector3;
  colorIndex: number;
  gridX: number;
  gridY: number;
  gridZ: number;
};

type VoxelChunk = {
  particles: SolidParticleSystem;
  mesh: Mesh;
  activeCount: number;
};

const faceOffsets = [
  [-1, 0, 0], [1, 0, 0], [0, -1, 0],
  [0, 1, 0], [0, 0, -1], [0, 0, 1]
] as const;

export class VoxelModel {
  private readonly root: TransformNode;
  private readonly debris: Debris[] = [];
  private readonly materials = new Map<number, StandardMaterial>();
  private readonly localMin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  private readonly localMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  private readonly chunkSize = 24;

  private pieces: VoxelPiece[] = [];
  private readonly piecesById = new Map<number, VoxelPiece>();
  private readonly piecesByGridKey = new Map<number, VoxelPiece>();
  private readonly chunks = new Map<string, VoxelChunk>();
  private intactMaterial: StandardMaterial | null = null;
  private palette: Color3[] = defaultVoxPalette;
  private nextPieceId = 1;
  private activePieceCount = 0;
  private gridSizeX = 1;
  private gridSizeY = 1;
  private gridSizeZ = 1;
  private gridOrigin = Vector3.Zero();
  private floorAnchors?: VoxelPiece[];
  private blastShell?: VoxelPiece[];
  private solidBody?: ReturnType<typeof createVoxelSolidBody>;
  private hasLocalDeformation = false;
  private debrisFloorY = 0;

  private constructor(
    private readonly scene: Scene,
    private readonly voxelSize: number,
    private readonly debrisController: VoxelDebrisController,
    position: Vector3,
    private rotationY: number
  ) {
    this.root = new TransformNode('voxel-model-root', scene);
    this.root.position = position;
    this.root.rotation.y = rotationY;
  }

  static async load(
    scene: Scene,
    url: string,
    position: Vector3,
    debrisController: VoxelDebrisController,
    voxelSize = 0.05,
    rotationY = 0
  ): Promise<VoxelModel> {
    if (!url.toLowerCase().endsWith('.vox')) {
      throw new Error(`Unsupported voxel model format: ${url}`);
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const parsed = parseVox(buffer);

    return VoxelModel.fromData(scene, parsed, position, debrisController, voxelSize, rotationY);
  }

  static fromData(scene: Scene, data: ParsedVoxModel, position: Vector3,
    debris: VoxelDebrisController, voxelSize: number, rotationY = 0): VoxelModel {
    const model = new VoxelModel(scene, voxelSize, debris, position, rotationY);
    model.build(data);
    return model;
  }

  getIntactMeshes(): Mesh[] {
    return Array.from(this.chunks.values(), chunk => chunk.mesh);
  }


  hitLooseDebris(picked: AbstractMesh, point: Vector3, direction: Vector3, radius: number): boolean {
    let affected = false;
    for (const item of this.debris) {
      if (!item.aggregate) continue;
      const center = item.mesh.position;
      if (picked !== item.mesh && Vector3.DistanceSquared(point, center) > radius * radius) continue;
      const radial = center.subtract(point).normalize();
      const kick = radial.add(direction.scale(0.8));
      kick.y += 0.35;
      item.aggregate.body.applyImpulse(kick.normalize().scaleInPlace(item.mass * shooterDebrisConfig.looseHitKickSpeed),
        picked === item.mesh ? point : center);
      affected = true;
    }
    return affected;
  }

  enableFloorSupport(floorY: number): void {
    this.debrisFloorY = floorY;
    this.floorAnchors = this.pieces.filter(piece =>
      Math.abs(this.root.position.y + piece.localPosition.y - this.voxelSize / 2 - floorY) < this.voxelSize * 0.001);
    this.refreshSolidBody();
  }

  setStaticCollisionEnabled(enabled: boolean): void {
    if (enabled) {
      this.refreshSolidBody();
      return;
    }
    this.solidBody?.dispose();
    this.solidBody = undefined;
  }

  private mobile = false;

  enableCoreSupport(isCore: (depth: number) => boolean): void {
    this.mobile = true;
    this.floorAnchors = [];
    this.blastShell = [];
    for (const piece of this.pieces) {
      (isCore(piece.depth01) ? this.floorAnchors : this.blastShell).push(piece);
    }
  }

  chipBlastShell(center: Vector3, radius: number, normal: Vector3): void {
    if (!this.blastShell || !this.activePieceCount) return;
    const local=this.getLocalPosition(center);
    let nearest:VoxelPiece|undefined;
    let best=radius*radius;
    for (const piece of this.blastShell) {
      if (!piece.isActive) continue;
      const distance=Vector3.DistanceSquared(local,piece.localPosition);
      if (distance<=best) { best=distance; nearest=piece; }
    }
    if (!nearest) return;
    const position=this.getWorldPosition(nearest.localPosition);
    this.applyDamagePlan({removedVoxelIds:[nearest.id],debrisEntries:[]});
    const color=this.palette[nearest.colorIndex] ?? Color3.White();
    let visual:Debris['mesh'];
    if (this.scene.getEngine().getCaps().instancedArrays) {
      visual=DebrisCubeBatch.forScene(this.scene).add(position,this.voxelSize,color);
    } else {
      visual=MeshBuilder.CreateBox('blast-chip',{size:this.voxelSize},this.scene);
      visual.position.copyFrom(position);
      visual.material=this.getMaterial(nearest.colorIndex,this.palette);
    }
    const velocity=normal.scale(-shooterDebrisConfig.blastChipSpeed);
    velocity.y+=shooterDebrisConfig.blastChipLift;
    this.registerDebris(visual,0,velocity,Vector3.Zero());
  }

  setPose(feet: Vector3, yaw: number, tilt=this.root.rotation.x): void {
    if(this.root.position.equals(feet) && this.rotationY===yaw && this.root.rotation.x===tilt)return;
    if(!this.root.position.equals(feet))this.root.position.copyFrom(feet);
    if(this.rotationY!==yaw)this.root.rotation.y=this.rotationY=yaw;
    if(this.root.rotation.x!==tilt)this.root.rotation.x=tilt;
    this.root.computeWorldMatrix(true);
  }

  setRegionYaw(select: (gridX: number, gridY: number, gridZ: number) => boolean,
    pivot: Vector3, yaw: number): void {
    const sin=Math.sin(yaw);
    const cos=Math.cos(yaw);
    const affectedChunks=new Set<string>();
    this.hasLocalDeformation=true;

    for (const piece of this.pieces) {
      if (!select(piece.gridX,piece.gridY,piece.gridZ)) continue;
      const offset=piece.restLocalPosition.subtract(pivot);
      piece.localPosition.set(
        pivot.x+offset.x*cos+offset.z*sin,
        piece.restLocalPosition.y,
        pivot.z-offset.x*sin+offset.z*cos
      );
      const chunk=this.chunks.get(piece.chunkKey);
      const particle=chunk?.particles.particles[piece.particleIndex];
      if (particle) {
        particle.position.copyFrom(piece.localPosition);
        particle.rotation.y=yaw;
        affectedChunks.add(piece.chunkKey);
      }
    }

    for (const chunkKey of affectedChunks) this.chunks.get(chunkKey)?.particles.setParticles();
  }

  get remainingCells(): number { return this.activePieceCount; }

  disposeIntact(): void {
    this.solidBody?.dispose();
    this.solidBody=undefined;
    this.disposeIntactMeshes();
    this.root.dispose();
  }

  disposeAll(): void {
    this.debrisController.evictOwner(this);
    this.disposeIntact();
    for(const material of this.materials.values())material.dispose();
    this.materials.clear();
  }

  collapseRigidBands(splitRow:number, upperYaw:number):void {
    if(!this.activePieceCount)return;
    const lower:VoxelPiece[]=[],upper:VoxelPiece[]=[];
    for(const p of this.piecesByGridKey.values()) {
      (p.gridY<splitRow ? lower : upper).push(p);
      p.isActive=false;
    }
    for(const part of [lower,upper]) {
      if(!part.length)continue;
      const origin=this.groupOrigin(part), isUpper=part===upper;
      const mesh=buildRigidVoxelFragment(this.scene,part,this.voxelSize,this.palette,isUpper?upperYaw:0,origin);
      mesh.position.copyFrom(this.getWorldPosition(origin));
      mesh.rotation.set(this.root.rotation.x,this.rotationY,0);
      mesh.material=this.getMaterial(-1,this.palette);
      const side=isUpper?1:-1, mass=part.length*0.01;
      const speed=side*shooterDebrisConfig.detachedSplitSpeed;
      const velocity=new Vector3(speed*Math.cos(this.rotationY),shooterDebrisConfig.detachedLiftSpeed,-speed*Math.sin(this.rotationY));
      this.registerDebris(mesh,mass,velocity,new Vector3(0,side*shooterDebrisConfig.detachedSpinSpeed,side*0.35),
        !isUpper || !lower.length ? ()=>new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass,friction:0.5,restitution:0},this.scene) : undefined);
    }
    this.activePieceCount=0;
    this.piecesByGridKey.clear();
    this.disposeIntact();
  }

  private refreshSolidBody(): void {
    this.solidBody?.dispose();
    this.solidBody = this.activePieceCount
      ? createVoxelSolidBody(this.root, Array.from(this.piecesByGridKey.values()), this.voxelSize, Vector3.Zero(), 0)
      : undefined;
  }

  getUnsupportedGroups(direct: readonly VoxelDamageCandidate[]): number[][] {
    if (!direct.length || !this.floorAnchors) return [];
    return findUnsupportedGroups(this.piecesByGridKey.values(), this.floorAnchors.filter(p => p.isActive),
      new Set(direct.map(c => c.voxelId)), p => this.faceNeighbors(p)).map(group => group.map(p => p.id));
  }

  hasIntactVoxels(): boolean {
    return this.activePieceCount > 0;
  }

  getWorldBounds(): VoxelWorldBounds {
    if (!this.activePieceCount) return {min:this.root.position.clone(),max:this.root.position.clone()};
    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    if (this.hasLocalDeformation) {
      const half=new Vector3(this.voxelSize*0.5,this.voxelSize*0.5,this.voxelSize*0.5);
      for (const piece of this.piecesByGridKey.values()) {
        const worldPosition=this.getWorldPosition(piece.localPosition);
        min.minimizeInPlace(worldPosition.subtract(half));
        max.maximizeInPlace(worldPosition.add(half));
      }
      return {min,max};
    }

    for (const x of [this.localMin.x, this.localMax.x]) {
      for (const y of [this.localMin.y, this.localMax.y]) {
        for (const z of [this.localMin.z, this.localMax.z]) {
          const worldPosition = this.getWorldPosition(new Vector3(x, y, z));

          min.minimizeInPlace(worldPosition);
          max.maximizeInPlace(worldPosition);
        }
      }
    }

    return { min, max };
  }

  isIntactVoxel(id:number):boolean {
    return this.piecesById.get(id)?.isActive === true;
  }

  getSolidContactBounds(
    worldBounds?: VoxelWorldBounds,
    containsPoint?: (worldPosition: Vector3) => boolean
  ): (VoxelWorldBounds & {voxelId:number})[] {
    if (this.activePieceCount === 0) {
      return [];
    }

    const half = this.voxelSize * 0.5;
    const candidatePieces = worldBounds
      ? this.getActivePiecesInWorldBounds(worldBounds)
      : this.piecesByGridKey.values();
    const sin=Math.sin(this.rotationY), cos=Math.cos(this.rotationY);
    const diagonal=Math.abs(sin*cos)>1e-6;
    const extent=diagonal ? half*(Math.abs(sin)+Math.abs(cos)) : half;
    const halfExtents=new Vector3(extent,half,extent);
    const contactBounds: (VoxelWorldBounds & {voxelId:number})[] = [];

    for (const piece of candidatePieces) {
      const worldPosition = this.getWorldPosition(piece.localPosition);

      if (containsPoint && !containsPoint(worldPosition)) {
        continue;
      }

      contactBounds.push({
        voxelId:piece.id,
        min: worldPosition.subtract(halfExtents),
        max: worldPosition.add(halfExtents),
        ...(diagonal && {footprint:{x:worldPosition.x,z:worldPosition.z,sin,cos,halfWidth:half,halfDepth:half}})
      });
    }

    return contactBounds;
  }

  getDamageCandidates(worldBounds: VoxelWorldBounds): VoxelDamageCandidate[] {
    if (this.activePieceCount === 0) {
      return [];
    }

    return this.getActivePiecesInWorldBounds(worldBounds).map((piece) => ({
        voxelId: piece.id,
        worldPosition: this.getWorldPosition(piece.localPosition),
        depth01: piece.depth01,
        impactStrength: 1
      }));
  }


  private *faceNeighbors(piece: VoxelPiece): IterableIterator<VoxelPiece> {
    for (const [dx, dy, dz] of faceOffsets) {
      const x = piece.gridX + dx, y = piece.gridY + dy, z = piece.gridZ + dz;
      if (x < 0 || x >= this.gridSizeX || y < 0 || y >= this.gridSizeY || z < 0 || z >= this.gridSizeZ) continue;
      const neighbor = this.piecesByGridKey.get(this.getGridKey(x, y, z, this.gridSizeX, this.gridSizeY));
      if (neighbor) yield neighbor;
    }
  }

  applyDamagePlan(damagePlan: VoxelDamagePlan, groups: readonly number[][] = [], groupSlots = 0,
    physicalFragmentCount = Number.POSITIVE_INFINITY): boolean {
    if (this.activePieceCount === 0 || (!damagePlan.removedVoxelIds.length && !groups.length)) {
      return false;
    }

    const debrisByVoxelId = new Map(damagePlan.debrisEntries.map((entry) => [entry.voxelId, entry]));
    const damagePieces: Array<{ piece: VoxelPiece; damage: VoxelDamageEntry }> = [];
    const detachedGroups=groups.slice(0,groupSlots).map(group => {
      const pieces=group.map(id=>this.piecesById.get(id)!).filter(Boolean);
      return fractureConnectedGroup(pieces,shooterDebrisConfig.detachedFractureMinLength);
    });
    const affectedChunks = new Set<string>();
    let removedPieceCount = 0;

    for (const voxelId of damagePlan.removedVoxelIds.concat(...groups)) {
      const piece = this.piecesById.get(voxelId);

      if (!piece?.isActive) {
        continue;
      }

      removedPieceCount += 1;
      piece.isActive = false;
      this.activePieceCount -= 1;
      this.piecesByGridKey.delete(piece.gridKey);
      affectedChunks.add(piece.chunkKey);

      const chunk = this.chunks.get(piece.chunkKey);
      const particle = chunk?.particles.particles[piece.particleIndex];

      if (chunk) {
        chunk.activeCount -= 1;
      }

      if (particle) {
        particle.isVisible = false;
        particle.scaling.setAll(0);
      }

      const damage = debrisByVoxelId.get(piece.id);

      if (damage) {
        damagePieces.push({ piece, damage });
      }
    }

    if (removedPieceCount === 0) {
      return false;
    }

    for (const chunkKey of affectedChunks) {
      const chunk = this.chunks.get(chunkKey);

      if (!chunk) {
        continue;
      }

      if (chunk.activeCount === 0) {
        chunk.particles.dispose();
        this.chunks.delete(chunkKey);
      } else {
        const single=!groups.length && damagePlan.removedVoxelIds.length===1
          ? this.piecesById.get(damagePlan.removedVoxelIds[0]) : undefined;
        if (single) chunk.particles.setParticles(single.particleIndex,single.particleIndex);
        else chunk.particles.setParticles();
        if (chunk.mesh.checkCollisions) {
          // The collision coordinator caches transformed triangles for each submesh.
          for (const subMesh of chunk.mesh.subMeshes) subMesh.refreshBoundingInfo();
        }
      }
    }

    if (this.floorAnchors && !this.mobile) this.refreshSolidBody();
    let fragmentIndex = 0;
    for (const detached of detachedGroups) {
      const all=detached.rigidParts.flat().concat(detached.fractureCells);
      const center=this.groupOrigin(all);
      detached.rigidParts.forEach((group,index) => {
        this.spawnDebrisGroup(group,center,index%2===0?-1:1,fragmentIndex<physicalFragmentCount);
        fragmentIndex += 1;
      });
      this.spawnFractureDebris(detached.fractureCells,center);
    }
    this.spawnDebrisPieces(damagePieces);

    if (this.activePieceCount === 0) {
      this.disposeIntactMeshes();
      this.root.dispose();
    }

    return true;
  }

  private build(model: ParsedVoxModel): void {
    this.gridSizeX = Math.round(model.size.x);
    this.gridSizeY = Math.round(model.size.z);
    this.gridSizeZ = Math.round(model.size.y);
    this.gridOrigin = new Vector3(
      -model.size.x * 0.5 * this.voxelSize,
      this.voxelSize * 0.5,
      -model.size.y * 0.5 * this.voxelSize
    );
    const pieces = model.voxels.map((voxel) => ({
      localPosition: new Vector3(
        (voxel.x - model.size.x * 0.5) * this.voxelSize,
        voxel.z * this.voxelSize + this.voxelSize * 0.5,
        (voxel.y - model.size.y * 0.5) * this.voxelSize
      ),
      colorIndex: voxel.colorIndex,
      gridX: voxel.x,
      gridY: voxel.z,
      gridZ: voxel.y
    }));

    this.buildPieces(pieces, model.palette);
  }

  private buildPieces(pieces: RawVoxelPiece[], palette: Color3[]): void {
    const half = this.voxelSize * 0.5;
    const sourceCube = MeshBuilder.CreateBox('voxel-intact-source', { size: this.voxelSize }, this.scene);
    this.palette = palette;
    const intactMaterial = new StandardMaterial('voxel-intact-material', this.scene);

    intactMaterial.diffuseColor = Color3.White();
    intactMaterial.specularColor = new Color3(0.04, 0.04, 0.04);
    this.intactMaterial = intactMaterial;

    const rawPiecesByChunk = new Map<string, RawVoxelPiece[]>();

    for (const piece of pieces) {
      const chunkKey = this.getChunkKey(piece.gridX, piece.gridY, piece.gridZ);
      const chunkPieces = rawPiecesByChunk.get(chunkKey);

      if (chunkPieces) {
        chunkPieces.push(piece);
      } else {
        rawPiecesByChunk.set(chunkKey, [piece]);
      }
    }

    for (const [chunkKey, chunkPieces] of rawPiecesByChunk) {
      const particles = new SolidParticleSystem(`voxel-intact-${chunkKey}`, this.scene, {
        updatable: true,
        computeBoundingBox: true
      });

      particles.addShape(sourceCube, chunkPieces.length, {
        positionFunction: (particle: SolidParticle, index: number) => {
          const piece = chunkPieces[index];
          const color = palette[piece.colorIndex] ?? Color3.White();

          particle.position.copyFrom(piece.localPosition);
          particle.color = new Color4(color.r, color.g, color.b, 1);
        }
      });

      const mesh = particles.buildMesh();

      mesh.parent = this.root;
      mesh.material = intactMaterial;
      mesh.checkCollisions = false;
      mesh.isPickable = false;
      this.chunks.set(chunkKey, { particles, mesh, activeCount: chunkPieces.length });

      for (let particleIndex = 0; particleIndex < chunkPieces.length; particleIndex += 1) {
        const rawPiece = chunkPieces[particleIndex];
        const gridKey = this.getGridKey(rawPiece.gridX, rawPiece.gridY, rawPiece.gridZ, this.gridSizeX, this.gridSizeY);
        const piece: VoxelPiece = {
          id: this.nextPieceId,
          localPosition: rawPiece.localPosition,
          restLocalPosition: rawPiece.localPosition.clone(),
          colorIndex: rawPiece.colorIndex,
          particleIndex,
          gridX: rawPiece.gridX,
          gridY: rawPiece.gridY,
          gridZ: rawPiece.gridZ,
          gridKey,
          chunkKey,
          isActive: true,
          depth01: 0
        };

        this.pieces.push(piece);
        this.piecesById.set(piece.id, piece);
        this.piecesByGridKey.set(gridKey, piece);
        this.nextPieceId += 1;
        this.activePieceCount += 1;
        this.localMin.minimizeInPlace(rawPiece.localPosition.subtract(new Vector3(half, half, half)));
        this.localMax.maximizeInPlace(rawPiece.localPosition.add(new Vector3(half, half, half)));
      }
    }

    sourceCube.dispose();

    this.assignLayerDepths();
  }

  private spawnDebrisPieces(damagePieces: Array<{ piece: VoxelPiece; damage: VoxelDamageEntry }>): void {
    if (damagePieces.length === 0) {
      return;
    }

    const count=Math.min(damagePieces.length,shooterDebrisConfig.maxBodiesPerImpact);
    const selected=Array.from({length:count},(_,index)=>
      damagePieces[Math.min(damagePieces.length-1,Math.floor((index+0.5)*damagePieces.length/count))]);
    for (const { piece, damage } of selected) {
      const cube = MeshBuilder.CreateBox('voxel-debris', { size: this.voxelSize }, this.scene);
      const worldPosition = this.getWorldPosition(piece.localPosition);

      cube.position.copyFrom(worldPosition);
      cube.material = this.getMaterial(piece.colorIndex, this.palette);
      cube.checkCollisions = false;

      this.registerDebris(cube, 0.01, damage.linearVelocity, damage.angularVelocity,
        () => new PhysicsAggregate(cube, PhysicsShapeType.BOX, {
        mass: 0.01,
        friction: 0.45,
        restitution: 0,
        extents: new Vector3(this.voxelSize, this.voxelSize, this.voxelSize)
      }, this.scene), piece.colorIndex);
    }
  }

  private groupOrigin(pieces: readonly VoxelPiece[]): Vector3 {
    const origin=Vector3.Zero();
    for (const piece of pieces) origin.addInPlace(piece.localPosition);
    return origin.scaleInPlace(1/pieces.length);
  }

  private spawnDebrisGroup(pieces: VoxelPiece[], sharedOrigin: Vector3, side: number, physical = true): void {
    const origin=this.groupOrigin(pieces);
    const source = MeshBuilder.CreateBox('fragment-cell', { size: this.voxelSize }, this.scene);
    const particles = new SolidParticleSystem('fallen-section', this.scene, { updatable: false });
    particles.addShape(source, pieces.length, {
      positionFunction: (particle: SolidParticle, index: number) => {
        const piece = pieces[index];
        piece.localPosition.subtractToRef(origin, particle.position);
        const color = this.palette[piece.colorIndex] ?? Color3.White();
        particle.color = new Color4(color.r, color.g, color.b, 1);
      }
    });
    const mesh = particles.buildMesh();
    source.dispose();
    mesh.position.copyFrom(this.getWorldPosition(origin));
    mesh.rotation.x = this.root.rotation.x;
    mesh.rotation.y = this.rotationY;
    mesh.material = this.getMaterial(-1, this.palette);
    mesh.isPickable = mesh.checkCollisions = false;
    const separation=origin.subtract(sharedOrigin);
    separation.y=0;
    if (separation.lengthSquared()<0.0001) separation.set(side,0,0);
    separation.normalize();
    const sin=Math.sin(this.rotationY), cos=Math.cos(this.rotationY);
    const velocity=new Vector3(
      separation.x*cos+separation.z*sin,
      shooterDebrisConfig.detachedLiftSpeed,
      -separation.x*sin+separation.z*cos
    ).scaleInPlace(shooterDebrisConfig.detachedSplitSpeed);
    velocity.y=shooterDebrisConfig.detachedLiftSpeed;
    const spin=new Vector3(0,side*shooterDebrisConfig.detachedSpinSpeed,side*0.35);
    this.registerDebris(mesh, pieces.length * 0.01, velocity, spin,
      physical ? () => createVoxelSolidBody(mesh, pieces, this.voxelSize, origin, pieces.length * 0.01) : undefined);
  }

  private spawnFractureDebris(pieces: readonly VoxelPiece[], center: Vector3): void {
    if (!pieces.length) return;
    const count=Math.min(pieces.length,shooterDebrisConfig.detachedFractureDebrisCount);
    for (let index=0;index<count;++index) {
      const piece=pieces[Math.min(pieces.length-1,Math.floor((index+0.5)*pieces.length/count))];
      const cube=MeshBuilder.CreateBox('fracture-debris',{size:this.voxelSize},this.scene);
      cube.position.copyFrom(this.getWorldPosition(piece.localPosition));
      cube.material=this.getMaterial(piece.colorIndex,this.palette);
      const localDirection=piece.localPosition.subtract(center);
      if (localDirection.lengthSquared()<0.0001) localDirection.set(Math.random()-0.5,0,Math.random()-0.5);
      localDirection.y=0;
      localDirection.normalize();
      const sin=Math.sin(this.rotationY), cos=Math.cos(this.rotationY);
      const velocity=new Vector3(
        localDirection.x*cos+localDirection.z*sin,
        shooterDebrisConfig.detachedLiftSpeed,
        -localDirection.x*sin+localDirection.z*cos
      ).scaleInPlace(shooterDebrisConfig.detachedFractureSpeed);
      velocity.y=shooterDebrisConfig.detachedLiftSpeed;
      const spin=new Vector3(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5)
        .scaleInPlace(shooterDebrisConfig.detachedFractureSpin);
      this.registerDebris(cube,0.01,velocity,spin,()=>new PhysicsAggregate(cube,PhysicsShapeType.BOX,{
        mass:0.01,friction:0.45,restitution:0,
        extents:new Vector3(this.voxelSize,this.voxelSize,this.voxelSize)
      },this.scene),piece.colorIndex);
    }
  }

  private registerDebris(mesh: Debris['mesh'], mass: number, velocity: Vector3, spin: Vector3,
    createBody?: () => Debris['aggregate'], cubeColorIndex?: number): void {
    mesh.computeWorldMatrix(true);
    const item: Debris = { mesh, mass, aggregate: createBody?.() };
    if (mesh instanceof Mesh) {
      mesh.metadata={...mesh.metadata,voxelDebris:true};
      mesh.isPickable = mesh.checkCollisions = !!item.aggregate;
    }
    item.aggregate?.body.setLinearDamping(0.12);
    item.aggregate?.body.setAngularDamping(0.42);
    item.aggregate?.body.setLinearVelocity(velocity);
    item.aggregate?.body.setAngularVelocity(spin);
    if (!item.aggregate) {
      item.fallbackVelocity = velocity.clone();
      item.fallbackAngularVelocity = spin.clone();
    }
    this.debris.push(item);
    this.debrisController.register(() => {
      item.aggregate?.dispose();
      item.aggregate=undefined;
      item.mesh.dispose();
      const index=this.debris.indexOf(item);
      if (index>=0) this.debris.splice(index,1);
    },()=>{
      item.fallbackVelocity=item.aggregate?.body.getLinearVelocity().clone() ?? Vector3.Zero();
      item.fallbackAngularVelocity=item.aggregate?.body.getAngularVelocity().clone() ?? Vector3.Zero();
      item.aggregate?.dispose();
      item.aggregate=undefined;
      const oldMesh=item.mesh;
      if (!(oldMesh instanceof Mesh)) return;
      oldMesh.isPickable=oldMesh.checkCollisions=false;
      if (cubeColorIndex!==undefined && this.scene.getEngine().getCaps().instancedArrays) {
        item.mesh=DebrisCubeBatch.forScene(this.scene).add(oldMesh.position,this.voxelSize,
          this.palette[cubeColorIndex] ?? Color3.White(),oldMesh);
        oldMesh.dispose();
      }
    },dt=>{
      const velocity=item.fallbackVelocity;
      const angularVelocity=item.fallbackAngularVelocity;
      if (!velocity || !angularVelocity) return;
      const mesh=item.mesh;

      velocity.y-=shooterDebrisConfig.fallbackGravity*dt;
      const airDamping=Math.exp(-shooterDebrisConfig.fallbackAirDamping*dt);
      velocity.x*=airDamping;
      velocity.z*=airDamping;
      mesh.position.addInPlace(velocity.scale(dt));
      mesh.rotation.addInPlace(angularVelocity.scale(dt));
      mesh.computeWorldMatrix(true);

      const bottom=mesh.getBoundingInfo().boundingBox.minimumWorld.y;
      if (bottom>this.debrisFloorY) return;

      mesh.position.y+=this.debrisFloorY-bottom;
      if (mesh instanceof BatchedDebrisCube) mesh.computeWorldMatrix();
      velocity.y=0;
      const groundDamping=Math.exp(-shooterDebrisConfig.fallbackGroundDamping*dt);
      velocity.x*=groundDamping;
      velocity.z*=groundDamping;
      angularVelocity.scaleInPlace(Math.exp(-shooterDebrisConfig.fallbackAngularDamping*dt));
      if (velocity.lengthSquared()<shooterDebrisConfig.fallbackSettleSpeed**2 &&
        angularVelocity.lengthSquared()<shooterDebrisConfig.fallbackSettleSpeed**2) {
        item.fallbackVelocity=undefined;
        item.fallbackAngularVelocity=undefined;
      }
    },()=>{
      const camera=this.scene.activeCamera;
      const visual=item.mesh;
      if (!camera) return false;
      if (visual instanceof BatchedDebrisCube) return camera.isInFrustum(visual.getBoundingInfo());
      return visual.isEnabled() && visual.isVisible && camera.isInFrustum(visual);
    }, !!item.aggregate,()=>item.mesh.position.clone(),(point,scale)=>{
      const mesh=item.mesh;
      mesh.position.copyFrom(point);
      mesh.scaling.setAll(Math.max(0.001,scale));
      if (mesh instanceof BatchedDebrisCube) mesh.computeWorldMatrix();
    },this);
  }

  private assignLayerDepths(): void {
    if (this.pieces.length <= 1) {
      for (const piece of this.pieces) {
        piece.depth01 = 0;
      }

      return;
    }

    const half = this.voxelSize * 0.5;
    const centerMin = this.localMin.add(new Vector3(half, half, half));
    const centerMax = this.localMax.subtract(new Vector3(half, half, half));
    const gridSizeX = Math.round((centerMax.x - centerMin.x) / this.voxelSize) + 1;
    const gridSizeY = Math.round((centerMax.y - centerMin.y) / this.voxelSize) + 1;
    const gridSizeZ = Math.round((centerMax.z - centerMin.z) / this.voxelSize) + 1;
    const gridCoordinates = this.pieces.map((piece) => ({
      x: Math.round((piece.localPosition.x - centerMin.x) / this.voxelSize),
      y: Math.round((piece.localPosition.y - centerMin.y) / this.voxelSize),
      z: Math.round((piece.localPosition.z - centerMin.z) / this.voxelSize)
    }));
    const pieceIndexByGridKey = new Map<number, number>();
    const surfaceDepths = new Int32Array(this.pieces.length);
    const queue = new Int32Array(this.pieces.length);

    surfaceDepths.fill(-1);

    for (let index = 0; index < gridCoordinates.length; index += 1) {
      const coordinate = gridCoordinates[index];

      pieceIndexByGridKey.set(
        this.getGridKey(coordinate.x, coordinate.y, coordinate.z, gridSizeX, gridSizeY),
        index
      );
    }

    let queueHead = 0;
    let queueTail = 0;

    for (let index = 0; index < gridCoordinates.length; index += 1) {
      const coordinate = gridCoordinates[index];
      const isSurface = faceOffsets.some(([offsetX, offsetY, offsetZ]) => {
        const neighborX = coordinate.x + offsetX;
        const neighborY = coordinate.y + offsetY;
        const neighborZ = coordinate.z + offsetZ;

        return neighborX < 0 || neighborX >= gridSizeX ||
          neighborY < 0 || neighborY >= gridSizeY ||
          neighborZ < 0 || neighborZ >= gridSizeZ ||
          !pieceIndexByGridKey.has(this.getGridKey(neighborX, neighborY, neighborZ, gridSizeX, gridSizeY));
      });

      if (isSurface) {
        surfaceDepths[index] = 0;
        queue[queueTail] = index;
        queueTail += 1;
      }
    }

    while (queueHead < queueTail) {
      const pieceIndex = queue[queueHead];
      const coordinate = gridCoordinates[pieceIndex];

      queueHead += 1;

      for (const [offsetX, offsetY, offsetZ] of faceOffsets) {
        const neighborX = coordinate.x + offsetX;
        const neighborY = coordinate.y + offsetY;
        const neighborZ = coordinate.z + offsetZ;

        if (neighborX < 0 || neighborX >= gridSizeX ||
          neighborY < 0 || neighborY >= gridSizeY ||
          neighborZ < 0 || neighborZ >= gridSizeZ) {
          continue;
        }

        const neighborIndex = pieceIndexByGridKey.get(this.getGridKey(
          neighborX,
          neighborY,
          neighborZ,
          gridSizeX,
          gridSizeY
        ));

        if (neighborIndex === undefined || surfaceDepths[neighborIndex] !== -1) {
          continue;
        }

        surfaceDepths[neighborIndex] = surfaceDepths[pieceIndex] + 1;
        queue[queueTail] = neighborIndex;
        queueTail += 1;
      }
    }

    const center = centerMin.add(centerMax).scale(0.5);
    const halfExtents = centerMax.subtract(centerMin).scale(0.5);
    const normalizedRadiusSquared = this.pieces.map((piece) => {
      const delta = piece.localPosition.subtract(center);
      const normalizedX = halfExtents.x > 0.0001 ? delta.x / halfExtents.x : 0;
      const normalizedY = halfExtents.y > 0.0001 ? delta.y / halfExtents.y : 0;
      const normalizedZ = halfExtents.z > 0.0001 ? delta.z / halfExtents.z : 0;

      return normalizedX * normalizedX + normalizedY * normalizedY + normalizedZ * normalizedZ;
    });
    const rankedPieceIndices = this.pieces
      .map((_, index) => index)
      .sort((first, second) =>
        surfaceDepths[first] - surfaceDepths[second] ||
        normalizedRadiusSquared[second] - normalizedRadiusSquared[first] ||
        first - second
      );
    const maxRank = rankedPieceIndices.length - 1;

    rankedPieceIndices.forEach((pieceIndex, rank) => {
      this.pieces[pieceIndex].depth01 = rank / maxRank;
    });
  }

  private getGridKey(x: number, y: number, z: number, sizeX: number, sizeY: number): number {
    return x + sizeX * (y + sizeY * z);
  }

  private getChunkKey(gridX: number, gridY: number, gridZ: number): string {
    return `${Math.floor(gridX / this.chunkSize)}:${Math.floor(gridY / this.chunkSize)}:${Math.floor(gridZ / this.chunkSize)}`;
  }

  private getActivePiecesInWorldBounds(worldBounds: VoxelWorldBounds): VoxelPiece[] {
    if (this.hasLocalDeformation) {
      return Array.from(this.piecesByGridKey.values()).filter(piece =>
        this.intersectsPieceBounds(this.getWorldPosition(piece.localPosition),worldBounds));
    }
    const localBounds = this.getLocalBounds(worldBounds);
    const half = this.voxelSize * 0.5;
    const minX = this.clampGridCoordinate(
      Math.ceil((localBounds.min.x - half - this.gridOrigin.x) / this.voxelSize - 0.0001),
      this.gridSizeX
    );
    const maxX = this.clampGridCoordinate(
      Math.floor((localBounds.max.x + half - this.gridOrigin.x) / this.voxelSize + 0.0001),
      this.gridSizeX
    );
    const minY = this.clampGridCoordinate(
      Math.ceil((localBounds.min.y - half - this.gridOrigin.y) / this.voxelSize - 0.0001),
      this.gridSizeY
    );
    const maxY = this.clampGridCoordinate(
      Math.floor((localBounds.max.y + half - this.gridOrigin.y) / this.voxelSize + 0.0001),
      this.gridSizeY
    );
    const minZ = this.clampGridCoordinate(
      Math.ceil((localBounds.min.z - half - this.gridOrigin.z) / this.voxelSize - 0.0001),
      this.gridSizeZ
    );
    const maxZ = this.clampGridCoordinate(
      Math.floor((localBounds.max.z + half - this.gridOrigin.z) / this.voxelSize + 0.0001),
      this.gridSizeZ
    );
    const result: VoxelPiece[] = [];

    if (minX > maxX || minY > maxY || minZ > maxZ) {
      return result;
    }

    for (let gridZ = minZ; gridZ <= maxZ; gridZ += 1) {
      for (let gridY = minY; gridY <= maxY; gridY += 1) {
        for (let gridX = minX; gridX <= maxX; gridX += 1) {
          const piece = this.piecesByGridKey.get(
            this.getGridKey(gridX, gridY, gridZ, this.gridSizeX, this.gridSizeY)
          );

          if (!piece) {
            continue;
          }

          const worldPosition = this.getWorldPosition(piece.localPosition);

          if (this.intersectsPieceBounds(worldPosition, worldBounds)) {
            result.push(piece);
          }
        }
      }
    }

    return result;
  }

  private getLocalBounds(worldBounds: VoxelWorldBounds): VoxelWorldBounds {
    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (const x of [worldBounds.min.x, worldBounds.max.x]) {
      for (const y of [worldBounds.min.y, worldBounds.max.y]) {
        for (const z of [worldBounds.min.z, worldBounds.max.z]) {
          const localPosition = this.getLocalPosition(new Vector3(x, y, z));

          min.minimizeInPlace(localPosition);
          max.maximizeInPlace(localPosition);
        }
      }
    }

    return { min, max };
  }

  private getLocalPosition(worldPosition: Vector3): Vector3 {
    const delta = worldPosition.subtract(this.root.position);
    const sin = Math.sin(this.rotationY);
    const cos = Math.cos(this.rotationY);
    const localX = delta.x * cos - delta.z * sin;
    const tiltedZ = delta.x * sin + delta.z * cos;
    const tiltSin = Math.sin(this.root.rotation.x);
    const tiltCos = Math.cos(this.root.rotation.x);

    return new Vector3(
      localX,
      delta.y * tiltCos + tiltedZ * tiltSin,
      -delta.y * tiltSin + tiltedZ * tiltCos
    );
  }

  private clampGridCoordinate(value: number, gridSize: number): number {
    return Math.min(gridSize - 1, Math.max(0, value));
  }

  private intersectsPieceBounds(worldPosition: Vector3, worldBounds: VoxelWorldBounds): boolean {
    const half = this.voxelSize * 0.5;
    const pieceMin = worldPosition.subtract(new Vector3(half, half, half));
    const pieceMax = worldPosition.add(new Vector3(half, half, half));

    return (
      pieceMax.x >= worldBounds.min.x &&
      pieceMin.x <= worldBounds.max.x &&
      pieceMax.y >= worldBounds.min.y &&
      pieceMin.y <= worldBounds.max.y &&
      pieceMax.z >= worldBounds.min.z &&
      pieceMin.z <= worldBounds.max.z
    );
  }

  private getWorldPosition(localPosition: Vector3): Vector3 {
    const sin = Math.sin(this.rotationY);
    const cos = Math.cos(this.rotationY);
    const tiltSin = Math.sin(this.root.rotation.x);
    const tiltCos = Math.cos(this.root.rotation.x);
    const tiltedY = localPosition.y * tiltCos - localPosition.z * tiltSin;
    const tiltedZ = localPosition.y * tiltSin + localPosition.z * tiltCos;

    return new Vector3(
      this.root.position.x + localPosition.x * cos + tiltedZ * sin,
      this.root.position.y + tiltedY,
      this.root.position.z - localPosition.x * sin + tiltedZ * cos
    );
  }

  private getMaterial(colorIndex: number, palette: Color3[]): StandardMaterial {
    const existing = this.materials.get(colorIndex);
    if (existing) {
      return existing;
    }

    const material = new StandardMaterial(`voxel-material-${colorIndex}`, this.scene);
    material.diffuseColor = palette[colorIndex] ?? Color3.White();
    material.specularColor = new Color3(0.04, 0.04, 0.04);

    this.materials.set(colorIndex, material);
    return material;
  }

  private disposeIntactMeshes(): void {
    for (const chunk of this.chunks.values()) {
      chunk.particles.dispose();
    }

    this.chunks.clear();
    this.intactMaterial?.dispose();
    this.intactMaterial = null;
  }


}
