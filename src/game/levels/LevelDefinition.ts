import type { Room } from '../shooter/workshopLayout';
import type { WaveDefinition } from '../waves/config';

export type LevelId = 'tutorial' | 'firstLevel';
export interface LevelDefinition {
  readonly id: LevelId;
  readonly rooms: Readonly<Record<string, Room>>;
  readonly tunnels: readonly (readonly [string, string])[];
  readonly playerSpawn: readonly [number, number, number];
  readonly turrets: readonly { id:string; position:readonly [number,number,number]; destroyed?:boolean }[];
  readonly singleTunnelDoor?: boolean;
  readonly waves: readonly WaveDefinition[];
}
