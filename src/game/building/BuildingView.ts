import { Camera, Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { WorldInteractionPanel } from '../ui/WorldInteractionPanel';
import { texts } from '../ui/texts';
import { buildingConfig } from './config';
import { addStaticBlocker } from '../entities/staticBlocker';
import type { Workshop } from '../shooter/Workshop';

export class BuildingView {
  readonly station:Mesh;
  private readonly door:Mesh;
  private readonly package:Mesh;
  private readonly preview:Mesh;
  private readonly held:Mesh;
  private readonly paint:StandardMaterial;
  private readonly panel:WorldInteractionPanel;
  private time=0;
  constructor(scene:Scene,position:Vector3) {
    this.station=MeshBuilder.CreateBox('kit-shop',{width:1.8,height:2.5,depth:1},scene);
    this.station.position.copyFrom(position.add(new Vector3(0,1.25,0)));
    addStaticBlocker(scene,this.station,'shop-blocker',new Vector3(1.8,2.5,1),0);
    const mat=new StandardMaterial('kit-shop-paint',scene); mat.diffuseColor=Color3.FromHexString('#223D4B');this.station.material=mat;
    this.door=MeshBuilder.CreateBox('kit-shop-lift-door',{width:1.5,height:1.6,depth:0.1},scene);
    this.door.position.copyFrom(position.add(new Vector3(0,1.1,0.56)));
    const gold=new StandardMaterial('kit-gold',scene);gold.diffuseColor=Color3.FromHexString('#FFCB46');this.door.material=gold;
    this.package=MeshBuilder.CreateBox('construction-kit',{size:buildingConfig.kitSize},scene);this.package.material=gold;
    this.held=MeshBuilder.CreateBox('held-kit',{size:0.25},scene);this.held.material=gold;this.held.renderingGroupId=1;
    this.preview=MeshBuilder.CreateBox('placement-preview',{width:1.5,height:0.06,depth:1.5},scene);
    this.paint=new StandardMaterial('placement-paint',scene);this.paint.alpha=0.45;this.preview.material=this.paint;
    for(const mesh of [this.package,this.held,this.preview,this.door]) mesh.isPickable=false;
    for(const mesh of [this.package,this.held,this.preview]) mesh.setEnabled(false);
    this.panel=new WorldInteractionPanel(scene);
  }
  update(dt:number,position:Vector3,player:Vector3,camera:Camera,carrying:boolean,
    kit:{position:Vector3;dispensed:boolean}|undefined,candidate:{position:Vector3;valid:boolean}|undefined,
    action:ReturnType<Workshop['getInteractions']>,coins:number):void {
    this.time=kit?.dispensed?Math.min(1,this.time+dt*2):Math.max(0,this.time-dt*2);
    this.door.position.y=position.y+1.1+this.time*1.7;
    this.package.setEnabled(!!kit);
    if (kit) {
      this.package.position.copyFrom(kit.position);
      if (kit.dispensed) this.package.position.y+=(1-this.time)*2;
    }
    this.held.parent=camera;this.held.position.set(0.15,-0.2,0.6);this.held.setEnabled(carrying);
    this.preview.setEnabled(carrying && !!candidate);
    if(candidate)this.preview.position.copyFrom(candidate.position.add(new Vector3(0,0.04,0)));
    this.paint.diffuseColor=candidate?.valid?Color3.Green():Color3.Red();
    if (action.shopBlock) {
      this.panel.showFacingNotice(position,player,1.1,0.95,texts.shopBlock[action.shopBlock]);
    } else if (action.e==='buy' || action.e==='take') {
      this.panel.showFacing(action.ePosition!,player,action.e==='take'?0.25:1.1,0.95,
        [{key:'E',label:texts.interactE[action.e],cost:action.buyCost,
          affordable:action.buyCost===undefined || coins>=action.buyCost}]);
    } else {
      this.panel.showFacing(candidate?.position ?? position,player,0.43,0.4,
        candidate?.valid?[{key:'Q',label:texts.interactQ.install}]:[]);
    }
  }
}
