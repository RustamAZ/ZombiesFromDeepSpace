import { inputConfig } from './config';
import { GameInput,type InputCommand,type LookDelta } from './GameInput';
import { MobileControls } from '../ui/mobile/MobileControls';

type Pointer={id:number;startX:number;startY:number;x:number;y:number};
type FirePointer=Pointer&{minX:number;maxX:number;minY:number;maxY:number};
export class MobileInput extends GameInput {
  private readonly controls=new MobileControls();
  private readonly commands=new Set<InputCommand>();
  private readonly events=new AbortController();
  private movement?:Pointer;
  private lookPointer?:Pointer;
  private firePointer?:FirePointer;
  private movementX=0;
  private movementZ=0;
  private look:LookDelta={x:0,y:0};
  private firingValue=false;
  private enabled=false;
  constructor(private readonly canvas:HTMLCanvasElement) {
    super();
    const options={signal:this.events.signal};
    canvas.addEventListener('pointerdown',event=>this.beginSurfacePointer(event),options);
    canvas.addEventListener('pointermove',event=>this.moveSurfacePointer(event),options);
    canvas.addEventListener('pointerup',event=>this.endSurfacePointer(event.pointerId),options);
    canvas.addEventListener('pointercancel',event=>this.endSurfacePointer(event.pointerId),options);
    canvas.addEventListener('lostpointercapture',event=>this.endSurfacePointer(event.pointerId),options);
    this.bindFireLook(options);
    this.bindCommand(this.controls.interact,'interact',options);
    this.bindCommand(this.controls.purchase,'purchase',options);
    this.bindCommand(this.controls.alternate,'alternate',options);
    this.bindCommand(this.controls.pause,'pause',options);
    window.addEventListener('blur',()=>this.reset(),options);
    document.addEventListener('visibilitychange',()=>{ if (document.hidden) this.reset(); },options);
    window.addEventListener('resize',()=>this.reset(),options);
    this.controls.setVisible(false);
  }
  get moveX():number { return this.movementX; }
  get moveZ():number { return this.movementZ; }
  get firing():boolean { return this.firingValue; }
  setEnabled(enabled:boolean):void { this.enabled=enabled; this.controls.setVisible(enabled); if (!enabled) this.reset(); }
  setActions(interact?:string,purchase?:string,alternate?:string,interactDisabled=false):void {
    this.controls.setActions(interact,purchase,alternate,interactDisabled);
  }
  consumeLook():LookDelta { const value=this.look; this.look={x:0,y:0}; return value; }
  consume(command:InputCommand):boolean { return this.commands.delete(command); }
  reset():void {
    this.movement=undefined; this.lookPointer=undefined; this.firePointer=undefined;
    this.movementX=this.movementZ=0; this.look={x:0,y:0}; this.firingValue=false;
    this.commands.clear(); this.controls.hideJoystick(); this.controls.resetFirePosition();
  }
  dispose():void { this.reset(); this.events.abort(); this.controls.dispose(); }
  private beginSurfacePointer(event:PointerEvent):void {
    if (!this.enabled || event.pointerType!=='touch') return;
    event.preventDefault();
    const rect=this.canvas.getBoundingClientRect();
    if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) return;
    const point={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY};
    if (event.clientX<rect.left+rect.width/2) {
      if (this.movement) return;
      this.movement=point;
      this.controls.setJoystick(event.clientX-rect.left,event.clientY-rect.top);
    } else {
      if (this.lookPointer) return;
      this.lookPointer=point;
    }
    this.canvas.setPointerCapture(event.pointerId);
  }
  private moveSurfacePointer(event:PointerEvent):void {
    if (!this.enabled || event.pointerType!=='touch') return;
    if (this.movement?.id===event.pointerId) {
      const dx=event.clientX-this.movement.startX,dy=event.clientY-this.movement.startY;
      const radius=inputConfig.joystickRadiusPixels;
      const length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
      const nx=dx*scale/radius,nz=-dy*scale/radius;
      const magnitude=Math.hypot(nx,nz);
      const adjusted=magnitude<=inputConfig.joystickDeadZone?0:
        (magnitude-inputConfig.joystickDeadZone)/(1-inputConfig.joystickDeadZone);
      this.movementX=magnitude?nx/magnitude*adjusted:0;
      this.movementZ=magnitude?nz/magnitude*adjusted:0;
      const rect=this.canvas.getBoundingClientRect();
      this.controls.setJoystick(this.movement.startX-rect.left,this.movement.startY-rect.top,dx*scale,dy*scale);
    } else if (this.lookPointer?.id===event.pointerId) {
      this.look.x+=event.clientX-this.lookPointer.x;
      this.look.y+=event.clientY-this.lookPointer.y;
      this.lookPointer.x=event.clientX; this.lookPointer.y=event.clientY;
    }
  }
  private endSurfacePointer(id:number):void {
    if (this.movement?.id===id) {
      this.movement=undefined; this.movementX=this.movementZ=0; this.controls.hideJoystick();
    }
    if (this.lookPointer?.id===id) this.lookPointer=undefined;
  }
  private bindFireLook(options:AddEventListenerOptions):void {
    const button=this.controls.fire;
    button.addEventListener('pointerdown',event=>{
      if (!this.enabled || event.pointerType!=='touch' || this.firePointer) return;
      event.preventDefault(); event.stopPropagation();
      const canvasRect=this.canvas.getBoundingClientRect();
      const buttonRect=button.getBoundingClientRect();
      this.firePointer={
        id:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,
        minX:canvasRect.left-buttonRect.left,maxX:canvasRect.right-buttonRect.right,
        minY:canvasRect.top-buttonRect.top,maxY:canvasRect.bottom-buttonRect.bottom
      };
      button.setPointerCapture(event.pointerId);
      this.firingValue=true;
      this.controls.setFireDragging(true);
    },options);
    button.addEventListener('pointermove',event=>{
      const pointer=this.firePointer;
      if (!this.enabled || event.pointerType!=='touch' || pointer?.id!==event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      this.look.x+=event.clientX-pointer.x;
      this.look.y+=event.clientY-pointer.y;
      pointer.x=event.clientX; pointer.y=event.clientY;
      const dx=Math.max(pointer.minX,Math.min(pointer.maxX,event.clientX-pointer.startX));
      const dy=Math.max(pointer.minY,Math.min(pointer.maxY,event.clientY-pointer.startY));
      this.controls.setFireOffset(dx,dy);
    },options);
    const stop=(event:PointerEvent)=>{
      if (this.firePointer?.id!==event.pointerId) return;
      event.stopPropagation(); this.firePointer=undefined; this.firingValue=false;
      this.controls.resetFirePosition();
    };
    button.addEventListener('pointerup',stop,options); button.addEventListener('pointercancel',stop,options);
    button.addEventListener('lostpointercapture',stop,options);
  }
  private bindCommand(button:HTMLButtonElement,command:InputCommand,options:AddEventListenerOptions):void {
    button.addEventListener('pointerdown',event=>{
      if (!this.enabled || button.disabled || event.pointerType!=='touch') return;
      event.preventDefault(); event.stopPropagation(); this.commands.add(command);
    },options);
  }
}
