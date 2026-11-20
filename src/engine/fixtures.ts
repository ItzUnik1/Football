import type { Fixture, Game, League, StandingRow } from './types';
import { shuffle } from './rng';
import { addDays, utc } from './calendar';

export const TOTAL_WEEKS = 38; // rounds per league season

/** Date of a given round (1-based) of a league. Leagues are scheduled independently. */
export function roundDate(league: Pick<League, 'startDate' | 'midweekEvery'>, round: number): number {
  const base = addDays(league.startDate, (round - 1) * 7);
  return league.midweekEvery > 0 && round % league.midweekEvery === 0 && round > 1 ? addDays(base, -4) : base;
}

/** First round date for a league: the first Saturday on/after the given month/day of the season start year. */
export function firstSaturday(year: number, month: number, day: number): number {
  let t = utc(year, month, day);
  while (new Date(t).getUTCDay() !== 6) t = addDays(t, 1);
  return t;
}

// Circle-method double round robin: 19 rounds then the reverse fixtures = 38 rounds.
export function makeFixtures(clubIds: string[], league?: League, season?: number): Fixture[] {
  const teams = shuffle(clubIds);
  const n = teams.length; // 20
  const rounds: [string, string][][] = [];
  const arr = teams.slice();
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i];
      let away = arr[n - 1 - i];
      if (i === 0) { if (r % 2 === 1) [home, away] = [away, home]; }
      else if ((r + i) % 2 === 1) [home, away] = [away, home];
      round.push([home, away]);
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop() as string);
  }
  const fixtures: Fixture[] = [];
  let fid = 1;
  const push = (round: number, h: string, a: string) => {
    const id = league && season !== undefined ? `f${season}${league.id}-${String(fid++).padStart(3, '0')}` : `f${String(fid++).padStart(3, '0')}`;
    fixtures.push({ id, week: round, home: h, away: a, played: false, hg: 0, ag: 0, leagueId: league?.id, date: league ? roundDate(league, round) : undefined });
  };
  rounds.forEach((round, r) => round.forEach(([h, a]) => push(r + 1, h, a)));
  rounds.forEach((round, r) => round.forEach(([h, a]) => push(r + 1 + (n - 1), a, h)));
  return fixtures;
}

export const leagueIdOf = (g: Game, clubId: string): string => g.clubs[clubId]?.leagueId ?? 'L1';

export function computeTable(g: Game, leagueId?: string): StandingRow[] {
  const lid = leagueId ?? leagueIdOf(g, g.meta.userClubId);
  const league = g.leagues[lid];
  const ids = league ? league.clubIds : Object.keys(g.clubs);
  const rows: Record<string, StandingRow> = {};
  ids.forEach((id) => { rows[id] = { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] }; });
  const played = g.fixtures.filter((f) => f.played && (f.leagueId ?? 'L1') === lid).sort((a, b) => (a.date ?? a.week) - (b.date ?? b.week));
  for (const f of played) {
    const h = rows[f.home], a = rows[f.away];
    if (!h || !a) continue;
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
  return computeTable(g, leagueIdOf(g, clubId)).findIndex((r) => r.clubId === clubId) + 1;
}
