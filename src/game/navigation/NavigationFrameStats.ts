import { ActiveMeshBreakdown, type MeshCounts } from './ActiveMeshBreakdown';
import type { Scene } from '@babylonjs/core';

const frameSections=()=>({
  player:0, projectiles:0, debrisAndCoins:0, enemies:0, wave:0, turrets:0, doors:0, defenseOther:0, ui:0, scene:0
});
type FrameSections=ReturnType<typeof frameSections>;
const enemySections=()=>({target:0,movement:0,wall:0,pose:0,death:0,visibility:0,animated:0,culled:0});
type EnemySections=ReturnType<typeof enemySections>;
const projectileSections=()=>({active:0,checks:0,hits:0,collisionMs:0,impactMs:0,effectsMs:0,blastQueryMs:0,blastTargets:0});
export type ProjectileFrameStats=ReturnType<typeof projectileSections>;
const waveWork=()=>({spawned:0,spawnMs:0,removed:0,removeMs:0});

export interface NavigationFrame {
  frameMs:number;
  pathCalls:number;
  pathMs:number;
  crowdMs:number;
  crowdCandidates:number;
  turretSightRays:number;
  sections:FrameSections;
  enemy:EnemySections;
  shots:ProjectileFrameStats;
  waveWork:ReturnType<typeof waveWork>;
  meshEvaluationMs:number;
  activeMeshes:number;
  drawCalls:number;
  meshCounts?:MeshCounts;
  physicsMs:number;
  gapMs:number;
  alive:number;
}

const windowMs=5000;
const reportIntervalMs=200;
export interface NavigationFrameReport {
  worst:NavigationFrame;
  p95Ms:number;
}

export class NavigationFrameStats {
  readonly meshes:ActiveMeshBreakdown;
  constructor(scene:Scene) { this.meshes=new ActiveMeshBreakdown(scene); }
  private bucketEnd=-1;
  private bucketPeak=-1;
  private samples:{end:number;sample:NavigationFrame}[]=[];
  private readonly durations:number[]=[];
  private start?:number;
  private calls=0;
  private ms=0;
  private crowdMs=0;
  private crowdCandidates=0;
  private turretSightRays=0;
  readonly recordTurretSightRay=():void=>{ if (this.start!==undefined) ++this.turretSightRays; };
  private nextReport=0;
  private sections=frameSections();
  private enemy=enemySections();
  private shots=projectileSections();
  private waveWork=waveWork();
  get currentWaveWork() {
    return this.start===undefined ? undefined : this.waveWork;
  }
  get currentShots():ProjectileFrameStats|undefined {
    return this.start===undefined ? undefined : this.shots;
  }
  private lastMark=0;
  private physicsStart?:number;
  private physicsMs=0;
  private alive=0;
  private meshEvaluationMs=0;
  private activeMeshes=0;
  private drawCalls=0;

  recordRender(meshEvaluationMs:number,activeMeshes:number,drawCalls:number):void {
    if(this.start===undefined)return;
    this.meshEvaluationMs=meshEvaluationMs;
    this.activeMeshes=activeMeshes;
    this.drawCalls=drawCalls;
  }

  mark(section:keyof FrameSections):void {
    if(this.start===undefined)return;
    const now=performance.now();
    this.sections[section]+=now-this.lastMark;
    this.lastMark=now;
  }

  readonly beginPhysics=():void=>{ if(this.start!==undefined)this.physicsStart=performance.now(); };
  readonly endPhysics=():void=>{
    if(this.physicsStart===undefined)return;
    this.physicsMs+=performance.now()-this.physicsStart;
    this.physicsStart=undefined;
  };
  recordAlive(count:number):void { this.alive=count; }
  recordPoseVisibility(animate:boolean):void { ++this.enemy[animate?'animated':'culled']; }
  // Discount nested path and crowd queries already reported in their own rows.
  enemyClock():number { return performance.now()-this.ms-this.crowdMs; }
  endEnemyStage(stage:keyof EnemySections,since:number):number {
    const now=this.enemyClock();
    this.enemy[stage]+=now-since;
    return now;
  }
  readonly recordCrowd=(ms:number,candidates:number):void=>{
    if(this.start===undefined)return;
    this.crowdMs+=ms;
    this.crowdCandidates+=candidates;
  };

  readonly recordPath=(ms:number):void=>{
    if(this.start===undefined)return;
    ++this.calls;
    this.ms+=ms;
  };

  reset():void {
    this.start=undefined;
    this.physicsStart=undefined;
    this.samples.length=0;
    this.bucketEnd=this.bucketPeak=-1;
    this.nextReport=this.calls=this.ms=0;
  }

  beginFrame(now:number):NavigationFrameReport|undefined {
    // The interval ending now belongs to the previous tick, including its render and waits.
    const reportEnd=Math.floor(now/reportIntervalMs)*reportIntervalMs;
    if(this.start!==undefined) {
      const end=Math.ceil(now/reportIntervalMs)*reportIntervalMs;
      if(this.bucketEnd!==end) { this.bucketEnd=end; this.bucketPeak=-1; }
      const frameMs=now-this.start;
      // Before the next render, Babylon still holds the previous frame's active list.
      const meshCounts=frameMs>this.bucketPeak ? this.meshes.capture() : undefined;
      this.bucketPeak=Math.max(this.bucketPeak,frameMs);
      this.samples.push({end:now,sample:{frameMs,meshCounts,pathCalls:this.calls,pathMs:this.ms,
        crowdMs:this.crowdMs,crowdCandidates:this.crowdCandidates,turretSightRays:this.turretSightRays,
        meshEvaluationMs:this.meshEvaluationMs,activeMeshes:this.activeMeshes,drawCalls:this.drawCalls,
        sections:this.sections,enemy:this.enemy,shots:this.shots,waveWork:this.waveWork,physicsMs:this.physicsMs,gapMs:now-this.lastMark,alive:this.alive}});
    }
    this.start=this.lastMark=now;
    this.sections=frameSections();
    this.enemy=enemySections();
    this.shots=projectileSections();
    this.waveWork=waveWork();
    this.physicsMs=0;
    this.meshEvaluationMs=this.activeMeshes=this.drawCalls=0;
    this.calls=this.ms=0;
    this.crowdMs=this.crowdCandidates=0;
    this.turretSightRays=0;
    if(now<this.nextReport || !this.samples.length)return;
    this.nextReport=reportEnd+reportIntervalMs;
    let expired=0;
    while(expired<this.samples.length && this.samples[expired].end<=reportEnd-windowMs)++expired;
    if(expired)this.samples.splice(0,expired);
    // Complete buckets only: the winner always has a breakdown from its own frame.
    let worst:NavigationFrame|undefined;
    this.durations.length=0;
    for(const {end,sample} of this.samples) {
      if(end>reportEnd)break;
      if(!worst || sample.frameMs>worst.frameMs)worst=sample;
      this.durations.push(sample.frameMs);
    }
    if(!worst)return;
    this.durations.sort((a,b)=>a-b);
    return {worst,p95Ms:this.durations[Math.ceil(this.durations.length*0.95)-1]};
  }
}
