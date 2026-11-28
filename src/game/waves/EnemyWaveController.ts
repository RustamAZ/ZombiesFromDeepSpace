import type { Enemy } from '../entities/enemies/Enemy';
import { maxAliveEnemiesOnMap, type WaveDefinition } from './config';

export type WavePhase='preparation'|'spawning'|'clearing'|'objectives'|'intermission'|'complete';
export type WaveStatus={phase:WavePhase;wave:number;queued:number;alive:number;remaining:number;secondsRemaining:number;endless:boolean};
export interface WaveProgression {
  ready():boolean;
  completed(wave:number):void;
  started(wave:number):void;
}

export class EnemyWaveController {
  private phaseValue:WavePhase='preparation';
  private waveIndex=0;
  private queued=0;
  private spawnIn=0;
  private batchRemaining=0;
  private phaseIn=0;
  private readonly tracked=new Set<Enemy>();
  private livingCount=0;
  constructor(private readonly waves:readonly WaveDefinition[],private readonly spawn:()=>Enemy,
    private readonly progression:WaveProgression,private readonly onEnemyDefeated?:()=>void,
    private readonly finishAfterLastWave=false) {
    if (!waves.length) throw new Error('A level must define at least one wave');
    this.phaseIn=this.current.preparationSeconds;
  }
  get canPurchase():boolean { return ['preparation','objectives','intermission'].includes(this.phaseValue); }
  get status():WaveStatus { return {phase:this.phaseValue,wave:this.waveIndex+1,queued:this.queued,
    alive:this.livingCount,remaining:this.queued+this.tracked.size,secondsRemaining:Math.max(0,this.phaseIn),endless:!!this.current.endless}; }
  update(dt:number):void {
    this.livingCount=0;
    for (const enemy of this.tracked) {
      if (enemy.deathComplete) { this.tracked.delete(enemy); this.onEnemyDefeated?.(); }
      else if (enemy.state!=='dead') ++this.livingCount;
    }
    if (this.phaseValue==='objectives') {
      if (this.progression.ready()) { this.phaseValue='intermission'; this.phaseIn=this.current.intermissionSeconds; }
      return;
    }
    if (this.phaseValue==='preparation' || this.phaseValue==='intermission') {
      if (this.phaseValue==='intermission' && !this.progression.ready()) { this.phaseValue='objectives'; return; }
      this.phaseIn-=dt;
      if (this.phaseIn<=0) {
        this.phaseValue='spawning'; this.queued=this.current.enemyCount; this.spawnIn=0;
        this.progression.started(this.waveIndex+1);
      }
      return;
    }
    if (this.phaseValue==='spawning') {
      this.spawnIn-=dt;
      const wave=this.current;
      const batch=Math.min(wave.spawnBatchSize,wave.endless ? wave.spawnBatchSize : this.queued,wave.maxAlive);
      const freeSlots=Math.max(0,maxAliveEnemiesOnMap-this.livingCount);
      if (!this.batchRemaining && this.spawnIn<=0 && freeSlots>0 && batch>0 && this.tracked.size+batch<=wave.maxAlive) {
        this.batchRemaining=batch;
        this.spawnIn=wave.spawnIntervalSeconds;
      }
      const count=Math.min(this.batchRemaining,wave.maxSpawnsPerFrame ?? this.batchRemaining,freeSlots);
      for (let i=0;i<count;++i) {
        this.tracked.add(this.spawn());
        ++this.livingCount;
        --this.batchRemaining;
        if (!wave.endless) --this.queued;
      }
      if (!wave.endless && !this.queued) this.phaseValue='clearing';
    }
    if (this.phaseValue==='clearing' && !this.tracked.size) {
      this.progression.completed(this.waveIndex+1);
      if (this.finishAfterLastWave && this.waveIndex===this.waves.length-1) {
        this.phaseValue='complete';
        return;
      }
      ++this.waveIndex;
      this.phaseValue='objectives'; this.phaseIn=0;
    }
  }
  private get current():WaveDefinition { return this.waves[Math.min(this.waveIndex,this.waves.length-1)]; }
}
