export type Vec3 = { x: number; y: number; z: number };
export type Phase = 'approach' | 'attack' | 'turn' | 'exit';
export type TargetKind =
  | 'craft'
  | 'carrier'
  | 'truck'
  | 'supply'
  | 'flak'
  | 'command';
export type AirTarget = {
  id: string;
  kind: TargetKind;
  position: Vec3;
  velocity: Vec3;
  half: Vec3;
  health: number;
  maxHealth: number;
  active: boolean;
  destroyedAt: number | null;
  damageOffset: Vec3 | null;
  nextFire: number;
  unload: number;
  cargo: number;
  heading: number;
};
export type Aircraft = {
  position: Vec3;
  velocity: Vec3;
  heading: number;
  pitch: number;
  bank: number;
  offset: number;
  desiredOffset: number;
  desiredAltitude: number;
  lateralSpeed: number;
};
export type Projectile = {
  id: number;
  kind: 'gun' | 'bomb';
  origin: Vec3;
  velocity: Vec3;
  position: Vec3;
  age: number;
  life: number;
  rack: number;
};
export type FlakShot = {
  id: number;
  origin: Vec3;
  end: Vec3;
  position: Vec3;
  age: number;
  fuse: number;
};
export type AirInput = { x: number; y: number; fire: boolean; bomb: boolean };
export type AirEvent =
  | { type: 'guns'; points: Vec3[] }
  | { type: 'bomb-release'; position: Vec3 }
  | { type: 'impact'; position: Vec3; water: boolean; bomb: boolean }
  | { type: 'destroyed'; position: Vec3; kind: TargetKind }
  | { type: 'flak'; position: Vec3 }
  | { type: 'flak-burst'; position: Vec3 }
  | { type: 'damage'; amount: number }
  | { type: 'phase' };
export type AirBattle = {
  status: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
  phase: Phase;
  pass: number;
  phaseTime: number;
  time: number;
  aircraft: Aircraft;
  health: number;
  bombs: number;
  released: number;
  bombCooldown: number;
  bombHeld: boolean;
  heat: number;
  overheated: boolean;
  gunCooldown: number;
  shots: number;
  hits: number;
  score: number;
  destroyed: number;
  deniedCargo: number;
  targets: AirTarget[];
  projectiles: Projectile[];
  flak: FlakShot[];
  serial: number;
  outcome: string;
  turnFrom: Vec3;
  turnHeading: number;
};
export const NEUTRAL: AirInput = { x: 0, y: 0, fire: false, bomb: false };
