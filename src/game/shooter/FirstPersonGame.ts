import { Color3, Color4, DirectionalLight, Engine, HemisphericLight, Ray, Scene, Vector3 } from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import HavokPhysics from '@babylonjs/havok';
import { PlayerCharacter } from '../entities/player/PlayerCharacter';
import { CubeBlaster } from '../entities/weapons/cubeBlaster/CubeBlaster';
import { CubeBlasterView } from '../entities/weapons/cubeBlaster/CubeBlasterView';
import { ProjectileSystem } from './ProjectileSystem';
import { ProjectileSpawner } from './ProjectileSpawner';
import { Workshop } from './Workshop';
import { PlayerProfile } from '../profile/PlayerProfile';
import { LocalProfileRepository } from '../profile/ProfileRepository';
import { RunHud } from '../ui/RunHud';
import { LevelResultScreen } from '../ui/LevelResultScreen';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { WorldLabelsOverlay } from '../ui/WorldLabelsOverlay';
import { SettingsScreen } from '../ui/SettingsScreen';
import type { GameAudio } from '../audio/GameAudio';
import { texts } from '../ui/texts';
import { InputController } from '../input/InputController';
import { renderingConfig } from './renderingConfig';
import { NavigationFrameStats, type NavigationFrame } from '../navigation/NavigationFrameStats';

export class FirstPersonGame {
  private readonly events = new AbortController();
  private touchPlaying = false;
  private pausedFromTouch = false;
  private time = 0;

  static async create(canvas: HTMLCanvasElement, audio: GameAudio, level:LevelDefinition,
    profile:PlayerProfile,onResult:(completed:boolean)=>void,onMenu:()=>void): Promise<FirstPersonGame> {
    const physics = await HavokPhysics();
    const engine = new Engine(canvas, true, { stencil: true });
    engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,renderingConfig.maxDevicePixelRatio));
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.28, 0.54, 0.55, 1);
    scene.enablePhysics(new Vector3(0, -12, 0), new HavokPlugin(true, physics));
    scene.collisionsEnabled = true;
    const sky = new HemisphericLight('skylight', new Vector3(-0.1, 1, -0.2), scene);
    sky.intensity = 0.95;
    sky.groundColor = new Color3(0.36, 0.43, 0.45);
    const sun = new DirectionalLight('workshop-light', new Vector3(0.52, -0.85, 0.48), scene);
    sun.intensity = 0.65;
    try {
      const game = new FirstPersonGame(canvas, engine, scene, audio,level,profile,onResult,onMenu);
      await scene.whenReadyAsync();
      return game;
    } catch(error) { engine.dispose(); throw error; }
  }

  private readonly player: PlayerCharacter;
  private readonly workshop: Workshop;
  private readonly navStats?:NavigationFrameStats;
  private readonly sceneStats?:SceneInstrumentation;
  private readonly projectiles: ProjectileSystem;
  private readonly view: CubeBlasterView;
  private readonly hud: RunHud;
  private readonly worldLabels: WorldLabelsOverlay;
  private readonly settings: SettingsScreen;
  private readonly input:InputController;
  private defeat?: LevelResultScreen;

  private constructor(private readonly canvas: HTMLCanvasElement, private readonly engine: Engine,
    private readonly scene: Scene, private readonly audio: GameAudio, readonly level:LevelDefinition,
    private readonly profile:PlayerProfile,private readonly onResult:(completed:boolean)=>void,
    private readonly onMenu:()=>void) {
    this.player = new PlayerCharacter(scene, new Vector3(...level.playerSpawn));
    scene.activeCamera = this.player.camera;
    this.projectiles = new ProjectileSystem(scene, {
      directHit:(contact,impact)=>this.workshop.hit(contact,impact),
      worldHit:(contact,impact)=>this.workshop.hit(contact,impact,false),
      targetsInBlast:(contact,radius)=>{
        const stats=this.navStats?.currentShots, start=stats ? performance.now() : 0;
        const targets=this.workshop.targetsInBlast(contact,radius);
        if (stats) { stats.blastQueryMs+=performance.now()-start; stats.blastTargets+=targets.length; }
        return targets;
      }
    },()=>this.audio.play('impact'),level.performanceHud ? ()=>this.navStats?.currentShots : undefined);
    if(level.performanceHud) {
      this.navStats=new NavigationFrameStats(scene);
      this.sceneStats=new SceneInstrumentation(scene);
      this.sceneStats.captureActiveMeshesEvaluationTime=true;
      scene.onBeforePhysicsObservable.add(this.navStats.beginPhysics);
      scene.onAfterPhysicsObservable.add(this.navStats.endPhysics);
    }
    this.workshop = new Workshop(scene,this.projectiles,this.profile,level,()=>this.lose(),sound=>this.audio.play(sound),this.navStats);
    this.hud=new RunHud();
    this.worldLabels=new WorldLabelsOverlay(scene,this.workshop);
    this.input=new InputController(canvas);
    this.settings=new SettingsScreen(audio,this.input.sensitivity,()=>{
      audio.unlock();
      void this.play(this.pausedFromTouch).catch(()=>{
        document.querySelector<HTMLElement>('#status')!.textContent=texts.pointerLockError;
      });
    },onMenu);
    this.view = new CubeBlasterView(scene, this.player.camera);
    this.player.slot.equip(new CubeBlaster(new ProjectileSpawner(this.view.muzzle, this.projectiles, this.player)));
    const opts = { signal: this.events.signal };
    if(this.navStats)document.addEventListener('visibilitychange',()=>this.navStats?.reset(),opts);
    document.addEventListener('pointerlockchange', () => {
      const wasPlaying=document.body.classList.contains('playing');
      this.syncInput();
      if (wasPlaying && !this.playing && !this.defeat && document.hasFocus()) this.settings.open();
    }, opts);
    window.addEventListener('blur', () => {
      this.touchPlaying = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.syncInput();
    }, opts);
    window.addEventListener('resize', () => this.resizeRenderer(), opts);
    this.view.update(0, engine.getAspectRatio(this.player.camera));
  }

  private resizeRenderer():void {
    const pixelRatio=Math.min(window.devicePixelRatio||1,renderingConfig.maxDevicePixelRatio);
    this.engine.setHardwareScalingLevel(1/pixelRatio);
    this.engine.resize();
  }

  private get playing(): boolean {
    return !this.defeat && (this.touchPlaying || document.pointerLockElement === this.canvas);
  }

  async play(touch: boolean): Promise<void> {
    if (this.defeat) return;
    this.audio.unlock();
    this.pausedFromTouch=touch;
    this.touchPlaying = touch;
    this.input.setMode(touch?'mobile':'desktop');
    if (!touch && document.pointerLockElement !== this.canvas) {
      await this.canvas.requestPointerLock();
    }
    this.syncInput();
    this.settings.close();
    document.querySelector<HTMLElement>('#status')!.textContent='';
  }

  private syncInput(): void {
    this.navStats?.reset();
    this.input.reset();
    this.input.setPlaying(this.playing);
    document.body.classList.toggle('playing', this.playing);
    document.body.classList.toggle('touch-playing', this.touchPlaying);
  }

  private openSettings():void {
    if (this.defeat || this.settings.isOpen) return;
    this.pausedFromTouch=this.touchPlaying;
    this.touchPlaying=false;
    if (document.pointerLockElement===this.canvas) document.exitPointerLock();
    this.syncInput();
    this.settings.open();
  }

  start(): void {
    const logPeaks=new URLSearchParams(location.search).get('perf')==='1';
    let lastLog=-Infinity;
    let lastLoggedSample:NavigationFrame|undefined;
    this.engine.runRenderLoop(() => {
      const stats=this.playing && !document.hidden ? this.navStats : undefined;
      if(stats) {
        const now=performance.now(),report=stats.beginFrame(now);
        if(report) {
          this.hud.showNavigationFrame(report);
          if(logPeaks && report.worst!==lastLoggedSample && now-lastLog>=1000) {
            console.info('[perf] worst frame (5s)',report);
            lastLog=now;
            lastLoggedSample=report.worst;
          }
          stats.mark('ui');
        }
      }
      const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
      this.view.update(dt, this.engine.getAspectRatio(this.player.camera));
      if (this.playing) {
        this.time += dt;
        const look=this.input.consumeLook();
        if (look.x || look.y) this.player.look(look.x,look.y);
        if (this.input.consume('pause')) { this.openSettings(); this.scene.render(); return; }
        if (this.input.consume('debug')) this.workshop.toggleNavigationDebug();
        if (this.input.consume('interact')) this.workshop.tryInteract(this.player.feet,this.getAimRay());
        if (this.input.consume('purchase')) this.workshop.tryPurchase(this.player.feet,this.getAimRay());
        if (this.input.consume('alternate')) this.workshop.tryAlternate(this.player.feet,this.getAimRay());
        this.player.move(this.input.moveX,this.input.moveZ,dt,
          this.workshop.enemyBlockers(this.player.feet));
        stats?.mark('player');
        this.projectiles.update(dt);
        this.view.setVisible(!this.workshop.carry.item);
        if (!this.workshop.carry.item && this.input.firing && this.player.fire(this.time)) { this.view.fired(); this.audio.play('shot'); }
        const playerHealth=this.player.health;
        stats?.mark('projectiles');
        this.workshop.updateEnemies(dt,this.player,this.time,stats);
        if (this.player.health<playerHealth) this.audio.play('hurt');
        this.hud.update(this.player,this.workshop.core,this.profile,this.workshop.runProfile,this.workshop.waves,this.workshop.scenario);
        if (this.player.isDead) this.lose();
      }
      const action=this.workshop.updateBuilding(this.playing ? dt : 0,this.player.feet,this.getAimRay());
      this.hud.showDropHint(this.playing && this.input.mode==='desktop' && action.r==='drop');
      if (this.input.mode==='mobile' && this.playing) {
        const priced=(label:string|undefined,cost?:number,coins=this.workshop.runProfile.coins):string|undefined=>
          !label || cost===undefined ? label :
            `${label} · ${cost} ${texts.coinsShort}${coins<cost ? ` (${texts.notEnough})` : ''}`;
        const interact=action.e ? priced(texts.interactE[action.e],action.buyCost,this.workshop.optionalPurchaseCoins) :
          action.shopBlock ? texts.shopBlock[action.shopBlock] : undefined;
        this.input.setMobileActions(interact,action.q && priced(texts.interactQ[action.q],action.cost),
          action.r && priced(texts.interactR[action.r],action.upgradeCost,this.workshop.optionalPurchaseCoins),!!action.shopBlock);
      } else this.input.setMobileActions();
      this.worldLabels.update(this.player.feet,action);
      stats?.mark('ui');
      this.scene.render();
      stats?.mark('scene');
      if(stats && this.sceneStats) {
        stats.recordRender(this.sceneStats.activeMeshesEvaluationTimeCounter.current,
          this.scene.getActiveMeshes().length,this.sceneStats.drawCallsCounter.current);
      }
    });
  }

  dispose(): void {
    this.events.abort();
    this.input.dispose();
    this.engine.stopRenderLoop();
    new LocalProfileRepository().save(this.profile);
    this.hud.dispose(); this.worldLabels.dispose(); this.settings.dispose(); this.defeat?.dispose();
    this.sceneStats?.dispose();
    this.engine.dispose();
  }

  private lose(): void {
    if (this.defeat) return;
    this.settings.close();
    this.audio.play('lose');
    const completed=this.workshop.scenario.defeatCompletesLevel;
    if (completed) {
      this.profile.completeTutorial();
      new LocalProfileRepository().save(this.profile);
    }
    this.defeat=new LevelResultScreen(completed,()=>this.onResult(completed),this.onMenu);
    this.touchPlaying=false; this.syncInput();
    if (document.pointerLockElement===this.canvas) document.exitPointerLock();
  }

  private getAimRay(): Ray {
    this.player.camera.getViewMatrix(true);
    return this.player.camera.getForwardRay(undefined,undefined,this.player.camera.globalPosition);
  }
}
