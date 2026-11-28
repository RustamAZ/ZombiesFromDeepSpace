import { Vector3 } from '@babylonjs/core';
import { buildingConfig as cfg } from './config';

export interface PlacementCell {
  readonly id:string;
  readonly roomId:string;
  readonly position:Vector3;
}

export class PlacementGrid {
  private readonly occupied=new Set<string>();
  private readonly roomCounts=new Map<string,number>();

  constructor(private readonly limits:Readonly<Record<string,number>>={}) {}

  candidate(point:Vector3,roomId:string,center:Vector3):PlacementCell {
    const x=Math.round((point.x-center.x)/cfg.cellSize),z=Math.round((point.z-center.z)/cfg.cellSize);
    return this.cell(roomId,center,x,z);
  }

  *cells(roomId:string,center:Vector3,extent:number):IterableIterator<PlacementCell> {
    const n=Math.floor(extent/cfg.cellSize);
    for (let x=-n;x<=n;x++) for (let z=-n;z<=n;z++) yield this.cell(roomId,center,x,z);
  }

  hasRoomCapacity(roomId:string):boolean {
    return (this.roomCounts.get(roomId) ?? 0)<(this.limits[roomId] ?? cfg.maxTurretsPerRoom);
  }

  isFree(cell:PlacementCell):boolean { return this.hasRoomCapacity(cell.roomId) && !this.occupied.has(cell.id); }

  occupy(cell:PlacementCell):boolean {
    if (!this.isFree(cell)) return false;
    this.occupied.add(cell.id);
    this.roomCounts.set(cell.roomId,(this.roomCounts.get(cell.roomId) ?? 0)+1);
    return true;
  }

  private cell(roomId:string,center:Vector3,x:number,z:number):PlacementCell {
    return {id:`${roomId}:${x}:${z}`,roomId,position:new Vector3(center.x+x*cfg.cellSize,0,center.z+z*cfg.cellSize)};
  }
}
