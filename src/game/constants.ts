// Tunable game constants. World units == pixels (256x256 world).

export const WORLD_SIZE = 256; // pixels
export const TILE_SIZE = 16; // pixels
export const GRID = WORLD_SIZE / TILE_SIZE; // 16x16 tiles

// Player movement
export const PLAYER_BASE_SPEED = 100; // px/s
export const ACCEL_TIME = 0.25; // seconds to reach full speed
export const DECEL_TIME = 0.35; // seconds to stop
export const PLAYER_MAX_HP = 100;
export const PLAYER_VISION = 80; // px radius
export const TANK_RADIUS = 7; // collision radius (px)

// Turret
export const TURRET_CHASSIS_LIMIT = (120 * Math.PI) / 180; // ±120° from body forward

// Ballistics
export const MAX_RANGE = 200; // px reference for accuracy falloff

// Enemies
export const MAX_ENEMIES = 6;
export const SPAWN_INTERVAL_MIN = 8; // seconds
export const SPAWN_INTERVAL_MAX = 12;
export const ENEMY_AWARENESS = 120; // px LOS detection
export const ENEMY_ENGAGE_RANGE = 180; // px to start firing
export const FIRST_SPAWN_DELAY = 3; // seconds

// Difficulty scaling
export const SCALE_PER_KILLS = 3;
export const HARD_CAP_KILLS = 12;

// Scoring
export const SCORE_PER_KILL = 100;
export const SCORE_PER_DAMAGE = 2;
export const SCORE_PER_PIXEL = 0.5;

// Cosmetic skin colors (hex)
export const SKINS: Record<string, number> = {
  green: 0x4e9e3a,
  red: 0xb5402f,
  blue: 0x3a6ea5,
  gold: 0xc9a227,
};

// Enemy tank tint colors
export const ENEMY_COLORS: Record<string, number> = {
  scout: 0xc98a3a,
  standard: 0x9a5b3a,
  heavy: 0x6b3b2f,
  sniper: 0x7a4a8a,
};

// Milestone scores that unlock cosmetics
export const COSMETIC_MILESTONES: { id: string; label: string; score: number }[] = [
  { id: 'skin_red', label: 'Red Tank', score: 500 },
  { id: 'skin_blue', label: 'Blue Tank', score: 1500 },
  { id: 'skin_gold', label: 'Gold Tank', score: 4000 },
  { id: 'camo_desert', label: 'Desert Camo', score: 2500 },
  { id: 'camo_snow', label: 'Snow Camo', score: 6000 },
];

export const DIFFICULTY_MULT: Record<string, number> = {
  easy: 0.8,
  normal: 1.0,
  hard: 1.25,
};
