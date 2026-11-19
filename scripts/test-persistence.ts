import 'fake-indexeddb/auto';
declare const process: { exit(code: number): never };
import { newCareer, playWeek, userClub } from '../src/engine/game';
import { saveGame, loadGame, hasSave, deleteSave } from '../src/db/database';
import { negotiateBid, askingPrice, contractDemand, maxYears } from '../src/engine/transfers';
import { performAction } from '../src/engine/inbox';
import { validateLineup, repairLineup } from '../src/engine/team';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

(async () => {
  const g = newCareer('c03', 777);
  await saveGame(g);
  ok(await hasSave(), 'save exists after first save');
  const t = Object.values(g.players).find((p) => p.clubId && p.clubId !== userClub(g).id && p.pos === 'DF')!;
  let bought = false;
  for (let i = 0; i < 6; i++) {
    const me = userClub(g);
    if (i === 2) { const r0 = negotiateBid(g, { playerId: t.id, buyerId: me.id, fee: askingPrice(g, t), wage: contractDemand(t, me), years: Math.min(2, maxYears(t)), kind: 'permanent' }); bought = r0.done; console.log('bid:', r0.message); }
    if (validateLineup(g, me).length) repairLineup(g, me);
    const r = playWeek(g);
    if (!r.ok) { fails++; console.log('play failed', r.error); break; }
    await saveGame(g);
  }
  const me = userClub(g);
  ok(bought, 'transfer executed in window');
  g.messages[0].read = true;
  await saveGame(g);
  const loaded = (await loadGame())!;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  ok(loaded.meta.week === g.meta.week && loaded.meta.week === 7, `week persisted (${loaded.meta.week})`);
  ok(same(Object.keys(loaded.players).sort(), Object.keys(g.players).sort()), 'players persisted');
  ok(same(Object.values(loaded.players).sort((a, b) => a.id.localeCompare(b.id)), Object.values(g.players).sort((a, b) => a.id.localeCompare(b.id))), 'player data identical');
  ok(same(loaded.clubs, g.clubs), 'clubs identical');
  ok(same(loaded.fixtures, g.fixtures), 'fixtures identical');
  ok(same(loaded.messages, g.messages), 'messages (incl. read state) identical');
  ok(same(loaded.reports, g.reports), 'reports identical');
  ok(same(loaded.tx, g.tx), 'ledger identical');
  ok(loaded.players[t.id].clubId === me.id, 'transferred player at user club after reload');
  // continue after reload & save again
  for (let i = 0; i < 3; i++) { const m2 = userClub(loaded); if (validateLineup(loaded, m2).length) repairLineup(loaded, m2); playWeek(loaded); await saveGame(loaded); }
  const again = (await loadGame())!;
  ok(again.meta.week === 10, 'continued play persists');
  ok(same(again.fixtures, loaded.fixtures), 'fixtures after second session identical');
  await deleteSave();
  ok(!(await hasSave()), 'delete removes save');
  console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
