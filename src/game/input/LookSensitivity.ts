import { inputConfig } from './config';

const config=inputConfig.lookSensitivity;
export type InputMode=keyof typeof config.defaultPercent;
const storageKey=(mode:InputMode)=>`kubotseh-look-${mode}`;

function loadPercent(mode:InputMode):number {
  try {
    const raw=localStorage.getItem(storageKey(mode));
    const value=Number(raw);
    if (raw!==null && Number.isFinite(value) && value>=config.min && value<=config.max) return value;
  } catch { /* Local storage is optional. */ }
  return config.defaultPercent[mode];
}

export class LookSensitivity {
  private readonly values={desktop:loadPercent('desktop'),mobile:loadPercent('mobile')};

  percent(mode:InputMode):number { return this.values[mode]; }
  scale(mode:InputMode):number { return config.baseScale[mode]*this.values[mode]/100; }
  setPercent(mode:InputMode,value:number):void {
    if (!Number.isFinite(value)) return;
    this.values[mode]=Math.min(config.max,Math.max(config.min,value));
    try { localStorage.setItem(storageKey(mode),String(this.values[mode])); }
    catch { /* Keep the session setting when storage is unavailable. */ }
  }
}
