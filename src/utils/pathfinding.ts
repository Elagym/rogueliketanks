import { TILE_SIZE } from '../game/constants';
import type { GameMap, Vec2 } from '../game/types';

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

/**
 * A* pathfinding over the tile grid. Returns a list of world-space waypoints
 * (tile centers) from `from` to `to`, or an empty array if unreachable.
 */
export function findPath(map: GameMap, from: Vec2, to: Vec2): Vec2[] {
  const w = map.width;
  const h = map.height;
  const sx = clampTile(Math.floor(from[0] / TILE_SIZE), w);
  const sy = clampTile(Math.floor(from[1] / TILE_SIZE), h);
  const tx = clampTile(Math.floor(to[0] / TILE_SIZE), w);
  const ty = clampTile(Math.floor(to[1] / TILE_SIZE), h);

  if (map.tiles[ty * w + tx] !== 0) {
    // Target tile blocked — find nearest walkable neighbour.
    const alt = nearestWalkable(map, tx, ty);
    if (!alt) return [];
    return findPath(map, from, [alt[0] * TILE_SIZE + 8, alt[1] * TILE_SIZE + 8]);
  }

  const open: Node[] = [];
  const closed = new Set<number>();
  const start: Node = { x: sx, y: sy, g: 0, f: heuristic(sx, sy, tx, ty), parent: null };
  open.push(start);

  let iterations = 0;
  const maxIter = w * h * 2;

  while (open.length && iterations++ < maxIter) {
    // Pop lowest f.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIdx].f) bestIdx = i;
    const cur = open.splice(bestIdx, 1)[0];

    if (cur.x === tx && cur.y === ty) return reconstruct(cur);
    closed.add(cur.y * w + cur.x);

    for (const [dx, dy] of NEIGHBORS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (map.tiles[ny * w + nx] !== 0) continue;
      // Prevent cutting diagonal corners.
      if (dx !== 0 && dy !== 0) {
        if (map.tiles[cur.y * w + nx] !== 0 || map.tiles[ny * w + cur.x] !== 0) continue;
      }
      const key = ny * w + nx;
      if (closed.has(key)) continue;
      const step = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const g = cur.g + step;
      const existing = open.find((o) => o.x === nx && o.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + heuristic(nx, ny, tx, ty);
          existing.parent = cur;
        }
      } else {
        open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny, tx, ty), parent: cur });
      }
    }
  }
  return [];
}

const NEIGHBORS: Vec2[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function heuristic(x: number, y: number, tx: number, ty: number): number {
  return Math.abs(x - tx) + Math.abs(y - ty);
}

function reconstruct(node: Node): Vec2[] {
  const path: Vec2[] = [];
  let cur: Node | null = node;
  while (cur) {
    path.unshift([cur.x * TILE_SIZE + TILE_SIZE / 2, cur.y * TILE_SIZE + TILE_SIZE / 2]);
    cur = cur.parent;
  }
  // Drop the starting tile center (we're already near it).
  if (path.length > 1) path.shift();
  return path;
}

function clampTile(v: number, max: number): number {
  return v < 0 ? 0 : v >= max ? max - 1 : v;
}

function nearestWalkable(map: GameMap, tx: number, ty: number): Vec2 | null {
  for (let r = 1; r < Math.max(map.width, map.height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        if (map.tiles[ny * map.width + nx] === 0) return [nx, ny];
      }
    }
  }
  return null;
}
