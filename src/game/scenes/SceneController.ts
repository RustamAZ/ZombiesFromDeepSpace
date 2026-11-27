import { LevelSession } from '../levels/LevelSession';
import { levels } from '../levels/LevelRegistry';
import type { LevelId } from '../levels/LevelDefinition';
import { LocalProfileRepository } from '../profile/ProfileRepository';
import { levelTexts } from '../ui/levelTexts';
import { texts } from '../ui/texts';
import { GameAudio } from '../audio/GameAudio';

export class SceneController {
  private readonly menu = document.querySelector<HTMLElement>('#main-menu')!;
  private readonly workshop = document.querySelector<HTMLElement>('#workshop')!;
  private readonly canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
  private readonly startButton = document.querySelector<HTMLButtonElement>('#start-game')!;
  private readonly menuStatus = document.querySelector<HTMLElement>('#menu-status')!;
  private readonly status = document.querySelector<HTMLElement>('#status')!;
  private readonly events = new AbortController();
  private readonly audio = new GameAudio();
  private state: 'menu' | 'loading' | 'workshop' = 'menu';
  private game?: LevelSession;
  private readonly repository=new LocalProfileRepository();
  private readonly profile=this.repository.load();
  private readonly tutorialButton=document.querySelector<HTMLButtonElement>('#start-tutorial')!;
  private readonly firstLevelButton=document.querySelector<HTMLButtonElement>('#start-first-level')!;

  constructor() {
    document.title=texts.documentTitle;
    document.querySelector<HTMLElement>('#game-title')!.textContent=texts.gameTitle;
    document.querySelector<HTMLElement>('#hud-title')!.textContent=texts.gameTitle;
    document.querySelector<HTMLElement>('#hud-room')!.textContent=texts.roomTitle;
    this.workshop.setAttribute('aria-label',texts.gameSceneLabel);
    this.canvas.setAttribute('aria-label',texts.canvasLabel);
    document.querySelector<HTMLButtonElement>('#play-button')!.textContent=texts.continue;
    this.showMenu();
    this.bindButton(this.startButton, touch => this.start(touch));
    this.bindButton(this.tutorialButton,touch=>this.start(touch,'tutorial'));
    this.bindButton(this.firstLevelButton,touch=>this.start(touch,'firstLevel'));
    window.addEventListener('pagehide',()=>this.repository.save(this.profile),{signal:this.events.signal});
    this.bindButton(document.querySelector<HTMLButtonElement>('#play-button')!, async touch => {
      if (this.state !== 'workshop') return;
      try {
        this.audio.unlock();
        await this.game?.play(touch);
        this.status.textContent = '';
      } catch {
        this.status.textContent = texts.pointerLockError;
      }
    });
  }

  private bindButton(button: HTMLButtonElement, action: (touch: boolean) => Promise<void>): void {
    let touch = false;
    const opts = { signal: this.events.signal };
    button.addEventListener('pointerdown', e => { touch = e.pointerType === 'touch'; }, opts);
    button.addEventListener('click', () => { void action(touch); touch = false; }, opts);
  }

  private showMenu(): void {
    this.state = 'menu';
    this.menu.hidden = false;
    this.workshop.hidden = true;
    this.startButton.disabled = false;
    this.startButton.textContent = texts.start;
    this.tutorialButton.textContent=levelTexts.tutorial;
    this.firstLevelButton.textContent=this.profile.tutorialCompleted?levelTexts.firstLevel:levelTexts.locked;
    this.tutorialButton.disabled=false;
    this.firstLevelButton.disabled=!this.profile.tutorialCompleted;
    this.menuStatus.textContent = this.status.textContent = '';
  }

  private async start(touch: boolean, requested?:LevelId): Promise<void> {
    if (this.state !== 'menu') return;
    const id=requested ?? (this.profile.tutorialCompleted?'firstLevel':'tutorial');
    if (id==='firstLevel' && !this.profile.tutorialCompleted) return;
    this.audio.unlock();
    this.state = 'loading';
    this.startButton.disabled = true;
    this.tutorialButton.disabled=this.firstLevelButton.disabled=true;
    this.startButton.textContent = texts.loading;
    this.workshop.hidden = false;
    try {
      const lock = !touch && this.canvas.requestPointerLock
        ? Promise.resolve(this.canvas.requestPointerLock()).catch(() => {}) : Promise.resolve();
      if (this.events.signal.aborted) return;
      const game = await LevelSession.create(this.canvas,this.audio,levels[id],this.profile,completed=>{
        this.backToMenu();
        void this.start(touch,completed?'firstLevel':id);
      },()=>this.backToMenu());
      if (this.events.signal.aborted) { game.dispose(); return; }
      this.game = game;
      document.querySelector<HTMLElement>('#hud-room')!.textContent=id==='tutorial'?levelTexts.tutorial:levelTexts.firstLevel;
      await lock;
      if (this.events.signal.aborted) return;
      this.menu.hidden = true;
      this.state = 'workshop';
      if (touch || document.pointerLockElement === this.canvas) await game.play(touch);
      game.start();
    } catch (error) {
      if (this.events.signal.aborted) return;
      console.error(error);
      this.game?.dispose();
      this.game = undefined;
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      this.showMenu();
      this.menuStatus.textContent = texts.loadError;
    }
  }

  private backToMenu():void {
    this.game?.dispose(); this.game=undefined;
    if (document.pointerLockElement===this.canvas) document.exitPointerLock();
    document.body.classList.remove('playing','touch-playing');
    this.repository.save(this.profile);
    this.showMenu();
  }

  dispose(): void {
    this.events.abort();
    this.game?.dispose();
    this.repository.save(this.profile);
    this.audio.dispose();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    document.body.classList.remove('playing','touch-playing');
  }
}
