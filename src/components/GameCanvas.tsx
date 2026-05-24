import { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, KILL_RANGE, ARREST_RANGE, MAX_JAILED, DOOR_USE_COOLDOWN } from '@/game/types';
import { updateGame, humanKill, humanArrest, getNearbyTask, getNearbyDoor, toggleDoor } from '@/game/engine';
import { generateTaskChallenge } from '@/game/tasks';
import { Renderer3D } from '@/game/renderer3d';
import TaskOverlay from './TaskOverlay';
import MobileControls from './MobileControls';
import { useIsMobileDevice, useIsPortrait } from '@/hooks/use-device';
import RotateDevicePrompt from './RotateDevicePrompt';
import DraggableExitButton from './DraggableExitButton';
import { ROOMS } from '@/game/collision';
import { MAP_WIDTH, MAP_HEIGHT } from '@/game/types';

interface Props {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  onExit?: () => void;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function GameCanvas({ gameState, setGameState, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const keysRef = useRef(new Set<string>());
  const stateRef = useRef(gameState);
  const animRef = useRef(0);
  const mobileDir = useRef({ x: 0, y: 0 });
  const yawRef = useRef(0); // radians; 0 = look toward +y (down the map)
  const lookTouchRef = useRef<{ id: number; x: number } | null>(null);
  const lastArrestEventRef = useRef(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [showTask, setShowTask] = useState(false);
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();
  const needsRotate = isMobile && isPortrait;

  stateRef.current = gameState;

  useEffect(() => {
    const resize = () => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // On mobile, request fullscreen on the first user interaction (browsers
  // require a user gesture). Also try to lock orientation to landscape.
  useEffect(() => {
    if (!isMobile) return;
    const goFullscreen = async () => {
      try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          await el.requestFullscreen();
        }
        const orient = (screen as any).orientation;
        if (orient && typeof orient.lock === 'function') {
          orient.lock('landscape').catch(() => {});
        }
      } catch {}
      window.removeEventListener('touchstart', goFullscreen);
      window.removeEventListener('click', goFullscreen);
    };
    window.addEventListener('touchstart', goFullscreen, { once: true });
    window.addEventListener('click', goFullscreen, { once: true });
    return () => {
      window.removeEventListener('touchstart', goFullscreen);
      window.removeEventListener('click', goFullscreen);
    };
  }, [isMobile]);

  const handleKey = useCallback((e: KeyboardEvent, down: boolean) => {
    // Desktop-only: ignore all keyboard input on mobile devices.
    if (isMobile) return;
    if (showTask) return;

    const key = e.key.toLowerCase();
    if (down) {
      keysRef.current.add(key);
      if (key === ' ' || key === 'space') {
        e.preventDefault();
        const now = performance.now();
        const s = stateRef.current;
        if (s.players[0].role === 'imposter') humanKill(s, now);
        else if (s.players[0].role === 'protector') humanArrest(s, now);
        else {
          const taskId = getNearbyTask(s);
          if (taskId !== null) {
            const station = s.taskStations.find(t => t.id === taskId);
            if (station) {
              const challenge = generateTaskChallenge(station);
              s.activeTask = challenge;
              s.players[0].doingTask = true;
              s.players[0].taskStationId = taskId;
              setShowTask(true);
              setGameState({ ...s });
            }
          }
        }
      }
      if (key === 'e') {
        e.preventDefault();
        const s = stateRef.current;
        // Door takes priority
        const doorId = getNearbyDoor(s);
        if (doorId !== null) {
          const door = s.doors.find(d => d.id === doorId)!;
          if (performance.now() - door.lastUsedAt >= DOOR_USE_COOLDOWN) {
            s.activeTask = {
              type: 'door', stationId: -1, prompt: door.open ? 'Close door' : 'Open door',
              answer: '', doorId, doorAction: door.open ? 'close' : 'open',
            };
            s.players[0].doingTask = true;
            setShowTask(true);
            setGameState({ ...s });
          }
          return;
        }
        const taskId = getNearbyTask(s);
        if (taskId !== null) {
          const station = s.taskStations.find(t => t.id === taskId);
          if (station) {
            const challenge = generateTaskChallenge(station);
            s.activeTask = challenge;
            s.players[0].doingTask = true;
            s.players[0].taskStationId = taskId;
            setShowTask(true);
            setGameState({ ...s });
          }
        }
      }
    } else {
      keysRef.current.delete(key);
    }
  }, [showTask, setGameState, isMobile]);

  useEffect(() => {
    // Only register keyboard listeners on desktop.
    if (isMobile) return;
    const kd = (e: KeyboardEvent) => handleKey(e, true);
    const ku = (e: KeyboardEvent) => handleKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [handleKey, isMobile]);

  // Desktop: pointer-lock for 360° mouse look.
  useEffect(() => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const SENS = 0.0025;
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      yawRef.current += e.movementX * SENS;
    };
    const onCanvasClick = () => {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    };
    document.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onCanvasClick);
    return () => {
      document.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onCanvasClick);
    };
  }, [isMobile]);

  // Mobile: right-side drag to rotate yaw 360°.
  useEffect(() => {
    if (!isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const SENS = 0.006;
    const onTS = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX > window.innerWidth / 2 && !lookTouchRef.current) {
          lookTouchRef.current = { id: t.identifier, x: t.clientX };
        }
      }
    };
    const onTM = (e: TouchEvent) => {
      if (!lookTouchRef.current) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === lookTouchRef.current.id) {
          const dx = t.clientX - lookTouchRef.current.x;
          yawRef.current += dx * SENS;
          lookTouchRef.current.x = t.clientX;
        }
      }
    };
    const onTE = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (lookTouchRef.current && t.identifier === lookTouchRef.current.id) {
          lookTouchRef.current = null;
        }
      }
    };
    canvas.addEventListener('touchstart', onTS, { passive: true });
    canvas.addEventListener('touchmove', onTM, { passive: true });
    canvas.addEventListener('touchend', onTE, { passive: true });
    canvas.addEventListener('touchcancel', onTE, { passive: true });
    return () => {
      canvas.removeEventListener('touchstart', onTS);
      canvas.removeEventListener('touchmove', onTM);
      canvas.removeEventListener('touchend', onTE);
      canvas.removeEventListener('touchcancel', onTE);
    };
  }, [isMobile]);

  useEffect(() => {
    let lastTime = performance.now();

    // Initialize 3D renderer once the canvas exists.
    const canvas = canvasRef.current;
    if (canvas && !rendererRef.current) {
      try {
        rendererRef.current = new Renderer3D(canvas);
        rendererRef.current.resize(size.w, size.h);
      } catch (e) {
        console.error('Failed to init 3D renderer', e);
      }
    } else if (rendererRef.current) {
      rendererRef.current.resize(size.w, size.h);
    }

    const loop = (time: number) => {
      const dt = Math.min(time - lastTime, 50);
      lastTime = time;

      // Reset human direction each frame; engine/joystick will refill it.
      const human = stateRef.current.players[0];
      if (human.alive && !human.doingTask) {
        if (isMobile) {
          // Mobile joystick: rotate vector by yaw so "up" on stick = forward.
          const sy = Math.sin(yawRef.current), cy = Math.cos(yawRef.current);
          const ix = mobileDir.current.x;
          // Joystick "up" returns negative dy; flip so up = forward.
          const iy = -mobileDir.current.y;
          human.direction = {
            x: sy * iy + cy * ix,
            y: cy * iy - sy * ix,
          };
        } else {
          human.direction = { x: 0, y: 0 };
        }
      }

      if (stateRef.current.phase === 'playing') {
        const newState = updateGame(stateRef.current, dt, keysRef.current, time, yawRef.current);
        stateRef.current = newState;
        setGameState(newState);

        // Arrest sound effect
        const ra = newState.recentArrest;
        if (ra && ra.eventId !== lastArrestEventRef.current) {
          lastArrestEventRef.current = ra.eventId;
          try {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AC) {
              const ctx = new AC();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = 'square';
              o.frequency.setValueAtTime(880, ctx.currentTime);
              o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
              g.gain.setValueAtTime(0.18, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              o.connect(g); g.connect(ctx.destination);
              o.start(); o.stop(ctx.currentTime + 0.4);
            }
          } catch {}
        }
      }

      if (rendererRef.current) {
        rendererRef.current.render(stateRef.current, yawRef.current);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, setGameState, isMobile]);

  const handleTaskComplete = useCallback(() => {
    const s = stateRef.current;
    if (s.activeTask && s.activeTask.type === 'door' && s.activeTask.doorId !== undefined) {
      toggleDoor(s, s.activeTask.doorId, performance.now());
    } else if (s.activeTask) {
      const station = s.taskStations.find(t => t.id === s.activeTask!.stationId);
      if (station && !station.completed) {
        station.completed = true;
        s.tasksCompleted++;
      }
    }
    s.players[0].doingTask = false;
    s.players[0].taskStationId = null;
    s.activeTask = null;
    setShowTask(false);
    setGameState({ ...s });
  }, [setGameState]);

  const handleTaskCancel = useCallback(() => {
    const s = stateRef.current;
    s.players[0].doingTask = false;
    s.players[0].taskStationId = null;
    s.activeTask = null;
    setShowTask(false);
    setGameState({ ...s });
  }, [setGameState]);

  const handleMobileMove = useCallback((dx: number, dy: number) => {
    mobileDir.current = { x: dx, y: dy };
  }, []);

  const handleMobileAction = useCallback(() => {
    const s = stateRef.current;
    const now = performance.now();
    if (s.players[0].role === 'imposter') {
      humanKill(s, now);
    } else if (s.players[0].role === 'protector') {
      humanArrest(s, now);
    } else if (s.players[0].role === 'crewmate') {
      // Door has priority
      const doorId = getNearbyDoor(s);
      if (doorId !== null) {
        const door = s.doors.find(d => d.id === doorId)!;
        if (performance.now() - door.lastUsedAt >= DOOR_USE_COOLDOWN) {
          s.activeTask = {
            type: 'door', stationId: -1, prompt: door.open ? 'Close door' : 'Open door',
            answer: '', doorId, doorAction: door.open ? 'close' : 'open',
          };
          s.players[0].doingTask = true;
          setShowTask(true);
          setGameState({ ...s });
          return;
        }
      }
      const taskId = getNearbyTask(s);
      if (taskId !== null) {
        const station = s.taskStations.find(t => t.id === taskId);
        if (station) {
          const challenge = generateTaskChallenge(station);
          s.activeTask = challenge;
          s.players[0].doingTask = true;
          s.players[0].taskStationId = taskId;
          setShowTask(true);
          setGameState({ ...s });
        }
      }
    }
  }, [setGameState]);

  // Determine action button state for mobile
  const human = gameState.players[0];
  let actionLabel = '';
  let canAction = false;
  if (human.role === 'imposter') {
    actionLabel = 'KILL';
    canAction = human.alive && !human.jailed && human.killCooldown <= 0 &&
      gameState.players.some(p => p.alive && p.id !== 0 && p.role === 'crewmate' && dist(human, p) < KILL_RANGE);
  } else if (human.role === 'protector') {
    actionLabel = 'ARREST';
    const jailedCount = gameState.players.filter(p => p.jailed).length;
    canAction = human.alive && !human.jailed && human.arrestCooldown <= 0 && jailedCount < MAX_JAILED &&
      gameState.players.some(p => p.alive && p.id !== 0 && !p.jailed && p.role !== 'protector' && dist(human, p) < ARREST_RANGE);
  } else {
    const doorId = getNearbyDoor(gameState);
    if (doorId !== null) {
      const door = gameState.doors.find(d => d.id === doorId)!;
      actionLabel = door.open ? 'CLOSE' : 'OPEN';
      canAction = (performance.now() - door.lastUsedAt) >= DOOR_USE_COOLDOWN;
    } else {
      actionLabel = 'TASK';
      canAction = getNearbyTask(gameState) !== null;
    }
  }

  // Minimap geometry
  const miniW = 180;
  const miniH = (miniW * MAP_HEIGHT) / MAP_WIDTH;
  const sx = (v: number) => (v / MAP_WIDTH) * miniW;
  const sy = (v: number) => (v / MAP_HEIGHT) * miniH;
  const aliveCrew = gameState.players.filter(p => p.alive && p.role === 'crewmate').length;
  const totalCrew = gameState.players.filter(p => p.role === 'crewmate').length;
  const showTaskMarkers = human.role === 'crewmate';

  return (
    <>
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        className="block"
        style={{ cursor: isMobile ? 'none' : 'default', touchAction: 'none' }}
        onClick={() => {
          if (isMobile) return;
          const s = stateRef.current;
          const now = performance.now();
          if (s.players[0].role === 'imposter') humanKill(s, now);
          else if (s.players[0].role === 'protector') humanArrest(s, now);
        }}
      />
      {gameState.phase === 'playing' && (
        <>
          {/* Crew-left bar (top-left) */}
          <div className="fixed top-3 left-3 z-40 pointer-events-none flex flex-col gap-1.5">
            <div className="bg-black/65 border border-white/15 rounded-md px-3 py-1.5 font-mono text-xs text-white shadow-lg">
              <div className="flex items-center gap-2">
                <span className="text-blue-300">CREW</span>
                <span className="font-bold">{aliveCrew}/{totalCrew}</span>
              </div>
              <div className="w-32 h-1.5 mt-1 bg-white/15 rounded">
                <div
                  className="h-full bg-blue-400 rounded transition-all"
                  style={{ width: `${(aliveCrew / Math.max(1, totalCrew)) * 100}%` }}
                />
              </div>
            </div>
            <div className="bg-black/65 border border-white/15 rounded-md px-3 py-1.5 font-mono text-xs text-white shadow-lg">
              <div className="flex items-center gap-2">
                <span className="text-yellow-300">TASKS</span>
                <span className="font-bold">{gameState.tasksCompleted}/{gameState.totalTasks}</span>
              </div>
              <div className="w-32 h-1.5 mt-1 bg-white/15 rounded">
                <div
                  className="h-full bg-yellow-400 rounded transition-all"
                  style={{ width: `${(gameState.tasksCompleted / gameState.totalTasks) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Mini-map (top-right) */}
          <div
            className="fixed top-3 right-3 z-40 pointer-events-none bg-black/70 border border-white/20 rounded-md p-1.5 shadow-lg"
            style={{ width: miniW + 12 }}
          >
            <svg width={miniW} height={miniH} style={{ display: 'block' }}>
              <rect x={0} y={0} width={miniW} height={miniH} fill="#0e1014" />
              {/* Rooms */}
              {ROOMS.map(r => (
                <rect
                  key={r.label}
                  x={sx(r.x)}
                  y={sy(r.y)}
                  width={sx(r.w)}
                  height={sy(r.h)}
                  fill="#6b7280"
                  stroke="#000"
                  strokeWidth={0.8}
                />
              ))}
              {/* Tasks (yellow !) for crew */}
              {showTaskMarkers && gameState.taskStations.filter(t => !t.completed).map(t => (
                <g key={t.id} transform={`translate(${sx(t.x)},${sy(t.y)})`}>
                  <circle r={4.5} fill="#facc15" stroke="#7a4d00" strokeWidth={0.5} />
                  <text
                    textAnchor="middle"
                    y={2}
                    fontSize={7}
                    fontWeight="bold"
                    fill="#1a1305"
                    fontFamily="monospace"
                  >!</text>
                </g>
              ))}
              {/* Human player */}
              <circle
                cx={sx(human.x)}
                cy={sy(human.y)}
                r={3.5}
                fill={human.role === 'protector' ? '#3dba6f' : human.role === 'imposter' ? '#e03030' : '#4a90d9'}
                stroke="#fff"
                strokeWidth={1}
              />
              {/* Facing indicator */}
              <line
                x1={sx(human.x)}
                y1={sy(human.y)}
                x2={sx(human.x) + Math.sin(yawRef.current) * 9}
                y2={sy(human.y) + Math.cos(yawRef.current) * 9}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </svg>
          </div>
        </>
      )}
      {showTask && gameState.activeTask && (
        <TaskOverlay
          task={gameState.activeTask}
          onComplete={handleTaskComplete}
          onCancel={handleTaskCancel}
        />
      )}
      {isMobile && !showTask && gameState.phase === 'playing' && (
        <MobileControls
          role={human.role}
          canAction={canAction}
          actionLabel={actionLabel}
          onMove={handleMobileMove}
          onAction={handleMobileAction}
        />
      )}
      {needsRotate && <RotateDevicePrompt />}
      {onExit && <DraggableExitButton onExit={onExit} />}
    </>
  );
}
