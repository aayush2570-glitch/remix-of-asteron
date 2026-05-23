import { GameState, Player, PLAYER_RADIUS, TASK_RANGE, FreezeProjectile, JAIL_RECT, JAIL_DURATION, DOOR_INTERACT_RANGE } from './types';
import { ROOM_WALLS, OBSTACLES, ROOMS } from './collision';
import crewA from '@/assets/char-crew-a.png';
import crewB from '@/assets/char-crew-b.png';
import protA from '@/assets/char-protector-a.png';
import protB from '@/assets/char-protector-b.png';
import traitorA from '@/assets/char-traitor-a.png';
import traitorB from '@/assets/char-traitor-b.png';

const SPRITES: Record<string, HTMLImageElement> = {};
function loadSprite(key: string, src: string) {
  const img = new Image();
  img.src = src;
  SPRITES[key] = img;
}
loadSprite('crew_a', crewA);
loadSprite('crew_b', crewB);
loadSprite('protector_a', protA);
loadSprite('protector_b', protB);
loadSprite('traitor_a', traitorA);
loadSprite('traitor_b', traitorB);

// Per-player facing memory (renderer-local, no engine impact)
const FACING: Map<number, number> = new Map();

const FROZEN_COLOR = '#40d8f0';
let animTime = 0;

// Vision radii per role
const VISION_RADIUS: Record<string, number> = {
  crewmate: 220,
  protector: 170,
  imposter: 120,
};

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number
) {
  const human = state.players[0];
  const camX = Math.max(0, Math.min(state.mapWidth - canvasW, human.x - canvasW / 2));
  const camY = Math.max(0, Math.min(state.mapHeight - canvasH, human.y - canvasH / 2));

  ctx.save();
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Fill entire canvas black first (fog base)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.translate(-camX, -camY);

  animTime = performance.now();

  drawMarsSurface(ctx, state.mapWidth, state.mapHeight);
  drawJailRoom(ctx);
  drawTaskStations(ctx, state);
  drawDoors(ctx, state);

  for (const p of state.players) {
    if (!p.alive) drawDeadPlayer(ctx, p);
  }
  for (const p of state.players) {
    if (p.alive) drawPlayer(ctx, p, human);
  }

  // Bot door-interaction progress rings
  for (const p of state.players) {
    if (!p.alive || p.isHuman || !p.doorBusyUntil) continue;
    const door = state.doors.find(d => d.id === p.doorBusyId);
    if (!door) continue;
    const remaining = Math.max(0, p.doorBusyUntil - performance.now());
    const progress = 1 - remaining / 3000;
    ctx.beginPath();
    ctx.arc(door.cx, door.cy, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Draw projectiles
  drawProjectiles(ctx, state.projectiles);

  ctx.restore();

  // Draw fog of war overlay
  const visionR = VISION_RADIUS[human.role] || 270;
  const screenX = human.x - camX;
  const screenY = human.y - camY;

  // Create radial gradient mask: clear center -> dark edges
  const fogGrad = ctx.createRadialGradient(screenX, screenY, visionR * 0.5, screenX, screenY, visionR);
  fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
  fogGrad.addColorStop(0.7, 'rgba(0,0,0,0.3)');
  fogGrad.addColorStop(1, 'rgba(0,0,0,0.92)');

  ctx.save();
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Hard fog outside vision radius
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  ctx.arc(screenX, screenY, visionR, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fill();
  ctx.restore();

  drawHUD(ctx, state, canvasW, canvasH);
}

/* ==================== DOORS ==================== */
function drawDoors(ctx: CanvasRenderingContext2D, state: GameState) {
  const human = state.players[0];
  for (const d of state.doors) {
    const cx = d.cx, cy = d.cy;
    const horizontal = d.y1 === d.y2;
    const w = Math.abs(d.x2 - d.x1);
    const h = Math.abs(d.y2 - d.y1);
    const thickness = 12;

    if (d.open) {
      // Open: glowing dashed slot, passable
      ctx.save();
      ctx.strokeStyle = '#3dba6f';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else {
      // Closed: solid metallic door
      ctx.save();
      if (horizontal) {
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(d.x1, cy - thickness / 2, w, thickness);
        ctx.strokeStyle = '#1a0a05';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x1, cy - thickness / 2, w, thickness);
        ctx.fillStyle = '#cc8860';
        ctx.fillRect(d.x1 + w / 2 - 4, cy - 2, 8, 4);
      } else {
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(cx - thickness / 2, d.y1, thickness, h);
        ctx.strokeStyle = '#1a0a05';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - thickness / 2, d.y1, thickness, h);
        ctx.fillStyle = '#cc8860';
        ctx.fillRect(cx - 2, d.y1 + h / 2 - 4, 4, 8);
      }
      ctx.restore();
    }

    // Interaction prompt
    const near = Math.hypot(human.x - cx, human.y - cy) < DOOR_INTERACT_RANGE;
    if (near && human.alive && !human.jailed && human.role !== 'protector') {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.open ? '[E] CLOSE' : '[E] OPEN', cx, cy - 18);
    }
  }
}

/* ==================== MAP DRAWING ==================== */

function drawMarsSurface(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Mars soil background
  const grad = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w);
  grad.addColorStop(0, '#c4622a');
  grad.addColorStop(0.5, '#a0451e');
  grad.addColorStop(1, '#7a3015');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle terrain texture dots
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  const seed = 42;
  for (let i = 0; i < 300; i++) {
    const rx = ((seed * (i + 1) * 7919) % w);
    const ry = ((seed * (i + 1) * 6271) % h);
    const rr = ((seed * (i + 1) * 3571) % 8) + 2;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw rooms
  for (const room of ROOMS) {
    // Room floor (darker)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(room.x, room.y, room.w, room.h);

    // Floor grid lines
    ctx.strokeStyle = 'rgba(80,80,80,0.3)';
    ctx.lineWidth = 1;
    for (let gx = room.x + 40; gx < room.x + room.w; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, room.y);
      ctx.lineTo(gx, room.y + room.h);
      ctx.stroke();
    }
    for (let gy = room.y + 40; gy < room.y + room.h; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(room.x, gy);
      ctx.lineTo(room.x + room.w, gy);
      ctx.stroke();
    }

    // Room label
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(room.label, room.x + room.w / 2, room.y + room.h / 2 + 10);

    // Room-specific decorations
    if (room.label === 'RESEARCH') drawResearchDecor(ctx, room);
    else if (room.label === 'ECOSYSTEM') drawEcosystemDecor(ctx, room);
    else if (room.label === 'RECOVER') drawRecoverDecor(ctx, room);
  }

  // Draw walls (thick black)
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const wall of ROOM_WALLS) {
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();
  }

  // Door indicators (small green markers)
  ctx.fillStyle = '#3dba6f';
  // Research door (bottom center)
  ctx.fillRect(775, 336, 50, 8);
  // Ecosystem door (right center)
  ctx.fillRect(386, 600, 8, 50);
  // Recover door (left center)
  ctx.fillRect(1206, 600, 8, 50);

  // Draw rock obstacles
  for (const obs of OBSTACLES) {
    // Rock shadow
    ctx.beginPath();
    ctx.ellipse(obs.x + 3, obs.y + 5, obs.r, obs.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Rock body
    ctx.beginPath();
    ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
    const rockGrad = ctx.createRadialGradient(obs.x - obs.r * 0.3, obs.y - obs.r * 0.3, 2, obs.x, obs.y, obs.r);
    rockGrad.addColorStop(0, '#8a7060');
    rockGrad.addColorStop(1, '#4a3525');
    ctx.fillStyle = rockGrad;
    ctx.fill();
    ctx.strokeStyle = '#3a2515';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rock highlight
    ctx.beginPath();
    ctx.arc(obs.x - obs.r * 0.25, obs.y - obs.r * 0.25, obs.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
  }

  // Small decorative craters
  const craters = [
    { x: 450, y: 420, r: 18 },
    { x: 1000, y: 850, r: 22 },
    { x: 300, y: 1050, r: 15 },
    { x: 1350, y: 1050, r: 20 },
    { x: 750, y: 1100, r: 12 },
  ];
  for (const c of craters) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Rim highlight
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 2, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.strokeStyle = 'rgba(255,200,150,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Map border
  ctx.strokeStyle = '#3a1a0a';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, w, h);
}

/* ==================== ROOM DECORATIONS ==================== */

function drawResearchDecor(ctx: CanvasRenderingContext2D, room: { x: number; y: number; w: number; h: number }) {
  const rx = room.x, ry = room.y;

  // Lab table (top-left)
  ctx.fillStyle = 'rgba(100,110,130,0.4)';
  ctx.fillRect(rx + 30, ry + 40, 80, 35);
  ctx.strokeStyle = 'rgba(140,150,170,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 30, ry + 40, 80, 35);

  // Monitor on table
  ctx.fillStyle = 'rgba(60,180,220,0.25)';
  ctx.fillRect(rx + 50, ry + 45, 30, 20);
  ctx.fillStyle = 'rgba(60,180,220,0.15)';
  ctx.fillRect(rx + 62, ry + 65, 6, 8);

  // Lab table (right side)
  ctx.fillStyle = 'rgba(100,110,130,0.4)';
  ctx.fillRect(rx + room.w - 120, ry + 50, 90, 30);
  ctx.strokeStyle = 'rgba(140,150,170,0.3)';
  ctx.strokeRect(rx + room.w - 120, ry + 50, 90, 30);

  // Beakers on right table
  ctx.fillStyle = 'rgba(100,220,160,0.2)';
  ctx.fillRect(rx + room.w - 105, ry + 52, 10, 22);
  ctx.fillStyle = 'rgba(220,160,80,0.2)';
  ctx.fillRect(rx + room.w - 85, ry + 55, 10, 19);

  // Floor device (center-bottom area)
  ctx.fillStyle = 'rgba(80,90,110,0.35)';
  ctx.beginPath();
  ctx.arc(rx + room.w / 2, ry + room.h - 80, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,180,220,0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner ring
  ctx.beginPath();
  ctx.arc(rx + room.w / 2, ry + room.h - 80, 10, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(60,180,220,0.15)';
  ctx.fill();
}

function drawEcosystemDecor(ctx: CanvasRenderingContext2D, room: { x: number; y: number; w: number; h: number }) {
  const rx = room.x, ry = room.y;

  // Green patches (garden beds)
  ctx.fillStyle = 'rgba(50,140,60,0.2)';
  ctx.fillRect(rx + 25, ry + 30, 100, 60);
  ctx.fillStyle = 'rgba(40,120,50,0.15)';
  ctx.fillRect(rx + 25, ry + 30, 100, 60);
  ctx.strokeStyle = 'rgba(60,160,70,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 25, ry + 30, 100, 60);

  // Simple plant shapes (small circles as bushes)
  const plants = [
    { x: rx + 50, y: ry + 50 }, { x: rx + 80, y: ry + 55 },
    { x: rx + 100, y: ry + 48 }, { x: rx + 65, y: ry + 70 },
  ];
  for (const p of plants) {
    ctx.fillStyle = 'rgba(60,170,70,0.3)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(80,200,90,0.2)';
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Second garden bed (bottom-right)
  ctx.fillStyle = 'rgba(50,140,60,0.2)';
  ctx.fillRect(rx + room.w - 140, ry + room.h - 100, 110, 65);
  ctx.strokeStyle = 'rgba(60,160,70,0.2)';
  ctx.strokeRect(rx + room.w - 140, ry + room.h - 100, 110, 65);

  // Tree-like shapes
  const trees = [
    { x: rx + room.w - 110, y: ry + room.h - 75 },
    { x: rx + room.w - 70, y: ry + room.h - 70 },
  ];
  for (const t of trees) {
    // Trunk
    ctx.fillStyle = 'rgba(100,70,40,0.25)';
    ctx.fillRect(t.x - 3, t.y, 6, 15);
    // Canopy
    ctx.fillStyle = 'rgba(50,160,60,0.3)';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Water feature (small blue pool)
  ctx.fillStyle = 'rgba(40,120,200,0.15)';
  ctx.beginPath();
  ctx.ellipse(rx + room.w / 2, ry + room.h / 2 + 30, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,150,220,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRecoverDecor(ctx: CanvasRenderingContext2D, room: { x: number; y: number; w: number; h: number }) {
  const rx = room.x, ry = room.y;

  // Hospital beds (simple rectangles with headboards)
  const beds = [
    { x: rx + 30, y: ry + 40 },
    { x: rx + 30, y: ry + 130 },
    { x: rx + 30, y: ry + 220 },
  ];
  for (const b of beds) {
    // Bed frame
    ctx.fillStyle = 'rgba(90,100,120,0.35)';
    ctx.fillRect(b.x, b.y, 70, 35);
    ctx.strokeStyle = 'rgba(120,130,150,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, 70, 35);
    // Pillow
    ctx.fillStyle = 'rgba(200,200,220,0.15)';
    ctx.fillRect(b.x + 2, b.y + 5, 18, 25);
    // Blanket
    ctx.fillStyle = 'rgba(80,140,200,0.12)';
    ctx.fillRect(b.x + 22, b.y + 3, 45, 29);
  }

  // Energy panel / battery (right side)
  ctx.fillStyle = 'rgba(80,90,110,0.35)';
  ctx.fillRect(rx + room.w - 90, ry + 60, 55, 80);
  ctx.strokeStyle = 'rgba(100,200,100,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + room.w - 90, ry + 60, 55, 80);
  // Battery bars
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(80,200,100,${0.15 + i * 0.05})`;
    ctx.fillRect(rx + room.w - 82, ry + 122 - i * 16, 39, 12);
  }

  // Medical cross symbol (bottom area)
  ctx.fillStyle = 'rgba(220,60,60,0.2)';
  const cx = rx + room.w / 2 + 40, cy = ry + room.h - 60;
  ctx.fillRect(cx - 4, cy - 14, 8, 28);
  ctx.fillRect(cx - 14, cy - 4, 28, 8);
}

/* ==================== TASK STATIONS ==================== */

function drawTaskStations(ctx: CanvasRenderingContext2D, state: GameState) {
  const human = state.players[0];

  for (const station of state.taskStations) {
    const completed = station.completed;
    const nearby = !completed && Math.sqrt((human.x - station.x) ** 2 + (human.y - station.y) ** 2) < TASK_RANGE;

    ctx.beginPath();
    ctx.arc(station.x, station.y, 25, 0, Math.PI * 2);
    ctx.fillStyle = completed ? 'rgba(61, 186, 111, 0.3)' : 'rgba(74, 144, 217, 0.3)';
    ctx.fill();
    ctx.strokeStyle = completed ? '#3dba6f' : (nearby ? '#ffd700' : '#4a90d9');
    ctx.lineWidth = nearby ? 3 : 2;
    ctx.setLineDash(completed ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = completed ? '#3dba6f' : '#4a90d9';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    const icons: Record<string, string> = { 'Calculate': '🧮', 'Adj. Temp': '🌡️', 'Send Email': '📧', 'Scan Data': '📡' };
    ctx.fillText(completed ? '✓' : (icons[station.label] || '📋'), station.x, station.y + 5);

    ctx.fillStyle = completed ? '#3dba6f' : '#cc8860';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(completed ? 'DONE' : station.label, station.x, station.y + 22);

    if (nearby && human.role === 'crewmate' && human.alive && !human.frozen && !human.doingTask) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('[SPACE] USE', station.x, station.y - 30);
    }

    const aiWorker = state.players.find(p => p.doingTask && p.taskStationId === station.id && !p.isHuman);
    if (aiWorker) {
      ctx.fillStyle = 'rgba(74, 144, 217, 0.5)';
      ctx.fillRect(station.x - 20, station.y + 28, 40, 5);
      ctx.fillStyle = '#4a90d9';
      ctx.fillRect(station.x - 20, station.y + 28, 40 * aiWorker.taskProgress, 5);
    }
  }
}

/* ==================== PLAYER DRAWING ==================== */

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, human: Player) {
  const x = p.x;
  const s = 1.0;
  const isMoving = Math.abs(p.direction.x) > 0.1 || Math.abs(p.direction.y) > 0.1;
  // Constant gentle floating for all (since char is "floating")
  const floatBob = Math.sin(animTime * 0.003 + p.id * 1.3) * 2.5;
  const moveBob = isMoving && !p.doingTask ? Math.sin(animTime * 0.012 + p.id * 2) * 1.5 : 0;
  const y = p.y + floatBob + moveBob;

  // Facing locks to last clear horizontal movement.
  // Stays the same until the player moves the OPPOSITE direction.
  let facing = FACING.get(p.id) ?? 1;
  if (isMoving && Math.abs(p.direction.x) > 0.5) {
    const newFacing = p.direction.x > 0 ? 1 : -1;
    if (newFacing !== facing) facing = newFacing;
  }
  FACING.set(p.id, facing);

  // Tilt in direction of movement
  const tilt = isMoving && !p.doingTask ? p.direction.x * 0.18 : 0;

  if (p.frozen) {
    ctx.beginPath();
    ctx.arc(x, p.y, 28 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(64, 216, 240, 0.2)';
    ctx.fill();
    ctx.strokeStyle = FROZEN_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (p.doingTask) {
    ctx.beginPath();
    ctx.arc(x, y - 5 * s, 26 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.taskProgress);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Soft shadow on ground (uses real p.y so it doesn't bob)
  ctx.beginPath();
  ctx.ellipse(x, p.y + 22, 14, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // Hidden identity: imposter and crewmate look identical to all players.
  let role: 'crew' | 'protector' | 'traitor' = 'crew';
  if (p.role === 'protector') role = 'protector';
  else if (p.role === 'imposter' && p.isHuman) role = 'traitor';

  // Use a single sprite frame — alternating frames was perceived as a face-flip.
  const spriteKey = `${role === 'crew' ? 'crew' : role === 'protector' ? 'protector' : 'traitor'}_a`;
  const img = SPRITES[spriteKey];

  const size = 52 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(facing, 1);
  if (p.frozen) ctx.globalAlpha = 0.7;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    // Fallback circle while sprite loads
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fillStyle = role === 'protector' ? '#3dba6f' : role === 'traitor' ? '#e03030' : '#4a90d9';
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = '#ddd';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(p.name, x, y - 32 * s);

  if (p.isHuman) {
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('▼ YOU', x, y - 40 * s);
  }
}

/* ==================== PROJECTILES ==================== */

function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: FreezeProjectile[]) {
  const now = performance.now();
  for (const proj of projectiles) {
    const t = Math.min(1, (now - proj.startTime) / proj.duration);
    const px = proj.x + (proj.targetX - proj.x) * t;
    const py = proj.y + (proj.targetY - proj.y) * t;

    // Glow trail
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(64, 216, 240, 0.3)';
    ctx.fill();

    // Core bullet
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#40d8f0';
    ctx.fill();

    // Small sparkle
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

function drawCrewmateChar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, frozen: boolean) {
  const bodyColor = frozen ? FROZEN_COLOR : '#e8e8e8';
  const accentColor = frozen ? '#80e8f8' : '#4a90d9';
  const outlineColor = frozen ? '#6ac8d8' : '#888';

  // Body - egg/oval shape (white)
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 15 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ear flaps (left and right)
  ctx.beginPath();
  ctx.ellipse(x - 14 * s, y + 2 * s, 5 * s, 10 * s, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x + 14 * s, y + 2 * s, 5 * s, 10 * s, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Helmet dome (top)
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 13 * s, Math.PI, 0);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor (dark dome with cyan tint)
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#1a3a4a' : '#1a2a3a';
  ctx.fill();
  ctx.strokeStyle = frozen ? '#4ac8d8' : '#3a5a7a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ^^ Eyes (cyan chevrons)
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  // Left ^
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 6 * s);
  ctx.lineTo(x - 4 * s, y - 11 * s);
  ctx.lineTo(x - 1 * s, y - 6 * s);
  ctx.stroke();
  // Right ^
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 6 * s);
  ctx.lineTo(x + 4 * s, y - 11 * s);
  ctx.lineTo(x + 7 * s, y - 6 * s);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Collar ring (white band between head and body)
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 13 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#b0e8f0' : '#d0d0d0';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Left arm antenna with blue orb
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y + 8 * s);
  ctx.lineTo(x - 16 * s, y + 20 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Blue orb
  ctx.beginPath();
  ctx.arc(x - 16 * s, y + 22 * s, 5 * s, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = frozen ? '#5ab8d0' : '#3a70b0';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Orb glow
  ctx.beginPath();
  ctx.arc(x - 16 * s, y + 22 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(64,216,240,0.2)' : 'rgba(74,144,217,0.25)';
  ctx.fill();
  // Orb shine
  ctx.beginPath();
  ctx.arc(x - 18 * s, y + 20 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function drawImposterChar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, frozen: boolean) {
  const bodyColor = frozen ? FROZEN_COLOR : '#777';
  const darkBody = frozen ? '#6ac8d8' : '#555';
  const accentColor = frozen ? '#80e8f8' : '#e03030';
  const outlineColor = frozen ? '#5ab8c8' : '#444';

  // Knife arms (behind body) - angular dark blades
  ctx.save();
  // Left knife arm
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y + 2 * s);
  ctx.lineTo(x - 24 * s, y - 10 * s);
  ctx.lineTo(x - 22 * s, y - 16 * s);
  ctx.lineTo(x - 18 * s, y - 12 * s);
  ctx.closePath();
  ctx.fillStyle = frozen ? '#5ab8c8' : '#3a3a3a';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Right knife arm
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y + 2 * s);
  ctx.lineTo(x + 24 * s, y - 10 * s);
  ctx.lineTo(x + 22 * s, y - 16 * s);
  ctx.lineTo(x + 18 * s, y - 12 * s);
  ctx.closePath();
  ctx.fillStyle = frozen ? '#5ab8c8' : '#3a3a3a';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Body - slightly wider egg (dark gray)
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 16 * s, 19 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Helmet dome (darker gray)
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 14 * s, Math.PI, 0);
  ctx.fillStyle = darkBody;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor (very dark)
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // XX Eyes (red X marks) - like bow-tie shapes
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  // Left X
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 11 * s);
  ctx.lineTo(x - 2 * s, y - 6 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 2 * s, y - 11 * s);
  ctx.lineTo(x - 7 * s, y - 6 * s);
  ctx.stroke();
  // Right X
  ctx.beginPath();
  ctx.moveTo(x + 2 * s, y - 11 * s);
  ctx.lineTo(x + 7 * s, y - 6 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 7 * s, y - 11 * s);
  ctx.lineTo(x + 2 * s, y - 6 * s);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Collar ring (gray)
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#90d8e8' : '#999';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Center antenna with red orb (below body)
  ctx.beginPath();
  ctx.moveTo(x, y + 14 * s);
  ctx.lineTo(x, y + 24 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Red orb
  ctx.beginPath();
  ctx.arc(x, y + 26 * s, 5 * s, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = frozen ? '#5ab8c8' : '#a02020';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Orb glow
  ctx.beginPath();
  ctx.arc(x, y + 26 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(64,216,240,0.2)' : 'rgba(224,48,48,0.25)';
  ctx.fill();
  // Orb shine
  ctx.beginPath();
  ctx.arc(x - 2 * s, y + 24 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

function drawProtectorChar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, frozen: boolean) {
  const bodyColor = frozen ? FROZEN_COLOR : '#e8e8e8';
  const accentColor = frozen ? '#80e8f8' : '#3dba6f';
  const outlineColor = frozen ? '#6ac8d8' : '#888';

  // Body - egg/oval (white)
  ctx.beginPath();
  ctx.ellipse(x, y + 4 * s, 15 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Helmet dome (white, slightly taller)
  ctx.beginPath();
  ctx.arc(x, y - 11 * s, 14 * s, Math.PI, 0);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Visor (dark with green tint)
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#1a3a3a' : '#0a2a1a';
  ctx.fill();
  ctx.strokeStyle = frozen ? '#4ac8a8' : '#2a5a3a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Diamond eyes (green, filled)
  ctx.fillStyle = accentColor;
  // Left diamond
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y - 8 * s);
  ctx.lineTo(x - 3 * s, y - 12 * s);
  ctx.lineTo(x - 1 * s, y - 8 * s);
  ctx.lineTo(x - 3 * s, y - 5 * s);
  ctx.closePath();
  ctx.fill();
  // Right diamond
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 8 * s);
  ctx.lineTo(x + 3 * s, y - 12 * s);
  ctx.lineTo(x + 5 * s, y - 8 * s);
  ctx.lineTo(x + 3 * s, y - 5 * s);
  ctx.closePath();
  ctx.fill();
  // Eye glow
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * s, 8 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(61,186,111,0.12)';
  ctx.fill();

  // Collar ring
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 13 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? '#b0e8f0' : '#d0d0d0';
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Solar panel device (right side)
  ctx.fillStyle = frozen ? '#5ab8c8' : '#444';
  ctx.fillRect(x + 14 * s, y - 8 * s, 7 * s, 14 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 14 * s, y - 8 * s, 7 * s, 14 * s);
  // Panel cells (green bars)
  ctx.fillStyle = accentColor;
  ctx.fillRect(x + 15.5 * s, y - 6 * s, 4 * s, 3 * s);
  ctx.fillRect(x + 15.5 * s, y - 1.5 * s, 4 * s, 3 * s);
  ctx.fillRect(x + 15.5 * s, y + 3 * s, 4 * s, 2 * s);

  // Right arm antenna with green orb
  ctx.beginPath();
  ctx.moveTo(x + 8 * s, y + 10 * s);
  ctx.lineTo(x + 14 * s, y + 20 * s);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Green orb
  ctx.beginPath();
  ctx.arc(x + 14 * s, y + 22 * s, 5 * s, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
  ctx.strokeStyle = frozen ? '#5ab8c8' : '#2a8a4f';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Orb glow
  ctx.beginPath();
  ctx.arc(x + 14 * s, y + 22 * s, 7 * s, 0, Math.PI * 2);
  ctx.fillStyle = frozen ? 'rgba(64,216,240,0.2)' : 'rgba(61,186,111,0.25)';
  ctx.fill();
  // Orb shine
  ctx.beginPath();
  ctx.arc(x + 12 * s, y + 20 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

function drawDeadPlayer(ctx: CanvasRenderingContext2D, p: Player) {
  const x = p.x;
  const y = p.y;
  const s = 1.0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 2);
  ctx.globalAlpha = 0.5;

  ctx.beginPath();
  ctx.ellipse(0, 0, 16 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#666';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-6 * s, 0, 7 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.strokeStyle = '#e03030';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8 * s, -2 * s);
  ctx.lineTo(-4 * s, 2 * s);
  ctx.moveTo(-6 * s, -3 * s);
  ctx.lineTo(-3 * s, 0);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.fillStyle = '#ff4444';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('☠', x, y - 18 * s);
}

/* ==================== HUD ==================== */

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number) {
  const human = state.players[0];
  const aliveCrew = state.players.filter(p => p.alive && p.role === 'crewmate').length;
  const aliveImposters = state.players.filter(p => p.alive && p.role === 'imposter').length;

  ctx.fillStyle = 'rgba(10, 5, 3, 0.85)';
  ctx.fillRect(0, 0, w, 55);
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 55); ctx.lineTo(w, 55); ctx.stroke();

  ctx.fillStyle = '#cc8860';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  const roleDisplay = human.role === 'imposter' ? 'TRAITOR' : human.role.toUpperCase();
  ctx.fillText(`Role: ${roleDisplay}`, 15, 20);
  ctx.fillText(`Crew: ${aliveCrew} | Traitors: ${aliveImposters}`, 15, 40);

  const barW = 200;
  const barH = 14;
  const barX = w / 2 - barW / 2;
  const barY = 8;
  ctx.fillStyle = 'rgba(40, 20, 10, 0.8)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#3dba6f';
  ctx.fillRect(barX, barY, barW * (state.tasksCompleted / state.totalTasks), barH);
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`TASKS: ${state.tasksCompleted}/${state.totalTasks}`, w / 2, barY + 11);

  const time = Math.floor(state.timeElapsed / 1000);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cc8860';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`Time: ${time}s`, w - 15, 20);

  if (!human.alive) {
    ctx.fillStyle = '#ff3333';
    ctx.fillText('☠ DEAD - Spectating', w - 15, 40);
  } else if (human.jailed) {
    const remaining = Math.max(0, Math.ceil((human.jailedUntil - performance.now()) / 1000));
    ctx.fillStyle = '#ffaa33';
    ctx.fillText(`⛓ JAILED ${remaining}s`, w - 15, 40);
  }

  if (human.alive && !human.jailed) {
    ctx.textAlign = 'center';
    if (human.role === 'imposter') {
      const ready = human.killCooldown <= 0;
      ctx.fillStyle = ready ? '#ff4444' : '#664444';
      ctx.fillText(ready ? '[SPACE] KILL' : `Kill: ${Math.ceil(human.killCooldown / 1000)}s`, w / 2, 48);
    } else if (human.role === 'protector') {
      const ready = human.arrestCooldown <= 0;
      ctx.fillStyle = ready ? '#3dba6f' : '#446644';
      ctx.fillText(ready ? '[SPACE] ARREST' : `Arrest: ${Math.ceil(human.arrestCooldown / 1000)}s`, w / 2, 48);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText('[SPACE/E] Do Tasks | Stay Alive!', w / 2, 48);
    }
  }

  // Arrest notification banner (top center under HUD)
  if (state.recentArrest) {
    const age = performance.now() - state.recentArrest.time;
    if (age < 3000) {
      const alpha = age < 2500 ? 1 : 1 - (age - 2500) / 500;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255,170,51,0.9)';
      ctx.fillRect(w / 2 - 180, 60, 360, 30);
      ctx.fillStyle = '#1a0a00';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`⛓ ${state.recentArrest.name} HAS BEEN ARRESTED`, w / 2, 80);
      ctx.restore();
    }
  }

  ctx.fillStyle = 'rgba(10, 5, 3, 0.7)';
  ctx.fillRect(0, h - 30, w, 30);
  ctx.fillStyle = '#886644';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WASD/Arrows: Move | SPACE: Action', w / 2, h - 10);
}

/* ==================== JAIL ROOM ==================== */

function drawJailRoom(ctx: CanvasRenderingContext2D) {
  const r = JAIL_RECT;
  // Floor
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Glow boundary
  ctx.save();
  ctx.shadowColor = '#ffaa33';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = '#ffaa33';
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  // Bars (vertical)
  ctx.strokeStyle = 'rgba(200,140,40,0.55)';
  ctx.lineWidth = 3;
  for (let bx = r.x + 20; bx < r.x + r.w; bx += 24) {
    ctx.beginPath();
    ctx.moveTo(bx, r.y);
    ctx.lineTo(bx, r.y + r.h);
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = 'rgba(255,170,51,0.7)';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('JAIL', r.x + r.w / 2, r.y + 28);
}
