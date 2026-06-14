import { useCallback, useMemo, useRef, useState } from 'react';
import { AudioManager } from './game/audio';
import {
  applyRunResult,
  isStorageAvailable,
  loadSettings,
  loadUnlocks,
  saveSettings,
} from './game/unlocks';
import type { RunResult, Settings, UnlockedUpgrades } from './game/types';
import { Menu } from './ui/Menu';
import { SettingsMenu } from './ui/SettingsMenu';
import { UnlocksMenu } from './ui/UnlocksMenu';
import { GameOver } from './ui/GameOver';
import { Game } from './ui/Game';

type Screen = 'menu' | 'playing' | 'paused' | 'gameOver' | 'unlocks' | 'settings';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [prevScreen, setPrevScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [unlocks, setUnlocks] = useState<UnlockedUpgrades>(() => loadUnlocks());
  const [seedInput, setSeedInput] = useState<number | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const storageOk = useMemo(() => isStorageAvailable(), []);

  const audio = useMemo(() => new AudioManager(loadSettings()), []);
  const runSeedRef = useRef<number | null>(null);

  const updateSettings = useCallback(
    (s: Settings) => {
      setSettings(s);
      saveSettings(s);
      audio.updateSettings(s);
    },
    [audio],
  );

  const startGame = useCallback(
    (seed: number | null) => {
      audio.resume();
      runSeedRef.current = seed;
      setSeedInput(seed);
      setResult(null);
      setHasRun(true);
      setScreen('playing');
    },
    [audio],
  );

  const handleGameOver = useCallback(
    (stats: { score: number; kills: number; damageDealt: number; distance: number }) => {
      const applied = applyRunResult(unlocks, stats.score, stats.kills);
      setUnlocks(applied.unlocks);
      setResult({
        score: stats.score,
        kills: stats.kills,
        damageDealt: stats.damageDealt,
        distance: stats.distance,
        newUnlocks: [
          ...applied.newUnlocks,
          `+${applied.pointsEarned} Tech Points`,
        ],
        isNewBest: applied.isNewBest,
      });
      audio.play('unlock');
      setScreen('gameOver');
    },
    [unlocks, audio],
  );

  const openFrom = (target: Screen, from: Screen) => {
    audio.play('click');
    setPrevScreen(from);
    setScreen(target);
  };

  return (
    <div className="game-root scanlines">
      {(screen === 'playing' || screen === 'paused') && (
        <Game
          audio={audio}
          unlocks={unlocks}
          settings={settings}
          seed={runSeedRef.current}
          paused={screen === 'paused'}
          onGameOver={handleGameOver}
          onTogglePause={() => setScreen((s) => (s === 'playing' ? 'paused' : 'playing'))}
        />
      )}

      {screen === 'menu' && (
        <Menu
          hasRun={hasRun}
          storageOk={storageOk}
          bestScore={unlocks.bestScore}
          seedInput={seedInput}
          onSeedChange={setSeedInput}
          onNewGame={() => startGame(seedInput)}
          onContinue={hasRun ? () => startGame(runSeedRef.current) : undefined}
          onUnlocks={() => openFrom('unlocks', 'menu')}
          onSettings={() => openFrom('settings', 'menu')}
          audio={audio}
        />
      )}

      {screen === 'paused' && (
        <div className="pause-overlay">
          <div className="panel">
            <h2>PAUSED</h2>
            <div className="menu-buttons">
              <button className="btn" onClick={() => { audio.play('click'); setScreen('playing'); }}>
                RESUME
              </button>
              <button className="btn" onClick={() => openFrom('settings', 'paused')}>
                SETTINGS
              </button>
              <button
                className="btn danger"
                onClick={() => { audio.play('click'); setScreen('menu'); }}
              >
                QUIT TO MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === 'settings' && (
        <SettingsMenu
          settings={settings}
          onChange={updateSettings}
          onBack={() => { audio.play('click'); setScreen(prevScreen); }}
          audio={audio}
        />
      )}

      {screen === 'unlocks' && (
        <UnlocksMenu
          unlocks={unlocks}
          onChange={setUnlocks}
          onBack={() => { audio.play('click'); setScreen(prevScreen); }}
          audio={audio}
        />
      )}

      {screen === 'gameOver' && result && (
        <GameOver
          result={result}
          onRetry={() => startGame(seedInput)}
          onMenu={() => { audio.play('click'); setScreen('menu'); }}
          onUnlocks={() => openFrom('unlocks', 'gameOver')}
        />
      )}
    </div>
  );
}
