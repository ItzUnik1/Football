declare const process: { exit(code: number): never };
import { newCareer, advance, playTodayMatches, userFixtureToday } from '../src/engine/game';
import { gameNow } from '../src/engine/messages';
import { repairLineup, squadOf } from '../src/engine/team';
import { fmtDate } from '../src/engine/calendar';
import { nationRanking, selectNationSquad, autoNationTeam, validateNationTeam, userIntlFixtureToday, setNationSquad, nationPool } from '../src/engine/intl';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const g = newCareer('c05', 99);
const me = g.meta.userClubId;
ok(Object.keys(g.intl.nations).length === 14, '14 national teams');
ok(nationRanking(g).every((n, i) => n.rank === i + 1), 'ranking is sequential');
const fr = g.intl.fixtures.filter((f) => f.comp === 'friendly');
ok(fr.length === 28 && g.intl.qual === undefined, '2026/27: 4 friendly windows, no qualifying');
const days = new Set(g.intl.fixtures.map((f) => f.date));
const leagueDays = new Set(g.fixtures.map((f) => f.date));
ok([...days].every((d) => !leagueDays.has(d)), 'international dates never share a day with any club fixture (league or cup)');
ok(g.intl.fixtures.every((f) => f.home !== f.away), 'no nation plays itself');
// Eligibility
const eng = g.intl.nations['N:ENG'];
selectNationSquad(g, eng); autoNationTeam(g, eng);
ok(eng.squad.every((id) => g.players[id].nat === 'England'), 'call-ups are England players only');
ok(eng.squad.length >= 18 && eng.lineup.length === 11 && validateNationTeam(g, eng).length === 0, 'AI national lineup is valid');

// Play two seasons
squadOf(g, me).forEach((p) => { p.contractEnd = Date.UTC(2040, 5, 30); });
let n = 0; let userClubGames = 0;
const playedIntl: number[] = [];
let sawCallup = false;
while (gameNow(g) < Date.UTC(2028, 5, 30) && n++ < 1000) {
  const f = userFixtureToday(g);
  if (f && !f.played) { repairLineup(g, g.clubs[me]); const r = playTodayMatches(g); if (!r.ok) { console.log(r.error, r.errors); break; } userClubGames++; }
  g.meta.sacked = false; g.board.confidence = 90;
  advance(g, 'day');
  if (g.messages.some((m) => m.category === 'International')) sawCallup = true;
  if (g.intl.fixtures.some((x) => x.played && x.date === gameNow(g) - 86400000) && playedIntl.length < 3) playedIntl.push(gameNow(g));
}
ok(sawCallup, 'the user receives international call-up notices for their club players');
ok(g.intl.records.length === 1 && g.intl.records[0].kind === 'continental' && g.intl.records[0].year === 2028, `Continental Championship 2028 completed (${g.intl.records[0] ? g.intl.nations[g.intl.records[0].winner].name : '-'})`);
const tn = g.intl.tournaments[0];
ok(!!tn && tn.nations.length === 12, 'tournament has 12 nations');
const kf = g.intl.fixtures.filter((f) => f.compId === tn.id);
ok(kf.filter((f) => f.stage.startsWith('Group')).length === 18, '18 group matches');
ok(kf.filter((f) => f.stage === 'Quarter-final').length === 4 && kf.filter((f) => f.stage === 'Semi-final').length === 2 && kf.filter((f) => f.stage === 'Final').length === 1, '4 QF, 2 SF, 1 Final');
ok(kf.filter((f) => !f.stage.startsWith('Group')).every((f) => f.winner && (f.hg !== f.ag || f.pens)), 'knockout ties always have a winner');
ok(g.intl.qual?.done === true && g.intl.qual.qualified.length === 12, 'qualification produced 12 qualifiers');
ok(g.intl.qual!.table && Object.values(g.intl.qual!.table).every((r) => r.p === 6), 'every nation played 6 qualifiers');
const capped = Object.values(g.players).filter((p) => p.intl && p.intl.caps > 0);
ok(capped.length > 100, `international caps recorded (${capped.length} capped players)`);
const eloSum = Object.values(g.intl.nations).reduce((a, x) => a + x.pts, 0);
ok(Math.abs(eloSum / 14 - nationRanking(g).reduce((a, x) => a + x.pts, 0) / 14) < 1e-6 && eloSum > 14 * 1300, 'rankings consistent');
ok(g.intl.fixtures.length < 150, `fixture history bounded (${g.intl.fixtures.length})`);
console.log('winner', g.intl.nations[g.intl.records[0].winner].name, 'top scorer', JSON.stringify(g.intl.records[0].topScorer));

// User-managed national team
const nat = g.intl.nations['N:BRA'];
nat.userManaged = true; g.intl.userNation = nat.id;
selectNationSquad(g, nat); autoNationTeam(g, nat);
ok(validateNationTeam(g, nat).length === 0, 'user nation valid after auto-pick');
const bad = setNationSquad(g, nat, [...nat.squad, Object.values(g.players).find((p) => p.nat === 'England')!.id]);
ok(!bad.ok, 'cannot call up a player of another nationality');
ok(!setNationSquad(g, nat, nat.squad.filter((id) => g.players[id].pos !== 'GK')).ok, 'squad needs a goalkeeper');
// advance until the user's nation plays: blocked, then plays
let blocked = false, played = false; let guard = 0;
while (guard++ < 400 && !played) {
  squadOf(g, me).forEach((p) => { p.contractEnd = Date.UTC(2040, 5, 30); });
  g.meta.sacked = false; g.board.confidence = 90;
  const r = advance(g, 'week');
  const fi = userIntlFixtureToday(g);
  if (fi && !fi.played) {
    blocked = r.stop === 'match';
    const dup = nat.lineup[0];
    nat.lineup[1] = dup;
    const rr = playTodayMatches(g);
    ok(!rr.ok && !!rr.errors?.length, 'duplicate selection is rejected for the national team');
    nat.lineup[1] = ''; selectNationSquad(g, nat); autoNationTeam(g, nat);
    const res = playTodayMatches(g);
    played = res.ok && !!res.report;
    ok(res.ok && res.report!.comp === 'intl', 'user national match simulated with the same engine');
    ok(g.reports[fi.id] !== undefined, 'international report stored');
  }
  repairLineup(g, g.clubs[me]);
  const f = userFixtureToday(g); if (f && !f.played) { const q = playTodayMatches(g); if (!q.ok) { console.log('club match failed', q.error, q.errors, fmtDate(gameNow(g))); break; } }
}
ok(blocked, 'time stops on the user\'s international match day');
ok(nationPool(g, 'N:BRA').length > 100, 'nation pool is large');
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED', fmtDate(gameNow(g)), userClubGames);
process.exit(fails ? 1 : 0);
