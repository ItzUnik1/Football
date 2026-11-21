import { setRealNames } from './names';
import { initPhase3 } from './world3';
import type { Game, League, Message, Player } from './types';
import { addLowerClubs, agentFor, makeLeagues, personalityFor, seedNames, setGenDate } from './generator';
import { LEAGUE_DEFS } from './names';
import { contractEndFor, DAY, addDays, seasonStart } from './calendar';
import { makeFixtures, roundDate } from './fixtures';
import { emptyHistory } from './history';
import { initScouting } from './scouting';
import { initTraining } from './development';
import { initBoard } from './board';
import { youthIntake } from './youth';
import { invalidateIndex } from './team';
import { setSeed, hash01 } from './rng';
import { addMessage } from './messages';
import { playFixtures, userRound } from './game';

export const DB_VERSION = 3;

/**
 * Upgrades a Phase 1 career (week-based, single league) to Phase 2 in memory.
 * Nothing the player owns is discarded: squads, finances, results, messages, transactions and stats are all kept.
 */
export function migrateToV2(g: Game): void {
  const old = g as unknown as { meta: Game['meta'] };
  const meta = old.meta;
  const week = meta.week ?? 1;
  const season = meta.season ?? 2026;
  setSeed((meta.seed ?? 1) + 7919);
  const l1def = LEAGUE_DEFS[0];
  const l1start = (() => { const t = new Date(meta.startDate); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); })();
  const l1 = { startDate: l1start, midweekEvery: l1def.midweekEvery };
  const dateOfWeek = (w: number) => roundDate(l1, Math.min(Math.max(w, 1), 38));
  const date = week > 38 ? addDays(dateOfWeek(38), 1) : dateOfWeek(week);
  meta.date = date;
  meta.nextId = meta.nextId ?? 1;
  setGenDate(date);

  // Clubs
  const lvl = (rep: number) => Math.max(1, Math.min(5, Math.round(1 + rep / 25)));
  for (const c of Object.values(g.clubs)) {
    c.leagueId = c.leagueId ?? 'L1';
    c.medicalLevel ??= lvl(c.reputation); c.youthLevel ??= lvl(c.reputation); c.trainingLevel ??= lvl(c.reputation);
  }
  // Players
  const names: string[] = [];
  for (const p of Object.values(g.players) as (Player & { injuredWeeks?: number })[]) {
    names.push(p.name);
    if (p.injuredDays === undefined) { p.injuredDays = (p.injuredWeeks ?? 0) * 7; }
    delete p.injuredWeeks;
    p.injuries ??= []; p.returnDays ??= 0;
    if (p.contractEnd === undefined && p.clubId) p.contractEnd = contractEndFor(date, Math.max(1, p.contractYears));
    if (typeof p.lastComplaint === 'number' && p.lastComplaint < 1e9) p.lastComplaint = 0;
    p.personality ??= personalityFor(p.id, p.age);
    p.agent ??= agentFor(p.id);
    if (p.releaseClause === undefined && p.clubId && p.age >= 21 && p.age <= 29 && hash01(p.id + 'rc') < 0.25) p.releaseClause = Math.round((p.value * 2.5) / 50000) * 50000;
    p.recentMinutes ??= 0; p.form ??= 6.5; p.focus ??= 'auto';
    p.career ??= { apps: 0, goals: 0, assists: 0, cleanSheets: 0, seasons: [] };
    p.joined ??= meta.startDate;
  }
  seedNames(names);
  // Messages and ledger: weeks -> dates
  for (const m of g.messages as Message[]) {
    if (m.date === undefined) m.date = dateOfWeek(m.week);
    const a = m.action as unknown as { expires?: number } | undefined;
    if (a && typeof a.expires === 'number' && a.expires < 1e9) a.expires = addDays(dateOfWeek(a.expires), 0);
  }
  for (const t of g.tx) if (t.date === undefined) t.date = dateOfWeek(t.week);
  // Fixtures
  for (const f of g.fixtures) { f.leagueId = f.leagueId ?? 'L1'; f.date = f.date ?? roundDate(l1, f.week); }
  for (const r of Object.values(g.reports)) { r.date ??= dateOfWeek(r.week); r.leagueId ??= 'L1'; }

  // New divisions
  const byLeague: Record<string, string[]> = { L1: Object.keys(g.clubs).filter((id) => g.clubs[id].leagueId === 'L1'), L2: [], L3: [] };
  setRealNames(false); // Phase 1 worlds are fictional; keep the new divisions consistent
  addLowerClubs(g, byLeague, 1);
  g.leagues = makeLeagues(season, byLeague) as Record<string, League>;
  g.leagues.L1.startDate = l1start;
  for (const lid of ['L2', 'L3']) g.fixtures.push(...makeFixtures(g.leagues[lid].clubIds, g.leagues[lid], season));
  invalidateIndex(g);

  // New Phase 2 state
  g.history = emptyHistory();
  g.events = []; g.installments = [];
  initScouting(g);
  initTraining(g);
  initBoard(g);
  g.board.season = season;
  g.board.seasonStartBalance = g.clubs[meta.userClubId].balance;

  // Catch the lower divisions up to today's date so every league is in step.
  meta.version = 2;
  const start = Math.min(g.leagues.L2.startDate, g.leagues.L3.startDate);
  for (let t = start; t < date; t += DAY) playFixtures(g, t, false);
  meta.week = userRound(g);
  youthIntake(g, meta.userClubId);
  invalidateIndex(g);

  addMessage(g, {
    category: 'Board', from: 'Touchline', important: true, subject: 'Phase 2 update installed',
    body: 'Your career has been upgraded. Nothing was lost: squads, finances, results and messages are unchanged.\n\nNew: a real calendar with day-by-day progression, three divisions with promotion and relegation, scouting, a youth academy, training, medical, a board with objectives and job security, player personalities, season history, and deeper transfer negotiations (instalments, sell-ons, release clauses, loan-to-buy).',
    action: { kind: 'goto', screen: 'calendar' },
  });
  void seasonStart;
  void l1def;
}

/** Phase 2 -> Phase 3: adds cups, international football, managers, staff, economy and news. Nothing existing is changed. */
export function migrateToV3(g: Game): void {
  const meta = g.meta;
  setSeed((meta.seed ?? 1) + 104729);
  g.news = []; g.media ??= undefined as never;
  initPhase3(g);
  meta.version = DB_VERSION;
  addMessage(g, {
    category: 'Board', from: 'Touchline', important: true, subject: 'Phase 3 update installed',
    body: 'Your career has been upgraded and nothing was lost. New: a domestic cup, international football with national managers, advanced tactics and player roles, a manager career with job offers and reputation, staff, stadium and facility construction, a deeper club economy and a news feed.',
    action: { kind: 'goto', screen: 'home' },
  });
}
