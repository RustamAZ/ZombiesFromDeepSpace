import { Color3, Scene, Vector3 } from '@babylonjs/core';
import { VoxelModel } from '../voxel/VoxelModel';
import type { VoxelDebrisController } from '../voxel/VoxelDebrisController';
import type { VoxVoxel } from '../voxel/VoxAsset';

const palette=['#EB744C','#D55A40','#FFD36A','#F4EBCB','#354754'].map(Color3.FromHexString);
const cell=.25;

export class SlidingDoorVisual {
  readonly left: VoxelModel;
  readonly right: VoxelModel;
  private readonly closedLeft: Vector3;
  private readonly closedRight: Vector3;
  constructor(scene: Scene, debris: VoxelDebrisController, position: Vector3,
    private readonly alongX: boolean, width: number, height: number, private readonly layers: number) {
    const columns=Math.round(width/cell), rows=Math.round(height/cell);
    const leftColumns=Math.floor(columns/2), rightColumns=columns-leftColumns;
    this.left=this.createHalf(scene,debris,leftColumns,rows,0,columns);
    this.right=this.createHalf(scene,debris,rightColumns,rows,leftColumns,columns);
    this.closedLeft=position.add(this.axis(cell/2-rightColumns*cell/2));
    this.closedRight=position.add(this.axis(cell/2+leftColumns*cell/2));
    this.setOffset(0);
  }
  setOffset(distance: number): void {
    this.left.setPose(this.closedLeft.add(this.axis(-distance)),0);
    this.right.setPose(this.closedRight.add(this.axis(distance)),0);
  }
  private axis(amount: number): Vector3 { return this.alongX ? new Vector3(0,0,amount) : new Vector3(amount,0,0); }
  private createHalf(scene: Scene, debris: VoxelDebrisController, columns: number, rows: number,
    firstColumn: number, totalColumns: number): VoxelModel {
    const voxels: VoxVoxel[]=[];
    for (let across=0;across<columns;++across) for (let y=0;y<rows;++y) for (let depth=0;depth<this.layers;++depth) {
      const globalColumn=firstColumn+across;
      const r=Math.hypot(globalColumn-(totalColumns-1)/2,y-(rows-1)/2);
      const color=r<=1.2?4:r<=2.35?3:r<=3.45?2:y%3===0 || (globalColumn+2*Math.floor(y/3))%5===0?1:0;
      // Vox asset uses x and y for the floor plane and z for height.
      voxels.push({x:this.alongX?depth:across,y:this.alongX?across:depth,z:y,colorIndex:color});
    }
    return VoxelModel.fromData(scene, {
      // Parsed VOX data stores X and Y on the floor plane, with Z as height.
      size: new Vector3(this.alongX ? this.layers : columns, this.alongX ? columns : this.layers, rows),
      voxels,
      palette
    }, Vector3.Zero(), debris, cell);
  }
}
