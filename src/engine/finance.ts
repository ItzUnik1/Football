import type { Fixture, Game } from './types';
import { wageBill } from './team';
import { addTx } from './messages';
import { clamp, rand } from './rng';

export function attendanceFor(g: Game, f: Fixture): number {
  const h = g.clubs[f.home], a = g.clubs[f.away];
  const pct = clamp(0.5 + h.reputation * 0.004 + a.reputation * 0.0015 + (rand() - 0.5) * 0.06, 0.5, 1);
  return Math.round(h.capacity * pct);
}

/** Gate receipts for a home match. */
export function matchdayRevenue(g: Game, f: Fixture): void {
  const club = g.clubs[f.home];
  if (!club) return;
  const gate = attendanceFor(g, f) * club.ticketPrice;
  club.balance += gate;
  club.transferBudget += Math.round(gate * 0.1);
  addTx(g, club.id, 'matchday', gate, `Matchday revenue vs ${g.clubs[f.away].name}`);
}

/** Staff and facility running costs (weekly) for the user's club. */
export function staffCost(g: Game, clubId: string): number {
  const c = g.clubs[clubId];
  const lv = ((c.medicalLevel ?? 3) + (c.youthLevel ?? 3) + (c.trainingLevel ?? 3));
  const scouts = clubId === g.meta.userClubId ? g.scouting.scouts.filter((s) => s.hired).reduce((s, x) => s + x.wage, 0) : 0;
  return lv * 1200 + scouts;
}

export interface WeekFinance { clubId: string; wages: number; tv: number; staff: number; net: number }

/** Weekly income and expenses for every club (processed each Monday). */
export function processWeekFinance(g: Game): Record<string, WeekFinance> {
  const out: Record<string, WeekFinance> = {};
  for (const club of Object.values(g.clubs)) {
    const wages = wageBill(g, club.id) + academyWages(g, club.id);
    const tv = club.weeklyIncome;
    const staff = staffCost(g, club.id);
    const net = tv - wages - staff;
    club.balance += net;
    if (net > 0) club.transferBudget += Math.round(net * 0.3);
    out[club.id] = { clubId: club.id, wages, tv, staff, net };
    addTx(g, club.id, 'tv', tv, 'TV, sponsorship and commercial income');
    addTx(g, club.id, 'wages', -wages, 'Player wages');
    addTx(g, club.id, 'staff', -staff, 'Staff, scouting and facilities');
  }
  return out;
}

function academyWages(g: Game, clubId: string): number {
  let s = 0;
  for (const id in g.players) { const p = g.players[id]; if (p.clubId === clubId && p.academy) s += p.wage; }
  return s;
}

export function prizeMoney(tier: number, pos: number): number {
  const base = tier === 1 ? 12_000_000 : tier === 2 ? 3_500_000 : 900_000;
  return Math.round(base * (1 - (pos - 1) * 0.04));
}

export function projectedWeekly(g: Game, clubId: string): { income: number; wages: number; staff: number } {
  const c = g.clubs[clubId];
  return { income: c.weeklyIncome + (c.capacity * 0.8 * c.ticketPrice) / 2, wages: wageBill(g, clubId) + academyWages(g, clubId), staff: staffCost(g, clubId) };
}

export const facilityCost = (level: number): number => Math.round((level * level * 1_200_000) / 100000) * 100000;
export function upgradeFacility(g: Game, kind: 'medical' | 'youth' | 'training'): { ok: boolean; message: string } {
  const c = g.clubs[g.meta.userClubId];
  const key = (kind + 'Level') as 'medicalLevel' | 'youthLevel' | 'trainingLevel';
  const lvl = c[key] ?? 3;
  if (lvl >= 5) return { ok: false, message: 'Already at the highest level.' };
  const cost = facilityCost(lvl);
  if (cost > c.balance) return { ok: false, message: `You need ${cost.toLocaleString()} in the bank.` };
  c.balance -= cost; c[key] = lvl + 1;
  addTx(g, c.id, 'staff', -cost, `Facility upgrade: ${kind} level ${lvl + 1}`);
  return { ok: true, message: `${kind[0].toUpperCase() + kind.slice(1)} facilities upgraded to level ${lvl + 1}.` };
}
