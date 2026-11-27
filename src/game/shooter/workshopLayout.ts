type Point = readonly [x: number, z: number];
export type Room = {
  readonly cell: Point;
  readonly accent: 'yellow' | 'coral' | 'mint';
};

export const halfRoom = 8;
export const cellSpacing = 21;
export const doorWidth = 4.2;
export const doorHeight = 3;

export const rooms = {
  spawn:   { cell: [0, 2], accent: 'coral' },
  defense: { cell: [0, 1], accent: 'yellow' },
  core:    { cell: [0, 0], accent: 'mint' }
} as const satisfies Record<string, Room>;

export type RoomId = keyof typeof rooms;
export function nearestRoomId(x:number,z:number): RoomId {
  let nearest:RoomId='spawn';
  let bestDistance=Infinity;
  for (const [id,room] of Object.entries(rooms) as [RoomId,Room][]) {
    const dx=x-room.cell[0]*cellSpacing;
    const dz=z-room.cell[1]*cellSpacing;
    const distance=dx*dx+dz*dz;
    if (distance<bestDistance) { bestDistance=distance; nearest=id; }
  }
  return nearest;
}
export const tunnels: readonly (readonly [RoomId, RoomId])[] = [
  ['spawn', 'defense'], ['defense', 'core']
];
