export class VoxelDebrisController {
  private readonly queue: Array<{
    evict:()=>void;
    deactivatePhysics:()=>void;
    updateFallback:(dt:number)=>void;
    isVisible:()=>boolean;
    physical:boolean;
  }> = [];

  constructor(private readonly capacity: number) {}

  register(evict: () => void, deactivatePhysics: () => void,
    updateFallback: (dt: number) => void, isVisible: () => boolean): void {
    this.queue.push({evict,deactivatePhysics,updateFallback,isVisible,physical:true});
    this.trimPhysicsOverflow();
    this.trimInvisibleOverflow();
  }

  update(dt: number): void {
    for (const entry of this.queue) {
      if (!entry.physical) entry.updateFallback(dt);
    }
    this.trimPhysicsOverflow();
    this.trimInvisibleOverflow();
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
