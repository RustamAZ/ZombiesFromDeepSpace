import { Scene, Vector3 } from '@babylonjs/core';
import { VoxelDamageTarget } from '../../shooter/VoxelDamageTarget';
import type { VoxelDebrisController } from '../voxel/VoxelDebrisController';
import { SlidingDoorVisual } from './SlidingDoorVisual';
import { slidingDoorConfig } from './config';

export type SlidingDoorState = 'closed' | 'opening' | 'open' | 'closing';

export class SlidingDoor {
  readonly visual: SlidingDoorVisual;
  readonly targets: readonly VoxelDamageTarget[];
  private readonly initialCells:number;
  private stateValue: SlidingDoorState = 'closed';
  private closeIn = 0;
  private slideProgress = 0;

  constructor(
    scene: Scene,
    debris: VoxelDebrisController,
    private readonly center: Vector3,
    readonly yaw: number,
    width: number,
    private readonly onClosed: (target: VoxelDamageTarget, initial: boolean) => void,
    private readonly onOpened: (target: VoxelDamageTarget) => void,
    readonly config = slidingDoorConfig
  ) {
    this.visual = new SlidingDoorVisual(scene, debris, center, yaw, width, config.panelHeight, config.voxelLayers);
    this.targets = [
      new VoxelDamageTarget(this.visual.left, 'soft', 0),
      new VoxelDamageTarget(this.visual.right, 'soft', 0)
    ];
    this.initialCells=this.targets.reduce((total,target)=>total+target.model.remainingCells,0);
    for (const target of this.targets) this.onClosed(target, true);
  }

  get state(): SlidingDoorState { return this.stateValue; }
  private get remainingCells(): number {
    return this.targets.reduce((total,target)=>total+target.model.remainingCells,0);
  }
  get isDamaged(): boolean {
    return this.remainingCells<this.initialCells;
  }
  get isJammed(): boolean {
    return this.initialCells-this.remainingCells>=this.initialCells*this.config.maxDestroyedFractionToOpen;
  }
  get position(): Readonly<Vector3> { return this.center; }

  tryInteract(playerPosition: Vector3): boolean {
    if (Vector3.DistanceSquared(playerPosition, this.center) > this.config.interactionRange ** 2) return false;
    if (this.stateValue === 'closed' || this.stateValue === 'closing') {
      if (this.isJammed) return false;
      this.open();
    }
    else this.close();
    return true;
  }

  update(dt: number, occupied: (point: Vector3) => boolean): void {
    if (this.stateValue === 'opening') {
      this.slideProgress = Math.min(1, this.slideProgress + dt / this.config.slideDurationSeconds);
      this.visual.setOffset(this.slideProgress * this.config.slideDistance);
      if (this.slideProgress === 1) {
        this.stateValue = 'open';
        this.closeIn = this.config.autoCloseSeconds;
      }
      return;
    }

    if (this.stateValue === 'open') {
      this.closeIn -= dt;
      if (this.closeIn <= 0 && !occupied(this.center)) this.stateValue = 'closing';
      return;
    }

    if (this.stateValue === 'closing') {
      if (occupied(this.center)) {
        this.stateValue = 'open';
        this.closeIn = this.config.autoCloseSeconds;
        return;
      }
      this.slideProgress = Math.max(0, this.slideProgress - dt / this.config.slideDurationSeconds);
      this.visual.setOffset(this.slideProgress * this.config.slideDistance);
      if (this.slideProgress === 0) {
        for (const target of this.targets) this.onClosed(target, false);
        this.stateValue = 'closed';
      }
    }
  }

  open(): void {
    if (this.isJammed && this.stateValue!=='open') return;
    if (this.stateValue === 'open') {
      this.closeIn = this.config.autoCloseSeconds;
      return;
    }
    for (const target of this.targets) this.onOpened(target);
    this.stateValue = 'opening';
  }

  close(): void {
    if (this.stateValue !== 'closed') this.stateValue = 'closing';
  }
}
