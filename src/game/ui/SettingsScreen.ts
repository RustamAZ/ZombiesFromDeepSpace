import type { GameAudio } from '../audio/GameAudio';
import isMobile from 'is-mobile';
import { inputConfig } from '../input/config';
import type { LookSensitivity } from '../input/LookSensitivity';
import { texts } from './texts';
import { levelTexts } from './levelTexts';

function percentSlider(id:string, caption:string, initial:number, range:{min:number;max:number;step:number},
  onInput:(value:number)=>void, onChange?:()=>void):HTMLDivElement {
  const row=document.createElement('div'); row.className='settings-range';
  const label=document.createElement('label'); label.htmlFor=id; label.textContent=caption;
  const slider=document.createElement('input'); slider.id=id; slider.type='range';
  slider.min=String(range.min); slider.max=String(range.max); slider.step=String(range.step);
  slider.value=String(initial);
  const output=document.createElement('output'); output.htmlFor.add(id);
  const showValue=()=>{ output.textContent=slider.value+'%'; slider.setAttribute('aria-valuetext',output.textContent); };
  showValue();
  slider.addEventListener('input',()=>{ showValue(); onInput(slider.valueAsNumber); });
  if (onChange) slider.addEventListener('change',onChange);
  row.append(label,output,slider);
  return row;
}

export class SettingsScreen {
  private readonly root=document.createElement('div');
  private readonly resume=document.createElement('button');

  constructor(audio:GameAudio, sensitivity:LookSensitivity, onContinue:()=>void, onMenu?:()=>void) {
    this.root.className='settings-screen';
    this.root.hidden=true;
    const panel=document.createElement('section');
    panel.className='settings-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label',texts.settings);
    const title=document.createElement('h2'); title.textContent=texts.settings;
    panel.append(title,percentSlider('sound-volume',texts.volume,Math.round(audio.volume*100),
      {min:0,max:100,step:1},v=>audio.setVolume(v/100),()=>audio.play('coin')));
    const mode=isMobile({tablet:true,featureDetect:true})?'mobile':'desktop';
    panel.append(percentSlider('look-'+mode,mode==='mobile'?texts.touchSensitivity:texts.mouseSensitivity,
      sensitivity.percent(mode),inputConfig.lookSensitivity.ranges[mode],
      value=>sensitivity.setPercent(mode,value)));
    this.resume.type='button'; this.resume.textContent=texts.continue;
    this.resume.addEventListener('click',onContinue);
    panel.append(this.resume);
    if (onMenu) {
      const menu=document.createElement('button'); menu.textContent=levelTexts.menu;
      menu.addEventListener('click',onMenu); panel.append(menu);
    }
    this.root.append(panel);
    document.querySelector('#workshop')!.append(this.root);
  }

  get isOpen():boolean { return !this.root.hidden; }
  open():void {
    this.root.hidden=false;
    this.resume.focus();
  }
  close():void { this.root.hidden=true; }
  dispose():void { this.root.remove(); }
}
