import type { Core } from '../entities/core/Core';
import type { PlayerCharacter } from '../entities/player/PlayerCharacter';
import type { PlayerProfile } from '../profile/PlayerProfile';
import type { RunProfile } from '../profile/RunProfile';
import type { EnemyWaveController } from '../waves/EnemyWaveController';
import { texts } from './texts';
import { levelTexts } from './levelTexts';
import type { LevelScenario } from '../levels/scenarios/LevelScenario';
import type { NavigationFrameReport } from '../navigation/NavigationFrameStats';

type HealthMeter={track:HTMLDivElement;fill:HTMLDivElement;value:HTMLSpanElement};

export class RunHud {
  private readonly root: HTMLDivElement;
  private readonly player: HealthMeter;
  private readonly core: HealthMeter;
  private readonly wallet: HTMLDivElement;
  private readonly gold: HTMLSpanElement;
  private readonly experience: HTMLSpanElement;
  private readonly wave: HTMLDivElement;
  private readonly center: HTMLDivElement;
  private readonly centerHeading: HTMLDivElement;
  private readonly centerMain: HTMLDivElement;
  private readonly objective=document.createElement('p');
  private readonly tasks=document.createElement('ul');
  private readonly living=document.createElement('div');
  private lastLiving=0;
  private readonly dropHint=document.createElement('div');
  private navigationFrame?:HTMLDivElement;
  constructor() {
    this.root=document.createElement('div'); this.root.className='run-hud';
    this.player=this.createMeter(texts.player,'player');
    this.core=this.createMeter(texts.core,'core');
    const objective=this.objective;
    objective.className='run-hud__objective';
    objective.textContent=texts.objective;
    this.root.append(objective);
    this.tasks.className='run-hud__tasks';
    this.living.className='run-hud__living';
    this.living.textContent=texts.livingEnemies(0);
    this.root.append(this.tasks,this.living);
    this.wallet=document.createElement('div'); this.wallet.className='run-wallet';
    const coin=document.createElement('span'); coin.className='run-wallet__coin';
    coin.setAttribute('aria-hidden','true');
    this.gold=document.createElement('span'); this.gold.className='run-wallet__amount';
    this.experience=document.createElement('span'); this.experience.className='run-wallet__experience';
    this.wallet.append(coin,this.gold,this.experience);
    this.wave=document.createElement('div'); this.wave.className='wave-indicator';
    this.center=document.createElement('div'); this.center.className='wave-center-status';
    this.centerHeading=document.createElement('div'); this.centerHeading.className='wave-center-status__heading';
    this.centerMain=document.createElement('div'); this.centerMain.className='wave-center-status__main';
    this.center.append(this.centerHeading,this.centerMain);
    this.dropHint.className='held-kit-action';
    this.dropHint.textContent=`R · ${texts.interactR.drop}`;
    this.dropHint.hidden=true;
    document.querySelector('#workshop')!.append(this.root,this.wallet,this.wave,this.center,this.dropHint);
  }
  update(player: PlayerCharacter, core: Core, profile: PlayerProfile,
    run: RunProfile, waves: EnemyWaveController, scenario:LevelScenario): void {
    this.objective.textContent=scenario.objective;
    const signature=scenario.requirements.items.map(item=>`${item.complete}:${item.label}`).join('|');
    if (this.tasks.dataset.signature!==signature) {
      this.tasks.dataset.signature=signature;
      this.tasks.replaceChildren(...scenario.requirements.items.map(item=>{
        const row=document.createElement('li');
        row.textContent=`${item.complete?levelTexts.done:levelTexts.pending}: ${item.label}`;
        row.classList.toggle('is-complete',item.complete); return row;
      }));
    }
    this.updateMeter(this.player,player.health,player.maxHealth);
    this.updateMeter(this.core,core.health,core.maxHealth);
    this.gold.textContent=`${texts.coins}: ${run.coins}`;
    this.experience.textContent=`${texts.experience}: ${profile.experience}`;
    const s=waves.status;
    if(s.alive!==this.lastLiving) {
      this.living.textContent=texts.livingEnemies(s.alive);
      this.lastLiving=s.alive;
    }
    const counting=s.phase==='preparation' || s.phase==='intermission';
    const cleaning=s.phase==='objectives';
    const complete=s.phase==='complete';
    this.wave.hidden=counting || cleaning || complete;
    if (!this.wave.hidden) this.wave.textContent=texts.waveEnemies(s.wave,s.remaining);
    this.center.hidden=!counting && !cleaning && !complete;
    this.center.classList.toggle('wave-center-status--cleanup',cleaning || complete);
    this.centerHeading.textContent=counting ? texts.waveStartsIn(s.wave) : '';
    this.centerMain.textContent=counting
      ? String(Math.ceil(s.secondsRemaining)) : cleaning ? levelTexts.tasks : complete ? levelTexts.victory : '';
  }
  showDropHint(show:boolean):void { this.dropHint.hidden=!show; }
  showNavigationFrame(report:NavigationFrameReport):void {
    if(!this.navigationFrame) {
      this.navigationFrame=document.createElement('div');
      this.navigationFrame.className='run-hud__nav-stats';
      this.root.append(this.navigationFrame);
    }
    this.navigationFrame.textContent=texts.navigationFrame(report);
  }
  dispose(): void { this.root.remove(); this.wallet.remove(); this.wave.remove(); this.center.remove(); this.dropHint.remove(); }
  private createMeter(label:string,kind:string):HealthMeter {
    const root=document.createElement('div'); root.className=`health-meter health-meter--${kind}`;
    const heading=document.createElement('div'); heading.className='health-meter__heading';
    const name=document.createElement('span'); name.textContent=label;
    const value=document.createElement('span'); value.className='health-meter__value';
    heading.append(name,value);
    const track=document.createElement('div'); track.className='health-meter__track';
    track.setAttribute('role','progressbar'); track.setAttribute('aria-label',label);
    track.setAttribute('aria-valuemin','0');
    const fill=document.createElement('div'); fill.className='health-meter__fill';
    track.append(fill); root.append(heading,track); this.root.append(root);
    return {track,fill,value};
  }
  private updateMeter(meter:HealthMeter,health:number,maxHealth:number):void {
    const value=Math.max(0,Math.min(maxHealth,Math.ceil(health)));
    meter.value.textContent=`${value} / ${maxHealth}`;
    meter.fill.style.width=`${maxHealth>0 ? 100*value/maxHealth : 0}%`;
    meter.track.setAttribute('aria-valuenow',String(value));
    meter.track.setAttribute('aria-valuemax',String(maxHealth));
  }
}
