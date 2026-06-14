import { useState } from 'react';
import type { AudioManager } from '../game/audio';
import type { UnlockedUpgrades, WeaponType } from '../game/types';
import { loadPoints, savePoints, saveUnlocks, skinFromCosmetic, UPGRADE_COST } from '../game/unlocks';
import { COSMETIC_MILESTONES } from '../game/constants';

interface Props {
  unlocks: UnlockedUpgrades;
  onChange: (u: UnlockedUpgrades) => void;
  onBack: () => void;
  audio: AudioManager;
}

const TANK_UPGRADES: { key: keyof UnlockedUpgrades['tank']; label: string }[] = [
  { key: 'hp1', label: '+20 Max HP' },
  { key: 'hp2', label: '+20 Max HP' },
  { key: 'speed', label: '+15% Speed' },
  { key: 'vision', label: '+10 Vision' },
  { key: 'reload', label: '+25% Reload' },
];

const WEAPONS: { key: WeaponType; label: string }[] = [
  { key: 'rapid', label: 'Rapid' },
  { key: 'longrange', label: 'Long-Range' },
  { key: 'explosive', label: 'Explosive' },
];

const WEAPON_LEVEL_DESC = ['+5% Accuracy', '+10% Damage', '-0.5s Reload'];

export function UnlocksMenu({ unlocks, onChange, onBack, audio }: Props) {
  const [points, setPoints] = useState(loadPoints());

  const commit = (u: UnlockedUpgrades, spend: number) => {
    const remaining = points - spend;
    setPoints(remaining);
    savePoints(remaining);
    saveUnlocks(u);
    onChange(u);
  };

  const buyTank = (key: keyof UnlockedUpgrades['tank']) => {
    if (unlocks.tank[key] || points < UPGRADE_COST) return;
    audio.play('unlock');
    const u = structuredClone(unlocks);
    u.tank[key] = true;
    commit(u, UPGRADE_COST);
  };

  const buyWeapon = (key: WeaponType) => {
    if (unlocks.weapons[key] >= 3 || points < UPGRADE_COST) return;
    audio.play('unlock');
    const u = structuredClone(unlocks);
    u.weapons[key] += 1;
    commit(u, UPGRADE_COST);
  };

  const selectSkin = (skin: string) => {
    audio.play('click');
    const u = structuredClone(unlocks);
    u.selectedSkin = skin;
    saveUnlocks(u);
    onChange(u);
  };

  const availableSkins = ['green', ...unlocks.cosmetics.map(skinFromCosmetic).filter((s): s is string => !!s)];

  return (
    <div className="menu-screen">
      <div className="panel" style={{ minWidth: 420 }}>
        <h2>UNLOCKS</h2>
        <div className="points">⚙ {points} TECH POINTS</div>
        <div className="hint" style={{ textAlign: 'center', marginBottom: 12 }}>
          Earn points by playing runs (kills + score). Each upgrade costs {UPGRADE_COST}.
        </div>

        <h3 style={{ letterSpacing: 3 }}>TANK UPGRADES</h3>
        <div className="grid">
          {TANK_UPGRADES.map((t) => {
            const owned = unlocks.tank[t.key];
            return (
              <div key={t.key} className={`upgrade ${owned ? 'maxed' : ''}`}>
                <div>{t.label}</div>
                <div className="lvl">{owned ? '✓' : '—'}</div>
                <button
                  className="buy"
                  disabled={owned || points < UPGRADE_COST}
                  onClick={() => buyTank(t.key)}
                >
                  {owned ? 'OWNED' : `BUY (${UPGRADE_COST})`}
                </button>
              </div>
            );
          })}
        </div>

        <h3 style={{ letterSpacing: 3 }}>WEAPON UPGRADES</h3>
        <div className="grid">
          {WEAPONS.map((w) => {
            const lvl = unlocks.weapons[w.key];
            const maxed = lvl >= 3;
            return (
              <div key={w.key} className={`upgrade ${maxed ? 'maxed' : ''}`}>
                <div>{w.label}</div>
                <div className="lvl">[{lvl}/3]</div>
                <div className="hint">{lvl < 3 ? WEAPON_LEVEL_DESC[lvl] : 'MAX'}</div>
                <button className="buy" disabled={maxed || points < UPGRADE_COST} onClick={() => buyWeapon(w.key)}>
                  {maxed ? 'MAX' : `BUY (${UPGRADE_COST})`}
                </button>
              </div>
            );
          })}
        </div>

        <h3 style={{ letterSpacing: 3 }}>COSMETICS</h3>
        <div className="hint" style={{ marginBottom: 6 }}>
          Unlocked at milestone scores. Click an owned skin to equip it.
        </div>
        <div className="grid cos">
          {['green', 'red', 'blue', 'gold'].map((skin) => {
            const owned = availableSkins.includes(skin);
            const active = unlocks.selectedSkin === skin;
            return (
              <div
                key={skin}
                className={`upgrade ${owned ? '' : 'locked'} ${active ? 'maxed' : ''}`}
                onClick={() => owned && selectSkin(skin)}
                style={{ cursor: owned ? 'pointer' : 'default' }}
              >
                <div style={{ textTransform: 'uppercase' }}>{skin} Tank</div>
                <div className="lvl">{active ? '★' : owned ? '✓' : '🔒'}</div>
              </div>
            );
          })}
          {COSMETIC_MILESTONES.filter((m) => m.id.startsWith('camo')).map((m) => {
            const owned = unlocks.cosmetics.includes(m.id);
            return (
              <div key={m.id} className={`upgrade ${owned ? '' : 'locked'}`}>
                <div>{m.label}</div>
                <div className="lvl">{owned ? '✓' : '🔒'}</div>
                {!owned && <div className="hint">{m.score} pts</div>}
              </div>
            );
          })}
        </div>

        <div className="menu-buttons" style={{ width: '100%', marginTop: 14 }}>
          <button className="btn" onClick={onBack}>
            BACK
          </button>
        </div>
      </div>
    </div>
  );
}
