import type { GameAudio } from '../audio/GameAudio';
import { texts } from './texts';
import { levelTexts } from './levelTexts';

export class SettingsScreen {
  private readonly root=document.createElement('div');
  private readonly slider=document.createElement('input');
  private readonly value=document.createElement('output');
  private readonly resume=document.createElement('button');

  constructor(private readonly audio:GameAudio, onContinue:()=>void, onMenu?:()=>void) {
    this.root.className='settings-screen';
    this.root.hidden=true;
    const panel=document.createElement('section');
    panel.className='settings-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label',texts.settings);
    const title=document.createElement('h2'); title.textContent=texts.settings;
    const label=document.createElement('label'); label.htmlFor='sound-volume'; label.textContent=texts.volume;
    this.slider.id='sound-volume'; this.slider.type='range';
    this.slider.min='0'; this.slider.max='100'; this.slider.step='1';
    this.slider.value=String(Math.round(audio.volume*100));
    this.value.textContent=`${this.slider.value}%`;
    this.slider.addEventListener('input',()=>{
      this.value.textContent=`${this.slider.value}%`;
      audio.setVolume(Number(this.slider.value)/100);
    });
    this.slider.addEventListener('change',()=>audio.play('coin'));
    const row=document.createElement('div'); row.className='settings-volume';
    row.append(label,this.value,this.slider);
    this.resume.type='button'; this.resume.textContent=texts.continue;
    this.resume.addEventListener('click',onContinue);
    panel.append(title,row,this.resume);
    if (onMenu) {
      const menu=document.createElement('button'); menu.textContent=levelTexts.menu;
      menu.addEventListener('click',onMenu); panel.append(menu);
    }
    this.root.append(panel);
    document.querySelector('#workshop')!.append(this.root);
  }

  get isOpen():boolean { return !this.root.hidden; }
  open():void {
    this.slider.value=String(Math.round(this.audio.volume*100));
    this.value.textContent=`${this.slider.value}%`;
    this.root.hidden=false;
    this.resume.focus();
  }
  close():void { this.root.hidden=true; }
  dispose():void { this.root.remove(); }
}
