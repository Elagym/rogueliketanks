// Core type definitions for Roguelike Tanks.

export type Vec2 = [number, number];

export type GameMode = 'menu' | 'playing' | 'paused' | 'gameOver';

export type WeaponType = 'rapid' | 'longrange' | 'explosive';

export type EnemyType = 'scout' | 'standard' | 'heavy' | 'sniper';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type TileType = 0 | 1 | 2; // 0 = grass (walkable), 1 = water, 2 = wall

/** Runtime weapon instance with live cooldown / heat state. */
export interface Weapon {
  type: WeaponType;
  name: string;
  damage: number;
  /** Seconds between shots. */
  fireInterval: number;
  baseAccuracy: number; // 0..1 at point blank
  minAccuracy: number; // 0..1 at max range
  maxRange: number;
  splashRadius: number; // 0 for non-explosive
  splashDamage: number;
  cooldownRemaining: number; // seconds until next shot allowed
  reloadTime: number; // visible reload duration (for UI)
  // Heat (rapid only)
  overheats: boolean;
  heat: number; // 0..1
  overheated: boolean;
}

export interface AIState {
  mode: 'idle' | 'engage' | 'evade';
  target: Vec2; // current navigation goal
  path: Vec2[]; // remaining A* waypoints
  pathTimer: number; // seconds until next repath
  evadeTimer: number; // seconds remaining in evade maneuver
  evadeDir: Vec2;
  fireDelayTimer: number; // type-specific delay before first shot in an engagement
  patrolTimer: number;
  lastSeenPlayer: boolean;
}

export interface Tank {
  id: string;
  isPlayer: boolean;
  type: EnemyType | 'player';
  position: Vec2;
  velocity: Vec2;
  angle: number; // body facing (radians)
  turretAngle: number; // turret facing (radians, world space)
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  weapon: Weapon; // enemies use a single weapon
  ai?: AIState;
  hitFlash: number; // seconds of red flash remaining
}

export interface Player extends Tank {
  weapons: Weapon[];
  selectedWeapon: 0 | 1 | 2;
  visionRange: number;
}

export interface Particle {
  position: Vec2;
  velocity: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'flash' | 'dust' | 'debris';
}

export interface FloatingText {
  position: Vec2;
  text: string;
  life: number;
  color: string;
}

export interface GameMap {
  seed: number;
  width: number; // tiles
  height: number; // tiles
  tiles: TileType[]; // row-major, length width*height
  /** Per-tile exploration state for fog-of-war memory. */
  explored: boolean[];
}

export interface UnlockedUpgrades {
  tank: {
    hp1: boolean; // +20 hp
    hp2: boolean; // +20 hp
    speed: boolean; // +15% move speed
    vision: boolean; // +10px vision
    reload: boolean; // +25% reload speed
  };
  weapons: {
    rapid: number; // 0..3
    longrange: number; // 0..3
    explosive: number; // 0..3
  };
  cosmetics: string[]; // unlocked cosmetic ids
  selectedSkin: string; // active tank color skin id
  modifiers: {
    hardMode: boolean;
    fogNight: boolean;
    artillery: boolean;
  };
  bestScore: number;
  totalKills: number;
}

export interface Settings {
  music: boolean;
  sfx: boolean;
  difficulty: Difficulty;
  masterVolume: number; // 0..1
}

/** Lightweight snapshot read by the React HUD each frame. */
export interface HudSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  kills: number;
  selectedWeapon: number;
  weapons: {
    name: string;
    type: WeaponType;
    cooldownRemaining: number;
    reloadTime: number;
    heat: number;
    overheated: boolean;
  }[];
  nearestEnemyDist: number | null;
  currentAccuracy: number | null;
  difficultyMultiplier: number;
  seed: number;
  fps: number;
  distanceTraveled: number;
  // minimap data
  mapTiles: TileType[];
  mapExplored: boolean[];
  mapW: number;
  mapH: number;
  playerTile: Vec2;
  enemyTiles: Vec2[];
}

export interface RunResult {
  score: number;
  kills: number;
  damageDealt: number;
  distance: number;
  newUnlocks: string[];
  isNewBest: boolean;
}
