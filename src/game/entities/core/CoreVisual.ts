import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { addStaticBlocker } from '../staticBlocker';

export class CoreVisual {
  readonly root: TransformNode;

  constructor(scene: Scene, position: Vector3) {
    this.root=new TransformNode('defense-core',scene);
    this.root.position.copyFrom(position);
    const shell=new StandardMaterial('core-shell',scene);
    shell.diffuseColor=Color3.FromHexString('#223D4B'); shell.specularColor=Color3.Black();
    const glow=new StandardMaterial('core-glow',scene);
    glow.diffuseColor=Color3.FromHexString('#FFCB46'); glow.emissiveColor=Color3.FromHexString('#FFCB46');
    const base=MeshBuilder.CreateBox('core-base',{width:2.6,height:0.5,depth:2.6},scene);
    base.parent=this.root; base.position.y=0.25; base.material=shell;
    const crystal=MeshBuilder.CreateBox('core-crystal',{size:1.15},scene);
    crystal.parent=this.root; crystal.position.y=1.05; crystal.rotation.y=Math.PI/4; crystal.material=glow;
    addStaticBlocker(scene,this.root,'core-blocker',new Vector3(2.6,1.7,2.6),0.85);
  }

  setDestroyed(value: boolean): void { this.root.setEnabled(!value); }
  dispose(): void { this.root.dispose(); }
}
