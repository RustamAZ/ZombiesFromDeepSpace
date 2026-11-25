import type { FirstPersonGame } from '../shooter/FirstPersonGame';

export class SceneController {
  private readonly menu = document.querySelector<HTMLElement>('#main-menu')!;
  private readonly workshop = document.querySelector<HTMLElement>('#workshop')!;
  private readonly canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
  private readonly startButton = document.querySelector<HTMLButtonElement>('#start-game')!;
  private readonly menuStatus = document.querySelector<HTMLElement>('#menu-status')!;
  private readonly status = document.querySelector<HTMLElement>('#status')!;
  private readonly events = new AbortController();
  private state: 'menu' | 'loading' | 'workshop' = 'menu';
  private game?: FirstPersonGame;

  constructor() {
    this.showMenu();
    this.bindButton(this.startButton, touch => this.start(touch));
    this.bindButton(document.querySelector<HTMLButtonElement>('#play-button')!, async touch => {
      if (this.state !== 'workshop') return;
      try {
        await this.game?.play(touch);
        this.status.textContent = '';
      } catch {
        this.status.textContent = 'Не удалось захватить мышь. Нажмите «Продолжить».';
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
    this.startButton.textContent = 'Начать играть';
    this.menuStatus.textContent = this.status.textContent = '';
  }

  private async start(touch: boolean): Promise<void> {
    if (this.state !== 'menu') return;
    this.state = 'loading';
    this.startButton.disabled = true;
    this.startButton.textContent = 'Загрузка…';
    this.workshop.hidden = false;
    try {
      // Request lock in the click gesture, before the module and WASM downloads.
      const lock = !touch && this.canvas.requestPointerLock
        ? Promise.resolve(this.canvas.requestPointerLock()).catch(() => {}) : Promise.resolve();
      const { FirstPersonGame } = await import('../shooter/FirstPersonGame');
      if (this.events.signal.aborted) return;
      const game = await FirstPersonGame.create(this.canvas);
      if (this.events.signal.aborted) { game.dispose(); return; }
      this.game = game;
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
      this.menuStatus.textContent = 'Не удалось загрузить игровую сцену. Попробуйте ещё раз.';
    }
  }

  dispose(): void {
    this.events.abort();
    this.game?.dispose();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    document.body.classList.remove('playing','touch-playing');
  }
}
