import type { Fixture, Game } from './types';
import { wageBill } from './team';
import { addTx } from './messages';
import { clamp, rand } from './rng';

export function attendanceFor(g: Game, f: Fixture): number {
  const h = g.clubs[f.home], a = g.clubs[f.away];
  const pct = clamp(0.5 + h.reputation * 0.004 + a.reputation * 0.0015 + (rand() - 0.5) * 0.06, 0.5, 1);
  return Math.round(h.capacity * pct);
}

export interface WeekFinance { clubId: string; wages: number; tv: number; gate: number; net: number }

// Applies one matchday of income and expenses to every club.
export function processWeekFinance(g: Game, fixtures: Fixture[]): Record<string, WeekFinance> {
  const out: Record<string, WeekFinance> = {};
  const home = new Map(fixtures.map((f) => [f.home, f]));
  for (const club of Object.values(g.clubs)) {
    const wages = wageBill(g, club.id);
    const tv = club.weeklyIncome;
    const fx = home.get(club.id);
    const gate = fx ? attendanceFor(g, fx) * club.ticketPrice : 0;
    const net = tv + gate - wages;
    club.balance += net;
    if (net > 0) club.transferBudget += Math.round(net * 0.25);
    out[club.id] = { clubId: club.id, wages, tv, gate, net };
    addTx(g, club.id, 'tv', tv, 'TV, sponsorship and commercial income');
    if (fx) addTx(g, club.id, 'matchday', gate, `Matchday revenue vs ${g.clubs[fx.away].name}`);
    addTx(g, club.id, 'wages', -wages, 'Player wages');
  }
  return out;
}

export function projectedWeekly(g: Game, clubId: string): { income: number; wages: number } {
  const c = g.clubs[clubId];
  return { income: c.weeklyIncome + (c.capacity * 0.8 * c.ticketPrice) / 2, wages: wageBill(g, clubId) };
}
