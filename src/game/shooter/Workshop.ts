import { AbstractMesh, Color3, Color4, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { VoxelModel } from '../entities/voxel/VoxelModel';
import { VoxelDebrisController } from '../entities/voxel/VoxelDebrisController';
import { shooterDebrisConfig } from '../entities/voxel/destructionConfig';
import type { VoxVoxel } from '../entities/voxel/VoxAsset';
import type { VoxelMaterialType } from '../entities/voxel/VoxelImpact';
import { VoxelDamageTarget } from './VoxelDamageTarget';
import type { Impact } from './ProjectileSystem';
import { NavigationGrid } from '../navigation/NavigationGrid';
import { VoxelZombie } from '../entities/enemies/voxelZombie/VoxelZombie';
import { zombieConfig } from '../entities/enemies/voxelZombie/config';
import type { Enemy, EnemyTarget } from '../entities/enemies/Enemy';
import type { VoxelWorldBounds } from '../entities/voxel/VoxelImpact';
import { cellSpacing, doorHeight, doorWidth, halfRoom, rooms, tunnels, type CrateColor, type Room } from './workshopLayout';

const voxelSize = 0.25;

const paint = {
  navy: '#223D4B', teal: '#278784', mint: '#9CDED0', white: '#F2ECCD',
  coral: '#EE6748', yellow: '#FFCB46', floor: '#647B81', grout: '#4B646A'
} as const;
type Paint = keyof typeof paint;
type NavigationObstacle = VoxelWorldBounds & { breakable?: boolean };
const cratePalettes: Record<CrateColor, string[]> = {
  gold: ['#FFC558', '#CE873C', '#FFF1AE'],
  blue: ['#597B9F', '#354D73', '#9ADCD6'],
  coral: [paint.coral, '#963F35', '#FFD1A2']
};

export class Workshop {
  private readonly materials = new Map<Paint, StandardMaterial>();
  private readonly trim: Mesh[] = [];
  private readonly targets: VoxelDamageTarget[] = [];
  private readonly grid = new NavigationGrid(Math.hypot(zombieConfig.width,zombieConfig.depth)*zombieConfig.cell/2+0.03,
    zombieConfig.height*zombieConfig.cell);
  private readonly obstacles = new Map<VoxelDamageTarget,NavigationObstacle[]>();
  private readonly doors = new WeakMap<VoxelWorldBounds,VoxelDamageTarget>();
  private readonly enemies: Enemy[] = [];
  private showNav=false;
  private debugGrid?: Mesh;
  private debugPath?: Mesh;
  private debugRevision=-1;
  private debugIn=0;
  private readonly debris = new VoxelDebrisController(shooterDebrisConfig.maxBodies);

  constructor(private readonly scene: Scene) {
    Object.entries(rooms).forEach(([id, room], i) => this.buildRoom(id, room, i + 1));
    for (const [a, b] of tunnels) this.buildTunnel(rooms[a], rooms[b]);
    this.grid.build();
    for (const [a,b] of tunnels) {
      const [ax,az]=rooms[a].cell, [bx,bz]=rooms[b].cell;
      const dx=bx-ax,dz=bz-az;
      this.grid.addDoorLanes(ax*cellSpacing+dx*halfRoom,az*cellSpacing+dz*halfRoom,dx!==0,doorWidth,voxelSize);
      this.grid.addDoorLanes(bx*cellSpacing-dx*halfRoom,bz*cellSpacing-dz*halfRoom,dx!==0,doorWidth,voxelSize);
    }
    const obstacleBreaker={
      break:(cell:VoxelWorldBounds,direction:Vector3,impact:Impact) => this.breakObstacle(cell,direction,impact)
    };
    for (const room of Object.values(rooms)) {
      const zombie=new VoxelZombie(scene,new Vector3(
        room.cell[0]*cellSpacing,0,room.cell[1]*cellSpacing
      ),this.grid,this.debris,obstacleBreaker);
      this.enemies.push(zombie);
      this.targets.push(zombie.target);
    }
  }

  hit(mesh: AbstractMesh, point: Vector3, direction: Vector3, normal: Vector3, impact: Impact): boolean {
    // Resolve hits on existing debris first. Nothing created by this shot can be hit twice.
    let affected = false;
    for (const target of this.targets) {
      if (target.model.hitLooseDebris(mesh, point, direction, impact.impactRadius)) affected = true;
    }
    for (const target of this.targets) {
      if (!target.hit(point, normal, impact)) continue;
      affected = true;
      this.refreshNavigationObstacle(target);
    }
    return affected;
  }

  private breakObstacle(cell: VoxelWorldBounds, direction: Vector3, impact: Impact): boolean {
    const door=this.doors.get(cell);
    if (!door || !door.hit(cell.min.add(cell.max).scaleInPlace(0.5),direction.negate(),impact)) return false;
    this.refreshNavigationObstacle(door);
    return true;
  }

  private refreshNavigationObstacle(target: VoxelDamageTarget): void {
    const old=this.obstacles.get(target);
    if (!old) return;
    const breakable=old.some(cell=>cell.breakable);
    const cells=target.model.getSolidContactBounds().map(cell=>({...cell,breakable}));
    this.grid.replace(old,cells,target.model.getWorldBounds());
    if (breakable) {
      for (const cell of old) this.doors.delete(cell);
      for (const cell of cells) this.doors.set(cell,target);
    }
    this.obstacles.set(target,cells);
  }


  updateEnemies(dt: number, player: EnemyTarget): void {
    this.debris.update(dt);
    for (const enemy of this.enemies) enemy.update(dt,player);
    if (this.showNav && (this.debugIn-=dt)<=0) {
      this.debugIn=0.2;
      if (this.debugRevision!==this.grid.revision) {
        this.debugGrid?.dispose();
        const lines=this.grid.debugPoints().map(p=>[p.add(new Vector3(-0.05,0.035,0)),p.add(new Vector3(0.05,0.035,0))]);
        const mesh=MeshBuilder.CreateLineSystem('nav-nodes',{lines},this.scene);
        mesh.color=new Color3(0.1,0.9,0.85); mesh.isPickable=false;
        this.debugGrid=mesh; this.debugRevision=this.grid.revision;
      }
      this.debugPath?.dispose();
      const lines:Vector3[][]=[];
      const colors:Color4[][]=[];
      const line=(points:Vector3[],color:Color4)=>{
        lines.push(points); colors.push(points.map(()=>color));
      };
      for (const e of this.enemies) {
        if (e.state==='dead') continue;
        const {position,route,lastSeen,strikePoint}=e.debug;
        if (route.length) line([position,...route].map(p=>p.add(new Vector3(0,0.09,0))),new Color4(1,0.8,0.15,1));
        if (lastSeen) line([lastSeen,lastSeen.add(new Vector3(0,0.65,0))],new Color4(0.2,0.85,1,1));
        if (strikePoint) line([position.add(new Vector3(0,0.9,0)),strikePoint],new Color4(1,0.2,0.15,1));
      }
      if (lines.length) {
        const mesh=MeshBuilder.CreateLineSystem('nav-route-and-memory',{lines,colors},this.scene);
        mesh.isPickable=false; this.debugPath=mesh;
      }
    }
  }

  toggleNavigationDebug(): void {
    this.showNav=!this.showNav; this.debugIn=0; this.debugRevision=-1;
    this.debugGrid?.dispose(); this.debugPath?.dispose();
    this.debugGrid=undefined; this.debugPath=undefined;
  }

  private box(color: Paint, x: number, y: number, z: number, width: number,
    height: number, depth: number, solid = false, tilt = 0, walkable = color==='floor'): Mesh {
    let material = this.materials.get(color);
    if (!material) {
      material = new StandardMaterial(color, this.scene);
      material.diffuseColor = Color3.FromHexString(paint[color]);
      material.specularColor = Color3.Black();
      this.materials.set(color, material);
    }
    const mesh = MeshBuilder.CreateBox(color, { width, height, depth }, this.scene);
    mesh.position.set(x, y, z);
    mesh.rotation.x = tilt;
    mesh.material = material;
    mesh.isPickable = mesh.checkCollisions = solid;
    if (solid) {
      const run=depth*Math.cos(tilt), rise=-Math.sin(tilt)*depth;
      this.grid.add({min:new Vector3(x-width/2,y-rise/2-height/2,z-run/2),
        max:new Vector3(x+width/2,y-rise/2+height/2,z+run/2), slope:-Math.tan(tilt),floor:walkable});
      new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.65 }, this.scene);
    } else {
      this.trim.push(mesh);
    }
    return mesh;
  }

  private mergeTrim(): void {
    for (const material of this.materials.values()) {
      const group = this.trim.filter(mesh => mesh.material === material);
      if (group.length) Mesh.MergeMeshes(group, true, true);
    }
    this.trim.length = 0;
  }

  private buildRoom(id: string, room: Room, number: number): void {
    const [cx, cz] = room.cell;
    const x = cx * cellSpacing, z = cz * cellSpacing, size = 2 * halfRoom;
    const neighbors = tunnels.flatMap(([a, b]) =>
      a === id ? [rooms[b].cell] : b === id ? [rooms[a].cell] : []);
    this.box('floor', x, -0.2, z, size, 0.4, size, true);
    this.box('teal', x, 5.45, z, size, 0.3, size, true);
    for (let n = -6; n <= 6; n += 2) {
      this.box('grout', x + n, 0.003, z, 0.026, 0.006, size);
      this.box('grout', x, 0.003, z + n, size, 0.006, 0.026);
    }
    for (const n of [-5, 0, 5]) {
      this.box('navy', x, 5.16, z + n, size, 0.32, 0.45);
      this.box('white', x, 4.96, z + n, 4.6, 0.12, 0.32);
      for (const t of [-6, 6]) this.box(room.accent, x + t, 4.98, z + n, 1.65, 0.18, 0.48);
    }
    for (const alongX of [false, true]) {
      for (const sign of [-1, 1]) {
        const dx = alongX ? sign : 0, dz = alongX ? 0 : sign;
        const open = neighbors.some(([nx, nz]) => nx === cx + dx && nz === cz + dz);
        this.buildRoomFace(x + dx * halfRoom, z + dz * halfRoom, alongX, sign, open, room.accent);
      }
    }
    // A pixel room number on the north wall remains visible above crates and doors.
    const digits = ['010110010010111','111001111100111','111001111001111',
      '101101111001001','111100111001111','111100111101111'];
    this.box('navy', x, 4.12, z + halfRoom - 0.24, 1.38, 1.58, 0.16);
    for (const [i, bit] of Array.from(digits[number - 1]).entries()) {
      if (bit === '1') this.box(room.accent, x + ((i % 3) - 1) * 0.22,
        4.12 + (2 - Math.floor(i / 3)) * 0.22, z + halfRoom - 0.36, 0.225, 0.225, 0.1);
    }
    for (const [ox, oz, color, material] of room.crates) this.crate(x + ox, z + oz, color, material);
    if (room.balcony) this.buildBalcony(x, z);
    this.mergeTrim();
  }

  private buildRoomFace(x: number, z: number, alongX: boolean, sign: number,
    open: boolean, accent: Paint): void {
    // t runs across the wall, inset points toward the interior on all four sides.
    const panel = (paint: Paint, t: number, y: number, inset: number,
      w: number, h: number, d: number, solid = false) =>
      this.box(paint, x + (alongX ? -sign * inset : t), y, z + (alongX ? t : -sign * inset),
        alongX ? d : w, h, alongX ? w : d, solid);

    const wing = open ? halfRoom - doorWidth / 2 : halfRoom;
    for (const side of [-1, 1]) {
      const t = side * (halfRoom - wing / 2);
      panel('mint', t, 2.7, 0, wing, 5.4, 0.4, true);
      panel('teal', t, 0.63, 0.22, wing, 1.26, 0.12);
      panel('white', t, 1.28, 0.25, wing, 0.12, 0.12);
      panel('teal', side * 6.8, 2.6, 0.23, 0.52, 5.2, 0.38);
      panel('navy', side * 6.8, 0.44, 0.28, 0.75, 0.88, 0.44);
      panel('white', side * 4.45, 2.95, 0.2, 2.28, 1.45, 0.19);
      for (const rib of [-0.68, -0.23, 0.23, 0.68])
        panel('teal', side * 4.45 + rib, 2.95, 0.33, 0.25, 1.04, 0.11);
    }
    if (!open) return;
    const lintel = 5.4 - doorHeight;
    panel('teal', 0, doorHeight + lintel / 2, 0, doorWidth, lintel, 0.4, true);
    panel('navy', 0, doorHeight + 0.16, 0.18, doorWidth + 0.64, 0.32, 0.4);
    panel(accent, 0, doorHeight + 0.16, 0.4, doorWidth, 0.14, 0.08);
    for (const side of [-1, 1]) {
      panel('navy', side * (doorWidth / 2 + 0.14), doorHeight / 2, 0.19, 0.28, doorHeight, 0.36);
      panel('yellow', side * (doorWidth / 2 + 0.14), doorHeight / 2, 0.39, 0.1, doorHeight, 0.08);
      for (let step = 1; step <= 4; step++)
        panel('yellow', side * (doorWidth / 2 - 0.14), 0.009, step * 1.35, 0.13, 0.012, 0.65);
    }
  }

  private buildTunnel(a: Room, b: Room): void {
    const alongX = a.cell[0] !== b.cell[0];
    const x = (a.cell[0] + b.cell[0]) * cellSpacing / 2;
    const z = (a.cell[1] + b.cell[1]) * cellSpacing / 2;
    const length = cellSpacing - 2 * halfRoom;
    const section = (color: Paint, across: number, y: number, along: number,
      w: number, h: number, d: number, solid = false) =>
      this.box(color, x + (alongX ? along : across), y, z + (alongX ? across : along),
        alongX ? d : w, h, alongX ? w : d, solid);

    section('floor', 0, -0.2, 0, doorWidth, 0.4, length, true);
    section('teal', 0, doorHeight + 0.15, 0, doorWidth + 0.6, 0.3, length, true);
    for (const side of [-1, 1]) {
      section('navy', side * (doorWidth / 2 + 0.15), doorHeight / 2, 0, 0.3, doorHeight, length, true);
      section('mint', side * (doorWidth / 2 - 0.02), 1.12, 0, 0.05, 0.11, length);
      const end = side * length / 2;
      this.barrier(x + (alongX ? end : 0), z + (alongX ? 0 : end), alongX);
    }
    for (const along of [-1.4, 0, 1.4]) section('white', 0, doorHeight - 0.06, along, 1.65, 0.12, 0.22);
    this.mergeTrim();
  }

  private barrier(x: number, z: number, alongX: boolean): void {
    const width = Math.round(doorWidth / voxelSize);
    const height = Math.round(doorHeight / voxelSize);
    this.voxelBlock(x, z, alongX ? 2 : width, alongX ? width : 2, height, 'soft',
      ['#EB744C', '#D55A40', '#FFD36A', '#F4EBCB', '#354754'], (i, j, h) => {
        const u = alongX ? j : i;
        const r = Math.hypot(u - (width - 1) / 2, h - (height - 1) / 2);
        if (r <= 1.2) return 4;
        if (r <= 2.35) return 3;
        if (r <= 3.45) return 2;
        return h % 3 === 0 || (u + 2 * Math.floor(h / 3)) % 5 === 0 ? 1 : 0;
      },true);
  }

  private buildBalcony(x: number, z: number): void {
    const height = 2, run = 5;
    this.box('floor', x - 4, height / 2 - 0.11, z + 1.5, 3.6, 0.22,
      Math.hypot(height, run), true, -Math.atan2(height, run));
    this.box('teal', x, height - 0.14, z + 6, 15.6, 0.28, 4, true, 0, true);
    this.box('yellow', x + 2.8, height, z + 4.04, 9.8, 0.14, 0.18);
    for (const offset of [-1.7, 2.8, 7.4]) this.box('navy', x + offset, 2.37, z + 4.07, 0.16, 0.86, 0.16, true);
    this.box('yellow', x + 2.85, 2.83, z + 4.07, 9.3, 0.14, 0.16, true);
  }

  private crate(x: number, z: number, color: CrateColor, material: VoxelMaterialType = 'soft'): void {
    this.voxelBlock(x, z, 6, 6, 6, material, cratePalettes[color], (i, j, k) => {
      if (k === 0 || k === 5) return 2;
      return i === 0 || i === 5 || j === 0 && i === k ? 1 : 0;
    });
  }

  private voxelBlock(x: number, z: number, width: number, depth: number, height: number,
    material: VoxelMaterialType, palette: string[], colorAt: (i: number, j: number, k: number) => number,
    enemyBreakable = false): void {
    const voxels: VoxVoxel[] = [];
    for (let i = 0; i < width; i++)
      for (let j = 0; j < depth; j++)
        for (let k = 0; k < height; k++)
          voxels.push({ x: i, y: j, z: k, colorIndex: colorAt(i, j, k) });
    const model = VoxelModel.fromData(this.scene, {
      size: new Vector3(width, depth, height), voxels, palette: palette.map(hex => Color3.FromHexString(hex))
    }, new Vector3(x + voxelSize / 2, 0, z + voxelSize / 2), this.debris, voxelSize);
    const target=new VoxelDamageTarget(model, material, 0);
    this.targets.push(target);
    const cells:NavigationObstacle[]=model.getSolidContactBounds()
      .map(cell=>({...cell,breakable:enemyBreakable}));
    for (const cell of cells) {
      this.grid.add(cell);
      if (enemyBreakable) this.doors.set(cell,target);
    }
    this.obstacles.set(target,cells);
    for (const mesh of model.getIntactMeshes()) {
      mesh.checkCollisions = mesh.isPickable = true;
    }
  }
}
