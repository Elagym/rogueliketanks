import { GRID, TILE_SIZE } from './constants';
import { Rng } from './rng';
import type { GameMap, TileType, Vec2 } from './types';

/**
 * Seeded procedural map generation using seeded value-noise + a cellular
 * automaton smoothing pass. Produces grass (0), water (1) and walls (2).
 * Guarantees the central spawn area is walkable and reachable.
 */
export function generateMap(seed: number): GameMap {
  const rng = new Rng(seed);
  const n = GRID * GRID;

  // 1. Value-noise base field. Generate coarse lattice and bilinearly sample.
  const latticeSize = 6;
  const lattice: number[] = [];
  for (let i = 0; i < latticeSize * latticeSize; i++) lattice.push(rng.next());

  const sampleNoise = (gx: number, gy: number): number => {
    const fx = (gx / GRID) * (latticeSize - 1);
    const fy = (gy / GRID) * (latticeSize - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, latticeSize - 1);
    const y1 = Math.min(y0 + 1, latticeSize - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = lattice[y0 * latticeSize + x0];
    const b = lattice[y0 * latticeSize + x1];
    const c = lattice[y1 * latticeSize + x0];
    const d = lattice[y1 * latticeSize + x1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };

  let tiles: TileType[] = new Array(n).fill(0);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x;
      const v = sampleNoise(x, y);
      if (v < 0.32) {
        tiles[idx] = 1; // water in low areas
      } else if (v > 0.74 && rng.bool(0.7)) {
        tiles[idx] = 2; // walls in high areas
      } else {
        tiles[idx] = 0; // grass
      }
    }
  }

  // Scatter some additional standalone walls for cover, avoiding clusters.
  const wallTarget = Math.floor(n * 0.08);
  for (let i = 0; i < wallTarget; i++) {
    const x = rng.int(0, GRID - 1);
    const y = rng.int(0, GRID - 1);
    const idx = y * GRID + x;
    if (tiles[idx] === 0 && countNeighbors(tiles, x, y, 2) < 2) {
      tiles[idx] = 2;
    }
  }

  // 2. Cellular automaton smoothing pass (connects/cleans terrain).
  tiles = smooth(tiles);

  // 3. Clear a guaranteed walkable spawn area at the center.
  const center = Math.floor(GRID / 2);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = center + dx;
      const y = center + dy;
      if (x >= 0 && x < GRID && y >= 0 && y < GRID) {
        tiles[y * GRID + x] = 0;
      }
    }
  }

  // 4. Flood fill from center; convert unreachable grass to walls so the
  //    player can never get stranded in a sealed pocket.
  const reachable = floodFill(tiles, center, center);
  for (let i = 0; i < n; i++) {
    if (tiles[i] === 0 && !reachable[i]) tiles[i] = 2;
  }

  return {
    seed,
    width: GRID,
    height: GRID,
    tiles,
    explored: new Array(n).fill(false),
  };
}

function countNeighbors(tiles: TileType[], x: number, y: number, type: TileType): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      if (tiles[ny * GRID + nx] === type) count++;
    }
  }
  return count;
}

function smooth(tiles: TileType[]): TileType[] {
  const out = tiles.slice();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x;
      const walls = countNeighbors(tiles, x, y, 2);
      const water = countNeighbors(tiles, x, y, 1);
      if (tiles[idx] === 0) {
        // Lone-ish grass surrounded by walls becomes wall.
        if (walls >= 5) out[idx] = 2;
      } else if (tiles[idx] === 2) {
        // Isolated wall becomes grass.
        if (walls <= 1) out[idx] = 0;
      } else if (tiles[idx] === 1) {
        if (water <= 1) out[idx] = 0;
      }
    }
  }
  return out;
}

function floodFill(tiles: TileType[], sx: number, sy: number): boolean[] {
  const visited = new Array(GRID * GRID).fill(false);
  const stack: Vec2[] = [[sx, sy]];
  visited[sy * GRID + sx] = true;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const dirs: Vec2[] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of dirs) {
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const ni = ny * GRID + nx;
      if (!visited[ni] && tiles[ni] === 0) {
        visited[ni] = true;
        stack.push([nx, ny]);
      }
    }
  }
  return visited;
}

export function isBlocked(map: GameMap, worldX: number, worldY: number): boolean {
  const tx = Math.floor(worldX / TILE_SIZE);
  const ty = Math.floor(worldY / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
  return map.tiles[ty * map.width + tx] !== 0;
}

export function tileAt(map: GameMap, worldX: number, worldY: number): TileType | null {
  const tx = Math.floor(worldX / TILE_SIZE);
  const ty = Math.floor(worldY / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  return map.tiles[ty * map.width + tx];
}
