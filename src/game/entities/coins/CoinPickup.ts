import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { coinConfig } from './config';

export class CoinPickup {
  readonly mesh:Mesh;
  private readonly material:StandardMaterial;
  private readonly hoverPosition:Vector3;
  private phase=Math.random()*Math.PI*2;
  private attracted=false;
  constructor(scene:Scene, position:Vector3) {
    this.mesh=MeshBuilder.CreateBox('run-coin',{size:coinConfig.size},scene);
    this.mesh.position.copyFrom(position);
    this.hoverPosition=position.clone();
    this.mesh.isPickable=false;
    this.material=new StandardMaterial('run-coin-gold',scene);
    this.material.diffuseColor=Color3.FromHexString('#FFCB46');
    this.material.emissiveColor=new Color3(0.25,0.14,0);
    this.mesh.material=this.material;
  }
  update(dt:number,playerPosition:Vector3):void {
    this.phase+=coinConfig.bobSpeed*dt;
    this.mesh.rotation.y+=coinConfig.spinSpeed*dt;
    const target=playerPosition.add(new Vector3(0,0.65,0));
    if (!this.attracted && Vector3.DistanceSquared(this.mesh.position,target)<coinConfig.magnetRadius**2)
      this.attracted=true;
    if (this.attracted) {
      Vector3.LerpToRef(this.mesh.position,target,1-Math.exp(-coinConfig.magnetSpeed*dt),this.mesh.position);
    } else {
      this.mesh.position.y=this.hoverPosition.y+Math.sin(this.phase)*coinConfig.bobHeight;
    }
  }
  canPickUp(position:Vector3): boolean {
    return Vector3.DistanceSquared(this.mesh.position,position.add(new Vector3(0,0.65,0)))<coinConfig.pickupRadius**2;
  }
  dispose(): void { this.mesh.dispose(); this.material.dispose(); }
}
