declare const process: { exit(code: number): never };
import { newCareer, advance, playTodayMatches, userFixtureToday } from '../src/engine/game';
import { gameNow } from '../src/engine/messages';
import { repairLineup, squadOf } from '../src/engine/team';
import { selectNationSquad, autoNationTeam, userIntlFixtureToday } from '../src/engine/intl';
import { startConstruction, projection, incomeWeekly, costsWeekly, standCost, gateFor } from '../src/engine/econ';
import { hireStaff, availableStaff, staffEff } from '../src/engine/staff';
import { computeTable } from '../src/engine/fixtures';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const g = newCareer('c05', 4242);
const me = g.clubs[g.meta.userClubId];
const all = () => Object.values(g.clubs);
ok(all().every((c) => c.econ && c.staff), 'every club has economy and staff');
const gateW = (c: typeof me) => c.capacity * 0.8 * c.ticketPrice * 0.5;
const ratio = all().map((c) => { const i = incomeWeekly(c).total + gateW(c), k = costsWeekly(g, c); return (k.wages + k.staff + k.stadium) / i; });
void gateFor;
console.log('cost/income at start: min', Math.min(...ratio).toFixed(2), 'max', Math.max(...ratio).toFixed(2));
ok(Math.max(...ratio) < 1.4 && Math.min(...ratio) > 0.3, 'starting cost/income ratios are plausible');

// Construction
const bal0 = me.balance; me.balance = 60_000_000; const cap0 = me.capacity;
const r = startConstruction(g, me.id, { kind: 'stand', seats: 2000 });
ok(r.ok, 'stand construction starts: ' + r.message);
ok(!startConstruction(g, me.id, { kind: 'roof' }).ok, 'only one build at a time');
const ready = me.econ!.construction!.ready;
function playOn(until: number) {
  let guard = 0;
  while (gameNow(g) < until && guard++ < 1500) {
    g.meta.sacked = false; g.board.confidence = 80; squadOf(g, me.id).forEach((p) => { p.contractEnd = Date.UTC(2040, 5, 30); });
    const f = userFixtureToday(g);
    if (g.intl.userNation && !f && userIntlFixtureToday(g)) { const n = g.intl.nations[g.intl.userNation]; selectNationSquad(g, n); autoNationTeam(g, n); playTodayMatches(g); }
    if (f && !f.played) { repairLineup(g, me); playTodayMatches(g); }
    advance(g, 'day');
  }
}
playOn(ready - 86400000 * 3);
ok(me.capacity === cap0, 'capacity unchanged before the build is ready');
playOn(ready + 86400000 * 2);
ok(me.capacity === cap0 + 2000 && !me.econ!.construction, `capacity rises when ready (${cap0} -> ${me.capacity})`);
ok(!startConstruction(g, me.id, { kind: 'stand', seats: 50000 }).ok, 'planning limit blocks huge stands');
me.balance = -5_000_000;
ok(!startConstruction(g, me.id, { kind: 'facility', facility: 'youth' }).ok, 'no construction while in debt');
me.balance = 40_000_000;

// Staff
const pool = availableStaff(g, 'coach');
ok(pool.length > 0, 'free-agent staff pool exists');
const before = staffEff(me, 'coach');
const best = [...pool].sort((a, b) => b.ability - a.ability)[0];
const h = hireStaff(g, best.id);
ok(h.ok, 'user hires staff: ' + h.message);
ok(staffEff(me, 'coach') >= before - 1e-9, 'a better coach does not lower the training multiplier');

// Seasons
playOn(Date.UTC(2027, 5, 29));
const t = computeTable(g, me.leagueId ?? 'L1');
const bal = all().map((c) => c.balance);
const inDebt = all().filter((c) => c.balance < 0).length;
console.log('balances after 1 season: min', Math.min(...bal) / 1e6 | 0, 'M max', Math.max(...bal) / 1e6 | 0, 'M; in debt:', inDebt, '; user', (me.balance / 1e6).toFixed(1), 'M');
ok(me.econ!.seasonTickets > 0 && me.econ!.stSeason === 2026, `season tickets sold (${me.econ!.seasonTickets})`);
ok(inDebt <= 10, `few AI clubs in debt after a season (${inDebt})`);
ok(t.length === 20, 'league table intact');
const pr = projection(g, me.id, 26);
ok(pr.points.length > 5 && Number.isFinite(pr.end), `projection computes (end ${(pr.end / 1e6).toFixed(1)}M)`);
playOn(Date.UTC(2029, 5, 29));
const bal2 = all().map((c) => c.balance), debt2 = all().filter((c) => c.balance < 0).length;
console.log('after 3 seasons: min', Math.min(...bal2) / 1e6 | 0, 'M max', Math.max(...bal2) / 1e6 | 0, 'M; in debt', debt2);
ok(debt2 <= 8, `economy stable over 3 seasons (${debt2} in debt)`);
ok(Math.max(...bal2) < 1.5e9, 'no runaway wealth');
void standCost;
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
