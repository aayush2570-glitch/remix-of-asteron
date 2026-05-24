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
      <div
        className="fixed inset-0 z-50 overflow-hidden"
        style={{
          backgroundImage: `url(${lobbyBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center">
          <h1 className="font-mono text-4xl md:text-5xl font-extrabold tracking-widest text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]">
            ASTERON
          </h1>
          <p className="font-mono text-xs text-white/80 drop-shadow-md mt-1">
            10 Players • 2 Traitors • 2 Protectors • 6 Crew
          </p>
        </div>

        <div className="absolute left-1/2 bottom-[10%] -translate-x-1/2 flex flex-col items-center gap-3">
          <button
            onClick={() => setShowRoles(true)}
            className="font-mono font-extrabold text-3xl tracking-widest text-white px-16 py-4 rounded-lg bg-[#7a6fcc] hover:bg-[#8a7fe0] active:scale-95 transition border-2 border-white/40 shadow-[0_6px_0_rgba(0,0,0,0.35)]"
          >
            PLAY
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTutorial(true)}
              aria-label="Info"
              className="w-14 h-14 flex items-center justify-center rounded-lg bg-[#9a90dc] hover:bg-[#aaa0ec] active:scale-95 transition border-2 border-white/40 text-white text-2xl font-bold font-mono shadow-[0_4px_0_rgba(0,0,0,0.35)]"
            >ⓘ</button>
            <button
              onClick={() => setShowTutorial(true)}
              className="font-mono font-extrabold text-xl tracking-widest text-white px-10 py-3 rounded-lg bg-[#9a90dc] hover:bg-[#aaa0ec] active:scale-95 transition border-2 border-white/40 shadow-[0_4px_0_rgba(0,0,0,0.35)]"
            >
              TUTORIAL
            </button>
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
