import { type Color3, Mesh, type Scene, Vector3, VertexData } from '@babylonjs/core';

interface Cell {
  gridX:number; gridY:number; gridZ:number; colorIndex:number; localPosition:Vector3;
}

const cube=VertexData.CreateBox({size:1});

// All cells in this fragment share one local rotation. Pack adjacent cells of the
// same color into boxes without filling damage holes or creating per-cell meshes.
export function buildRigidVoxelFragment(scene:Scene,cells:readonly Cell[],size:number,
  palette:readonly Color3[],yaw:number,origin:Vector3):Mesh {
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const p of cells) {
    minX=Math.min(minX,p.gridX); minY=Math.min(minY,p.gridY); minZ=Math.min(minZ,p.gridZ);
    maxX=Math.max(maxX,p.gridX); maxY=Math.max(maxY,p.gridY); maxZ=Math.max(maxZ,p.gridZ);
  }
  const nx=maxX-minX+1, ny=maxY-minY+1, nz=maxZ-minZ+1, plane=nx*ny;
  const mask=new Uint32Array(plane*nz);
  for(const p of cells)mask[p.gridX-minX+(p.gridY-minY)*nx+(p.gridZ-minZ)*plane]=p.colorIndex+1;
  const pos:number[]=[], normals:number[]=[], colors:number[]=[], indices:number[]=[];
  const verts=cube.positions!, norm=cube.normals!, idx=cube.indices!;
  const base=cells[0], sin=Math.sin(yaw), cos=Math.cos(yaw);
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
    const start=x+y*nx+z*plane, value=mask[start];
    if(!value)continue;
    let w=1,h=1,d=1;
    while(x+w<nx && mask[start+w]===value)++w;
    const rowMatches=(i:number)=>{
      for(let j=0;j<w;j++)if(mask[i+j]!==value)return false;
      return true;
    };
    while(y+h<ny && rowMatches(start+h*nx))++h;
    layers:while(z+d<nz) {
      for(let j=0;j<h;j++)if(!rowMatches(start+d*plane+j*nx))break layers;
      ++d;
    }
    for(let k=0;k<d;k++)for(let j=0;j<h;j++) {
      const i=start+k*plane+j*nx;
      mask.fill(0,i,i+w);
    }
    const cx=x+minX-base.gridX+(w-1)/2, cy=y+minY-base.gridY+(h-1)/2, cz=z+minZ-base.gridZ+(d-1)/2;
    const color=palette[value-1], first=pos.length/3;
    for(let i=0;i<verts.length;i+=3) {
      const vx=(cx+verts[i]*w)*size, vz=(cz+verts[i+2]*d)*size;
      pos.push(base.localPosition.x-origin.x+vx*cos+vz*sin,
        base.localPosition.y-origin.y+(cy+verts[i+1]*h)*size,
        base.localPosition.z-origin.z-vx*sin+vz*cos);
      normals.push(norm[i]*cos+norm[i+2]*sin,norm[i+1],-norm[i]*sin+norm[i+2]*cos);
      colors.push(color?.r??1,color?.g??1,color?.b??1,1);
    }
    for(let i=0;i<idx.length;i++)indices.push(first+idx[i]);
  }
  const data=new VertexData();
  data.positions=pos; data.normals=normals; data.colors=colors; data.indices=indices;
  const mesh=new Mesh('fallen-section',scene);
  data.applyToMesh(mesh);
  return mesh;
}
