# Roguelike Tanks

A browser-based top-down **roguelike tank combat** game. Navigate a procedurally
generated 256×256 pixel-art battlefield, discover enemies hidden in the fog of
war, and use distance-based ballistics to survive as long as you can. Permadeath
ends every run — but you keep your tech points and unlock permanent upgrades for
the next one.

Play it live: **https://elagym.github.io/rogueliketanks/** (after deploying — see below).

![Roguelike Tanks](public/favicon.svg)

## Controls

| Action | Input |
| --- | --- |
| Move | `W` `A` `S` `D` / arrow keys (momentum-based) |
| Aim | Mouse — a reticle shows exactly where the shell will land |
| Fire | Left click / hold (wind-up → shell arcs → reload) |
| Switch weapon | `1` / `2` / `3` or mouse wheel |
| Pause | `Esc` |

## Gameplay

This is **artillery combat on a large battlefield**. Tanks are deliberate and
slow; engagements are won by positioning and timing, not twitch aim.

- **Aim → charge → lob → reload.** Place the reticle, hold fire to wind up
  (charge), and the gun lobs an **arcing shell** that travels to the aim point
  and explodes. Then it reloads. Where you put the reticle is where the shell
  lands (within a scatter that shrinks with the accuracy upgrade) — so aiming is
  WYSIWYG, not a hidden hit/miss roll.
- **Three artillery pieces:** Field Gun (quick, short range/charge), Siege Cannon
  (balanced long range), Heavy Artillery (longest range, huge blast, slow). The
  HUD shows range, in/out-of-range, charge %, and reload.
- **Telegraphed incoming fire.** Enemy shells project a **landing marker** on the
  ground during their wind-up and flight, giving you time to drive clear.
- **Four enemy types:** Scout, Standard, Heavy and Sniper, each with distinct
  HP, speed, weapons and AI (long-range duelling, standoff kiting, sniper
  distance-keeping, heavy charges).
- **Difficulty scaling:** enemies grow stronger every 3 kills, accelerating past
  12 kills.
- **Fog of war:** 80px vision radius; explored terrain is remembered on the
  minimap.
- **Permadeath + persistence:** earn tech points each run and spend them in the
  Unlocks menu on tank/weapon upgrades. Cosmetic skins unlock at score
  milestones. Everything persists in `localStorage`.
- **Seeded maps:** enter a seed for a deterministic, repeatable battlefield, or
  leave it blank for a random one.

## Tech stack

- **React 18 + TypeScript** for UI, menus and HUD.
- **Three.js** for 3D tank rendering (procedural low-poly chassis + independent
  turret) with an orthographic isometric camera and real-time shadows.
- **Canvas 2D** overlay for tracers, particles, floating damage, fog of war and
  the minimap.
- **Web Audio API** for fully synthesized, mutable SFX + a procedural chiptune
  loop (no binary audio assets shipped).
- **seedrandom** for deterministic procedural map generation (value noise +
  cellular-automaton smoothing + A* reachability guarantee).
- **Vite** for bundling and hot reload.

### Notes / deviations from the spec

A few pragmatic choices keep the game fully self-contained (no external binary
assets) while honouring the design intent:

- The 3D tank is built procedurally from Three.js primitives instead of loading a
  GLB file (still a real 3D model with an independently rotating turret).
- Audio is synthesized via the Web Audio API (the spec lists this as an accepted
  alternative to Howler.js).
- The game loop runs on a mutable engine + `requestAnimationFrame` rather than
  dispatching a React reducer every frame, for 60 FPS performance; React still
  owns all menus and the HUD (snapshot-polled at 20 Hz).

## Development

```bash
npm install
npm run dev        # start dev server (http://localhost:5173)
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
```

Requires Node.js 18+.

## Deployment (GitHub Pages)

`vite.config.ts` uses a relative `base: './'`, so the production build works from
any sub-path. To publish:

```bash
npm run build
# push the contents of dist/ to the gh-pages branch, or use an action.
```

Then enable GitHub Pages for the repository.

## License

MIT — see `LICENSE`.
