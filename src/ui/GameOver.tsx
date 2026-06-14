import type { RunResult } from '../game/types';

interface Props {
  result: RunResult;
  onRetry: () => void;
  onMenu: () => void;
  onUnlocks: () => void;
}

export function GameOver({ result, onRetry, onMenu, onUnlocks }: Props) {
  return (
    <div className="menu-screen">
      <div className="panel" style={{ minWidth: 360 }}>
        <h2 style={{ color: '#ff5050' }}>GAME OVER</h2>
        {result.isNewBest && (
          <div className="points" style={{ color: '#0f0' }}>
            ★ NEW BEST SCORE ★
          </div>
        )}
        <div className="row">
          <span>Final Score</span>
          <span>{result.score}</span>
        </div>
        <div className="row">
          <span>Kills</span>
          <span>{result.kills}</span>
        </div>
        <div className="row">
          <span>Damage Dealt</span>
          <span>{result.damageDealt} HP</span>
        </div>
        <div className="row">
          <span>Distance</span>
          <span>{result.distance} px</span>
        </div>

        {result.newUnlocks.length > 0 && (
          <>
            <h3 style={{ letterSpacing: 3, marginBottom: 4 }}>REWARDS</h3>
            <ul className="unlock-list">
              {result.newUnlocks.map((u, i) => (
                <li key={i}>✓ {u}</li>
              ))}
            </ul>
          </>
        )}

        <div className="menu-buttons" style={{ width: '100%', marginTop: 12 }}>
          <button className="btn" onClick={onRetry} autoFocus>
            RETRY
          </button>
          <button className="btn" onClick={onUnlocks}>
            SPEND POINTS
          </button>
          <button className="btn" onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
