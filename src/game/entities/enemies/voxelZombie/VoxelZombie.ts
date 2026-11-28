import { type AbstractMesh, Color3, Mesh, MeshBuilder, Ray, Scene, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import { Enemy, type EnemyTarget } from '../Enemy';
import { EnemyController } from '../EnemyController';
import { VoxelModel } from '../../voxel/VoxelModel';
import type { VoxelDebrisController } from '../../voxel/VoxelDebrisController';
import type { VoxVoxel } from '../../voxel/VoxAsset';
import type { NavigationCell, NavigationGrid } from '../../../navigation/NavigationGrid';
import type { PathBuildQueue } from '../../../navigation/PathBuildQueue';
import type { CrowdIndex } from '../../../navigation/CrowdIndex';
import type { NavigationFrameStats } from '../../../navigation/NavigationFrameStats';
import type { ActiveMeshBreakdown } from '../../../navigation/ActiveMeshBreakdown';
import { VoxelDamageTarget } from '../../../shooter/VoxelDamageTarget';
import type { Impact } from '../../projectiles/Projectile';
import { zombieConfig as cfg } from './config';
import { ZombieTargetPriority, type TargetContext } from './ZombieTargetPriority';

export interface ZombieObstacleBreaker {
  break(cell: NavigationCell, direction: Vector3, impact: Impact): boolean;
}

export class VoxelZombie extends Enemy {
  readonly config=cfg;
  readonly target: VoxelDamageTarget;
  private readonly ai: EnemyController;
  private readonly priority: ZombieTargetPriority;
  private targetRefreshIn:number;
  private readonly face: TransformNode;
  private readonly eyes: Mesh[]=[];
  private readonly eyePaint: StandardMaterial;
  private readonly visionRoot: TransformNode;
  private readonly visionMaterials: StandardMaterial[]=[];
  private hearingArea?: Mesh;
  private health: number=cfg.maxHealth;
  private deathTime = -1;
  private deathCollapsed = false;
  private readonly headPivot=new Vector3(-cfg.cell/2,cfg.cell*cfg.headStartRow,-cfg.cell/2);
  private headYaw=0;
  private appliedHeadYaw=0; // The voxel mesh is created in its neutral pose.
  private poseSkipped=false;
  private desiredHeadYaw=0;
  private lastAimYaw=NaN;
  private lastAimTarget?:EnemyTarget;
  private lastAimingAttack=false;
  private lastBodyYaw=NaN;
  private lastLean=NaN;
  private readonly lastFeet=new Vector3(NaN,NaN,NaN);
  private readonly faceOffset=Vector3.Zero();
  private windupEyes?:boolean;
  private wallAttackPhase: 'idle'|'windup'|'recovery'='idle';
  private wallAttackTime=0;
  private wallAttackDirection=Vector3.Forward();
  private wallAttackLean=0;
  private attackCell?: NavigationCell;
  private readonly ownMeshes: ReadonlySet<AbstractMesh>;
  get state() { return this.ai.state; }
  get deathComplete(): boolean { return this.deathCollapsed; }
  get debug() { return this.ai.debug; }
  get position(): Readonly<Vector3> { return this.ai.position; }
  get aimPoint(): Vector3 { return this.aimPointToRef(Vector3.Zero()); }
  aimPointToRef(out:Vector3):Vector3 {
    const feet=this.ai.position;
    return out.set(feet.x,feet.y+cfg.height*cfg.cell*0.5,feet.z);
  }
  ownsMesh(mesh: AbstractMesh): boolean { return this.ownMeshes.has(mesh) && !mesh.isDisposed(); }

  constructor(private readonly scene: Scene, spawn: Vector3, private readonly grid: NavigationGrid, debris: VoxelDebrisController,
    private readonly obstacleBreaker: ZombieObstacleBreaker,
    private readonly crowd:CrowdIndex, private readonly core: EnemyTarget,
    private readonly onDefeated?: (position:Vector3)=>void,
    private readonly getTargetContext?:(position:Vector3,player:EnemyTarget)=>TargetContext,
    pathfinding=true, private readonly targetRefreshSeconds=0, builds?:PathBuildQueue, meshStats?:ActiveMeshBreakdown) {
    super();
    this.priority=new ZombieTargetPriority(core);
    // Spread target queries from a single spawn batch across the interval.
    this.targetRefreshIn=targetRefreshSeconds>0 ? Math.random()*targetRefreshSeconds : 0;
    const voxels: VoxVoxel[]=[];
    for (let x=0;x<cfg.width;++x) for (let y=0;y<cfg.depth;++y) for (let z=0;z<cfg.height;++z)
      voxels.push({x,y,z,colorIndex:z<3?0:z<cfg.headStartRow?1:2});
    const model=VoxelModel.fromData(scene,{size:new Vector3(cfg.width,cfg.depth,cfg.height),voxels,
      palette:['#374A64','#625585','#83BD78'].map(hex=>Color3.FromHexString(hex))},spawn.clone(),debris,cfg.cell);
    this.target=new VoxelDamageTarget(model,cfg.material,undefined,(_,normal,impact)=>{
      // The surface normal faces the shooter, so the opposite direction pushes the zombie back.
      this.ai.applyKnockback(normal.negate(),cfg.hitKnockbackSpeed);
      this.ai.applyHitSlow(cfg.hitSlowSeconds);
      this.takeProjectileDamage(impact.damage);
    });
    this.ownMeshes=new Set<AbstractMesh>(model.getIntactMeshes());
    for (const m of this.ownMeshes) {
      m.isPickable=m.checkCollisions=true;
      meshStats?.tag(m,'zombies');
    }
    this.face=new TransformNode('zombie-face',scene);
    this.visionRoot=new TransformNode('zombie-vision',scene);
    meshStats?.tag(this.face,'zombies');
    meshStats?.tag(this.visionRoot,'zombies');
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
    this.ai=new EnemyController(spawn.clone(),grid,cfg,crowd,pathfinding,builds);
    crowd.sync(this.ai.position);
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
    // Attack sight must use the current eyes even when the camera stopped animating them.
    if(this.poseSkipped)this.syncFace(true,true,true,true);
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

  update(dt: number, player: EnemyTarget, stats?:NavigationFrameStats, animate=true): void {
    let stamp=stats?.enemyClock() ?? 0;
    if (this.state==='dead') {
      this.updateDeath(dt,animate);
      stats?.endEnemyStage('death',stamp);
      return;
    }
    const target=this.selectTarget(dt,player);
    if(stats)stamp=stats.endEnemyStage('target',stamp);
    this.ai.update(dt,target,player,()=>this.canSee(this.scene,this.ownMeshes,player));
    this.crowd.sync(this.ai.position,this.ai.assaultPosition);
    if (this.getTargetContext && this.ai.playerBlocked && target!==player) this.priority.blockedBy(player);
    if(stats)stamp=stats.endEnemyStage('movement',stamp);
    this.updateWallAttack(dt);
    if(stats)stamp=stats.endEnemyStage('wall',stamp);
    this.updateHeadTurn(dt,target);
    this.syncPose(animate);
    stats?.endEnemyStage('pose',stamp);
  }

  private updateHeadTurn(dt:number,target:EnemyTarget):void {
    const yaw=this.ai.yaw;
    const attacking=this.state==='windup' || this.wallAttackPhase==='windup';
    // Compare with the last aim event, so small incremental steering eventually triggers a turn.
    if(target!==this.lastAimTarget || (attacking && !this.lastAimingAttack) ||
        (yaw!==this.lastAimYaw && Math.abs(this.normalizeAngle(yaw-this.lastAimYaw))>=cfg.headRetargetAngle)) {
      const p=target.eyes,feet=this.ai.position;
      this.desiredHeadYaw=this.clampAngle(this.normalizeAngle(Math.atan2(p.x-feet.x,p.z-feet.z)-yaw),cfg.headTurnLimit);
      this.lastAimYaw=yaw;
      this.lastAimTarget=target;
    }
    this.lastAimingAttack=attacking;
    const remaining=this.desiredHeadYaw-this.headYaw;
    if(remaining!==0) {
      const step=cfg.headTurnSpeed*dt;
      this.headYaw=Math.abs(remaining)<=step ? this.desiredHeadYaw : this.headYaw+Math.sign(remaining)*step;
    }
  }

  private selectTarget(dt:number,player:EnemyTarget):EnemyTarget {
    if (!this.getTargetContext) return this.core;
    this.targetRefreshIn-=dt;
    if(this.targetRefreshIn<=0) {
      this.priority.update(this.getTargetContext(this.ai.position,player));
      this.targetRefreshIn=this.targetRefreshSeconds>0
        ? this.targetRefreshSeconds+(this.targetRefreshIn%this.targetRefreshSeconds) : 0;
    }
    return this.priority.resolve(Vector3.DistanceSquared(this.ai.position,player.feet));
  }

  private takeProjectileDamage(amount: number): void {
    if (this.state==='dead') return;
    this.health=Math.max(0,this.health-amount);
    if (this.health>0) return;
    this.ai.state='dead';
    this.crowd.remove(this.ai.position);
    this.deathTime=cfg.deathFallSeconds;
  }

  private updateDeath(dt: number,animate:boolean): void {
    if (this.deathCollapsed) return;
    this.deathTime-=dt;
    this.wallAttackLean=cfg.deathFallLean*(1-Math.max(0,this.deathTime)/cfg.deathFallSeconds);
    // Detached chunks must originate from the final fallen pose, even behind a wall.
    if(animate || this.deathTime<=0)this.syncPose();
    else this.skipVisualPose();
    if (this.deathTime>0) return;
    this.face.dispose();
    this.visionRoot.dispose();
    this.eyePaint.dispose();
    for (const material of this.visionMaterials) material.dispose();
    this.target.model.collapseRigidBands(cfg.headStartRow,this.appliedHeadYaw);
    this.onDefeated?.(this.ai.position.clone());
    this.deathCollapsed = true;
  }

  private skipVisualPose():void {
    if(this.poseSkipped)return;
    this.poseSkipped=true;
    this.face.setEnabled(false);
    if(cfg.showVisionDebug)this.visionRoot.setEnabled(false);
  }

  private syncPose(animate=true): void {
    const feet=this.ai.position, yaw=this.ai.yaw;
    const lean=this.wallAttackLean+this.ai.attackLean*cfg.attackLean;
    if(!animate) {
      this.skipVisualPose();
      // The intact mesh also handles projectile picking and player collision.
      this.target.model.setPose(feet,yaw,lean);
      return;
    }
    const resume=this.poseSkipped;
    if(resume) {
      this.poseSkipped=false;
      this.face.setEnabled(true);
      if(cfg.showVisionDebug)this.visionRoot.setEnabled(true);
    }
    const turning=resume || yaw!==this.lastBodyYaw, tilting=resume || lean!==this.lastLean;
    const moved=resume || !this.lastFeet.equals(feet), headTurn=this.headYaw!==this.appliedHeadYaw;
    const windup=this.state==='windup';
    if(windup!==this.windupEyes) {
      this.eyePaint.emissiveColor.set(1,windup?0.12:0.83,0.28);
      this.windupEyes=windup;
    }
    if(!moved && !turning && !tilting && !headTurn)return;
    if(moved || turning || tilting)this.target.model.setPose(feet,yaw,lean);
    if(headTurn) {
      this.target.model.setRegionYaw((_,gridY)=>gridY>=cfg.headStartRow,this.headPivot,this.headYaw);
      this.appliedHeadYaw=this.headYaw;
    }
    this.syncFace(moved,turning,tilting,headTurn);
    if(cfg.showVisionDebug) {
      if(moved)this.visionRoot.position.set(feet.x,feet.y+0.025,feet.z);
      if(turning || headTurn)this.visionRoot.rotation.y=yaw+this.headYaw;
      this.hearingArea?.setEnabled(this.ai.isAlerted);
    }
    if(moved)this.lastFeet.copyFrom(feet);
    this.lastBodyYaw=yaw;
    this.lastLean=lean;
  }

  private syncFace(moved:boolean,turning:boolean,tilting:boolean,headTurn:boolean):void {
    const feet=this.ai.position, yaw=this.ai.yaw;
    const lean=this.wallAttackLean+this.ai.attackLean*cfg.attackLean;
    if(turning || tilting) {
      const pitchSin=Math.sin(lean), pitchCos=Math.cos(lean);
      const pivotY=this.headPivot.y*pitchCos-this.headPivot.z*pitchSin;
      const pivotZ=this.headPivot.y*pitchSin+this.headPivot.z*pitchCos;
      const sin=Math.sin(yaw),cos=Math.cos(yaw);
      this.faceOffset.set(this.headPivot.x*cos+pivotZ*sin,pivotY,-this.headPivot.x*sin+pivotZ*cos);
    }
    if(moved || turning || tilting)feet.addToRef(this.faceOffset,this.face.position);
    if(tilting)this.face.rotation.x=lean;
    if(turning || headTurn)this.face.rotation.y=yaw+this.headYaw;
  }

  private updateWallAttack(dt: number): void {
    const cell=this.ai.breachCell;
    if (this.wallAttackPhase==='recovery') {
      this.wallAttackTime-=dt;
      const recovered=cfg.wallBreakRecovery-Math.max(0,this.wallAttackTime);
      this.wallAttackLean=cfg.wallBreakLean*Math.max(0,1-recovered/cfg.wallBreakVisualRecovery);
      if (this.wallAttackTime>0) return;
      this.wallAttackPhase='idle';
    }
    if (this.ai.state!=='chase') {
      this.wallAttackPhase='idle';
      this.wallAttackLean=0;
      this.attackCell=undefined;
      return;
    }
    if (this.wallAttackPhase==='idle') {
      if (!cell || !this.grid.canStrikeCell(this.ai.position,cell,cfg.wallBreakReach)) return;
      this.attackCell=cell;
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
    // Other attackers may have cleared the original voxel during our swing.
    const feet=this.ai.position;
    const hit=this.attackCell && this.grid.canStrikeCell(feet,this.attackCell,cfg.wallBreakReach)
      ? this.attackCell : this.grid.breakableAhead(feet,feet.add(this.wallAttackDirection),cfg.wallBreakReach);
    if (hit && this.grid.canStrikeCell(feet,hit,cfg.wallBreakReach)) this.obstacleBreaker.break(hit,this.wallAttackDirection,{
      damage:cfg.wallBreakDamage, penetration:cfg.wallBreakPenetration,
      impactRadius:cfg.wallBreakRadius, forceDestruction:true
    });
    this.attackCell=undefined;
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
