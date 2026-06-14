import { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/engine';
import type { AudioManager } from '../game/audio';
import type { HudSnapshot, Settings, UnlockedUpgrades } from '../game/types';
import { HUD } from './HUD';

interface Props {
  audio: AudioManager;
  unlocks: UnlockedUpgrades;
  settings: Settings;
  seed: number | null;
  paused: boolean;
  onGameOver: (stats: { score: number; kills: number; damageDealt: number; distance: number }) => void;
  onTogglePause: () => void;
}

export function Game({ audio, unlocks, settings, seed, paused, onGameOver, onTogglePause }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);

  // Create engine + start the run on mount.
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new GameEngine(containerRef.current, audio, { onGameOver });
    engineRef.current = engine;
    engine.start(seed, unlocks, settings);

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // Poll the HUD snapshot at ~20Hz (decoupled from the 60fps render loop).
    const hudTimer = window.setInterval(() => {
      setSnapshot(engine.getSnapshot());
    }, 50);

    return () => {
      window.removeEventListener('resize', onResize);
      window.clearInterval(hudTimer);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause / resume from parent.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (paused) e.pause();
    else e.resume();
  }, [paused]);

  // Propagate settings changes.
  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);

  // ESC toggles pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onTogglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTogglePause]);

  return (
    <div className="viewport" ref={containerRef}>
      {snapshot && <HUD snap={snapshot} />}
    </div>
  );
}
