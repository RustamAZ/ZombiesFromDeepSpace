import type { Vector3 } from '@babylonjs/core';
import type { CarryItem } from '../entities/carry/CarrySlot';
export type BuildDefinition={price:number;footprint:number;create(position:Vector3):void};

export class BuildCatalog {
  private readonly definitions=new Map<string,BuildDefinition>();
  register(type:string,definition:BuildDefinition):void { this.definitions.set(type,definition); }
  get(type:string):BuildDefinition|undefined { return this.definitions.get(type); }
  kit(type:string):CarryItem { return {type:'construction-kit',placementType:type}; }
}
