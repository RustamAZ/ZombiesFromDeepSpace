import type { Mesh, Node, Scene } from '@babylonjs/core';

export type MeshCounts={zombies:number;debris:number;batchedCubes:number;environment:number;other:number};

export class ActiveMeshBreakdown {
  private readonly owners=new WeakMap<Node,'zombies'|'environment'>();

  constructor(private readonly scene:Scene) {}

  tag(node:Node,category:'zombies'|'environment'):void { this.owners.set(node,category); }

  capture():MeshCounts {
    const counts:MeshCounts={zombies:0,debris:0,batchedCubes:0,environment:0,other:0};
    const active=this.scene.getActiveMeshes();
    for(let i=0;i<active.length;++i) {
      const mesh=active.data[i];
      if(mesh.metadata?.voxelDebris) {
        ++counts.debris;
        if(mesh.metadata.batchedDebris) counts.batchedCubes+=(mesh as Mesh).thinInstanceCount;
      }
      else {
        const owner=this.owners.get(mesh) ?? (mesh.parent && this.owners.get(mesh.parent));
        ++counts[owner ?? 'other'];
      }
    }
    return counts;
  }
}
