import type { Fixture, Game, StandingRow } from './types';
import { shuffle } from './rng';

// Circle-method double round robin: 19 rounds then the reverse fixtures = 38 matchdays.
export function makeFixtures(clubIds: string[]): Fixture[] {
  const teams = shuffle(clubIds);
  const n = teams.length; // 20
  const rounds: [string, string][][] = [];
  const arr = teams.slice();
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i];
      let away = arr[n - 1 - i];
      // alternate home/away for the pivot team and by pairing index to balance venues
      if (i === 0) { if (r % 2 === 1) [home, away] = [away, home]; }
      else if ((r + i) % 2 === 1) [home, away] = [away, home];
      round.push([home, away]);
    }
    rounds.push(round);
    // rotate all but the first element
    arr.splice(1, 0, arr.pop() as string);
  }
  const fixtures: Fixture[] = [];
  let fid = 1;
  const push = (week: number, h: string, a: string) =>
    fixtures.push({ id: `f${String(fid++).padStart(3, '0')}`, week, home: h, away: a, played: false, hg: 0, ag: 0 });
  rounds.forEach((round, r) => round.forEach(([h, a]) => push(r + 1, h, a)));
  rounds.forEach((round, r) => round.forEach(([h, a]) => push(r + 1 + (n - 1), a, h)));
  return fixtures;
}

export function computeTable(g: Game): StandingRow[] {
  const rows: Record<string, StandingRow> = {};
  Object.keys(g.clubs).forEach((id) => {
    rows[id] = { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
  });
  const played = g.fixtures.filter((f) => f.played).sort((a, b) => a.week - b.week);
  for (const f of played) {
    const h = rows[f.home], a = rows[f.away];
    h.played++; a.played++;
    h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.won++; h.points += 3; a.lost++; h.form.push('W'); a.form.push('L'); }
    else if (f.hg < f.ag) { a.won++; a.points += 3; h.lost++; h.form.push('L'); a.form.push('W'); }
    else { h.drawn++; a.drawn++; h.points++; a.points++; h.form.push('D'); a.form.push('D'); }
  }
  const list = Object.values(rows);
  list.forEach((r) => { r.gd = r.gf - r.ga; });
  list.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || g.clubs[x.clubId].name.localeCompare(g.clubs[y.clubId].name));
  return list;
}

export function positionOf(g: Game, clubId: string): number {
  return computeTable(g).findIndex((r) => r.clubId === clubId) + 1;
}

export const TOTAL_WEEKS = 38;
