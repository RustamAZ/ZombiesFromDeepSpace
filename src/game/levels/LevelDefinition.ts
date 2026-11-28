import type { Room } from '../shooter/workshopLayout';
import type { WaveDefinition } from '../waves/config';

export type LevelId = 'tutorial' | 'firstLevel' | 'secondLevel' | 'thirdLevel';
export interface LevelDefinition {
  readonly id: LevelId;
  readonly rooms: Readonly<Record<string, Room>>;
  readonly roomShape?: 'octagon';
  readonly spawnRoomIds?: readonly [string, ...string[]];
  readonly turretLimits?: Readonly<Record<string, number>>;
  readonly performanceHud?: boolean;
  readonly tunnels: readonly (readonly [string, string])[];
  readonly playerSpawn: readonly [number, number, number];
  readonly turrets: readonly { id:string; position:readonly [number,number,number]; destroyed?:boolean; level?:number; fullyLoaded?:boolean }[];
  readonly singleTunnelDoor?: boolean;
  readonly startingCoins?: number;
  readonly finishAfterLastWave?: boolean;
  readonly enemyPathfinding?: boolean;
  readonly enemyTargetMode?: 'priority'|'coreOnly';
  readonly enemyTargetRefreshSeconds?: number;
  readonly maxPathBuildsPerFrame?: number;
  readonly waves: readonly WaveDefinition[];
}
