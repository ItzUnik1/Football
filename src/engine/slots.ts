import { addDays, utc, weekday } from './calendar';
import type { Game } from './types';

/** First Wednesday on or after the given date. */
export function wedOnAfter(y: number, m: number, d: number): number {
  let t = utc(y, m, d);
  while (weekday(t) !== 2) t = addDays(t, 1);
  return t;
}

/** Fixed midweek slots for the season that starts in year `s`. League fixtures never use Wednesdays, so these cannot clash with club leagues. */
export function seasonSlots(s: number) {
  const n = s + 1;
  return {
    cup: [wedOnAfter(s, 8, 14), wedOnAfter(s, 9, 19), wedOnAfter(s, 11, 7), wedOnAfter(n, 1, 8), wedOnAfter(n, 2, 8)],
    intl: [wedOnAfter(s, 8, 7), wedOnAfter(s, 9, 5), wedOnAfter(s, 10, 9), wedOnAfter(s, 10, 23), wedOnAfter(n, 1, 22), wedOnAfter(n, 2, 22), wedOnAfter(n, 3, 12)],
    tourn: { group: [utc(n, 5, 3), utc(n, 5, 7), utc(n, 5, 11)], qf: utc(n, 5, 16), sf: utc(n, 5, 21), final: utc(n, 5, 27) },
  };
}

/** Saturday after the last league fixture of the season (cup final). */
export function cupFinalDate(g: Game): number {
  let last = 0;
  for (const f of g.fixtures) if ((f.comp ?? 'league') === 'league' && (f.date ?? 0) > last) last = f.date ?? 0;
  let t = addDays(last, 7);
  while (weekday(t) !== 5) t = addDays(t, 1);
  return t;
}
