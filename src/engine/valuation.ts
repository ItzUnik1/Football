import type { Player, Pos, Tech, Phys, Mental } from './types';
import { clamp, hash01, rand } from './rng';

// ---- Position profiles: attribute offsets relative to a player's target overall ----
type Attrs = Tech & Phys & Mental;
const OFFSETS: Record<Pos, Attrs> = {
  GK: { passing: -18, dribbling: -28, shooting: -40, finishing: -40, tackling: -30, handling: 8, pace: -12, stamina: -5, strength: 0, jumping: 2, vision: -5, composure: 0, positioning: 4, workrate: -8 },
  DF: { passing: -6, dribbling: -12, shooting: -22, finishing: -28, tackling: 6, handling: -45, pace: -2, stamina: 0, strength: 5, jumping: 4, vision: -6, composure: 0, positioning: 5, workrate: 2 },
  MF: { passing: 5, dribbling: 0, shooting: -5, finishing: -10, tackling: -2, handling: -45, pace: -2, stamina: 4, strength: -2, jumping: -4, vision: 5, composure: 1, positioning: 0, workrate: 4 },
  FW: { passing: -4, dribbling: 5, shooting: 5, finishing: 8, tackling: -25, handling: -45, pace: 4, stamina: -2, strength: 0, jumping: 0, vision: -2, composure: 2, positioning: 2, workrate: -2 },
};

const WEIGHTS: Record<Pos, Partial<Record<keyof Attrs, number>>> = {
  GK: { handling: 0.55, positioning: 0.15, composure: 0.1, jumping: 0.1, strength: 0.05, pace: 0.05 },
  DF: { tackling: 0.25, positioning: 0.2, strength: 0.15, pace: 0.1, jumping: 0.1, passing: 0.05, composure: 0.05, workrate: 0.05, stamina: 0.05 },
  MF: { passing: 0.2, vision: 0.15, dribbling: 0.1, tackling: 0.1, stamina: 0.1, workrate: 0.1, composure: 0.05, shooting: 0.05, positioning: 0.05, pace: 0.05, strength: 0.05 },
  FW: { finishing: 0.25, shooting: 0.15, dribbling: 0.15, pace: 0.15, composure: 0.1, positioning: 0.05, vision: 0.05, passing: 0.05, strength: 0.05 },
};

export function computeOvr(pos: Pos, a: Attrs): number {
  let s = 0;
  const w = WEIGHTS[pos];
  for (const k in w) s += (a as any)[k] * (w as any)[k];
  return Math.round(s);
}

export function buildAttributes(pos: Pos, target: number): { tech: Tech; phys: Phys; mental: Mental; ovr: number } {
  const off = OFFSETS[pos];
  const a: any = {};
  for (const k in off) a[k] = clamp(Math.round(target + (off as any)[k] + (rand() - 0.5) * 8), 8, 97);
  // Normalise so the weighted overall matches the target.
  const diff = target - computeOvr(pos, a);
  const w = WEIGHTS[pos] as any;
  for (const k in w) a[k] = clamp(Math.round(a[k] + diff), 8, 97);
  return {
    ovr: computeOvr(pos, a),
    tech: { passing: a.passing, dribbling: a.dribbling, shooting: a.shooting, finishing: a.finishing, tackling: a.tackling, handling: a.handling },
    phys: { pace: a.pace, stamina: a.stamina, strength: a.strength, jumping: a.jumping },
    mental: { vision: a.vision, composure: a.composure, positioning: a.positioning, workrate: a.workrate },
  };
}

// ---- Market valuation and wages (GBP) ----
export function ageFactor(age: number): number {
  if (age <= 19) return 1.55;
  if (age <= 21) return 1.4;
  if (age <= 23) return 1.2;
  if (age <= 27) return 1.0;
  if (age <= 29) return 0.85;
  if (age <= 31) return 0.62;
  if (age <= 33) return 0.4;
  return 0.22;
}

export function valueOf(ovr: number, age: number, pot: number, contractYears: number): number {
  const base = 40000 * Math.pow(1.19, ovr - 40);
  const potBonus = age <= 23 ? 1 + Math.max(0, pot - ovr) * 0.025 : 1;
  const contract = contractYears <= 0 ? 0.6 : contractYears === 1 ? 0.88 : 1;
  const v = base * ageFactor(age) * potBonus * contract;
  return Math.max(50000, Math.round(v / 50000) * 50000);
}

export function wageFor(ovr: number, age: number): number {
  const base = 1800 * Math.pow(1.13, ovr - 45);
  const a = age >= 33 ? 0.8 : age <= 20 ? 0.75 : 1;
  return Math.max(1000, Math.round((base * a) / 100) * 100);
}

export function repNeeded(p: Player): number {
  return (p.ovr - 52) / 0.22;
}

export const fmtMoney = (n: number): string => {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}£${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}£${Math.round(a / 1000)}K`;
  return `${sign}£${Math.round(a)}`;
};

export { hash01 };
