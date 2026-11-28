import { texts } from '../texts';
import { mobileControlsConfig } from './config';

export class MobileControls {
  readonly root=document.createElement('div');
  readonly joystick=document.createElement('div');
  readonly stick=document.createElement('div');
  readonly fire=document.createElement('button');
  readonly interact=document.createElement('button');
  readonly purchase=document.createElement('button');
  readonly alternate=document.createElement('button');
  private readonly actions=document.createElement('div');
  readonly pause=document.createElement('button');
  constructor() {
    this.root.className='mobile-controls';
    this.root.style.setProperty('--mobile-joystick-size',`${mobileControlsConfig.joystickSizePixels}px`);
    this.joystick.className='mobile-joystick'; this.joystick.hidden=true;
    this.stick.className='mobile-joystick__stick'; this.joystick.append(this.stick);
    this.fire.className='mobile-control mobile-control--fire';
    this.fire.type='button'; this.fire.textContent='●'; this.fire.setAttribute('aria-label',texts.fire);
    this.interact.className='mobile-control mobile-control--interact'; this.interact.type='button';
    this.purchase.className='mobile-control mobile-control--purchase'; this.purchase.type='button';
    this.alternate.className='mobile-control mobile-control--alternate'; this.alternate.type='button';
    this.pause.className='mobile-control mobile-control--pause'; this.pause.type='button';
    this.pause.textContent='Ⅱ'; this.pause.setAttribute('aria-label',texts.settings);
    this.interact.hidden=this.purchase.hidden=this.alternate.hidden=true;
    this.actions.className='mobile-action-stack';
    this.actions.append(this.interact,this.purchase,this.alternate);
    this.root.append(this.joystick,this.fire,this.actions,this.pause);
    document.querySelector('#workshop')!.append(this.root);
  }
  setJoystick(x:number,y:number,dx=0,dy=0):void {
    this.joystick.hidden=false;
    this.joystick.style.left=`${x}px`; this.joystick.style.top=`${y}px`;
    this.stick.style.transform=`translate(${dx}px,${dy}px)`;
  }
  hideJoystick():void { this.joystick.hidden=true; this.stick.style.transform='translate(0,0)'; }
  setFireDragging(dragging:boolean):void { this.fire.classList.toggle('is-dragging',dragging); }
  setFireOffset(x:number,y:number):void {
    this.fire.style.setProperty('--mobile-fire-x',`${x}px`);
    this.fire.style.setProperty('--mobile-fire-y',`${y}px`);
  }
  resetFirePosition():void {
    this.setFireDragging(false);
    this.fire.style.removeProperty('--mobile-fire-x');
    this.fire.style.removeProperty('--mobile-fire-y');
  }
  setActions(interact?:string,purchase?:string,alternate?:string,interactDisabled=false):void {
    this.interact.hidden=!interact; this.purchase.hidden=!purchase;
    this.interact.disabled=interactDisabled;
    if (interact) this.interact.textContent=interact;
    if (purchase) this.purchase.textContent=purchase;
    this.alternate.hidden=!alternate;
    if (alternate) this.alternate.textContent=alternate;
  }
  setVisible(visible:boolean):void { this.root.hidden=!visible; if (!visible) this.resetFirePosition(); }
  dispose():void { this.root.remove(); }
}
