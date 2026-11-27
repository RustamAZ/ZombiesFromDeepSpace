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
  private destroyed=false;
  private damageSource?: EnemyTarget;
  readonly level=1;
  constructor(private readonly scene: Scene, readonly visual: CubeTurretVisual,
    private readonly projectiles: ProjectileSystem, private readonly enemies: () => readonly Enemy[],
    readonly config=cubeTurretConfig, private readonly onShot:()=>void = () => {}) {
    super(); this.currentHealth=config.maxHealth; this.currentAmmo=config.startingAmmo;
  }
  get range(): number { return this.config.range; }
  get health(): number { return this.currentHealth; }
  get maxHealth(): number { return this.config.maxHealth; }
  get ammo(): number { return this.currentAmmo; }
  get maxAmmo(): number { return this.config.maxAmmo; }
  get isDestroyed(): boolean { return this.destroyed; }
  emptyAmmo():void { this.currentAmmo=0; }
  get position(): Readonly<Vector3> { return this.visual.root.position; }
  setDamageSource(source: EnemyTarget): void { this.damageSource=source; }
  update(dt: number, timeSeconds: number): void {
    if (this.destroyed || this.currentAmmo===0) return;
    const target=this.findTarget(); if (!target) return;
    const delta=target.debug.position.subtract(this.position); delta.y=0;
    const desired=Math.atan2(delta.x,delta.z);
    const current=this.visual.getYaw();
    const difference=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
    const step=Math.max(-this.config.turnRadiansPerSecond*dt,Math.min(this.config.turnRadiansPerSecond*dt,difference));
    this.visual.setYaw(current+step);
    if (this.config.autoFire && Math.abs(difference)<0.08) this.tryFire(timeSeconds);
  }
  tryFire(timeSeconds: number): boolean {
    if (this.destroyed || this.currentAmmo===0 || timeSeconds<this.nextShotAt) return false;
    const muzzle=this.visual.muzzle.getAbsolutePosition();
    const direction=this.visual.muzzle.forward.normalize();
    this.projectiles.launch(muzzle,direction,{
      damage:this.config.damage, penetration:this.config.penetration, impactRadius:this.config.impactRadius,
      source:this.damageSource,
      speedUnitsPerSecond:this.config.projectileSpeedUnitsPerSecond, cubeSize:this.config.projectileCubeSize,
      range:this.config.projectileRange
    });
    --this.currentAmmo; this.nextShotAt=timeSeconds+this.config.shotIntervalSeconds;
    this.onShot();
    return true;
  }
  takeDamage(amount: number): void { if (!this.destroyed && amount>0) { this.currentHealth=Math.max(0,this.currentHealth-amount); if (!this.currentHealth) this.die(); } }
  die(): void { if (!this.destroyed) { this.destroyed=true; this.visual.setDestroyed(true); } }
  repair(amount: number): number { if (amount<=0) return 0; const restored=Math.min(amount,this.maxHealth-this.currentHealth); this.currentHealth+=restored; if (this.currentHealth>0) { this.destroyed=false; this.visual.setDestroyed(false); } return restored; }
  reload(amount: number): number { if (amount<=0) return 0; const loaded=Math.min(amount,this.maxAmmo-this.currentAmmo); this.currentAmmo+=loaded; return loaded; }
  rebuild(): void {
    this.currentHealth=this.maxHealth;
    this.currentAmmo=this.maxAmmo;
    this.destroyed=false;
    this.visual.setDestroyed(false);
  }
  upgrade(): boolean { return false; }
  private findTarget(): Enemy | undefined {
    return this.enemies().filter(enemy=>enemy.state!=='dead').map(enemy=>({enemy,distance:Vector3.DistanceSquared(enemy.debug.position,this.position)}))
      .filter(({enemy,distance})=>distance<=this.range*this.range && this.canSee(enemy)).sort((a,b)=>a.distance-b.distance)[0]?.enemy;
  }
  private canSee(enemy: Enemy): boolean {
    const origin=this.visual.muzzle.getAbsolutePosition(), delta=enemy.aimPoint.subtract(origin), distance=delta.length();
    if (distance<0.001) return true;
    const hit=this.scene.pickWithRay(new Ray(origin,delta.scale(1/distance),distance),mesh=>mesh.isPickable && mesh.checkCollisions && mesh.isEnabled());
    return !hit?.hit || (hit.pickedMesh!==null && enemy.ownsMesh(hit.pickedMesh));
  }
}
