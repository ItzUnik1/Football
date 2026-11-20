import 'fake-indexeddb/auto';
declare const process: { exit(code: number): never };
import { newCareer, userClub, advance, playTodayMatches, userFixtureToday } from '../src/engine/game';
import { saveGame, loadGame, hasSave, deleteSave } from '../src/db/database';
import { negotiateBid, askingPrice, contractDemand, maxYears } from '../src/engine/transfers';
import { validateLineup, repairLineup } from '../src/engine/team';
import type { Game } from '../src/engine/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sorted = <T extends { id: string }>(o: Record<string, T>) => Object.values(o).sort((a, b) => a.id.localeCompare(b.id));

function step(g: Game, days: number): void {
  let d = 0;
  while (d < days) {
    const f = userFixtureToday(g);
    if (f && !f.played) { if (validateLineup(g, userClub(g)).length) repairLineup(g, userClub(g)); playTodayMatches(g); }
    const r = advance(g, 'day'); d += Math.max(1, r.days);
  }
}
function compare(label: string, a: Game, b: Game): void {
  ok(same(sorted(a.players), sorted(b.players)), `${label}: players identical`);
  ok(same(a.clubs, b.clubs), `${label}: clubs identical`);
  ok(same(a.fixtures, b.fixtures), `${label}: fixtures identical`);
  ok(same(a.messages, b.messages), `${label}: messages (incl. read state) identical`);
  ok(same(a.reports, b.reports), `${label}: reports identical`);
  ok(same(a.tx, b.tx), `${label}: ledger identical`);
  ok(same(a.meta, b.meta), `${label}: meta identical`);
  for (const k of ['leagues', 'history', 'scouting', 'board', 'training', 'events', 'installments'] as const) ok(same(a[k], b[k]), `${label}: ${k} identical`);
}

(async () => {
  const g = newCareer('c03', 777);
  await saveGame(g);
  ok(await hasSave(), 'save exists after first save');
  const t = Object.values(g.players).find((p) => p.clubId && p.clubId !== userClub(g).id && p.pos === 'DF' && !p.academy && !p.releaseClause)!;
  step(g, 10);
  const me = userClub(g);
  const r0 = negotiateBid(g, { playerId: t.id, buyerId: me.id, fee: Math.round(askingPrice(g, t) * 1.2), wage: Math.round(contractDemand(t, me) * 1.2), years: Math.min(2, maxYears(t)), kind: 'permanent', instalments: 2 });
  console.log('bid:', r0.message);
  step(g, 40);
  g.messages[0].read = true;
  await saveGame(g);
  const loaded = (await loadGame())!;
  ok(loaded.meta.date === g.meta.date, 'date persisted');
  compare('mid-season', g, loaded);
  step(loaded, 20); await saveGame(loaded);
  const again = (await loadGame())!;
  compare('after second session', loaded, again);
  // full year including rollover (deleted fixtures / players must be removed from the DB)
  const target = loaded.meta.season;
  let guard = 0;
  while (again.meta.season === target && guard++ < 500) { step(again, 7); await saveGame(again); }
  ok(again.meta.season === target + 1, 'season rolled over during persistence run');
  const final = (await loadGame())!;
  compare('after rollover', again, final);
  ok(final.fixtures.length === 1140, 'old-season fixtures removed from the database');
  await deleteSave();
  ok(!(await hasSave()), 'delete removes save');
  console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
