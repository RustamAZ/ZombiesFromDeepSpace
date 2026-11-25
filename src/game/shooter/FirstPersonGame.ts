import { Color3, Color4, DirectionalLight, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import HavokPhysics from '@babylonjs/havok';
import { PlayerCharacter } from '../entities/player/PlayerCharacter';
import { CubeBlaster } from '../entities/weapons/cubeBlaster/CubeBlaster';
import { CubeBlasterView } from '../entities/weapons/cubeBlaster/CubeBlasterView';
import { ProjectileSystem } from './ProjectileSystem';
import { ProjectileSpawner } from './ProjectileSpawner';
import { Workshop } from './Workshop';

export class FirstPersonGame {
  private readonly keys = new Set<string>();
  private readonly events = new AbortController();
  private pressed = false;
  private touchPlaying = false;
  private touchAxis = { x: 0, z: 0 };
  private time = 0;

  static async create(canvas: HTMLCanvasElement): Promise<FirstPersonGame> {
    const physics = await HavokPhysics();
    const engine = new Engine(canvas, true, { stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.28, 0.54, 0.55, 1);
    scene.enablePhysics(new Vector3(0, -12, 0), new HavokPlugin(true, physics));
    scene.collisionsEnabled = true;
    const sky = new HemisphericLight('skylight', new Vector3(-0.1, 1, -0.2), scene);
    sky.intensity = 0.95;
    sky.groundColor = new Color3(0.36, 0.43, 0.45);
    const sun = new DirectionalLight('workshop-light', new Vector3(0.52, -0.85, 0.48), scene);
    sun.intensity = 0.65;
    const game = new FirstPersonGame(canvas, engine, scene);
    await scene.whenReadyAsync();
    return game;
  }

  private readonly player: PlayerCharacter;
  private readonly workshop: Workshop;
  private readonly projectiles: ProjectileSystem;
  private readonly view: CubeBlasterView;

  private constructor(private readonly canvas: HTMLCanvasElement, private readonly engine: Engine,
    private readonly scene: Scene) {
    this.player = new PlayerCharacter(scene, new Vector3(0, 0.01, -6.3));
    scene.activeCamera = this.player.camera;
    this.workshop = new Workshop(scene);
    this.projectiles = new ProjectileSystem(scene, (...hit) => this.workshop.hit(...hit));
    this.view = new CubeBlasterView(scene, this.player.camera);
    this.player.slot.equip(new CubeBlaster(new ProjectileSpawner(this.view.muzzle, this.projectiles)));
    const opts = { signal: this.events.signal };
    window.addEventListener('keydown', e => {
      if (!this.playing) return;
      if (e.code==='F3') { e.preventDefault(); if (!e.repeat) this.workshop.toggleNavigationDebug(); return; }
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
    }, opts);
    window.addEventListener('keyup', e => this.keys.delete(e.code), opts);
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === canvas) this.player.look(e.movementX, e.movementY);
    }, opts);
    canvas.addEventListener('mousedown', e => { if (this.playing && e.button === 0) this.pressed = true; }, opts);
    window.addEventListener('mouseup', () => { this.pressed = false; }, opts);
    document.addEventListener('pointerlockchange', () => this.syncInput(), opts);
    window.addEventListener('blur', () => {
      this.touchPlaying = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      this.syncInput();
    }, opts);
    window.addEventListener('resize', () => engine.resize(), opts);
    this.bindTouch(opts);
    this.view.update(0, engine.getAspectRatio(this.player.camera));
  }

  private get playing(): boolean {
    return this.touchPlaying || document.pointerLockElement === this.canvas;
  }

  async play(touch: boolean): Promise<void> {
    this.touchPlaying = touch;
    if (!touch && document.pointerLockElement !== this.canvas) {
      await this.canvas.requestPointerLock();
    }
    this.syncInput();
  }

  private syncInput(): void {
    this.pressed = false;
    this.keys.clear();
    this.touchAxis = { x: 0, z: 0 };
    document.body.classList.toggle('playing', this.playing);
    document.body.classList.toggle('touch-playing', this.touchPlaying);
  }

  private bindTouch(opts: AddEventListenerOptions): void {
    type TouchPoint = { id: number; x: number; y: number };
    let move: TouchPoint | null = null;
    let look: TouchPoint | null = null;
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.touchPlaying) return;
      this.canvas.setPointerCapture(e.pointerId);
      const point = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (e.clientX < innerWidth / 2) move = point;
      else look = point;
    }, opts);
    this.canvas.addEventListener('pointermove', e => {
      if (!this.touchPlaying) return;
      if (move?.id === e.pointerId) {
        this.touchAxis.x = Math.max(-1, Math.min(1, (e.clientX - move.x) / 45));
        this.touchAxis.z = Math.max(-1, Math.min(1, (move.y - e.clientY) / 45));
      }
      if (look?.id === e.pointerId) {
        this.player.look((e.clientX - look.x) * 2, (e.clientY - look.y) * 2);
        look.x = e.clientX;
        look.y = e.clientY;
      }
    }, opts);
    this.canvas.addEventListener('lostpointercapture', e => {
      if (move?.id === e.pointerId) { move = null; this.touchAxis = { x: 0, z: 0 }; }
      if (look?.id === e.pointerId) look = null;
    }, opts);
    const fire = document.querySelector<HTMLButtonElement>('#touch-fire')!;
    fire.addEventListener('pointerdown', e => { fire.setPointerCapture(e.pointerId); this.pressed = true; }, opts);
    fire.addEventListener('lostpointercapture', () => { this.pressed = false; }, opts);
    document.querySelector('#pause')!.addEventListener('click', () => {
      this.touchPlaying = false;
      this.syncInput();
    }, opts);
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
      this.view.update(dt, this.engine.getAspectRatio(this.player.camera));
      if (this.playing) {
        this.time += dt;
        const down = (a: string, b: string) => Number(this.keys.has(a) || this.keys.has(b));
        this.player.move(down('KeyD','ArrowRight') - down('KeyA','ArrowLeft') + this.touchAxis.x,
          down('KeyW','ArrowUp') - down('KeyS','ArrowDown') + this.touchAxis.z, dt);
        this.projectiles.update(dt);
        if (this.pressed && this.player.fire(this.time)) this.view.fired();
        this.workshop.updateEnemies(dt,this.player);
      }
      this.scene.render();
    });
  }

  dispose(): void {
    this.events.abort();
    this.engine.dispose();
  }
}
