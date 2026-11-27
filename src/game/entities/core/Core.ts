import type { Vector3 } from '@babylonjs/core';
import { CoreVisual } from './CoreVisual';
import { coreConfig } from './config';

export class Core {
  private currentHealth: number;
  private destroyed=false;
  readonly visual: CoreVisual;

  constructor(visual: CoreVisual, readonly config=coreConfig, onDestroyed?: () => void) {
    this.visual=visual;
    this.currentHealth=config.maxHealth;
    this.onDestroyed=onDestroyed;
  }
  private readonly onDestroyed?: () => void;
  get health(): number { return this.currentHealth; }
  get maxHealth(): number { return this.config.maxHealth; }
  get isDestroyed(): boolean { return this.destroyed; }
  get position(): Vector3 { return this.visual.root.position; }
  takeDamage(amount: number): void {
    if (this.destroyed || amount<=0) return;
    this.currentHealth=Math.max(0,this.currentHealth-amount);
    if (this.currentHealth!==0) return;
    this.destroyed=true; this.visual.setDestroyed(true); this.onDestroyed?.();
  }
}
