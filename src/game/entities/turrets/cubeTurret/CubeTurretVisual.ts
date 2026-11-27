import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { addStaticBlocker } from '../../staticBlocker';

export class CubeTurretVisual {
  readonly root: TransformNode;
  readonly head: TransformNode;
  readonly muzzle: TransformNode;

  constructor(scene: Scene, position: Vector3, yaw=0) {
    this.root=new TransformNode('cube-turret',scene); this.root.position.copyFrom(position); this.root.rotation.y=yaw;
    const dark=new StandardMaterial('turret-dark',scene); dark.diffuseColor=Color3.FromHexString('#223D4B'); dark.specularColor=Color3.Black();
    const body=new StandardMaterial('turret-body',scene); body.diffuseColor=Color3.FromHexString('#278784'); body.specularColor=Color3.Black();
    const energy=new StandardMaterial('turret-energy',scene); energy.diffuseColor=Color3.FromHexString('#FFCB46'); energy.emissiveColor=Color3.FromHexString('#FFCB46');
    const base=MeshBuilder.CreateBox('turret-base',{width:1.25,height:0.42,depth:1.25},scene); base.parent=this.root; base.position.y=.21; base.material=dark;
    this.head=new TransformNode('turret-head',scene); this.head.parent=this.root; this.head.position.y=.58;
    const housing=MeshBuilder.CreateBox('turret-housing',{width:.9,height:.48,depth:.9},scene); housing.parent=this.head; housing.material=body;
    const barrel=MeshBuilder.CreateBox('turret-barrel',{width:.3,height:.28,depth:1.15},scene); barrel.parent=this.head; barrel.position.z=.78; barrel.material=energy;
    this.muzzle=new TransformNode('turret-muzzle',scene); this.muzzle.parent=this.head; this.muzzle.position.set(0,0,1.4);
    addStaticBlocker(scene,this.root,'turret-blocker',new Vector3(1.25,1.05,1.25),0.525);
  }
  setYaw(yaw: number): void { this.head.rotation.y=yaw; }
  getYaw(): number { return this.head.rotation.y; }
  setDestroyed(value: boolean): void { this.head.setEnabled(!value); }
}
