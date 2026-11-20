import type { BoardState, Game, Objective } from './types';
import { addMessage, gameNow } from './messages';
import { computeTable, leagueIdOf } from './fixtures';
import { clamp } from './rng';
import { fmtMoney } from './valuation';
import { wageBill } from './team';
import { clubRecords } from './history';
import { addDays } from './calendar';
import { acceptClubJob, availableJobs, onUserDismissed } from './mgr';

export const ordinal = (n: number): string => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** Rank of a club by reputation inside its own league (1 = best). */
export function repRankIn(g: Game, clubId: string): number {
  const lid = leagueIdOf(g, clubId);
  const ids = g.leagues[lid]?.clubIds ?? Object.keys(g.clubs);
  return [...ids].sort((a, b) => g.clubs[b].reputation - g.clubs[a].reputation).indexOf(clubId) + 1;
}

export function leagueTarget(g: Game, clubId: string): { top: number; text: string } {
  const lid = leagueIdOf(g, clubId);
  const lg = g.leagues[lid];
  const rank = repRankIn(g, clubId);
  const n = lg?.clubIds.length ?? 20;
  let top: number;
  if (rank <= 3) top = lg && lg.tier > 1 ? Math.max(lg.promote, 2) : 3;
  else top = Math.min(rank + 1, n - (lg?.relegate ?? 3) - 1);
  if (lg && lg.tier > 1 && rank <= 6) top = Math.max(top, 6) > 6 ? 6 : Math.min(top, lg.promote + 3);
  const text = rank <= 3 ? (lg && lg.tier > 1 ? `Win promotion: finish in the top ${Math.max(lg.promote, 3)}.` : 'Challenge for the title and finish in the top 3.')
    : top >= n - lg!.relegate - 3 ? `Avoid relegation: finish ${ordinal(top)} or higher.` : `Finish in the top ${top}.`;
  return { top, text };
}

export function initBoard(g: Game): void {
  const club = g.clubs[g.meta.userClubId];
  const lt = leagueTarget(g, club.id);
  const objs: Objective[] = [
    { id: 'o-league', kind: 'league', title: 'League position', desc: lt.text, target: lt.top, status: 'active', weight: 3 },
    { id: 'o-fin', kind: 'finance', title: 'Financial stability', desc: `Keep the club balance above ${fmtMoney(Math.min(0, Math.round(club.balance * 0.3)))} and avoid debt.`, target: Math.min(0, Math.round(club.balance * 0.3)), status: 'active', weight: 1 },
    { id: 'o-tr', kind: 'transfer', title: 'Transfer discipline', desc: `Net transfer spending of no more than ${fmtMoney(Math.round(club.transferBudget * 1.2))} this season.`, target: Math.round(club.transferBudget * 1.2), status: 'active', weight: 1 },
    { id: 'o-yth', kind: 'youth', title: 'Youth development', desc: 'Promote at least one academy player to the first team.', target: 1, status: 'active', weight: 1 },
  ];
  g.board = { confidence: 65, objectives: objs, season: g.meta.season, fundsRequested: false, seasonStartBalance: club.balance, netSpend: 0, youthPromoted: 0, warned: 0 };
}

export function userLeaguePos(g: Game): number { return computeTable(g).findIndex((r) => r.clubId === g.meta.userClubId) + 1; }

/** Re-evaluates objective status from the current state. */
export function evaluateObjectives(g: Game, final = false): void {
  const b = g.board;
  const club = g.clubs[g.meta.userClubId];
  const table = computeTable(g);
  const row = table.find((r) => r.clubId === club.id);
  const pos = table.findIndex((r) => r.clubId === club.id) + 1;
  const started = (row?.played ?? 0) >= 5;
  for (const o of b.objectives) {
    if (o.kind === 'league') o.status = final ? (pos <= o.target ? 'met' : 'failed') : !started ? 'active' : pos <= o.target ? 'ontrack' : 'offtrack';
    if (o.kind === 'finance') o.status = final ? (club.balance >= o.target ? 'met' : 'failed') : club.balance >= o.target ? 'ontrack' : 'offtrack';
    if (o.kind === 'transfer') o.status = final ? (b.netSpend <= o.target ? 'met' : 'failed') : b.netSpend <= o.target ? 'ontrack' : 'offtrack';
    if (o.kind === 'youth') o.status = b.youthPromoted >= o.target ? 'met' : final ? 'failed' : 'ontrack';
  }
}

/** Weekly confidence update, warnings and sacking check. */
export function weeklyBoard(g: Game): void {
  const b = g.board;
  if (g.meta.sacked) return;
  const club = g.clubs[g.meta.userClubId];
  const lt = leagueTarget(g, club.id);
  evaluateObjectives(g);
  const row = computeTable(g).find((r) => r.clubId === club.id)!;
  let d = 0;
  if (row.played >= 4) {
    const pos = userLeaguePos(g);
    const gap = lt.top - pos;
    d += clamp(gap * 0.09, -0.7, 0.6);
    const last5 = row.form.slice(-5);
    d += last5.filter((x) => x === 'W').length * 0.12 - last5.filter((x) => x === 'L').length * 0.14;
  }
  if (club.balance < 0) d -= 1.5;
  if (wageBill(g, club.id) > club.wageBudget * 1.02) d -= 0.5;
  d += (50 - b.confidence) * 0.012; // mean reversion
  b.confidence = clamp(Math.round((b.confidence + d) * 10) / 10, 0, 100);

  const now = gameNow(g);
  if (b.confidence < 32 && b.warned < 2 && row.played >= 8 && (b.warned === 0 || b.confidence < 24)) {
    b.warned++;
    addMessage(g, { category: 'Board', from: 'Chairman', important: true, subject: 'The board is concerned', body: `Confidence in your management has fallen to ${Math.round(b.confidence)}%. We expect results to improve quickly. ${lt.text}`, action: { kind: 'goto', screen: 'board' } });
  }
  if (b.confidence < 12 && row.played >= 14 && b.warned >= 2) {
    onUserDismissed(g);
    addMessage(g, { category: 'Board', from: 'Chairman', important: true, subject: 'You have been dismissed', body: `After a run of poor results and with confidence at ${Math.round(b.confidence)}%, the board has decided to part company with you. Thank you for your service.`, action: { kind: 'goto', screen: 'board' } });
  }
  // Funds request opportunity when confidence is high
  if (b.confidence >= 75 && !b.fundsRequested && !g.messages.some((m) => m.action?.kind === 'board_funds' && !m.resolved)) {
    const amount = Math.round((club.transferBudget * 0.25 + 2_000_000) / 500000) * 500000;
    addMessage(g, { category: 'Board', from: 'Chairman', subject: 'Additional transfer funds available', body: `The board is delighted with progress and is prepared to release an extra ${fmtMoney(amount)} to your transfer budget.`, action: { kind: 'board_funds', amount, expires: addDays(now, 21) } });
  }
}

export function requestFunds(g: Game): { ok: boolean; message: string } {
  const b = g.board, club = g.clubs[g.meta.userClubId];
  if (b.fundsRequested) return { ok: false, message: 'You have already asked for funds this season.' };
  if (b.confidence < 55) return { ok: false, message: 'The board does not have enough confidence in you to release funds.' };
  const amount = Math.round((club.transferBudget * 0.15 + 1_000_000) / 250000) * 250000;
  club.transferBudget += amount; b.fundsRequested = true; b.confidence = Math.max(0, b.confidence - 3);
  addMessage(g, { category: 'Board', from: 'Chairman', subject: 'Funds released', body: `The board has added ${fmtMoney(amount)} to your transfer budget. They expect results in return.` });
  return { ok: true, message: `The board released ${fmtMoney(amount)}.` };
}

/** Called at season rollover: evaluates, adjusts reputation and confidence, creates next objectives. */
export function seasonEndBoard(g: Game, pos: number): { met: boolean; summary: string } {
  evaluateObjectives(g, true);
  const b = g.board;
  const club = g.clubs[g.meta.userClubId];
  const league = b.objectives.find((o) => o.kind === 'league')!;
  const met = league.status === 'met';
  const others = b.objectives.filter((o) => o.kind !== 'league');
  const okOthers = others.filter((o) => o.status === 'met').length;
  b.confidence = clamp(b.confidence + (met ? 10 : -12) + okOthers * 2 - (others.length - okOthers) * 1.5, 0, 100);
  const lg = g.leagues[club.leagueId ?? 'L1'];
  const n = lg?.clubIds.length ?? 20;
  club.reputation = clamp(club.reputation + (pos <= 2 ? 2 : pos <= Math.ceil(n / 3) ? 1 : pos >= n - (lg?.relegate ?? 3) ? -2 : 0), 1, 99);
  const recs = clubRecords(g, club.id);
  void recs;
  const summary = b.objectives.map((o) => `${o.title}: ${o.status === 'met' ? 'achieved' : 'missed'}`).join('; ');
  return { met, summary };
}

/** Takes a vacant job with default interview answers (the Manager screen offers the full interview). */
export function takeNewJob(g: Game, clubId: string): { ok: boolean; message: string } {
  const r = acceptClubJob(g, clubId, { ambition: 'realistic', transfers: 'balanced', youth: true });
  if (r.ok) {
    const club = g.clubs[clubId];
    initBoard(g);
    g.board.confidence = 55;
    g.board.seasonStartBalance = club.balance;
    g.training.formation = club.formation;
    g.scouting.assignments = [];
    addMessage(g, { category: 'Board', from: 'Chairman', important: true, subject: `Welcome to ${club.name}`, body: `The board of ${club.name} has appointed you as manager. ${g.board.objectives[0].desc}` });
  }
  return r;
}

export function jobOffers(g: Game): string[] {
  return availableJobs(g).filter((j) => j.clubId).map((j) => j.clubId!).slice(0, 8);
}
export type { BoardState };
