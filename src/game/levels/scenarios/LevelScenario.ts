import type { RequirementGroup } from '../requirements/Requirement';

export interface ScenarioContext {
  isClean():boolean;
  doorsRepaired():boolean;
  turretReady(id:string):boolean;
  emptyTurret(id:string):void;
  addCoins(amount:number):void;
  ensureCoins(amount:number):void;
  serviceCost():number;
}

export abstract class LevelScenario {
  abstract readonly objective:string;
  abstract readonly requirements:RequirementGroup;
  abstract readonly defeatCompletesLevel:boolean;
  abstract onWaveCompleted(wave:number):void;
  abstract onWaveStarted(wave:number):void;
}
