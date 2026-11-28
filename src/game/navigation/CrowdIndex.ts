import type { Vector3 } from '@babylonjs/core';

// A cell is roughly one zombie wide. The broad phase never decides collision by itself.
const cellSize=1.25;
class PointBuckets {
  readonly cells=new Map<string,Map<Vector3,Vector3>>();
  readonly membership=new Map<Vector3,string>();

  set(owner:Vector3,point:Vector3|undefined):void {
    const previous=this.membership.get(owner);
    const key=point && Math.floor(point.x/cellSize)+':'+Math.floor(point.z/cellSize);
    if(previous!==key && previous!==undefined) {
      const bucket=this.cells.get(previous)!;
      bucket.delete(owner);
      if(!bucket.size)this.cells.delete(previous);
      this.membership.delete(owner);
    }
    if(point && key!==undefined) {
      let bucket=this.cells.get(key);
      if(!bucket)this.cells.set(key,bucket=new Map());
      bucket.set(owner,point);
      if(previous!==key)this.membership.set(owner,key);
    }
  }
}

export class CrowdIndex {
  private readonly bodies=new PointBuckets();
  private readonly reservations=new PointBuckets();
  constructor(private readonly record?:(ms:number,candidates:number)=>void) {}

  sync(position:Vector3,reservation?:Vector3):void {
    this.bodies.set(position,position);
    this.reservations.set(position,reservation);
  }
  remove(position:Vector3):void {
    this.bodies.set(position,undefined);
    this.reservations.set(position,undefined);
  }
  has(position:Vector3):boolean { return this.bodies.membership.has(position); }

  some(self:Vector3,from:Vector3,to:Vector3,radius:number,test:(p:Vector3)=>boolean,reserved=false):boolean {
    const start=this.record ? performance.now() : 0;
    const cells=(reserved ? this.reservations : this.bodies).cells;
    const x0=Math.floor((Math.min(from.x,to.x)-radius)/cellSize),x1=Math.floor((Math.max(from.x,to.x)+radius)/cellSize);
    const z0=Math.floor((Math.min(from.z,to.z)-radius)/cellSize),z1=Math.floor((Math.max(from.z,to.z)+radius)/cellSize);
    let candidates=0,found=false;
    search: for(let x=x0;x<=x1;++x)for(let z=z0;z<=z1;++z) {
      const bucket=cells.get(x+':'+z);
      if(!bucket)continue;
      for(const [owner,point] of bucket) {
        if(owner===self)continue;
        ++candidates;
        if(test(point)){found=true;break search;}
      }
    }
    this.record?.(performance.now()-start,candidates);
    return found;
  }
}
