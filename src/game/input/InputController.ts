import { DesktopInput } from './DesktopInput';
import { MobileInput } from './MobileInput';
import type { InputCommand,LookDelta } from './GameInput';
import { LookSensitivity,type InputMode } from './LookSensitivity';

export class InputController {
  readonly sensitivity=new LookSensitivity();
  private readonly desktop:DesktopInput;
  private readonly mobile:MobileInput;
  private modeValue:InputMode='desktop';
  private playing=false;
  constructor(canvas:HTMLCanvasElement) { this.desktop=new DesktopInput(canvas); this.mobile=new MobileInput(canvas); }
  get mode():InputMode { return this.modeValue; }
  get moveX():number { return this.active.moveX; }
  get moveZ():number { return this.active.moveZ; }
  get firing():boolean { return this.active.firing; }
  setMode(mode:InputMode):void {
    this.desktop.reset(); this.mobile.reset(); this.modeValue=mode; this.applyEnabled();
  }
  setPlaying(playing:boolean):void { this.playing=playing; this.applyEnabled(); }
  setMobileActions(interact?:string,purchase?:string):void { this.mobile.setActions(interact,purchase); }
  consumeLook():LookDelta {
    const delta=this.active.consumeLook();
    const scale=this.sensitivity.scale(this.modeValue);
    delta.x*=scale; delta.y*=scale;
    return delta;
  }
  consume(command:InputCommand):boolean { return this.active.consume(command); }
  reset():void { this.desktop.reset(); this.mobile.reset(); }
  dispose():void { this.desktop.dispose(); this.mobile.dispose(); }
  private get active() { return this.modeValue==='mobile'?this.mobile:this.desktop; }
  private applyEnabled():void {
    this.desktop.setEnabled(this.playing && this.modeValue==='desktop');
    this.mobile.setEnabled(this.playing && this.modeValue==='mobile');
  }
}
