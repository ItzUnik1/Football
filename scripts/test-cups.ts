declare const process: { exit(code: number): never };
import { newCareer, advance, playTodayMatches, userFixtureToday } from '../src/engine/game';
import { currentCup, cupProgress } from '../src/engine/cups';
import { gameNow } from '../src/engine/messages';
import { seasonOf, fmtDate } from '../src/engine/calendar';
import { repairLineup } from '../src/engine/team';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const g = newCareer('c05', 4242);
const me = g.meta.userClubId;
const cup0 = currentCup(g)!;
ok(!!cup0 && cup0.rounds.length === 6 && cup0.entrants.length === 60, 'cup created with 6 rounds and 60 entrants');
ok(cup0.byes.length === 4, '4 byes');
const dates = cup0.rounds.map((r) => r.date);
ok(dates.every((d, i) => i === 0 || d > dates[i - 1]), 'round dates ascend');
// No club has a league fixture on a cup date
const leagueDays = new Set(g.fixtures.filter((f) => f.comp !== 'cup').map((f) => f.date));
ok(dates.slice(0, 5).every((d) => !leagueDays.has(d)), 'cup midweek dates avoid every league fixture');
const lastLeague = Math.max(...g.fixtures.map((f) => f.date!));
ok(dates[5] > lastLeague, 'final is after the last league fixture');

let guard = 0;
let userCupGames = 0;
while (gameNow(g) < Date.UTC(2027, 5, 20) && guard++ < 700) {
  const f = userFixtureToday(g);
  if (f && !f.played) {
    repairLineup(g, g.clubs[me]);
    const r = playTodayMatches(g);
    if (!r.ok) { console.log(r.error, r.errors); break; }
    if (f.comp === 'cup') {
      userCupGames++;
      ok(!!r.report && r.report.comp === 'cup' && (f.hg !== f.ag || !!f.pens), `cup tie ${f.round} has a decisive result`);
      ok(f.winner === f.home || f.winner === f.away, 'winner recorded');
    }
  }
  advance(g, 'day');
  if (cupProgress(g, me).status === 'out' && userCupGames > 0 && guard % 40 === 0) { /* continue to season end */ }
}
const cup = g.cups.find((c) => c.season === 2026)!;
ok(!!cup.winner, `cup has a winner (${g.clubs[cup.winner!]?.name})`);
ok(cup.rounds.every((r) => r.done), 'all rounds completed');
const fx = g.fixtures.filter((f) => f.cupId === cup.id);
ok(fx.length === 28 + 16 + 8 + 4 + 2 + 1, `cup produced ${fx.length} ties`);
console.log('ties per round', cup.rounds.map((r, i) => fx.filter((f) => f.round === i).length).join(','));
ok(fx.every((f) => f.played && f.winner), 'every tie played with a winner');
ok(new Set(fx.filter((f) => f.round === 0).flatMap((f) => [f.home, f.away])).size === 56, 'round 1: 56 clubs, none twice');
// club never plays twice on one day
const perDay: Record<string, number> = {};
g.fixtures.forEach((f) => { [f.home, f.away].forEach((c) => { const k = c + f.date; perDay[k] = (perDay[k] ?? 0) + 1; }); });
ok(Object.values(perDay).every((n) => n === 1), 'no club has two matches on one day');
ok((g.history.cups?.length ?? 0) === 1, 'history records the cup winner');
console.log('user cup games', userCupGames, 'season now', g.meta.season, seasonOf(gameNow(g)), fmtDate(gameNow(g)));
advance(g, 'days', 20);
ok(g.cups.some((c) => c.season === g.meta.season) && g.meta.season === 2027, 'new season has a new cup');
const prized = Object.values(g.tx).some((t) => t.type === 'prize');
ok(prized || userCupGames === 0, 'prize money recorded for the user');
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
