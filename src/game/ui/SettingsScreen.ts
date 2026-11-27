import type { GameAudio } from '../audio/GameAudio';
import { inputConfig } from '../input/config';
import type { InputMode, LookSensitivity } from '../input/LookSensitivity';
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
  private readonly lookRows:Record<InputMode,HTMLDivElement>;

  constructor(audio:GameAudio, sensitivity:LookSensitivity, private readonly getInputMode:()=>InputMode,
    onContinue:()=>void, onMenu?:()=>void) {
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
    this.lookRows={
      desktop:percentSlider('look-desktop',texts.mouseSensitivity,sensitivity.percent('desktop'),
        inputConfig.lookSensitivity.ranges.desktop,v=>sensitivity.setPercent('desktop',v)),
      mobile:percentSlider('look-mobile',texts.touchSensitivity,sensitivity.percent('mobile'),
        inputConfig.lookSensitivity.ranges.mobile,v=>sensitivity.setPercent('mobile',v))
    };
    panel.append(this.lookRows.desktop,this.lookRows.mobile);
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
    const mode=this.getInputMode();
    this.lookRows.desktop.hidden=mode!=='desktop';
    this.lookRows.mobile.hidden=mode!=='mobile';
    this.root.hidden=false;
    this.resume.focus();
  }
  close():void { this.root.hidden=true; }
  dispose():void { this.root.remove(); }
}
