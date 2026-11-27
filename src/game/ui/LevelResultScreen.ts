import { texts } from './texts';
import { levelTexts } from './levelTexts';

export class LevelResultScreen {
  private readonly root=document.createElement('div');
  constructor(completed:boolean,proceed:()=>void,menu:()=>void) {
    this.root.className='defeat-screen';
    this.root.setAttribute('role','dialog');
    this.root.setAttribute('aria-modal','true');
    const title=document.createElement('h2');
    title.textContent=completed?levelTexts.complete:texts.defeat;
    const description=document.createElement('p');
    description.textContent=completed?levelTexts.completeBody:'';
    const primary=document.createElement('button');
    primary.textContent=completed?levelTexts.playMain:texts.restart;
    primary.addEventListener('click',proceed);
    const back=document.createElement('button'); back.textContent=levelTexts.menu;
    back.addEventListener('click',menu);
    this.root.append(title,description,primary,back);
    document.querySelector('#workshop')!.append(this.root);
    primary.focus();
  }
  dispose():void { this.root.remove(); }
}
