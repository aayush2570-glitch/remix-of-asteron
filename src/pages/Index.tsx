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
      <LobbyScreen onStart={handleStart} />
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
