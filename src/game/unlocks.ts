import { COSMETIC_MILESTONES } from './constants';
import type { RunResult, Settings, UnlockedUpgrades } from './types';

const UNLOCKS_KEY = 'rogueliketanks.unlocks.v1';
const SETTINGS_KEY = 'rogueliketanks.settings.v1';
const POINTS_KEY = 'rogueliketanks.points.v1';

export const UPGRADE_COST = 3; // tech points per upgrade level

export function defaultUnlocks(): UnlockedUpgrades {
  return {
    tank: { hp1: false, hp2: false, speed: false, vision: false, reload: false },
    weapons: { rapid: 0, longrange: 0, explosive: 0 },
    cosmetics: [],
    selectedSkin: 'green',
    modifiers: { hardMode: false, fogNight: false, artillery: false },
    bestScore: 0,
    totalKills: 0,
  };
}

export function defaultSettings(): Settings {
  return { music: true, sfx: true, difficulty: 'normal', masterVolume: 0.7 };
}

let storageWarned = false;
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    if (!storageWarned) {
      console.warn('localStorage unavailable — progression will not persist.');
      storageWarned = true;
    }
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    if (!storageWarned) {
      console.warn('localStorage unavailable — progression will not persist.');
      storageWarned = true;
    }
  }
}

export function isStorageAvailable(): boolean {
  try {
    const k = '__rt_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadUnlocks(): UnlockedUpgrades {
  const raw = safeGet(UNLOCKS_KEY);
  if (!raw) return defaultUnlocks();
  try {
    return { ...defaultUnlocks(), ...JSON.parse(raw) };
  } catch {
    return defaultUnlocks();
  }
}

export function saveUnlocks(u: UnlockedUpgrades): void {
  safeSet(UNLOCKS_KEY, JSON.stringify(u));
}

export function loadSettings(): Settings {
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return defaultSettings();
  try {
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}

export function loadPoints(): number {
  const raw = safeGet(POINTS_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function savePoints(n: number): void {
  safeSet(POINTS_KEY, String(Math.max(0, Math.floor(n))));
}

/** Tech points earned from a single run. */
export function pointsForRun(score: number, kills: number): number {
  return kills + Math.floor(score / 500);
}

/**
 * Apply the result of a finished run: award tech points, update best score,
 * auto-unlock cosmetics that crossed their milestone. Returns the list of new
 * cosmetic unlocks + points earned for the game-over screen.
 */
export function applyRunResult(
  unlocks: UnlockedUpgrades,
  score: number,
  kills: number,
): { unlocks: UnlockedUpgrades; pointsEarned: number; newUnlocks: string[]; isNewBest: boolean } {
  const next: UnlockedUpgrades = JSON.parse(JSON.stringify(unlocks));
  const newUnlocks: string[] = [];
  const isNewBest = score > next.bestScore;
  if (isNewBest) next.bestScore = score;
  next.totalKills += kills;

  for (const m of COSMETIC_MILESTONES) {
    if (next.bestScore >= m.score && !next.cosmetics.includes(m.id)) {
      next.cosmetics.push(m.id);
      newUnlocks.push(m.label);
    }
  }

  const pointsEarned = pointsForRun(score, kills);
  savePoints(loadPoints() + pointsEarned);
  saveUnlocks(next);
  return { unlocks: next, pointsEarned, newUnlocks, isNewBest };
}

/** Map a cosmetic id to the skin color it grants, if any. */
export function skinFromCosmetic(id: string): string | null {
  switch (id) {
    case 'skin_red':
      return 'red';
    case 'skin_blue':
      return 'blue';
    case 'skin_gold':
      return 'gold';
    default:
      return null;
  }
}

export type { RunResult };
