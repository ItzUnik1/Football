import type { Club, Fixture, Game, League, MatchReport, Player } from './types';
import { createWorld } from './generator';
import { computeTable, leagueIdOf, makeFixtures, positionOf } from './fixtures';
import { simulateMatch, type TeamSheet } from './match';
import { aiSelectTeam, bestLineupScore, invalidateIndex, repairLineup, squadOf, squadStrength, validateLineup, wageBill } from './team';
import { matchdayRevenue, processWeekFinance } from './finance';
import { addMessage, gameNow, nextUnread, unreadCount } from './messages';
import { aiFinance, aiLoanRound, aiRenewals, aiTransferRound } from './ai';
import { contractProposalMessage, expireMessages } from './inbox';
import { contractDemand, isWindowOpen, processInstalments } from './transfers';
import { fmtMoney } from './valuation';
import { clamp, setSeed } from './rng';
import { DAY, addDays, dayDiff, daysToDeadline, fmtDate, fmtDateLong, parts, seasonStart, utc, weekday, windowInfo } from './calendar';
import { dailyRecovery, dailyUserTraining, initTraining, injure, monthlyDevelopment, sessionFor, weeklyDressingRoom } from './development';
import { initScouting, scoutingTick } from './scouting';
import { initBoard, ordinal, repRankIn, leagueTarget, weeklyBoard, userLeaguePos } from './board';
import { emptyHistory } from './history';
import { rolloverSeason } from './season';
import { youthIntake } from './youth';

export { ordinal };

export const START_DATE = (season: number): number => utc(season, 7, 1); // 1 August

export function newCareer(
  userClubId: string, seed = (Date.now() & 0x7fffffff),
  world?: { clubs: Record<string, Club>; players: Record<string, Player>; leagues?: Record<string, League> },
): Game {
  setSeed(seed);
  const w = world && world.leagues ? (world as { clubs: Record<string, Club>; players: Record<string, Player>; leagues: Record<string, League> }) : createWorld();
  const season = 2026;
  const fixtures: Fixture[] = [];
  Object.values(w.leagues).forEach((lg) => fixtures.push(...makeFixtures(lg.clubIds, lg, season)));
  const date = START_DATE(season);
  const g: Game = {
    meta: { userClubId, week: 1, season, startDate: date, date, nextMsg: 1, nextTx: 1, nextId: 1, seed, version: 2 },
    clubs: w.clubs, players: w.players, fixtures, messages: [], reports: {}, tx: [],
    leagues: w.leagues, history: emptyHistory(), scouting: undefined as never, board: undefined as never, training: undefined as never,
    events: [], installments: [],
  };
  initScouting(g);
  initTraining(g);
  initBoard(g);
  const intake = youthIntake(g, userClubId);
  intake.forEach((p) => { p.age = Math.min(p.age, 18); });
  const club = g.clubs[userClubId];
  const lg = g.leagues[club.leagueId ?? 'L1'];
  const xi = club.lineup.map((id) => g.players[id]);
  const top = [...xi].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  addMessage(g, {
    category: 'Board', from: 'Chairman', important: true, subject: `Welcome to ${club.name}`,
    body: `Welcome, Manager ${club.manager.name}. The board is delighted to have you at ${club.stadium}.\n\nWe compete in the ${lg.name}. Season objective: ${g.board.objectives[0].desc}\n\nYou have a transfer budget of ${fmtMoney(club.transferBudget)} and a wage budget of ${fmtMoney(club.wageBudget)} per week. Your board objectives are on the Club > Board screen.`,
    action: { kind: 'goto', screen: 'board' },
  });
  addMessage(g, {
    category: 'Transfers', from: 'Club Secretary', subject: 'The summer transfer window is open',
    body: `The window is open until ${fmtDate(windowInfo(date).closesOn!)}. Buy, sell and loan players, and use your scouts to find targets. A second window opens on 1 January.`,
    action: { kind: 'goto', screen: 'transfers' },
  });
  addMessage(g, {
    category: 'Players', from: 'Assistant Manager', subject: 'Squad assessment',
    body: `Our strongest XI averages ${squadStrength(g, userClubId)} overall. Key men: ${top.map((p) => `${p.name} (${p.pos} ${p.ovr})`).join(', ')}.\n\nCheck Tactics and Training before the season starts on ${fmtDate(lg.startDate)}.`,
    action: { kind: 'goto', screen: 'tactics' },
  });
  addMessage(g, {
    category: 'Scouting', from: 'Head of Recruitment', subject: 'Your scouting department',
    body: 'You have one scout employed. Assign scouts to positions, leagues or young talent from the Scouting screen; their reports will arrive here.',
    action: { kind: 'goto', screen: 'scouting' },
  });
  scheduleUpcomingNotice(g);
  return g;
}

/** Legacy helpers kept for compatibility. */
export const repRank = (g: Game, clubId: string): number => repRankIn(g, clubId);
export const boardObjective = (g: Game, clubId: string = g.meta.userClubId) => leagueTarget(g, clubId);
export const userClub = (g: Game): Club => g.clubs[g.meta.userClubId];
export const nextFixture = (g: Game, clubId = g.meta.userClubId): Fixture | undefined => {
  let best: Fixture | undefined;
  for (const f of g.fixtures) {
    if (f.played || (f.home !== clubId && f.away !== clubId)) continue;
    if (!best || (f.date ?? 0) < (best.date ?? 0)) best = f;
  }
  return best;
};
export const userFixtureToday = (g: Game): Fixture | undefined => {
  const t = gameNow(g);
  const me = g.meta.userClubId;
  return g.fixtures.find((f) => f.date === t && (f.home === me || f.away === me));
};
export const seasonComplete = (g: Game): boolean => {
  const lid = leagueIdOf(g, g.meta.userClubId);
  return g.fixtures.every((f) => (f.leagueId ?? 'L1') !== lid || f.played);
};
export const userRound = (g: Game): number => g.fixtures.filter((f) => f.played && (f.home === g.meta.userClubId || f.away === g.meta.userClubId)).length + 1;

function sheetFor(g: Game, club: Club, home: boolean): TeamSheet {
  const isUser = club.id === g.meta.userClubId;
  return {
    clubId: club.id, name: club.name, formation: club.formation, mentality: club.mentality, style: club.style,
    xi: club.lineup.map((id) => g.players[id]), bench: club.bench.map((id) => g.players[id]), captainId: club.captainId, home,
    familiarity: isUser ? g.training.familiarity : 55 + club.reputation * 0.2, medical: club.medicalLevel ?? 3,
  };
}

function scheduleUpcomingNotice(g: Game): void {
  const f = nextFixture(g);
  if (!f || f.date === undefined) return;
  const me = g.meta.userClubId;
  const opp = g.clubs[f.home === me ? f.away : f.home];
  const venue = f.home === me ? 'home' : 'away';
  const pos = positionOf(g, opp.id);
  addMessage(g, {
    category: 'Fixtures', from: 'Fixtures Secretary', subject: `${fmtDate(f.date)}: ${venue === 'home' ? 'vs' : 'at'} ${opp.name}`,
    body: `${fmtDateLong(f.date)} - ${venue === 'home' ? `${opp.name} visit ${userClub(g).stadium}` : `we travel to ${opp.stadium}`}.\n${opp.name} are ${ordinal(pos)} in the table (squad strength ${squadStrength(g, opp.id)}, manager ${opp.manager.name}).`,
    action: { kind: 'goto', screen: 'fixtures' },
  });
}

function applyPlayerResults(g: Game, report: MatchReport, hurtOut: Set<string>): void {
  const now = gameNow(g);
  for (const pm of report.players) {
    const p = g.players[pm.id];
    if (!p) continue;
    const won = pm.team === 'home' ? report.hg > report.ag : report.ag > report.hg;
    const lost = pm.team === 'home' ? report.hg < report.ag : report.ag < report.hg;
    const conceded = pm.team === 'home' ? report.ag : report.hg;
    p.stats.apps++; if (pm.started) p.stats.starts++;
    p.stats.goals += pm.goals; p.stats.assists += pm.assists;
    p.stats.yellow += pm.yellow; p.stats.red += pm.red;
    p.stats.minutes += pm.minutes; p.stats.ratingSum += pm.rating;
    p.recentMinutes = (p.recentMinutes ?? 0) + pm.minutes;
    p.form = Math.round(((p.form ?? 6.5) * 0.7 + pm.rating * 0.3) * 100) / 100;
    if (p.pos === 'GK' && pm.minutes >= 60 && conceded === 0) p.stats.cleanSheets++;
    const drop = Math.round((pm.minutes / 90) * (24 - p.phys.stamina / 8));
    p.fitness = clamp(p.fitness - drop, 20, 100);
    p.morale = clamp(p.morale + (won ? 3 : lost ? -3 : 0) + (pm.goals ? 2 : 0) + (pm.rating >= 8 ? 1.5 : 0) + (p.promisedStart && pm.started ? 4 : 0), 15, 100);
    if (p.promisedStart && pm.started) p.promisedStart = false;
    p.benchStreak = 0;
    if (pm.yellow > 0) {
      p.yellowCount += pm.yellow;
      if (p.yellowCount >= 5) { p.yellowCount = 0; p.suspended = Math.max(p.suspended, 1); hurtOut.add(p.id); }
    }
  }
  for (const b of report.bans) {
    const p = g.players[b.playerId];
    if (p) { p.suspended = Math.max(p.suspended, b.matches); hurtOut.add(p.id); }
  }
  for (const inj of report.injuries) {
    const p = g.players[inj.playerId];
    if (p) { injure(g, p, inj.days ?? inj.weeks * 7, inj.injury); hurtOut.add(p.id); }
  }
  void now;
}

export interface PlayResult { ok: boolean; error?: string; errors?: string[]; report?: MatchReport }

/** Simulates all fixtures dated `t` (optionally excluding the user's). */
export function playFixtures(g: Game, t: number, includeUser: boolean): MatchReport | undefined {
  const user = g.meta.userClubId;
  const todays = g.fixtures.filter((f) => !f.played && f.date === t && (includeUser || (f.home !== user && f.away !== user)));
  if (!todays.length) return undefined;
  const strength: Record<string, number> = {};
  const need = new Set<string>();
  todays.forEach((f) => { need.add(f.home); need.add(f.away); });
  need.forEach((id) => { strength[id] = bestLineupScore(squadOf(g, id), '4-3-3'); });
  for (const f of todays) {
    const h = g.clubs[f.home], a = g.clubs[f.away];
    if (h.id !== user) aiSelectTeam(g, h, strength[a.id], true);
    if (a.id !== user) aiSelectTeam(g, a, strength[h.id], false);
  }
  let userReport: MatchReport | undefined;
  const hurt = new Set<string>();
  const played = new Set<string>();
  const userFix: Fixture[] = [];
  for (const f of todays) {
    const h = g.clubs[f.home], a = g.clubs[f.away];
    for (const c of [h, a]) {
      for (const p of squadOf(g, c.id)) if (p.suspended > 0) p.suspended--; // serve a match ban
    }
    [...h.lineup, ...h.bench, ...a.lineup, ...a.bench].forEach((id) => played.add(id));
    const report = simulateMatch(sheetFor(g, h, true), sheetFor(g, a, false), f.id, f.week, f.date, f.leagueId);
    f.played = true; f.hg = report.hg; f.ag = report.ag;
    applyPlayerResults(g, report, hurt);
    matchdayRevenue(g, f);
    if (h.id === user || a.id === user) { g.reports[f.id] = report; userReport = report; g.lastReportId = f.id; userFix.push(f); }
  }
  // Bench streak for the user's squad
  if (userReport) for (const p of squadOf(g, user)) if (!played.has(p.id)) { p.benchStreak++; p.morale = clamp(p.morale - 0.5, 15, 100); }
  g.meta.week = userRound(g);
  if (userReport) postMatchMessages(g, userReport, [...hurt]);
  return userReport;
}

function postMatchMessages(g: Game, report: MatchReport, hurt: string[]): void {
  const me = userClub(g);
  const home = report.homeId === me.id;
  const gf = home ? report.hg : report.ag, ga = home ? report.ag : report.hg;
  const opp = home ? report.awayName : report.homeName;
  const res = gf > ga ? 'Win' : gf < ga ? 'Defeat' : 'Draw';
  addMessage(g, {
    category: 'Fixtures', from: 'Match Report', subject: `Full time: ${report.homeName} ${report.hg}-${report.ag} ${report.awayName}`,
    body: `${res} ${home ? 'at home' : 'away'} against ${opp}. Position: ${ordinal(positionOf(g, me.id))}.`,
    action: { kind: 'goto', screen: 'fixtures' },
  });
  for (const id of hurt) {
    const p = g.players[id];
    if (!p || p.clubId !== me.id) continue;
    if (p.injuredDays > 0) {
      addMessage(g, {
        category: 'Medical', from: 'Head Physio', important: p.ovr >= 70, subject: `Injury: ${p.name}`,
        body: `${p.name} has a ${p.injury?.toLowerCase() ?? 'injury'}. Expected recovery: ${p.injuredDays} days (back around ${fmtDate(addDays(gameNow(g), p.injuredDays))}). He has been removed from your selection if he was named.`,
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
  if (seasonComplete(g)) {
    const table = computeTable(g);
    const pos = table.findIndex((r) => r.clubId === me.id) + 1;
    const lg = g.leagues[me.leagueId ?? 'L1'];
    const note = pos <= lg.promote ? ' That is a promotion place.' : lg.relegate && pos > table.length - lg.relegate ? ' That is a relegation place.' : '';
    addMessage(g, {
      category: 'Competitions', from: 'League Office', important: true, subject: `Season complete: ${ordinal(pos)} in the ${lg.short}`,
      body: `${g.clubs[table[0].clubId].name} are champions with ${table[0].points} points. We finished ${ordinal(pos)} with ${table[pos - 1].points} points.${note}\nThe full season review arrives on 1 July.`,
      action: { kind: 'goto', screen: 'league' },
    });
  } else scheduleUpcomingNotice(g);
}

export function playTodayMatches(g: Game): PlayResult {
  if (g.meta.sacked) return { ok: false, error: 'You have been dismissed.' };
  const f = userFixtureToday(g);
  if (!f) return { ok: false, error: 'There is no match today.' };
  if (f.played) return { ok: false, error: 'Today\'s match has already been played.' };
  const user = userClub(g);
  const errors = validateLineup(g, user);
  if (errors.length) return { ok: false, error: 'Your lineup is invalid.', errors };
  // Changing formation resets some tactical familiarity
  if (g.training.formation !== user.formation) {
    g.training.familiarity = Math.max(20, g.training.familiarity - 25);
    g.training.formation = user.formation;
  }
  const report = playFixtures(g, gameNow(g), true);
  return { ok: true, report };
}

// ---------- Day processing ----------
export interface DayResult {
  ok: boolean;
  blocked?: 'match' | 'sacked' | 'invalid';
  date: number;
  note?: string;
}

export function continueDay(g: Game): DayResult {
  if (g.meta.sacked) return { ok: false, blocked: 'sacked', date: gameNow(g) };
  const f = userFixtureToday(g);
  if (f && !f.played) return { ok: false, blocked: 'match', date: gameNow(g) };
  endDay(g);
  return { ok: true, date: gameNow(g) };
}

function endDay(g: Game): void {
  const t = gameNow(g);
  const me = g.meta.userClubId;
  playFixtures(g, t, false);
  const { recovered } = dailyRecovery(g);
  for (const p of recovered) if (p.clubId === me) {
    addMessage(g, { category: 'Medical', from: 'Head Physio', subject: `${p.name} is fit again`, body: `${p.name} has recovered from his injury and has returned to training. He will be at reduced fitness for a few days.`, action: { kind: 'goto', screen: 'squad', playerId: p.id } });
  }
  const mt = userFixtureToday(g);
  const mtm = g.fixtures.some((f) => f.date === addDays(t, 1) && (f.home === me || f.away === me));
  dailyUserTraining(g, sessionFor(g, t, !!mt, mtm));
  scoutingTick(g);
  processInstalments(g);
  if (isWindowOpen(t) && (dayDiff(g.meta.startDate, t) % 2 === 0 || (daysToDeadline(t) ?? 9) <= 1)) { aiTransferRound(g); aiLoanRound(g); }
  expireMessages(g);

  g.meta.date = addDays(t, 1);
  const n = g.meta.date;
  const p = parts(n);
  if (n === seasonStart(g.meta.season + 1)) {
    rolloverSeason(g);
    const club = userClub(g);
    repairLineup(g, club);
    scheduleUpcomingNotice(g);
  }
  if (weekday(n) === 0) weeklyTick(g);
  if (p.d === 1) monthlyTick(g);
  windowNotices(g);
  expireMessages(g);
  invalidateIfNeeded(g);
}

const invalidateIfNeeded = (g: Game): void => { if (!g.idx) invalidateIndex(g); };

function windowNotices(g: Game): void {
  const n = gameNow(g);
  const w = windowInfo(n);
  const p = parts(n);
  if (w.open && p.d === 1) {
    addMessage(g, { category: 'Transfers', from: 'Club Secretary', important: true, subject: `${w.name} is open`, body: `You can trade until ${fmtDate(w.closesOn!)}.`, action: { kind: 'goto', screen: 'transfers' } });
  }
  if (w.open) {
    const left = dayDiff(n, w.closesOn!);
    if (left === 3) addMessage(g, { category: 'Transfers', from: 'Club Secretary', subject: 'Three days until the transfer deadline', body: `The window closes on ${fmtDate(w.closesOn!)}. Finish any deals you are working on.`, action: { kind: 'goto', screen: 'transfers' } });
    if (left === 0) addMessage(g, { category: 'Transfers', from: 'Club Secretary', important: true, subject: 'Deadline day', body: 'This is the final day of the window. Pending offers lapse tonight.', action: { kind: 'goto', screen: 'transfers' } });
  } else if ((p.m === 8 && p.d === 1) || (p.m === 1 && p.d === 1)) {
    addMessage(g, { category: 'Transfers', from: 'Club Secretary', subject: 'Transfer window closed', body: `The window has shut. It reopens on ${fmtDate(w.opensOn!)}.` });
  }
}

function weeklyTick(g: Game): void {
  const me = userClub(g);
  const n = gameNow(g);
  processWeekFinance(g);
  aiFinance(g);
  weeklyDressingRoom(g);
  weeklyBoard(g);
  // Contract proposals when one year or less remains (once per season per player)
  const sStart = seasonStart(g.meta.season);
  const squad = squadOf(g, me.id).sort((a, b) => b.ovr - a.ovr);
  squad.slice(0, 16).forEach((pl) => {
    if (pl.parentClubId || pl.contractEnd === undefined) return;
    const left = dayDiff(n, pl.contractEnd);
    if (left > 0 && left <= 240) {
      const had = g.messages.some((m) => m.action?.kind === 'contract' && m.action.playerId === pl.id && (m.date ?? 0) >= sStart);
      if (!had) contractProposalMessage(g, pl.id, contractDemand(pl, me));
    }
  });
  // Complaints from unused players
  squad.slice(0, 14).forEach((pl) => {
    if (pl.benchStreak >= 4 && pl.morale < 60 && n - pl.lastComplaint >= 56 * DAY && !pl.parentClubId && !pl.wantsMove) {
      pl.lastComplaint = n;
      addMessage(g, {
        category: 'Players', from: pl.name, subject: `${pl.name} wants more playing time`,
        body: `${pl.name} (${pl.pos}, ${pl.ovr}) has not featured in the matchday squad for ${pl.benchStreak} matches and is unhappy.`,
        action: { kind: 'complaint', playerId: pl.id },
      });
    }
  });
  // Finances
  const bill = wageBill(g, me.id);
  const recent = g.messages.some((m) => m.category === 'Finances' && (m.date ?? 0) > n - 56 * DAY);
  if (!recent && (me.balance < 0 || bill >= me.wageBudget * 0.97)) {
    addMessage(g, {
      category: 'Finances', from: 'Finance Director', important: true, subject: me.balance < 0 ? 'Club is in the red' : 'Wage budget almost exhausted',
      body: me.balance < 0 ? `The club balance is ${fmtMoney(me.balance)}. Transfer spending will be restricted.` : `Our wage bill is ${fmtMoney(bill)} per week against a budget of ${fmtMoney(me.wageBudget)}. New signings may be impossible.`,
      action: { kind: 'goto', screen: 'finances' },
    });
  }
  // League update every 4 weeks of the season
  const played = userRound(g) - 1;
  if (played > 0 && played < 38 && played % 4 === 0 && !g.messages.some((m) => m.category === 'Competitions' && m.subject.startsWith('League update') && (m.date ?? 0) > n - 20 * DAY)) {
    const table = computeTable(g);
    const pos = userLeaguePos(g);
    addMessage(g, {
      category: 'Competitions', from: 'League Office', subject: `League update after ${played} matches`,
      body: `${g.clubs[table[0].clubId].name} lead with ${table[0].points} points. We are ${ordinal(pos)} with ${table[pos - 1].points} points (GD ${table[pos - 1].gd >= 0 ? '+' : ''}${table[pos - 1].gd}).`,
      action: { kind: 'goto', screen: 'league' },
    });
  }
}

function monthlyTick(g: Game): void {
  monthlyDevelopment(g);
  const p = parts(gameNow(g));
  if (p.m === 11 || p.m === 3) aiRenewals(g);
  if (p.m === 11 || p.m === 3 || p.m === 5) {
    // pending AI contract expiries are handled at rollover
  }
  invalidateIndex(g);
}

// ---------- Advance controls ----------
export type AdvanceMode = 'day' | 'days' | 'week' | 'match' | 'event';
export interface AdvanceResult { days: number; stop: 'match' | 'done' | 'event' | 'sacked' | 'season'; reason?: string; unread: number }

const ACTIONABLE = new Set(['transfer_offer', 'loan_offer', 'contract', 'complaint', 'wants_move', 'youth_contract', 'loan_option', 'board_funds']);

/** Advances the calendar. Always stops on the user's match day (before the match is played). */
export function advance(g: Game, mode: AdvanceMode, n = 1): AdvanceResult {
  const limit = mode === 'day' ? 1 : mode === 'days' ? Math.min(60, Math.max(1, n)) : mode === 'week' ? 7 : 120;
  const startMsgCount = g.messages.length;
  const startSeason = g.meta.season;
  let days = 0;
  let stop: AdvanceResult['stop'] = 'done';
  let reason: string | undefined;
  while (days < limit) {
    const r = continueDay(g);
    if (!r.ok) { stop = r.blocked === 'sacked' ? 'sacked' : 'match'; reason = r.blocked === 'match' ? 'Match day' : 'Dismissed'; break; }
    days++;
    if (g.meta.season !== startSeason) { stop = 'season'; reason = 'A new season has begun'; break; }
    const f = userFixtureToday(g);
    if (f && !f.played) { stop = 'match'; reason = 'Match day'; break; }
    if (g.meta.sacked) { stop = 'sacked'; break; }
    if (mode === 'event') {
      const fresh = g.messages.slice(startMsgCount).find((m) => !m.resolved && m.action && ACTIONABLE.has(m.action.kind));
      const dl = daysToDeadline(gameNow(g)) === 0;
      if (fresh) { stop = 'event'; reason = fresh.subject; break; }
      if (dl) { stop = 'event'; reason = 'Transfer deadline day'; break; }
      const hurtMsg = g.messages.slice(startMsgCount).find((m) => m.category === 'Medical' && m.important);
      if (hurtMsg) { stop = 'event'; reason = hurtMsg.subject; break; }
    }
  }
  return { days, stop, reason, unread: unreadCount(g) };
}

export const daysToNextMatch = (g: Game): number | null => {
  const f = nextFixture(g);
  return f?.date === undefined ? null : dayDiff(gameNow(g), f.date);
};

export function topScorers(g: Game, n = 10, leagueId?: string): Player[] {
  const lid = leagueId ?? leagueIdOf(g, g.meta.userClubId);
  const ids = new Set(g.leagues[lid]?.clubIds ?? Object.keys(g.clubs));
  return Object.values(g.players).filter((p) => p.stats.goals > 0 && ids.has(p.parentClubId ?? p.clubId ?? '')).sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists).slice(0, n);
}

export { nextUnread };
