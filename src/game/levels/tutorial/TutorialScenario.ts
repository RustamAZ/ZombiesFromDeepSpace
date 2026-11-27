import { LevelScenario, type ScenarioContext } from '../scenarios/LevelScenario';
import { RequirementGroup, StateRequirement } from '../requirements/Requirement';
import { levelTexts } from '../../ui/levelTexts';
import { tutorialRules } from './config';

export class TutorialScenario extends LevelScenario {
  objective:string=levelTexts.firstFight;
  requirements=new RequirementGroup();
  defeatCompletesLevel=false;
  private completedWave=0;
  constructor(private readonly context:ScenarioContext) { super(); }
  onWaveStarted(wave:number):void {
    this.requirements=new RequirementGroup();
    this.defeatCompletesLevel=wave>=3;
    this.objective=wave>=3 ? levelTexts.lastStand : levelTexts.defend;
  }
  onWaveCompleted(wave:number):void {
    if (wave<=this.completedWave) return;
    this.completedWave=wave;
    if (wave===1) this.context.addCoins(tutorialRules.bonusCoins);
    else this.context.emptyTurret(tutorialRules.turretId);
    // Training must remain completable even if coins were spent before this stage.
    this.context.ensureCoins(Math.max(tutorialRules.minimumServiceCoins,this.context.serviceCost()));
    this.objective=wave===1 ? levelTexts.restoreStage : levelTexts.reloadStage;
    this.requirements=new RequirementGroup([
      new StateRequirement(levelTexts.repairDoor,()=>this.context.doorsRepaired()),
      new StateRequirement(wave===1?levelTexts.rebuild:levelTexts.reload,()=>this.context.turretReady(tutorialRules.turretId)),
      new StateRequirement(levelTexts.clean,()=>this.context.isClean())
    ]);
  }
}
