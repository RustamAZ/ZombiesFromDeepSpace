import { playerConfig } from '../../player/config';
import type { EnemyConfig } from '../Enemy';

export const zombieAnimationConfig = {
  viewMarginRadians:12*Math.PI/180, probeInterval:0.12, probesPerFrame:6
} as const;

export const zombieConfig = {
  material:'hard', maxHealth:120, damage:10,
  hitKnockbackSpeed:0.7, hitSlowSeconds:0.15, hitSlowFactor:0.25,
  retaliationChance:0.2, retaliationSeconds:8, attackLean:Math.PI/7,
  proximityAggroRadius:2.5, proximityAggroChance:0.4,
  deathFallSeconds:0.3, deathFallLean:-Math.PI*0.42,
  personalSpaceRadius:0.55,
  patrolRadius:2.8, patrolSpeed:1.1, chaseSpeed:playerConfig.runSpeed*0.7,
  patrolDesiredDistanceRatio:0.68, patrolDistanceWeight:1,
  patrolOpenSpaceWeight:1.8, patrolForwardWeight:0.2,
  patrolRandomWeight:0.55, patrolClearanceRadius:2,
  sightRange:32, sightAngle:160, proximityAwarenessRadius:3, alertedHearingRadius:7, attackRange:1.3,
  windup:0.2, recovery:1.1, attackVisualRecovery:0.2, wait:0.9, thinkInterval:0.2,
  headTurnLimit:Math.PI/4, headTurnSpeed:5, headRetargetAngle:Math.PI/180, showVisionDebug:false,
  wallBreakRadius:0.65, wallBreakReach:1.55, wallBreakDamage:40, wallBreakPenetration:1,
  wallBreakWindup:0.25, wallBreakRecovery:0.9, wallBreakVisualRecovery:0.2,
  wallBreakLean:Math.PI/9,
  width:5, depth:3, height:9, headStartRow:6, cell:0.2
} as const satisfies EnemyConfig & {width:number; depth:number; height:number; cell:number;
  headStartRow:number;
  headTurnLimit:number; headTurnSpeed:number; headRetargetAngle:number; showVisionDebug:boolean;
  wallBreakRadius:number; wallBreakDamage:number; wallBreakPenetration:number;
  wallBreakWindup:number; wallBreakRecovery:number; wallBreakVisualRecovery:number;
  wallBreakLean:number; attackVisualRecovery:number;
  hitKnockbackSpeed:number; hitSlowSeconds:number; hitSlowFactor:number;
  deathFallSeconds:number; deathFallLean:number;
  retaliationChance:number; retaliationSeconds:number; attackLean:number;
  proximityAggroRadius:number; proximityAggroChance:number};
