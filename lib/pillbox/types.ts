export type PillboxStatus =
  | 'ready'
  | 'playing'
  | 'paused'
  | 'resupply'
  | 'won'
  | 'lost';
export type SupplyChoice = 'repair' | 'barrel' | 'grenades';
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
  grenadeState: 'ready' | 'windup' | 'spent';
  grenadeTimer: number;
  landingCraftId?: number;
  smokeState?: 'windup' | 'spent';
  smokeTimer?: number;
  smokeMask?: number;
  crawling?: boolean;
  usesFoxhole?: boolean;
  foxholeId?: number;
  role?: 'rifle' | 'machine-gun' | 'mortar';
  squadId?: number;
  suppression?: number;
  coverElapsed?: number;
  exposed?: boolean;
  supporting?: boolean;
  rallyUntil?: number;
  rushUntil?: number;
  attackTimer?: number;
  emplacement?: 'setting-up' | 'firing';
  setupTimer?: number;
}
export interface LandingCraft {
  id: number;
  lane: number;
  x: number;
  z: number;
  capacity: number;
  passengers: number;
  ramp: number;
  phase: 'approach' | 'lowering' | 'unloading' | 'withdrawing' | 'gone';
  rampHealth: number;
  jamTimer: number;
  gunnerHealth: number;
  attackTimer: number;
}
export interface Jeep {
  id: number;
  x: number;
  z: number;
  side: number;
  waypoint: number;
  health: number;
  passengers: number;
  timer: number;
  phase: 'driving' | 'unloading' | 'leaving' | 'wreck' | 'gone';
}
export interface Grenade {
  id: number;
  x: number;
  z: number;
  age: number;
  kind?: 'mortar';
}
export interface PlayerGrenade {
  id: number;
  x: number;
  z: number;
  age: number;
}
export interface AirStrike {
  x: number;
  z: number;
  age: number;
  passes: number;
}
export const PLAYER_GRENADE_FLIGHT = 1.35;
export const PLAYER_GRENADE_RANGE = 115;
export const SUPPORT_REQUIRED = 12;
export function grenadeFlight(g: Grenade) {
  return g.kind === 'mortar' ? 3.4 : GRENADE_FLIGHT;
}
export const JEEP_HEALTH = 18;
export const GRENADE_FLIGHT = 2.2;
export function grenadeImpactPoint(id: number) {
  return { x: ((id % 3) - 1) * 4, z: -14 + (id % 2) * 1.2 };
}
export const SMOKE_FLIGHT = 1.1;
export const SMOKE_LIFETIME = 12;
export interface SmokeGrenade extends Grenade {
  targetX: number;
  targetZ: number;
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
  landingCraft: LandingCraft[];
  jeeps: Jeep[];
  grenades: Grenade[];
  smoke: SmokeGrenade[];
  jeepSpawned: number;
  jeepTimer: number;
  vehiclesStopped: number;
  pendingInfantry: number[];
  playerGrenades: PlayerGrenade[];
  grenadeAmmo: number;
  grenadeCooldown: number;
  nextProjectileId: number;
  barrelLevel: number;
  supportProgress: number;
  supportCredit: number;
  airSupportCharges: number;
  airStrike: AirStrike | null;
}
export type PillboxEvent =
  | { type: 'shot'; x: number; z: number; hit: boolean; vehicle?: boolean }
  | { type: 'down'; id: number; x: number; z: number }
  | { type: 'breach'; x: number; z: number }
  | { type: 'wave'; wave: number }
  | { type: 'jeep-destroyed'; x: number; z: number }
  | { type: 'grenade-impact'; x: number; z: number }
  | { type: 'player-blast'; x: number; z: number }
  | { type: 'enemy-fire'; x: number; z: number; heavy?: boolean }
  | { type: 'mortar-launch'; x: number; z: number }
  | { type: 'support-ready' | 'wave-cleared' }
  | { type: 'won' | 'lost' | 'overheat' };
export const WAVE_COUNTS = [18, 24, 30] as const;
export const COVER_ROWS = [-86, -50] as const;
export const LANES = [-36, -18, 0, 18, 36] as const;
export const AIM_BOUNDS = {
  minX: -44,
  maxX: 44,
  minZ: -210,
  maxZ: -10,
} as const;
