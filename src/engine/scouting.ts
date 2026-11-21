import type { Assignment, Game, Player, Pos, Scout, ScoutReport } from './types';
import { addMessage, gameNow } from './messages';
import { addDays, dayDiff } from './calendar';
import { chance, clamp, gauss, pick, rand, randInt, shuffle } from './rng';
import { MANAGER_FIRST, MANAGER_LAST, NATIONS } from './names';
import { fmtMoney } from './valuation';

export function makeScout(g: Game, hired: boolean, ability?: number): Scout {
  const id = `s${g.scouting.nextId++}`;
  const ab = ability ?? clamp(Math.round(8 + rand() * 12), 5, 20);
  return {
    id, name: `${pick(MANAGER_FIRST)} ${pick(MANAGER_LAST)}`, ability: ab, judgement: clamp(Math.round(ab + gauss() * 3), 4, 20),
    nat: pick(NATIONS).nat, wage: Math.round((600 + ab * ab * 6) / 50) * 50, hired,
  };
}

export function initScouting(g: Game): void {
  g.scouting = { scouts: [], assignments: [], reports: [], knowledge: {}, shortlist: [], nextId: 1 };
  g.scouting.scouts.push(makeScout(g, true, 11));
  for (let i = 0; i < 4; i++) g.scouting.scouts.push(makeScout(g, false));
}

export const scoutBusy = (g: Game, scoutId: string): boolean => g.scouting.assignments.some((a) => a.scoutId === scoutId && !a.done);
export const knowledgeOf = (g: Game, p: Player): number => (p.clubId === g.meta.userClubId ? 100 : (g.scouting.knowledge[p.id] ?? 0));

export function hireScout(g: Game, scoutId: string, hire: boolean): string | null {
  const s = g.scouting.scouts.find((x) => x.id === scoutId);
  if (!s) return 'Unknown scout.';
  if (hire) {
    if (g.scouting.scouts.filter((x) => x.hired).length >= 4) return 'You can employ at most 4 scouts.';
    const club = g.clubs[g.meta.userClubId];
    if (club.balance < s.wage * 4) return 'The club cannot afford this scout right now.';
    s.hired = true;
  } else {
    if (scoutBusy(g, scoutId)) return 'Wait until the scout finishes the current assignment.';
    s.hired = false;
  }
  return null;
}

export type AssignSpec = Omit<Assignment, 'id' | 'scoutId' | 'startDate' | 'endDate' | 'done'>;

export function assignScout(g: Game, scoutId: string, spec: AssignSpec): string | null {
  const s = g.scouting.scouts.find((x) => x.id === scoutId);
  if (!s || !s.hired) return 'This scout is not employed by the club.';
  if (scoutBusy(g, scoutId)) return 'This scout already has an assignment.';
  const now = gameNow(g);
  if (spec.kind === 'global' && ((g.clubs[g.meta.userClubId].econ?.scoutingLevel ?? 3) < 3)) return 'Global scouting needs a level 3 scouting network (see Facilities).';
  const days = spec.kind === 'player' ? 7 : spec.kind === 'youth' ? 21 : spec.kind === 'global' ? 28 : spec.kind === 'region' ? 18 : 14;
  g.scouting.assignments.push({ ...spec, id: `a${g.scouting.nextId++}`, scoutId, startDate: now, endDate: addDays(now, days), done: false });
  return null;
}

export function cancelAssignment(g: Game, id: string): void {
  g.scouting.assignments = g.scouting.assignments.filter((a) => a.id !== id || a.done);
}

function candidates(g: Game, a: Assignment): Player[] {
  const user = g.meta.userClubId;
  const all = Object.values(g.players).filter((p) => p.clubId !== user && !p.academy);
  switch (a.kind) {
    case 'position': return all.filter((p) => p.pos === a.pos && (p.clubId || !p.prospect));
    case 'youth': return all.filter((p) => p.age <= (a.ageMax ?? 21) && p.pot - p.ovr >= 6);
    case 'league': return all.filter((p) => p.clubId && g.clubs[p.clubId]?.leagueId === a.leagueId);
    case 'club': return all.filter((p) => p.clubId === a.clubId);
    case 'free': return all.filter((p) => !p.clubId);
    case 'player': return all.filter((p) => p.id === a.playerId);
    case 'region': return all.filter((p) => p.nat === a.region && (p.clubId || !p.prospect));
    case 'global': return all.filter((p) => p.ovr >= 64 || p.pot >= 76);
  }
}

function makeReport(g: Game, s: Scout, a: Assignment, p: Player): ScoutReport {
  const prior = g.scouting.knowledge[p.id] ?? 0;
  const club = g.clubs[g.meta.userClubId];
  const net = ((club.econ?.scoutingLevel ?? 3) - 3) * 3 + (staffAbility(club, 'head_scout') - 10) * 0.8;
  const acc = clamp(Math.round(40 + s.ability * 2.2 + s.judgement * 1.2 + prior * 0.3 + net), 30, 98);
  const err = (100 - acc) / 100;
  const sd = 1 + err * 10;
  const estOvr = Math.round(p.ovr + gauss() * sd * 0.4);
  const estPot = Math.round(p.pot + gauss() * sd * 0.8);
  const w = Math.max(1, Math.round(sd));
  const ro = (c: number, r: number): [number, number] => [Math.max(20, c - r), Math.min(97, c + r)];
  const valMul = 1 + gauss() * err * 0.3;
  const vc = Math.max(50000, p.value * valMul);
  const stars = clamp(Math.round(((estPot * 0.6 + estOvr * 0.4) - 45) / 9), 1, 5);
  const summary = `${p.name} (${p.age}, ${p.pos}) ${stars >= 4 ? 'is a standout talent' : stars === 3 ? 'is a useful player' : 'would be squad depth'}. ${p.age <= 21 ? `Potential looks like ${estPot - w}-${estPot + w}.` : `Current level ${estOvr - w}-${estOvr + w}.`} ${p.personality ? (p.personality.professionalism >= 15 ? 'Very professional.' : p.personality.professionalism <= 6 ? 'Questionable attitude.' : '') : ''}`.trim();
  const extra = reportExtras(g, p, acc, stars);
  return {
    ...extra,
    id: `r${g.scouting.nextId++}`, date: gameNow(g), scoutId: s.id, playerId: p.id, assignmentId: a.id, accuracy: acc,
    estOvr: ro(estOvr, w), estPot: ro(Math.max(estPot, estOvr), w + 1), estValue: [Math.round((vc * (1 - err * 0.4)) / 50000) * 50000, Math.round((vc * (1 + err * 0.4)) / 50000) * 50000],
    stars, summary,
  };
}

/** Complete assignments that end today; returns number of reports produced. */
export function scoutingTick(g: Game): number {
  const now = gameNow(g);
  let n = 0;
  for (const a of g.scouting.assignments) {
    if (a.done || a.endDate > now) continue;
    a.done = true;
    const s = g.scouting.scouts.find((x) => x.id === a.scoutId);
    if (!s) continue;
    const seen = new Set(g.scouting.reports.filter((r) => dayDiff(r.date, now) < 120).map((r) => r.playerId));
    let pool = candidates(g, a).filter((p) => a.kind === 'player' || !seen.has(p.id));
    // Better scouts spot the better players
    pool = shuffle(pool).slice(0, 80).sort((x, y) => (y.pot * 0.6 + y.ovr * 0.4 + rand() * (24 - s.ability)) - (x.pot * 0.6 + x.ovr * 0.4 + rand() * (24 - s.ability)));
    const count = a.kind === 'player' ? 1 : randInt(2, 4);
    const picks = pool.slice(0, count);
    for (const p of picks) {
      const r = makeReport(g, s, a, p);
      g.scouting.reports.unshift(r);
      g.scouting.knowledge[p.id] = Math.min(100, (g.scouting.knowledge[p.id] ?? 0) + 35 + s.ability);
      n++;
      addMessage(g, {
        category: 'Scouting', from: s.name, important: r.stars >= 4, subject: `Scout report: ${p.name} (${r.stars}★)`,
        body: `${r.summary}\nEstimated value ${fmtMoney(r.estValue[0])} - ${fmtMoney(r.estValue[1])}. Report accuracy ${r.accuracy}%.`,
        action: { kind: 'scout_report', playerId: p.id, reportId: r.id },
      });
    }
    if (!picks.length) addMessage(g, { category: 'Scouting', from: s.name, subject: 'Assignment complete - nothing found', body: 'The scout returned without finding any new players matching the brief.' });
  }
  if (g.scouting.reports.length > 150) g.scouting.reports.length = 150;
  g.scouting.assignments = g.scouting.assignments.filter((x) => !x.done || dayDiff(x.endDate, now) < 30);
  return n;
}

export const latestReport = (g: Game, pid: string): ScoutReport | undefined => g.scouting.reports.find((r) => r.playerId === pid);

/** What the user may see about a player's potential and ovr. */
export function scoutedView(g: Game, p: Player): { exact: boolean; ovr: string; pot: string; value: string; stars?: number } {
  const k = knowledgeOf(g, p);
  if (k >= 100 || p.clubId === g.meta.userClubId) return { exact: true, ovr: String(p.ovr), pot: String(p.pot), value: fmtMoney(p.value) };
  const r = latestReport(g, p.id);
  const ovr = k >= 60 ? String(p.ovr) : String(p.ovr);
  if (r) return { exact: false, ovr, pot: `${r.estPot[0]}-${r.estPot[1]}`, value: `${fmtMoney(r.estValue[0])}-${fmtMoney(r.estValue[1])}`, stars: r.stars };
  return { exact: false, ovr, pot: '?', value: fmtMoney(p.value) };
}

export function toggleShortlist(g: Game, pid: string): void {
  const i = g.scouting.shortlist.indexOf(pid);
  if (i >= 0) g.scouting.shortlist.splice(i, 1); else g.scouting.shortlist.push(pid);
}
export type { Pos };
void chance;

import { staffAbility } from './staff';
import { FORMATIONS, squadOf } from './team';
import { bestRoleFor, roleSuitability } from './tactics';

/** Personality, tactical suitability for the user's formation and a signing recommendation. Reliability depends on report accuracy. */
function reportExtras(g: Game, p: Player, acc: number, stars: number): Pick<ScoutReport, 'personality' | 'role' | 'recommendation'> {
  const club = g.clubs[g.meta.userClubId];
  const pe = p.personality;
  const noise = (v: number) => Math.round(v + (rand() - 0.5) * (100 - acc) * 0.25);
  let personality = 'Unknown character.';
  if (pe) {
    const bits: string[] = [];
    const pr = noise(pe.professionalism), lo = noise(pe.loyalty), am = noise(pe.ambition), le = noise(pe.leadership);
    bits.push(pr >= 14 ? 'Professional' : pr <= 7 ? 'Unreliable' : 'Average attitude');
    if (lo >= 15) bits.push('loyal'); else if (lo <= 6) bits.push('mercenary');
    if (am >= 15) bits.push('very ambitious');
    if (le >= 15) bits.push('natural leader');
    personality = bits.join(', ') + '.';
  }
  const slots = FORMATIONS[club.formation].filter((s) => s.pos === p.pos);
  let role: ScoutReport['role'];
  if (slots.length) { const r = bestRoleFor(p, slots[0]); role = { label: r.label, fit: Math.round(roleSuitability(p, r)) }; }
  const mine = squadOf(g, club.id).filter((q) => q.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const need = FORMATIONS[club.formation].filter((s) => s.pos === p.pos).length;
  const weakest = mine[Math.min(need, mine.length) - 1]?.ovr ?? 0;
  const est = p.ovr + (rand() - 0.5) * (100 - acc) * 0.2;
  const recommendation = est >= weakest + 3 ? 'Sign: would improve the first team' : stars >= 4 && p.age <= 23 ? 'Sign for the future' : est >= weakest - 2 ? 'Rotation option' : 'Not needed';
  return { personality, role, recommendation };
}

export interface CompareRow { playerId: string; name: string; age: number; pos: string; ovr: string; pot: string; value: string; role?: string; personality?: string; recommendation?: string; stars?: number }
/** Side by side comparison of shortlisted players, honouring what the club actually knows. */
export function comparePlayers(g: Game, ids: string[]): CompareRow[] {
  return ids.map((id) => g.players[id]).filter(Boolean).map((p) => {
    const v = scoutedView(g, p); const r = latestReport(g, p.id);
    return { playerId: p.id, name: p.name, age: p.age, pos: p.pos, ovr: v.ovr, pot: v.pot, value: v.value, role: r?.role ? `${r.role.label} (${r.role.fit})` : undefined, personality: r?.personality, recommendation: r?.recommendation, stars: r?.stars };
  });
}
