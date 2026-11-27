export type GameSound = 'shot'|'turret'|'impact'|'coin'|'door'|'purchase'|'vacuum'|'hurt'|'lose';

export const audioConfig = {
  storageKey: 'kubotseh-volume',
  defaultVolume: 0.55,
  sounds: {
    shot: { start: 720, end: 180, duration: 0.11, gain: 0.2, wave: 'square', cooldown: 0.055 },
    turret: { start: 540, end: 130, duration: 0.09, gain: 0.11, wave: 'square', cooldown: 0.065 },
    impact: { start: 110, end: 55, duration: 0.12, gain: 0.16, wave: 'triangle', cooldown: 0.045 },
    coin: { start: 740, end: 1100, duration: 0.13, gain: 0.16, wave: 'sine', cooldown: 0.08 },
    door: { start: 210, end: 90, duration: 0.24, gain: 0.15, wave: 'sawtooth', cooldown: 0.1 },
    purchase: { start: 510, end: 810, duration: 0.17, gain: 0.17, wave: 'triangle', cooldown: 0.1 },
    vacuum: { start: 360, end: 95, duration: 0.45, gain: 0.14, wave: 'sawtooth', cooldown: 0.25 },
    hurt: { start: 160, end: 55, duration: 0.22, gain: 0.22, wave: 'sawtooth', cooldown: 0.16 },
    lose: { start: 310, end: 60, duration: 0.65, gain: 0.2, wave: 'triangle', cooldown: 0.5 }
  }
} as const;
