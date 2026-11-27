import { inputConfig } from './config';

const config=inputConfig.lookSensitivity;
export type InputMode=keyof typeof config.defaultPercent;
const storageKey=(mode:InputMode)=>`kubotseh-look-v2-${mode}`;
const legacyStorageKey=(mode:InputMode)=>`kubotseh-look-${mode}`;

function normalize(mode:InputMode,value:number):number {
  const range=config.ranges[mode];
  const clamped=Math.min(range.max,Math.max(range.min,value));
  return Math.round(clamped/range.step)*range.step;
}

function loadPercent(mode:InputMode):number {
  try {
    const range=config.ranges[mode];
    const raw=localStorage.getItem(storageKey(mode));
    const value=Number(raw);
    if (raw!==null && Number.isFinite(value) && value>=range.min && value<=range.max) return value;
    const legacyRaw=localStorage.getItem(legacyStorageKey(mode));
    const legacyValue=Number(legacyRaw);
    if (legacyRaw!==null && Number.isFinite(legacyValue)) {
      const migrated=normalize(mode,legacyValue/config.legacyPercentAtMaximum[mode]*100);
      localStorage.setItem(storageKey(mode),String(migrated));
      return migrated;
    }
  } catch { /* Local storage is optional. */ }
  return config.defaultPercent[mode];
}

export class LookSensitivity {
  private readonly values={desktop:loadPercent('desktop'),mobile:loadPercent('mobile')};

  percent(mode:InputMode):number { return this.values[mode]; }
  scale(mode:InputMode):number { return config.baseScale[mode]*this.values[mode]/100; }
  setPercent(mode:InputMode,value:number):void {
    if (!Number.isFinite(value)) return;
    this.values[mode]=normalize(mode,value);
    try { localStorage.setItem(storageKey(mode),String(this.values[mode])); }
    catch { /* Keep the session setting when storage is unavailable. */ }
  }
}
