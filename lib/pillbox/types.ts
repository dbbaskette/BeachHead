export type PillboxStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export interface Infantry {
  id: number;
  x: number;
  z: number;
  lane: number;
  health: number;
  phase: 'advance' | 'cover' | 'down' | 'breached';
  timer: number;
  coverIndex: number;
  waypoint: number;
  offset: number;
  speed: number;
}
export interface PillboxBattle {
  status: PillboxStatus;
  time: number;
  wave: number;
  spawned: number;
  spawnTimer: number;
  intermission: number;
  health: number;
  heat: number;
  overheated: boolean;
  cooldown: number;
  shots: number;
  hits: number;
  kills: number;
  score: number;
  aimX: number;
  aimZ: number;
  message: string;
  soldiers: Infantry[];
}
export type PillboxEvent =
  | { type: 'shot'; x: number; z: number; hit: boolean }
  | { type: 'down'; id: number; x: number; z: number }
  | { type: 'breach'; x: number; z: number }
  | { type: 'wave'; wave: number }
  | { type: 'won' | 'lost' | 'overheat' };
export const WAVE_COUNTS = [18, 24, 30] as const;
export const COVER_ROWS = [-86, -50] as const;
export const LANES = [-36, -18, 0, 18, 36] as const;
export const AIM_BOUNDS = {
  minX: -44,
  maxX: 44,
  minZ: -132,
  maxZ: -10,
} as const;
