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
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('mb_username');
    const name = stored && stored.trim() ? stored : 'Astro';
    setUsername(name);
    setDraftName(name);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  if (loading) return <LoadingScreen />;
  if (!gameState) return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0a0805] font-mono">
      {/* Starfield with a few warm dust specks for a Martian night sky */}
      <div className="absolute inset-0">
        {[...Array(90)].map((_, i) => {
          const dust = Math.random() < 0.12;
          const size = dust ? 1.5 + Math.random() * 2 : 1 + Math.random() * 1.6;
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                width: size, height: size,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: dust ? '#c9663a' : '#ffffff',
                opacity: 0.3 + Math.random() * 0.7,
                animation: `pulse ${2 + Math.random() * 4}s ease-in-out ${Math.random() * 3}s infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Top-left: info / tutorial button */}
      <button
        onClick={() => setShowTutorial(true)}
        aria-label="How to play"
        title="How to play"
        className="absolute top-4 left-4 z-10 w-11 h-11 rounded-xl border-2 border-sky-400 text-sky-300 text-xl font-extrabold flex items-center justify-center shadow-[0_0_14px_rgba(56,189,248,0.6)] bg-black/30 hover:bg-black/50 active:scale-95 transition"
      >
        ?
      </button>

      {/* Top-right: welcome badge with inline name editing */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-sky-400 bg-black/30 shadow-[0_0_14px_rgba(56,189,248,0.6)] max-w-[280px]">
        {!editing ? (
          <>
            <span className="text-sky-200 text-xs sm:text-sm tracking-wide">
              Welcome, {username}!{saved && <span className="text-sky-300 ml-1">✓</span>}
            </span>
            <button
              onClick={() => { setDraftName(username); setEditing(true); }}
              aria-label="Edit username"
              title="Edit name"
              className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded border border-sky-400/70 text-sky-300 text-xs hover:bg-sky-400/20"
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
              className="w-28 sm:w-36 px-2 py-1 rounded bg-black/50 text-sky-100 placeholder:text-sky-400/60 border border-sky-400/60 text-xs focus:outline-none focus:ring-1 focus:ring-sky-300"
            />
            <button
              onClick={handleSaveName}
              className="px-2 py-1 rounded bg-sky-500 text-black text-xs font-bold hover:bg-sky-400"
            >
              Save
            </button>
          </>
        )}
      </div>

      {/* Title */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 text-center">
        <h1
          className="text-4xl sm:text-6xl font-extrabold tracking-[0.15em] text-[#ff7a1a]"
          style={{ textShadow: '0 0 18px rgba(255,122,26,0.85), 0 0 40px rgba(255,122,26,0.5)' }}
        >
          ASTERON
        </h1>
      </div>

      {/* Center: ENTER / ADD FRIENDS */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 z-10">
        <button
          onClick={() => setShowRoles(true)}
          className="w-full max-w-md py-5 rounded-2xl border-2 border-sky-400 bg-[#152a52]/80 text-sky-100 text-2xl sm:text-3xl font-extrabold tracking-[0.3em] shadow-[0_0_22px_rgba(56,189,248,0.65)] hover:bg-[#1c3568]/80 active:scale-[0.98] transition"
        >
          ENTER
        </button>
        <button
          onClick={() => setShowComingSoon(true)}
          className="w-full max-w-md py-5 rounded-2xl border-2 border-emerald-400 bg-[#123322]/80 text-emerald-100 text-xl sm:text-2xl font-extrabold tracking-[0.25em] shadow-[0_0_22px_rgba(52,211,153,0.6)] hover:bg-[#164329]/80 active:scale-[0.98] transition"
        >
          ADD FRIENDS
        </button>

        <p className="text-white/50 text-xs sm:text-sm tracking-wide mt-1">
          Send a suggestion
        </p>
      </div>

      {/* Bottom-right: fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        aria-label="Toggle fullscreen"
        title="Toggle fullscreen"
        className="absolute bottom-4 right-4 z-10 w-11 h-11 rounded-lg border border-white/30 text-white/70 flex items-center justify-center bg-black/30 hover:bg-black/50 active:scale-95 transition"
      >
        {isFullscreen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Coming soon popup for Add Friends */}
      {showComingSoon && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowComingSoon(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-xs w-full bg-[#12261f] border-2 border-emerald-400 rounded-xl p-6 text-center space-y-4 shadow-[0_0_30px_rgba(52,211,153,0.4)]"
          >
            <h2 className="text-xl font-extrabold tracking-widest text-emerald-300">COMING SOON</h2>
            <p className="text-sm text-white/80">
              Friends are on the way, Astro. Check back soon!
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold tracking-widest"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
            className="max-w-md w-full bg-[#1b1230] border-2 border-[#7a6fcc] rounded-xl p-6 text-white space-y-3"
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
