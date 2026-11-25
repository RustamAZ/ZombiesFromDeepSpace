import { Vector3 } from '@babylonjs/core';

export interface StructuralCell {
  id: number;
  gridX: number;
  gridY: number;
  gridZ: number;
  localPosition: Vector3;
}

// Six-face connectivity only. A second walk labels each unsupported island once.
export function findUnsupportedGroups<T extends StructuralCell>(
  active: Iterable<T>, anchors: readonly T[], removed: ReadonlySet<number>,
  neighbors: (cell: T) => Iterable<T>
): T[][] {
  const visited = new Set(removed);
  const supported: T[] = [];
  for (const cell of anchors) {
    if (!visited.has(cell.id)) {
      visited.add(cell.id);
      supported.push(cell);
    }
  }
  function flood(queue: T[]): void {
    for (let i = 0; i < queue.length; ++i) {
      for (const next of neighbors(queue[i])) {
        if (visited.has(next.id)) continue;
        visited.add(next.id);
        queue.push(next);
      }
    }
  }
  flood(supported);
  const groups: T[][] = [];
  for (const cell of active) {
    if (visited.has(cell.id)) continue;
    visited.add(cell.id);
    const group = [cell];
    flood(group);
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

export function splitConnectedGroup<T extends StructuralCell>(group: readonly T[]): T[][] {
  if (group.length<2) return [Array.from(group)];
  const axes: Array<keyof Pick<StructuralCell,'gridX'|'gridY'|'gridZ'>>=['gridX','gridY','gridZ'];
  const axis=axes.reduce((best,current) => {
    const extent=(key: typeof current) => Math.max(...group.map(cell=>cell[key]))-Math.min(...group.map(cell=>cell[key]));
    return extent(current)>extent(best) ? current : best;
  });
  const ordered=Array.from(group).sort((a,b)=>a[axis]-b[axis]);
  const seeds=[ordered[0],ordered[ordered.length-1]] as const;
  const byPosition=new Map(group.map(cell=>[`${cell.gridX}:${cell.gridY}:${cell.gridZ}`,cell]));
  const owner=new Map<number,0|1>([[seeds[0].id,0],[seeds[1].id,1]]);
  const queue:T[]=[...seeds];
  const offsets=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;

  for (let index=0;index<queue.length;++index) {
    const cell=queue[index];
    for (const [x,y,z] of offsets) {
      const next=byPosition.get(`${cell.gridX+x}:${cell.gridY+y}:${cell.gridZ+z}`);
      if (!next || owner.has(next.id)) continue;
      owner.set(next.id,owner.get(cell.id)!);
      queue.push(next);
    }
  }
  return [group.filter(cell=>owner.get(cell.id)===0),group.filter(cell=>owner.get(cell.id)===1)]
    .filter(part=>part.length>0);
}

export function fractureConnectedGroup<T extends StructuralCell>(group: readonly T[], minLength: number): {
  rigidParts: T[][]; fractureCells: T[];
} {
  if (group.length<2) return {rigidParts:[Array.from(group)],fractureCells:[]};
  const axes: Array<keyof Pick<StructuralCell,'gridX'|'gridY'|'gridZ'>>=['gridX','gridY','gridZ'];
  const bounds=axes.map(axis=>({axis,min:Math.min(...group.map(cell=>cell[axis])),max:Math.max(...group.map(cell=>cell[axis]))}));
  const longest=bounds.reduce((best,current)=>current.max-current.min>best.max-best.min?current:best);
  if (longest.max-longest.min+1<minLength) {
    return {rigidParts:splitConnectedGroup(group),fractureCells:[]};
  }

  const cut=Math.round((longest.min+longest.max)/2);
  const fractureCells=group.filter(cell=>cell[longest.axis]===cut);
  const remaining=group.filter(cell=>cell[longest.axis]!==cut);
  const byPosition=new Map(remaining.map(cell=>[`${cell.gridX}:${cell.gridY}:${cell.gridZ}`,cell]));
  const visited=new Set<number>();
  const rigidParts:T[][]=[];
  const offsets=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
  for (const cell of remaining) {
    if (visited.has(cell.id)) continue;
    visited.add(cell.id);
    const part=[cell];
    for (let index=0;index<part.length;++index) {
      const current=part[index];
      for (const [x,y,z] of offsets) {
        const next=byPosition.get(`${current.gridX+x}:${current.gridY+y}:${current.gridZ+z}`);
        if (!next || visited.has(next.id)) continue;
        visited.add(next.id);
        part.push(next);
      }
    }
    rigidParts.push(part);
  }
  return {rigidParts:rigidParts.sort((a,b)=>b.length-a.length),fractureCells};
}
