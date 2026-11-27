import type { GameAudio } from '../audio/GameAudio';
import type { PlayerProfile } from '../profile/PlayerProfile';
import type { FirstPersonGame } from '../shooter/FirstPersonGame';
import type { LevelDefinition } from './LevelDefinition';

export class LevelSession {
  private constructor(readonly level:LevelDefinition,private readonly game:FirstPersonGame) {}
  static async create(canvas:HTMLCanvasElement,audio:GameAudio,level:LevelDefinition,profile:PlayerProfile,
    result:(completed:boolean)=>void,menu:()=>void):Promise<LevelSession> {
    const {FirstPersonGame}=await import('../shooter/FirstPersonGame');
    return new LevelSession(level,await FirstPersonGame.create(canvas,audio,level,profile,result,menu));
  }
  play(touch:boolean):Promise<void> { return this.game.play(touch); }
  start():void { this.game.start(); }
  dispose():void { this.game.dispose(); }
}
