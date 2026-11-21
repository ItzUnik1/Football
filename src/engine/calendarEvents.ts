import type { Game } from './types';
import { addDays, dayDiff, DAY, fmtDateShort, parts, seasonOf, utc, weekday, windowInfo } from './calendar';
import { sessionFor } from './development';
import { CUP_ROUND_NAMES } from './cups';

export type CalCat = 'match' | 'transfer' | 'training' | 'medical' | 'contract' | 'board' | 'club' | 'scouting' | 'youth' | 'league';
export const CAL_COLORS: Record<CalCat, string> = {
  match: '#ef4444', transfer: '#22c55e', training: '#38bdf8', medical: '#f97316', contract: '#eab308',
  board: '#a855f7', club: '#94a3b8', scouting: '#14b8a6', youth: '#ec4899', league: '#6366f1',
};
export interface CalEvent { id: string; date: number; cat: CalCat; title: string; detail: string; ref?: { screen?: string; playerId?: string; fixtureId?: string } }

/** Derives all calendar events in [from, to] from game state. Nothing is double-stored. */
export function eventsBetween(g: Game, from: number, to: number): CalEvent[] {
  const out: CalEvent[] = [];
  const me = g.meta.userClubId;
  const days = dayDiff(from, to);
  // Fixtures (user's club always; training days are generated below)
  const userFix = new Map<number, typeof g.fixtures[0]>();
  for (const f of g.fixtures) {
    if (f.date === undefined || f.date < from || f.date > to) continue;
    if (f.home !== me && f.away !== me) continue;
    userFix.set(f.date, f);
    const opp = g.clubs[f.home === me ? f.away : f.home];
    out.push({
      id: 'f' + f.id, date: f.date, cat: 'match',
      title: `${f.home === me ? 'vs' : 'at'} ${opp.short}${f.played ? ` ${f.home === me ? f.hg : f.ag}-${f.home === me ? f.ag : f.hg}` : ''}`,
      detail: `${f.comp === 'cup' ? `Cup - ${CUP_ROUND_NAMES[f.round ?? 0]}` : `${g.leagues[f.leagueId ?? 'L1']?.name ?? 'League'}, round ${f.week}`}: ${g.clubs[f.home].name} ${f.played ? `${f.hg}-${f.ag}` : 'v'} ${g.clubs[f.away].name}`,
      ref: { screen: 'match', fixtureId: f.id },
    });
  }
  // International fixtures of the user's nation, and construction milestones
  const un = g.intl?.userNation;
  if (un) for (const f of g.intl.fixtures) {
    if (f.date < from || f.date > to || (f.home !== un && f.away !== un)) continue;
    const n = g.intl.nations;
    out.push({ id: 'i' + f.id, date: f.date, cat: 'match', title: `${n[un].code}: ${f.home === un ? 'vs' : 'at'} ${n[f.home === un ? f.away : f.home].code}${f.played ? ` ${f.hg}-${f.ag}` : ''}`, detail: `International (${f.comp}): ${n[f.home].name} ${f.played ? `${f.hg}-${f.ag}` : 'v'} ${n[f.away].name}`, ref: { screen: 'international' } });
  }
  const k = g.clubs[me].econ?.construction;
  if (k && k.ready >= from && k.ready <= to) out.push({ id: 'k' + k.ready, date: k.ready, cat: 'club', title: `Construction complete`, detail: k.label, ref: { screen: 'stadium' } });
  // Transfer window open / deadline
  for (let i = 0; i <= days; i++) {
    const t = addDays(from, i);
    const w = windowInfo(t);
    const p = parts(t);
    if (p.d === 1 && (p.m === 6 || p.m === 0)) out.push({ id: 'wo' + t, date: t, cat: 'transfer', title: `${w.name} opens`, detail: `Deadline: ${fmtDateShort(w.closesOn!)}.`, ref: { screen: 'transfers' } });
    if (w.open && w.closesOn === t) out.push({ id: 'wd' + t, date: t, cat: 'transfer', title: 'Transfer deadline day', detail: 'The window closes tonight.', ref: { screen: 'transfers' } });
    // Training schedule
    const mt = userFix.has(t);
    const mtm = userFix.has(addDays(t, 1));
    if (!mt) {
      const s = sessionFor(g, t, false, mtm);
      if (s !== 'Rest') out.push({ id: 'tr' + t, date: t, cat: 'training', title: s, detail: `Training session: ${s} (${g.training.intensity} intensity)`, ref: { screen: 'training' } });
    }
    // Board meetings, club events, awards
    if (p.d === 1 && (p.m === 9 || p.m === 0 || p.m === 3)) out.push({ id: 'bm' + t, date: t, cat: 'board', title: 'Board meeting', detail: 'Scheduled board review of objectives and finances.', ref: { screen: 'board' } });
    if (p.d === 15 && p.m === 7) out.push({ id: 'cl' + t, date: t, cat: 'club', title: 'Season launch', detail: 'Annual club launch and kit unveiling.' });
    if (p.d === 1 && p.m === 6) out.push({ id: 'yi' + t, date: t, cat: 'youth', title: 'Youth intake day', detail: 'New academy intake arrives.', ref: { screen: 'academy' } });
    if (p.d === 30 && p.m === 5) out.push({ id: 'se' + t, date: t, cat: 'league', title: 'Season ends', detail: 'Contracts expire and promotion/relegation is confirmed.', ref: { screen: 'history' } });
  }
  // Contract expiries for the user's club
  for (const p of Object.values(g.players)) {
    if (p.clubId === me && !p.academy && p.contractEnd !== undefined && p.contractEnd >= from && p.contractEnd <= to && !p.parentClubId) {
      out.push({ id: 'ce' + p.id, date: p.contractEnd, cat: 'contract', title: `Contract ends: ${p.name}`, detail: `${p.name}'s contract expires.`, ref: { screen: 'squad', playerId: p.id } });
    }
    // Injury recovery estimates
    if (p.clubId === me && p.injuredDays > 0) {
      const back = addDays(g.meta.date ?? 0, p.injuredDays);
      if (back >= from && back <= to) out.push({ id: 'ij' + p.id, date: back, cat: 'medical', title: `${p.name} back`, detail: `${p.name} (${p.injury ?? 'injury'}) is expected to return.`, ref: { screen: 'medical', playerId: p.id } });
    }
  }
  // Scouting assignments finishing
  for (const a of g.scouting.assignments) {
    if (!a.done && a.endDate >= from && a.endDate <= to) {
      const s = g.scouting.scouts.find((x) => x.id === a.scoutId);
      out.push({ id: 'sc' + a.id, date: a.endDate, cat: 'scouting', title: 'Scout report due', detail: `${s?.name ?? 'Scout'} returns from a ${a.kind} assignment.`, ref: { screen: 'scouting' } });
    }
  }
  // Instalments due
  for (const i of g.installments) {
    if (i.fromClubId === me && i.date >= from && i.date <= to) out.push({ id: 'in' + i.id, date: i.date, cat: 'transfer', title: 'Instalment due', detail: i.desc, ref: { screen: 'finances' } });
  }
  // Stored (one-off) events
  for (const e of g.events) if (e.date >= from && e.date <= to) out.push({ id: e.id, date: e.date, cat: e.cat === 'transfer' ? 'transfer' : (e.cat as CalCat), title: e.title, detail: e.detail, ref: e.ref });
  return out.sort((a, b) => a.date - b.date || a.cat.localeCompare(b.cat));
}

export function nextUserFixture(g: Game): typeof g.fixtures[0] | undefined {
  const me = g.meta.userClubId;
  let best: typeof g.fixtures[0] | undefined;
  for (const f of g.fixtures) {
    if (f.played || (f.home !== me && f.away !== me)) continue;
    if (!best || (f.date ?? 0) < (best.date ?? 0)) best = f;
  }
  return best;
}
void DAY; void seasonOf; void utc; void weekday;
