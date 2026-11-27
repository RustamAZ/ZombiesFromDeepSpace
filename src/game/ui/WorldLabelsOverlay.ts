import { Matrix, Ray, Scene, Vector3, type Viewport } from '@babylonjs/core';
import type { Workshop } from '../shooter/Workshop';
import { WorldInteractionPanel, type InteractionAction } from './WorldInteractionPanel';
import { texts } from './texts';

const maxLabelDistance=16;
const closeLabelDistance=2.5;

type Projection={
  eye:Vector3;
  rect:DOMRect;
  width:number;
  height:number;
  viewport:Viewport;
  forward:Vector3;
  roomId:string;
};
export class WorldLabelsOverlay {
  private readonly ammoLabels:HTMLDivElement[];
  private readonly coreLabel:HTMLDivElement;
  private readonly doorPanels:WorldInteractionPanel[];
  private readonly turretPanels:WorldInteractionPanel[];
  private readonly cleanupPanels:WorldInteractionPanel[];
  private readonly turretNotices:WorldInteractionPanel[];
  private readonly doorNotices:WorldInteractionPanel[];
  private readonly cleanupNotices:WorldInteractionPanel[];
  private noticeTime=0;

  constructor(private readonly scene:Scene,private readonly workshop:Workshop) {
    this.ammoLabels=workshop.placedTurrets.map(()=>this.createLabel('turret-ammo'));
    this.coreLabel=this.createLabel('core-world-label');
    this.doorPanels=workshop.placedDoors.map(()=>new WorldInteractionPanel(scene));
    this.turretPanels=workshop.placedTurrets.map(()=>new WorldInteractionPanel(scene));
    this.cleanupPanels=workshop.placedCleanupButtons.map(()=>new WorldInteractionPanel(scene));
    this.turretNotices=workshop.placedTurrets.map(()=>new WorldInteractionPanel(scene));
    this.doorNotices=workshop.placedDoors.map(()=>new WorldInteractionPanel(scene));
    this.cleanupNotices=workshop.placedCleanupButtons.map(()=>new WorldInteractionPanel(scene));
  }

  update(playerPosition:Vector3,aim:Ray):void {
    const camera=this.scene.activeCamera;
    const canvas=this.scene.getEngine().getRenderingCanvas();
    if (!camera || !canvas) return;
    const rect=canvas.getBoundingClientRect();
    const width=this.scene.getEngine().getRenderWidth();
    const height=this.scene.getEngine().getRenderHeight();
    camera.getViewMatrix(true);
    const eye=camera.globalPosition;
    const projection:Projection={rect,width,height,
      eye,viewport:camera.viewport.toGlobal(width,height),forward:camera.getForwardRay().direction,
      roomId:this.workshop.nearestRoomId(eye.x,eye.z)};
    const canPurchase=this.workshop.waves.canPurchase;
    this.noticeTime+=Math.min(0.05,this.scene.getEngine().getDeltaTime()/1000);
    const interaction=this.workshop.getInteractions(playerPosition,aim);
    const isSelected=(position:Vector3|undefined,anchor:Vector3)=>
      !!position && Vector3.DistanceSquared(position,anchor)<0.01;

    this.workshop.placedTurrets.forEach((turret,i)=>{
      this.place(this.ammoLabels[i],`${turret.ammo}/${turret.maxAmmo}`,
        turret.position.add(new Vector3(0,1.6,0)),projection);
      const action=canPurchase && !isSelected(interaction.qPosition,turret.position)
        ? turret.isDestroyed ? texts.worldPrompts.rebuild
          : turret.ammo<turret.maxAmmo ? texts.worldPrompts.ammo : undefined
        : undefined;
      this.turretNotices[i].showNotice(turret.position,2.1,
        this.noticeVisible(turret.position,projection) ? action : undefined,this.noticeTime,
        action===texts.worldPrompts.ammo);
    });
    this.workshop.placedDoors.forEach((door,i)=>{
      const action=canPurchase && !isSelected(interaction.qPosition,door.position) &&
        door.state==='closed' && door.isDamaged
        ? texts.worldPrompts.repair : undefined;
      this.doorNotices[i].showNotice(door.position,3.5,
        this.noticeVisible(door.position,projection) ? action : undefined,this.noticeTime,true,door.alongX);
    });
    this.workshop.placedCleanupButtons.forEach((button,i)=>{
      const action=canPurchase && !isSelected(interaction.ePosition,button.position) &&
        this.workshop.needsCleaning(button.roomId)
        ? texts.worldPrompts.cleanup : undefined;
      this.cleanupNotices[i].showNotice(button.position,1.45,
        this.noticeVisible(button.position,projection) ? action : undefined,this.noticeTime);
    });
    this.place(this.coreLabel,this.workshop.core.isDestroyed ? undefined : texts.defendMe,
      this.workshop.core.position.add(new Vector3(0,2.15,0)),projection);
    const eAction:InteractionAction|undefined=interaction.e
      ? {key:'E',label:texts.interactE[interaction.e]} : undefined;
    const qAction:InteractionAction|undefined=interaction.q
      ? {key:'Q',label:texts.interactQ[interaction.q],cost:interaction.cost,
        affordable:interaction.cost===undefined || this.workshop.runProfile.coins>=interaction.cost} : undefined;
    const doorActions=canPurchase ? [
      interaction.e==='open' || interaction.e==='close' ? eAction : undefined,
      interaction.q==='door' ? qAction : undefined
    ].filter((action):action is InteractionAction=>!!action) : [];
    const doorAnchor=interaction.e==='open' || interaction.e==='close'
      ? interaction.ePosition : interaction.q==='door' ? interaction.qPosition : undefined;
    this.workshop.placedDoors.forEach((door,i)=>{
      const selected=doorAnchor && isSelected(doorAnchor,door.position);
      this.doorPanels[i].showDoor(door,playerPosition,selected ? doorActions : []);
    });
    this.workshop.placedTurrets.forEach((turret,i)=>{
      const selected=canPurchase && isSelected(interaction.qPosition,turret.position) &&
        (interaction.q==='ammo' || interaction.q==='turret');
      this.turretPanels[i].showFacing(turret.position,playerPosition,1.1,0.85,
        selected && qAction ? [qAction] : []);
    });
    this.workshop.placedCleanupButtons.forEach((button,i)=>{
      const selected=canPurchase && interaction.e==='cleanup' &&
        isSelected(interaction.ePosition,button.position);
      this.cleanupPanels[i].showFacing(button.position,playerPosition,1.3,0.62,
        selected && eAction ? [eAction] : []);
    });
  }

  dispose():void {
    for (const label of this.ammoLabels) label.remove();
    this.coreLabel.remove();
    for (const panel of [...this.doorPanels,...this.turretPanels,...this.cleanupPanels,
      ...this.doorNotices,...this.turretNotices,...this.cleanupNotices]) panel.dispose();
  }

  private createLabel(className:string):HTMLDivElement {
    const label=document.createElement('div');
    label.className=className;
    label.setAttribute('aria-hidden','true');
    document.querySelector('#workshop')!.append(label);
    return label;
  }

  private noticeVisible(anchor:Vector3,p:Projection):boolean {
    const dx=anchor.x-p.eye.x, dz=anchor.z-p.eye.z;
    return dx*dx+dz*dz<=maxLabelDistance*maxLabelDistance &&
      this.workshop.nearestRoomId(anchor.x,anchor.z)===p.roomId;
  }

  private place(label:HTMLDivElement,text:string|undefined,point:Vector3,p:Projection):void {
    const offset=point.subtract(p.eye);
    const horizontalDistance=offset.x*offset.x+offset.z*offset.z;
    const close=horizontalDistance<=closeLabelDistance*closeLabelDistance;
    const facing=close ? offset.x*p.forward.x+offset.z*p.forward.z : Vector3.Dot(offset,p.forward);
    if (!text || horizontalDistance>maxLabelDistance*maxLabelDistance ||
      this.workshop.nearestRoomId(point.x,point.z)!==p.roomId || facing<=0.01) {
      label.hidden=true;
      return;
    }
    const projected=Vector3.Project(point,Matrix.Identity(),this.scene.getTransformMatrix(),p.viewport);
    const offscreen=projected.z<0 || projected.z>1 || !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) || projected.x<0 || projected.x>p.width ||
      projected.y<0 || projected.y>p.height;
    if (offscreen && !close) {
      label.hidden=true;
      return;
    }
    let screenX=projected.x;
    let screenY=projected.y;
    if (offscreen) {
      const eyeLevel=new Vector3(point.x,p.eye.y,point.z);
      const fallback=Vector3.Project(eyeLevel,Matrix.Identity(),this.scene.getTransformMatrix(),p.viewport);
      screenX=Number.isFinite(fallback.x) ? fallback.x : p.width/2;
      screenY=Number.isFinite(fallback.y) ? fallback.y-72 : 70;
    }
    label.hidden=false;
    label.textContent=text;
    const marginX=Math.min(p.width/2,Math.max(24,label.offsetWidth/2+8));
    const marginY=Math.max(70,label.offsetHeight+8);
    const x=Math.max(marginX,Math.min(p.width-marginX,screenX));
    const y=Math.max(marginY,Math.min(p.height-90,screenY));
    label.style.left=`${x*p.rect.width/p.width}px`;
    label.style.top=`${y*p.rect.height/p.height}px`;
  }
}
