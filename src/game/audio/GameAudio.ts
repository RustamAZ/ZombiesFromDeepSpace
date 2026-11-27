import { audioConfig, type GameSound } from './config';

export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private readonly lastPlayed = new Map<GameSound,number>();
  private level = this.readVolume();

  get volume(): number { return this.level; }

  setVolume(value: number): void {
    this.level=Math.max(0,Math.min(1,value));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.level,this.context.currentTime,0.015);
    try { localStorage.setItem(audioConfig.storageKey,String(this.level)); } catch { /* Storage may be disabled. */ }
  }

  unlock(): void {
    if (typeof AudioContext==='undefined') return;
    if (!this.context) {
      try {
        this.context=new AudioContext();
        this.master=this.context.createGain();
        this.master.gain.value=this.level;
        this.master.connect(this.context.destination);
      } catch {
        this.context=undefined;
        this.master=undefined;
        return;
      }
    }
    if (this.context.state==='suspended') void this.context.resume().catch(()=>{});
  }

  play(sound: GameSound): void {
    if (this.level===0) return;
    this.unlock();
    const context=this.context, master=this.master;
    if (!context || !master) return;
    const preset=audioConfig.sounds[sound];
    const now=context.currentTime;
    if (now-(this.lastPlayed.get(sound) ?? -Infinity)<preset.cooldown) return;
    this.lastPlayed.set(sound,now);
    const oscillator=context.createOscillator();
    const envelope=context.createGain();
    oscillator.type=preset.wave;
    oscillator.frequency.setValueAtTime(preset.start,now);
    oscillator.frequency.exponentialRampToValueAtTime(preset.end,now+preset.duration);
    envelope.gain.setValueAtTime(0.001,now);
    envelope.gain.linearRampToValueAtTime(preset.gain,now+0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001,now+preset.duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(now);
    oscillator.stop(now+preset.duration+0.01);
    oscillator.onended=()=>{ oscillator.disconnect(); envelope.disconnect(); };
  }

  dispose(): void { if (this.context) void this.context.close(); }

  private readVolume(): number {
    try {
      const stored=localStorage.getItem(audioConfig.storageKey);
      if (stored!==null) {
        const value=Number(stored);
        if (Number.isFinite(value)) return Math.max(0,Math.min(1,value));
      }
    } catch { /* Storage may be disabled. */ }
    return audioConfig.defaultVolume;
  }
}
