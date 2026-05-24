import { useState, useCallback, useEffect } from 'react';
import { GameState, Role } from '@/game/types';
import { createGame } from '@/game/engine';
import GameCanvas from '@/components/GameCanvas';
import LobbyScreen from '@/components/LobbyScreen';
import GameOverScreen from '@/components/GameOverScreen';
import LoadingScreen from '@/components/LoadingScreen';
export default function Index() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState<string>('Astro');
  const [draftName, setDraftName] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('mb_username');
    const name = stored && stored.trim() ? stored : 'Astro';
    setUsername(name);
    setDraftName(name);
  }, []);

  const handleSaveName = useCallback(() => {
    const name = draftName.trim() || 'Astro';
    localStorage.setItem('mb_username', name);
    setUsername(name);
    setDraftName(name);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 1500);
  }, [draftName]);

  const handleStart = useCallback((role: Role) => {
    setLoading(true);
    setTimeout(() => {
      setGameState(createGame(role, username));
      setLoading(false);
    }, 2500);
  }, [username]);

  const handleRestart = useCallback(() => {
    setGameState(null);
  }, []);

  if (loading) return <LoadingScreen />;
  if (!gameState) return (
    <>
      <div className="fixed top-3 left-3 z-[60] flex items-center gap-2 p-2 rounded-lg bg-blue-600/90 border border-blue-400 backdrop-blur-sm max-w-[280px] shadow-lg shadow-blue-900/40">
        {!editing ? (
          <>
            <span className="font-mono text-xs text-white px-1">
              Welcome, {username}!{saved && <span className="text-white/80 ml-1">✓</span>}
            </span>
            <button
              onClick={() => { setDraftName(username); setEditing(true); }}
              aria-label="Edit username"
              title="Edit name"
              className="w-6 h-6 flex items-center justify-center rounded border border-white/60 text-white text-xs hover:bg-white/20"
            >
              ✎
            </button>
          </>
        ) : (
          <>
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
              placeholder="Enter username"
              maxLength={20}
              className="flex-1 min-w-0 px-2 py-1 rounded bg-white text-blue-900 placeholder:text-blue-400 border border-blue-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-white"
            />
            <button
              onClick={handleSaveName}
              className="px-3 py-1 rounded bg-white text-blue-700 font-mono text-xs font-bold hover:bg-blue-50"
            >
              Save
            </button>
          </>
        )}
      </div>
      <div className="fixed inset-0 z-50 overflow-hidden bg-[#0a0612]">
        {/* Starfield */}
        <div className="absolute inset-0">
          {[...Array(80)].map((_, i) => {
            const size = 1 + Math.random() * 2;
            return (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: size, height: size,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  opacity: 0.3 + Math.random() * 0.7,
                  animation: `pulse ${2 + Math.random() * 4}s ease-in-out ${Math.random() * 3}s infinite`,
                }}
              />
            );
          })}
        </div>

        {/* Nebula window */}
        <div className="absolute left-1/2 top-[10%] -translate-x-1/2 w-[88%] max-w-[640px] aspect-[16/10] rounded-[36px] overflow-hidden border-[6px] border-[#3a2f1c] shadow-[0_0_60px_rgba(170,90,200,0.35),inset_0_0_40px_rgba(0,0,0,0.6)]"
             style={{ boxShadow: '0 0 60px rgba(170,90,200,0.35), inset 0 0 40px rgba(0,0,0,0.6), 0 0 0 3px #0a0612' }}>
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(ellipse at 35% 55%, #ffd9a8 0%, #e88c5a 8%, #b04a8a 22%, #5a2080 45%, #18062a 75%, #0a0414 100%)',
            }}
          >
            {/* Inner stars */}
            {[...Array(40)].map((_, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: 1 + Math.random() * 1.5,
                  height: 1 + Math.random() * 1.5,
                  left: `${10 + Math.random() * 80}%`,
                  top: `${12 + Math.random() * 55}%`,
                  opacity: 0.4 + Math.random() * 0.6,
                }}
              />
            ))}
            {/* Glass reflection streak */}
            <div className="absolute inset-0 pointer-events-none"
                 style={{
                   background:
                     'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.12) 42%, rgba(255,255,255,0.18) 48%, transparent 60%)',
                 }}/>
          </div>
        </div>

        {/* Title */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center z-10">
          <h1 className="font-mono text-3xl md:text-5xl font-extrabold tracking-[0.3em] text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]">
            ASTERON
          </h1>
          <p className="font-mono text-[10px] md:text-xs text-white/70 mt-1 tracking-wider">
            10 PLAYERS • 2 TRAITORS • 2 PROTECTORS • 6 CREW
          </p>
        </div>

        {/* Control tablet */}
        <div className="absolute left-1/2 bottom-[6%] -translate-x-1/2 w-[88%] max-w-[460px]">
          <div className="rounded-[20px] bg-[#1a0f2e] border-[3px] border-[#3a2f1c] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.7)]">
            {/* Antenna nub */}
            <div className="mx-auto -mt-3 mb-1 w-10 h-1.5 rounded-full bg-[#3a2f1c]" />
            {/* PLAY */}
            <button
              onClick={() => setShowRoles(true)}
              className="relative w-full py-4 rounded-[14px] font-mono font-extrabold text-3xl tracking-[0.25em] text-white bg-gradient-to-b from-[#9b8de0] to-[#6a5ab8] active:scale-[0.98] transition shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),inset_0_2px_0_rgba(255,255,255,0.25)]"
            >
              PLAY
              <span className="absolute inset-x-3 top-2 h-2 rounded-full bg-white/25" />
            </button>
            {/* Bottom row */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setShowTutorial(true)}
                aria-label="Info"
                className="relative w-[26%] py-3 rounded-[14px] flex items-center justify-center bg-gradient-to-b from-[#b1a4e8] to-[#7d6dcc] active:scale-[0.98] transition shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),inset_0_2px_0_rgba(255,255,255,0.3)]"
              >
                <span className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center font-mono font-extrabold text-white text-base">i</span>
              </button>
              <button
                onClick={() => setShowTutorial(true)}
                className="relative flex-1 py-3 rounded-[14px] font-mono font-extrabold text-xl tracking-[0.25em] text-white bg-gradient-to-b from-[#b1a4e8] to-[#7d6dcc] active:scale-[0.98] transition shadow-[inset_0_-4px_0_rgba(0,0,0,0.25),inset_0_2px_0_rgba(255,255,255,0.3)]"
              >
                TUTORIAL
                <span className="absolute inset-x-3 top-1.5 h-1.5 rounded-full bg-white/25" />
              </button>
            </div>
          </div>
        </div>

        {showRoles && (
          <div
            className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto"
            onClick={() => setShowRoles(false)}
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
              <LobbyScreen onStart={handleStart} />
            </div>
          </div>
        )}

        {showTutorial && (
          <div
            className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowTutorial(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full bg-[#1b1230] border-2 border-[#7a6fcc] rounded-xl p-6 font-mono text-white space-y-3"
            >
              <h2 className="text-2xl font-extrabold tracking-widest text-center text-[#c9bff5]">TUTORIAL</h2>
              <ul className="text-sm space-y-2 list-disc pl-5 text-white/90">
                <li><b>Move:</b> WASD / Arrows on desktop, joystick on mobile.</li>
                <li><b>Look:</b> Click canvas + move mouse (desktop) or drag right side (mobile).</li>
                <li><b>Crew:</b> Walk to a task (yellow ! on minimap), press SPACE / TASK to finish 10 tasks.</li>
                <li><b>Traitor:</b> Get close to crew and KILL them — avoid Protectors.</li>
                <li><b>Protector:</b> ARREST suspects to jail them and protect the crew.</li>
                <li><b>Doors:</b> Press E (desktop) or OPEN/CLOSE (mobile) when nearby.</li>
              </ul>
              <button
                onClick={() => setShowTutorial(false)}
                className="w-full mt-2 py-2 rounded-lg bg-[#7a6fcc] hover:bg-[#8a7fe0] font-bold tracking-widest"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <GameCanvas gameState={gameState} setGameState={setGameState} onExit={handleRestart} />
      {gameState.phase === 'gameover' && (
        <GameOverScreen state={gameState} onRestart={handleRestart} />
      )}
    </div>
  );
}
