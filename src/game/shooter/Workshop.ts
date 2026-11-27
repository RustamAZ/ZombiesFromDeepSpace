import { AbstractMesh, Color3, Color4, Mesh, MeshBuilder, Ray, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
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
import { cellSpacing, doorHeight, doorWidth, halfRoom, type Room } from './workshopLayout';
import type { ProjectileSystem } from './ProjectileSystem';
import { CubeTurret } from '../entities/turrets/cubeTurret/CubeTurret';
import { CubeTurretVisual } from '../entities/turrets/cubeTurret/CubeTurretVisual';
import { Core } from '../entities/core/Core';
import { CoreVisual } from '../entities/core/CoreVisual';
import { EnemyWaveController } from '../waves/EnemyWaveController';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { LevelScenario, type ScenarioContext } from '../levels/scenarios/LevelScenario';
import { TutorialScenario } from '../levels/tutorial/TutorialScenario';
import { SurvivalScenario } from '../levels/firstLevel/SurvivalScenario';
import type { PlayerProfile } from '../profile/PlayerProfile';
import { SlidingDoor } from '../entities/doors/SlidingDoor';
import { cubeTurretConfig } from '../entities/turrets/cubeTurret/config';
import { RunProfile } from '../profile/RunProfile';
import { CoinPickup } from '../entities/coins/CoinPickup';
import { coinConfig } from '../entities/coins/config';
import { economyConfig } from '../economy/config';
import { CleanupButton } from '../entities/cleanup/CleanupButton';
import { CleanupButtonVisual } from '../entities/cleanup/CleanupButtonVisual';
import type { GameSound } from '../audio/config';

const voxelSize = 0.25;

const paint = {
  navy: '#223D4B', teal: '#278784', mint: '#9CDED0', white: '#F2ECCD',
  coral: '#EE6748', yellow: '#FFCB46', floor: '#647B81', grout: '#4B646A'
} as const;
type Paint = keyof typeof paint;
type NavigationObstacle = VoxelWorldBounds & { breakable?: boolean };

export class Workshop {
  private readonly materials = new Map<Paint, StandardMaterial>();
  private readonly trim: Mesh[] = [];
  private readonly targets: VoxelDamageTarget[] = [];
  private readonly registeredTargets = new Set<VoxelDamageTarget>();
  private readonly grid = new NavigationGrid(Math.hypot(zombieConfig.width,zombieConfig.depth)*zombieConfig.cell/2+0.03,
    zombieConfig.height*zombieConfig.cell);
  private gridReady=false;
  private readonly obstacles = new Map<VoxelDamageTarget,NavigationObstacle[]>();
  private readonly doors = new WeakMap<VoxelWorldBounds,VoxelDamageTarget>();
  private readonly enemies: Enemy[] = [];
  private readonly enemyTargets = new Set<VoxelDamageTarget>();
  private readonly turrets: CubeTurret[] = [];
  private readonly slidingDoors: SlidingDoor[]=[];
  private readonly coins:CoinPickup[]=[];
  readonly runProfile:RunProfile;
  private readonly cleanupButtons: CleanupButton[]=[];
  readonly core: Core;
  private readonly coreTarget: EnemyTarget;
  readonly waves: EnemyWaveController;
  readonly scenario:LevelScenario;
  get placedTurrets(): readonly CubeTurret[] { return this.turrets; }
  get placedDoors(): readonly SlidingDoor[] { return this.slidingDoors; }
  get placedCleanupButtons(): readonly CleanupButton[] { return this.cleanupButtons; }
  enemyBlockers(playerPosition:Vector3): {position:Vector3;radius:number}[] {
    return this.enemies.filter(enemy=>enemy.state!=='dead' &&
      Vector3.DistanceSquared(enemy.debug.position,playerPosition)<4 &&
      this.grid.passable(playerPosition,enemy.debug.position))
      .map(enemy=>({position:enemy.debug.position,radius:enemy.config.personalSpaceRadius}));
  }
  private showNav=false;
  private debugGrid?: Mesh;
  private debugPath?: Mesh;
  private debugRevision=-1;
  private debugIn=0;
  private readonly debris = new VoxelDebrisController(shooterDebrisConfig.maxBodies);

  constructor(private readonly scene: Scene, private readonly projectiles: ProjectileSystem,
    private readonly profile: PlayerProfile, readonly level:LevelDefinition, onCoreDestroyed?: () => void,
    private readonly onSound:(sound:GameSound)=>void = () => {}) {
    this.runProfile=new RunProfile();
    const {rooms,tunnels}=level;
    Object.entries(rooms).forEach(([id, room], i) => this.buildRoom(id, room, i + 1));
    for (const [a, b] of tunnels) this.buildTunnel(rooms[a], rooms[b]);
    this.grid.build();
    this.gridReady=true;
    for (const [a,b] of tunnels) {
      const [ax,az]=rooms[a].cell, [bx,bz]=rooms[b].cell;
      const dx=bx-ax,dz=bz-az;
      this.grid.addDoorLanes(ax*cellSpacing+dx*halfRoom,az*cellSpacing+dz*halfRoom,dx!==0,doorWidth,voxelSize);
      this.grid.addDoorLanes(bx*cellSpacing-dx*halfRoom,bz*cellSpacing-dz*halfRoom,dx!==0,doorWidth,voxelSize);
    }
    const obstacleBreaker={
      break:(cell:VoxelWorldBounds,direction:Vector3,impact:Impact) => this.breakObstacle(cell,direction,impact)
    };
    const coreRoom=rooms.core;
    this.core=new Core(new CoreVisual(scene,new Vector3(coreRoom.cell[0]*cellSpacing,0,coreRoom.cell[1]*cellSpacing-halfRoom+2.5)),undefined,onCoreDestroyed);
    const core=this.core;
    this.coreTarget={
      get feet() { return core.position; }, get eyes() { return core.position.add(new Vector3(0,1,0)); },
      get isAlive() { return !core.isDestroyed; }, visibilityHeight:1.5, visibilityRadius:1.3,
      takeDamage: amount=>core.takeDamage(amount)
    };
    const addTurret=(x:number,z:number,yaw=0)=>{
      const turret=new CubeTurret(scene,new CubeTurretVisual(scene,new Vector3(x,0,z),yaw),projectiles,
        ()=>this.enemies,cubeTurretConfig,()=>this.onSound('turret'));
      const source: EnemyTarget={
        get feet() { return turret.position.clone(); },
        get eyes() { return turret.position.add(new Vector3(0,0.75,0)); },
        get isAlive() { return !turret.isDestroyed; }, visibilityHeight:1, visibilityRadius:0.6,
        takeDamage: amount=>turret.takeDamage(amount)
      };
      turret.setDamageSource(source);
      this.turrets.push(turret);
    };
    for (const placement of level.turrets) {
      addTurret(placement.position[0],placement.position[2]);
      if (placement.destroyed) this.turrets[this.turrets.length-1].takeDamage(cubeTurretConfig.maxHealth);
    }
    const turret=(id:string)=>this.turrets[level.turrets.findIndex(item=>item.id===id)];
    const context:ScenarioContext={
      isClean:()=>this.cleanupButtons.every(button=>this.debris.countIn(button.bounds,true)===0),
      doorsRepaired:()=>this.slidingDoors.every(door=>!door.isDamaged && door.state==='closed'),
      turretReady:id=>!!turret(id) && !turret(id).isDestroyed && turret(id).ammo===turret(id).maxAmmo,
      emptyTurret:id=>turret(id)?.emptyAmmo(),
      addCoins:amount=>this.runProfile.addCoins(amount),
      ensureCoins:amount=>this.runProfile.addCoins(Math.max(0,amount-this.runProfile.coins-
        this.coins.length*economyConfig.coinsPerZombie)),
      serviceCost:()=>this.slidingDoors.filter(door=>door.isDamaged).length*economyConfig.doorRepairCost+
        this.turrets.reduce((sum,item)=>sum+(item.isDestroyed?economyConfig.turretRebuildCost:
          item.ammo<item.maxAmmo?economyConfig.turretRefillCost:0),0)
    };
    this.scenario=level.id==='tutorial' ? new TutorialScenario(context) : new SurvivalScenario(context);
    this.waves=new EnemyWaveController(level.waves,()=>this.spawnZombie(obstacleBreaker),{
      ready:()=>this.scenario.requirements.complete,
      completed:wave=>this.scenario.onWaveCompleted(wave),
      started:wave=>this.scenario.onWaveStarted(wave)
    },()=>this.profile.addExperience(2));
  }

  needsCleaning(id:string):boolean {
    const button=this.cleanupButtons.find(item=>item.roomId===id);
    return this.waves.canPurchase && !!button && this.debris.countIn(button.bounds)>0;
  }

  nearestRoomId(x:number,z:number):string {
    return Object.entries(this.level.rooms).sort(([,a],[,b])=>
      Math.hypot(x-a.cell[0]*cellSpacing,z-a.cell[1]*cellSpacing)-
      Math.hypot(x-b.cell[0]*cellSpacing,z-b.cell[1]*cellSpacing))[0][0];
  }

  hit(mesh: AbstractMesh, point: Vector3, direction: Vector3, normal: Vector3, impact: Impact): boolean {
    // Resolve hits on existing debris first. Nothing created by this shot can be hit twice.
    let affected = false;
    for (const target of this.targets) {
      if (target.model.hitLooseDebris(mesh, point, direction, impact.impactRadius)) affected = true;
    }
    for (const target of this.targets) {
      if (this.enemyTargets.has(target) && !target.model.getIntactMeshes().includes(mesh as Mesh)) continue;
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


  updateEnemies(dt: number, player: EnemyTarget, timeSeconds: number): void {
    this.debris.update(dt);
    for (let i=this.coins.length-1;i>=0;--i) {
      this.coins[i].update(dt,player.feet);
      if (!this.coins[i].canPickUp(player.feet)) continue;
      this.runProfile.addCoins(economyConfig.coinsPerZombie);
      this.onSound('coin');
      this.coins[i].dispose(); this.coins.splice(i,1);
    }
    for (const enemy of this.enemies) enemy.update(dt,player);
    this.waves.update(dt);
    for (let i=this.enemies.length-1;i>=0;--i) {
      const enemy=this.enemies[i];
      if (!(enemy instanceof VoxelZombie) || !enemy.deathComplete || this.debris.hasOwner(enemy.target.model)) continue;
      this.enemies.splice(i,1);
      this.enemyTargets.delete(enemy.target);
      const index=this.targets.indexOf(enemy.target);
      if (index>=0) this.targets.splice(index,1);
      enemy.target.model.disposeAll();
    }
    for (const button of this.cleanupButtons) button.setActive(this.needsCleaning(button.roomId));
    for (const turret of this.turrets) turret.update(dt,timeSeconds);
    for (const door of this.slidingDoors) door.update(dt,point=>Vector3.DistanceSquared(point,player.feet)<1.4);
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

  tryInteract(position: Vector3, aim:Ray): boolean {
    const action=this.getInteractions(position,aim);
    if (!action.e) return false;
    const cleanup=action.e==='cleanup' ? this.cleanupButtons.find(button=>
      button.inRange(position) && this.needsCleaning(button.roomId) &&
      this.aimedAt(aim,button.position.add(new Vector3(0,0.7,0)),0.65)) : undefined;
    if (cleanup) {
      this.debris.vacuum(cleanup.bounds,cleanup.position.add(new Vector3(0,0.2,0)),cleanup.config.suctionSeconds);
      cleanup.setActive(false);
      this.onSound('vacuum');
      return true;
    }
    const door=this.nearDoor(position);
    const changed=door?.tryInteract(position) ?? false;
    if (changed) this.onSound('door');
    return changed;
  }

  getInteractions(position:Vector3,aim:Ray): {e?:'cleanup'|'open'|'close';q?:'door'|'ammo'|'turret';cost?:number;
    ePosition?:Vector3;qPosition?:Vector3} {
    const button=this.cleanupButtons.find(item=>item.inRange(position) && this.needsCleaning(item.roomId) &&
      this.aimedAt(aim,item.position.add(new Vector3(0,0.7,0)),0.65));
    const candidateDoor=this.nearDoor(position);
    const door=candidateDoor && this.aimedAt(aim,candidateDoor.position.add(new Vector3(0,1.5,0)),1.8)
      ? candidateDoor : undefined;
    const candidateTurret=this.nearTurret(position);
    const turret=candidateTurret && this.aimedAt(aim,candidateTurret.position.add(new Vector3(0,0.65,0)),0.8)
      ? candidateTurret : undefined;
    const result:{e?:'cleanup'|'open'|'close';q?:'door'|'ammo'|'turret';cost?:number;
      ePosition?:Vector3;qPosition?:Vector3}={};
    if (button) { result.e='cleanup'; result.ePosition=button.position; }
    else if (door) {
      const opening=door.state==='closed' || door.state==='closing';
      if (!opening || !door.isJammed) {
        result.e=opening?'open':'close';
        result.ePosition=door.position.clone();
      }
    }
    if (!this.waves.canPurchase) return result;
    const doorDistance=door ? Vector3.DistanceSquared(door.position,position) : Infinity;
    const turretDistance=turret ? Vector3.DistanceSquared(turret.position,position) : Infinity;
    if (door && doorDistance<=turretDistance && door.state==='closed' && door.isDamaged) {
      result.q='door'; result.cost=economyConfig.doorRepairCost; result.qPosition=door.position.clone();
    } else if (turret) {
      if (turret.isDestroyed) { result.q='turret'; result.cost=economyConfig.turretRebuildCost; }
      else if (turret.ammo<turret.maxAmmo) { result.q='ammo'; result.cost=economyConfig.turretRefillCost; }
      if (result.q) result.qPosition=turret.position.clone();
    }
    return result;
  }

  tryPurchase(position:Vector3,aim:Ray): boolean {
    if (!this.waves.canPurchase) return false;
    const action=this.getInteractions(position,aim);
    if (!action.q || !action.cost || !this.runProfile.spendCoins(action.cost)) return false;
    if (action.q==='door') {
      const old=this.nearDoor(position)!;
      const index=this.slidingDoors.indexOf(old);
      for (const target of old.targets) {
        this.unregisterVoxelDoor(target);
        this.registeredTargets.delete(target);
        const targetIndex=this.targets.indexOf(target);
        if (targetIndex>=0) this.targets.splice(targetIndex,1);
        target.model.disposeAll();
      }
      this.slidingDoors[index]=this.makeDoor(old.position.clone(),old.alongX);
    } else {
      const turret=this.nearTurret(position)!;
      if (action.q==='turret') turret.rebuild();
      else turret.reload(turret.maxAmmo);
    }
    this.onSound('purchase');
    return true;
  }

  private nearDoor(position:Vector3): SlidingDoor|undefined {
    return this.slidingDoors.filter(item=>Vector3.DistanceSquared(item.position,position)<=item.config.interactionRange**2)
      .sort((a,b)=>Vector3.DistanceSquared(a.position,position)-Vector3.DistanceSquared(b.position,position))[0];
  }
  private nearTurret(position:Vector3): CubeTurret|undefined {
    return this.turrets.filter(item=>Vector3.DistanceSquared(item.position,position)<=2.4**2)
      .sort((a,b)=>Vector3.DistanceSquared(a.position,position)-Vector3.DistanceSquared(b.position,position))[0];
  }

  private aimedAt(aim:Ray,center:Vector3,radius:number): boolean {
    const offset=center.subtract(aim.origin);
    const along=Vector3.Dot(offset,aim.direction);
    if (along<=0) return false;
    const miss=offset.lengthSquared()-along*along;
    if (miss>radius*radius) return false;
    const entry=Math.max(0,along-Math.sqrt(Math.max(0,radius*radius-miss)));
    const obstruction=this.scene.pickWithRay(new Ray(aim.origin,aim.direction,entry),mesh=>
      mesh.isPickable && mesh.checkCollisions && mesh.isEnabled() && !mesh.metadata?.voxelDebris);
    return !obstruction?.hit;
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
    const {rooms,tunnels}=this.level;
    const [cx, cz] = room.cell;
    const x = cx * cellSpacing, z = cz * cellSpacing, size = 2 * halfRoom;
    const neighbors = tunnels.flatMap(([a, b]) =>
      a === id ? [rooms[b].cell] : b === id ? [rooms[a].cell] : []);
    this.box('floor', x, -0.2, z, size, 0.4, size, true);
    this.cleanupButtons.push(new CleanupButton(id,
      new CleanupButtonVisual(this.scene,new Vector3(x+5.6,0,z+4)),
      {min:new Vector3(x-halfRoom,-10,z-halfRoom),
        max:new Vector3(x+halfRoom,10,z+(id==='spawn'?halfRoom:cellSpacing-halfRoom))}));
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
      if (!this.level.singleTunnelDoor || side===-1)
        this.slidingDoors.push(this.makeDoor(new Vector3(x+(alongX?end:0),0,z+(alongX?0:end)),alongX));
    }
    for (const along of [-1.4, 0, 1.4]) section('white', 0, doorHeight - 0.06, along, 1.65, 0.12, 0.22);
    this.mergeTrim();
  }

  private spawnZombie(obstacleBreaker: { break(cell: VoxelWorldBounds, direction: Vector3, impact: Impact): boolean }): Enemy {
    const zombie=new VoxelZombie(this.scene,this.zombieSpawnPosition(),this.grid,this.debris,
      obstacleBreaker,()=>this.enemies,this.coreTarget,
      position=>this.coins.push(new CoinPickup(this.scene,position.add(new Vector3(0,coinConfig.spawnHeight,0)))));
    this.enemies.push(zombie); this.targets.push(zombie.target); this.enemyTargets.add(zombie.target);
    return zombie;
  }

  private zombieSpawnPosition(): Vector3 {
    const [roomX,roomZ]=this.level.rooms.spawn.cell;
    const centerX=roomX*cellSpacing, centerZ=roomZ*cellSpacing;
    const extent=halfRoom-this.grid.radius-0.5;
    const minDistance=(zombieConfig.personalSpaceRadius*2+0.3)**2;
    const available=(position:Vector3): boolean =>
      this.grid.passable(position,position) &&
      this.enemies.every(enemy=>enemy.state==='dead' ||
        Vector3.DistanceSquared(position,enemy.debug.position)>=minDistance) &&
      this.cleanupButtons.every(button=>Vector3.DistanceSquared(position,button.position)>minDistance);
    for (let attempt=0;attempt<48;++attempt) {
      const position=new Vector3(centerX+(Math.random()*2-1)*extent,0,centerZ+(Math.random()*2-1)*extent);
      if (available(position)) return position;
    }
    for (let x=-Math.floor(extent);x<=extent;++x)
      for (let z=-Math.floor(extent);z<=extent;++z) {
        const position=new Vector3(centerX+x,0,centerZ+z);
        if (available(position)) return position;
      }
    return new Vector3(centerX,0,centerZ);
  }

  private makeDoor(position:Vector3,alongX:boolean): SlidingDoor {
    return new SlidingDoor(this.scene,this.debris,position,alongX,doorWidth,
      (target,initial)=>this.registerVoxelDoor(target,initial),target=>this.unregisterVoxelDoor(target));
  }

  private registerVoxelDoor(target: VoxelDamageTarget, initial: boolean): void {
    if (!this.registeredTargets.has(target)) {
      this.registeredTargets.add(target);
      this.targets.push(target);
    }
    const cells=target.model.getSolidContactBounds().map(cell=>({...cell,breakable:true}));
    if (initial && !this.gridReady) for (const cell of cells) this.grid.add(cell);
    else this.grid.replace([],cells,target.model.getWorldBounds());
    this.obstacles.set(target,cells);
    for (const cell of cells) this.doors.set(cell,target);
    for (const mesh of target.model.getIntactMeshes()) mesh.checkCollisions=mesh.isPickable=true;
    target.model.setStaticCollisionEnabled(true);
  }

  private unregisterVoxelDoor(target: VoxelDamageTarget): void {
    const cells=this.obstacles.get(target);
    if (!cells) return;
    this.grid.replace(cells,[],target.model.getWorldBounds());
    for (const cell of cells) this.doors.delete(cell);
    this.obstacles.delete(target);
    for (const mesh of target.model.getIntactMeshes()) mesh.checkCollisions=mesh.isPickable=false;
    target.model.setStaticCollisionEnabled(false);
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
