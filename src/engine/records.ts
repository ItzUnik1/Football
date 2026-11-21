import type { Game } from './types';
import { computeTable } from './fixtures';

const MAX_SCORERS = 25, MAX_TRANSFERS = 15, MAX_MGR = 30;
function setRecord(g: Game, id: string, label: string, value: number, holder: string, season: number): void {
  const list = (g.history.records ??= []);
  const r = list.find((x) => x.id === id);
  if (!r) list.push({ id, label, value, holder, season });
  else if (value > r.value) { r.value = value; r.holder = holder; r.season = season; }
}
export function recordTransfer(g: Game, player: string, from: string, to: string, fee: number, season: number): void {
  if (fee < 5_000_000) return;
  const l = (g.history.transferRecords ??= []);
  l.push({ season, player, from, to, fee });
  l.sort((a, b) => b.fee - a.fee);
  if (l.length > MAX_TRANSFERS) l.length = MAX_TRANSFERS;
}

/** Called at season end before player season stats are reset. Everything is bounded. */
export function recordSeasonHistory(g: Game, season: number): void {
  const h = g.history;
  // all-time top scorers (league career + this season)
  const tot = Object.values(g.players).map((p) => ({ p, goals: (p.career?.goals ?? 0) + p.stats.goals, apps: (p.career?.apps ?? 0) + p.stats.apps })).filter((x) => x.goals > 0);
  const merged = new Map<string, NonNullable<typeof h.scorers>[number]>();
  for (const s of h.scorers ?? []) merged.set(s.playerId, s);
  for (const { p, goals, apps } of tot) { const nm = p.clubId ? g.clubs[p.clubId]?.short ?? g.clubs[p.clubId]?.name : ''; const prev = merged.get(p.id); merged.set(p.id, { playerId: p.id, name: p.name, goals: Math.max(goals, prev?.goals ?? 0), apps, clubs: [...new Set([...(prev?.clubs ?? []), nm ?? ''])].filter(Boolean).slice(-4) }); }
  h.scorers = [...merged.values()].sort((a, b) => b.goals - a.goals).slice(0, MAX_SCORERS);
  // single-season records
  for (const p of Object.values(g.players)) {
    if (p.stats.goals > 0) setRecord(g, 'seasonGoals', 'Most league goals in a season', p.stats.goals, p.name, season);
    if (p.stats.assists > 0) setRecord(g, 'seasonAssists', 'Most league assists in a season', p.stats.assists, p.name, season);
  }
  for (const lid of Object.keys(g.leagues)) {
    if (g.leagues[lid].tier !== 1) continue;
    const t = computeTable(g, lid);
    if (!t.length) continue;
    setRecord(g, 'points', 'Most points in a season', t[0].points, g.clubs[t[0].clubId].name, season);
    const attack = [...t].sort((a, b) => b.gf - a.gf)[0]; setRecord(g, 'goalsFor', 'Most goals scored in a season', attack.gf, g.clubs[attack.clubId].name, season);
    const wins = g.fixtures.filter((f) => f.played && f.leagueId === lid);
    let best = 0, bf = '';
    for (const f of wins) { const m = Math.abs(f.hg! - f.ag!); if (m > best) { best = m; bf = `${g.clubs[f.home].name} ${f.hg}-${f.ag} ${g.clubs[f.away].name}`; } }
    if (best) setRecord(g, 'bigWin', 'Biggest league win (goal margin)', best, bf, season);
    // manager titles
    const champ = g.clubs[t[0].clubId];
    const mr = (h.managerRecords ??= []);
    const m = champ.manager; if (m?.name) {
      let r = mr.find((x) => x.name === m.name);
      if (!r) { r = { name: m.name, clubId: champ.id, titles: 0, wins: 0, matches: 0 }; mr.push(r); }
      r.titles++; r.clubId = champ.id; r.wins += t[0].won; r.matches += t[0].played;
      mr.sort((a, b) => b.titles - a.titles || b.wins - a.wins); if (mr.length > MAX_MGR) mr.length = MAX_MGR;
    }
  }
}
