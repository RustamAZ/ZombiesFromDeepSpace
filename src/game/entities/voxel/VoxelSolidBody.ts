import { Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsShapeBox, PhysicsShapeContainer } from '@babylonjs/core/Physics/v2/physicsShape';
import type { StructuralCell } from './VoxelStructure';
import { shooterDebrisConfig } from './destructionConfig';

type BoxDescriptor = { extent: Vector3; center: Vector3 };

// Cover occupied cells with disjoint boxes. Holes stay open, including on concave falling pieces.
export function createVoxelSolidBody(node: TransformNode, cells: readonly StructuralCell[],
  size: number, origin: Vector3, mass: number) {
  const scene = node.getScene();
  const key = (x: number, y: number, z: number) => x + ':' + y + ':' + z;
  const remaining = new Set(cells.map(c => key(c.gridX, c.gridY, c.gridZ)));
  const descriptors: BoxDescriptor[]=[];
  const ordered = [...cells].sort((a, b) => a.gridZ - b.gridZ || a.gridY - b.gridY || a.gridX - b.gridX);
  for (const cell of ordered) {
    const { gridX: x, gridY: y, gridZ: z } = cell;
    if (!remaining.has(key(x, y, z))) continue;
    let w = 1, h = 1, d = 1;
    while (remaining.has(key(x + w, y, z))) ++w;
    const hasSlice = (yy: number, zz: number, height: number) => {
      for (let j = 0; j < height; ++j)
        for (let i = 0; i < w; ++i)
          if (!remaining.has(key(x + i, yy + j, zz))) return false;
      return true;
    };
    while (hasSlice(y + h, z, 1)) ++h;
    while (hasSlice(y, z + d, h)) ++d;
    for (let k = 0; k < d; ++k)
      for (let j = 0; j < h; ++j)
        for (let i = 0; i < w; ++i) remaining.delete(key(x + i, y + j, z + k));
    const extent = new Vector3(w, h, d).scaleInPlace(size);
    const center = cell.localPosition.subtract(origin).addInPlace(new Vector3(w - 1, h - 1, d - 1).scaleInPlace(size / 2));
    descriptors.push({extent,center});
  }
  const bodyDescriptors=mass && descriptors.length>shooterDebrisConfig.maxCompoundBoxes
    ? coarseDescriptors(cells,size,origin)
    : descriptors;
  const shape = new PhysicsShapeContainer(scene);
  const boxes: PhysicsShapeBox[] = [];
  const rotation = Quaternion.Identity();
  for (const {extent,center} of bodyDescriptors) {
    const box = new PhysicsShapeBox(Vector3.Zero(), rotation, extent, scene);
    box.material = { friction: 0.5, restitution: 0 };
    shape.addChild(box, center);
    boxes.push(box);
  }
  node.computeWorldMatrix(true);
  const body = new PhysicsBody(node, mass ? PhysicsMotionType.DYNAMIC : PhysicsMotionType.STATIC, false, scene);
  body.shape = shape;
  body.setMassProperties({ mass });
  const dispose = () => {
    node.onDisposeObservable.remove(observer);
    body.dispose();
    shape.dispose();
    for (const box of boxes) box.dispose();
  };
  const observer = node.onDisposeObservable.addOnce(dispose);
  return { body, dispose };
}

function coarseDescriptors(cells: readonly StructuralCell[], size: number, origin: Vector3): BoxDescriptor[] {
  const minX=Math.min(...cells.map(cell=>cell.gridX)), maxX=Math.max(...cells.map(cell=>cell.gridX));
  const minY=Math.min(...cells.map(cell=>cell.gridY)), maxY=Math.max(...cells.map(cell=>cell.gridY));
  const minZ=Math.min(...cells.map(cell=>cell.gridZ)), maxZ=Math.max(...cells.map(cell=>cell.gridZ));
  const middleX=(minX+maxX)/2, middleY=(minY+maxY)/2, middleZ=(minZ+maxZ)/2;
  const buckets=new Map<string,StructuralCell[]>();
  for (const cell of cells) {
    const bucket=`${Number(cell.gridX>middleX)}:${Number(cell.gridY>middleY)}:${Number(cell.gridZ>middleZ)}`;
    const list=buckets.get(bucket);
    if (list) list.push(cell); else buckets.set(bucket,[cell]);
  }
  return Array.from(buckets.values(),bucket=>{
    const min=new Vector3(Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY);
    const max=new Vector3(Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY);
    for (const cell of bucket) {
      min.minimizeInPlace(cell.localPosition);
      max.maximizeInPlace(cell.localPosition);
    }
    return {
      extent:max.subtract(min).addInPlaceFromFloats(size,size,size),
      center:min.add(max).scaleInPlace(0.5).subtractInPlace(origin)
    };
  });
}
