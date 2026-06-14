import * as THREE from 'three';
import {
  DIFFICULTY_MULT,
  ENEMY_AWARENESS,
  ENEMY_COLORS,
  ENEMY_ENGAGE_RANGE,
  FIRST_SPAWN_DELAY,
  MAX_ENEMIES,
  PLAYER_BASE_SPEED,
  PLAYER_MAX_HP,
  PLAYER_VISION,
  SCORE_PER_DAMAGE,
  SCORE_PER_KILL,
  SCORE_PER_PIXEL,
  SKINS,
  SPAWN_INTERVAL_MAX,
  SPAWN_INTERVAL_MIN,
  TANK_RADIUS,
  TILE_SIZE,
  TURRET_CHASSIS_LIMIT,
  WORLD_SIZE,
  ACCEL_TIME,
  DECEL_TIME,
} from './constants';
import { generateMap, isBlocked } from './mapgen';
import { createEnemy, fireDelayFor, pickEnemyType } from './enemies';
import { accuracyAt, buildPlayerWeapons } from './weapons';
import { Rng, randomSeed } from './rng';
import { createTankMesh, type TankMesh } from '../render/tankMesh';
import { AudioManager } from './audio';
import {
  angleDiff,
  angleTo,
  clamp,
  dist,
  normalize,
  rotateToward,
  snap8,
  TAU,
} from '../utils/math';
import { findPath } from '../utils/pathfinding';
import type {
  EnemyType,
  GameMap,
  HudSnapshot,
  Particle,
  Player,
  Settings,
  Tank,
  UnlockedUpgrades,
  Vec2,
  Weapon,
} from './types';

interface Tracer {
  a: Vec2;
  b: Vec2;
  life: number;
  color: string;
  width: number;
}
interface FloatText {
  pos: Vec2;
  text: string;
  life: number;
  color: string;
}

export interface EngineCallbacks {
  onGameOver: (stats: { score: number; kills: number; damageDealt: number; distance: number }) => void;
}

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private audio: AudioManager;
  private callbacks: EngineCallbacks;

  private map!: GameMap;
  private player!: Player;
  private enemies: Tank[] = [];
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private floats: FloatText[] = [];

  private meshes = new Map<string, TankMesh>();
  private wallMesh?: THREE.InstancedMesh;

  private unlocks!: UnlockedUpgrades;
  private rng!: Rng;
  private difficultyMult = 1;

  // run stats
  private score = 0;
  private kills = 0;
  private damageDealt = 0;
  private distance = 0;
  private seed = 0;

  // input
  private keys = new Set<string>();
  private mouseScreen: Vec2 = [0, 0];
  private mouseDown = false;
  private cursorWorld: Vec2 = [128, 128];

  // timers
  private spawnTimer = FIRST_SPAWN_DELAY;
  private shake = 0;
  private overheatedAnnounced = false;

  // loop
  private rafId = 0;
  private lastTime = 0;
  private running = false;
  private paused = false;
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;

  private cssW = 1;
  private cssH = 1;

  constructor(container: HTMLElement, audio: AudioManager, callbacks: EngineCallbacks) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('canvas');
    this.overlay.style.position = 'absolute';
    this.overlay.style.inset = '0';
    this.overlay.style.pointerEvents = 'none';
    container.appendChild(this.overlay);
    this.octx = this.overlay.getContext('2d')!;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f0d);
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 2000);

    this.setupLights();
    this.bindInput();
    this.resize();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xddeeff, 0.65);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
    // Center the light + shadow frustum on the fixed 256x256 world.
    sun.position.set(WORLD_SIZE / 2 + 100, 260, WORLD_SIZE / 2 + 70);
    sun.target.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 190;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 700;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  // ---- World / scene build ----
  private buildWorld(): void {
    // Clear previous scene objects (keep lights).
    for (const m of this.meshes.values()) this.scene.remove(m.group);
    this.meshes.clear();
    if (this.wallMesh) {
      this.scene.remove(this.wallMesh);
      this.wallMesh.dispose();
      this.wallMesh = undefined;
    }
    const old = this.scene.getObjectByName('ground');
    if (old) this.scene.remove(old);

    // Ground plane with pixel-art canvas texture.
    const tex = this.makeGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), groundMat);
    ground.name = 'ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Wall instanced boxes.
    const wallCount = this.map.tiles.filter((t) => t === 2).length;
    if (wallCount > 0) {
      const geo = new THREE.BoxGeometry(TILE_SIZE, 14, TILE_SIZE);
      const mat = new THREE.MeshStandardMaterial({ color: 0x6b6f72, roughness: 0.9, metalness: 0.1 });
      this.wallMesh = new THREE.InstancedMesh(geo, mat, wallCount);
      this.wallMesh.castShadow = true;
      this.wallMesh.receiveShadow = true;
      const dummy = new THREE.Object3D();
      let i = 0;
      for (let y = 0; y < this.map.height; y++) {
        for (let x = 0; x < this.map.width; x++) {
          if (this.map.tiles[y * this.map.width + x] === 2) {
            dummy.position.set(x * TILE_SIZE + TILE_SIZE / 2, 7, y * TILE_SIZE + TILE_SIZE / 2);
            dummy.updateMatrix();
            this.wallMesh.setMatrixAt(i++, dummy.matrix);
          }
        }
      }
      this.wallMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(this.wallMesh);
    }
  }

  private makeGroundTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = WORLD_SIZE;
    c.height = WORLD_SIZE;
    const g = c.getContext('2d')!;
    for (let ty = 0; ty < this.map.height; ty++) {
      for (let tx = 0; tx < this.map.width; tx++) {
        const t = this.map.tiles[ty * this.map.width + tx];
        // base color + subtle per-tile dithering for pixel-art feel
        const variant = ((tx * 7 + ty * 13) % 3) - 1;
        let base: [number, number, number];
        if (t === 1) base = [42, 86, 150];
        else if (t === 2) base = [70, 74, 78];
        else base = [58, 120, 52];
        g.fillStyle = `rgb(${base[0] + variant * 6}, ${base[1] + variant * 8}, ${base[2] + variant * 6})`;
        g.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        // tiny pixel noise
        if (t === 0) {
          g.fillStyle = `rgba(255,255,255,0.04)`;
          g.fillRect(tx * TILE_SIZE + ((tx * 5) % TILE_SIZE), ty * TILE_SIZE + ((ty * 3) % TILE_SIZE), 2, 2);
        }
      }
    }
    // Spawn marker at center
    g.strokeStyle = 'rgba(0,255,0,0.4)';
    g.lineWidth = 1;
    g.strokeRect(WORLD_SIZE / 2 - 10, WORLD_SIZE / 2 - 10, 20, 20);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private getMesh(tank: Tank): TankMesh {
    let m = this.meshes.get(tank.id);
    if (!m) {
      const color = tank.isPlayer ? SKINS[this.unlocks.selectedSkin] ?? SKINS.green : ENEMY_COLORS[tank.type];
      m = createTankMesh(color);
      this.scene.add(m.group);
      this.meshes.set(tank.id, m);
    }
    return m;
  }

  // ---- Run lifecycle ----
  start(seedInput: number | null, unlocks: UnlockedUpgrades, settings: Settings): void {
    this.unlocks = unlocks;
    this.seed = seedInput ?? randomSeed();
    this.rng = new Rng(this.seed);
    this.map = generateMap(this.seed);
    this.difficultyMult = DIFFICULTY_MULT[settings.difficulty];

    this.enemies = [];
    this.particles = [];
    this.tracers = [];
    this.floats = [];
    this.score = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.distance = 0;
    this.spawnTimer = FIRST_SPAWN_DELAY;
    this.shake = 0;
    this.overheatedAnnounced = false;

    // Player setup with unlocks applied.
    let maxHp = PLAYER_MAX_HP;
    if (unlocks.tank.hp1) maxHp += 20;
    if (unlocks.tank.hp2) maxHp += 20;
    let speed = PLAYER_BASE_SPEED;
    if (unlocks.tank.speed) speed *= 1.15;
    let vision = PLAYER_VISION;
    if (unlocks.tank.vision) vision += 10;
    if (unlocks.modifiers.fogNight) vision *= 0.7;

    const weapons = buildPlayerWeapons(unlocks);
    if (unlocks.modifiers.artillery) {
      for (const w of weapons) {
        w.baseAccuracy *= 0.8;
        w.minAccuracy *= 0.8;
      }
    }

    this.player = {
      id: 'player',
      isPlayer: true,
      type: 'player',
      position: [WORLD_SIZE / 2, WORLD_SIZE / 2],
      velocity: [0, 0],
      angle: 0,
      turretAngle: 0,
      hp: maxHp,
      maxHp,
      speed,
      radius: TANK_RADIUS,
      weapon: weapons[0],
      hitFlash: 0,
      weapons,
      selectedWeapon: 0,
      visionRange: vision,
    };

    // Reset mesh map fully (new skin/colors).
    for (const m of this.meshes.values()) this.scene.remove(m.group);
    this.meshes.clear();

    this.buildWorld();
    this.resize();
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    this.audio.startMusic();
    cancelAnimationFrame(this.rafId);
    this.loop(this.lastTime);
  }

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    if (!this.running) return;
    this.paused = false;
    this.lastTime = performance.now();
  }

  setSettings(s: Settings): void {
    if (this.player) this.difficultyMult = DIFFICULTY_MULT[s.difficulty];
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.audio.stopMusic();
  }

  dispose(): void {
    this.stop();
    this.unbindInput();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }

  // ---- Input ----
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === '1' || k === '2' || k === '3') {
      this.selectWeapon((parseInt(k, 10) - 1) as 0 | 1 | 2);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onMouseMove = (e: MouseEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.mouseScreen = [e.clientX - rect.left, e.clientY - rect.top];
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseDown = true;
      this.audio.resume();
    }
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.player) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.selectWeapon((((this.player.selectedWeapon + dir + 3) % 3) as 0 | 1 | 2));
  };

  private selectWeapon(idx: 0 | 1 | 2): void {
    if (!this.player) return;
    this.player.selectedWeapon = idx;
    this.player.weapon = this.player.weapons[idx];
    this.audio.play('click');
  }

  private bindInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.container.addEventListener('wheel', this.onWheel, { passive: true });
  }
  private unbindInput(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.container.removeEventListener('wheel', this.onWheel);
  }

  resize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.cssW = w;
    this.cssH = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.overlay.width = w * dpr;
    this.overlay.height = h * dpr;
    this.overlay.style.width = `${w}px`;
    this.overlay.style.height = `${h}px`;
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Orthographic frustum: show ~180px tall region.
    const viewHeight = 170;
    const aspect = w / h;
    const viewWidth = viewHeight * aspect;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  // ---- Main loop ----
  private loop = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Clamp dt so a backgrounded tab doesn't fast-forward the sim.
    dt = clamp(dt, 0, 0.05);

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    if (!this.paused && dt > 0) this.update(dt);
    this.render();
  };

  private update(dt: number): void {
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateSpawning(dt);
    this.updateParticles(dt);
    this.updateExploration();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2);

    // Score recompute.
    this.score = Math.floor(
      this.kills * SCORE_PER_KILL + this.damageDealt * SCORE_PER_DAMAGE + this.distance * SCORE_PER_PIXEL,
    );

    if (this.player.hp <= 0) this.handleDeath();
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    // Desired movement vector from WASD (screen-aligned; +x right, +y down).
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w')) dy -= 1;
    if (this.keys.has('s')) dy += 1;
    if (this.keys.has('a')) dx -= 1;
    if (this.keys.has('d')) dx += 1;
    const moving = dx !== 0 || dy !== 0;
    const targetVel: Vec2 = [0, 0];
    if (moving) {
      const n = normalize([dx, dy]);
      targetVel[0] = n[0] * p.speed;
      targetVel[1] = n[1] * p.speed;
    }
    // Momentum: accelerate / decelerate toward target velocity.
    const rate = moving ? dt / ACCEL_TIME : dt / DECEL_TIME;
    p.velocity[0] += (targetVel[0] - p.velocity[0]) * Math.min(1, rate * 3);
    p.velocity[1] += (targetVel[1] - p.velocity[1]) * Math.min(1, rate * 3);

    const moved = this.moveWithCollision(p, dt);
    this.distance += moved;

    // Body rotates toward movement direction (8-dir snap).
    const speed2 = p.velocity[0] ** 2 + p.velocity[1] ** 2;
    if (speed2 > 25) {
      const targetAngle = snap8(Math.atan2(p.velocity[1], p.velocity[0]));
      p.angle = rotateToward(p.angle, targetAngle, dt * 8);
    }

    // Turret aims at cursor, clamped to ±120° of body.
    this.cursorWorld = this.screenToGround(this.mouseScreen);
    let desiredTurret = angleTo(p.position, this.cursorWorld);
    const rel = angleDiff(desiredTurret, p.angle);
    if (rel > TURRET_CHASSIS_LIMIT) desiredTurret = p.angle + TURRET_CHASSIS_LIMIT;
    else if (rel < -TURRET_CHASSIS_LIMIT) desiredTurret = p.angle - TURRET_CHASSIS_LIMIT;
    p.turretAngle = rotateToward(p.turretAngle, desiredTurret, dt * 12);

    // Weapon cooldown + heat.
    const w = p.weapon;
    if (w.cooldownRemaining > 0) w.cooldownRemaining = Math.max(0, w.cooldownRemaining - dt);
    if (w.overheats) {
      if (w.overheated) {
        w.heat = Math.max(0, w.heat - dt / 2); // 2s cooldown to clear
        if (w.heat <= 0) {
          w.overheated = false;
          this.overheatedAnnounced = false;
        }
      } else {
        w.heat = Math.max(0, w.heat - dt * 0.4); // passive cool
      }
    }

    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt * 3);

    // Fire.
    if (this.mouseDown) this.tryPlayerFire();
  }

  private tryPlayerFire(): void {
    const p = this.player;
    const w = p.weapon;
    if (w.cooldownRemaining > 0 || w.overheated) return;

    const origin = this.barrelTip(p);
    const angle = p.turretAngle;
    this.fireShot(origin, angle, w, true);
    w.cooldownRemaining = w.fireInterval;

    // Heat handling for rapid.
    if (w.overheats) {
      w.heat += 1 / 8; // 8 shots => full
      if (w.heat >= 1) {
        w.overheated = true;
        w.heat = 1;
        if (!this.overheatedAnnounced) {
          this.audio.play('overheat');
          this.overheatedAnnounced = true;
          this.addFloat(p.position, 'OVERHEAT', '#ff5050');
        }
      }
    }

    if (w.type === 'rapid') this.audio.play('shoot_rapid');
    else if (w.type === 'longrange') this.audio.play('shoot_long');
    else this.audio.play('shoot_explosive');
    this.shake = Math.max(this.shake, w.type === 'explosive' ? 0.6 : w.type === 'longrange' ? 0.4 : 0.2);
  }

  /** Resolve an instant-hit shot. fromPlayer toggles which side takes damage. */
  private fireShot(origin: Vec2, angle: number, weapon: Weapon, fromPlayer: boolean): void {
    const dir: Vec2 = [Math.cos(angle), Math.sin(angle)];
    const targets = fromPlayer ? this.enemies : [this.player];

    // Find first target along the ray within corridor + maxRange.
    let best: Tank | null = null;
    let bestT = Infinity;
    const wallT = this.rayWallDistance(origin, dir, weapon.maxRange);
    for (const t of targets) {
      const rel: Vec2 = [t.position[0] - origin[0], t.position[1] - origin[1]];
      const proj = rel[0] * dir[0] + rel[1] * dir[1];
      if (proj <= 0 || proj > weapon.maxRange || proj > wallT) continue;
      const perp = Math.abs(rel[0] * -dir[1] + rel[1] * dir[0]);
      if (perp <= t.radius + 3 && proj < bestT) {
        bestT = proj;
        best = t;
      }
    }

    const impactDist = Math.min(best ? bestT : weapon.maxRange, wallT);
    const impact: Vec2 = [origin[0] + dir[0] * impactDist, origin[1] + dir[1] * impactDist];

    if (weapon.splashRadius > 0) {
      // Explosive: detonate at impact, splash regardless of direct hit roll.
      this.tracers.push({ a: origin, b: impact, life: 0.08, color: fromPlayer ? '#ffd060' : '#ff80ff', width: 2 });
      this.explodeAt(impact, weapon, fromPlayer);
      return;
    }

    // Ballistic weapons: roll accuracy if a target is in the corridor.
    const color = fromPlayer ? '#ffe070' : '#ff6060';
    if (best) {
      const acc = accuracyAt(weapon, bestT);
      const hit = this.rng.next() <= acc;
      if (hit) {
        this.tracers.push({ a: origin, b: best.position, life: 0.07, color, width: fromPlayer ? 1.5 : 1.5 });
        this.applyDamage(best, weapon.damage, fromPlayer);
        this.audio.play('hit');
        this.spawnParticles(best.position, 'spark', 8, color);
      } else {
        // Miss: tracer flies past, dust near target.
        const missEnd: Vec2 = [origin[0] + dir[0] * impactDist, origin[1] + dir[1] * impactDist];
        this.tracers.push({ a: origin, b: missEnd, life: 0.07, color, width: 1 });
        this.spawnParticles(best.position, 'dust', 4, '#cccccc');
        this.audio.play('miss');
      }
    } else {
      this.tracers.push({ a: origin, b: impact, life: 0.07, color, width: 1 });
      if (impactDist >= wallT) this.spawnParticles(impact, 'dust', 3, '#aaaaaa');
    }
  }

  private explodeAt(center: Vec2, weapon: Weapon, fromPlayer: boolean): void {
    this.spawnParticles(center, 'flash', 14, '#ffcf60');
    this.spawnParticles(center, 'smoke', 8, '#555555');
    this.audio.play('explosion');
    this.shake = Math.max(this.shake, 0.7);
    const victims = fromPlayer ? this.enemies : [this.player];
    for (const t of victims) {
      const d = dist(center, t.position);
      if (d <= 4) {
        // direct-ish hit
        this.applyDamage(t, weapon.damage, fromPlayer);
      } else if (d <= weapon.splashRadius) {
        const falloff = 1 - d / weapon.splashRadius;
        this.applyDamage(t, Math.round(weapon.splashDamage * falloff), fromPlayer);
      }
    }
  }

  private applyDamage(target: Tank, amount: number, fromPlayer: boolean): void {
    if (amount <= 0) return;
    target.hp -= amount;
    target.hitFlash = 1;
    this.addFloat([target.position[0], target.position[1] - 8], `-${amount}`, fromPlayer ? '#ffffff' : '#ff6060');
    if (fromPlayer) {
      this.damageDealt += amount;
    } else if (target.isPlayer) {
      this.shake = Math.max(this.shake, 0.5);
    }
    if (target.hp <= 0) {
      if (target.isPlayer) return; // death handled in update
      this.killEnemy(target);
    }
  }

  private killEnemy(enemy: Tank): void {
    this.kills++;
    this.spawnParticles(enemy.position, 'flash', 16, '#ffb040');
    this.spawnParticles(enemy.position, 'debris', 10, '#444444');
    this.audio.play('explosion');
    this.shake = Math.max(this.shake, 0.5);
    const mesh = this.meshes.get(enemy.id);
    if (mesh) {
      this.scene.remove(mesh.group);
      this.meshes.delete(enemy.id);
    }
    this.enemies = this.enemies.filter((e) => e.id !== enemy.id);
    // Spawn replacement quickly when one dies (if below cap).
    if (this.enemies.length < MAX_ENEMIES) this.spawnTimer = Math.min(this.spawnTimer, 1.5);
  }

  // ---- Enemy AI ----
  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      const ai = e.ai!;
      const d = dist(e.position, p.position);
      const canSee = d <= ENEMY_AWARENESS && this.hasLineOfSight(e.position, p.position);
      if (canSee) ai.lastSeenPlayer = true;

      // Mode selection.
      if (ai.evadeTimer > 0) {
        ai.mode = 'evade';
        ai.evadeTimer -= dt;
      } else if (canSee || (ai.lastSeenPlayer && d < ENEMY_ENGAGE_RANGE)) {
        if (ai.mode !== 'engage') {
          ai.fireDelayTimer = fireDelayFor(e.type as EnemyType, this.kills);
        }
        ai.mode = 'engage';
      } else {
        ai.mode = 'idle';
      }

      // Repath periodically.
      ai.pathTimer -= dt;
      if (ai.pathTimer <= 0) {
        ai.pathTimer = 0.5;
        if (ai.mode === 'engage') {
          // Snipers keep their distance.
          if (e.type === 'sniper' && d < 130) {
            const away: Vec2 = [e.position[0] - p.position[0], e.position[1] - p.position[1]];
            const n = normalize(away);
            ai.target = [e.position[0] + n[0] * 60, e.position[1] + n[1] * 60];
          } else {
            ai.target = [p.position[0], p.position[1]];
          }
          ai.path = findPath(this.map, e.position, ai.target);
        } else if (ai.mode === 'idle') {
          ai.patrolTimer -= 0.5;
          if (ai.patrolTimer <= 0 || ai.path.length === 0) {
            ai.patrolTimer = this.rng.range(2, 5);
            ai.target = this.randomWalkable();
            ai.path = findPath(this.map, e.position, ai.target);
          }
        }
      }

      // Movement.
      let moveDir: Vec2 = [0, 0];
      if (ai.mode === 'evade') {
        moveDir = ai.evadeDir;
      } else if (ai.path.length > 0) {
        const wp = ai.path[0];
        const dd = dist(e.position, wp);
        if (dd < 5) ai.path.shift();
        else moveDir = normalize([wp[0] - e.position[0], wp[1] - e.position[1]]);
      }
      // Heavy charges straight at player when close.
      if (e.type === 'heavy' && ai.mode === 'engage' && d < ENEMY_ENGAGE_RANGE) {
        moveDir = normalize([p.position[0] - e.position[0], p.position[1] - e.position[1]]);
      }

      e.velocity[0] = moveDir[0] * e.speed;
      e.velocity[1] = moveDir[1] * e.speed;
      // Scouts wobble erratically.
      if (e.type === 'scout' && ai.mode === 'engage') {
        const wob = Math.sin(performance.now() / 120 + e.position[0]) * 0.5;
        const perp: Vec2 = [-moveDir[1], moveDir[0]];
        e.velocity[0] += perp[0] * e.speed * wob;
        e.velocity[1] += perp[1] * e.speed * wob;
      }
      this.moveWithCollision(e, dt);

      // Facing + turret toward player when engaging.
      if (e.velocity[0] !== 0 || e.velocity[1] !== 0) {
        e.angle = rotateToward(e.angle, Math.atan2(e.velocity[1], e.velocity[0]), dt * 5);
      }
      const aimAngle = ai.mode === 'engage' ? angleTo(e.position, p.position) : e.angle;
      e.turretAngle = rotateToward(e.turretAngle, aimAngle, dt * 6);

      // Combat.
      if (e.weapon.cooldownRemaining > 0) e.weapon.cooldownRemaining -= dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 3);
      if (ai.mode === 'engage' && d < ENEMY_ENGAGE_RANGE && canSee) {
        ai.fireDelayTimer -= dt;
        const aligned = Math.abs(angleDiff(e.turretAngle, angleTo(e.position, p.position))) < 0.2;
        if (ai.fireDelayTimer <= 0 && e.weapon.cooldownRemaining <= 0 && aligned) {
          this.fireShot(this.barrelTip(e), e.turretAngle, e.weapon, false);
          e.weapon.cooldownRemaining = e.weapon.fireInterval;
          this.audio.play('enemy_shot');
        }
      }
    }
  }

  private updateSpawning(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < MAX_ENEMIES) {
      this.spawnEnemy();
      this.spawnTimer = this.rng.range(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX);
    }
  }

  private spawnEnemy(): void {
    const pos = this.findSpawnPos();
    if (!pos) return;
    const type = pickEnemyType(this.kills, this.rng.next(), this.rng.next(), this.kills >= 1);
    const hardMode = this.unlocks.modifiers.hardMode;
    const e = createEnemy(type, pos, this.kills, this.difficultyMult, hardMode);
    this.enemies.push(e);
  }

  private findSpawnPos(): Vec2 | null {
    for (let attempt = 0; attempt < 40; attempt++) {
      const tx = this.rng.int(0, this.map.width - 1);
      const ty = this.rng.int(0, this.map.height - 1);
      if (this.map.tiles[ty * this.map.width + tx] !== 0) continue;
      const pos: Vec2 = [tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2];
      const d = dist(pos, this.player.position);
      if (d < 100) continue; // must be >100px away
      if (d < this.player.visionRange + 20) continue; // prefer outside vision/fog
      return pos;
    }
    return null;
  }

  // ---- Physics ----
  private moveWithCollision(tank: Tank, dt: number): number {
    const nx = tank.position[0] + tank.velocity[0] * dt;
    const ny = tank.position[1] + tank.velocity[1] * dt;
    const r = tank.radius;
    let fx = tank.position[0];
    let fy = tank.position[1];
    // Axis-separated sliding collision.
    if (!this.circleBlocked(nx, tank.position[1], r)) fx = nx;
    else tank.velocity[0] = 0;
    if (!this.circleBlocked(fx, ny, r)) fy = ny;
    else tank.velocity[1] = 0;
    // World bounds.
    fx = clamp(fx, r, WORLD_SIZE - r);
    fy = clamp(fy, r, WORLD_SIZE - r);
    const moved = Math.hypot(fx - tank.position[0], fy - tank.position[1]);
    tank.position[0] = fx;
    tank.position[1] = fy;
    return moved;
  }

  private circleBlocked(x: number, y: number, r: number): boolean {
    return (
      isBlocked(this.map, x - r, y - r) ||
      isBlocked(this.map, x + r, y - r) ||
      isBlocked(this.map, x - r, y + r) ||
      isBlocked(this.map, x + r, y + r)
    );
  }

  private rayWallDistance(origin: Vec2, dir: Vec2, maxDist: number): number {
    const step = 4;
    for (let d = step; d <= maxDist; d += step) {
      const x = origin[0] + dir[0] * d;
      const y = origin[1] + dir[1] * d;
      if (x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE) return d;
      if (isBlocked(this.map, x, y)) return d;
    }
    return maxDist;
  }

  private hasLineOfSight(a: Vec2, b: Vec2): boolean {
    const d = dist(a, b);
    const dir = normalize([b[0] - a[0], b[1] - a[1]]);
    const wall = this.rayWallDistance(a, dir, d);
    return wall >= d - 2;
  }

  // ---- Particles / floats ----
  private spawnParticles(pos: Vec2, kind: Particle['kind'], count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, TAU);
      const spd = this.rng.range(20, kind === 'flash' ? 90 : 60);
      this.particles.push({
        position: [pos[0], pos[1]],
        velocity: [Math.cos(a) * spd, Math.sin(a) * spd],
        life: this.rng.range(0.25, kind === 'smoke' ? 0.9 : 0.5),
        maxLife: 0.6,
        size: kind === 'flash' ? this.rng.range(3, 6) : this.rng.range(1.5, 3.5),
        color,
        kind,
      });
    }
  }

  private addFloat(pos: Vec2, text: string, color: string): void {
    this.floats.push({ pos: [pos[0], pos[1]], text, life: 0.8, color });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.position[0] += p.velocity[0] * dt;
      p.position[1] += p.velocity[1] * dt;
      p.velocity[0] *= 0.92;
      p.velocity[1] *= 0.92;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const f of this.floats) {
      f.pos[1] -= dt * 12;
      f.life -= dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  private updateExploration(): void {
    const p = this.player;
    const vr = p.visionRange;
    const minTx = Math.max(0, Math.floor((p.position[0] - vr) / TILE_SIZE));
    const maxTx = Math.min(this.map.width - 1, Math.floor((p.position[0] + vr) / TILE_SIZE));
    const minTy = Math.max(0, Math.floor((p.position[1] - vr) / TILE_SIZE));
    const maxTy = Math.min(this.map.height - 1, Math.floor((p.position[1] + vr) / TILE_SIZE));
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const cx = tx * TILE_SIZE + TILE_SIZE / 2;
        const cy = ty * TILE_SIZE + TILE_SIZE / 2;
        if (dist([cx, cy], p.position) <= vr) this.map.explored[ty * this.map.width + tx] = true;
      }
    }
  }

  // ---- Death ----
  private handleDeath(): void {
    this.spawnParticles(this.player.position, 'flash', 24, '#ff9030');
    this.spawnParticles(this.player.position, 'smoke', 14, '#444');
    this.audio.play('gameover');
    this.render(); // show the final explosion frame
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.audio.stopMusic();
    // Brief delay so the final render shows the explosion.
    window.setTimeout(() => {
      this.callbacks.onGameOver({
        score: this.score,
        kills: this.kills,
        damageDealt: this.damageDealt,
        distance: Math.floor(this.distance),
      });
    }, 700);
  }

  // ---- Helpers ----
  private barrelTip(tank: Tank): Vec2 {
    return [tank.position[0] + Math.cos(tank.turretAngle) * 11, tank.position[1] + Math.sin(tank.turretAngle) * 11];
  }

  private randomWalkable(): Vec2 {
    for (let i = 0; i < 30; i++) {
      const tx = this.rng.int(0, this.map.width - 1);
      const ty = this.rng.int(0, this.map.height - 1);
      if (this.map.tiles[ty * this.map.width + tx] === 0) {
        return [tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2];
      }
    }
    return [WORLD_SIZE / 2, WORLD_SIZE / 2];
  }

  private screenToGround(screen: Vec2): Vec2 {
    const ndc = new THREE.Vector2((screen[0] / this.cssW) * 2 - 1, -(screen[1] / this.cssH) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(plane, hit);
    if (!hit) return this.player.position;
    return [hit.x, hit.z];
  }

  private worldToScreen(wx: number, wy: number, wyHeight = 0): Vec2 {
    const v = new THREE.Vector3(wx, wyHeight, wy);
    v.project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.cssW, (-v.y * 0.5 + 0.5) * this.cssH];
  }

  // ---- Render ----
  private render(): void {
    const p = this.player;
    if (!p) return;

    // Camera follow with isometric offset + screen shake.
    const shx = (this.rng ? (Math.random() - 0.5) : 0) * this.shake * 8;
    const shz = (Math.random() - 0.5) * this.shake * 8;
    const targetX = p.position[0] + shx;
    const targetZ = p.position[1] + shz;
    this.camera.position.set(targetX + 90, 170, targetZ + 150);
    this.camera.lookAt(targetX, 0, targetZ);

    // Sync tank meshes.
    this.syncMesh(p);
    for (const e of this.enemies) this.syncMesh(e);

    this.renderer.render(this.scene, this.camera);
    this.renderOverlay();
  }

  private syncMesh(tank: Tank): void {
    const m = this.getMesh(tank);
    m.group.position.set(tank.position[0], 0, tank.position[1]);
    m.group.rotation.y = -tank.angle;
    m.turret.rotation.y = tank.angle - tank.turretAngle;
    m.setHitFlash(tank.hitFlash * 0.8);
  }

  private renderOverlay(): void {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    // Tracers.
    for (const t of this.tracers) {
      const a = this.worldToScreen(t.a[0], t.a[1], 7);
      const b = this.worldToScreen(t.b[0], t.b[1], 7);
      ctx.globalAlpha = clamp(t.life / 0.08, 0, 1);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = t.width;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Particles.
    const scale = this.screenScale();
    for (const p of this.particles) {
      const s = this.worldToScreen(p.position[0], p.position[1], 4);
      ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
      ctx.fillStyle = p.color;
      const sz = p.size * scale;
      if (p.kind === 'smoke') {
        ctx.beginPath();
        ctx.arc(s[0], s[1], sz, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillRect(s[0] - sz / 2, s[1] - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // Floating text.
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const s = this.worldToScreen(f.pos[0], f.pos[1], 8);
      ctx.globalAlpha = clamp(f.life / 0.8, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s[0], s[1]);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // Turret aim indicator line (player) + range ring.
    const p = this.player;
    const o = this.worldToScreen(p.position[0], p.position[1], 7);
    const tip = this.worldToScreen(
      p.position[0] + Math.cos(p.turretAngle) * 40,
      p.position[1] + Math.sin(p.turretAngle) * 40,
      7,
    );
    ctx.strokeStyle = 'rgba(0,255,0,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fog of war: darken the area outside the vision radius.
    this.renderFog(o);
  }

  private screenScale(): number {
    const a = this.worldToScreen(0, 0, 0);
    const b = this.worldToScreen(10, 0, 0);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
  }

  private renderFog(playerScreen: Vec2): void {
    const ctx = this.octx;
    const radius = this.player.visionRange * this.screenScale();
    const grad = ctx.createRadialGradient(
      playerScreen[0],
      playerScreen[1],
      radius * 0.55,
      playerScreen[0],
      playerScreen[1],
      radius * 1.35,
    );
    grad.addColorStop(0, 'rgba(5,8,5,0)');
    grad.addColorStop(0.8, 'rgba(5,8,5,0.35)');
    grad.addColorStop(1, 'rgba(3,5,3,0.62)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    // Vision ring.
    ctx.strokeStyle = 'rgba(0,255,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(playerScreen[0], playerScreen[1], radius, 0, TAU);
    ctx.stroke();
  }

  // ---- HUD snapshot ----
  getSnapshot(): HudSnapshot {
    const p = this.player;
    let nearest: number | null = null;
    for (const e of this.enemies) {
      const d = dist(p.position, e.position);
      if (nearest === null || d < nearest) nearest = d;
    }
    const w = p.weapon;
    const acc = nearest !== null ? accuracyAt(w, nearest) : null;
    const enemyTiles: Vec2[] = this.enemies
      .filter((e) => dist(e.position, p.position) <= p.visionRange + 10)
      .map((e) => [Math.floor(e.position[0] / TILE_SIZE), Math.floor(e.position[1] / TILE_SIZE)]);

    return {
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      score: this.score,
      kills: this.kills,
      selectedWeapon: p.selectedWeapon,
      weapons: p.weapons.map((wp) => ({
        name: wp.name,
        type: wp.type,
        cooldownRemaining: wp.cooldownRemaining,
        reloadTime: wp.reloadTime,
        heat: wp.heat,
        overheated: wp.overheated,
      })),
      nearestEnemyDist: nearest,
      currentAccuracy: acc,
      difficultyMultiplier: this.difficultyMult * (1 + Math.floor(this.kills / 3) * 0.05),
      seed: this.seed,
      fps: this.fps,
      distanceTraveled: Math.floor(this.distance),
      mapTiles: this.map.tiles,
      mapExplored: this.map.explored,
      mapW: this.map.width,
      mapH: this.map.height,
      playerTile: [Math.floor(p.position[0] / TILE_SIZE), Math.floor(p.position[1] / TILE_SIZE)],
      enemyTiles,
    };
  }
}
