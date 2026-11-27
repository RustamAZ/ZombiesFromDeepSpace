import { MeshBuilder, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';

export function addStaticBlocker(scene:Scene,root:TransformNode,name:string,
  size:Vector3,centerY:number):PhysicsAggregate {
  const mesh=MeshBuilder.CreateBox(name,{width:size.x,height:size.y,depth:size.z},scene);
  mesh.parent=root;
  mesh.position.y=centerY;
  mesh.isVisible=false;
  mesh.isPickable=false;
  mesh.checkCollisions=false;
  mesh.computeWorldMatrix(true);
  return new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:0,friction:0.7,restitution:0},scene);
}
