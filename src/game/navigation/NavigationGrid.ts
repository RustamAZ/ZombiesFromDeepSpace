import { Vector3 } from '@babylonjs/core';
import createGraph from 'ngraph.graph';
import type { Link, NodeId } from 'ngraph.graph';
import { nba } from 'ngraph.path';

export type NavigationCell = { min: Vector3; max: Vector3 };
type Bounds = NavigationCell;
type Footprint = { x:number; z:number; sin:number; cos:number; halfWidth:number; halfDepth:number };
type Solid = Bounds & { floor?: boolean; slope?: number; breakable?: boolean; footprint?:Footprint; octagonRadius?:number };
function footprintDistanceSquared(p:Vector3,s:Solid):number {
  let dx:number,dz:number;
  if(s.footprint) {
    const f=s.footprint,lx=p.x-f.x,lz=p.z-f.z;
    dx=Math.max(0,Math.abs(lx*f.cos-lz*f.sin)-f.halfWidth);
    dz=Math.max(0,Math.abs(lx*f.sin+lz*f.cos)-f.halfDepth);
  } else {
    dx=Math.max(s.min.x-p.x,0,p.x-s.max.x);
    dz=Math.max(s.min.z-p.z,0,p.z-s.max.z);
  }
  return dx*dx+dz*dz;
}
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

  constructor(readonly radius: number, readonly height: number, private readonly onPathMeasured?:(ms:number)=>void) {}

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
  private over(x: number, z: number, s: Solid, pad: number): boolean {
    if (s.footprint) {
      const f=s.footprint,dx=x-f.x,dz=z-f.z;
      return Math.abs(dx*f.cos-dz*f.sin)<=f.halfWidth+pad &&
        Math.abs(dx*f.sin+dz*f.cos)<=f.halfDepth+pad;
    }
    if (s.octagonRadius && Math.abs(x-(s.min.x+s.max.x)/2)+Math.abs(z-(s.min.z+s.max.z)/2)>
      (s.octagonRadius+pad)*Math.SQRT2) return false;
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

  breakableAt(p:Vector3): NavigationCell | undefined {
    for (const cell of this.columns.get(key(Math.floor(p.x),Math.floor(p.z))) ?? []) {
      if (!cell.breakable || cell.max.y<=p.y || cell.min.y>=p.y+this.height) continue;
      if (footprintDistanceSquared(p,cell)<=this.radius*this.radius) return cell;
    }
    return undefined;
  }

  canStrikeCell(from:Vector3,cell:NavigationCell,reach:number):boolean {
    const x=Math.floor((cell.min.x+cell.max.x)*0.5), z=Math.floor((cell.min.z+cell.max.z)*0.5);
    return cell.max.y>from.y && cell.min.y<from.y+this.height &&
      footprintDistanceSquared(from,cell)<=reach*reach && this.columns.get(key(x,z))?.has(cell)===true;
  }

  breakableAhead(from:Vector3,toward:Vector3,distance:number): NavigationCell | undefined {
    const direction=toward.subtract(from); direction.y=0;
    if (direction.lengthSquared()<0.0001) return undefined;
    direction.normalize();
    for (let step=0;step<=distance;step+=0.12) {
      const sample=from.add(direction.scale(step));
      const blocker=this.blockerAt(sample,false);
      if (blocker?.breakable) return blocker;
      if (blocker) return undefined;
    }
    return undefined;
  }

  breakableWithinReach(from:Vector3,toward:Vector3,reach:number): NavigationCell | undefined {
    const direction=toward.subtract(from); direction.y=0;
    if (direction.lengthSquared()<0.0001) return undefined;
    direction.normalize();
    const seen=new Set<Solid>();
    let nearest:NavigationCell|undefined;
    let best=Infinity;
    for (let x=Math.floor(from.x-reach);x<=Math.floor(from.x+reach);++x) {
      for (let z=Math.floor(from.z-reach);z<=Math.floor(from.z+reach);++z) {
        for (const cell of this.columns.get(key(x,z)) ?? []) {
          if (seen.has(cell)) continue;
          seen.add(cell);
          if (!cell.breakable || cell.max.y<=from.y || cell.min.y>=from.y+this.height) continue;
          const dist2=footprintDistanceSquared(from,cell);
          if (dist2>reach*reach) continue;
          const center=cell.min.add(cell.max).scaleInPlace(0.5);
          const forward=(center.x-from.x)*direction.x+(center.z-from.z)*direction.z;
          if (forward < -0.15) continue;
          const lateral=(center.x-from.x)*direction.z-(center.z-from.z)*direction.x;
          const score=dist2+0.15*lateral*lateral+0.06*(center.y-from.y-this.height*0.5)**2;
          if (score<best) { best=score; nearest=cell; }
        }
      }
    }
    return nearest;
  }

  doorAssaultSpots(from:Vector3,toward:Vector3,planned?:NavigationCell): {position:Vector3;cell:NavigationCell}[] {
    const forward=toward.subtract(from); forward.y=0;
    if (forward.lengthSquared()<0.01) return [];
    forward.normalize();
    const side=new Vector3(forward.z,0,-forward.x);
    const laneSpacing=this.radius*2+0.05;
    let anchor=planned;
    if (!anchor || Vector3.DistanceSquared(from,anchor.min.add(anchor.max).scaleInPlace(0.5))>25) {
      anchor=undefined;
      for (const offset of [0,-laneSpacing,laneSpacing]) {
        const origin=from.add(side.scale(offset));
        anchor=this.breakableAhead(origin,origin.add(forward),4.5);
        if (anchor) break;
      }
    }
    if (!anchor) return [];
    const center=anchor.min.add(anchor.max).scaleInPlace(0.5);
    const cellSize=Math.max(anchor.max.x-anchor.min.x,anchor.max.z-anchor.min.z);
    const standOff=this.radius+cellSize/2+0.08;
    const spots: {position:Vector3;cell:NavigationCell}[]=[];
    for (const offset of [0,-laneSpacing,laneSpacing,-laneSpacing*2,laneSpacing*2]) {
      const lane=center.add(side.scale(offset));
      const position=lane.subtract(forward.scale(standOff)); position.y=from.y;
      if (!this.passable(position,position)) continue;
      const cell=this.breakableAhead(position,lane,standOff+0.35);
      if (cell) spots.push({position,cell});
    }
    return spots;
  }

  // A usable gap in a voxel doorway may lie entirely between two metre-grid lanes.
  addDoorLanes(x: number, z: number, yaw: number, width: number, cellSize: number): void {
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    const lanes=Math.round(width/cellSize)*2;
    for (let i=1;i<lanes;++i) {
      const offset=(i/lanes-0.5)*width;
      if (Math.abs(offset)+this.radius>=width/2 || (yaw===0 && Number.isInteger(offset))) continue;
      const ends=[-1,1].map(side=>{
        const p=new Vector3(x+sin*side+cos*offset,0,z+cos*side-sin*offset);
        const id='door:'+p.x+':'+p.z;
        this.graph.addNode(id,p);
        for(let gx=Math.floor(p.x-0.5);gx<=Math.ceil(p.x+0.5);gx++) {
          for(let gz=Math.floor(p.z-0.5);gz<=Math.ceil(p.z+0.5);gz++) {
            if (((gx-x)*sin+(gz-z)*cos)*side<0.5 || (gx-p.x)**2+(gz-p.z)**2>2.25) continue;
            const k=key(gx,gz);
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
      if (footprintDistanceSquared(p,s)>this.radius*this.radius) continue;
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
    if(!this.onPathMeasured)return this.buildPath(from,to,canBreach);
    const startMs=performance.now();
    try { return this.buildPath(from,to,canBreach); }
    finally { this.onPathMeasured(performance.now()-startMs); }
  }

  private buildPath(from: Vector3, to: Vector3, canBreach:boolean):NavigationPath {
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
