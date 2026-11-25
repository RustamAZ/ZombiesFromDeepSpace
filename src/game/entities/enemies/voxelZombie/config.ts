import { playerConfig } from '../../player/config';
import type { EnemyConfig } from '../Enemy';

export const zombieConfig = {
  material:'soft', lethalLoss:0.2, damage:10,
  patrolRadius:2.8, patrolSpeed:1.1, chaseSpeed:playerConfig.runSpeed*0.5,
  patrolDesiredDistanceRatio:0.68, patrolDistanceWeight:1,
  patrolOpenSpaceWeight:1.8, patrolForwardWeight:0.2,
  patrolRandomWeight:0.55, patrolClearanceRadius:2,
  sightRange:32, sightAngle:160, proximityAwarenessRadius:3, alertedHearingRadius:7, attackRange:1.3,
  windup:0.45, recovery:0.85, wait:0.9, thinkInterval:0.2,
  headTurnLimit:Math.PI/4, headTurnSpeed:5, showVisionDebug:true,
  wallBreakRadius:1.05, wallBreakDamage:120, wallBreakPenetration:1,
  wallBreakWindup:0.55, wallBreakRecovery:0.7, wallBreakLean:Math.PI/9,
  width:5, depth:3, height:9, cell:0.2
} as const satisfies EnemyConfig & {width:number; depth:number; height:number; cell:number;
  headTurnLimit:number; headTurnSpeed:number; showVisionDebug:boolean;
  wallBreakRadius:number; wallBreakDamage:number; wallBreakPenetration:number;
  wallBreakWindup:number; wallBreakRecovery:number; wallBreakLean:number};
