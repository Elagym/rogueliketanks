import type { AudioManager } from '../game/audio';
import type { Difficulty, Settings } from '../game/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onBack: () => void;
  audio: AudioManager;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export function SettingsMenu({ settings, onChange, onBack, audio }: Props) {
  const toggle = (key: 'music' | 'sfx') => {
    audio.play('click');
    onChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="menu-screen">
      <div className="panel">
        <h2>SETTINGS</h2>

        <div className="row">
          <span>Music</span>
          <button className="btn small" onClick={() => toggle('music')}>
            {settings.music ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="row">
          <span>SFX</span>
          <button className="btn small" onClick={() => toggle('sfx')}>
            {settings.sfx ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="row">
          <span>Master Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.masterVolume * 100)}
            onChange={(e) => onChange({ ...settings, masterVolume: Number(e.target.value) / 100 })}
          />
        </div>

        <div className="row">
          <span>Difficulty</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className="btn small"
                style={
                  settings.difficulty === d
                    ? { borderColor: '#0f0', boxShadow: '0 0 8px rgba(0,255,0,0.5)' }
                    : undefined
                }
                onClick={() => {
                  audio.play('click');
                  onChange({ ...settings, difficulty: d });
                }}
              >
                {d.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-buttons" style={{ width: '100%', marginTop: 18 }}>
          <button className="btn" onClick={onBack}>
            BACK
          </button>
        </div>
      </div>
    </div>
  );
}
