import { Vector3 } from '@babylonjs/core';
import { buildingConfig as cfg } from './config';

export class PlacementGrid {
  private readonly occupied=new Set<string>();
  candidate(point:Vector3,roomId:string,center:Vector3) {
    const x=Math.round((point.x-center.x)/cfg.cellSize),z=Math.round((point.z-center.z)/cfg.cellSize);
    return {id:roomId+':'+x+':'+z,position:new Vector3(center.x+x*cfg.cellSize,0,center.z+z*cfg.cellSize)};
  }
  isFree(id:string):boolean { return !this.occupied.has(id); }
  occupy(id:string):boolean { if (!this.isFree(id)) return false; this.occupied.add(id); return true; }
}
