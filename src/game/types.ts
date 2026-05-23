export type Role = 'imposter' | 'crewmate' | 'protector';

export type TaskType =
  | 'frequency'
  | 'morse'
  | 'satellite'
  | 'backup'
  | 'solar'
  | 'power'
  | 'magnetic'
  | 'password'
  | 'ice'
  | 'dna'
  | 'door';

export interface TaskStation {
  id: number;
  x: number;
  y: number;
  label: string;
  taskType: TaskType;
  completed: boolean;
}

export interface TaskChallenge {
  type: TaskType;
  stationId: number;
  prompt: string;
  answer: string;
  // frequency
  targetAngle?: number;
  // morse
  morsePattern?: ('short' | 'long')[];
  // satellite
  targetRotation?: number;
  // backup - auto progress
  duration?: number;
  // password
  passwordDigits?: string;
  // dna
  dnaOffset?: number;
  // ice
  tapsRequired?: number;
  // door
  doorId?: number;
  doorAction?: 'open' | 'close';
}

export interface Player {
  id: number;
  x: number;
  y: number;
  role: Role;
  alive: boolean;
  frozen: boolean;
  frozenUntil: number;
  name: string;
  isHuman: boolean;
  speed: number;
  direction: { x: number; y: number };
  aiTargetX: number;
  aiTargetY: number;
  aiChangeTime: number;
  killCooldown: number;
  freezeCooldown: number;
  doingTask: boolean;
  taskStationId: number | null;
  taskProgress: number; // 0-1
  jailed: boolean;
  jailedUntil: number;
  arrestCooldown: number;
  // Bot decision-making
  actionPlanAt: number;
  actionPlanTargetId: number | null;
  actionSkipUntil: number;
  doorBusyUntil: number;
  doorBusyId: number | null;
}

export interface FreezeProjectile {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  startTime: number;
  duration: number; // ms
}

export interface Door {
  id: number;
  // Wall-segment endpoints (when closed, blocks movement & vision)
  x1: number; y1: number;
  x2: number; y2: number;
  // Center point used for proximity checks
  cx: number; cy: number;
  open: boolean;
  lastUsedAt: number;
  label: string;
}

export interface GameState {
  players: Player[];
  phase: 'lobby' | 'playing' | 'gameover';
  winner: 'imposters' | 'crew' | null;
  timeElapsed: number;
  mapWidth: number;
  mapHeight: number;
  taskStations: TaskStation[];
  tasksCompleted: number;
  totalTasks: number;
  activeTask: TaskChallenge | null;
  projectiles: FreezeProjectile[];
  recentArrest: { name: string; time: number; eventId: number } | null;
  doors: Door[];
}

export const PLAYER_RADIUS = 18;
export const KILL_RANGE = 42;
export const FREEZE_RANGE = 120;
export const FREEZE_DURATION = 5000;
export const KILL_COOLDOWN = 5000;
export const FREEZE_COOLDOWN = 10000;
export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1200;
export const TASK_RANGE = 60;
export const TOTAL_TASKS = 10;

// Jail / Arrest
export const ARREST_RANGE = 55;
export const ARREST_COOLDOWN = 10000;
export const JAIL_DURATION = 20000;
export const MAX_JAILED = 2;
export const JAIL_RECT = { x: 1290, y: 950, w: 270, h: 220 };
export const JAIL_RELEASE = { x: 800, y: 700 };

// Doors
export const DOOR_USE_COOLDOWN = 1500;
export const DOOR_INTERACT_RANGE = 55;
