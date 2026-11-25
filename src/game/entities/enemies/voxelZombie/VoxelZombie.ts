import { type AbstractMesh, Color3, Mesh, MeshBuilder, Ray, Scene, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import { Enemy, type EnemyTarget } from '../Enemy';
import { EnemyController } from '../EnemyController';
import { VoxelModel } from '../../voxel/VoxelModel';
import type { VoxelDebrisController } from '../../voxel/VoxelDebrisController';
import type { VoxVoxel } from '../../voxel/VoxAsset';
import type { NavigationCell, NavigationGrid } from '../../../navigation/NavigationGrid';
import { VoxelDamageTarget } from '../../../shooter/VoxelDamageTarget';
import type { Impact } from '../../../shooter/ProjectileSystem';
import { zombieConfig as cfg } from './config';

export interface ZombieObstacleBreaker {
  break(cell: NavigationCell, direction: Vector3, impact: Impact): boolean;
}

export class VoxelZombie extends Enemy {
  readonly config=cfg;
  readonly target: VoxelDamageTarget;
  private readonly ai: EnemyController;
  private readonly face: TransformNode;
  private readonly eyes: Mesh[]=[];
  private readonly eyePaint: StandardMaterial;
  private readonly visionRoot: TransformNode;
  private readonly visionMaterials: StandardMaterial[]=[];
  private hearingArea?: Mesh;
  private readonly originalCells: number;
  private readonly headPivot=new Vector3(-cfg.cell/2,cfg.cell*6,-cfg.cell/2);
  private headYaw=0;
  private wallAttackPhase: 'idle'|'windup'|'recovery'='idle';
  private wallAttackTime=0;
  private wallAttackDirection=Vector3.Forward();
  private wallAttackLean=0;
  private attackCell?: NavigationCell;
  get state() { return this.ai.state; }
  get debug() { return this.ai.debug; }

  constructor(scene: Scene, spawn: Vector3, grid: NavigationGrid, debris: VoxelDebrisController,
    private readonly obstacleBreaker: ZombieObstacleBreaker) {
    super();
    const voxels: VoxVoxel[]=[];
    for (let x=0;x<cfg.width;++x) for (let y=0;y<cfg.depth;++y) for (let z=0;z<cfg.height;++z)
      voxels.push({x,y,z,colorIndex:z<3?0:z<6?1:2});
    const model=VoxelModel.fromData(scene,{size:new Vector3(cfg.width,cfg.depth,cfg.height),voxels,
      palette:['#374A64','#625585','#83BD78'].map(hex=>Color3.FromHexString(hex))},spawn.clone(),debris,cfg.cell);
    this.originalCells=model.remainingCells;
    this.target=new VoxelDamageTarget(model,cfg.material);
    const own=new Set<AbstractMesh>(model.getIntactMeshes());
    for (const m of own) m.isPickable=m.checkCollisions=true;
    this.face=new TransformNode('zombie-face',scene);
    this.visionRoot=new TransformNode('zombie-vision',scene);
    this.eyePaint=new StandardMaterial('zombie-eyes',scene);
    for (const side of [-1,1]) {
      const eye=MeshBuilder.CreateBox('eye',{size:cfg.cell*0.8},scene);
      eye.parent=this.face;
      eye.position.set(side*cfg.cell,cfg.cell*(cfg.height-7.5),cfg.cell*1.5);
      eye.material=this.eyePaint; eye.isPickable=false;
      this.eyes.push(eye);
    }
    if (cfg.showVisionDebug) {
      this.createVisionArea(scene,'zombie-near-awareness',cfg.proximityAwarenessRadius,Math.PI*2,
        new Color3(0.12,0.9,0.82),0.08);
      this.createVisionArea(scene,'zombie-sight-cone',cfg.sightRange,cfg.sightAngle*Math.PI/180,
        new Color3(1,0.76,0.18),0.1);
      this.hearingArea=this.createVisionArea(scene,'zombie-alerted-hearing',cfg.alertedHearingRadius,Math.PI*2,
        new Color3(0.72,0.3,1),0.065);
      this.hearingArea.setEnabled(false);
    }
    this.ai=new EnemyController(spawn.clone(),grid,cfg,player=>this.canSee(scene,own,player));
    this.syncPose();
  }

  private canSee(scene: Scene, own: ReadonlySet<AbstractMesh>, player: EnemyTarget): boolean {
    const sightOrigin=this.ai.position.add(new Vector3(0,cfg.cell*(cfg.height-1.5),0));
    const center=player.feet.add(new Vector3(0,player.visibilityHeight*0.55,0));
    const horizontal=center.subtract(sightOrigin);
    horizontal.y=0;
    const side=horizontal.lengthSquared()>0.0001
      ? new Vector3(horizontal.z,0,-horizontal.x).normalize().scaleInPlace(player.visibilityRadius)
      : new Vector3(player.visibilityRadius,0,0);
    const chest=player.feet.add(new Vector3(0,player.visibilityHeight*0.68,0));
    const samples=[
      player.eyes,
      chest,
      chest.add(side),
      chest.subtract(side),
      player.feet.add(new Vector3(0,player.visibilityHeight*0.3,0))
    ];
    const visionYaw=this.ai.yaw+this.headYaw;
    const coneCos=Math.cos(cfg.sightAngle*Math.PI/360);
    const eyeOrigins=this.eyes.map(eye=>{
      eye.computeWorldMatrix(true);
      return eye.getAbsolutePosition();
    });

    return samples.some(sample=>{
      const sightDelta=sample.subtract(sightOrigin);
      const distance=sightDelta.length();
      if (distance>cfg.sightRange) return false;
      const horizontalDistance=Math.hypot(sightDelta.x,sightDelta.z);
      const insideProximity=horizontalDistance<=cfg.proximityAwarenessRadius;
      const insideCone=sightDelta.x*Math.sin(visionYaw)+sightDelta.z*Math.cos(visionYaw) >=
        horizontalDistance*coneCos;
      if (!insideProximity && !insideCone) return false;

      return eyeOrigins.some(origin=>{
        const rayDelta=sample.subtract(origin);
        const rayDistance=rayDelta.length();
        if (rayDistance<0.001) return true;
        return !scene.pickWithRay(new Ray(origin,rayDelta.scale(1/rayDistance),rayDistance),mesh=>
          mesh.checkCollisions && mesh.isPickable && mesh.isEnabled() &&
          !mesh.metadata?.voxelDebris && !own.has(mesh))?.hit;
      });
    });
  }

  update(dt: number, player: EnemyTarget): void {
    if (this.state==='dead') return;
    if (this.originalCells-this.target.model.remainingCells >= Math.ceil(cfg.lethalLoss*this.originalCells)) {
      this.ai.state='dead';
      this.face.dispose();
      this.visionRoot.dispose();
      this.eyePaint.dispose();
      for (const material of this.visionMaterials) material.dispose();
      this.target.model.collapse();
      return;
    }
    this.ai.update(dt,player);
    this.updateWallAttack(dt);
    let targetYaw=0;
    if (this.state==='chase' || this.state==='windup' || this.state==='recovery') {
      const toPlayer=player.eyes.subtract(this.ai.position);
      targetYaw=this.clampAngle(this.normalizeAngle(Math.atan2(toPlayer.x,toPlayer.z)-this.ai.yaw),cfg.headTurnLimit);
    }
    const step=cfg.headTurnSpeed*dt;
    this.headYaw+=this.clampAngle(targetYaw-this.headYaw,step);
    this.syncPose();
  }

  private syncPose(): void {
    this.target.model.setPose(this.ai.position,this.ai.yaw);
    this.target.model.setTiltX(this.wallAttackLean);
    this.target.model.setRegionYaw((_,gridY)=>gridY>=6,this.headPivot,this.headYaw);
    const pitchSin=Math.sin(this.wallAttackLean), pitchCos=Math.cos(this.wallAttackLean);
    const pivotY=this.headPivot.y*pitchCos-this.headPivot.z*pitchSin;
    const pivotZ=this.headPivot.y*pitchSin+this.headPivot.z*pitchCos;
    const sin=Math.sin(this.ai.yaw), cos=Math.cos(this.ai.yaw);
    this.face.position.set(
      this.ai.position.x+this.headPivot.x*cos+pivotZ*sin,
      this.ai.position.y+pivotY,
      this.ai.position.z-this.headPivot.x*sin+pivotZ*cos
    );
    this.face.rotation.x=this.wallAttackLean;
    this.face.rotation.y=this.ai.yaw+this.headYaw;
    this.visionRoot.position.set(this.ai.position.x,this.ai.position.y+0.025,this.ai.position.z);
    this.visionRoot.rotation.y=this.ai.yaw+this.headYaw;
    this.hearingArea?.setEnabled(this.ai.isAlerted);
    this.eyePaint.emissiveColor.set(1,this.state==='windup'?0.12:0.83,0.28);
  }

  private updateWallAttack(dt: number): void {
    const cell=this.ai.breachCell;
    if (this.wallAttackPhase==='recovery') {
      this.wallAttackTime-=dt;
      this.wallAttackLean=cfg.wallBreakLean*Math.max(0,this.wallAttackTime)/cfg.wallBreakRecovery;
      if (this.wallAttackTime>0) return;
      this.wallAttackPhase='idle';
    }
    if (cell!==this.attackCell || !cell) {
      this.wallAttackPhase='idle';
      this.wallAttackLean=0;
      this.attackCell=cell;
    }
    if (!cell) return;
    if (this.wallAttackPhase==='idle') {
      const center=cell.min.add(cell.max).scaleInPlace(0.5);
      const direction=center.subtract(this.ai.position);
      direction.y=0;
      this.wallAttackDirection.copyFrom(direction.normalize());
      this.ai.yaw=Math.atan2(direction.x,direction.z);
      this.wallAttackPhase='windup';
      this.wallAttackTime=cfg.wallBreakWindup;
    }
    this.wallAttackTime-=dt;
    this.wallAttackLean=cfg.wallBreakLean*(1-Math.max(0,this.wallAttackTime)/cfg.wallBreakWindup);
    if (this.wallAttackTime>0) return;
    this.obstacleBreaker.break(cell,this.wallAttackDirection,{
      damage:cfg.wallBreakDamage, penetration:cfg.wallBreakPenetration,
      impactRadius:cfg.wallBreakRadius, forceDestruction:true
    });
    this.wallAttackPhase='recovery';
    this.wallAttackTime=cfg.wallBreakRecovery;
  }

  private createVisionArea(scene: Scene, name: string, radius: number, angle: number,
    color: Color3, alpha: number): Mesh {
    const segments=Math.max(12,Math.ceil(48*angle/(Math.PI*2)));
    const positions:number[]=[0,0,0];
    const indices:number[]=[];
    for (let i=0;i<=segments;++i) {
      const direction=-angle/2+angle*i/segments;
      positions.push(Math.sin(direction)*radius,0,Math.cos(direction)*radius);
      if (i>0) indices.push(0,i,i+1);
    }
    const normals:number[]=[];
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData();
    data.positions=positions;
    data.indices=indices;
    data.normals=normals;
    const mesh=new Mesh(name,scene);
    data.applyToMesh(mesh);
    mesh.parent=this.visionRoot;
    mesh.isPickable=false;
    mesh.renderingGroupId=1;
    const material=new StandardMaterial(`${name}-material`,scene);
    material.diffuseColor=color;
    material.emissiveColor=color.scale(0.35);
    material.specularColor=Color3.Black();
    material.alpha=alpha;
    material.backFaceCulling=false;
    mesh.material=material;
    this.visionMaterials.push(material);
    return mesh;
  }

  private normalizeAngle(angle: number): number {
    return Math.atan2(Math.sin(angle),Math.cos(angle));
  }

  private clampAngle(angle: number,limit: number): number {
    return Math.max(-limit,Math.min(limit,angle));
  }
}
