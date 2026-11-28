import { type Scene, Vector3 } from '@babylonjs/core';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Enemy } from '../Enemy';
import { zombieAnimationConfig as cfg, zombieConfig } from './config';

const height=zombieConfig.height*zombieConfig.cell;
const width=zombieConfig.width*zombieConfig.cell;
const radius=Math.hypot(height,width); // Includes the sideways extension of a falling body.
type Sight={inView:boolean; blockedChecks:number; next:number};

export class ZombieAnimationVisibility {
  private readonly states=new WeakMap<Enemy,Sight>();
  private readonly end=Vector3.Zero();
  private readonly hit=new PhysicsRaycastResult();
  private cursor=0;
  private available=false;

  update(scene:Scene,enemies:readonly Enemy[],now:number):void {
    const camera=scene.activeCamera;
    this.available=!!camera;
    if(!camera || !enemies.length)return;
    const view=camera.getViewMatrix().m, projection=camera.getProjectionMatrix().m;
    const origin=camera.globalPosition;
    const extent=(scale:number)=>Math.tan(Math.min(Math.PI/2-0.01,Math.atan(1/Math.abs(scale))+cfg.viewMarginRadians));
    const tx=extent(projection[0]), ty=extent(projection[5]);
    const mx=radius*Math.hypot(1,tx), my=radius*Math.hypot(1,ty);
    const physics=scene.getPhysicsEngine();
    const start=this.cursor%enemies.length;
    let probes=0;
    for(let i=0;i<enemies.length;i++) {
      const index=(start+i)%enemies.length, enemy=enemies[index];
      if(enemy.deathComplete)continue;
      let state=this.states.get(enemy);
      if(!state)this.states.set(enemy,state={inView:false,blockedChecks:0,next:0});
      const p=enemy.position, dx=p.x-origin.x, dy=p.y+height*0.5-origin.y, dz=p.z-origin.z;
      const z=dx*view[2]+dy*view[6]+dz*view[10];
      const inside=z>=-radius && Math.abs(dx*view[0]+dy*view[4]+dz*view[8])<=z*tx+mx &&
        Math.abs(dx*view[1]+dy*view[5]+dz*view[9])<=z*ty+my;
      state.inView=inside;
      if(!inside || !(physics instanceof PhysicsEngine)) {
        state.blockedChecks=0;
        state.next=0;
        continue;
      }
      if(probes>=cfg.probesPerFrame || now<state.next)continue;
      ++probes;
      this.cursor=index+1;
      state.next=now+cfg.probeInterval;
      // One clear sample wakes the pose; require two blocked samples to put it to sleep.
      const sideX=view[0]*width*0.48, sideZ=view[8]*width*0.48;
      const blocked=(x:number,y:number,z:number)=>{
        physics.raycastToRef(origin,this.end.set(x,y,z),this.hit);
        return this.hit.hasHit && this.hit.body?.getMotionType()===PhysicsMotionType.STATIC;
      };
      state.blockedChecks=blocked(p.x,p.y+height*0.92,p.z) &&
        blocked(p.x-sideX,p.y+height*0.62,p.z-sideZ) &&
        blocked(p.x+sideX,p.y+height*0.62,p.z+sideZ) &&
        blocked(p.x,p.y+height*0.12,p.z) ? Math.min(2,state.blockedChecks+1) : 0;
    }
  }

  shouldAnimate(enemy:Enemy):boolean {
    const state=this.states.get(enemy);
    return !this.available || !state || (state.inView && state.blockedChecks<2);
  }
}
