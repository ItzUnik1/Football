import type { Cup, Fixture, Game } from './types';
import { chance, shuffle } from './rng';
import { addDays, dayDiff, fmtDate, fmtDateShort, seasonLabel } from './calendar';
import { addMessage, addTx, gameNow } from './messages';
import { addNews } from './news';
import { cupFinalDate, seasonSlots } from './slots';
import { fmtMoney } from './valuation';

export const CUP_ROUND_NAMES = ['First Round', 'Second Round', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];
export const CUP_PRIZE = [60_000, 120_000, 250_000, 500_000, 1_000_000, 3_000_000];
export const CUP_NAME = 'Touchline Cup';

export function createCup(g: Game, season: number): Cup {
  const sl = seasonSlots(season);
  const dates = [sl.cup[0], sl.cup[1], sl.cup[2], sl.cup[3], sl.cup[4], cupFinalDate(g)];
  const entrants = Object.keys(g.clubs);
  const byRep = [...entrants].sort((a, b) => g.clubs[b].reputation - g.clubs[a].reputation);
  const byes = byRep.slice(0, entrants.length - 56 >= 0 ? entrants.length - 56 : 0);
  const cup: Cup = {
    id: `cup${season}`, name: CUP_NAME, season,
    rounds: dates.map((date, n) => ({ n, name: CUP_ROUND_NAMES[n], date, drawn: false, done: false })),
    entrants, byes, alive: entrants.slice(), eliminated: {}, prize: CUP_PRIZE.slice(),
  };
  return cup;
}

export const currentCup = (g: Game): Cup | undefined => g.cups.find((c) => c.season === g.meta.season);

function drawRound(g: Game, cup: Cup, ri: number): void {
  const round = cup.rounds[ri];
  const pool = ri === 0 ? cup.alive.filter((id) => !cup.byes.includes(id)) : cup.alive.slice();
  const order = shuffle(pool);
  // slight giant-killing bias: when tiers differ, the lower-tier side hosts more often
  const tier = (id: string) => g.leagues[g.clubs[id].leagueId ?? 'L1']?.tier ?? 1;
  const out: Fixture[] = [];
  for (let i = 0; i + 1 < order.length; i += 2) {
    let h = order[i], a = order[i + 1];
    const th = tier(h), ta = tier(a);
    if (ri < 4) { if (th < ta ? chance(0.7) : th > ta ? chance(0.3) : chance(0.5)) [h, a] = [a, h]; if (th === ta && chance(0.5)) [h, a] = [a, h]; }
    out.push({ id: `fc${cup.season}-${ri}-${String(i / 2 + 1).padStart(2, '0')}`, week: ri + 1, home: h, away: a, played: false, hg: 0, ag: 0, leagueId: 'CUP', comp: 'cup', cupId: cup.id, round: ri, date: round.date, neutral: ri === 5 });
  }
  g.fixtures.push(...out);
  round.drawn = true;
  const me = g.meta.userClubId;
  const mine = out.find((f) => f.home === me || f.away === me);
  if (mine) {
    const opp = g.clubs[mine.home === me ? mine.away : mine.home];
    addMessage(g, {
      category: 'Competitions', from: 'Cup Committee', important: ri >= 3, subject: `${CUP_NAME} draw: ${round.name}`,
      body: `We have been drawn ${mine.neutral ? 'against' : mine.home === me ? 'at home to' : 'away at'} ${opp.name} (${g.leagues[opp.leagueId ?? 'L1']?.short}). The match is on ${fmtDate(round.date)}. Extra time and penalties will decide a draw.`,
      action: { kind: 'goto', screen: 'cups' },
    });
  } else if (cup.alive.includes(me) && !(ri === 0 && cup.byes.includes(me))) {
    // user already out - nothing
  } else if (ri === 0 && cup.byes.includes(me)) {
    addMessage(g, { category: 'Competitions', from: 'Cup Committee', subject: `${CUP_NAME}: bye to the Second Round`, body: `As one of the highest-ranked clubs we skip the First Round. Our first tie will be drawn before ${fmtDate(cup.rounds[1].date)}.`, action: { kind: 'goto', screen: 'cups' } });
  }
}

function finishRound(g: Game, cup: Cup, ri: number): void {
  const round = cup.rounds[ri];
  const fx = g.fixtures.filter((f) => f.cupId === cup.id && f.round === ri);
  const me = g.meta.userClubId;
  const winners = fx.map((f) => f.winner!).filter(Boolean);
  const prize = cup.prize[ri];
  for (const f of fx) {
    const loser = f.winner === f.home ? f.away : f.home;
    cup.eliminated[loser] = ri;
    const w = g.clubs[f.winner!];
    w.balance += prize; w.transferBudget += Math.round(prize * 0.2);
    addTx(g, w.id, 'prize', prize, `${CUP_NAME} ${round.name} prize money`);
    if (w.econ) w.econ.rev.prize += prize;
  }
  const byeClubs = ri === 0 ? cup.byes : [];
  cup.alive = [...byeClubs, ...winners];
  round.done = true;
  // Messages / news
  const mineF = fx.find((f) => f.home === me || f.away === me);
  if (mineF) {
    const won = mineF.winner === me;
    const opp = g.clubs[mineF.home === me ? mineF.away : mineF.home];
    const score = `${mineF.hg}-${mineF.ag}${mineF.pens ? ` (pens ${mineF.pens[0]}-${mineF.pens[1]})` : mineF.et ? ' (aet)' : ''}`;
    if (ri === 5) {
      addMessage(g, { category: 'Competitions', from: 'Cup Committee', important: true, subject: won ? `${CUP_NAME} winners!` : `${CUP_NAME} final lost`, body: won ? `We beat ${opp.name} ${score} and won the ${CUP_NAME}! Prize money: ${fmtMoney(prize)}.` : `We lost the final to ${opp.name} (${score}).`, action: { kind: 'goto', screen: 'cups' } });
    } else if (won) {
      addMessage(g, { category: 'Competitions', from: 'Cup Committee', subject: `Through to the ${CUP_ROUND_NAMES[ri + 1]}`, body: `We beat ${opp.name} ${score} in the ${round.name}. Prize money: ${fmtMoney(prize)}. The next round is on ${fmtDate(cup.rounds[ri + 1].date)}.`, action: { kind: 'goto', screen: 'cups' } });
    } else {
      addMessage(g, { category: 'Competitions', from: 'Cup Committee', subject: `Knocked out of the ${CUP_NAME}`, body: `We lost to ${opp.name} ${score} in the ${round.name}.`, action: { kind: 'goto', screen: 'cups' } });
    }
  }
  // Giant-killing news
  const tier = (id: string) => g.leagues[g.clubs[id].leagueId ?? 'L1']?.tier ?? 1;
  for (const f of fx) {
    const loser = f.winner === f.home ? f.away : f.home;
    if (tier(f.winner!) - tier(loser) >= 1 && ri >= 1) addNews(g, 'competition', `Cup shock: ${g.clubs[f.winner!].name} beat ${g.clubs[loser].name} in the ${round.name}`, { imp: 1, clubId: f.winner });
  }
  if (ri === 5) {
    const f = fx[0];
    cup.winner = f.winner; cup.runnerUp = f.winner === f.home ? f.away : f.home;
    addNews(g, 'competition', `${g.clubs[cup.winner!].name} win the ${CUP_NAME} ${seasonLabel(cup.season)}`, { imp: 2, clubId: cup.winner, body: `${g.clubs[cup.winner!].name} beat ${g.clubs[cup.runnerUp!].name} ${f.hg}-${f.ag}${f.pens ? ` on penalties (${f.pens[0]}-${f.pens[1]})` : f.et ? ' after extra time' : ''} in the final.` });
    g.history.cups ??= [];
    g.history.cups.push({ season: cup.season, name: cup.name, winner: cup.winner!, runnerUp: cup.runnerUp, score: `${f.hg}-${f.ag}${f.pens ? ` (${f.pens[0]}-${f.pens[1]} pens)` : f.et ? ' aet' : ''}` });
    if (g.history.cups.length > 60) g.history.cups.shift();
    if (cup.winner === me && g.career) g.career.trophies.push({ season: cup.season, name: cup.name, club: g.clubs[me].name });
  } else {
    addNews(g, 'competition', `${CUP_NAME}: ${CUP_ROUND_NAMES[ri + 1].toLowerCase()} line-up set`, { body: `Remaining: ${cup.alive.length} clubs. Next round ${fmtDateShort(cup.rounds[ri + 1].date)}.` });
  }
}

/** Called once per day: draws rounds three days ahead and closes finished rounds. */
export function cupDaily(g: Game): void {
  const cup = currentCup(g);
  if (!cup || cup.winner) return;
  const t = gameNow(g);
  for (let ri = 0; ri < cup.rounds.length; ri++) {
    const r = cup.rounds[ri];
    if (r.done) continue;
    if (!r.drawn) {
      const prevDone = ri === 0 || cup.rounds[ri - 1].done;
      if (prevDone && dayDiff(t, r.date) <= 3 && dayDiff(t, r.date) >= 0) drawRound(g, cup, ri);
      break;
    }
    const fx = g.fixtures.filter((f) => f.cupId === cup.id && f.round === ri);
    if (fx.length && fx.every((f) => f.played)) finishRound(g, cup, ri);
    break;
  }
}

/** Progress text for a club in the current cup. */
export function cupProgress(g: Game, clubId: string): { status: 'in' | 'out' | 'won' | 'none'; text: string; next?: Fixture } {
  const cup = currentCup(g);
  if (!cup) return { status: 'none', text: 'No cup this season' };
  if (cup.winner) return { status: cup.winner === clubId ? 'won' : cup.eliminated[clubId] !== undefined ? 'out' : 'none', text: cup.winner === clubId ? 'Winners' : cup.eliminated[clubId] !== undefined ? `Out in the ${cup.rounds[cup.eliminated[clubId]].name}` : 'Runners-up' };
  const out = cup.eliminated[clubId];
  if (out !== undefined) return { status: 'out', text: `Out in the ${cup.rounds[out].name}` };
  const next = g.fixtures.find((f) => f.cupId === cup.id && !f.played && (f.home === clubId || f.away === clubId));
  if (next) return { status: 'in', text: `${cup.rounds[next.round!].name} - ${fmtDateShort(next.date!)}`, next };
  const r = cup.rounds.find((x) => !x.done);
  return { status: 'in', text: r ? `Next: ${r.name} (${fmtDateShort(r.date)})` : 'In the cup' };
}
void addDays;
