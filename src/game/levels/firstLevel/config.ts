import { rooms,tunnels } from '../../shooter/workshopLayout';
import { waveConfig } from '../../waves/config';
import type { LevelDefinition } from '../LevelDefinition';

export const firstLevel:LevelDefinition = {
  id:'firstLevel',rooms,tunnels,playerSpawn:[0,0.01,-3],waves:waveConfig,
  turrets:[{id:'defense',position:[-4,0,21]},
    {id:'core-left',position:[-4,0,-1.5]},{id:'core-right',position:[4,0,-1.5]}]
};
