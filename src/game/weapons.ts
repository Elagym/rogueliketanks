import type { UnlockedUpgrades, Weapon, WeaponType } from './types';
import type { Rng } from './rng';
import type { Vec2 } from './types';

/**
 * Base (unupgraded) artillery weapon definitions. Every weapon lobs an arcing
 * shell that travels to the aimed ground point, then explodes. Aiming accuracy
 * is determined by landing scatter (tighter = more accurate), not a hit/miss
 * roll — so where you place the reticle is where the shell lands.
 */
function basePlayerWeapon(type: WeaponType): Weapon {
  const common = {
    cooldownRemaining: 0,
    overheats: false,
    heat: 0,
    overheated: false,
  };
  switch (type) {
    case 'rapid':
      // Field Gun: quick, short charge + reload, modest range and blast.
      return {
        ...common,
        type,
        name: 'Field Gun',
        damage: 16,
        fireInterval: 1.4,
        reloadTime: 1.4,
        chargeTime: 0.35,
        projectileSpeed: 300,
        maxRange: 230,
        minRange: 18,
        scatter: 16,
        splashRadius: 26,
        splashDamage: 8,
        baseAccuracy: 0.82,
        minAccuracy: 0.82,
      };
    case 'longrange':
      // Siege Cannon: balanced long-range piece.
      return {
        ...common,
        type,
        name: 'Siege Cannon',
        damage: 32,
        fireInterval: 2.8,
        reloadTime: 2.8,
        chargeTime: 0.7,
        projectileSpeed: 260,
        maxRange: 320,
        minRange: 40,
        scatter: 22,
        splashRadius: 38,
        splashDamage: 16,
        baseAccuracy: 0.88,
        minAccuracy: 0.88,
      };
    case 'explosive':
      // Heavy Artillery: longest range, biggest blast, slowest everything.
      return {
        ...common,
        type,
        name: 'Heavy Artillery',
        damage: 52,
        fireInterval: 4.5,
        reloadTime: 4.5,
        chargeTime: 1.1,
        projectileSpeed: 200,
        maxRange: 360,
        minRange: 70,
        scatter: 34,
        splashRadius: 70,
        splashDamage: 30,
        baseAccuracy: 0.8,
        minAccuracy: 0.8,
      };
  }
}

/** Build the player's three weapons, applying unlocked weapon upgrades. */
export function buildPlayerWeapons(unlocks: UnlockedUpgrades): Weapon[] {
  const types: WeaponType[] = ['rapid', 'longrange', 'explosive'];
  const reloadBonus = unlocks.tank.reload ? 0.8 : 1; // +25% reload speed (≈ 0.8x time)
  return types.map((t) => {
    const w = basePlayerWeapon(t);
    const lvl = unlocks.weapons[t];
    // Level 1: tighter scatter (the "accuracy" upgrade).
    if (lvl >= 1) {
      w.scatter *= 0.7;
      w.baseAccuracy = Math.min(1, w.baseAccuracy + 0.05);
    }
    // Level 2: +10% damage (direct + splash).
    if (lvl >= 2) {
      w.damage = Math.round(w.damage * 1.1);
      w.splashDamage = Math.round(w.splashDamage * 1.1);
    }
    // Level 3: faster reload.
    if (lvl >= 3) {
      w.fireInterval = Math.max(0.6, w.fireInterval - 0.7);
    }
    w.fireInterval *= reloadBonus;
    w.reloadTime = w.fireInterval;
    return w;
  });
}

/**
 * Precision at a distance, for HUD display (1 = pin-point, 0 = wild). The shell
 * always lands near the reticle; this just communicates the scatter size.
 */
export function accuracyAt(weapon: Weapon, distance: number): number {
  const d = Math.min(distance, weapon.maxRange);
  const frac = weapon.maxRange > 0 ? d / weapon.maxRange : 0;
  const scatterPx = weapon.scatter * frac;
  // Map a 0..scatter(max) px error onto a friendly 100%..~55% precision read-out.
  return Math.max(0.4, 1 - scatterPx / (weapon.maxRange * 0.7));
}

/** Compute the scattered landing point for a shell aimed at `target`. */
export function scatteredLanding(weapon: Weapon, origin: Vec2, target: Vec2, rng: Rng): Vec2 {
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  const distance = Math.hypot(dx, dy);
  const frac = weapon.maxRange > 0 ? Math.min(1, distance / weapon.maxRange) : 0;
  const radius = weapon.scatter * frac;
  const a = rng.range(0, Math.PI * 2);
  const r = radius * Math.sqrt(rng.next());
  return [target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r];
}
