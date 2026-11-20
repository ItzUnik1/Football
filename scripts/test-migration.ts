import 'fake-indexeddb/auto';
declare const process: { exit(code: number): never };
import Dexie from 'dexie';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadGame, saveGame } from '../src/db/database';
import { advance, userClub, userFixtureToday, playTodayMatches } from '../src/engine/game';
import { validateLineup, repairLineup, squadOf } from '../src/engine/team';
import { computeTable } from '../src/engine/fixtures';
import { fmtDate } from '../src/engine/calendar';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

(async () => {
  // Build a genuine Phase 1 (schema v1) database from a real Phase 1 save.
  const p1 = JSON.parse(gunzipSync(readFileSync('scripts/fixtures/phase1-save-mid.json.gz')).toString());
  const v1 = new Dexie('touchline');
  v1.version(1).stores({ meta: 'key', clubs: 'id', players: 'id, clubId, pos', fixtures: 'id, week', messages: 'id, week, category, read', reports: 'fixtureId', tx: 'id, week' });
  await v1.table('meta').put({ key: 'meta', ...p1.meta });
  await v1.table('clubs').bulkPut(Object.values(p1.clubs));
  await v1.table('players').bulkPut(Object.values(p1.players));
  await v1.table('fixtures').bulkPut(p1.fixtures);
  await v1.table('messages').bulkPut(p1.messages);
  await v1.table('reports').bulkPut(Object.entries(p1.reports).map(([k, r]) => ({ fixtureId: k, report: r })));
  await v1.table('tx').bulkPut(p1.tx);
  v1.close();
  const userId: string = p1.meta.userClubId;
  const p1Squad = Object.values<any>(p1.players).filter((p) => p.clubId === userId).map((p) => p.id).sort();
  const p1Played = p1.fixtures.filter((f: any) => f.played).length;
  const p1Balance = p1.clubs[userId].balance;
  console.log(`Phase 1 save: club ${userId}, week ${p1.meta.week}, ${Object.keys(p1.players).length} players, ${p1.messages.length} messages`);

  const g = (await loadGame())!;
  ok(!!g, 'Phase 1 save loads in Phase 2');
  ok(g.meta.version === 3, 'save marked as version 3');
  ok(g.meta.userClubId === userId, 'same club');
  ok(Object.keys(g.clubs).length === 60 && Object.keys(g.leagues).length === 3, 'lower divisions created');
  ok(g.clubs[userId].balance === p1Balance, 'club balance preserved');
  ok(JSON.stringify(squadOf(g, userId).map((p) => p.id).sort()).length > 0 && p1Squad.every((id) => g.players[id]?.clubId === userId), 'every Phase 1 squad member still at the club');
  ok(g.fixtures.filter((f) => f.leagueId === 'L1' && f.played).length === p1Played, `L1 results preserved (${p1Played})`);
  ok(g.messages.length >= p1.messages.length, 'inbox preserved');
  ok(g.messages.filter((m) => m.read).length >= p1.messages.filter((m: any) => m.read).length, 'read state preserved');
  ok(g.tx.length >= p1.tx.length, 'ledger preserved');
  ok(Object.values(g.reports).length === Object.keys(p1.reports).length, 'match reports preserved');
  ok(Object.values(g.players).every((p: any) => p.injuredWeeks === undefined && typeof p.injuredDays === 'number'), 'injuries converted to days');
  ok(Object.values(g.players).filter((p) => p.clubId && !p.academy).every((p) => p.contractEnd !== undefined && p.personality && p.agent), 'contract end dates, personalities and agents backfilled');
  ok(g.fixtures.every((f) => f.date !== undefined), 'all fixtures dated');
  console.log('Migrated date:', fmtDate(g.meta.date!));
  const l2 = computeTable(g, 'L2');
  ok(l2.every((r) => r.played > 0), 'L2 caught up to the current date');
  ok(g.board.objectives.length === 4 && g.scouting.scouts.length === 5 && g.training.plan.length === 7, 'board / scouting / training initialised');
  ok(g.messages.some((m) => m.subject === 'Phase 2 update installed'), 'update message posted');
  // Reload from the now-v2 database: must NOT migrate again
  const msgCount = g.messages.length;
  const g2 = (await loadGame())!;
  ok(g2.messages.length === msgCount && g2.meta.version === 3, 'second load does not re-migrate');
  ok(JSON.stringify(g2.leagues) === JSON.stringify(g.leagues), 'leagues persisted');
  // Play on: through the end of the season and beyond
  let guard = 0; const s0 = g2.meta.season;
  while (g2.meta.season === s0 && guard++ < 2000) {
    const f = userFixtureToday(g2);
    if (f && !f.played) { if (validateLineup(g2, userClub(g2)).length) repairLineup(g2, userClub(g2)); const r = playTodayMatches(g2); if (!r.ok) { fails++; console.log(r.error, r.errors); break; } }
    const r = advance(g2, 'event');
    if (r.stop === 'sacked') break;
    if (guard % 20 === 0) await saveGame(g2);
  }
  ok(g2.meta.season === s0 + 1 || g2.meta.sacked === true, 'migrated career plays through to the next season');
  ok(g2.cups.length >= 1 && !!g2.intl && !!g2.career && g2.news.length > 0 && Object.values(g2.clubs).every((c) => c.econ && c.staff), 'Phase 3 systems present after migration');
  console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
