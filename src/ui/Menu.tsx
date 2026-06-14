import type { AudioManager } from '../game/audio';

interface Props {
  hasRun: boolean;
  storageOk: boolean;
  bestScore: number;
  seedInput: number | null;
  onSeedChange: (s: number | null) => void;
  onNewGame: () => void;
  onContinue?: () => void;
  onUnlocks: () => void;
  onSettings: () => void;
  audio: AudioManager;
}

export function Menu(props: Props) {
  return (
    <div className="menu-screen">
      <div className="title">ROGUELIKE TANKS</div>
      <div className="subtitle">distance · ballistics · permadeath</div>

      <div className="menu-buttons">
        <button className="btn" onClick={props.onNewGame} autoFocus>
          NEW GAME
        </button>
        <button className="btn" onClick={props.onContinue} disabled={!props.onContinue}>
          CONTINUE
        </button>
        <button className="btn" onClick={props.onUnlocks}>
          UNLOCKS
        </button>
        <button className="btn" onClick={props.onSettings}>
          SETTINGS
        </button>

        <div className="row" style={{ marginTop: 8 }}>
          <span className="hint">SEED</span>
          <input
            className="seed-input"
            type="text"
            placeholder="random"
            value={props.seedInput ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v === '') props.onSeedChange(null);
              else {
                const n = parseInt(v.replace(/\D/g, ''), 10);
                props.onSeedChange(Number.isFinite(n) ? n : null);
              }
            }}
          />
        </div>
      </div>

      <div className="hint" style={{ marginTop: 24 }}>
        WASD move · MOUSE aim · CLICK fire · 1/2/3 or WHEEL weapon · ESC pause
      </div>
      {props.bestScore > 0 && (
        <div className="hint" style={{ marginTop: 6 }}>
          BEST SCORE: {props.bestScore}
        </div>
      )}
      {!props.storageOk && (
        <div className="hint" style={{ color: '#f66', marginTop: 6 }}>
          ⚠ localStorage unavailable — progress will not persist.
        </div>
      )}
    </div>
  );
}
