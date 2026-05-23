import {
  Player, GameState, Role,
  PLAYER_RADIUS, KILL_RANGE,
  KILL_COOLDOWN, MAP_WIDTH, MAP_HEIGHT, TASK_RANGE, TOTAL_TASKS,
  ARREST_RANGE, ARREST_COOLDOWN, JAIL_DURATION, MAX_JAILED, JAIL_RECT, JAIL_RELEASE,
  DOOR_INTERACT_RANGE, DOOR_USE_COOLDOWN
} from './types';
import { createTaskStations } from './tasks';
import { resolveCollisions, hasLineOfSight, createDoors } from './collision';
import { getNavigationDirection, getRoomAt } from './navigation';

const BOT_NAMES = [
  'StarBoy', 'error504', 'top_dawg', 'LunarLord', 'FireBender',
  'AlphaApex', 'KnightRider', 'ViperStriker', 'itz Anya',
  'Naruto23', 'Goku', 'technoblade_never_dies',
  'NovaStrike', 'unknown753', 'Riya', 'Alam', 'Keshav chandra',
  'Iiiiiiiiiiiiii.......', 'ZeroPixel9', 'LunaUsagi12', 'RapidAimYT',
  'GrimReaper_Pro', 'Cornely3', 'Emma', 'Amelia',
];

// Global bot action throttle: max 3 bots may act simultaneously, with a
// 0.5-1s gap between successive bot action ticks.
const MAX_CONCURRENT_BOT_ACTIONS = 3;
let _lastBotActionAt = 0;
let _nextBotActionGap = 600;

const BOT_VISION: Record<Role, number> = {
  crewmate: 220,
  protector: 170,
  imposter: 120,
};

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

const PATROL_POINTS = [
  { x: 800, y: 200 }, { x: 200, y: 625 }, { x: 1400, y: 625 },
  { x: 800, y: 900 }, { x: 400, y: 300 }, { x: 1200, y: 300 },
  { x: 400, y: 1000 }, { x: 1200, y: 1000 },
];

export function createGame(playerRole: Role, playerName?: string): GameState {
  const roles: Role[] = ['imposter', 'imposter', 'protector', 'protector',
    'crewmate', 'crewmate', 'crewmate', 'crewmate', 'crewmate', 'crewmate'];
  const roleIdx = roles.indexOf(playerRole);
  [roles[0], roles[roleIdx]] = [roles[roleIdx], roles[0]];
  for (let i = roles.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(Math.random() * i);
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  // Pick 9 random unique names for bots (player 0 is human, named "You")
  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const humanName = (playerName && playerName.trim()) || 'Astro';
  const players: Player[] = roles.map((role, i) => ({
    id: i,
    x: 200 + Math.random() * (MAP_WIDTH - 400),
    y: 200 + Math.random() * (MAP_HEIGHT - 400),
    role,
    alive: true,
    frozen: false,
    frozenUntil: 0,
    name: i === 0 ? humanName : shuffledNames[(i - 1) % shuffledNames.length],
    isHuman: i === 0,
    speed: role === 'imposter' ? 3.6 : 3.3,
    direction: { x: 0, y: 0 },
    aiTargetX: MAP_WIDTH / 2,
    aiTargetY: MAP_HEIGHT / 2,
    aiChangeTime: 0,
    killCooldown: 0,
    freezeCooldown: 0,
    doingTask: false,
    taskStationId: null,
    taskProgress: 0,
    jailed: false,
    jailedUntil: 0,
    arrestCooldown: 0,
    actionPlanAt: 0,
    actionPlanTargetId: null,
    actionSkipUntil: 0,
    doorBusyUntil: 0,
    doorBusyId: null,
  }));

  // Keep players out of jail at spawn
  for (const p of players) {
    if (p.x > JAIL_RECT.x - 40 && p.x < JAIL_RECT.x + JAIL_RECT.w + 40 &&
        p.y > JAIL_RECT.y - 40 && p.y < JAIL_RECT.y + JAIL_RECT.h + 40) {
      p.x = 600; p.y = 600;
    }
  }

  return {
    players,
    phase: 'playing',
    winner: null,
    timeElapsed: 0,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    taskStations: createTaskStations(),
    tasksCompleted: 0,
    totalTasks: TOTAL_TASKS,
    activeTask: null,
    projectiles: [],
    recentArrest: null,
    doors: createDoors(),
  };
}

function getVisiblePlayers(player: Player, allPlayers: Player[], state: GameState): Player[] {
  const vision = BOT_VISION[player.role];
  return allPlayers.filter(p =>
    p.id !== player.id && p.alive && !p.jailed &&
    dist(player, p) <= vision &&
    hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
  );
}

function jailWander(player: Player, now: number) {
  if (now > player.aiChangeTime) {
    player.aiTargetX = JAIL_RECT.x + 30 + Math.random() * (JAIL_RECT.w - 60);
    player.aiTargetY = JAIL_RECT.y + 30 + Math.random() * (JAIL_RECT.h - 60);
    player.aiChangeTime = now + 1500 + Math.random() * 1500;
  }
  const dx = player.aiTargetX - player.x;
  const dy = player.aiTargetY - player.y;
  const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  player.direction = { x: dx / d, y: dy / d };
}

function updateAI(player: Player, allPlayers: Player[], state: GameState, now: number) {
  if (!player.alive || player.isHuman) return;
  if (player.jailed) { jailWander(player, now); return; }

  const visible = getVisiblePlayers(player, allPlayers, state);

  if (player.role === 'imposter') aiImposterBehavior(player, visible, now);
  else if (player.role === 'protector') aiProtectorBehavior(player, visible, allPlayers, now);
  else aiCrewmateBehavior(player, visible, state, now);
}

const ROOM_CENTERS = [
  { x: 800, y: 190 }, { x: 215, y: 625 }, { x: 1385, y: 625 },
];

function aiImposterBehavior(player: Player, visible: Player[], now: number) {
  const visibleCrew = visible.filter(p => p.role === 'crewmate');
  const visibleProtectors = visible.filter(p => p.role === 'protector');

  const nearbyProtector = visibleProtectors.find(p => dist(player, p) < 180);
  if (nearbyProtector && Math.random() < 0.7) {
    const dir = getNavigationDirection(player.x, player.y,
      player.x + (player.x - nearbyProtector.x),
      player.y + (player.y - nearbyProtector.y));
    player.direction = dir;
    return;
  }

  if (visibleCrew.length > 0) {
    const nearest = visibleCrew.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.direction = getNavigationDirection(player.x, player.y, nearest.x, nearest.y);
    return;
  }

  if (now > player.aiChangeTime || dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 40) {
    const currentRoom = getRoomAt(player.x, player.y);
    let bestRoom = ROOM_CENTERS[0];
    let bestDist = Infinity;
    for (const rc of ROOM_CENTERS) {
      const roomIdx = ROOM_CENTERS.indexOf(rc);
      if (roomIdx === currentRoom) continue;
      const d = dist(player, rc);
      if (d < bestDist) { bestDist = d; bestRoom = rc; }
    }
    player.aiTargetX = bestRoom.x + (Math.random() - 0.5) * 60;
    player.aiTargetY = bestRoom.y + (Math.random() - 0.5) * 60;
    player.aiChangeTime = now + 4000 + Math.random() * 2000;
  }
  player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
}

function aiProtectorBehavior(player: Player, visible: Player[], allPlayers: Player[], now: number) {
  // Protectors patrol and approach any non-protector to potentially arrest.
  const otherProtector = allPlayers.find(p => p.id !== player.id && p.role === 'protector' && p.alive && !p.jailed);
  const suspects = visible.filter(p => p.role !== 'protector');

  if (suspects.length > 0) {
    const target = suspects.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.direction = getNavigationDirection(player.x, player.y, target.x, target.y);
    return;
  }
  patrolAI(player, otherProtector, now);
}

function patrolAI(player: Player, otherProtector: Player | undefined, now: number) {
  if (now > player.aiChangeTime || dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 30) {
    let bestPoint = PATROL_POINTS[Math.floor(Math.random() * PATROL_POINTS.length)];
    if (otherProtector) {
      const sorted = [...PATROL_POINTS].sort((a, b) => dist(otherProtector, b) - dist(otherProtector, a));
      bestPoint = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
    }
    player.aiTargetX = bestPoint.x + (Math.random() - 0.5) * 100;
    player.aiTargetY = bestPoint.y + (Math.random() - 0.5) * 100;
    player.aiChangeTime = now + 3000 + Math.random() * 2000;
  }
  player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
}

function aiCrewmateBehavior(player: Player, visible: Player[], state: GameState, now: number) {
  // Crew bots do NOT know who is an imposter — they just focus on tasks.
  if (player.doingTask) { player.direction = { x: 0, y: 0 }; return; }

  const vision = BOT_VISION[player.role];
  const nearbyTasks = state.taskStations.filter(t => !t.completed && dist(player, t) <= vision);
  if (nearbyTasks.length > 0) {
    const closest = nearbyTasks.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
    player.direction = getNavigationDirection(player.x, player.y, closest.x, closest.y);
    return;
  }
  wanderAI(player, now);
}

function wanderAI(player: Player, now: number) {
  if (now > player.aiChangeTime || dist(player, { x: player.aiTargetX, y: player.aiTargetY }) < 30) {
    player.aiTargetX = 100 + Math.random() * (MAP_WIDTH - 200);
    player.aiTargetY = 100 + Math.random() * (MAP_HEIGHT - 200);
    player.aiChangeTime = now + 2000 + Math.random() * 3000;
  }
  player.direction = getNavigationDirection(player.x, player.y, player.aiTargetX, player.aiTargetY);
}

let _arrestEventId = 0;
function arrestPlayer(state: GameState, target: Player, now: number) {
  target.jailed = true;
  target.jailedUntil = now + JAIL_DURATION;
  target.doingTask = false;
  target.taskStationId = null;
  target.taskProgress = 0;
  target.frozen = false;
  target.x = JAIL_RECT.x + JAIL_RECT.w / 2 + (Math.random() - 0.5) * 60;
  target.y = JAIL_RECT.y + JAIL_RECT.h / 2 + (Math.random() - 0.5) * 60;
  target.direction = { x: 0, y: 0 };
  state.recentArrest = { name: target.name, time: now, eventId: ++_arrestEventId };
}

function releasePlayer(target: Player) {
  target.jailed = false;
  target.jailedUntil = 0;
  target.x = JAIL_RELEASE.x + (Math.random() - 0.5) * 80;
  target.y = JAIL_RELEASE.y + (Math.random() - 0.5) * 80;
}

function performAIActions(player: Player, allPlayers: Player[], state: GameState, now: number) {
  if (!player.alive || player.isHuman || player.jailed) return;

  const visible = getVisiblePlayers(player, allPlayers, state);

  // Bots have a 30-40% chance to "do nothing" for a window after each opportunity.
  if (now < player.actionSkipUntil) {
    // still tick task logic for crewmates below
  } else if (player.role === 'imposter' && player.killCooldown <= 0) {
    const candidates = visible.filter(p =>
      p.role === 'crewmate' && dist(player, p) < KILL_RANGE &&
      hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
    );
    if (candidates.length > 0) {
      const target = candidates[0];
      // Only kill if target is alone and no protector is nearby
      const protectorNear = allPlayers.some(p =>
        p.alive && !p.jailed && p.role === 'protector' &&
        dist(player, p) < 220 && hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
      );
      const otherCrewNear = visible.some(p => p.id !== target.id && p.role !== 'imposter' && dist(target, p) < 130);
      if (!protectorNear && !otherCrewNear) {
        if (player.actionPlanTargetId !== target.id) {
          player.actionPlanTargetId = target.id;
          player.actionPlanAt = now + 1000 + Math.random() * 2000; // 1-3s
        } else if (now >= player.actionPlanAt) {
          target.alive = false;
          target.doingTask = false;
          target.taskStationId = null;
          player.killCooldown = KILL_COOLDOWN;
          player.actionPlanTargetId = null;
          if (Math.random() < 0.35) player.actionSkipUntil = now + 2500;
        }
      } else {
        player.actionPlanTargetId = null;
      }
    } else {
      player.actionPlanTargetId = null;
    }
  }

  if (player.role === 'protector' && player.arrestCooldown <= 0 && now >= player.actionSkipUntil) {
    const candidates = visible.filter(p =>
      !p.jailed && p.role !== 'protector' && dist(player, p) < ARREST_RANGE &&
      hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
    );
    const jailedCount = allPlayers.filter(p => p.jailed).length;
    if (candidates.length > 0 && jailedCount < MAX_JAILED) {
      // Decision: stronger urge if a kill happened recently nearby
      const target = candidates.reduce((a, b) => dist(player, a) < dist(player, b) ? a : b);
      const sawKill = allPlayers.some(p =>
        !p.alive && dist(player, p) < 250 && hasLineOfSight(player.x, player.y, p.x, p.y, state.doors)
      );
      const chance = sawKill ? 0.85 : 0.25;
      if (player.actionPlanTargetId !== target.id) {
        player.actionPlanTargetId = target.id;
        // 1-2s ponder
        player.actionPlanAt = now + 1000 + Math.random() * 1000;
      } else if (now >= player.actionPlanAt) {
        if (Math.random() < chance) {
          arrestPlayer(state, target, now);
          player.arrestCooldown = ARREST_COOLDOWN;
        } else {
          player.actionSkipUntil = now + 2000 + Math.random() * 1500;
        }
        player.actionPlanTargetId = null;
      }
    } else {
      player.actionPlanTargetId = null;
    }
  }

  if (player.role === 'crewmate' && !player.doingTask) {
    const incompleteTasks = state.taskStations.filter(t => !t.completed);
    const nearTask = incompleteTasks.find(t => dist(player, t) < TASK_RANGE);
    if (nearTask) {
      player.doingTask = true;
      player.taskStationId = nearTask.id;
      player.taskProgress = 0;
    }
  }

  // Task progress is ticked per-frame in updateGame (not throttled),
  // so bot crewmates reliably finish a task in ~5 seconds.
}

export function updateGame(state: GameState, dt: number, keys: Set<string>, now: number): GameState {
  if (state.phase !== 'playing') return state;

  const human = state.players[0];

  if (human.alive && !human.doingTask) {
    let dx = 0, dy = 0;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (dx || dy) {
      const d = Math.sqrt(dx * dx + dy * dy);
      human.direction = { x: dx / d, y: dy / d };
    }
  } else if (human.doingTask) {
    human.direction = { x: 0, y: 0 };
  }

  for (const p of state.players) {
    if (!p.alive) continue;

    if (p.jailed && now >= p.jailedUntil) releasePlayer(p);

    if (p.killCooldown > 0) p.killCooldown -= dt;
    if (p.arrestCooldown > 0) p.arrestCooldown -= dt;

    // Bot crewmates progress their current task every frame (5s to complete)
    if (!p.isHuman && p.alive && !p.jailed && p.role === 'crewmate' &&
        p.doingTask && p.taskStationId !== null) {
      p.taskProgress += dt / 5000;
      if (p.taskProgress >= 1) {
        const station = state.taskStations.find(t => t.id === p.taskStationId);
        if (station && !station.completed) {
          station.completed = true;
          state.tasksCompleted++;
        }
        p.doingTask = false;
        p.taskStationId = null;
        p.taskProgress = 0;
      }
    }

    // Bot busy interacting with a door (3s)
    if (!p.isHuman && p.doorBusyUntil > 0) {
      if (now >= p.doorBusyUntil) {
        if (p.doorBusyId !== null) {
          const door = state.doors.find(d => d.id === p.doorBusyId);
          if (door && now - door.lastUsedAt >= 0) {
            door.open = !door.open;
            door.lastUsedAt = now;
          }
        }
        p.doorBusyUntil = 0;
        p.doorBusyId = null;
      } else {
        p.direction = { x: 0, y: 0 };
      }
    }

    if (!p.isHuman && p.doorBusyUntil === 0) {
      // Check if there's a closed door right in front to interact with
      if (p.role !== 'protector') {
        const door = state.doors.find(d =>
          !d.open && Math.hypot(d.cx - p.x, d.cy - p.y) < 50
        );
        if (door) {
          p.doorBusyUntil = now + 3000;
          p.doorBusyId = door.id;
          p.direction = { x: 0, y: 0 };
        }
      }
    }

    if (!p.isHuman && p.doorBusyUntil === 0) {
      updateAI(p, state.players, state, now);
    }

    p.x += p.direction.x * p.speed;
    p.y += p.direction.y * p.speed;

    if (p.jailed) {
      p.x = Math.max(JAIL_RECT.x + PLAYER_RADIUS, Math.min(JAIL_RECT.x + JAIL_RECT.w - PLAYER_RADIUS, p.x));
      p.y = Math.max(JAIL_RECT.y + PLAYER_RADIUS, Math.min(JAIL_RECT.y + JAIL_RECT.h - PLAYER_RADIUS, p.y));
    } else {
      p.x = Math.max(PLAYER_RADIUS, Math.min(state.mapWidth - PLAYER_RADIUS, p.x));
      p.y = Math.max(PLAYER_RADIUS, Math.min(state.mapHeight - PLAYER_RADIUS, p.y));
      const resolved = resolveCollisions(p.x, p.y, state.doors);
      p.x = resolved.x;
      p.y = resolved.y;
    }
  }

  // Throttled bot actions: at most 3 bots act per "tick window",
  // and tick windows are spaced 0.5-1s apart.
  if (now - _lastBotActionAt >= _nextBotActionGap) {
    const candidates = state.players.filter(p =>
      p.alive && !p.isHuman && !p.jailed && p.doorBusyUntil === 0
    );
    // Shuffle for fairness
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const acting = candidates.slice(0, MAX_CONCURRENT_BOT_ACTIONS);
    for (const p of acting) {
      performAIActions(p, state.players, state, now);
    }
    _lastBotActionAt = now;
    _nextBotActionGap = 500 + Math.random() * 500;
  }

  state.projectiles = state.projectiles.filter(p => now - p.startTime < p.duration);

  if (state.tasksCompleted >= state.totalTasks) {
    return { ...state, phase: 'gameover', winner: 'crew', timeElapsed: state.timeElapsed + dt };
  }
  const aliveCrew = state.players.filter(p => p.alive && p.role === 'crewmate').length;
  if (aliveCrew === 0) {
    return { ...state, phase: 'gameover', winner: 'imposters', timeElapsed: state.timeElapsed + dt };
  }
  return { ...state, timeElapsed: state.timeElapsed + dt };
}

export function humanKill(state: GameState, now: number): boolean {
  const human = state.players[0];
  if (!human.alive || human.jailed || human.role !== 'imposter' || human.killCooldown > 0) return false;
  const targets = state.players.filter(p =>
    p.alive && p.id !== 0 && !p.jailed && p.role === 'crewmate' &&
    dist(human, p) < KILL_RANGE &&
    hasLineOfSight(human.x, human.y, p.x, p.y, state.doors)
  );
  if (targets.length > 0) {
    targets[0].alive = false;
    targets[0].doingTask = false;
    human.killCooldown = KILL_COOLDOWN;
    return true;
  }
  return false;
}

export function humanArrest(state: GameState, now: number): boolean {
  const human = state.players[0];
  if (!human.alive || human.jailed || human.role !== 'protector' || human.arrestCooldown > 0) return false;
  const jailedCount = state.players.filter(p => p.jailed).length;
  if (jailedCount >= MAX_JAILED) return false;
  const targets = state.players.filter(p =>
    p.alive && p.id !== 0 && !p.jailed && p.role !== 'protector' &&
    dist(human, p) < ARREST_RANGE &&
    hasLineOfSight(human.x, human.y, p.x, p.y, state.doors)
  );
  if (targets.length > 0) {
    const target = targets.reduce((a, b) => dist(human, a) < dist(human, b) ? a : b);
    arrestPlayer(state, target, now);
    human.arrestCooldown = ARREST_COOLDOWN;
    return true;
  }
  return false;
}

export function getNearbyTask(state: GameState): number | null {
  const human = state.players[0];
  if (!human.alive || human.jailed || human.role === 'protector') return null;
  const nearby = state.taskStations.find(t => !t.completed && dist(human, t) < TASK_RANGE);
  return nearby ? nearby.id : null;
}

export function getNearbyDoor(state: GameState): number | null {
  const human = state.players[0];
  if (!human.alive || human.jailed) return null;
  if (human.role === 'protector') return null; // only crew & traitor use doors
  const door = state.doors.find(d => Math.hypot(d.cx - human.x, d.cy - human.y) < DOOR_INTERACT_RANGE);
  return door ? door.id : null;
}

export function toggleDoor(state: GameState, doorId: number, now: number): boolean {
  const door = state.doors.find(d => d.id === doorId);
  if (!door) return false;
  if (now - door.lastUsedAt < DOOR_USE_COOLDOWN) return false;
  door.open = !door.open;
  door.lastUsedAt = now;
  return true;
}
