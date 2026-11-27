import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { addStaticBlocker } from '../staticBlocker';

export class CleanupButtonVisual {
  readonly root: TransformNode;
  private readonly lamp: StandardMaterial;

  constructor(scene:Scene, position:Vector3) {
    this.root=new TransformNode('cleanup-button',scene);
    this.root.position.copyFrom(position);
    const housing=new StandardMaterial('cleanup-button-housing',scene);
    housing.diffuseColor=Color3.FromHexString('#223D4B');
    housing.specularColor=Color3.Black();
    this.lamp=new StandardMaterial('cleanup-button-lamp',scene);
    this.lamp.specularColor=Color3.Black();
    const stand=MeshBuilder.CreateBox('cleanup-stand',{width:0.45,height:0.9,depth:0.45},scene);
    stand.parent=this.root; stand.position.y=0.45; stand.material=housing;
    const top=MeshBuilder.CreateBox('cleanup-switch',{width:0.65,height:0.16,depth:0.65},scene);
    top.parent=this.root; top.position.y=0.98; top.material=this.lamp;
    stand.isPickable=stand.checkCollisions=false;
    top.isPickable=top.checkCollisions=false;
    addStaticBlocker(scene,this.root,'cleanup-blocker',new Vector3(0.65,1.12,0.65),0.56);
    this.setActive(false);
  }

  setActive(active:boolean): void {
    this.lamp.diffuseColor=Color3.FromHexString(active?'#FFCB46':'#278784');
    this.lamp.emissiveColor=active ? new Color3(0.4,0.23,0.02) : Color3.Black();
  }
}
