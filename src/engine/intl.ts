import type { Formation, Game, IntlFixture, MatchReport, Nation, Player, Tournament } from './types';
import { FORMATIONS, autoLineup, bestLineupScore, isAvailable, pickCaptain } from './team';
import { simulateMatch, type TeamSheet } from './match';
import { DEFAULT_INSTR, PRESETS, bestRoleFor, defaultRoleFor, managerPreset, signatureChangeCost, instrOf, styleFromInstr, tacticSignature } from './tactics';
import { MANAGER_FIRST, MANAGER_LAST, MANAGER_STYLES, NATIONS } from './names';
import { chance, clamp, hash01, pick, shuffle } from './rng';
import { addDays, dayDiff, fmtDate, fmtDateShort, seasonLabel } from './calendar';
import { addMessage, gameNow } from './messages';
import { addNews } from './news';
import { seasonSlots } from './slots';
import { applyPlayerResults } from './game';
import { recordUserMatch } from './mgr';

const CODES: Record<string, string> = { England: 'ENG', Spain: 'ESP', Brazil: 'BRA', France: 'FRA', Germany: 'GER', Italy: 'ITA', Portugal: 'POR', Netherlands: 'NED', Argentina: 'ARG', Nigeria: 'NGA', Japan: 'JPN', Croatia: 'CRO', Ghana: 'GHA', Denmark: 'DEN' };
export const nationIdOf = (name: string): string => 'N:' + (CODES[name] ?? name.slice(0, 3).toUpperCase());
export const STAGE_LABEL = ['', 'Group stage', 'Quarter-finalist', 'Semi-finalist', 'Runner-up', 'Winner'];

export function nationPool(g: Game, nid: string): Player[] {
  const n = g.intl.nations[nid];
  if (!n) return [];
  const out: Player[] = [];
  for (const id in g.players) { const p = g.players[id]; if (p.nat === n.name && p.clubId && !p.academy && p.age >= 17) out.push(p); }
  return out;
}
const strengthOf = (g: Game, nid: string): number => {
  const pool = nationPool(g, nid).map((p) => ({ ...p, injuredDays: 0, suspended: 0 }));
  return pool.length >= 11 ? bestLineupScore(pool, '4-3-3') : 40;
};

export function initIntl(g: Game): void {
  if (g.intl) return;
  g.intl = { nations: {}, fixtures: [], tournaments: [], records: [], nextId: 1, rankHistory: [] };
  for (const np of NATIONS) {
    const id = nationIdOf(np.nat);
    const pool = Object.values(g.players).filter((p) => p.nat === np.nat && p.clubId && !p.academy);
    if (pool.length < 23) continue;
    const phil = pick(MANAGER_STYLES);
    const preset = PRESETS.find((x) => x.id === managerPreset(phil)) ?? PRESETS[0];
    g.intl.nations[id] = {
      id, name: np.nat, code: CODES[np.nat] ?? np.nat.slice(0, 3).toUpperCase(), pts: 1500, rank: 0,
      managerName: `${pick(MANAGER_FIRST)} ${pick(MANAGER_LAST)}`, managerRep: 40 + Math.round(hash01(id + 'm') * 40), managerSince: gameNow(g), philosophy: phil,
      formation: '4-3-3', mentality: preset.mentality, style: styleFromInstr(preset.instr), instr: { ...preset.instr }, roles: [],
      lineup: [], bench: [], captainId: '', squad: [], familiarity: 65,
      w: 0, d: 0, l: 0, gf: 0, ga: 0, titles: { world: 0, continental: 0 }, best: { world: 0, continental: 0 },
    };
  }
  for (const id in g.intl.nations) g.intl.nations[id].pts = Math.round(1500 + (strengthOf(g, id) - 64) * 35);
  updateRanks(g);
  planIntlSeason(g, g.meta.season);
}

export function updateRanks(g: Game): void {
  const list = Object.values(g.intl.nations).sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  list.forEach((n, i) => { n.rank = i + 1; });
}
export const nationRanking = (g: Game): Nation[] => Object.values(g.intl.nations).sort((a, b) => a.rank - b.rank);

const nid = (g: Game): string => `i${g.intl.nextId++}`;

function circleRounds(ids: string[]): [string, string][][] {
  const teams = shuffle(ids);
  if (teams.length % 2) teams.push('');
  const n = teams.length;
  const arr = teams.slice();
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      let h = arr[i], a = arr[n - 1 - i];
      if ((r + i) % 2 === 1) [h, a] = [a, h];
      if (h && a) round.push([h, a]);
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop() as string);
  }
  return rounds;
}

export const tournamentKindFor = (season: number): 'world' | 'continental' | null => {
  const y = season + 1;
  return y % 4 === 0 ? 'continental' : y % 4 === 2 ? 'world' : null;
};
export const TOURNAMENT_NAME = { world: 'World Cup', continental: 'Continental Championship' } as const;

/** Creates the international calendar for a season: friendlies, or a qualification campaign if a tournament follows. */
export function planIntlSeason(g: Game, season: number): void {
  const sl = seasonSlots(season);
  const ids = Object.keys(g.intl.nations);
  const rounds = circleRounds(ids);
  const kind = tournamentKindFor(season);
  const mk = (comp: IntlFixture['comp'], compId: string, stage: string, date: number, h: string, a: string) => g.intl.fixtures.push({ id: nid(g), comp, compId, stage, date, home: h, away: a, played: false, hg: 0, ag: 0 });
  if (kind) {
    const compId = `qual${season}`;
    const table: NonNullable<typeof g.intl.qual>['table'] = {};
    ids.forEach((i) => { table[i] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
    g.intl.qual = { id: compId, season, kind, year: season + 1, table, done: false, qualified: [] };
    for (let w = 0; w < 6; w++) rounds[w].forEach(([h, a]) => mk('qual', compId, `Qualifying matchday ${w + 1}`, sl.intl[w], h, a));
    rounds[6].forEach(([h, a]) => mk('friendly', `fr${season}`, 'Friendly', sl.intl[6], h, a));
  } else {
    g.intl.qual = undefined;
    [0, 2, 4, 6].forEach((w, k) => rounds[k].forEach(([h, a]) => mk('friendly', `fr${season}`, 'Friendly', sl.intl[w], h, a)));
  }
  // keep memory bounded: only this and last season's fixtures
  const cutoff = sl.intl[0] - 400 * 86400000;
  g.intl.fixtures = g.intl.fixtures.filter((f) => f.date >= cutoff);
}

export function rolloverIntl(g: Game): void {
  for (const n of Object.values(g.intl.nations)) { n.w = 0; n.d = 0; n.l = 0; n.gf = 0; n.ga = 0; }
  g.intl.rankHistory.push({ date: gameNow(g), ranks: Object.fromEntries(Object.values(g.intl.nations).map((n) => [n.id, n.rank])) });
  if (g.intl.rankHistory.length > 12) g.intl.rankHistory.shift();
  for (const p of Object.values(g.players)) if (p.intl && p.intl.caps === 0) p.intl = undefined;
  planIntlSeason(g, g.meta.season);
}

// ---------- Team selection ----------
export function nationAvailable(g: Game, nid2: string): Player[] {
  return nationPool(g, nid2).filter(isAvailable).sort((a, b) => b.ovr - a.ovr);
}
export function selectNationSquad(g: Game, n: Nation): void {
  const pool = nationAvailable(g, n.id);
  const bestF = (['4-3-3', '4-4-2', '4-2-3-1'] as Formation[]).reduce((b, f) => (bestLineupScore(pool, f) > bestLineupScore(pool, b) ? f : b), n.formation);
  if (!n.userManaged) n.formation = bestF;
  const lu = autoLineup(pool, n.formation);
  const picked = [...lu.lineup, ...lu.bench];
  // pad to 23 with the best remaining (cover for injuries)
  for (const p of pool) { if (picked.length >= 23) break; if (!picked.includes(p.id)) picked.push(p.id); }
  n.squad = picked.filter(Boolean);
}
export function autoNationTeam(g: Game, n: Nation): void {
  const pool = n.squad.map((id) => g.players[id]).filter((p) => p && p.nat === n.name && p.clubId && isAvailable(p));
  const lu = autoLineup(pool.length >= 11 ? pool : nationAvailable(g, n.id), n.formation);
  n.lineup = lu.lineup; n.bench = lu.bench.slice(0, 7);
  n.captainId = (() => {
    const xi = n.lineup.map((id) => g.players[id]).filter(Boolean);
    xi.sort((a, b) => b.mental.composure + b.age + b.ovr - (a.mental.composure + a.age + a.ovr));
    return xi[0]?.id ?? '';
  })();
  const slots = FORMATIONS[n.formation];
  if (!n.userManaged || n.roles.length !== slots.length) n.roles = n.lineup.map((id, i) => { const p = g.players[id]; return p ? bestRoleFor(p, slots[i]).id : defaultRoleFor(slots[i]); });
}

export function validateNationTeam(g: Game, n: Nation): string[] {
  const errs: string[] = [];
  const slots = FORMATIONS[n.formation];
  if (n.lineup.length !== slots.length) errs.push('Lineup does not match the formation.');
  const seen = new Set<string>();
  n.lineup.forEach((id, i) => {
    if (!id) { errs.push(`Empty position: ${slots[i]?.label}.`); return; }
    if (seen.has(id)) errs.push(`${g.players[id]?.name ?? id} is selected twice.`);
    seen.add(id);
    const p = g.players[id];
    if (!p || p.nat !== n.name) { errs.push('A selected player is not eligible for this nation.'); return; }
    if (!n.squad.includes(id)) errs.push(`${p.name} is not in the squad.`);
    if (p.injuredDays > 0) errs.push(`${p.name} is injured.`);
    if (p.suspended > 0) errs.push(`${p.name} is suspended.`);
  });
  if (n.lineup[0] && g.players[n.lineup[0]]?.pos !== 'GK') errs.push('The starting XI needs a goalkeeper in goal.');
  n.bench.forEach((id) => { const p = g.players[id]; if (!p || p.nat !== n.name || !n.squad.includes(id) || seen.has(id) || !isAvailable(p)) errs.push('A substitute is invalid.'); });
  if (!seen.has(n.captainId)) errs.push('Captain must be in the starting XI.');
  return errs;
}

export function setNationSquad(g: Game, n: Nation, ids: string[]): { ok: boolean; error?: string } {
  const uniq = Array.from(new Set(ids));
  if (uniq.length > 26) return { ok: false, error: 'A squad is limited to 26 players.' };
  if (uniq.some((id) => g.players[id]?.nat !== n.name)) return { ok: false, error: 'Only players of this nationality can be selected.' };
  if (!uniq.some((id) => g.players[id]?.pos === 'GK')) return { ok: false, error: 'Select at least one goalkeeper.' };
  n.squad = uniq;
  n.lineup = n.lineup.map((id) => (uniq.includes(id) ? id : ''));
  n.bench = n.bench.filter((id) => uniq.includes(id));
  return { ok: true };
}

function nationSheet(g: Game, n: Nation, home: boolean): TeamSheet {
  return {
    clubId: n.id, name: n.name, formation: n.formation, mentality: n.mentality, style: n.style,
    xi: n.lineup.map((id) => g.players[id]), bench: n.bench.map((id) => g.players[id]), captainId: n.captainId, home, familiarity: n.familiarity,
    medical: 3, instr: n.instr, roles: n.roles,
  };
}

// ---------- Playing ----------
export function userIntlFixtureToday(g: Game): IntlFixture | undefined {
  const un = g.intl?.userNation;
  if (!un) return undefined;
  const t = gameNow(g);
  return g.intl.fixtures.find((f) => f.date === t && (f.home === un || f.away === un));
}

const KFACTOR: Record<string, number> = { friendly: 16, qual: 28, world: 48, continental: 40 };
function updateElo(g: Game, f: IntlFixture): void {
  const a = g.intl.nations[f.home], b = g.intl.nations[f.away];
  const exp = 1 / (1 + Math.pow(10, (b.pts - a.pts) / 400));
  const res = f.hg > f.ag ? 1 : f.hg < f.ag ? 0 : 0.5;
  const gd = Math.abs(f.hg - f.ag);
  const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : 1.75 + (gd - 3) / 8;
  const delta = KFACTOR[f.comp] * mult * (res - exp);
  a.pts = Math.round((a.pts + delta) * 10) / 10; b.pts = Math.round((b.pts - delta) * 10) / 10;
  for (const [n, gf, ga] of [[a, f.hg, f.ag], [b, f.ag, f.hg]] as [Nation, number, number][]) {
    n.gf += gf; n.ga += ga; if (gf > ga) n.w++; else if (gf < ga) n.l++; else n.d++;
  }
}

/** Plays all international fixtures dated t. The user's nation is only played if includeUser. */
export function playIntlDay(g: Game, t: number, includeUser: boolean): MatchReport | undefined {
  const todays = g.intl.fixtures.filter((f) => !f.played && f.date === t && (includeUser || (f.home !== g.intl.userNation && f.away !== g.intl.userNation)));
  if (!todays.length) return undefined;
  let userReport: MatchReport | undefined;
  const hurt = new Set<string>();
  for (const f of todays) {
    const h = g.intl.nations[f.home], a = g.intl.nations[f.away];
    for (const n of [h, a]) {
      if (n.userManaged) continue;
      if (n.squad.length < 18 || n.squad.some((id) => !g.players[id] || g.players[id].nat !== n.name)) selectNationSquad(g, n);
      autoNationTeam(g, n);
    }
    const ko = f.comp === 'world' || f.comp === 'continental';
    const knockout = ko && !f.stage.startsWith('Group');
    const report = simulateMatch(nationSheet(g, h, !f.neutral), nationSheet(g, a, false), f.id, 0, f.date, 'INT', { knockout, comp: 'intl', compName: f.stage, neutral: !!f.neutral });
    report.comp = 'intl';
    f.played = true; f.hg = report.hg; f.ag = report.ag;
    if (knockout) {
      f.et = report.et;
      if (report.shootout) f.pens = [report.shootout.home, report.shootout.away];
      f.winner = report.hg > report.ag ? f.home : report.ag > report.hg ? f.away : (report.shootout!.home > report.shootout!.away ? f.home : f.away);
    }
    applyPlayerResults(g, report, hurt, 'intl');
    updateElo(g, f);
    for (const n of [h, a]) n.familiarity = clamp(n.familiarity + (n.userManaged ? 4 : 1), 0, n.userManaged ? 95 : 80);
    if (f.comp === 'qual' && g.intl.qual) {
      const q = g.intl.qual.table;
      const row = (id: string, gf: number, ga: number) => { const r = q[id]; r.p++; r.gf += gf; r.ga += ga; if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts++; } else r.l++; };
      row(f.home, f.hg, f.ag); row(f.away, f.ag, f.hg);
    }
    if (ko || f.comp === 'world' || f.comp === 'continental') {
      const tn = g.intl.tournaments.find((x) => x.id === f.compId);
      if (tn) for (const pm of report.players) if (pm.goals) { const s = (tn.scorers[pm.id] ??= { name: pm.name, nat: g.players[pm.id]?.nat ?? '', goals: 0 }); s.goals += pm.goals; }
    }
    if (f.home === g.intl.userNation || f.away === g.intl.userNation) { g.reports[f.id] = report; g.lastReportId = f.id; userReport = report; recordUserMatch(g, report, true); }
  }
  // Injury notices for the user's own club players on international duty
  const me = g.meta.userClubId;
  for (const id of hurt) {
    const p = g.players[id];
    if (p && p.clubId === me && p.injuredDays > 0) {
      addMessage(g, { category: 'Medical', from: 'Head Physio', important: p.ovr >= 70, subject: `Injured on international duty: ${p.name}`, body: `${p.name} (${p.nat}) was hurt playing for his country: ${p.injury?.toLowerCase() ?? 'injury'}, out for about ${p.injuredDays} days (back ~${fmtDate(addDays(gameNow(g), p.injuredDays))}).`, action: { kind: 'goto', screen: 'squad', playerId: p.id } });
      addNews(g, 'injury', `${p.name} injured on international duty`, { clubId: me, playerId: p.id });
    }
  }
  updateRanks(g);
  return userReport;
}

// ---------- Tournament flow ----------
function mkTourney(g: Game, q: NonNullable<Game['intl']['qual']>): Tournament {
  const table = Object.entries(q.table).sort((a, b) => b[1].pts - a[1].pts || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga) || b[1].gf - a[1].gf || g.intl.nations[b[0]].pts - g.intl.nations[a[0]].pts);
  const qualified = table.slice(0, 12).map(([id]) => id);
  q.qualified = qualified; q.done = true;
  const sl = seasonSlots(q.season);
  const order = ['A', 'B', 'C', 'C', 'B', 'A', 'A', 'B', 'C', 'C', 'B', 'A'];
  const groups: Tournament['groups'] = [{ name: 'Group A', nations: [] }, { name: 'Group B', nations: [] }, { name: 'Group C', nations: [] }];
  qualified.forEach((id, i) => groups[order[i].charCodeAt(0) - 65].nations.push(id));
  const t: Tournament = {
    id: `${q.kind}${q.year}`, kind: q.kind, year: q.year, name: `${TOURNAMENT_NAME[q.kind]} ${q.year}`, nations: qualified, groups, stage: 'group', alive: qualified.slice(),
    stageDates: { qf: sl.tourn.qf, sf: sl.tourn.sf, final: sl.tourn.final }, scorers: {},
  };
  for (const gr of groups) {
    const rs = circleRounds(gr.nations);
    rs.slice(0, 3).forEach((round, d) => round.forEach(([h, a]) => g.intl.fixtures.push({ id: nid(g), comp: q.kind, compId: t.id, stage: gr.name, date: sl.tourn.group[d], home: h, away: a, played: false, hg: 0, ag: 0, neutral: true })));
  }
  return t;
}

function groupTable(g: Game, t: Tournament, gname: string) {
  const grp = t.groups.find((x) => x.name === gname)!;
  const rows = Object.fromEntries(grp.nations.map((id) => [id, { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const f of g.intl.fixtures) {
    if (f.compId !== t.id || f.stage !== gname || !f.played) continue;
    const h = rows[f.home], a = rows[f.away];
    h.p++; a.p++; h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.w++; h.pts += 3; a.l++; } else if (f.hg < f.ag) { a.w++; a.pts += 3; h.l++; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || g.intl.nations[y.id].pts - g.intl.nations[x.id].pts);
}
export const tournamentGroupTable = groupTable;

function addKO(g: Game, t: Tournament, stage: string, date: number, pairs: [string, string][]): void {
  for (const [h, a] of pairs) g.intl.fixtures.push({ id: nid(g), comp: t.kind, compId: t.id, stage, date, home: h, away: a, played: false, hg: 0, ag: 0, neutral: true });
}

function userNationMsg(g: Game, subject: string, body: string): void {
  addMessage(g, { category: 'International', from: 'Football Association', important: true, subject, body, action: { kind: 'goto', screen: 'international' } });
}

/** Called every day (after matches): closes qualifying, advances tournaments and sends call-up notices. */
export function intlDaily(g: Game): void {
  const t = gameNow(g);
  const me = g.meta.userClubId;
  // 1. call-up notices 3 days before an international date
  const upcoming = g.intl.fixtures.filter((f) => !f.played && dayDiff(t, f.date) === 3);
  if (upcoming.length) {
    const nations = new Set(upcoming.flatMap((f) => [f.home, f.away]));
    const mine: string[] = [];
    for (const id of nations) {
      const n = g.intl.nations[id];
      if (n.userManaged) continue;
      selectNationSquad(g, n);
      for (const pid of n.squad) { const p = g.players[pid]; if (p && p.clubId === me) mine.push(`${p.name} (${n.name})`); }
    }
    if (mine.length) addMessage(g, { category: 'International', from: 'Football Association', subject: `International call-ups: ${mine.length} of our players`, body: `International matches take place on ${fmtDate(upcoming[0].date)}. Called up from our squad: ${mine.join(', ')}.\nThey will play for their countries and may return tired or injured.`, action: { kind: 'goto', screen: 'international' } });
    const un = g.intl.userNation;
    if (un && nations.has(un)) {
      const n = g.intl.nations[un];
      const stale = n.squad.length < 18 || n.squad.some((id) => !g.players[id] || !isAvailable(g.players[id]));
      if (stale) userNationMsg(g, 'Name your squad', `${n.name} play on ${fmtDate(upcoming.find((f) => f.home === un || f.away === un)!.date)}. Review your call-ups on the International screen (injured players should be replaced).`);
    }
  }
  // 2. qualification complete -> tournament
  const q = g.intl.qual;
  if (q && !q.done && g.intl.fixtures.filter((f) => f.compId === q.id).every((f) => f.played)) {
    const tn = mkTourney(g, q);
    g.intl.tournaments.push(tn);
    const out = Object.keys(g.intl.nations).filter((id) => !q.qualified.includes(id));
    addNews(g, 'intl', `${tn.name}: qualification complete`, { imp: 1, body: `Qualified: ${q.qualified.map((id) => g.intl.nations[id].name).join(', ')}. Missing out: ${out.map((id) => g.intl.nations[id].name).join(', ')}.` });
    const un = g.intl.userNation;
    if (un) userNationMsg(g, q.qualified.includes(un) ? `${g.intl.nations[un].name} qualify for the ${tn.name}` : `${g.intl.nations[un].name} fail to qualify`, q.qualified.includes(un) ? `The tournament starts on ${fmtDate(tn.stageDates.qf! - 13 * 86400000)}. Prepare your squad.` : `We finished outside the top 12 and will miss the ${tn.name}. The board of the FA expects an explanation.`);
    else addMessage(g, { category: 'International', from: 'Football Association', subject: `${tn.name} qualification complete`, body: `${q.qualified.map((id) => g.intl.nations[id].name).join(', ')} are through.`, action: { kind: 'goto', screen: 'international' } });
  }
  // 3. tournament stages
  for (const tn of g.intl.tournaments) {
    if (tn.stage === 'done') continue;
    const fx = (stage: (s: string) => boolean) => g.intl.fixtures.filter((f) => f.compId === tn.id && stage(f.stage));
    if (tn.stage === 'group') {
      const gf = fx((s) => s.startsWith('Group'));
      if (gf.every((f) => f.played)) {
        const tabs = tn.groups.map((gr) => groupTable(g, tn, gr.name));
        const winners = tabs.map((r) => r[0]), seconds = tabs.map((r) => r[1]);
        const thirds = tabs.map((r) => r[2]).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf).slice(0, 2);
        const rankSort = (arr: typeof winners) => arr.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
        const seeds = [...rankSort(winners), ...rankSort(seconds), ...thirds].map((r) => r.id);
        tn.alive = seeds;
        const pairs: [string, string][] = [[seeds[0], seeds[7]], [seeds[1], seeds[6]], [seeds[2], seeds[5]], [seeds[3], seeds[4]]];
        addKO(g, tn, 'Quarter-final', tn.stageDates.qf!, pairs);
        tn.stage = 'qf';
        addNews(g, 'intl', `${tn.name}: quarter-finals set`, { imp: 1, body: pairs.map(([a, b]) => `${g.intl.nations[a].name} v ${g.intl.nations[b].name}`).join(' | ') });
        const un = g.intl.userNation;
        if (un) userNationMsg(g, seeds.includes(un) ? `${g.intl.nations[un].name} reach the quarter-finals` : `${g.intl.nations[un].name} eliminated in the group stage`, seeds.includes(un) ? `The quarter-final is on ${fmtDate(tn.stageDates.qf!)}.` : 'We did not advance from our group.');
      }
    } else {
      const stageName = tn.stage === 'qf' ? 'Quarter-final' : tn.stage === 'sf' ? 'Semi-final' : 'Final';
      const kf = fx((s) => s === stageName);
      if (kf.length && kf.every((f) => f.played)) {
        const winners = kf.map((f) => f.winner!);
        const un = g.intl.userNation;
        if (tn.stage === 'qf') {
          tn.alive = winners; tn.stage = 'sf';
          addKO(g, tn, 'Semi-final', tn.stageDates.sf!, [[winners[0], winners[3]], [winners[1], winners[2]]]);
          addNews(g, 'intl', `${tn.name}: semi-finalists decided`, { imp: 1, body: winners.map((id) => g.intl.nations[id].name).join(', ') });
        } else if (tn.stage === 'sf') {
          tn.alive = winners; tn.stage = 'final';
          addKO(g, tn, 'Final', tn.stageDates.final!, [[winners[0], winners[1]]]);
          addNews(g, 'intl', `${tn.name} final: ${g.intl.nations[winners[0]].name} v ${g.intl.nations[winners[1]].name}`, { imp: 2 });
        } else {
          const f = kf[0];
          tn.winner = f.winner; tn.runnerUp = f.winner === f.home ? f.away : f.home; tn.stage = 'done'; tn.alive = [];
          const top = Object.values(tn.scorers).sort((a, b) => b.goals - a.goals)[0];
          tn.topScorer = top;
          const kindKey = tn.kind === 'world' ? 'world' : 'continental';
          g.intl.nations[tn.winner!].titles[kindKey]++;
          const stageOf = (id: string): number => (id === tn.winner ? 5 : id === tn.runnerUp ? 4 : tn.alive.includes(id) ? 3 : 1);
          void stageOf;
          for (const id of tn.nations) {
            const reachedQF = g.intl.fixtures.some((x) => x.compId === tn.id && x.stage === 'Quarter-final' && (x.home === id || x.away === id));
            const reachedSF = g.intl.fixtures.some((x) => x.compId === tn.id && x.stage === 'Semi-final' && (x.home === id || x.away === id));
            const st = id === tn.winner ? 5 : id === tn.runnerUp ? 4 : reachedSF ? 3 : reachedQF ? 2 : 1;
            const b = g.intl.nations[id].best; if (st > b[kindKey]) b[kindKey] = st;
          }
          g.intl.records.push({ year: tn.year, kind: tn.kind, name: tn.name, winner: tn.winner!, runnerUp: tn.runnerUp!, topScorer: top });
          if (g.intl.records.length > 30) g.intl.records.shift();
          addNews(g, 'intl', `${g.intl.nations[tn.winner!].name} win the ${tn.name}`, { imp: 2, body: `${g.intl.nations[tn.winner!].name} beat ${g.intl.nations[tn.runnerUp!].name} ${f.hg}-${f.ag}${f.pens ? ` (pens ${f.pens[0]}-${f.pens[1]})` : f.et ? ' after extra time' : ''}.${top ? ` Top scorer: ${top.name} (${top.goals}).` : ''}` });
          if (un) {
            const won = tn.winner === un;
            userNationMsg(g, won ? `${g.intl.nations[un].name} are ${tn.name} champions!` : `${tn.name} over`, won ? 'A historic triumph.' : `${g.intl.nations[tn.winner!].name} won the tournament.`);
            if (won && g.career) g.career.trophies.push({ season: g.meta.season, name: tn.name, club: g.intl.nations[un].name });
          }
          for (const pid of Object.keys(tn.scorers)) void pid;
        }
        void un;
      }
    }
  }
  g.intl.tournaments = g.intl.tournaments.filter((tn) => tn.stage !== 'done' || dayDiff(tn.stageDates.final!, t) < 30);
}

export function nationSummary(g: Game, nid2: string): { next?: IntlFixture; last?: IntlFixture } {
  const mine = g.intl.fixtures.filter((f) => f.home === nid2 || f.away === nid2);
  const next = mine.filter((f) => !f.played).sort((a, b) => a.date - b.date)[0];
  const last = mine.filter((f) => f.played).sort((a, b) => b.date - a.date)[0];
  return { next, last };
}

export function applyNationTactics(g: Game, n: Nation): void {
  const sig = tacticSignature({ formation: n.formation, mentality: n.mentality, instr: n.instr, lineup: n.lineup, roles: n.roles, style: n.style } as never);
  if (n.sig && n.sig !== sig) n.familiarity = Math.max(15, n.familiarity - signatureChangeCost(n.sig, sig));
  n.sig = sig;
  void instrOf; void DEFAULT_INSTR; void chance; void fmtDateShort; void seasonLabel;
}
