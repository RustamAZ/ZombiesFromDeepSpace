import type { VoxelMaterialType } from '../entities/voxel/VoxelImpact';

type Point = readonly [x: number, z: number];
export type CrateColor = 'gold' | 'blue' | 'coral';
type Crate = readonly [x: number, z: number, color: CrateColor, material?: VoxelMaterialType];
export type Room = {
  readonly cell: Point;
  readonly accent: 'yellow' | 'coral' | 'mint';
  readonly crates: readonly Crate[];
  readonly balcony?: boolean;
};

export const halfRoom = 8;
export const cellSpacing = 21;
export const doorWidth = 3.5;
export const doorHeight = 3;

export const rooms = {
  start:    { cell: [0, 0], accent: 'yellow', crates: [
    [-3.2, 1.5, 'gold', 'soft'], [0, 1.5, 'blue', 'normal'], [3.2, 1.5, 'coral', 'hard']
  ] },
  depot:    { cell: [0, 1], accent: 'mint',   crates: [[-4.2, -2, 'blue'], [-4.2, 0, 'gold'], [3, 4, 'blue']] },
  press:    { cell: [1, 0], accent: 'coral',  crates: [[3.5, -3.5, 'gold'], [-3.6, 3, 'gold']] },
  junction: { cell: [1, 1], accent: 'yellow', crates: [[-4, 3.5, 'gold'], [3.7, -3, 'blue']] },
  packing:  { cell: [1, 2], accent: 'coral',  crates: [[2.5, 3.5, 'gold'], [4.5, 3.5, 'blue'], [-3.5, -3.5, 'gold']] },
  gallery:  { cell: [0, 2], accent: 'mint',   crates: [[3, -3.5, 'blue'], [4.9, 2.8, 'gold']], balcony: true }
} as const satisfies Record<string, Room>;

export type RoomId = keyof typeof rooms;
export const tunnels: readonly (readonly [RoomId, RoomId])[] = [
  ['start', 'depot'], ['start', 'press'], ['depot', 'junction'],
  ['press', 'junction'], ['junction', 'packing'], ['packing', 'gallery']
];
