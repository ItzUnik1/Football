import 'fake-indexeddb/auto';
declare const process: { exit(code: number): never };
import { newCareer, userClub, advance, playTodayMatches, userFixtureToday } from '../src/engine/game';
import { saveGame, loadGame, deleteSave } from '../src/db/database';
import { repairLineup, squadOf, validateLineup } from '../src/engine/team';
import { gameNow } from '../src/engine/messages';
import { answerPress, pressPriceFactor } from '../src/engine/media';
import { askingPrice } from '../src/engine/transfers';
import { harmony, hierarchy, leadershipGroup, payBonuses } from '../src/engine/social';
import { comparePlayers, assignScout, scoutingTick, hireScout } from '../src/engine/scouting';
import { selectNationSquad, autoNationTeam, userIntlFixtureToday } from '../src/engine/intl';
import { acceptNationJob, availableJobs } from '../src/engine/mgr';
import type { Game, PlayerMatch } from '../src/engine/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const g: Game = newCareer('c05', 777);
const me = userClub(g);
const squad = () => squadOf(g, me.id);

// --- Relationships ---
ok(squad().every((p) => Array.isArray(p.friends)), 'every player has friendships assigned');
ok(leadershipGroup(g, me.id).length === 4 && hierarchy(g, me.id)[0].age >= 20, 'leadership group of four');
const h0 = harmony(g, me.id); squad().forEach((p) => { p.morale = 90; }); const h1 = harmony(g, me.id); squad().forEach((p) => { p.morale = 25; }); const h2 = harmony(g, me.id);
ok(h1 > h0 - 1 && h2 < h1 - 15, `harmony follows morale (${h2} < ${h0} <= ${h1})`);
squad().forEach((p) => { p.morale = 70; });

// --- Bonuses ---
const st = squad().find((p) => p.pos === 'FW')!; st.bonuses = { appearance: 1000, goal: 5000, cleanSheet: 0, loyalty: 20000, wageRise: 0 };
const bal = me.balance;
payBonuses(g, st, { goals: 2, minutes: 90 } as PlayerMatch, 1);
ok(me.balance === bal - 11000, `appearance + 2 goal bonuses paid (${bal - me.balance})`);
ok(g.tx.some((t) => t.type === 'bonus' && t.amount === -11000), 'bonus is in the ledger');

// --- Press conference consequences ---
const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== me.id && p.ovr >= 72)!;
const before = askingPrice(g, target);
const m = { id: 'mx', category: 'Media' as const, from: 'Press', subject: 's', body: 'b', read: false, important: false, createdAt: 0, date: gameNow(g), action: { kind: 'press' as const, topic: 'transfer', playerId: target.id, clubId: target.clubId!, expires: gameNow(g) + 86400000 * 3 } };
g.messages.push(m as never);
const r = answerPress(g, 'mx', 'interest');
ok(r.ok && askingPrice(g, target) > before && pressPriceFactor(g, target.id) === 1.12, `admitting interest raises asking price (${before} -> ${askingPrice(g, target)})`);
ok(!answerPress(g, 'mx', 'deny').ok, 'a press question can only be answered once');
const star = squad()[0]; star.morale = 60;
g.messages.push({ ...m, resolved: undefined, id: 'my', action: { kind: 'press', topic: 'post_win', playerId: star.id, expires: gameNow(g) + 86400000 } } as never);
answerPress(g, 'my', 'praise_player');
ok(star.morale >= 66, 'praising a player lifts his morale');

// --- Scouting extras ---
const sc = g.scouting.scouts.find((s) => !s.hired)!; hireScout(g, sc.id, true);
ok(assignScout(g, sc.id, { kind: 'region', region: Object.values(g.players).find((p) => p.clubId && p.clubId !== me.id)!.nat }) === null, 'regional assignment accepted');
me.econ!.scoutingLevel = 1;
const sc2 = g.scouting.scouts.filter((s) => s.hired)[1];
if (sc2) ok(typeof assignScout(g, sc2.id, { kind: 'global' }) === 'string', 'global scouting needs a level-3 network');
for (let i = 0; i < 30; i++) { const f = userFixtureToday(g); if (f && !f.played) { if (validateLineup(g, me).length) repairLineup(g, me); playTodayMatches(g); } advance(g, 'day'); }
ok(g.scouting.reports.some((x) => x.personality && x.recommendation), 'reports include personality and recommendation');
ok(comparePlayers(g, g.scouting.reports.slice(0, 2).map((x) => x.playerId)).length === 2, 'shortlist comparison works');

// --- A full season: clashes, bounded state, nation job ---
if (!g.mgrs.vacancies.some((v) => v.nationId)) g.mgrs.vacancies.push({ nationId: Object.keys(g.intl.nations)[3], since: gameNow(g), fillOn: Date.UTC(2040, 0, 1) });
const seen = new Map<string, number>();
let clash = 0, intlPlayed = 0, nationTaken = false;
const season0 = g.meta.season;
let guard = 0;
while (g.meta.season === season0 && guard++ < 700) {
  g.meta.sacked = false; g.board.confidence = 75; if (g.career) { g.career.contract ??= { clubId: me.id, wage: 20000, end: Date.UTC(2040, 5, 30) }; }
  squad().forEach((p) => { p.contractEnd = Date.UTC(2040, 5, 30); });
  const f = userFixtureToday(g);
  if (f && !f.played) { if (validateLineup(g, me).length) repairLineup(g, me); playTodayMatches(g); }
  const un = g.intl.userNation;
  if (!nationTaken && !un && gameNow(g) > Date.UTC(2026, 9, 1)) { const jobs = availableJobs(g).filter((j) => j.nationId); if (jobs[0]) { g.career.rep = Math.max(g.career.rep, 60); nationTaken = acceptNationJob(g, jobs[0].nationId!, jobs[0].terms.wage, 2).ok; } }
  if (g.intl.userNation && userIntlFixtureToday(g) && !userIntlFixtureToday(g)!.played) { const n = g.intl.nations[g.intl.userNation]; selectNationSquad(g, n); autoNationTeam(g, n); playTodayMatches(g); intlPlayed++; }
  const day = gameNow(g);
  for (const f2 of g.fixtures) if (f2.date === day) for (const id of [f2.home, f2.away]) { const k = id + day; seen.set(k, (seen.get(k) ?? 0) + 1); if ((seen.get(k) ?? 0) > 1) clash++; }
  advance(g, 'day');
}
ok(g.meta.season === season0 + 1, 'season completed with cups, internationals and economy running');
ok(clash === 0, `no club plays twice on a day (${clash} clashes)`);
console.log('user nation job:', nationTaken, 'international matches played:', intlPlayed);
ok(g.news.length <= 300 && g.news.length > 20, `news feed bounded (${g.news.length})`);
ok(g.intl.fixtures.length < 300, `international fixtures bounded (${g.intl.fixtures.length})`);
ok((g.history.scorers?.length ?? 0) > 0 && (g.history.scorers?.length ?? 0) <= 25, 'all-time scorers recorded and bounded');
ok((g.history.records ?? []).some((r) => r.id === 'points'), 'season records recorded');
ok((g.history.cups ?? []).length >= 1, 'cup winner recorded');
ok(g.history.seasons.length >= 1, 'league champions recorded');
ok(Object.values(g.clubs).every((c) => c.econ && c.staff && c.staff.length >= 6), 'all clubs still have economy and staff');
ok(g.messages.length < 4000, `message history size sane (${g.messages.length})`);

// --- Full-state save and load ---
await deleteSave(); await saveGame(g);
const g2 = (await loadGame())!;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
for (const k of ['cups', 'intl', 'career', 'mgrs', 'news', 'media', 'staffWorld', 'history'] as const) ok(same(g[k], g2[k]), `${k} survives save and load`);
ok(same(g.clubs, g2.clubs), 'clubs (economy, staff, tactics) survive save and load');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
