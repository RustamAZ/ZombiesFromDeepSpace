import { Ray, Scene, Vector3 } from '@babylonjs/core';
import type { Enemy } from '../../enemies/Enemy';
import type { ProjectileSystem } from '../../../shooter/ProjectileSystem';
import { Turret } from '../Turret';
import { CubeTurretVisual } from './CubeTurretVisual';
import { cubeTurretConfig } from './config';
import type { EnemyTarget } from '../../enemies/Enemy';

export class CubeTurret extends Turret {
  private currentHealth: number;
  private currentAmmo: number;
  private nextShotAt=0;
  private target?: Enemy;
  private readonly candidates:Enemy[]=[];
  private candidateIndex=0;
  private nextScanAt=0;
  private destroyed=false;
  private damageSource?: EnemyTarget;
  private levelIndex=0;
  constructor(private readonly scene: Scene, readonly visual: CubeTurretVisual,
    private readonly projectiles: ProjectileSystem, private readonly enemies: () => readonly Enemy[],
    readonly config=cubeTurretConfig, private readonly onShot:()=>void = () => {},
    private readonly onSightRay?:()=>void) {
    super(); this.currentHealth=config.maxHealth; this.currentAmmo=config.startingAmmo;
    this.applyLevelVisual();
  }
  get level(): number { return this.levelIndex+1; }
  get range(): number { return this.config.range; }
  get health(): number { return this.currentHealth; }
  get maxHealth(): number { return this.config.maxHealth; }
  get ammo(): number { return this.currentAmmo; }
  get maxAmmo(): number { return this.config.maxAmmo; }
  get isDestroyed(): boolean { return this.destroyed; }
  get isArmed(): boolean { return !this.destroyed && this.currentAmmo>0 && this.config.autoFire; }
  emptyAmmo():void { this.currentAmmo=0; this.clearTargeting(); }
  get position(): Readonly<Vector3> { return this.visual.root.position; }
  setDamageSource(source: EnemyTarget): void { this.damageSource=source; }
  update(dt: number, timeSeconds: number): void {
    if (this.destroyed || this.currentAmmo===0) return;
    if (this.target && !this.inRange(this.target)) { this.target=undefined; this.nextScanAt=0; }
    const confirmed=this.scanCandidate(timeSeconds);
    const target=this.target; if (!target) return;
    const delta=target.position.subtract(this.position); delta.y=0;
    const desired=Math.atan2(delta.x,delta.z);
    const current=this.visual.getYaw();
    const difference=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
    const step=Math.max(-this.config.turnRadiansPerSecond*dt,Math.min(this.config.turnRadiansPerSecond*dt,difference));
    this.visual.setYaw(current+step);
    if (this.config.autoFire && Math.abs(difference)<0.08 && timeSeconds>=this.nextShotAt) {
      if (confirmed || this.canSee(target)) this.tryFire(timeSeconds);
      else { this.target=undefined; this.nextScanAt=0; }
    }
  }
  tryFire(timeSeconds: number): boolean {
    if (this.destroyed || this.currentAmmo===0 || timeSeconds<this.nextShotAt) return false;
    this.visual.muzzle.computeWorldMatrix(true);
    const muzzle=this.visual.muzzle.getAbsolutePosition();
    const direction=this.visual.muzzle.forward.normalize();
    const level=this.config.levels[this.levelIndex];
    this.projectiles.launch(muzzle,level.createProjectile(direction,this.damageSource));
    --this.currentAmmo; this.nextShotAt=timeSeconds+this.config.shotIntervalSeconds/level.fireRateMultiplier;
    if (!this.currentAmmo) this.clearTargeting();
    this.onShot();
    return true;
  }
  takeDamage(amount: number): void { if (!this.destroyed && amount>0) { this.currentHealth=Math.max(0,this.currentHealth-amount); if (!this.currentHealth) this.die(); } }
  die(): void { if (!this.destroyed) { this.destroyed=true; this.clearTargeting(); this.visual.setDestroyed(true); } }
  repair(amount: number): number { if (amount<=0) return 0; const restored=Math.min(amount,this.maxHealth-this.currentHealth); this.currentHealth+=restored; if (this.currentHealth>0) { this.destroyed=false; this.visual.setDestroyed(false); } return restored; }
  reload(amount: number): number { if (amount<=0) return 0; const loaded=Math.min(amount,this.maxAmmo-this.currentAmmo); this.currentAmmo+=loaded; return loaded; }
  rebuild(): void {
    this.currentHealth=this.maxHealth;
    this.currentAmmo=this.maxAmmo;
    this.destroyed=false;
    this.visual.setDestroyed(false);
  }
  getNextUpgrade() {
    const next=this.config.levels[this.levelIndex+1];
    return !this.destroyed && next ? {level:this.level+1,cost:next.cost} : undefined;
  }
  upgrade(): boolean {
    if (!this.getNextUpgrade()) return false;
    ++this.levelIndex;
    this.applyLevelVisual();
    return true;
  }
  private applyLevelVisual(): void {
    const level=this.config.levels[this.levelIndex];
    this.visual.setHeadSize(level.headScale,level.headHeight);
  }
  private inRange(enemy:Enemy):boolean {
    return enemy.state!=='dead' && Vector3.DistanceSquared(enemy.position,this.position)<=this.range*this.range;
  }
  private clearTargeting():void {
    this.target=undefined;
    this.candidates.length=this.candidateIndex=0;
    this.nextScanAt=0;
  }
  private scanCandidate(time:number):boolean {
    if (this.candidateIndex===this.candidates.length) {
      if (time<this.nextScanAt) return false;
      this.candidates.length=this.candidateIndex=0;
      for (const enemy of this.enemies()) if (this.inRange(enemy)) this.candidates.push(enemy);
      const origin=this.position;
      this.candidates.sort((a,b)=>Vector3.DistanceSquared(a.position,origin)-Vector3.DistanceSquared(b.position,origin));
    }
    // Continue behind occluded candidates next frame instead of raycasting the whole crowd.
    while (this.candidateIndex<this.candidates.length) {
      const enemy=this.candidates[this.candidateIndex++];
      if (!this.inRange(enemy)) continue;
      if (this.canSee(enemy)) {
        this.target=enemy;
        this.candidates.length=this.candidateIndex=0;
        this.nextScanAt=time+this.config.targetRefreshSeconds;
        return true;
      }
      if (this.target===enemy) this.target=undefined;
      break;
    }
    if (this.candidateIndex===this.candidates.length) this.nextScanAt=time+this.config.targetRefreshSeconds;
    return false;
  }
  private canSee(enemy: Enemy): boolean {
    const origin=this.visual.muzzle.getAbsolutePosition(), delta=enemy.aimPoint.subtract(origin), distance=delta.length();
    if (distance<0.001) return true;
    this.onSightRay?.();
    const hit=this.scene.pickWithRay(new Ray(origin,delta.scale(1/distance),distance),mesh=>mesh.isPickable && mesh.checkCollisions && mesh.isEnabled());
    return !hit?.hit || (hit.pickedMesh!==null && enemy.ownsMesh(hit.pickedMesh));
  }
}
