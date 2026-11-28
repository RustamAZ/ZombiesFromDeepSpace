import { Color3, DynamicTexture, Material, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { SlidingDoor } from '../entities/doors/SlidingDoor';
import { texts } from './texts';

export type InteractionAction={key:'E'|'Q'|'R';label:string;cost?:number;affordable?:boolean};

export class WorldInteractionPanel {
  private readonly root:TransformNode;
  private readonly body:ReturnType<typeof MeshBuilder.CreateBox>;
  private readonly face:ReturnType<typeof MeshBuilder.CreatePlane>;
  private readonly reverseFace:ReturnType<typeof MeshBuilder.CreatePlane>;
  private readonly texture:DynamicTexture;
  private readonly bodyMaterial:StandardMaterial;
  private readonly faceMaterial:StandardMaterial;
  private signature='';

  constructor(scene:Scene) {
    this.root=new TransformNode('door-interaction-panel',scene);
    this.body=MeshBuilder.CreateBox('door-interaction-body',
      {width:1,height:0.5,depth:0.07},scene);
    this.body.parent=this.root;
    this.bodyMaterial=new StandardMaterial('door-interaction-body-material',scene);
    this.bodyMaterial.diffuseColor=Color3.FromHexString('#111820');
    this.bodyMaterial.emissiveColor=Color3.FromHexString('#080c10');
    this.bodyMaterial.specularColor=Color3.Black();
    this.bodyMaterial.alpha=0.5;
    this.body.material=this.bodyMaterial;
    this.face=MeshBuilder.CreatePlane('door-interaction-face',
      {width:1,height:0.5},scene);
    this.face.parent=this.root;
    this.face.position.z=-0.037;
    this.reverseFace=MeshBuilder.CreatePlane('world-notice-reverse-face',
      {width:1,height:0.5},scene);
    this.reverseFace.parent=this.root;
    this.reverseFace.position.z=0.037;
    this.reverseFace.rotation.y=Math.PI;
    this.texture=new DynamicTexture('door-interaction-texture',{width:512,height:256},scene,false);
    this.texture.hasAlpha=true;
    this.draw([]);
    this.faceMaterial=new StandardMaterial('door-interaction-display',scene);
    this.faceMaterial.diffuseTexture=this.texture;
    this.faceMaterial.emissiveTexture=this.texture;
    this.faceMaterial.disableLighting=true;
    this.faceMaterial.useAlphaFromDiffuseTexture=true;
    this.faceMaterial.transparencyMode=Material.MATERIAL_ALPHABLEND;
    this.faceMaterial.specularColor=Color3.Black();
    this.face.material=this.faceMaterial;
    this.reverseFace.material=this.faceMaterial;
    this.body.isPickable=this.body.checkCollisions=false;
    this.face.isPickable=this.face.checkCollisions=false;
    this.reverseFace.isPickable=this.reverseFace.checkCollisions=false;
    this.reverseFace.setEnabled(false);
    this.root.setEnabled(false);
  }

  showDoor(door:SlidingDoor,playerPosition:Vector3,actions:readonly InteractionAction[]):void {
    if (!actions.length) { this.root.setEnabled(false); return; }
    const normal=new Vector3(Math.sin(door.yaw),0,Math.cos(door.yaw));
    const signedDistance=Vector3.Dot(playerPosition.subtract(door.position),normal);
    const side=signedDistance>=0 ? 1 : -1;
    const standOff=Math.min(0.65,Math.abs(signedDistance)*0.7);
    this.root.position.copyFrom(door.position.add(normal.scale(standOff*side)));
    this.root.position.y=1.05;
    this.root.rotation.y=door.yaw+(side>0 ? Math.PI : 0);
    this.face.scaling.y=actions.length===1 ? 0.55 : 1;
    this.body.scaling.y=this.face.scaling.y;
    this.showActions(actions);
  }

  showFacing(anchor:Vector3,playerPosition:Vector3,height:number,standOff:number,
    actions:readonly InteractionAction[]):void {
    if (!actions.length) { this.root.setEnabled(false); return; }
    if (!this.placeFacing(anchor,playerPosition,height,standOff)) return;
    this.face.scaling.y=actions.length===1 ? 0.55 : 1;
    this.body.scaling.y=this.face.scaling.y;
    this.showActions(actions);
  }

  showNotice(anchor:Vector3,height:number,label:string|undefined,
    time:number,alert=false,yaw=0):void {
    if (!label) { this.root.setEnabled(false); return; }
    this.root.position.copyFrom(anchor);
    this.root.position.y=anchor.y+height+Math.sin(time*3)*0.1;
    this.root.rotation.y=yaw;
    this.face.scaling.y=this.body.scaling.y=this.reverseFace.scaling.y=0.55;
    const signature=`notice:${label}:${alert}`;
    if (signature!==this.signature) { this.signature=signature; this.drawNotice(label,alert); }
    this.reverseFace.setEnabled(true);
    this.root.setEnabled(true);
  }

  showFacingNotice(anchor:Vector3,playerPosition:Vector3,height:number,standOff:number,label:string):void {
    if (!this.placeFacing(anchor,playerPosition,height,standOff)) return;
    this.face.scaling.y=this.body.scaling.y=0.55;
    const signature=`facing-notice:${label}`;
    if (signature!==this.signature) { this.signature=signature; this.drawNotice(label,false); }
    this.reverseFace.setEnabled(false);
    this.root.setEnabled(true);
  }

  private placeFacing(anchor:Vector3,playerPosition:Vector3,height:number,standOff:number):boolean {
    const toward=playerPosition.subtract(anchor);
    toward.y=0;
    const distance=toward.length();
    if (distance<0.01) { this.root.setEnabled(false); return false; }
    toward.scaleInPlace(1/distance);
    this.root.position.copyFrom(anchor.add(toward.scale(Math.min(standOff,distance*0.5))));
    this.root.position.y=anchor.y+height;
    this.root.rotation.y=Math.atan2(-toward.x,-toward.z);
    return true;
  }

  private showActions(actions:readonly InteractionAction[]):void {
    this.reverseFace.setEnabled(false);
    const signature=actions.map(action=>
      `${action.key}:${action.label}:${action.cost ?? ''}:${action.affordable ?? ''}`).join('|');
    if (signature!==this.signature) { this.signature=signature; this.draw(actions); }
    this.root.setEnabled(true);
  }

  dispose():void {
    this.root.dispose();
    this.texture.dispose();
    this.bodyMaterial.dispose();
    this.faceMaterial.dispose();
  }

  private draw(actions:readonly InteractionAction[]):void {
    const ctx=this.texture.getContext() as CanvasRenderingContext2D;
    const priceText=(action:InteractionAction)=>`${action.cost} ${texts.coinsShort}`+
      (action.affordable===false ? ` (${texts.notEnough})` : '');
    const contentWidth=actions.reduce((width,action)=>{
      ctx.font='bold 42px system-ui';
      const labelWidth=Math.min(ctx.measureText(action.label.toLocaleUpperCase('ru')).width,380);
      ctx.font='bold 30px system-ui';
      const costWidth=action.cost===undefined ? 0 :
        Math.min(ctx.measureText(priceText(action)).width,380);
      return Math.max(width,Math.ceil(108+Math.max(labelWidth,costWidth)+24));
    },160);
    this.texture.uScale=contentWidth/512;
    this.face.scaling.x=contentWidth/512;
    this.body.scaling.x=this.face.scaling.x;
    this.reverseFace.scaling.x=this.face.scaling.x;
    ctx.clearRect(0,0,512,256);
    ctx.fillStyle='rgba(17,24,29,0.4)';
    ctx.fillRect(0,0,contentWidth,256);
    actions.forEach((action,index)=>{
      const centerY=actions.length===1 ? 128 : index===0 ? 66 : 190;
      ctx.fillStyle='#090d11';
      ctx.fillRect(24,centerY-38,68,76);
      ctx.fillStyle='#ffffff';
      ctx.font='bold 46px system-ui';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(action.key,58,centerY+2);
      ctx.textAlign='left';
      ctx.fillStyle='#f7f5ee';
      ctx.font='bold 42px system-ui';
      ctx.fillText(action.label.toLocaleUpperCase('ru'),108,
        centerY-(action.cost===undefined ? 0 : 15),380);
      if (action.cost!==undefined) {
        ctx.fillStyle=action.affordable===false ? '#ff8e82' : '#d7e0e2';
        ctx.font='bold 30px system-ui';
        ctx.fillText(priceText(action),108,centerY+34,380);
      }
    });
    this.texture.update();
  }

  private drawNotice(label:string,alert:boolean):void {
    const ctx=this.texture.getContext() as CanvasRenderingContext2D;
    const title=label.toLocaleUpperCase('ru');
    ctx.font='bold 42px system-ui';
    const contentWidth=Math.min(512,Math.max(160,Math.ceil(ctx.measureText(title).width+48)));
    this.texture.uScale=contentWidth/512;
    this.face.scaling.x=this.body.scaling.x=this.reverseFace.scaling.x=contentWidth/512;
    ctx.clearRect(0,0,512,256);
    ctx.fillStyle=alert ? 'rgba(132,30,38,0.88)' : 'rgba(17,24,29,0.4)';
    ctx.fillRect(0,0,contentWidth,256);
    ctx.fillStyle='#f7f5ee';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(title,contentWidth/2,128,contentWidth-48);
    this.texture.update();
  }
}
