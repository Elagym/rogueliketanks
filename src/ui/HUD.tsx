import { useEffect, useRef } from 'react';
import type { HudSnapshot, WeaponType } from '../game/types';

const WEAPON_DESC: Record<WeaponType, string> = {
  rapid: 'Field Gun — quick lob, short charge & reload, modest blast',
  longrange: 'Siege Cannon — balanced long-range artillery',
  explosive: 'Heavy Artillery — longest range, huge blast, slow reload',
};

const WEAPON_SHORT: Record<WeaponType, string> = {
  rapid: 'FIELD',
  longrange: 'SIEGE',
  explosive: 'HEAVY',
};

const MINIMAP_SIZE = 120;

export function HUD({ snap }: { snap: HudSnapshot }) {
  const hpPct = (snap.hp / snap.maxHp) * 100;
  const selected = snap.weapons[snap.selectedWeapon];

  return (
    <div className="hud">
      {/* Top-left: HP, score, weapons */}
      <div className="hud-tl">
        <div className="hpbar">
          <div className="fill" style={{ width: `${hpPct}%` }} />
          <div className="txt">
            {snap.hp} / {snap.maxHp}
          </div>
        </div>
        <div className="stat">
          SCORE {snap.score} · KILLS {snap.kills}
        </div>
        <div className="weapons">
          {snap.weapons.map((w, i) => {
            const isActive = i === snap.selectedWeapon;
            const charging = isActive && snap.charging;
            const ready = w.cooldownRemaining <= 0 && !charging;
            const cdPct = w.reloadTime > 0 ? (1 - w.cooldownRemaining / w.reloadTime) * 100 : 100;
            const fillPct = charging ? snap.chargeProgress * 100 : Math.min(100, cdPct);
            const label = charging ? 'AIMING' : ready ? 'READY' : 'RELOAD';
            const labelColor = charging ? '#ffd060' : ready ? '#0f0' : '#f80';
            return (
              <div key={i} className={`weapon-box ${isActive ? 'active' : ''}`}>
                <div>
                  {i + 1} {WEAPON_SHORT[w.type]}
                </div>
                <div style={{ color: labelColor, fontSize: 9 }}>{label}</div>
                <div className="cooldown">
                  <div
                    className={`cd ${charging ? 'hot' : ''}`}
                    style={{ width: `${fillPct}%`, background: charging ? '#ffd060' : '#0f0' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top-center: aim range + nearest enemy */}
      <div className="hud-tc">
        <div className="dist-big" style={{ color: snap.aimInRange ? '#00ff66' : '#ff5050' }}>
          {Math.round(snap.aimDistance)}px {snap.aimInRange ? '◎' : '✕'}
        </div>
        <div className="stat">
          {snap.charging
            ? `AIMING ${Math.round(snap.chargeProgress * 100)}%`
            : `RANGE ${snap.weaponMinRange}–${snap.weaponRange}px · PREC ${Math.round((snap.currentAccuracy ?? 1) * 100)}%`}
        </div>
        <div className="stat" style={{ marginTop: 2 }}>
          {snap.nearestEnemyDist !== null
            ? `NEAREST ${Math.round(snap.nearestEnemyDist)}px`
            : 'NO CONTACT'}
        </div>
      </div>

      {/* Top-right: minimap + fps */}
      <div className="hud-tr">
        <Minimap snap={snap} />
        <div className="stat" style={{ marginTop: 4 }}>
          {snap.fps} FPS
        </div>
        <div className="hint">seed {snap.seed}</div>
      </div>

      {/* Bottom-left: ammo + difficulty */}
      <div className="hud-bl">
        <div className="stat">AMMO ∞</div>
        <div className="stat" style={{ marginLeft: 6 }}>
          DIFF {snap.difficultyMultiplier.toFixed(2)}x
        </div>
        <div className="stat" style={{ marginLeft: 6 }}>
          DIST {snap.distanceTraveled}px
        </div>
      </div>

      {/* Bottom-center: weapon description */}
      <div className="hud-bc">{WEAPON_DESC[selected.type]}</div>
    </div>
  );
}

function Minimap({ snap }: { snap: HudSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = MINIMAP_SIZE / snap.mapW;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    for (let y = 0; y < snap.mapH; y++) {
      for (let x = 0; x < snap.mapW; x++) {
        const idx = y * snap.mapW + x;
        if (!snap.mapExplored[idx]) continue;
        const t = snap.mapTiles[idx];
        ctx.fillStyle = t === 1 ? '#1c3a5a' : t === 2 ? '#3a3d40' : '#2c4c28';
        ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }

    // Enemies (last known, only if currently within vision per snapshot).
    ctx.fillStyle = '#ff3030';
    for (const [ex, ey] of snap.enemyTiles) {
      ctx.fillRect(ex * scale - 1, ey * scale - 1, scale + 1, scale + 1);
    }

    // Player.
    ctx.fillStyle = '#00ff00';
    const [px, py] = snap.playerTile;
    ctx.fillRect(px * scale - 1, py * scale - 1, scale + 1.5, scale + 1.5);
  }, [snap]);

  return (
    <div className="minimap-wrap">
      <canvas ref={ref} width={MINIMAP_SIZE} height={MINIMAP_SIZE} style={{ display: 'block' }} />
    </div>
  );
}
