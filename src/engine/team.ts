import type { Club, Formation, Game, Player, Pos, Slot } from './types';
import { rand } from './rng';

const S = (label: string, pos: Pos, x: number, y: number): Slot => ({ label, pos, x, y });

export const FORMATIONS: Record<Formation, Slot[]> = {
  '4-3-3': [
    S('GK', 'GK', 50, 88),
    S('LB', 'DF', 14, 72), S('LCB', 'DF', 37, 74), S('RCB', 'DF', 63, 74), S('RB', 'DF', 86, 72),
    S('LCM', 'MF', 28, 50), S('CM', 'MF', 50, 54), S('RCM', 'MF', 72, 50),
    S('LW', 'FW', 16, 22), S('ST', 'FW', 50, 14), S('RW', 'FW', 84, 22),
  ],
  '4-4-2': [
    S('GK', 'GK', 50, 88),
    S('LB', 'DF', 14, 72), S('LCB', 'DF', 37, 74), S('RCB', 'DF', 63, 74), S('RB', 'DF', 86, 72),
    S('LM', 'MF', 14, 48), S('LCM', 'MF', 38, 52), S('RCM', 'MF', 62, 52), S('RM', 'MF', 86, 48),
    S('LST', 'FW', 38, 16), S('RST', 'FW', 62, 16),
  ],
  '4-2-3-1': [
    S('GK', 'GK', 50, 88),
    S('LB', 'DF', 14, 72), S('LCB', 'DF', 37, 74), S('RCB', 'DF', 63, 74), S('RB', 'DF', 86, 72),
    S('LDM', 'MF', 36, 56), S('RDM', 'MF', 64, 56),
    S('LAM', 'MF', 18, 34), S('CAM', 'MF', 50, 34), S('RAM', 'MF', 82, 34),
    S('ST', 'FW', 50, 13),
  ],
};
export const FORMATION_LIST = Object.keys(FORMATIONS) as Formation[];
export const BENCH_SIZE = 7;
export const MAX_SQUAD = 28;
export const MIN_SQUAD = 17;

export const isAvailable = (p: Player): boolean => p.injuredWeeks <= 0 && p.suspended <= 0;

export function posFit(natural: Pos, slot: Pos): number {
  if (natural === slot) return 1;
  if (slot === 'GK') return 0.35;
  if (natural === 'GK') return 0.4;
  const d = Math.abs(['DF', 'MF', 'FW'].indexOf(natural) - ['DF', 'MF', 'FW'].indexOf(slot));
  return d === 1 ? 0.9 : 0.8;
}

// Playing-condition multiplier (fitness + morale)
export function condition(p: Player): number {
  return (0.72 + 0.28 * (p.fitness / 100)) * (0.95 + 0.05 * (p.morale / 100));
}

export const effective = (p: Player, slot?: Pos): number => p.ovr * condition(p) * (slot ? posFit(p.pos, slot) : 1);

export function squadOf(g: Game, clubId: string): Player[] {
  const out: Player[] = [];
  for (const id in g.players) { const p = g.players[id]; if (p.clubId === clubId) out.push(p); }
  return out;
}

export const wageBill = (g: Game, clubId: string): number => squadOf(g, clubId).reduce((s, p) => s + p.wage, 0);

// Select the best XI + bench for a formation from a pool of players.
export function autoLineup(pool: Player[], formation: Formation): { lineup: string[]; bench: string[] } {
  const slots = FORMATIONS[formation];
  const avail = pool.filter(isAvailable);
  const used = new Set<string>();
  const byGroup: Record<Pos, Player[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of avail) byGroup[p.pos].push(p);
  (Object.keys(byGroup) as Pos[]).forEach((k) => byGroup[k].sort((a, b) => effective(b) - effective(a)));
  const lineup: string[] = new Array(slots.length).fill('');
  // pass 1: natural players
  const counters: Record<Pos, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  slots.forEach((s, i) => {
    const cand = byGroup[s.pos][counters[s.pos]];
    if (cand) { lineup[i] = cand.id; used.add(cand.id); counters[s.pos]++; }
  });
  // pass 2: fill gaps with best fit among the rest
  slots.forEach((s, i) => {
    if (lineup[i]) return;
    const rest = avail.filter((p) => !used.has(p.id));
    rest.sort((a, b) => effective(b, s.pos) - effective(a, s.pos));
    if (rest[0]) { lineup[i] = rest[0].id; used.add(rest[0].id); }
  });
  // bench: 1 GK, then best DF/MF/FW, then best remaining
  const bench: string[] = [];
  const take = (p?: Player) => { if (p && !used.has(p.id) && bench.length < BENCH_SIZE) { bench.push(p.id); used.add(p.id); } };
  take(byGroup.GK.find((p) => !used.has(p.id)));
  (['DF', 'MF', 'FW'] as Pos[]).forEach((k) => take(byGroup[k].find((p) => !used.has(p.id))));
  const rest = avail.filter((p) => !used.has(p.id)).sort((a, b) => effective(b) - effective(a));
  for (const p of rest) take(p);
  return { lineup, bench };
}

export function bestLineupScore(pool: Player[], formation: Formation): number {
  const { lineup } = autoLineup(pool, formation);
  const slots = FORMATIONS[formation];
  const map = new Map(pool.map((p) => [p.id, p]));
  let s = 0;
  lineup.forEach((id, i) => { const p = map.get(id); if (p) s += effective(p, slots[i].pos); });
  return s / 11;
}

// Average overall of the club's best XI (for display).
export function squadStrength(g: Game, clubId: string): number {
  const pool = squadOf(g, clubId).map((p) => ({ ...p, injuredWeeks: 0, suspended: 0 }));
  const { lineup } = autoLineup(pool, '4-3-3');
  const map = new Map(pool.map((p) => [p.id, p]));
  const xi = lineup.map((id) => map.get(id)).filter(Boolean) as Player[];
  return xi.length ? Math.round((xi.reduce((s, p) => s + p.ovr, 0) / xi.length) * 10) / 10 : 0;
}

export function validateLineup(g: Game, club: Club): string[] {
  const errs: string[] = [];
  const slots = FORMATIONS[club.formation];
  if (club.lineup.length !== slots.length) errs.push('Lineup does not match the formation.');
  const seen = new Set<string>();
  club.lineup.forEach((id, i) => {
    const slot = slots[i];
    if (!id) { errs.push(`Empty position: ${slot?.label ?? i + 1}.`); return; }
    if (seen.has(id)) errs.push(`${g.players[id]?.name ?? id} is selected more than once.`);
    seen.add(id);
    const p = g.players[id];
    if (!p || p.clubId !== club.id) { errs.push('A selected player is no longer at the club.'); return; }
    if (p.injuredWeeks > 0) errs.push(`${p.name} is injured.`);
    if (p.suspended > 0) errs.push(`${p.name} is suspended.`);
  });
  const gk = g.players[club.lineup[0]];
  if (!gk || gk.pos !== 'GK') errs.push('The starting XI needs a goalkeeper in goal.');
  const benchSeen = new Set<string>();
  club.bench.forEach((id) => {
    const p = g.players[id];
    if (!p || p.clubId !== club.id) { errs.push('A substitute is no longer at the club.'); return; }
    if (seen.has(id)) errs.push(`${p.name} is both in the XI and on the bench.`);
    if (benchSeen.has(id)) errs.push(`${p.name} is on the bench twice.`);
    benchSeen.add(id);
    if (!isAvailable(p)) errs.push(`${p.name} is unavailable but listed as a substitute.`);
  });
  if (club.bench.length > BENCH_SIZE) errs.push(`Maximum ${BENCH_SIZE} substitutes.`);
  if (!seen.has(club.captainId)) errs.push('Captain must be in the starting XI.');
  return errs;
}

export function pickCaptain(g: Game, club: Club): string {
  const xi = club.lineup.map((id) => g.players[id]).filter(Boolean);
  if (!xi.length) return '';
  xi.sort((a, b) => b.mental.composure + b.age + b.ovr - (a.mental.composure + a.age + a.ovr));
  return xi[0].id;
}

// Replace unavailable / missing / duplicate selections while keeping the rest of the user's choices.
export function repairLineup(g: Game, club: Club): void {
  const squad = squadOf(g, club.id);
  const slots = FORMATIONS[club.formation];
  if (club.lineup.length !== slots.length) club.lineup = new Array(slots.length).fill('');
  const used = new Set<string>();
  const ok = (id: string) => { const p = g.players[id]; return !!p && p.clubId === club.id && isAvailable(p) && !used.has(id); };
  club.lineup = club.lineup.map((id, i) => {
    if (ok(id) && (i !== 0 || g.players[id].pos === 'GK')) { used.add(id); return id; }
    return '';
  });
  slots.forEach((s, i) => {
    if (club.lineup[i]) return;
    const benchFirst = club.bench.filter((id) => ok(id)).map((id) => g.players[id]);
    const pool = [...benchFirst, ...squad.filter((p) => isAvailable(p) && !used.has(p.id))];
    const cands = pool.filter((p) => !used.has(p.id) && (i !== 0 || p.pos === 'GK' || !pool.some((q) => q.pos === 'GK' && !used.has(q.id))));
    cands.sort((a, b) => effective(b, s.pos) - effective(a, s.pos));
    if (cands[0]) { club.lineup[i] = cands[0].id; used.add(cands[0].id); }
  });
  const benchPool = squad.filter((p) => isAvailable(p) && !used.has(p.id));
  const keep = club.bench.filter((id, idx, arr) => ok(id) && arr.indexOf(id) === idx);
  const bench: string[] = [];
  keep.forEach((id) => { if (bench.length < BENCH_SIZE) bench.push(id); });
  benchPool.sort((a, b) => effective(b) - effective(a));
  for (const p of benchPool) { if (bench.length >= BENCH_SIZE) break; if (!bench.includes(p.id)) bench.push(p.id); }
  club.bench = bench;
  if (!club.lineup.includes(club.captainId)) club.captainId = pickCaptain(g, club);
}

// AI selection: picks formation (with a little managerial bias), mentality and style.
export function aiSelectTeam(g: Game, club: Club, oppStrength?: number, isHome = true): void {
  const pool = squadOf(g, club.id);
  let best: Formation = club.formation;
  let bestScore = -1;
  for (const f of FORMATION_LIST) {
    const bias = f === club.formation ? 0.6 : 0;
    const sc = bestLineupScore(pool, f) + bias + rand() * 0.5;
    if (sc > bestScore) { bestScore = sc; best = f; }
  }
  club.formation = best;
  const { lineup, bench } = autoLineup(pool, best);
  club.lineup = lineup;
  club.bench = bench;
  club.captainId = pickCaptain(g, club);
  if (oppStrength !== undefined) {
    const mine = bestScore;
    const diff = mine - oppStrength;
    club.mentality = diff > 3 && isHome ? 'attacking' : diff < -5 ? 'defensive' : 'balanced';
    club.style = diff < -3 ? 'counter' : diff > 4 ? 'possession' : club.style;
  }
}
