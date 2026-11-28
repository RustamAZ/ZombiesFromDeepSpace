import { LevelScenario, type ScenarioContext } from '../scenarios/LevelScenario';
import { RequirementGroup, StateRequirement } from '../requirements/Requirement';
import { levelTexts } from '../../ui/levelTexts';

export class SurvivalScenario extends LevelScenario {
  readonly objective=levelTexts.defend;
  readonly defeatCompletesLevel=false;
  requirements=new RequirementGroup();
  constructor(private readonly context:ScenarioContext,private readonly finalWave?:number) { super(); }
  onWaveStarted():void { this.requirements=new RequirementGroup(); }
  onWaveCompleted(wave:number):void {
    if (wave===this.finalWave) return;
    this.requirements=new RequirementGroup([new StateRequirement(levelTexts.clean,()=>this.context.isClean())]);
  }
}
