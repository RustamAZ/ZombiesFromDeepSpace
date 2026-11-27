import type { LevelDefinition } from '../LevelDefinition';

export const tutorialRules = { bonusCoins:10, minimumServiceCoins:6, turretId:'training-turret' } as const;
export const tutorialLevel:LevelDefinition = {
  id:'tutorial',
  rooms:{spawn:{cell:[0,1],accent:'coral'},core:{cell:[0,0],accent:'mint'}},
  tunnels:[['spawn','core']], playerSpawn:[0,0.01,-3], singleTunnelDoor:true,
  turrets:[{id:tutorialRules.turretId,position:[-4,0,0],destroyed:true}],
  waves:[
    {enemyCount:3,spawnBatchSize:3,spawnIntervalSeconds:5,maxAlive:3,preparationSeconds:10,intermissionSeconds:5},
    {enemyCount:8,spawnBatchSize:3,spawnIntervalSeconds:5,maxAlive:8,preparationSeconds:0,intermissionSeconds:5},
    {enemyCount:0,endless:true,spawnBatchSize:5,spawnIntervalSeconds:5,maxAlive:30,preparationSeconds:0,intermissionSeconds:5}
  ]
};
