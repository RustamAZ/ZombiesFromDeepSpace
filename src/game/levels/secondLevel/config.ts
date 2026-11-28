import type { LevelDefinition } from '../LevelDefinition';
import { firstLevel } from '../firstLevel/config';

const enemyCounts = [200, 30, 30, 40, 40, 40] as const;

export const secondLevel: LevelDefinition = {
  ...firstLevel,
  id: 'secondLevel',
  performanceHud: true,
  turrets: [
    {id:'core-left',position:[-4,0,-1.5],level:2,fullyLoaded:true},
    {id:'core-right',position:[4,0,-1.5],level:2,fullyLoaded:true},
    {id:'front-left',position:[-3,0,4],level:2,fullyLoaded:true},
    {id:'front-right',position:[3,0,4],level:2,fullyLoaded:true},
    {id:'defense-front-left',position:[-4,0,25],level:2,fullyLoaded:true},
    {id:'defense-front-right',position:[4,0,25],level:2,fullyLoaded:true},
    {id:'defense-rear-left',position:[-4,0,17],level:2,fullyLoaded:true},
    {id:'defense-rear-right',position:[4,0,17],level:2,fullyLoaded:true}
  ],
  startingCoins: 1000,
  maxPathBuildsPerFrame: 2,
  finishAfterLastWave: true,
  waves: enemyCounts.map((enemyCount, index) => ({
    enemyCount,
    spawnBatchSize: index === 0 ? 10 : 5,
    maxSpawnsPerFrame: 2,
    spawnIntervalSeconds: 1.4,
    maxAlive: index === 0 ? enemyCount : 15,
    preparationSeconds: 0,
    intermissionSeconds: 8
  }))
};
