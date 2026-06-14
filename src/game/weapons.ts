import { MAX_RANGE } from './constants';
import type { UnlockedUpgrades, Weapon, WeaponType } from './types';

/** Base (unupgraded) player weapon definitions. */
function basePlayerWeapon(type: WeaponType): Weapon {
  switch (type) {
    case 'rapid':
      return {
        type,
        name: 'Rapid-Fire Cannon',
        damage: 5,
        fireInterval: 0.2,
        baseAccuracy: 0.85,
        minAccuracy: 0.65,
        maxRange: MAX_RANGE,
        splashRadius: 0,
        splashDamage: 0,
        cooldownRemaining: 0,
        reloadTime: 0.2,
        overheats: true,
        heat: 0,
        overheated: false,
      };
    case 'longrange':
      return {
        type,
        name: 'Long-Range Cannon',
        damage: 25,
        fireInterval: 2,
        baseAccuracy: 0.8,
        minAccuracy: 0.55,
        maxRange: MAX_RANGE,
        splashRadius: 0,
        splashDamage: 0,
        cooldownRemaining: 0,
        reloadTime: 2,
        overheats: false,
        heat: 0,
        overheated: false,
      };
    case 'explosive':
      return {
        type,
        name: 'Explosive Launcher',
        damage: 40,
        fireInterval: 3,
        baseAccuracy: 0.7,
        minAccuracy: 0.7,
        maxRange: MAX_RANGE,
        splashRadius: 50,
        splashDamage: 20,
        cooldownRemaining: 0,
        reloadTime: 3,
        overheats: false,
        heat: 0,
        overheated: false,
      };
  }
}

/** Build the player's three weapons, applying unlocked weapon upgrades. */
export function buildPlayerWeapons(unlocks: UnlockedUpgrades): Weapon[] {
  const types: WeaponType[] = ['rapid', 'longrange', 'explosive'];
  const reloadBonus = unlocks.tank.reload ? 0.75 : 1; // +25% reload speed
  return types.map((t) => {
    const w = basePlayerWeapon(t);
    const lvl = unlocks.weapons[t];
    // Level 1: +5% accuracy
    if (lvl >= 1) {
      w.baseAccuracy = Math.min(1, w.baseAccuracy + 0.05);
      w.minAccuracy = Math.min(1, w.minAccuracy + 0.05);
    }
    // Level 2: +10% damage
    if (lvl >= 2) {
      w.damage = Math.round(w.damage * 1.1);
      w.splashDamage = Math.round(w.splashDamage * 1.1);
    }
    // Level 3: -0.5s reload time
    if (lvl >= 3) {
      w.fireInterval = Math.max(0.1, w.fireInterval - 0.5);
    }
    // Global reload-speed upgrade.
    w.fireInterval *= reloadBonus;
    w.reloadTime = w.fireInterval;
    return w;
  });
}

/**
 * Accuracy at a given distance. Follows the design curve
 * `baseAccuracy * (1 - (d/maxRange)^2)` but is floored at the weapon's
 * configured min accuracy (its accuracy at max range).
 */
export function accuracyAt(weapon: Weapon, distance: number): number {
  const d = Math.min(distance, weapon.maxRange);
  const falloff = 1 - (d / weapon.maxRange) ** 2;
  const curve = weapon.baseAccuracy * falloff;
  return Math.max(weapon.minAccuracy, curve);
}
