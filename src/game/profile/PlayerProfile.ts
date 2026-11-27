import type { PlayerProfileData } from './PlayerProfileData';

export class PlayerProfile {
  private goldValue: number;
  private experienceValue: number;
  private tutorialCompletedValue:boolean;
  constructor(data: PlayerProfileData={version:1,gold:0,experience:0}) {
    this.goldValue=Number.isFinite(data.gold)?Math.max(0,data.gold):0;
    this.experienceValue=Number.isFinite(data.experience)?Math.max(0,data.experience):0;
    this.tutorialCompletedValue=data.tutorialCompleted===true;
  }
  get tutorialCompleted():boolean { return this.tutorialCompletedValue; }
  completeTutorial():void { this.tutorialCompletedValue=true; }
  get gold(): number { return this.goldValue; }
  get experience(): number { return this.experienceValue; }
  addGold(amount: number): void { this.goldValue+=Math.max(0,amount); }
  addExperience(amount: number): void { this.experienceValue+=Math.max(0,amount); }
  spendGold(amount: number): boolean { if (amount<0 || this.goldValue<amount) return false; this.goldValue-=amount; return true; }
  serialize(): PlayerProfileData { return {version:1,gold:this.goldValue,experience:this.experienceValue,tutorialCompleted:this.tutorialCompletedValue}; }
}
