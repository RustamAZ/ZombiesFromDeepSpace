import { Vector3 } from '@babylonjs/core';

type VacuumData = { start: Vector3; destination: Vector3; elapsed: number; duration: number };

export class VoxelDebrisController {
  private readonly queue: Array<{
    evict:()=>void;
    deactivatePhysics:()=>void;
    updateFallback:(dt:number)=>void;
    isVisible:()=>boolean;
    physical:boolean;
    position?:()=>Vector3;
    move?:(point:Vector3, scale:number)=>void;
    vacuum?:VacuumData;
    owner?:object;
  }> = [];

  constructor(private readonly capacity: number) {}

  register(evict: () => void, deactivatePhysics: () => void,
    updateFallback: (dt: number) => void, isVisible: () => boolean, physical = true,
    position?:()=>Vector3, move?:(point:Vector3, scale:number)=>void, owner?:object): void {
    this.queue.push({evict,deactivatePhysics,updateFallback,isVisible,physical,position,move,owner});
    this.trimPhysicsOverflow();
    this.trimInvisibleOverflow();
  }

  hasOwner(owner:object):boolean { return this.queue.some(entry=>entry.owner===owner); }

  evictOwner(owner:object): void {
    for (let i=this.queue.length-1;i>=0;--i) {
      if (this.queue[i].owner!==owner) continue;
      this.queue.splice(i,1)[0].evict();
    }
  }

  countIn(bounds:{min:Vector3;max:Vector3}, includeVacuum=false): number {
    let count=0;
    for (const entry of this.queue) {
      const point=entry.position?.();
      if (point && (includeVacuum || !entry.vacuum) && point.x>=bounds.min.x && point.x<=bounds.max.x &&
        point.z>=bounds.min.z && point.z<=bounds.max.z) ++count;
    }
    return count;
  }

  update(dt: number): void {
    for (let i=this.queue.length-1;i>=0;--i) {
      const entry=this.queue[i];
      if (entry.vacuum) {
        const suction=entry.vacuum;
        suction.elapsed=Math.min(suction.duration,suction.elapsed+dt);
        const t=suction.elapsed/suction.duration;
        const eased=t*t*(3-2*t);
        const shrink=Math.max(0,1-Math.max(0,eased-0.88)/0.12);
        entry.move?.(Vector3.Lerp(suction.start,suction.destination,eased),shrink);
        if (t>=1) { this.queue.splice(i,1); entry.evict(); }
      } else if (!entry.physical) entry.updateFallback(dt);
    }
    this.trimPhysicsOverflow();
    this.trimInvisibleOverflow();
  }

  vacuum(bounds:{min:Vector3;max:Vector3}, destination:Vector3, duration=0.65): number {
    let count=0;
    for (const entry of this.queue) {
      const point=entry.position?.();
      if (!point || entry.vacuum || point.x<bounds.min.x || point.x>bounds.max.x ||
        point.z<bounds.min.z || point.z>bounds.max.z) continue;
      if (entry.physical) { entry.deactivatePhysics(); entry.physical=false; }
      entry.vacuum={start:point,destination:destination.clone(),elapsed:0,duration};
      ++count;
    }
    return count;
  }

  private trimPhysicsOverflow(): void {
    let physicalCount=this.queue.reduce((count,entry)=>count+Number(entry.physical),0);
    while (physicalCount>this.capacity) {
      const invisible=this.queue.findIndex(entry=>entry.physical && !entry.isVisible());
      if (invisible>=0) {
        this.queue.splice(invisible,1)[0].evict();
      } else {
        const oldest=this.queue.find(entry=>entry.physical);
        if (!oldest) return;
        oldest.deactivatePhysics();
        oldest.physical=false;
      }
      --physicalCount;
    }
  }

  private trimInvisibleOverflow(): void {
    while (this.queue.length>this.capacity) {
      const index=this.queue.findIndex(entry=>!entry.isVisible());
      if (index<0) return;
      this.queue.splice(index,1)[0].evict();
    }
  }
}
