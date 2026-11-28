import { Vector3 } from '@babylonjs/core';
import type { DebrisArea } from '../voxel/VoxelDebrisController';
import { CleanupButtonVisual } from './CleanupButtonVisual';
import { cleanupButtonConfig } from './config';

export class CleanupButton {
  constructor(readonly roomId:string, readonly visual:CleanupButtonVisual,
    readonly bounds:DebrisArea, readonly config=cleanupButtonConfig) {}

  get position(): Vector3 { return this.visual.root.position; }

  inRange(position:Vector3): boolean {
    return Vector3.DistanceSquared(this.position,position)<=this.config.interactionRange**2;
  }

  setActive(active:boolean): void { this.visual.setActive(active); }
}
