// Seedable random number helpers. A swappable generator makes the engine testable.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let current: Rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

export const setSeed = (s: number) => { current = mulberry32(s); };
export const rand = (): number => current();
export const randInt = (a: number, b: number): number => Math.floor(rand() * (b - a + 1)) + a;
export const chance = (p: number): boolean => rand() < p;
export const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function weighted<T>(items: T[], w: (t: T) => number): T {
  let total = 0;
  const ws = items.map((i) => { const x = Math.max(0, w(i)); total += x; return x; });
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Deterministic 0..1 value from a string (stable per-player prices / demands).
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
