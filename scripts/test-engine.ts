declare const process: { exit(code: number): never };
import { newCareer, userClub, advance, playTodayMatches, userFixtureToday, continueDay } from '../src/engine/game';
import { computeTable } from '../src/engine/fixtures';
import { squadOf, wageBill, validateLineup, repairLineup } from '../src/engine/team';
import { contractDemand, maxYears, negotiateBid, askingPrice, isWindowOpen, proposeSale, activateLoanOption, executeDeal } from '../src/engine/transfers';
import { performAction } from '../src/engine/inbox';
import { setSeed } from '../src/engine/rng';
import { fmtDate, seasonOf, dayDiff } from '../src/engine/calendar';
import { eventsBetween } from '../src/engine/calendarEvents';
import { assignScout, hireScout } from '../src/engine/scouting';
import { promoteYouth } from '../src/engine/youth';
import { requestFunds, jobOffers, takeNewJob } from '../src/engine/board';
import { academyOf } from '../src/engine/team';
import type { Game } from '../src/engine/types';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const T0 = Date.now();

const g = newCareer('c05', 12345);
ok(Object.keys(g.clubs).length === 60, '60 clubs');
ok(Object.keys(g.leagues).length === 3, '3 leagues');
ok(Object.values(g.leagues).every((l) => l.clubIds.length === 20), '20 clubs per league');
const nPlayers = Object.values(g.players).filter((p) => !p.academy).length;
ok(nPlayers >= 1200, `senior players >= 1200 (${nPlayers})`);
ok(g.fixtures.length === 380 * 3, '3 x 380 fixtures');
ok(g.fixtures.every((f) => f.date !== undefined && f.leagueId), 'every fixture has a date and league');
for (const lid of ['L1', 'L2', 'L3']) {
  const fx = g.fixtures.filter((f) => f.leagueId === lid);
  const cnt: Record<string, [number, number]> = {};
  fx.forEach((f) => { (cnt[f.home] ??= [0, 0])[0]++; (cnt[f.away] ??= [0, 0])[1]++; });
  ok(Object.values(cnt).every(([h, a]) => h === 19 && a === 19), `${lid}: 19 home / 19 away each`);
  ok(new Set(fx.map((f) => f.home + f.away)).size === 380, `${lid}: unique pairings`);
}
ok(validateLineup(g, userClub(g)).length === 0, 'initial user lineup valid');
ok(g.meta.date !== undefined && fmtDate(g.meta.date) === '1 Aug 2026', 'career starts 1 Aug 2026');
ok(isWindowOpen(g.meta.date!), 'summer window open at start');

// Calendar
const ev = eventsBetween(g, g.meta.date!, g.meta.date! + 60 * 86400000);
ok(ev.some((e) => e.cat === 'match') && ev.some((e) => e.cat === 'transfer') && ev.some((e) => e.cat === 'training'), 'calendar has matches, transfer and training events');

// Day progression
const d0 = g.meta.date!;
advance(g, 'day');
ok(g.meta.date === d0 + 86400000, 'advance one day moves exactly one day');
advance(g, 'days', 3);
ok(g.meta.date === d0 + 4 * 86400000, 'advance 3 days');

// Transfer with instalments + sell-on
const me = userClub(g);
const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== me.id && !p.academy && p.pos === 'MF' && askingPrice(g, p) < me.transferBudget * 0.5 && contractDemand(p, me) + wageBill(g, me.id) < me.wageBudget && !p.releaseClause)!;
const ask = askingPrice(g, target);
const low = negotiateBid(g, { playerId: target.id, buyerId: me.id, fee: Math.round(ask * 0.3), wage: contractDemand(target, me), years: Math.min(3, maxYears(target)), kind: 'permanent' });
ok(low.feeStatus === 'rejected', 'lowball rejected');
const before = { bal: me.balance, tb: me.transferBudget, n: squadOf(g, me.id).length };
const wage = Math.round(contractDemand(target, me) * 1.15);
const res = negotiateBid(g, { playerId: target.id, buyerId: me.id, fee: Math.round(ask * 1.2), wage, years: Math.min(3, maxYears(target)), kind: 'permanent', instalments: 2, sellOn: 5 });
ok(res.done || res.lostToRival !== undefined || (res.refusals?.length ?? 0) > 0 || res.wageStatus !== 'accepted', `negotiation resolves: ${res.message}`);
if (res.done && !res.lostToRival) {
  ok(me.balance < before.bal && squadOf(g, me.id).length === before.n + 1, 'balance debited and squad grew');
  ok(g.installments.length === 1, 'instalment scheduled');
  ok(target.sellOn !== undefined, 'sell-on recorded on player');
}
ok(validateLineup(g, me).length === 0 || (repairLineup(g, me), validateLineup(g, me).length === 0), 'lineup valid after signing');

// Scouting
const sc = g.scouting.scouts.find((s) => s.hired)!;
ok(assignScout(g, sc.id, { kind: 'position', pos: 'FW' }) === null, 'scout assigned');
// Youth
ok(academyOf(g, me.id).length >= 3, 'academy has prospects');
const prospect = academyOf(g, me.id)[0];
const pr = promoteYouth(g, prospect.id);
ok(pr.ok && !prospect.academy, 'promote academy player');

// Run a full season day by day, answering the inbox like a player would
setSeed(99);
function handleInbox(g: Game): void {
  g.messages.filter((m) => !m.resolved && m.action && m.action.kind !== 'goto' && m.action.kind !== 'scout_report').forEach((m) => {
    const a = m.action!;
    if (a.kind === 'transfer_offer' || a.kind === 'loan_offer') performAction(g, m.id, 'accept');
    else if (a.kind === 'contract' || a.kind === 'youth_contract' || a.kind === 'board_funds' || a.kind === 'loan_option') performAction(g, m.id, 'accept');
    else if (a.kind === 'complaint' || a.kind === 'wants_move') performAction(g, m.id, 'promise');
  });
}
let userMatches = 0, daysRun = 0;
let bad = 0;
const startSeason = g.meta.season;
let guard = 0;
while (g.meta.season === startSeason && guard++ < 2000) {
  const f = userFixtureToday(g);
  if (f && !f.played) {
    if (validateLineup(g, userClub(g)).length) repairLineup(g, userClub(g));
    const r = playTodayMatches(g);
    if (!r.ok) { console.log('play failed', r.error, r.errors); fails++; break; }
    userMatches++;
    const rp = r.report!;
    const goals = rp.events.filter((e) => e.type === 'goal');
    if (goals.filter((e) => e.team === 'home').length !== rp.hg || goals.filter((e) => e.team === 'away').length !== rp.ag) bad++;
    if (rp.stats.home.possession + rp.stats.away.possession !== 100) bad++;
    if (rp.stats.home.shots < rp.stats.home.onTarget) bad++;
    handleInbox(g);
    if (g.meta.sacked) break;
  }
  const r = advance(g, 'event');
  daysRun += r.days;
  handleInbox(g);
  if (r.stop === 'sacked') break;
  if (r.stop === 'season') break;
  if (r.days === 0 && r.stop === 'done') { fails++; console.log('stuck'); break; }
}
console.log(`season 1: ${userMatches} user matches, ${daysRun} days, ${((Date.now() - T0) / 1000).toFixed(1)}s elapsed; sacked=${!!g.meta.sacked}`);
ok(!g.meta.sacked || g.board.confidence < 15, 'not sacked unexpectedly');
ok(g.meta.season === startSeason + 1, 'season rolled over');
ok(bad === 0, `report stats consistent over ${userMatches} user matches`);
const rec = g.history.seasons[0];
ok(!!rec && rec.leagues.length === 3, 'history recorded for all leagues');
ok(rec.leagues.every((l) => l.table.length === 20 && l.table.every((r) => r.played === 38)), 'every club played 38');
ok(rec.leagues.every((l) => l.table.reduce((s, r) => s + r.gf, 0) === l.table.reduce((s, r) => s + r.ga, 0)), 'GF == GA in every league');
ok(rec.leagues.every((l) => l.table.every((r) => r.points === r.won * 3 + r.drawn)), 'points consistent');
const l1 = rec.leagues.find((l) => l.leagueId === 'L1')!, l2 = rec.leagues.find((l) => l.leagueId === 'L2')!;
ok(rec.awards.length >= 3, `awards generated (${rec.awards.map((a) => a.award).join(', ')})`);
ok(l1.relegated.length === 3 && l2.promoted.length === 3, 'promotion/relegation lists');
ok(l1.relegated.every((id) => g.clubs[id].leagueId === 'L2') && l2.promoted.every((id) => g.clubs[id].leagueId === 'L1'), 'clubs moved divisions');
ok(Object.values(g.leagues).every((l) => l.clubIds.length === 20), 'still 20 clubs per league after movement');
ok(g.fixtures.length === 1140 && g.fixtures.every((f) => !f.played), 'new season fixtures generated');
ok(g.fixtures.every((f) => seasonOf(f.date!) === g.meta.season), 'new fixtures dated in new season');
ok(Object.values(g.clubs).every((c) => { const n = squadOf(g, c.id).length; return n >= 17 && n <= 30; }), 'squad sizes in bounds after rollover');
ok(Object.values(g.clubs).every((c) => Number.isFinite(c.balance)), 'balances finite');
ok(Object.values(g.players).every((p) => !p.clubId || g.clubs[p.clubId]), 'no player attached to a missing club');
ok(Object.values(g.clubs).every((c) => c.lineup.every((id) => !id || g.players[id])), 'no dangling lineup ids');
console.log('Final user position', rec.userPos, 'pts', rec.userPoints, ' L1 champion', g.clubs[l1.champion].name);
const ageSample = Object.values(g.players).filter((p) => p.clubId);
ok(ageSample.every((p) => p.age >= 15 && p.age <= 40), 'ages in range');
ok(ageSample.some((p) => p.career && p.career.seasons.length > 0), 'career stats archived');
console.log('messages', g.messages.length, 'tx', g.tx.length, 'players', Object.keys(g.players).length);

// Second season quickly: just confirm engine keeps running through a full year
setSeed(7);
let g2guard = 0;
const s2 = g.meta.season;
while (g.meta.season === s2 && g2guard++ < 2000) {
  const f = userFixtureToday(g);
  if (f && !f.played) { if (validateLineup(g, userClub(g)).length) repairLineup(g, userClub(g)); playTodayMatches(g); handleInbox(g); }
  const r = advance(g, 'event');
  handleInbox(g);
  if (r.stop === 'sacked') {
    ok(g.meta.sacked === true && jobOffers(g).length > 0, 'sacked: job offers available');
    const old = g.meta.userClubId;
    takeNewJob(g, jobOffers(g)[0]);
    ok(!g.meta.sacked && g.meta.userClubId !== old && g.board.objectives.length === 4, 'took a new job: board reset');
    continue;
  }
  if (r.stop === 'season') break;
}
console.log('s2', g.meta.season, s2, g.history.seasons.length, fmtDate(g.meta.date!), 'sacked', g.meta.sacked, 'guard', g2guard, 'conf', g.board.confidence);
ok(g.meta.season === s2 + 1 && g.history.seasons.length === 2, 'second season completed and archived');
console.log(`total ${((Date.now() - T0) / 1000).toFixed(1)}s`);
void continueDay; void proposeSale; void activateLoanOption; void executeDeal; void requestFunds; void hireScout; void dayDiff;
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
