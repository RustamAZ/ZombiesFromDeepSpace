import { GameInput,type InputCommand,type LookDelta } from './GameInput';

export class DesktopInput extends GameInput {
  private readonly keys=new Set<string>();
  private readonly commands=new Set<InputCommand>();
  private look:LookDelta={x:0,y:0};
  private firingValue=false;
  private enabled=false;
  private readonly events=new AbortController();
  constructor(private readonly canvas:HTMLCanvasElement) {
    super();
    const options={signal:this.events.signal};
    window.addEventListener('keydown',event=>{
      if (!this.enabled) return;
      if (event.code==='KeyE' && !event.repeat) this.commands.add('interact');
      else if (event.code==='KeyQ' && !event.repeat) this.commands.add('purchase');
      else if (event.code==='KeyR' && !event.repeat) this.commands.add('alternate');
      else if (event.code==='F3' && !event.repeat) this.commands.add('debug');
      else this.keys.add(event.code);
      if (event.code.startsWith('Arrow') || ['KeyE','KeyQ','KeyR','F3'].includes(event.code)) event.preventDefault();
    },options);
    window.addEventListener('keyup',event=>this.keys.delete(event.code),options);
    document.addEventListener('mousemove',event=>{
      if (!this.enabled || document.pointerLockElement!==canvas) return;
      this.look.x+=event.movementX; this.look.y+=event.movementY;
    },options);
    canvas.addEventListener('mousedown',event=>{
      if (this.enabled && event.button===0) this.firingValue=true;
    },options);
    window.addEventListener('mouseup',event=>{ if (event.button===0) this.firingValue=false; },options);
  }
  get moveX():number { return Number(this.down('KeyD','ArrowRight'))-Number(this.down('KeyA','ArrowLeft')); }
  get moveZ():number { return Number(this.down('KeyW','ArrowUp'))-Number(this.down('KeyS','ArrowDown')); }
  get firing():boolean { return this.firingValue; }
  setEnabled(enabled:boolean):void { this.enabled=enabled; if (!enabled) this.reset(); }
  consumeLook():LookDelta { const value=this.look; this.look={x:0,y:0}; return value; }
  consume(command:InputCommand):boolean { const found=this.commands.delete(command); return found; }
  reset():void { this.keys.clear(); this.commands.clear(); this.look={x:0,y:0}; this.firingValue=false; }
  dispose():void { this.reset(); this.events.abort(); }
  private down(a:string,b:string):boolean { return this.keys.has(a)||this.keys.has(b); }
}
