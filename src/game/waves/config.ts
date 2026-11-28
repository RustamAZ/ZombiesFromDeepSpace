export const maxAliveEnemiesOnMap = 80;

export type WaveDefinition = { enemyCount: number; endless?:boolean; spawnBatchSize: number; maxSpawnsPerFrame?:number; spawnIntervalSeconds: number; maxAlive: number; preparationSeconds: number; intermissionSeconds: number; };
export const waveConfig: WaveDefinition[]=[
  {enemyCount:15,spawnBatchSize:15,spawnIntervalSeconds:1.4,maxAlive:15,preparationSeconds:15,intermissionSeconds:8},
  {enemyCount:8,spawnBatchSize:3,spawnIntervalSeconds:1.1,maxAlive:4,preparationSeconds:0,intermissionSeconds:8},
  {enemyCount:12,spawnBatchSize:3,spawnIntervalSeconds:.85,maxAlive:5,preparationSeconds:0,intermissionSeconds:8}
];
