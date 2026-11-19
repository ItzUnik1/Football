import type { Club, Fixture, Game, MatchReport, Player } from './types';
import { createWorld } from './generator';
import { TOTAL_WEEKS, computeTable, makeFixtures, positionOf } from './fixtures';
import { simulateMatch, type TeamSheet } from './match';
import { aiSelectTeam, bestLineupScore, squadOf, squadStrength, validateLineup, wageBill } from './team';
import { processWeekFinance } from './finance';
import { addMessage, gameDate } from './messages';
import { aiFinance, aiRenewals, aiTransferRound } from './ai';
import { contractProposalMessage, expireMessages } from './inbox';
import { contractDemand, isWindowOpen } from './transfers';
import { fmtMoney } from './valuation';
import { setSeed, clamp } from './rng';

export function newCareer(userClubId: string, seed = (Date.now() & 0x7fffffff), world?: { clubs: Record<string, Club>; players: Record<string, Player> }): Game {
  setSeed(seed);
  const { clubs, players } = world ?? createWorld();
  const fixtures = makeFixtures(Object.keys(clubs));
  const g: Game = {
    meta: { userClubId, week: 1, season: 2026, startDate: Date.UTC(2026, 7, 15), nextMsg: 1, nextTx: 1, seed, version: 1 },
    clubs, players, fixtures, messages: [], reports: {}, tx: [],
  };
  const club = g.clubs[userClubId];
  const rank = repRank(g, userClubId);
  const objective = boardObjective(rank);
  const xi = club.lineup.map((id) => g.players[id]);
  const top = [...xi].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  addMessage(g, {
    category: 'Board', from: 'Chairman', important: true, subject: `Welcome to ${club.name}`,
    body: `Welcome, Manager ${club.manager.name}. The board is delighted to have you at ${club.stadium}.\n\nSeason objective: ${objective.text}\n\nYou have a transfer budget of ${fmtMoney(club.transferBudget)} and a wage budget of ${fmtMoney(club.wageBudget)} per week. Use them wisely.`,
  });
  addMessage(g, {
    category: 'Transfers', from: 'Club Secretary', subject: 'The summer transfer window is open',
    body: `The window is open until matchday 5. You can buy, sell and loan players during this time. A second window opens at matchday 19. Free agents are available on the Transfers screen.`,
    action: { kind: 'goto', screen: 'transfers' },
  });
  addMessage(g, {
    category: 'Players', from: 'Assistant Manager', subject: 'Squad assessment',
    body: `Our strongest XI averages ${squadStrength(g, userClubId)} overall. Key men: ${top.map((p) => `${p.name} (${p.pos} ${p.ovr})`).join(', ')}.\n\nCheck the Tactics screen and set your lineup before the first match.`,
    action: { kind: 'goto', screen: 'tactics' },
  });
  scheduleUpcomingNotice(g);
  return g;
}

export const repRank = (g: Game, clubId: string): number =>
  Object.values(g.clubs).sort((a, b) => b.reputation - a.reputation).findIndex((c) => c.id === clubId) + 1;

export function boardObjective(rank: number): { top: number; text: string } {
  const top = rank <= 3 ? 3 : Math.min(rank + 1, 17);
  return { top, text: rank <= 3 ? 'Challenge for the title and finish in the top 3.' : top >= 15 ? `Stay clear of trouble: finish ${top}th or higher.` : `Finish in the top ${top}.` };
}

export const userClub = (g: Game): Club => g.clubs[g.meta.userClubId];
export const nextFixture = (g: Game, clubId = g.meta.userClubId): Fixture | undefined =>
  g.fixtures.find((f) => !f.played && (f.home === clubId || f.away === clubId));
export const seasonComplete = (g: Game): boolean => g.meta.week > TOTAL_WEEKS;

function sheetFor(g: Game, club: Club, home: boolean): TeamSheet {
  return {
    clubId: club.id, name: club.name, formation: club.formation, mentality: club.mentality, style: club.style,
    xi: club.lineup.map((id) => g.players[id]), bench: club.bench.map((id) => g.players[id]), captainId: club.captainId, home,
  };
}

function scheduleUpcomingNotice(g: Game): void {
  const f = nextFixture(g);
  if (!f) return;
  const opp = g.clubs[f.home === g.meta.userClubId ? f.away : f.home];
  const venue = f.home === g.meta.userClubId ? 'home' : 'away';
  const pos = positionOf(g, opp.id);
  addMessage(g, {
    category: 'Fixtures', from: 'Fixtures Secretary', subject: `Matchday ${f.week}: ${venue === 'home' ? 'vs' : 'at'} ${opp.name}`,
    body: `${gameDate(g, f.week)} - ${venue === 'home' ? `${opp.name} visit ${userClub(g).stadium}` : `we travel to ${opp.stadium}`}.\n${opp.name} are ${ordinal(pos)} in the table (squad strength ${squadStrength(g, opp.id)}, manager ${opp.manager.name}).`,
    action: { kind: 'goto', screen: 'fixtures' },
  });
}

export const ordinal = (n: number): string => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function applyPlayerResults(g: Game, f: Fixture, report: MatchReport, newlyHurt: Set<string>): void {
  const concededHome = report.ag, concededAway = report.hg;
  for (const pm of report.players) {
    const p = g.players[pm.id];
    if (!p) continue;
    const won = pm.team === 'home' ? report.hg > report.ag : report.ag > report.hg;
    const lost = pm.team === 'home' ? report.hg < report.ag : report.ag < report.hg;
    p.stats.apps++; if (pm.started) p.stats.starts++;
    p.stats.goals += pm.goals; p.stats.assists += pm.assists;
    p.stats.yellow += pm.yellow; p.stats.red += pm.red;
    p.stats.minutes += pm.minutes; p.stats.ratingSum += pm.rating;
    if (p.pos === 'GK' && pm.minutes >= 60 && (pm.team === 'home' ? concededHome : concededAway) === 0) p.stats.cleanSheets++;
    const drop = Math.round((pm.minutes / 90) * (24 - p.phys.stamina / 8));
    p.fitness = clamp(p.fitness - drop, 20, 100);
    p.morale = clamp(p.morale + (won ? 3 : lost ? -3 : 0) + (pm.goals ? 2 : 0) + (pm.rating >= 8 ? 1.5 : 0) + (p.promisedStart && pm.started ? 4 : 0), 15, 100);
    if (p.promisedStart && pm.started) p.promisedStart = false;
    p.benchStreak = 0;
    // Yellow-card accumulation: every 5th booking is a one-match ban
    if (pm.yellow > 0) {
      p.yellowCount += pm.yellow;
      if (p.yellowCount >= 5) { p.yellowCount = 0; p.suspended = Math.max(p.suspended, 1); newlyHurt.add(p.id); }
    }
  }
  for (const b of report.bans) {
    const p = g.players[b.playerId];
    if (p) { p.suspended = Math.max(p.suspended, b.matches); newlyHurt.add(p.id); }
  }
  for (const inj of report.injuries) {
    const p = g.players[inj.playerId];
    if (p) { p.injuredWeeks = inj.weeks; p.injury = inj.injury; p.fitness = Math.max(40, p.fitness - 10); newlyHurt.add(p.id); }
  }
  void f;
}

export interface PlayResult { ok: boolean; error?: string; errors?: string[]; report?: MatchReport }

export function playWeek(g: Game): PlayResult {
  const week = g.meta.week;
  if (week > TOTAL_WEEKS) return { ok: false, error: 'The season is complete.' };
  const user = userClub(g);
  const errors = validateLineup(g, user);
  if (errors.length) return { ok: false, error: 'Your lineup is invalid.', errors };

  const fixtures = g.fixtures.filter((f) => f.week === week);
  const strength: Record<string, number> = {};
  Object.values(g.clubs).forEach((c) => { strength[c.id] = bestLineupScore(squadOf(g, c.id), '4-3-3'); });
  // AI teams choose lineups, formations and tactics.
  for (const f of fixtures) {
    const h = g.clubs[f.home], a = g.clubs[f.away];
    if (h.id !== user.id) aiSelectTeam(g, h, strength[a.id], true);
    if (a.id !== user.id) aiSelectTeam(g, a, strength[h.id], false);
  }

  const newlyHurt = new Set<string>();
  const inSquadToday = new Set<string>();
  let userReport: MatchReport | undefined;
  for (const f of fixtures) {
    const h = g.clubs[f.home], a = g.clubs[f.away];
    [...h.lineup, ...h.bench, ...a.lineup, ...a.bench].forEach((id) => inSquadToday.add(id));
    const report = simulateMatch(sheetFor(g, h, true), sheetFor(g, a, false), f.id, week);
    f.played = true; f.hg = report.hg; f.ag = report.ag;
    applyPlayerResults(g, f, report, newlyHurt);
    if (h.id === user.id || a.id === user.id) { g.reports[f.id] = report; userReport = report; g.lastReportId = f.id; }
  }

  // Weekly recovery, injury/suspension countdowns and bench streaks
  for (const p of Object.values(g.players)) {
    if (!p.clubId) continue;
    if (!newlyHurt.has(p.id)) {
      if (p.injuredWeeks > 0) { p.injuredWeeks--; if (p.injuredWeeks === 0) p.injury = undefined; }
      if (p.suspended > 0) p.suspended--;
    }
    const played = inSquadToday.has(p.id);
    if (!played) p.benchStreak++;
    p.fitness = clamp(p.fitness + 10 + p.phys.stamina / 20 + (100 - p.fitness) * 0.06, 20, 100);
    if (!played) p.morale = clamp(p.morale - 0.5, 15, 100);
  }

  processWeekFinance(g, fixtures);
  aiFinance(g);
  g.meta.week = week + 1;
  if (g.meta.week === 9 || g.meta.week === 25) aiRenewals(g);
  expireMessages(g);
  if (isWindowOpen(g.meta.week)) aiTransferRound(g);
  expireMessages(g);
  postWeekMessages(g, userReport, [...newlyHurt]);
  return { ok: true, report: userReport };
}

function postWeekMessages(g: Game, report: MatchReport | undefined, hurt: string[]): void {
  const me = userClub(g);
  const week = g.meta.week; // already advanced
  if (report) {
    const home = report.homeId === me.id;
    const gf = home ? report.hg : report.ag, ga = home ? report.ag : report.hg;
    const opp = home ? report.awayName : report.homeName;
    const res = gf > ga ? 'Win' : gf < ga ? 'Defeat' : 'Draw';
    addMessage(g, {
      category: 'Fixtures', from: 'Match Report', subject: `Full time: ${report.homeName} ${report.hg}-${report.ag} ${report.awayName}`,
      body: `${res} ${home ? 'at home' : 'away'} against ${opp}. Position: ${ordinal(positionOf(g, me.id))}.`,
      action: { kind: 'goto', screen: 'fixtures' },
    });
  }
  // Medical and discipline
  for (const id of hurt) {
    const p = g.players[id];
    if (!p || p.clubId !== me.id) continue;
    if (p.injuredWeeks > 0) {
      addMessage(g, {
        category: 'Medical', from: 'Head Physio', important: p.ovr >= 70, subject: `Injury: ${p.name}`,
        body: `${p.name} has a ${p.injury?.toLowerCase() ?? 'injury'} and will miss ${p.injuredWeeks} match${p.injuredWeeks > 1 ? 'es' : ''}. He has been removed from your selection if he was named.`,
        action: { kind: 'goto', screen: 'squad', playerId: p.id },
      });
    } else if (p.suspended > 0) {
      addMessage(g, {
        category: 'Players', from: 'Disciplinary Committee', subject: `Suspension: ${p.name}`,
        body: `${p.name} is suspended for ${p.suspended} match${p.suspended > 1 ? 'es' : ''}.`,
        action: { kind: 'goto', screen: 'squad', playerId: p.id },
      });
    }
  }
  if (week > TOTAL_WEEKS) {
    const table = computeTable(g);
    const pos = table.findIndex((r) => r.clubId === me.id) + 1;
    const obj = boardObjective(repRank(g, me.id));
    addMessage(g, {
      category: 'Board', from: 'Chairman', important: true, subject: 'Season review',
      body: `The season is over. ${g.clubs[table[0].clubId].name} are champions with ${table[0].points} points. We finished ${ordinal(pos)} with ${table.find((r) => r.clubId === me.id)!.points} points.\n\nObjective (${obj.text}): ${pos <= obj.top ? 'ACHIEVED. The board is pleased.' : 'MISSED. The board expected more.'}`,
      action: { kind: 'goto', screen: 'league' },
    });
    addMessage(g, { category: 'Competitions', from: 'League Office', subject: 'Season complete', body: `${g.clubs[table[0].clubId].name} win the league. Top scorer and final standings are available on the League screen.` });
    return;
  }
  // Window notices
  if (week === 6) addMessage(g, { category: 'Transfers', from: 'Club Secretary', subject: 'Transfer window closed', body: 'The summer window has shut. The January window opens at matchday 19.' });
  if (week === 19) addMessage(g, { category: 'Transfers', from: 'Club Secretary', important: true, subject: 'January transfer window is open', body: 'You can trade again until matchday 23.', action: { kind: 'goto', screen: 'transfers' } });
  if (week === 24) addMessage(g, { category: 'Transfers', from: 'Club Secretary', subject: 'Transfer window closed', body: 'The January window has closed. No more signings until next season.' });
  if (week === 5 || week === 23) addMessage(g, { category: 'Transfers', from: 'Club Secretary', important: true, subject: 'Deadline day', body: 'This is the final matchday of the window. Any deals must be completed now.' });

  // Competition updates
  if (week % 5 === 0 || week === 20) {
    const table = computeTable(g);
    const pos = table.findIndex((r) => r.clubId === me.id) + 1;
    addMessage(g, {
      category: 'Competitions', from: 'League Office', subject: `League update after matchday ${week - 1}`,
      body: `${g.clubs[table[0].clubId].name} lead with ${table[0].points} points. We are ${ordinal(pos)} with ${table[pos - 1].points} points (GD ${table[pos - 1].gd >= 0 ? '+' : ''}${table[pos - 1].gd}).`,
      action: { kind: 'goto', screen: 'league' },
    });
  }
  // Board reviews
  if (week === 11 || week === 20 || week === 29) {
    const obj = boardObjective(repRank(g, me.id));
    const pos = positionOf(g, me.id);
    const ok = pos <= obj.top;
    addMessage(g, {
      category: 'Board', from: 'Chairman', important: !ok, subject: 'Board review',
      body: `We are ${ordinal(pos)} after ${week - 1} matches. Objective: ${obj.text} The board is ${ok ? 'satisfied with progress' : 'concerned about results'}.`,
    });
  }
  // Player complaints
  const squad = squadOf(g, me.id).sort((a, b) => b.ovr - a.ovr);
  squad.slice(0, 14).forEach((p) => {
    if (p.benchStreak >= 4 && p.morale < 60 && week - p.lastComplaint >= 8 && !p.parentClubId) {
      p.lastComplaint = week;
      addMessage(g, {
        category: 'Players', from: p.name, subject: `${p.name} wants more playing time`,
        body: `${p.name} (${p.pos}, ${p.ovr}) has not featured in the matchday squad for ${p.benchStreak} matches and is unhappy.`,
        action: { kind: 'complaint', playerId: p.id },
      });
    }
  });
  // Contract proposals
  if (week === 7 || week === 21) {
    squad.slice(0, 16).forEach((p) => {
      if (p.contractYears <= 1 && !p.parentClubId) {
        const pending = g.messages.some((m) => !m.resolved && m.action?.kind === 'contract' && m.action.playerId === p.id);
        if (!pending) contractProposalMessage(g, p.id, contractDemand(p, me));
      }
    });
  }
  // Financial warnings
  const bill = wageBill(g, me.id);
  const recent = g.messages.some((m) => m.category === 'Finances' && week - m.week < 8);
  if (!recent && (me.balance < 0 || bill >= me.wageBudget * 0.97)) {
    addMessage(g, {
      category: 'Finances', from: 'Finance Director', important: true, subject: me.balance < 0 ? 'Club is in the red' : 'Wage budget almost exhausted',
      body: me.balance < 0 ? `The club balance is ${fmtMoney(me.balance)}. Transfer spending will be restricted.` : `Our wage bill is ${fmtMoney(bill)} per week against a budget of ${fmtMoney(me.wageBudget)}. New signings may be impossible.`,
      action: { kind: 'goto', screen: 'finances' },
    });
  }
  scheduleUpcomingNotice(g);
}

export function topScorers(g: Game, n = 10): Player[] {
  return Object.values(g.players).filter((p) => p.stats.goals > 0).sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists).slice(0, n);
}
