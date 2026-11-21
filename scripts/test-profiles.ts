import 'fake-indexeddb/auto';
declare const process: { exit(code: number): never };
import { newCareer } from '../src/engine/game';
import { createWorld } from '../src/engine/generator';
import { saveGame, loadGame, setSlot, slotSummaries, deleteSlot, SLOT_COUNT } from '../src/db/database';
import { answerPress } from '../src/engine/media';
import { squadOf } from '../src/engine/team';
import { gameNow } from '../src/engine/messages';
import { BACKGROUNDS } from '../src/engine/mgr';
import type { ManagerProfile } from '../src/engine/types3';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

// Real club names
const w = createWorld(2026, true);
const names = Object.values(w.clubs).map((c) => c.name);
ok(names.length === 60 && new Set(names).size === 60, '60 distinct clubs');
ok(names.includes('Arsenal') && names.includes('Sheffield United') && names.includes('Wrexham'), 'real club names used in all three divisions');
ok(Object.values(w.clubs).every((c) => c.stadium && c.capacity >= 5000), 'every club has a stadium');
const f = createWorld(2026, false);
ok(Object.values(f.clubs).some((c) => c.name === 'Northgate United'), 'fictional clubs still available');

// Manager profile
const prof: ManagerProfile = { name: 'Jamie Hartley', age: 52, nat: 'Brazil', background: 'analyst', style: 'Possession-based' };
const g = newCareer('c05', 99, createWorld(2026, true), prof);
const me = g.clubs[g.meta.userClubId];
ok(g.career.name === 'Jamie Hartley' && g.career.nat === 'Brazil' && g.career.age === 52, 'profile name, age, nationality applied');
ok(g.career.tactical === BACKGROUNDS.analyst.tactical && me.manager.tactical === 16, 'analyst background gives tactical attribute to the club manager');
ok(me.manager.name === 'Jamie Hartley' && g.messages[0].body.includes('Jamie Hartley'), 'welcome message uses the chosen name');
ok(me.instr?.passing === 'short', 'preferred style sets starting tactics (possession => short passing)');
const base = newCareer('c05', 99, createWorld(2026, true), { ...prof, background: 'player' });
ok(base.career.rep > g.career.rep, 'former professional starts with a higher reputation than an analyst');

// Motivation scales press effects
let pid = 0;
function praise(gm: typeof g): number {
  const star = squadOf(gm, gm.meta.userClubId)[0]; star.morale = 50;
  gm.messages.push({ id: 'pp' + ++pid, category: 'Media', from: 'P', subject: 's', body: 'b', read: false, createdAt: 0, date: gameNow(gm), action: { kind: 'press', topic: 'post_win', playerId: star.id, expires: gameNow(gm) + 86400000 } } as never);
  answerPress(gm, 'pp' + pid, 'praise_player'); return star.morale - 50;
}
const pb = praise(base), pa = praise(g);
ok(pb > pa && pa > 0, `high-motivation manager's praise lifts morale more (${pb.toFixed(1)} vs ${pa.toFixed(1)})`);

// Save slots
ok(SLOT_COUNT >= 5, `${SLOT_COUNT} slots`);
setSlot(1); await saveGame(g);
setSlot(3); await saveGame(base);
let s = await slotSummaries();
ok(s.length === SLOT_COUNT && s[0].used && !s[1].used && s[2].used, 'summaries show used and empty slots');
ok(s[0].manager === 'Jamie Hartley' && s[2].club === base.clubs[base.meta.userClubId].name, 'summaries describe manager and club');
setSlot(1); const l1 = (await loadGame())!;
setSlot(3); const l3 = (await loadGame())!;
ok(l1.career.background === 'analyst' && l3.career.background === 'player', 'slots keep separate careers');
ok(JSON.stringify(l1.career) === JSON.stringify(g.career), 'profile survives save and load');
await deleteSlot(3);
s = await slotSummaries();
ok(!s[2].used && s[0].used, 'deleting one slot leaves the others');
setSlot(1); await saveGame(g); const again = (await loadGame())!;
ok(again.meta.userClubId === g.meta.userClubId, 'slot 1 still loads after switching slots');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
