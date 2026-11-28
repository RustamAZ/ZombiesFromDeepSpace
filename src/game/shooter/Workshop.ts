import { type AbstractMesh, Color3, Color4, Mesh, MeshBuilder, Ray, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { VoxelModel } from '../entities/voxel/VoxelModel';
import { VoxelDebrisController } from '../entities/voxel/VoxelDebrisController';
import { shooterDebrisConfig } from '../entities/voxel/destructionConfig';
import type { VoxVoxel } from '../entities/voxel/VoxAsset';
import type { VoxelMaterialType } from '../entities/voxel/VoxelImpact';
import { VoxelDamageTarget } from './VoxelDamageTarget';
import type { BlastTarget, Impact, ProjectileContact } from '../entities/projectiles/Projectile';
import { NavigationGrid } from '../navigation/NavigationGrid';
import { PathBuildQueue } from '../navigation/PathBuildQueue';
import { CrowdIndex } from '../navigation/CrowdIndex';
import type { NavigationFrameStats } from '../navigation/NavigationFrameStats';
import { VoxelZombie } from '../entities/enemies/voxelZombie/VoxelZombie';
import { ZombieAnimationVisibility } from '../entities/enemies/voxelZombie/ZombieAnimationVisibility';
import type { RoomTurret, TargetContext } from '../entities/enemies/voxelZombie/ZombieTargetPriority';
import { zombieConfig } from '../entities/enemies/voxelZombie/config';
import type { Enemy, EnemyTarget } from '../entities/enemies/Enemy';
import type { VoxelWorldBounds } from '../entities/voxel/VoxelImpact';
import { cellSpacing, doorHeight, doorWidth, halfRoom, type Room } from './workshopLayout';
import type { ProjectileSystem } from './ProjectileSystem';
import { CubeTurret } from '../entities/turrets/cubeTurret/CubeTurret';
import type { Turret } from '../entities/turrets/Turret';
import { CubeTurretVisual } from '../entities/turrets/cubeTurret/CubeTurretVisual';
import { Core } from '../entities/core/Core';
import { CoreVisual } from '../entities/core/CoreVisual';
import { EnemyWaveController } from '../waves/EnemyWaveController';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { LevelScenario, type ScenarioContext } from '../levels/scenarios/LevelScenario';
import { TutorialScenario } from '../levels/tutorial/TutorialScenario';
import { tutorialRules } from '../levels/tutorial/config';
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
import { CarrySlot, type CarryItem } from '../entities/carry/CarrySlot';
import { PlacementGrid, type PlacementCell } from '../building/PlacementGrid';
import { BuildCatalog } from '../building/BuildCatalog';
import { BuildingView } from '../building/BuildingView';
import { buildingConfig } from '../building/config';

const voxelSize = 0.25;

const paint = {
  navy: '#223D4B', teal: '#278784', mint: '#9CDED0', white: '#F2ECCD',
  coral: '#EE6748', yellow: '#FFCB46', floor: '#647B81', grout: '#4B646A'
} as const;
type Paint = keyof typeof paint;
type NavigationObstacle = VoxelWorldBounds & { voxelId:number; breakable?: boolean };
type ShopBlock = 'full'|'noSpace'|'kitPending';
type Interactions = {
  e?:'cleanup'|'open'|'close'|'buy'|'take'; q?:'door'|'ammo'|'turret'|'install'; r?:'upgrade'|'drop';
  ePosition?:Vector3; qPosition?:Vector3; rPosition?:Vector3;
  cost?:number; buyCost?:number; upgradeCost?:number; shopBlock?:ShopBlock;
};
const shopItemType='cube-turret';

export class Workshop {
  readonly carry=new CarrySlot();
  private readonly placement:PlacementGrid;
  private readonly roomEntries:readonly [string,Room][];
  private readonly spawnRooms:readonly Room[];
  private spawnCursor=0;
  private readonly catalog=new BuildCatalog();
  private groundKit?:{item:CarryItem;position:Vector3;dispensed:boolean};
  private readonly shopPosition:Vector3;
  private readonly buildingView:BuildingView;
  private candidate?:PlacementCell & {valid:boolean};
  private readonly materials = new Map<Paint, StandardMaterial>();
  private readonly trim: Mesh[] = [];
  private readonly targets: VoxelDamageTarget[] = [];
  private readonly registeredTargets = new Set<VoxelDamageTarget>();
  private readonly grid:NavigationGrid;
  private readonly pathBuilds?:PathBuildQueue;
  private readonly crowd:CrowdIndex;
  private gridReady=false;
  private readonly obstacles = new Map<VoxelDamageTarget,NavigationObstacle[]>();
  private readonly doors = new WeakMap<VoxelWorldBounds,VoxelDamageTarget>();
  private readonly enemies: Enemy[] = [];
  private readonly animationVisibility=new ZombieAnimationVisibility();
  private readonly enemyTargets = new Set<VoxelDamageTarget>();
  private readonly enemyMeshOwners = new WeakMap<AbstractMesh,VoxelDamageTarget>();
  private readonly turrets: Turret[] = [];
  private readonly roomTurrets=new Map<string,RoomTurret[]>();
  private readonly accessibility=new Map<string,{revision:number;reachable:boolean}>();
  private readonly slidingDoors: SlidingDoor[]=[];
  private readonly coins:CoinPickup[]=[];
  readonly runProfile:RunProfile;
  private readonly cleanupButtons: CleanupButton[]=[];
  readonly core: Core;
  private readonly coreTarget: EnemyTarget;
  readonly waves: EnemyWaveController;
  readonly scenario:LevelScenario;
  get placedTurrets(): readonly Turret[] { return this.turrets; }
  get optionalPurchaseCoins():number {
    const reserve=this.level.id==='tutorial' && !this.scenario.requirements.complete ? this.trainingServiceCost() : 0;
    return Math.max(0,this.runProfile.coins-reserve);
  }
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
    private readonly onSound:(sound:GameSound)=>void = () => {}, private readonly stats?:NavigationFrameStats) {
    this.crowd=new CrowdIndex(stats?.recordCrowd);
    if(level.maxPathBuildsPerFrame!==undefined)
      this.pathBuilds=new PathBuildQueue(level.maxPathBuildsPerFrame);
    this.grid=new NavigationGrid(Math.hypot(zombieConfig.width,zombieConfig.depth)*zombieConfig.cell/2+0.03,
      zombieConfig.height*zombieConfig.cell,stats?.recordPath);
    this.runProfile=new RunProfile();
    this.runProfile.addCoins(level.startingCoins ?? 0);
    const {rooms,tunnels}=level;
    this.placement=new PlacementGrid(level.turretLimits);
    this.roomEntries=Object.entries(rooms);
    this.spawnRooms=(level.spawnRoomIds ?? ['spawn']).map(id=>{
      if(!rooms[id]) throw new Error(`Unknown spawn room: ${id}`);
      return rooms[id];
    });
    this.roomEntries.forEach(([id, room], i) => this.buildRoom(id, room, i + 1));
    for (const [a, b] of tunnels) this.buildTunnel(rooms[a], rooms[b]);
    this.grid.build();
    this.gridReady=true;
    for (const door of this.slidingDoors)
      this.grid.addDoorLanes(door.position.x,door.position.z,door.yaw,doorWidth,voxelSize);
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
        ()=>this.enemies,cubeTurretConfig,()=>this.onSound('turret'),stats?.recordTurretSightRay);
      const source: EnemyTarget={
        get feet() { return turret.position.clone(); },
        get eyes() { return turret.position.add(new Vector3(0,0.75,0)); },
        get isAlive() { return !turret.isDestroyed; }, visibilityHeight:1, visibilityRadius:0.6,
        takeDamage: amount=>turret.takeDamage(amount)
      };
      turret.setDamageSource(source);
      const roomId=this.nearestRoomId(x,z);
      let local=this.roomTurrets.get(roomId);
      if(!local)this.roomTurrets.set(roomId,local=[]);
      local.push({target:source,position:turret.position,get armed(){return turret.isArmed;}});
      this.turrets.push(turret);
      return turret;
    };
    for (const placement of level.turrets) {
      const turret=addTurret(placement.position[0],placement.position[2]);
      while (turret.level<(placement.level ?? 1)) {
        if (!turret.upgrade()) throw new Error(`Invalid start level for turret ${placement.id}: ${placement.level}`);
      }
      if (placement.fullyLoaded) turret.reload(turret.maxAmmo);
      const roomId=this.nearestRoomId(turret.position.x,turret.position.z);
      const cell=this.placement.candidate(turret.position,roomId,this.roomCenter(roomId));
      if (!this.placement.occupy(cell)) throw new Error(`Invalid start slot for turret ${placement.id}: ${cell.id}`);
      if (placement.destroyed) turret.takeDamage(turret.maxHealth);
    }
    this.catalog.register(shopItemType,{price:buildingConfig.price,footprint:cubeTurretConfig.footprint,
      create:position=>{const turret=addTurret(position.x,position.z);turret.reload(turret.maxAmmo);}});
    this.shopPosition=new Vector3(coreRoom.cell[0]*cellSpacing+(level.roomShape==='octagon'?2.8:5),0,coreRoom.cell[1]*cellSpacing-halfRoom+1);
    this.buildingView=new BuildingView(scene,this.shopPosition);
    const context:ScenarioContext={
      isClean:()=>this.cleanupButtons.every(button=>this.debris.countIn(button.bounds,true)===0),
      doorsRepaired:()=>this.slidingDoors.every(door=>!door.isDamaged && door.state==='closed'),
      turretReady:id=>{
        const turret=this.startingTurret(id);
        return !!turret && !turret.isDestroyed && turret.ammo===turret.maxAmmo;
      },
      emptyTurret:id=>this.startingTurret(id)?.emptyAmmo(),
      addCoins:amount=>this.runProfile.addCoins(amount),
      ensureCoins:amount=>this.runProfile.addCoins(Math.max(0,amount-this.runProfile.coins-
        this.coins.length*economyConfig.coinsPerZombie)),
      serviceCost:()=>this.trainingServiceCost()
    };
    this.scenario=level.id==='tutorial' ? new TutorialScenario(context) :
      new SurvivalScenario(context,level.finishAfterLastWave ? level.waves.length : undefined);
    this.waves=new EnemyWaveController(level.waves,()=>{
      const work=stats?.currentWaveWork;
      const start=work ? performance.now() : 0;
      const enemy=this.spawnZombie(obstacleBreaker);
      if (work) { work.spawnMs+=performance.now()-start; ++work.spawned; }
      return enemy;
    },{
      ready:()=>this.scenario.requirements.complete,
      completed:wave=>this.scenario.onWaveCompleted(wave),
      started:wave=>this.scenario.onWaveStarted(wave)
    },()=>this.profile.addExperience(2),level.finishAfterLastWave);
  }

  private startingTurret(id:string):Turret|undefined {
    return this.turrets[this.level.turrets.findIndex(item=>item.id===id)];
  }

  private trainingServiceCost():number {
    const turret=this.startingTurret(tutorialRules.turretId);
    return this.slidingDoors.filter(door=>door.isDamaged).length*economyConfig.doorRepairCost+
      (!turret ? 0 : turret.isDestroyed ? economyConfig.turretRebuildCost :
        turret.ammo<turret.maxAmmo ? economyConfig.turretRefillCost : 0);
  }

  needsCleaning(id:string):boolean {
    const button=this.cleanupButtons.find(item=>item.roomId===id);
    return this.waves.canPurchase && !!button && this.debris.countIn(button.bounds)>0;
  }

  nearestRoomId(x:number,z:number):string {
    let nearest=this.roomEntries[0][0],best=Infinity;
    for(const [id,{cell}] of this.roomEntries) {
      const dx=x-cell[0]*cellSpacing,dz=z-cell[1]*cellSpacing,distance=dx*dx+dz*dz;
      if(distance<best) { best=distance; nearest=id; }
    }
    return nearest;
  }

  hit({mesh,point,direction,normal}: ProjectileContact, impact: Impact, hitEnemies = true): boolean {
    // Resolve hits on existing debris first. Nothing created by this shot can be hit twice.
    let affected = false;
    if (hitEnemies) {
      for (const target of this.targets) {
        if (target.model.hitLooseDebris(mesh, point, direction, impact.impactRadius)) affected = true;
      }
    }
    for (const target of this.targets) {
      if (this.enemyTargets.has(target) && (!hitEnemies || this.enemyMeshOwners.get(mesh)!==target)) continue;
      if (!target.hit(point, normal, impact)) continue;
      affected = true;
      this.refreshNavigationObstacle(target);
    }
    return affected;
  }

  targetsInBlast(contact:ProjectileContact,radius:number):BlastTarget[] {
    const targets:BlastTarget[]=[];
    const directTarget=this.enemyMeshOwners.get(contact.mesh);
    const aim=Vector3.Zero();
    for (const enemy of this.enemies) {
      if (!(enemy instanceof VoxelZombie) || enemy.state==='dead') continue;
      enemy.aimPointToRef(aim);
      if (enemy.target!==directTarget && Vector3.DistanceSquared(aim,contact.point)>radius*radius) continue;
      const normal=contact.point.subtract(aim);
      if (normal.lengthSquared()<0.000001) normal.copyFrom(contact.normal);
      else normal.normalize();
      targets.push({hit:impact=>enemy.target.hitFromBlast(contact.point,normal,impact,radius)});
    }
    return targets;
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
    const removed:NavigationObstacle[]=[];
    let kept=0;
    for (const cell of old) {
      if (target.model.isIntactVoxel(cell.voxelId)) old[kept++]=cell;
      else {
        removed.push(cell);
        this.doors.delete(cell);
      }
    }
    old.length=kept;
    if (!removed.length) return;
    const area={min:removed[0].min.clone(),max:removed[0].max.clone()};
    for (const cell of removed) {
      area.min.minimizeInPlace(cell.min);
      area.max.maximizeInPlace(cell.max);
    }
    this.grid.replace(removed,[],area);
  }


  updateEnemies(dt: number, player: EnemyTarget, timeSeconds: number, stats?:NavigationFrameStats): void {
    this.debris.update(dt);
    for (let i=this.coins.length-1;i>=0;--i) {
      this.coins[i].update(dt,player.feet);
      if (!this.coins[i].canPickUp(player.feet)) continue;
      this.runProfile.addCoins(economyConfig.coinsPerZombie);
      this.onSound('coin');
      this.coins[i].dispose(); this.coins.splice(i,1);
    }
    stats?.mark('debrisAndCoins');
    this.pathBuilds?.beginFrame();
    const stamp=stats?.enemyClock() ?? 0;
    this.animationVisibility.update(this.scene,this.enemies,timeSeconds);
    stats?.endEnemyStage('visibility',stamp);
    for (const enemy of this.enemies) {
      if(enemy.deathComplete)continue;
      const animate=this.animationVisibility.shouldAnimate(enemy);
      stats?.recordPoseVisibility(animate);
      enemy.update(dt,player,stats,animate);
    }
    stats?.mark('enemies');
    this.waves.update(dt);
    const work=stats?.currentWaveWork;
    for (let i=this.enemies.length-1;i>=0;--i) {
      const enemy=this.enemies[i];
      if (!(enemy instanceof VoxelZombie) || !enemy.deathComplete || this.debris.hasOwner(enemy.target.model)) continue;
      const start=work ? performance.now() : 0;
      this.enemies.splice(i,1);
      this.enemyTargets.delete(enemy.target);
      const index=this.targets.indexOf(enemy.target);
      if (index>=0) this.targets.splice(index,1);
      enemy.target.model.disposeAll();
      if (work) { work.removeMs+=performance.now()-start; ++work.removed; }
    }
    stats?.recordAlive(this.waves.status.alive);
    stats?.mark('wave');
    for (const button of this.cleanupButtons) button.setActive(this.needsCleaning(button.roomId));
    stats?.mark('defenseOther');
    for (const turret of this.turrets) turret.update(dt,timeSeconds);
    stats?.mark('turrets');
    for (const door of this.slidingDoors) door.update(dt,point=>Vector3.DistanceSquared(point,player.feet)<1.4);
    stats?.mark('doors');
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
    stats?.mark('defenseOther');
  }

  toggleNavigationDebug(): void {
    this.showNav=!this.showNav; this.debugIn=0; this.debugRevision=-1;
    this.debugGrid?.dispose(); this.debugPath?.dispose();
    this.debugGrid=undefined; this.debugPath=undefined;
  }

  tryInteract(position: Vector3, aim:Ray): boolean {
    const action=this.getInteractions(position,aim);
    if (action.e==='take') {
      if (!this.groundKit || !this.carry.take(this.groundKit.item)) return false;
      this.groundKit=undefined;
      return true;
    }
    if (action.e==='buy' && action.buyCost!==undefined) {
      if (this.optionalPurchaseCoins<action.buyCost || !this.runProfile.spendCoins(action.buyCost)) return false;
      this.groundKit={item:this.catalog.kit(shopItemType),
        position:this.shopPosition.add(new Vector3(0,buildingConfig.kitSize/2,1.2)),dispensed:true};
      this.onSound('purchase');
      return true;
    }
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

  getInteractions(position:Vector3,aim:Ray):Interactions {
    const kit=this.groundKit;
    if (!this.carry.item && kit && Vector3.Distance(position,kit.position)<=buildingConfig.kitReach &&
        this.aimedAt(aim,kit.position,buildingConfig.kitSize*0.7)) return {e:'take',ePosition:kit.position};
    if (!this.carry.item && this.waves.canPurchase &&
        Vector3.Distance(position,this.shopPosition)<=buildingConfig.kitReach &&
        this.aimedAt(aim,this.shopPosition.add(new Vector3(0,1,0.55)),0.9)) {
      const shopBlock=this.shopBlock();
      return shopBlock ? {shopBlock} : {e:'buy',ePosition:this.shopPosition,buyCost:this.catalog.get(shopItemType)!.price};
    }
    const button=this.cleanupButtons.find(item=>item.inRange(position) && this.needsCleaning(item.roomId) &&
      this.aimedAt(aim,item.position.add(new Vector3(0,0.7,0)),0.65));
    const candidateDoor=this.nearDoor(position);
    const door=candidateDoor && this.aimedAt(aim,candidateDoor.position.add(new Vector3(0,1.5,0)),1.8)
      ? candidateDoor : undefined;
    const result:Interactions={};
    if (button) { result.e='cleanup'; result.ePosition=button.position; }
    else if (door) {
      const opening=door.state==='closed' || door.state==='closing';
      if (!opening || !door.isJammed) {
        result.e=opening?'open':'close';
        result.ePosition=door.position.clone();
      }
    }
    if (this.carry.item) {
      if (this.candidate?.valid) { result.q='install'; result.qPosition=this.candidate.position; }
      result.r='drop';
      return result;
    }
    if (!this.waves.canPurchase) return result;
    const turret=this.nearTurret(position,aim);
    const doorDistance=door ? Vector3.DistanceSquared(door.position,position) : Infinity;
    const turretDistance=turret ? Vector3.DistanceSquared(turret.position,position) : Infinity;
    if (door && doorDistance<=turretDistance && door.state==='closed' && door.isDamaged) {
      result.q='door'; result.cost=economyConfig.doorRepairCost; result.qPosition=door.position.clone();
    } else if (turret) {
      if (turret.isDestroyed) { result.q='turret'; result.cost=economyConfig.turretRebuildCost; }
      else if (turret.ammo<turret.maxAmmo) { result.q='ammo'; result.cost=economyConfig.turretRefillCost; }
      if (result.q) result.qPosition=turret.position.clone();
      const upgrade=turret.getNextUpgrade();
      if (upgrade) { result.r='upgrade'; result.upgradeCost=upgrade.cost; result.rPosition=turret.position.clone(); }
    }
    return result;
  }

  tryPurchase(position:Vector3,aim:Ray): boolean {
    if(this.carry.item) {
      this.updatePlacement(position,aim);
      const cell=this.candidate,definition=this.catalog.get(this.carry.item.placementType);
      if(!cell?.valid||!definition||!this.placement.occupy(cell))return false;
      definition.create(cell.position);this.carry.release();this.candidate=undefined;return true;
    }
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
      this.slidingDoors[index]=this.makeDoor(old.position.clone(),old.yaw);
    } else {
      const turret=this.nearTurret(position,aim)!;
      if (action.q==='turret') turret.rebuild();
      else turret.reload(turret.maxAmmo);
    }
    this.onSound('purchase');
    return true;
  }

  tryAlternate(position:Vector3,aim:Ray):boolean {
    const item=this.carry.release();
    if (item) {
      this.groundKit={item,position:new Vector3(position.x,position.y+buildingConfig.kitSize/2,position.z),dispensed:false};
      this.candidate=undefined;
      return true;
    }
    if (this.getInteractions(position,aim).r!=='upgrade') return false;
    const turret=this.nearTurret(position,aim);
    const upgrade=turret?.getNextUpgrade();
    if (!turret || !upgrade || this.optionalPurchaseCoins<upgrade.cost || !this.runProfile.spendCoins(upgrade.cost)) return false;
    if (!turret.upgrade()) {
      this.runProfile.addCoins(upgrade.cost);
      return false;
    }
    this.onSound('purchase');
    return true;
  }

  private nearDoor(position:Vector3): SlidingDoor|undefined {
    return this.slidingDoors.filter(item=>Vector3.DistanceSquared(item.position,position)<=item.config.interactionRange**2)
      .sort((a,b)=>Vector3.DistanceSquared(a.position,position)-Vector3.DistanceSquared(b.position,position))[0];
  }

  private roomCenter(roomId:string):Vector3 {
    const [x,z]=this.level.rooms[roomId].cell;
    return new Vector3(x*cellSpacing,0,z*cellSpacing);
  }

  private placementBlockers():readonly VoxelWorldBounds[] {
    return this.scene.meshes.filter(mesh=>mesh.metadata?.placementBlocker && mesh.isEnabled()).map(mesh=>{
      const {minimumWorld,maximumWorld}=mesh.getBoundingInfo().boundingBox;
      return {min:minimumWorld,max:maximumWorld};
    });
  }

  private cellFits(cell:PlacementCell,footprint:number,blockers:readonly VoxelWorldBounds[]):boolean {
    const p=cell.position,center=this.roomCenter(cell.roomId);
    const edge=halfRoom-buildingConfig.wallMargin, extent=footprint/2+buildingConfig.placementPadding;
    return this.placement.isFree(cell) && Math.abs(p.x-center.x)<=edge && Math.abs(p.z-center.z)<=edge &&
      (this.level.roomShape!=='octagon' || Math.abs(p.x-center.x)+Math.abs(p.z-center.z)+2*extent<=halfRoom*Math.SQRT2) &&
      !blockers.some(({min,max})=>p.x+extent>min.x && p.x-extent<max.x && p.z+extent>min.z && p.z-extent<max.z);
  }

  private shopBlock():ShopBlock|undefined {
    const rooms=Object.keys(this.level.rooms).filter(id=>this.placement.hasRoomCapacity(id));
    if (!rooms.length) return 'full';
    if (this.groundKit) return 'kitPending';
    const footprint=this.catalog.get(shopItemType)!.footprint, blockers=this.placementBlockers();
    for (const roomId of rooms) {
      for (const cell of this.placement.cells(roomId,this.roomCenter(roomId),halfRoom-buildingConfig.wallMargin))
        if (this.cellFits(cell,footprint,blockers)) return undefined;
    }
    return 'noSpace';
  }

  private targetContext(position:Vector3,player:EnemyTarget):TargetContext {
    const roomId=this.roomEntries.find(([,room])=>{
      const dx=Math.abs(position.x-room.cell[0]*cellSpacing),dz=Math.abs(position.z-room.cell[1]*cellSpacing);
      const extent=halfRoom-0.2;
      return dx<extent && dz<extent && (this.level.roomShape!=='octagon' || dx+dz<extent*Math.SQRT2);
    })?.[0];
    const reachable=(to:Vector3)=>{
      const key=[Math.round(position.x),Math.round(position.z),Math.round(to.x),Math.round(to.z)].join(':');
      const old=this.accessibility.get(key);
      if(old?.revision===this.grid.revision)return old.reachable;
      let result=this.grid.passable(position,to);
      if(!result && this.level.enemyPathfinding!==false) {
        // The zombie's persistent position object is its FIFO identity, even as it moves.
        if(this.pathBuilds && !this.pathBuilds.tryAcquire(position))return undefined;
        const path=this.grid.path(position,to,false).points;
        result=!!path.length&&Vector3.DistanceSquared(path[path.length-1],to)<0.25;
      }
      if(this.accessibility.size>1024)this.accessibility.clear();
      this.accessibility.set(key,{revision:this.grid.revision,reachable:result});return result;
    };
    return {roomId,player,position,turrets:roomId ? this.roomTurrets.get(roomId) ?? [] : [],canReach:reachable};
  }

  private updatePlacement(position:Vector3,aim:Ray):void {
    this.candidate=undefined;
    const item=this.carry.item, definition=item && this.catalog.get(item.placementType);
    if(!definition || aim.direction.y>=-0.01)return;
    const distance=-aim.origin.y/aim.direction.y;
    if(distance<0||distance>buildingConfig.reach)return;
    const point=aim.origin.add(aim.direction.scale(distance));
    const roomId=this.nearestRoomId(point.x,point.z);
    const cell=this.placement.candidate(point,roomId,this.roomCenter(roomId)),p=cell.position;
    const delta=p.add(new Vector3(0,0.06,0)).subtract(aim.origin), reach=delta.length();
    const visible=reach<=buildingConfig.reach && !this.scene.pickWithRay(new Ray(aim.origin,delta.scale(1/reach),reach),
      mesh=>mesh.isEnabled() && (mesh.metadata?.placementBlocker ||
        mesh.isPickable && mesh.checkCollisions && !mesh.metadata?.voxelDebris))?.hit;
    const valid=visible && this.cellFits(cell,definition.footprint,this.placementBlockers()) &&
      Vector3.Distance(p,position)>1.3 &&
      this.enemies.every(e=>e.state==='dead'||Vector3.Distance(p,e.debug.position)>1.5);
    this.candidate={...cell,valid};
  }

  updateBuilding(dt:number,position:Vector3,aim:Ray):Interactions {
    this.updatePlacement(position,aim);
    const action=this.getInteractions(position,aim);
    const camera=this.scene.activeCamera;
    if(camera)this.buildingView.update(dt,this.shopPosition,position,camera,!!this.carry.item,this.groundKit,
      this.candidate,action,this.optionalPurchaseCoins);
    return action;
  }
  private nearTurret(position:Vector3,aim:Ray): Turret|undefined {
    return this.turrets.filter(item=>Vector3.DistanceSquared(item.position,position)<=2.4**2 &&
      this.aimedAt(aim,item.position.add(new Vector3(0,0.65,0)),0.8))
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
    height: number, depth: number, solid = false, tilt = 0, walkable = color==='floor', yaw=0, octagonal=false): Mesh {
    let material = this.materials.get(color);
    if (!material) {
      material = new StandardMaterial(color, this.scene);
      material.diffuseColor = Color3.FromHexString(paint[color]);
      material.specularColor = Color3.Black();
      this.materials.set(color, material);
    }
    const mesh = octagonal ? MeshBuilder.CreateCylinder(color,{height,diameter:width/Math.cos(Math.PI/8),tessellation:8},this.scene)
      : MeshBuilder.CreateBox(color, { width, height, depth }, this.scene);
    mesh.position.set(x, y, z);
    mesh.rotation.x = tilt;
    mesh.rotation.y = octagonal ? Math.PI/8 : yaw;
    mesh.material = material;
    mesh.isPickable = mesh.checkCollisions = solid;
    if (solid) {
      this.stats?.meshes.tag(mesh,'environment');
      const run=depth*Math.cos(tilt), rise=-Math.sin(tilt)*depth;
      const sin=Math.sin(yaw),cos=Math.cos(yaw);
      const hx=(Math.abs(cos)*width+Math.abs(sin)*run)/2,hz=(Math.abs(sin)*width+Math.abs(cos)*run)/2;
      this.grid.add({min:new Vector3(x-hx,y-rise/2-height/2,z-hz),
        max:new Vector3(x+hx,y-rise/2+height/2,z+hz), slope:-Math.tan(tilt),floor:walkable,
        footprint:yaw ? {x,z,sin,cos,halfWidth:width/2,halfDepth:run/2} : undefined,
        octagonRadius:octagonal?width/2:undefined});
      new PhysicsAggregate(mesh, octagonal?PhysicsShapeType.CONVEX_HULL:PhysicsShapeType.BOX, { mass: 0, friction: 0.65 }, this.scene);
    } else {
      this.trim.push(mesh);
    }
    return mesh;
  }

  private mergeTrim(): void {
    for (const material of this.materials.values()) {
      const group = this.trim.filter(mesh => mesh.material === material);
      if (group.length) {
        const merged=Mesh.MergeMeshes(group, true, true);
        if(merged) this.stats?.meshes.tag(merged,'environment');
      }
    }
    this.trim.length = 0;
  }

  private buildRoom(id: string, room: Room, number: number): void {
    const {rooms,tunnels}=this.level;
    const [cx, cz] = room.cell;
    const x = cx * cellSpacing, z = cz * cellSpacing, size = 2 * halfRoom;
    const neighbors = tunnels.flatMap(([a, b]) =>
      a === id ? [rooms[b].cell] : b === id ? [rooms[a].cell] : []);
    const octagonal=this.level.roomShape==='octagon';
    const span=(offset:number)=>octagonal ? 2*Math.min(halfRoom,halfRoom*Math.SQRT2-Math.abs(offset)) : size;
    this.box('floor', x, -0.2, z, size, 0.4, size, true,0,true,0,octagonal);
    // The inner room's vacuum owns each incoming corridor, including lateral approaches.
    const min=new Vector3(x-halfRoom,-10,z-halfRoom),max=new Vector3(x+halfRoom,10,z+halfRoom);
    const approaches:{dx:number;dz:number;end:number}[]=[];
    for(const [outer,inner] of tunnels) {
      if(inner!==id) continue;
      const [ox,oz]=rooms[outer].cell;
      const length=Math.hypot(ox-cx,oz-cz), reach=cellSpacing-halfRoom/length;
      approaches.push({dx:(ox-cx)/length,dz:(oz-cz)/length,end:reach*length});
      const endX=x+(ox-cx)*reach,endZ=z+(oz-cz)*reach;
      const pad=ox!==cx && oz!==cz ? doorWidth/2 : 0;
      min.x=Math.min(min.x,endX-pad); max.x=Math.max(max.x,endX+pad);
      min.z=Math.min(min.z,endZ-pad); max.z=Math.max(max.z,endZ+pad);
    }
    const contains=octagonal ? (p:Vector3)=>{
      const dx=p.x-x,dz=p.z-z;
      if(Math.max(Math.abs(dx),Math.abs(dz))<=halfRoom && Math.abs(dx)+Math.abs(dz)<=halfRoom*Math.SQRT2) return true;
      return approaches.some(a=>{
        const along=dx*a.dx+dz*a.dz;
        return along>=halfRoom-0.2 && along<=a.end+0.2 && Math.abs(dx*a.dz-dz*a.dx)<=doorWidth/2+0.2;
      });
    } : undefined;
    this.cleanupButtons.push(new CleanupButton(id,
      new CleanupButtonVisual(this.scene,octagonal?new Vector3(x-6,0,z-1.5):new Vector3(x+5.6,0,z+4)),
      {min,max,contains}));
    this.box('teal', x, 5.45, z, size, 0.3, size, true,0,false,0,octagonal);
    for (let n = -6; n <= 6; n += 2) {
      this.box('grout', x + n, 0.003, z, 0.026, 0.006, span(n));
      this.box('grout', x, 0.003, z + n, span(n), 0.006, 0.026);
    }
    for (const n of [-5, 0, 5]) {
      this.box('navy', x, 5.16, z + n, span(n), 0.32, 0.45);
      this.box('white', x, 4.96, z + n, 4.6, 0.12, 0.32);
      for (const t of [-6, 6]) this.box(room.accent, x + t, 4.98, z + n, 1.65, 0.18, 0.48);
    }
    const sides=octagonal?8:4;
    for(let i=0;i<sides;i++) {
      const yaw=i*2*Math.PI/sides, dx=Math.sin(yaw),dz=Math.cos(yaw);
      const open=neighbors.some(([nx,nz])=>nx===cx+Math.round(dx) && nz===cz+Math.round(dz));
      this.buildRoomFace(x+dx*halfRoom,z+dz*halfRoom,yaw,octagonal?halfRoom*Math.tan(Math.PI/8):halfRoom,open,room.accent);
    }
    // A pixel room number on the north wall remains visible above crates and doors.
    const digits = ['010110010010111','111001111100111','111001111001111',
      '101101111001001','111100111001111','111100111101111','111001010010010'];
    this.box('navy', x, 4.12, z + halfRoom - 0.24, 1.38, 1.58, 0.16);
    for (const [i, bit] of Array.from(digits[number - 1]).entries()) {
      if (bit === '1') this.box(room.accent, x + ((i % 3) - 1) * 0.22,
        4.12 + (2 - Math.floor(i / 3)) * 0.22, z + halfRoom - 0.36, 0.225, 0.225, 0.1);
    }
    this.mergeTrim();
  }

  private buildRoomFace(x: number, z: number, yaw:number, halfFace:number,
    open: boolean, accent: Paint): void {
    // t runs across the wall, inset points toward the interior on all four sides.
    const panel = (paint: Paint, t: number, y: number, inset: number,
      w: number, h: number, d: number, solid = false) =>
      this.box(paint,x+Math.cos(yaw)*t-Math.sin(yaw)*inset,y,z-Math.sin(yaw)*t-Math.cos(yaw)*inset,
        w,h,d,solid,0,false,yaw);

    const wing = open ? halfFace - doorWidth / 2 : halfFace;
    for (const side of [-1, 1]) {
      const t = side * (halfFace - wing / 2);
      panel('mint', t, 2.7, 0, wing, 5.4, 0.4, true);
      panel('teal', t, 0.63, 0.22, wing, 1.26, 0.12);
      panel('white', t, 1.28, 0.25, wing, 0.12, 0.12);
      panel('teal', side * (0.85*halfFace), 2.6, 0.23, 0.52, 5.2, 0.38);
      panel('navy', side * (0.85*halfFace), 0.44, 0.28, 0.75, 0.88, 0.44);
      if(open && wing<2.5) continue;
      const vent=side*halfFace*(4.45/8);
      panel('white', vent, 2.95, 0.2, 2.28, 1.45, 0.19);
      for (const rib of [-0.68, -0.23, 0.23, 0.68])
        panel('teal', vent + rib, 2.95, 0.33, 0.25, 1.04, 0.11);
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
    let dx=a.cell[0]-b.cell[0],dz=a.cell[1]-b.cell[1];
    if(dz<0 || (!dz && dx<0)) { dx=-dx; dz=-dz; }
    const yaw=Math.atan2(dx,dz),sin=Math.sin(yaw),cos=Math.cos(yaw);
    const x = (a.cell[0] + b.cell[0]) * cellSpacing / 2;
    const z = (a.cell[1] + b.cell[1]) * cellSpacing / 2;
    const length = cellSpacing*Math.hypot(dx,dz) - 2 * halfRoom;
    const section = (color: Paint, across: number, y: number, along: number,
      w: number, h: number, d: number, solid = false) =>
      this.box(color,x+sin*along+cos*across,y,z+cos*along-sin*across,w,h,d,solid,0,color==='floor',yaw);

    section('floor', 0, -0.2, 0, doorWidth, 0.4, length, true);
    section('teal', 0, doorHeight + 0.15, 0, doorWidth + 0.6, 0.3, length, true);
    for (const side of [-1, 1]) {
      section('navy', side * (doorWidth / 2 + 0.15), doorHeight / 2, 0, 0.3, doorHeight, length, true);
      section('mint', side * (doorWidth / 2 - 0.02), 1.12, 0, 0.05, 0.11, length);
      const end = side * length / 2;
      if (!this.level.singleTunnelDoor || side===-1)
        this.slidingDoors.push(this.makeDoor(new Vector3(x+sin*end,0,z+cos*end),yaw));
    }
    for (const along of [-1.4, 0, 1.4]) section('white', 0, doorHeight - 0.06, along, 1.65, 0.12, 0.22);
    this.mergeTrim();
  }

  private spawnZombie(obstacleBreaker: { break(cell: VoxelWorldBounds, direction: Vector3, impact: Impact): boolean }): Enemy {
    const zombie=new VoxelZombie(this.scene,this.zombieSpawnPosition(),this.grid,this.debris,
      obstacleBreaker,this.crowd,this.coreTarget,
      position=>this.coins.push(new CoinPickup(this.scene,position.add(new Vector3(0,coinConfig.spawnHeight,0)))),
      this.level.enemyTargetMode==='coreOnly' ? undefined : (position,player)=>this.targetContext(position,player),
      this.level.enemyPathfinding,this.level.enemyTargetRefreshSeconds,this.pathBuilds,this.stats?.meshes);
    this.enemies.push(zombie); this.targets.push(zombie.target); this.enemyTargets.add(zombie.target);
    for (const mesh of zombie.target.model.getIntactMeshes()) this.enemyMeshOwners.set(mesh,zombie.target);
    return zombie;
  }

  private zombieSpawnPosition(): Vector3 {
    const [roomX,roomZ]=this.spawnRooms[this.spawnCursor].cell;
    this.spawnCursor=(this.spawnCursor+1)%this.spawnRooms.length;
    const centerX=roomX*cellSpacing, centerZ=roomZ*cellSpacing;
    const extent=halfRoom-this.grid.radius-0.5;
    const minDistance=(zombieConfig.personalSpaceRadius*2+0.3)**2;
    const available=(position:Vector3): boolean =>
      (this.level.roomShape!=='octagon' || Math.abs(position.x-centerX)+Math.abs(position.z-centerZ)<extent*Math.SQRT2) &&
      this.grid.passable(position,position) &&
      this.enemies.every(enemy=>enemy.state==='dead' ||
        Vector3.DistanceSquared(position,enemy.position)>=minDistance) &&
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

  private makeDoor(position:Vector3,yaw:number): SlidingDoor {
    return new SlidingDoor(this.scene,this.debris,position,yaw,doorWidth,
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
    for (const mesh of target.model.getIntactMeshes()) {
      mesh.checkCollisions=mesh.isPickable=true;
      this.stats?.meshes.tag(mesh,'environment');
    }
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
      this.stats?.meshes.tag(mesh,'environment');
    }
  }
}
