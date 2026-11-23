import type { Game } from './types';
import { continueDay, playTodayMatches, seasonComplete, userFixtureToday } from './game';
import { repairLineup } from './team';
import { autoNationTeam, selectNationSquad, userIntlFixtureToday } from './intl';
import { gameNow } from './messages';

export type QuickTarget = { kind: 'date'; date: number } | { kind: 'seasonEnd' };
export interface QuickResult {
  days: number;
  played: number;
  done: boolean;
  stop: 'target' | 'chunk' | 'season' | 'sacked' | 'error';
  note?: string;
}

/**
 * Plays the calendar forward without stopping at the user's match days. The user's lineup is repaired automatically
 * (their chosen XI is kept whenever it is valid) and the matches are simulated like any other. Works in chunks so the
 * UI can stay responsive: call again until `done`.
 */
export function quickSim(g: Game, target: QuickTarget, maxDays = 14): QuickResult {
  const startSeason = g.meta.season;
  let days = 0;
  let played = 0;
  const reached = (): boolean => (target.kind === 'date' ? gameNow(g) >= target.date : seasonComplete(g));
  if (reached()) return { days, played, done: true, stop: 'target' };
  while (days < maxDays) {
    if (g.meta.sacked) return { days, played, done: true, stop: 'sacked', note: 'You have been dismissed.' };
    const f = userFixtureToday(g);
    const fi = !f ? userIntlFixtureToday(g) : undefined;
    if (f && !f.played) {
      repairLineup(g, g.clubs[g.meta.userClubId]);
      const r = playTodayMatches(g);
      if (!r.ok) return { days, played, done: true, stop: 'error', note: r.error };
      played++;
    } else if (fi && !fi.played && g.intl.userNation) {
      const n = g.intl.nations[g.intl.userNation];
      if (n.squad.length < 14) selectNationSquad(g, n);
      autoNationTeam(g, n);
      const r = playTodayMatches(g);
      if (!r.ok) return { days, played, done: true, stop: 'error', note: r.error };
      played++;
    }
    const d = continueDay(g);
    if (!d.ok) return { days, played, done: true, stop: d.blocked === 'sacked' ? 'sacked' : 'error', note: d.blocked === 'sacked' ? 'You have been dismissed.' : 'Could not advance' };
    days++;
    if (g.meta.season !== startSeason) return { days, played, done: true, stop: 'season', note: 'A new season has begun' };
    if (reached()) return { days, played, done: true, stop: 'target' };
  }
  return { days, played, done: false, stop: 'chunk' };
}
