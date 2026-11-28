import { cellSpacing, type Room } from '../../shooter/workshopLayout';
import type { LevelDefinition } from '../LevelDefinition';
import { secondLevel } from '../secondLevel/config';

const rooms = {
  core: {cell:[0,0], accent:'mint'},
  westDefense: {cell:[-1,1], accent:'yellow'}, westSpawn: {cell:[-2,2], accent:'coral'},
  northDefense: {cell:[0,1], accent:'yellow'}, northSpawn: {cell:[0,2], accent:'coral'},
  eastDefense: {cell:[1,1], accent:'yellow'}, eastSpawn: {cell:[2,2], accent:'coral'}
} as const satisfies Record<string,Room>;
const spawnRoomIds = ['westSpawn','northSpawn','eastSpawn'] as const;
const lanes = spawnRoomIds.length;

function turretsIn(roomId:keyof typeof rooms, rows:readonly number[]):LevelDefinition['turrets'] {
  const [cx,cz]=rooms[roomId].cell;
  return rows.flatMap(z=>[-4,4].map(x=>({
    id:`${roomId}:${x}:${z}`, position:[cx*cellSpacing+x,0,cz*cellSpacing+z] as const,
    level:2, fullyLoaded:true
  })));
}

export const thirdLevel:LevelDefinition = {
  ...secondLevel, id:'thirdLevel', rooms, roomShape:'octagon', spawnRoomIds,
  tunnels:[
    ['westSpawn','westDefense'],['westDefense','core'],
    ['northSpawn','northDefense'],['northDefense','core'],
    ['eastSpawn','eastDefense'],['eastDefense','core']
  ],
  turretLimits:{core:6},
  turrets:[
    ...turretsIn('core',[-4,0,4]), ...turretsIn('westDefense',[-4,4]),
    ...turretsIn('northDefense',[-4,4]), ...turretsIn('eastDefense',[-4,4])
  ],
  waves:secondLevel.waves.map(wave=>({...wave, enemyCount:wave.enemyCount*lanes,
    spawnBatchSize:wave.spawnBatchSize*lanes, maxAlive:wave.maxAlive*lanes}))
};
