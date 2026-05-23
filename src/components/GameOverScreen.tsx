import { GameState } from '@/game/types';

interface Props {
  state: GameState;
  onRestart: () => void;
}

export default function GameOverScreen({ state, onRestart }: Props) {
  const isCrewWin = state.winner === 'crew';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="text-center space-y-6 p-8 rounded-xl border border-border bg-card shadow-2xl max-w-md">
        <h1 className="text-4xl font-bold font-mono tracking-wider"
          style={{ color: isCrewWin ? '#3dba6f' : '#e03030' }}>
          {isCrewWin ? '🛡️ CREW WINS!' : '☠️ TRAITORS WIN!'}
        </h1>
        <p className="text-muted-foreground font-mono">
          {isCrewWin
            ? 'All tasks completed! Mars base is operational!'
            : 'The traitors eliminated all crewmates...'}
        </p>
        <div className="text-sm text-muted-foreground font-mono">
          Time: {Math.floor(state.timeElapsed / 1000)}s |
          Survivors: {state.players.filter(p => p.alive).length}/10
        </div>
        <button
          onClick={onRestart}
          className="px-8 py-3 rounded-lg font-mono font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}
