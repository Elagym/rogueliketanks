import { MAX_RANGE, TANK_RADIUS } from './constants';
import type { AIState, EnemyType, Tank, Vec2, Weapon } from './types';

interface EnemyTemplate {
  hp: number;
  speed: number;
  damage: number;
  accuracy: number;
  fireInterval: number;
  fireDelay: number; // type-specific delay before firing in an engagement
  minAccuracy: number;
}

export const ENEMY_TEMPLATES: Record<EnemyType, EnemyTemplate> = {
  scout: { hp: 30, speed: 78, damage: 10, accuracy: 0.6, fireInterval: 2.2, fireDelay: 0.4, minAccuracy: 0.5 },
  standard: { hp: 60, speed: 52, damage: 22, accuracy: 0.7, fireInterval: 3.0, fireDelay: 0.8, minAccuracy: 0.55 },
  heavy: { hp: 110, speed: 34, damage: 38, accuracy: 0.78, fireInterval: 4.0, fireDelay: 1.2, minAccuracy: 0.6 },
  sniper: { hp: 42, speed: 48, damage: 34, accuracy: 0.9, fireInterval: 4.2, fireDelay: 1.6, minAccuracy: 0.7 },
};

/** Difficulty scaling factor applied to enemy stats based on kill count. */
export interface ScaleFactors {
  hp: number;
  speed: number;
  accuracy: number;
  fireDelay: number; // seconds to subtract from fire delay
}

export function computeScale(kills: number): ScaleFactors {
  // +5% hp / +3% speed / +2% acc per 3 kills; accelerates past 12 kills.
  let steps = Math.floor(kills / 3);
  let hp = 1 + steps * 0.05;
  let speed = 1 + steps * 0.03;
  let accuracy = steps * 0.02;
  const fireDelay = steps * 1;
  if (kills > 12) {
    const extra = kills - 12;
    hp += extra * 0.1;
    speed += extra * 0.05;
    accuracy += extra * 0.03;
  }
  return { hp, speed, accuracy, fireDelay };
}

/** Choose an enemy type given the current kill count and RNG roll. */
export function pickEnemyType(kills: number, roll: number, sniperRoll: number, hasPlayerKilled: boolean): EnemyType {
  // Sniper: rare after first player damage (here: after first kill), 30% chance.
  if (hasPlayerKilled && sniperRoll < 0.3) return 'sniper';
  if (kills < 2) return 'scout';
  if (kills <= 8) return roll < 0.4 ? 'scout' : 'standard';
  // Late: mix of standard / heavy / scout
  if (roll < 0.25) return 'scout';
  if (roll < 0.6) return 'standard';
  return 'heavy';
}

function makeEnemyWeapon(t: EnemyType, tpl: EnemyTemplate, scale: ScaleFactors, difficulty: number): Weapon {
  // Enemies lob arcing shells too. Their scatter is generous and charge time
  // long, so a telegraphed landing marker gives the player time to dodge.
  const acc = Math.min(0.95, tpl.accuracy + scale.accuracy);
  const range = t === 'sniper' ? MAX_RANGE : t === 'heavy' ? 300 : t === 'standard' ? 280 : 240;
  return {
    type: 'longrange',
    name: `${t} cannon`,
    damage: Math.round(tpl.damage * difficulty),
    fireInterval: tpl.fireInterval,
    reloadTime: tpl.fireInterval,
    chargeTime: t === 'sniper' ? 1.4 : t === 'heavy' ? 1.2 : 0.9,
    projectileSpeed: t === 'heavy' ? 190 : 240,
    maxRange: range,
    minRange: 24,
    scatter: t === 'sniper' ? 16 : t === 'scout' ? 44 : 30,
    splashRadius: t === 'heavy' ? 48 : 30,
    splashDamage: Math.round(tpl.damage * 0.5 * difficulty),
    baseAccuracy: acc,
    minAccuracy: tpl.minAccuracy,
    cooldownRemaining: 0,
    overheats: false,
    heat: 0,
    overheated: false,
  };
}

function makeAI(): AIState {
  return {
    mode: 'idle',
    target: [128, 128],
    path: [],
    pathTimer: 0,
    evadeTimer: 0,
    evadeDir: [0, 0],
    fireDelayTimer: 0,
    patrolTimer: 0,
    lastSeenPlayer: false,
    charging: false,
    chargeRemaining: 0,
    chargeTarget: [0, 0],
  };
}

let enemyCounter = 0;

export function createEnemy(
  type: EnemyType,
  position: Vec2,
  kills: number,
  difficulty: number,
  hardMode: boolean,
): Tank {
  const tpl = ENEMY_TEMPLATES[type];
  const scale = computeScale(kills);
  const hpMult = scale.hp * (hardMode ? 1.2 : 1);
  const maxHp = Math.round(tpl.hp * hpMult);
  const tpl2 = { ...tpl, fireDelay: Math.max(0, tpl.fireDelay - scale.fireDelay) };
  const ai = makeAI();
  ai.fireDelayTimer = tpl2.fireDelay;
  return {
    id: `e${enemyCounter++}`,
    isPlayer: false,
    type,
    position: [position[0], position[1]],
    velocity: [0, 0],
    angle: 0,
    turretAngle: 0,
    hp: maxHp,
    maxHp,
    speed: tpl.speed * scale.speed,
    radius: TANK_RADIUS,
    weapon: makeEnemyWeapon(type, tpl2, scale, difficulty),
    ai,
    hitFlash: 0,
  };
}

/** Per-type fire delay so engine can reset the timer when an engagement starts. */
export function fireDelayFor(type: EnemyType, kills: number): number {
  const scale = computeScale(kills);
  return Math.max(0, ENEMY_TEMPLATES[type].fireDelay - scale.fireDelay);
}
