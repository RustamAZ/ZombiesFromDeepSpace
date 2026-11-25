import { Vector3 } from '@babylonjs/core';
import createGraph from 'ngraph.graph';
import type { Link, NodeId } from 'ngraph.graph';
import { nba } from 'ngraph.path';

export type NavigationCell = { min: Vector3; max: Vector3 };
type Bounds = NavigationCell;
type Solid = Bounds & { floor?: boolean; slope?: number; breakable?: boolean };
const key = (x: number, z: number) => x + ':' + z;

export type WanderPreferences = {
  desiredDistanceRatio: number;
  distanceWeight: number;
  openSpaceWeight: number;
  forwardWeight: number;
  randomWeight: number;
  clearanceRadius: number;
};

export type NavigationPath = {
  points: Vector3[];
  breakTarget?: NavigationCell;
};

// One-unit columns can contain several walkable heights (e.g. below and above a balcony).
export class NavigationGrid {
  private readonly columns = new Map<string, Set<Solid>>();
  private readonly graph = createGraph<Vector3, boolean>();
  private readonly nodes = new Map<string, string[]>();
  private readonly edgeCache = new Map<string, boolean>();
  revision = 0;

  constructor(readonly radius: number, readonly height: number) {}

  add(s: Solid): void { this.index(s, true); }

  replace(old: Bounds[], current: Bounds[], area: Bounds): void {
    for (const s of old) this.index(s, false);
    for (const s of current) this.index(s, true);
    // Only cached links within one step of this obstacle can have changed.
    this.eachColumn(area, this.radius + 2, k => {
      for (const id of this.nodes.get(k) ?? []) this.graph.forEachLinkedNode(id, (_, link) => {
        this.edgeCache.delete('strict:' + String(link.id));
        this.edgeCache.delete('breakable:' + String(link.id));
      });
    });
    ++this.revision;
  }

  private eachColumn(b: Bounds, pad: number, visit: (k: string) => void): void {
    for (let x = Math.floor(b.min.x - pad); x <= Math.floor(b.max.x + pad); ++x)
      for (let z = Math.floor(b.min.z - pad); z <= Math.floor(b.max.z + pad); ++z) visit(key(x,z));
  }

  private index(s: Solid, add: boolean): void {
    this.eachColumn(s, this.radius + 0.01, k => {
      let bucket = this.columns.get(k);
      if (!bucket && add) this.columns.set(k, bucket = new Set());
      if (add) bucket!.add(s); else bucket?.delete(s);
    });
  }

  private top(s: Solid, z: number): number { return s.max.y + (s.slope ?? 0) * (z - s.min.z); }
  private over(x: number, z: number, s: Bounds, pad: number): boolean {
    return x >= s.min.x-pad && x <= s.max.x+pad && z >= s.min.z-pad && z <= s.max.z+pad;
  }

  build(): void {
    for (const [k, solids] of this.columns) {
      const [x,z] = k.split(':').map(Number);
      const ids: string[] = [];
      for (const s of solids) {
        if (!s.floor || !this.over(x,z,s,0.001)) continue;
        const y = this.top(s,z), id = k + ':' + y.toFixed(2);
        if (!ids.includes(id)) { ids.push(id); this.graph.addNode(id,new Vector3(x,y,z)); }
      }
      if (ids.length) this.nodes.set(k,ids);
    }
    this.graph.forEachNode(n => {
      for (const [dx,dz] of [[1,0],[0,1],[1,1],[-1,1]]) {
        for (const id of this.nodes.get(key(n.data.x+dx,n.data.z+dz)) ?? []) {
          if (Math.abs(this.graph.getNode(id)!.data.y-n.data.y) <= 0.55) this.graph.addLink(n.id,id,true);
        }
      }
    });
  }

  passable(a: Vector3, b: Vector3): boolean {
    return this.segmentPassable(a,b,false);
  }

  // A usable gap in a voxel doorway may lie entirely between two metre-grid lanes.
  addDoorLanes(x: number, z: number, alongX: boolean, width: number, cellSize: number): void {
    const lanes=Math.round(width/cellSize)*2;
    for (let i=1;i<lanes;++i) {
      const offset=(i/lanes-0.5)*width;
      if (Math.abs(offset)+this.radius>=width/2 || Number.isInteger(offset)) continue;
      const ends=[-1,1].map(side=>{
        const p=new Vector3(x+(alongX?side:offset),0,z+(alongX?offset:side));
        const id='door:'+p.x+':'+p.z;
        this.graph.addNode(id,p);
        for (const across of [Math.floor(offset),Math.ceil(offset)]) {
          for (const depth of [1,2]) {
            const k=key(x+(alongX?side*depth:across),z+(alongX?across:side*depth));
            for (const n of this.nodes.get(k) ?? []) {
              if (!n.startsWith('door:') && this.graph.getNode(n)!.data.y===0) this.graph.addLink(n,id,true);
            }
          }
        }
        const k=key(Math.floor(p.x),Math.floor(p.z));
        const bucket=this.nodes.get(k);
        if (bucket) bucket.push(id); else this.nodes.set(k,[id]);
        return id;
      });
      this.graph.addLink(ends[0],ends[1],true);
    }
  }

  private segmentPassable(a: Vector3, b: Vector3, allowBreakable: boolean): boolean {
    const steps = Math.max(1, Math.ceil(Vector3.Distance(a,b)/0.12));
    for (let i=0; i<=steps; ++i) {
      const p = Vector3.Lerp(a,b,i/steps);
      if (!this.isPointPassable(p,allowBreakable)) return false;
    }
    return true;
  }

  approachPoint(from: Vector3, target: Vector3): Vector3 {
    const distance=Vector3.Distance(from,target);
    if (distance<0.001) return target.clone();
    const steps=Math.max(1,Math.ceil(distance/0.1));
    let lastRatio=0;
    for (let step=1;step<=steps;++step) {
      const ratio=step/steps;
      if (this.isPointPassable(Vector3.Lerp(from,target,ratio))) {
        lastRatio=ratio;
        continue;
      }
      let low=lastRatio;
      let high=ratio;
      for (let iteration=0;iteration<8;++iteration) {
        const middle=(low+high)*0.5;
        if (this.isPointPassable(Vector3.Lerp(from,target,middle))) low=middle;
        else high=middle;
      }
      return Vector3.Lerp(from,target,low);
    }
    return target.clone();
  }

  private isPointPassable(p: Vector3, allowBreakable = false): boolean {
    return this.blockerAt(p,allowBreakable)===null;
  }

  // null = clear, undefined = no supporting floor, otherwise the actual blocking cell.
  private blockerAt(p: Vector3, allowBreakable: boolean): Solid | null | undefined {
    const solids=this.columns.get(key(Math.floor(p.x),Math.floor(p.z)));
    if (!solids) return undefined;
    let support=false;
    for (const s of solids) {
      if (s.floor && this.over(p.x,p.z,s,0.01) && Math.abs(this.top(s,p.z)-p.y)<0.14) {
        support=true;
        continue;
      }
      if (allowBreakable && s.breakable) continue;
      const dx=Math.max(s.min.x-p.x,0,p.x-s.max.x);
      const dz=Math.max(s.min.z-p.z,0,p.z-s.max.z);
      if (dx*dx+dz*dz>this.radius*this.radius) continue;
      const z=Math.min(s.max.z,Math.max(s.min.z,p.z));
      const bottom=s.min.y+(s.slope ?? 0)*(z-s.min.z);
      if (this.top(s,z)>p.y+(s.floor?0.14:0.025) && bottom<p.y+this.height-0.01) return s;
    }
    return support ? null : undefined;
  }

  debugPoints(): Vector3[] {
    const points: Vector3[]=[];
    this.graph.forEachNode(n=>{ if (this.passable(n.data,n.data)) points.push(n.data); });
    return points;
  }

  findWanderTarget(position: Vector3, forward: Vector3, radius: number,
    preferences: WanderPreferences): Vector3 | undefined {
    const start=this.nearest(position) ?? this.nearest(position,true);
    if (!start) return undefined;

    const queue: NodeId[]=[start];
    const distance=new Map<NodeId,number>([[start,0]]);
    let target: Vector3 | undefined;
    let bestScore=-Infinity;

    for (let index=0;index<queue.length;++index) {
      const current=queue[index];
      const node=this.graph.getNode(current)!;
      const travelled=distance.get(current)!;
      const offset=node.data.subtract(position);
      const horizontalDistance=Math.hypot(offset.x,offset.z);
      if (horizontalDistance>0.35 && travelled<=radius) {
        const alignment=(offset.x*forward.x+offset.z*forward.z)/horizontalDistance;
        const distanceRatio=travelled/radius;
        const distanceScore=1-Math.min(1,
          Math.abs(distanceRatio-preferences.desiredDistanceRatio)/
          Math.max(preferences.desiredDistanceRatio,1-preferences.desiredDistanceRatio));
        const openSpace=this.measureOpenSpace(node.data,preferences.clearanceRadius);
        const score=distanceScore*preferences.distanceWeight+
          openSpace*preferences.openSpaceWeight+
          alignment*preferences.forwardWeight+
          Math.random()*preferences.randomWeight;
        if (score>bestScore) {
          bestScore=score;
          target=node.data.clone();
        }
      }

      this.graph.forEachLinkedNode(current,(next,link)=>{
        if (distance.has(next.id) || this.isBlocked(node.data,next.data,link,false)) return;
        const nextDistance=travelled+Vector3.Distance(node.data,next.data);
        if (nextDistance>radius+0.01) return;
        distance.set(next.id,nextDistance);
        queue.push(next.id);
      });
    }
    return target;
  }

  private measureOpenSpace(position: Vector3, radius: number): number {
    const directions=[
      [1,0],[-1,0],[0,1],[0,-1],
      [Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],
      [-Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]
    ] as const;
    const steps=4;
    let free=0;
    for (const [x,z] of directions) {
      for (let step=1;step<=steps;++step) {
        const sample=position.add(new Vector3(x*radius*step/steps,0,z*radius*step/steps));
        if (!this.isPointPassable(sample)) break;
        ++free;
      }
    }
    return free/(directions.length*steps);
  }

  private nearest(p: Vector3, approach=false) {
    let best: string | undefined, distance = Infinity;
    // A large obstacle can cover every node in the immediate 3x3 neighborhood
    // even though the agent still has a clear connection to the graph around it.
    const searchRadius=Math.max(4,Math.ceil(this.radius*2)+2);
    for (let x=Math.round(p.x)-searchRadius; x<=Math.round(p.x)+searchRadius; ++x)
      for (let z=Math.round(p.z)-searchRadius; z<=Math.round(p.z)+searchRadius; ++z)
        for (const id of this.nodes.get(key(x,z)) ?? []) {
          const pos = this.graph.getNode(id)!.data, d = Vector3.DistanceSquared(pos,p);
          if (d < distance && (this.passable(p,pos) ||
            (approach && Math.abs(pos.y-p.y)<0.3 && this.passable(pos,pos)))) { best=id; distance=d; }
        }
    return best;
  }

  path(from: Vector3, to: Vector3, canBreach=true): NavigationPath {
    if (this.passable(from,to)) return {points:[to.clone()]};
    const start=this.nearest(from);
    const end=this.nearest(to) ?? this.nearest(to,true);
    if (!start || !end) return {points:[]};
    const walk=this.findGraphPath(start,end,false);
    if (walk.length && this.passable(walk[walk.length-1],to)) return {points:[...walk,to.clone()]};
    if (canBreach) {
      const viaDoor=walk.length ? walk : this.findGraphPath(start,end,true);
      if (viaDoor.length) {
        if (this.segmentPassable(viaDoor[viaDoor.length-1],to,true)) viaDoor.push(to.clone());
        const plan=this.approachFirstDoor(viaDoor);
        if (plan) return plan;
      }
    }
    const partial=walk.length ? walk : this.closestReachablePath(start,to,false);
    if (partial.length) partial.push(this.approachPoint(partial[partial.length-1],to));
    return {points:partial};
  }

  private approachFirstDoor(path: Vector3[]): NavigationPath | undefined {
    for (let i=1;i<path.length;++i) {
      const a=path[i-1], b=path[i];
      const steps=Math.max(1,Math.ceil(Vector3.Distance(a,b)/0.12));
      for (let j=1;j<=steps;++j) {
        const sample=Vector3.Lerp(a,b,j/steps);
        const cell=this.blockerAt(sample,false);
        if (cell===null) continue;
        if (!cell?.breakable) return undefined;
        return {points:[...path.slice(0,i),Vector3.Lerp(a,b,(j-1)/steps)],breakTarget:cell};
      }
    }
    return undefined;
  }

  private findGraphPath(start: string, end: string, allowBreakable: boolean): Vector3[] {
    if (start===end) return [this.graph.getNode(start)!.data];
    const finder = nba(this.graph,{
      distance: (a,b,link) => Vector3.Distance(a.data,b.data)+
        (allowBreakable && this.isBlocked(a.data,b.data,link,false) ? 4 : 0),
      heuristic: (a,b) => Vector3.Distance(a.data,b.data),
      blocked: (a,b,link) => this.isBlocked(a.data,b.data,link,allowBreakable)
    });
    const result=finder.find(start,end);
    if (result[0]?.id!==end || result[result.length-1]?.id!==start) return [];
    return result.slice().reverse().map(node=>node.data);
  }

  private isBlocked(from: Vector3, to: Vector3, link: Link<boolean>, allowBreakable: boolean): boolean {
    const id=(allowBreakable ? 'breakable:' : 'strict:')+String(link.id);
    if (!this.edgeCache.has(id)) this.edgeCache.set(id,!this.segmentPassable(from,to,allowBreakable));
    return this.edgeCache.get(id)!;
  }

  private closestReachablePath(start: string, target: Vector3, allowBreakable: boolean): Vector3[] {
    const queue: NodeId[]=[start];
    const parent=new Map<NodeId,NodeId|undefined>([[start,undefined]]);
    let best: NodeId=start;
    let bestDistance=Vector3.DistanceSquared(this.graph.getNode(start)!.data,target);

    for (let index=0;index<queue.length;++index) {
      const current=queue[index];
      const currentNode=this.graph.getNode(current)!;
      const distance=Vector3.DistanceSquared(currentNode.data,target);
      if (distance<bestDistance) {
        best=current;
        bestDistance=distance;
      }
      this.graph.forEachLinkedNode(current,(next,link)=>{
        if (parent.has(next.id) || this.isBlocked(currentNode.data,next.data,link,allowBreakable)) return;
        parent.set(next.id,current);
        queue.push(next.id);
      });
    }

    const ids: NodeId[]=[];
    for (let id: NodeId|undefined=best;id!==undefined;id=parent.get(id)) ids.push(id);
    ids.reverse();
    return ids.map(id=>this.graph.getNode(id)!.data);
  }

}
