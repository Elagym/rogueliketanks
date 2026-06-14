import type { Vec2 } from '../game/types';

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to[1] - from[1], to[0] - from[0]);
}

/** Smallest signed difference a - b wrapped to [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotate `current` toward `target` by at most `maxStep` radians. */
export function rotateToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Snap an angle to the nearest of 8 directions. */
export function snap8(angle: number): number {
  const step = TAU / 8;
  return Math.round(angle / step) * step;
}

export function lenVec(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

export function normalize(v: Vec2): Vec2 {
  const l = lenVec(v);
  if (l === 0) return [0, 0];
  return [v[0] / l, v[1] / l];
}
