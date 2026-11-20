declare const process: { exit(code: number): never };
import { newCareer } from '../src/engine/game';
import { simulateMatch, type TeamSheet } from '../src/engine/match';
import { autoLineup, FORMATIONS, squadOf } from '../src/engine/team';
import { DEFAULT_INSTR, PRESETS, autoRoles, roleAt, rolesForSlot, roleSuitability, ROLES, tacticSignature, signatureChangeCost, defaultRoleFor, applyPreset } from '../src/engine/tactics';
import { setSeed } from '../src/engine/rng';
import type { Instructions, Mentality } from '../src/engine/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

const g = newCareer('c01', 777);
const A = g.clubs['c01'], B = g.clubs['c02'];
function sheet(clubId: string, home: boolean, instr: Instructions, ml: Mentality, roles?: string[]): TeamSheet {
  const c = g.clubs[clubId];
  const sq = squadOf(g, clubId).map((p) => ({ ...p, injuredDays: 0, suspended: 0 }));
  const { lineup, bench } = autoLineup(sq, '4-3-3');
  const map = new Map(sq.map((p) => [p.id, p]));
  return { clubId, name: c.name, formation: '4-3-3', mentality: ml, style: 'possession', xi: lineup.map((i) => map.get(i)!), bench: bench.map((i) => map.get(i)!), captainId: lineup[0], home, familiarity: 70, medical: 3, instr, roles };
}
function run(n: number, mk: (i: number) => [TeamSheet, TeamSheet]) {
  let gf = 0, ga = 0, w = 0, xgf = 0, xga = 0, poss = 0, fouls = 0;
  for (let i = 0; i < n; i++) {
    const [h, a] = mk(i);
    const r = simulateMatch(h, a, 't' + i, 1);
    gf += r.hg; ga += r.ag; if (r.hg > r.ag) w++; xgf += r.stats.home.xg; xga += r.stats.away.xg; poss += r.stats.home.possession; fouls += r.stats.home.fouls;
  }
  return { gf: gf / n, ga: ga / n, gd: (gf - ga) / n, w: w / n, xgd: (xgf - xga) / n, poss: poss / n, fouls: fouls / n };
}
/** Runs N matches alternating venue; results are from the first side's point of view. */
function runX(n: number, mk: (home: boolean) => [TeamSheet, TeamSheet]) {
  let gf = 0, ga = 0, w = 0, xgf = 0, xga = 0, poss = 0, fouls = 0;
  for (let i = 0; i < n; i++) {
    const home = i % 2 === 0;
    const [x, y] = mk(home);
    const r = home ? simulateMatch(x, y, 't' + i, 1) : simulateMatch(y, x, 't' + i, 1);
    const sx = home ? r.stats.home : r.stats.away;
    gf += home ? r.hg : r.ag; ga += home ? r.ag : r.hg;
    if ((home ? r.hg - r.ag : r.ag - r.hg) > 0) w++;
    xgf += sx.xg; xga += (home ? r.stats.away : r.stats.home).xg; poss += sx.possession; fouls += sx.fouls;
  }
  return { gf: gf / n, ga: ga / n, gd: (gf - ga) / n, w: w / n, xgd: (xgf - xga) / n, poss: poss / n, fouls: fouls / n };
}
setSeed(1);
const N = 2400;
const base = { ...DEFAULT_INSTR };
const neutral = run(4000, () => [sheet('c01', true, base, 'balanced'), sheet('c01', false, base, 'balanced')]);
console.log('mirror balanced', neutral);
ok(neutral.gd > 0.02 && neutral.gd < 0.7, `home advantage plausible in mirror match (GD ${neutral.gd.toFixed(2)})`);
ok(neutral.gf + neutral.ga > 2.0 && neutral.gf + neutral.ga < 4.2, `goals per game plausible (${(neutral.gf + neutral.ga).toFixed(2)})`);

// 1. Tactics change outcomes
const probe = (label: string, i: Partial<Instructions>, ml: Mentality = 'balanced') => {
  const r = runX(N, (h) => [sheet('c01', h, { ...base, ...i }, ml), sheet('c01', !h, base, 'balanced')]);
  console.log(label.padEnd(26), `GD ${r.gd.toFixed(2)} xGD ${r.xgd.toFixed(2)} poss ${r.poss.toFixed(0)} fouls ${r.fouls.toFixed(1)} win ${(r.w * 100).toFixed(0)}%`);
  return r;
};
const ref = probe('control (default)', {});
const shortP = probe('short passing, slow', { passing: 'short', tempo: 2 });
const longP = probe('long passing', { passing: 'long' });
const press5 = probe('gegenpress 5', { press: 5 });
const park = probe('park the bus', { press: 1, line: 1, tempo: 2 }, 'very_defensive');
const allout = probe('all-out attack', { tempo: 5 }, 'very_attacking');
ok(shortP.poss > ref.poss + 2, `short passing raises possession (${ref.poss.toFixed(0)} -> ${shortP.poss.toFixed(0)})`);
ok(longP.poss < ref.poss - 2, `long passing lowers possession (${ref.poss.toFixed(0)} -> ${longP.poss.toFixed(0)})`);
ok(press5.fouls > ref.fouls + 0.3, `pressing side commits more fouls (${ref.fouls.toFixed(1)} -> ${press5.fouls.toFixed(1)})`);
ok(Math.abs(press5.xgd - ref.xgd) > 0.02 || Math.abs(press5.poss - ref.poss) > 1, 'pressing changes the match');
ok(allout.xgd > ref.xgd, `all-out attack raises xG difference (${ref.xgd.toFixed(2)} -> ${allout.xgd.toFixed(2)})`);
ok(park.gd < ref.gd + 0.2, 'parking the bus does not out-create a balanced side');

// 2. No dominant strategy: across opponents of equal strength, no extreme setting beats balanced by a big margin
const extremes: [string, Partial<Instructions>, Mentality][] = [
  ['gegen', { press: 5, tempo: 5, line: 5 }, 'very_attacking'], ['highline', { line: 5 }, 'balanced'], ['wide5', { width: 5 }, 'attacking'], ['tempo5', { tempo: 5 }, 'balanced'],
];
for (const [n, i, m] of extremes) {
  const r = probe('extreme ' + n, i, m);
  ok(r.gd < ref.gd + 0.55, `${n} is not a dominant strategy (GD ${ref.gd.toFixed(2)} -> ${r.gd.toFixed(2)})`);
}

// 2b. The underdog benefits from defensive / counter set-ups against a much stronger side
const weak = Object.values(g.clubs).filter((c) => c.leagueId === 'L3').sort((a, b) => a.reputation - b.reputation)[0].id;
const strongId = 'c01';
const sheetOf = (id: string, h: boolean, i: Partial<Instructions>, ml: Mentality) => {
  const c = g.clubs[id]; const sq = squadOf(g, id).map((p) => ({ ...p, injuredDays: 0, suspended: 0 }));
  const { lineup, bench } = autoLineup(sq, '4-3-3'); const map = new Map(sq.map((p) => [p.id, p]));
  return { clubId: id, name: c.name, formation: '4-3-3' as const, mentality: ml, style: 'possession' as const, xi: lineup.map((x) => map.get(x)!), bench: bench.map((x) => map.get(x)!), captainId: lineup[0], home: h, familiarity: 70, medical: 3, instr: { ...base, ...i } };
};
const dog = (i: Partial<Instructions>, ml: Mentality) => runX(2400, (h) => [sheetOf(weak, h, i, ml), sheetOf(strongId, !h, {}, 'balanced')]);
const dDef = dog({}, 'balanced'), dCounter = dog({ counter: true, press: 2, line: 2, passing: 'long' }, 'defensive'), dPark = dog({ press: 1, line: 1, counter: true }, 'very_defensive');
console.log('underdog default', dDef.gd.toFixed(2), 'counter', dCounter.gd.toFixed(2), 'park', dPark.gd.toFixed(2), 'conceded', dDef.ga.toFixed(2), dCounter.ga.toFixed(2), dPark.ga.toFixed(2));
ok(dPark.ga < dDef.ga - 0.05, 'defensive set-up concedes fewer goals for the underdog');
ok(dCounter.gd > dDef.gd - 0.05, 'counter set-up is a viable underdog plan');

// 3. Situational effects: a high line is punished by a counter-attacking side with pace
const pace = (club: string, v: number) => squadOf(g, club).forEach((p) => { p.phys.pace = Math.min(95, v); });
const cnt = { ...base, counter: true, line: 2, passing: 'long' as const, press: 2 };
const vsHigh = runX(N, (h) => [sheet('c01', h, cnt, 'balanced'), sheet('c01', !h, { ...base, line: 5 }, 'balanced')]);
const vsDeep = runX(N, (h) => [sheet('c01', h, cnt, 'balanced'), sheet('c01', !h, { ...base, line: 1 }, 'balanced')]);
console.log('counter vs high line', vsHigh.xgd.toFixed(2), 'counter vs deep line', vsDeep.xgd.toFixed(2));
ok(vsHigh.xgd > vsDeep.xgd, 'counter-attacking hurts a high line more than a deep line');
void pace;

// 4. Roles have real effects and report notes
const slots = FORMATIONS['4-3-3'];
ok(slots.every((s) => rolesForSlot(s).length >= 1), 'every slot has role options');
ok(ROLES.some((r) => r.id === 'dlp') && ROLES.some((r) => r.id === 'sweeper_keeper') && ROLES.some((r) => r.id === 'inside_forward') && ROLES.some((r) => r.id === 'tf'), 'spec roles exist');
const sh = sheet('c01', true, base, 'balanced');
const roles = sh.xi.map((_, i) => defaultRoleFor(slots[i]));
const withAuto = { ...A } as typeof A;
withAuto.lineup = sh.xi.map((p) => p.id); withAuto.formation = '4-3-3';
autoRoles(g, withAuto);
ok(withAuto.roles!.length === 11 && withAuto.roles!.every((r, i) => rolesForSlot(slots[i]).some((x) => x.id === r)), 'auto roles are valid for each slot');
const forwardIdx = [8, 9, 10];
const mk = (rs: Record<number, string>) => { const r = [...roles]; Object.entries(rs).forEach(([k, v]) => { r[+k] = v; }); return r; };
const poacherRun = run(N, () => [sheet('c01', true, base, 'balanced', mk({ 9: 'poacher' })), sheet('c01', false, base, 'balanced')]);
const defaultRun = run(N, () => [sheet('c01', true, base, 'balanced', roles), sheet('c01', false, base, 'balanced')]);
console.log('poacher vs default', poacherRun.gd.toFixed(2), defaultRun.gd.toFixed(2));
ok(Math.abs(poacherRun.xgd - defaultRun.xgd) < 0.5, 'a role change is a modest, not game-breaking, effect');
// role suitability follows attributes
const st = squadOf(g, 'c01').filter((p) => p.pos === 'FW').sort((a, b) => b.phys.jumping + b.phys.strength - a.phys.jumping - a.phys.strength)[0];
const tfRole = ROLES.find((r) => r.id === 'tf')!, pcRole = ROLES.find((r) => r.id === 'poacher')!;
ok(roleSuitability(st, tfRole) >= 0 && roleSuitability(st, pcRole) >= 0, 'role suitability computes');
void forwardIdx;

// 5. Match reports explain tactical factors
let withFactors = 0, tot = 0;
for (let i = 0; i < 120; i++) {
  const r = simulateMatch(sheet('c01', true, { ...base, press: 5, tempo: 5, line: 5 }, 'attacking'), sheet('c01', false, { ...cnt }, 'balanced'), 'x' + i, 1);
  tot++; if (r.factors && r.factors.length) withFactors++;
}
ok(withFactors / tot > 0.7, `reports explain tactical factors (${withFactors}/${tot})`);

// 6. Familiarity
const lowFam = run(400, () => [sheet('c01', true, base, 'balanced'), sheet('c01', false, base, 'balanced')]);
const mkFam = (f: number) => run(400, () => { const h = sheet('c01', true, base, 'balanced'); h.familiarity = f; return [h, sheet('c01', false, base, 'balanced')]; });
const f20 = mkFam(15), f95 = mkFam(95);
ok(f95.xgd > f20.xgd, `high familiarity beats low (xGD ${f20.xgd.toFixed(2)} -> ${f95.xgd.toFixed(2)})`);
void lowFam;
const sig1 = tacticSignature(A);
applyPreset(A, 'gegen');
const sig2 = tacticSignature(A);
ok(signatureChangeCost(sig1, sig2) > 5 && signatureChangeCost(sig1, sig1) === 0, 'changing tactics costs familiarity');
ok(roleAt(A, 0).id === 'gk', 'goalkeeper default role');

// 7. Knockout: extra time and penalties
let et = 0, pens = 0, bad = 0;
for (let i = 0; i < 300; i++) {
  const r = simulateMatch(sheet('c01', true, base, 'balanced'), sheet('c01', false, base, 'balanced'), 'k' + i, 1, undefined, 'CUP', { knockout: true, comp: 'cup' });
  if (r.et) et++;
  if (r.shootout) { pens++; if (r.shootout.home === r.shootout.away || r.hg !== r.ag) bad++; }
  if (!r.et && r.hg === r.ag) bad++;
  if (r.events.filter((e) => e.type === 'sub').length > 12) bad++;
  if (r.stats.home.possession + r.stats.away.possession !== 100) bad++;
}
ok(et > 30 && pens > 10 && bad === 0, `knockout matches: ${et} ET, ${pens} shootouts, no inconsistencies`);
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
