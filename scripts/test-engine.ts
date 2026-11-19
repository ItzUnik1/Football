declare const process: { exit(code: number): never };
import { newCareer, playWeek, userClub } from '../src/engine/game';
import { computeTable } from '../src/engine/fixtures';
import { squadOf, wageBill, validateLineup, repairLineup } from '../src/engine/team';
import { contractDemand, maxYears, negotiateBid, askingPrice, isWindowOpen, proposeSale, interestedClubs } from '../src/engine/transfers';
import { performAction } from '../src/engine/inbox';
import { simulateMatch } from '../src/engine/match';
import { setSeed } from '../src/engine/rng';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

const g = newCareer('c05', 12345);
ok(Object.keys(g.clubs).length === 20, '20 clubs');
const nPlayers = Object.keys(g.players).length;
ok(nPlayers >= 400 && nPlayers <= 480, `players ~400 (${nPlayers})`);
ok(g.fixtures.length === 380, '380 fixtures');
const cnt: Record<string, [number, number]> = {};
g.fixtures.forEach((f) => { (cnt[f.home] ??= [0, 0])[0]++; (cnt[f.away] ??= [0, 0])[1]++; });
ok(Object.values(cnt).every(([h, a]) => h === 19 && a === 19), '19 home / 19 away each');
const pairs = new Set(g.fixtures.map((f) => f.home + f.away));
ok(pairs.size === 380, 'every ordered pairing unique');
ok(validateLineup(g, userClub(g)).length === 0, 'initial user lineup valid');

// Transfer in window
const me = userClub(g);
ok(isWindowOpen(g.meta.week), 'window open week 1');
const target = Object.values(g.players).find((p) => p.clubId && p.clubId !== me.id && p.pos === 'MF' && askingPrice(g, p) < me.transferBudget * 0.5 && contractDemand(p, me) + wageBill(g, me.id) < me.wageBudget)!;
const ask = askingPrice(g, target);
const lowball = negotiateBid(g, { playerId: target.id, buyerId: me.id, fee: Math.round(ask * 0.3), wage: contractDemand(target, me), years: Math.min(3, maxYears(target)), kind: 'permanent' });
ok(lowball.feeStatus === 'rejected', 'lowball rejected');
const before = { bal: me.balance, tb: me.transferBudget, n: squadOf(g, me.id).length, bill: wageBill(g, me.id) };
const deal = negotiateBid(g, { playerId: target.id, buyerId: me.id, fee: ask, wage: contractDemand(target, me), years: Math.min(3, maxYears(target)), kind: 'permanent' });
ok(deal.done, `bid accepted: ${deal.message}`);
ok(me.balance === before.bal - ask && me.transferBudget === before.tb - ask, 'finances debited');
ok(squadOf(g, me.id).length === before.n + 1 && target.clubId === me.id, 'squad grew');
ok(validateLineup(g, me).length === 0, 'lineup still valid after signing');

// Run season
setSeed(99);
let weeks = 0, totalGoals = 0, homeWins = 0, draws = 0, awayWins = 0;
while (g.meta.week <= 38) {
  const me2 = userClub(g);
  const errs = validateLineup(g, me2);
  if (errs.length) repairLineup(g, me2);
  const r = playWeek(g);
  if (!r.ok) { console.log('playWeek failed', r.error, r.errors); fails++; break; }
  weeks++;
  // handle inbox offers like a player would
  g.messages.filter((m) => !m.resolved && m.action && m.action.kind !== 'goto').forEach((m) => {
    const a = m.action!;
    if (a.kind === 'transfer_offer' && weeks === 2) { const r2 = performAction(g, m.id, 'accept'); console.log('  inbox accept transfer:', r2.message); }
    else if (a.kind === 'contract') performAction(g, m.id, 'accept');
    else if (a.kind === 'complaint') performAction(g, m.id, 'promise');
  });
}
ok(weeks === 38, 'played 38 weeks');
g.fixtures.forEach((f) => { totalGoals += f.hg + f.ag; if (f.hg > f.ag) homeWins++; else if (f.hg < f.ag) awayWins++; else draws++; });
console.log(`avg goals ${(totalGoals / 380).toFixed(2)}  H/D/A ${(homeWins / 3.8).toFixed(0)}%/${(draws / 3.8).toFixed(0)}%/${(awayWins / 3.8).toFixed(0)}%`);
ok(totalGoals / 380 > 2.2 && totalGoals / 380 < 3.2, 'avg goals plausible');
ok(homeWins > awayWins, 'home advantage present');
const t = computeTable(g);
ok(t.every((r) => r.played === 38), 'all played 38');
ok(t.reduce((s, r) => s + r.gf, 0) === t.reduce((s, r) => s + r.ga, 0), 'GF == GA');
ok(t.every((r) => r.points === r.won * 3 + r.drawn), 'points consistent');
console.log('Top 3:', t.slice(0, 3).map((r) => `${g.clubs[r.clubId].short} ${r.points}`).join(', '), ' Bottom:', g.clubs[t[19].clubId].short, t[19].points);
const rep = [...Object.values(g.clubs)].sort((a, b) => b.reputation - a.reputation);
const topRepRank = t.findIndex((r) => r.clubId === rep[0].id) + 1;
console.log('Strongest-rep club finished', topRepRank);
ok(Object.values(g.clubs).every((c) => squadOf(g, c.id).length >= 17 && squadOf(g, c.id).length <= 28), 'squad sizes within bounds');
ok(Object.values(g.clubs).every((c) => Number.isFinite(c.balance)), 'balances finite');
console.log('messages:', g.messages.length, 'unread:', g.messages.filter((m) => !m.read).length, 'tx:', g.tx.length);
// Match stat consistency on user reports
let bad = 0;
Object.values(g.reports).forEach((r) => {
  const goals = r.events.filter((e) => e.type === 'goal');
  const h = goals.filter((e) => e.team === 'home').length, a = goals.filter((e) => e.team === 'away').length;
  if (h !== r.hg || a !== r.ag) bad++;
  if (r.stats.home.shots < r.stats.home.onTarget || r.stats.home.onTarget < r.hg) bad++;
  if (r.stats.away.shots < r.stats.away.onTarget || r.stats.away.onTarget < r.ag) bad++;
  if (r.stats.home.possession + r.stats.away.possession !== 100) bad++;
  const yc = r.events.filter((e) => e.type === 'yellow').length;
  if (yc !== r.stats.home.yellow + r.stats.away.yellow) bad++;
});
ok(bad === 0, `report stats consistent across ${Object.keys(g.reports).length} user matches`);
const sample = Object.values(g.reports)[0];
console.log('sample', sample.homeName, sample.hg, '-', sample.ag, JSON.stringify(sample.stats.home), sample.analysis.join(' | '));
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
