import { texts } from './texts';

export class DefeatScreen {
  private readonly root: HTMLDivElement;
  constructor(restart: () => void) {
    this.root=document.createElement('div'); this.root.className='defeat-screen';
    const title=document.createElement('h2'); title.textContent=texts.defeat;
    const button=document.createElement('button'); button.textContent=texts.restart;
    button.addEventListener('click',restart);
    this.root.append(title,button); document.querySelector('#workshop')!.append(this.root);
  }
  dispose(): void { this.root.remove(); }
}
