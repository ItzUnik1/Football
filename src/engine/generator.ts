import type { Agent, Club, League, Personality, Player, Pos } from './types';
import { CLUB_DEFS, LEAGUE_DEFS, MANAGER_FIRST, MANAGER_LAST, MANAGER_STYLES, NATIONS, lowerClubDefs, type ClubDef } from './names';
import { clamp, gauss, hash01, pick, rand, randInt, weighted } from './rng';
import { buildAttributes, valueOf, wageFor } from './valuation';
import { autoLineup } from './team';
import { contractEndFor, seasonOf, utc } from './calendar';
import { firstSaturday } from './fixtures';

const POS_PLAN: { pos: Pos; offsets: number[] }[] = [
  { pos: 'GK', offsets: [3, -6, -11] },
  { pos: 'DF', offsets: [3, 2, 1, 0, -3, -6, -9] },
  { pos: 'MF', offsets: [4, 3, 2, 0, -1, -5, -8, -10] },
  { pos: 'FW', offsets: [4, 2, -2, -8] },
];

const usedNames = new Set<string>();
export function seedNames(names: string[]): void { names.forEach((n) => usedNames.add(n)); }

let genDate = utc(2026, 7, 1);
export function setGenDate(t: number): void { genDate = t; }

function makeName(): { name: string; nat: string } {
  for (let i = 0; i < 300; i++) {
    const n = weighted(NATIONS, (x) => x.weight);
    const name = `${pick(n.first)} ${pick(n.last)}`;
    if (!usedNames.has(name)) { usedNames.add(name); return { name, nat: n.nat }; }
  }
  const n = pick(NATIONS);
  const name = `${pick(n.first)} ${pick(n.last)}`; // pool exhausted: a repeated name is realistic
  return { name, nat: n.nat };
}

function makeAge(): number {
  const r = rand();
  if (r < 0.16) return randInt(17, 20);
  if (r < 0.56) return randInt(21, 26);
  if (r < 0.86) return randInt(27, 31);
  return randInt(32, 36);
}

let playerCounter = 0;
export function nextPlayerId(): string { return `p${String(++playerCounter).padStart(4, '0')}`; }
export function syncPlayerCounter(n: number): void { playerCounter = Math.max(playerCounter, n); }

const AGENT_FIRST = ['Marcus', 'Daniel', 'Elena', 'Victor', 'Sofia', 'Rico', 'Hanna', 'Jorge', 'Nadia', 'Felix'];
const AGENT_LAST = ['Stone', 'Vega', 'Lindgren', 'Costa', 'Mercer', 'Adler', 'Quinn', 'Rossi', 'Okoye', 'Brandt'];

export function personalityFor(seed: string, age = 25): Personality {
  const h = (k: string) => hash01(seed + k);
  const g = (k: string, bias = 0) => clamp(Math.round(4 + h(k) * 14 + bias), 1, 20);
  return {
    professionalism: g('pro'), ambition: g('amb', age < 24 ? 1.5 : 0), loyalty: g('loy', age > 29 ? 1.5 : -0.5),
    leadership: g('lead', age > 27 ? 2 : -1), adaptability: g('ada'),
  };
}
export const agentFor = (seed: string): Agent => ({
  name: `${AGENT_FIRST[Math.floor(hash01(seed + 'a1') * AGENT_FIRST.length)]} ${AGENT_LAST[Math.floor(hash01(seed + 'a2') * AGENT_LAST.length)]}`,
  greed: Math.round(hash01(seed + 'g') * 100) / 100,
});

export function makePlayer(clubId: string | null, pos: Pos, targetOvr: number, ageOverride?: number): Player {
  const age = ageOverride ?? makeAge();
  let t = targetOvr;
  if (age < 22) t -= (22 - age) * 1.2;
  if (age > 31) t -= (age - 31) * 0.9;
  t = clamp(Math.round(t), 36, 92);
  const a = buildAttributes(pos, t);
  const ovr = a.ovr;
  let pot = ovr;
  if (age <= 20) pot = ovr + randInt(5, 18);
  else if (age <= 23) pot = ovr + randInt(2, 10);
  else if (age <= 27) pot = ovr + randInt(0, 4);
  pot = clamp(pot, ovr, 96);
  const contractYears = age <= 21 ? randInt(2, 5) : age >= 32 ? randInt(1, 2) : randInt(1, 5);
  const { name, nat } = makeName();
  const id = nextPlayerId();
  const value = valueOf(ovr, age, pot, contractYears);
  return {
    id, clubId, name, age, nat, pos, ovr, pot, value,
    wage: wageFor(ovr, age),
    contractYears,
    contractEnd: clubId ? contractEndFor(genDate, contractYears) : undefined,
    fitness: randInt(88, 100),
    morale: randInt(62, 85),
    tech: a.tech, phys: a.phys, mental: a.mental,
    injuredDays: 0, injuries: [], returnDays: 0, suspended: 0, yellowCount: 0, benchStreak: 0, lastComplaint: 0,
    stats: { apps: 0, starts: 0, goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0, ratingSum: 0, cleanSheets: 0 },
    personality: personalityFor(id, age), agent: agentFor(id),
    releaseClause: clubId && age >= 21 && age <= 29 && hash01(id + 'rc') < 0.25 ? Math.round((value * 2.5) / 50000) * 50000 : undefined,
    recentMinutes: 0, form: 6.5, focus: 'auto',
    career: { apps: 0, goals: 0, assists: 0, cleanSheets: 0, seasons: [] },
    joined: genDate,
  };
}

function levelFor(rep: number): number { return clamp(Math.round(1 + rep / 25), 1, 5); }

function buildClub(g: { clubs: Record<string, Club>; players: Record<string, Player> }, id: string, d: ClubDef, tier: number, badge: number, leagueId: string): void {
  const rep = d.rep;
  const mu = 54 + rep * 0.21 - (tier - 1) * 3;
  const squad: Player[] = [];
  POS_PLAN.forEach(({ pos, offsets }) => offsets.forEach((o) => { squad.push(makePlayer(id, pos, mu + o + gauss() * 2.2)); }));
  squad.forEach((p) => { g.players[p.id] = p; });
  const wageBill = squad.reduce((s, p) => s + p.wage, 0);
  const transferBudget = Math.round((3_000_000 + rep * rep * 4500) / 50000) * 50000;
  const lvl = levelFor(rep);
  const club: Club = {
    id, name: d.name, short: d.short, city: d.city, colors: d.colors, badge,
    stadium: d.stadium, capacity: d.capacity,
    manager: { name: `${pick(MANAGER_FIRST)} ${pick(MANAGER_LAST)}`, age: randInt(40, 64), nat: pick(NATIONS).nat, style: pick(MANAGER_STYLES) },
    reputation: rep,
    balance: Math.round(transferBudget * 2.2 + 5_000_000),
    transferBudget,
    wageBudget: Math.round((wageBill * 1.2) / 1000) * 1000,
    weeklyIncome: Math.round((60000 + rep * rep * 60) / 1000) * 1000,
    ticketPrice: Math.round(22 + rep * 0.4),
    formation: '4-3-3', mentality: 'balanced', style: 'possession',
    lineup: [], bench: [], captainId: '',
    leagueId, medicalLevel: lvl, youthLevel: lvl, trainingLevel: lvl,
  };
  const { lineup, bench } = autoLineup(squad, club.formation);
  club.lineup = lineup;
  club.bench = bench;
  const xi = lineup.map((pid) => g.players[pid]).sort((a, b) => b.age + b.mental.composure - (a.age + a.mental.composure));
  club.captainId = xi[0]?.id ?? '';
  g.clubs[id] = club;
}

export function makeLeagues(season: number, clubsByLeague: Record<string, string[]>): Record<string, League> {
  const out: Record<string, League> = {};
  LEAGUE_DEFS.forEach((d) => {
    out[d.id] = {
      id: d.id, name: d.name, short: d.short, tier: d.tier, clubIds: clubsByLeague[d.id] ?? [], promote: d.promote, relegate: d.relegate,
      startDate: firstSaturday(season, d.startMonthDay[0], d.startMonthDay[1]), midweekEvery: d.midweekEvery,
    };
  });
  return out;
}

export function createWorld(season = 2026): { clubs: Record<string, Club>; players: Record<string, Player>; leagues: Record<string, League> } {
  usedNames.clear();
  playerCounter = 0;
  setGenDate(utc(season, 7, 1));
  const world = { clubs: {} as Record<string, Club>, players: {} as Record<string, Player> };
  const byLeague: Record<string, string[]> = { L1: [], L2: [], L3: [] };
  CLUB_DEFS.forEach((d, i) => {
    const id = `c${String(i + 1).padStart(2, '0')}`;
    buildClub(world, id, d, 1, i % 6, 'L1');
    byLeague.L1.push(id);
  });
  addLowerClubs(world, byLeague, 1);
  addFreeAgents(world);
  return { ...world, leagues: makeLeagues(season, byLeague) };
}

/** Generates the tier 2 and tier 3 clubs (used for new worlds and when migrating Phase 1 saves). */
export function addLowerClubs(world: { clubs: Record<string, Club>; players: Record<string, Player> }, byLeague: Record<string, string[]>, startIndex: number): void {
  const defs = lowerClubDefs();
  defs.forEach(({ def, tier }, i) => {
    const id = `c${String(CLUB_DEFS.length + startIndex + i).padStart(2, '0')}`;
    if (world.clubs[id]) return;
    buildClub(world, id, def, tier, (i + tier) % 6, tier === 2 ? 'L2' : 'L3');
    byLeague[tier === 2 ? 'L2' : 'L3'].push(id);
  });
}

export function addFreeAgents(world: { players: Record<string, Player> }): void {
  const faPlan: { pos: Pos; ovr: number }[] = [
    { pos: 'GK', ovr: 56 }, { pos: 'GK', ovr: 52 }, { pos: 'DF', ovr: 63 }, { pos: 'DF', ovr: 60 }, { pos: 'DF', ovr: 57 }, { pos: 'DF', ovr: 54 },
    { pos: 'MF', ovr: 64 }, { pos: 'MF', ovr: 61 }, { pos: 'MF', ovr: 58 }, { pos: 'MF', ovr: 55 }, { pos: 'MF', ovr: 52 },
    { pos: 'FW', ovr: 65 }, { pos: 'FW', ovr: 61 }, { pos: 'FW', ovr: 57 }, { pos: 'FW', ovr: 53 },
    { pos: 'DF', ovr: 66 }, { pos: 'MF', ovr: 67 }, { pos: 'GK', ovr: 61 }, { pos: 'FW', ovr: 68 }, { pos: 'MF', ovr: 50 },
  ];
  faPlan.forEach((f) => {
    const p = makePlayer(null, f.pos, f.ovr + gauss() * 1.5, randInt(19, 34));
    p.contractYears = 0; p.contractEnd = undefined; p.releaseClause = undefined;
    p.value = valueOf(p.ovr, p.age, p.pot, 0);
    world.players[p.id] = p;
  });
}

/** Youth prospect (age 15-18). Real potential is hidden from the user unless scouted. */
export function makeYouth(clubId: string | null, quality: number, pos?: Pos): Player {
  const position: Pos = pos ?? weighted<Pos>(['GK', 'DF', 'MF', 'FW'], (p) => ({ GK: 0.7, DF: 2.2, MF: 2.6, FW: 1.8 }[p]));
  const age = randInt(15, 18);
  const base = 34 + quality * 4 + gauss() * 3 + (age - 15) * 2.2;
  const a = buildAttributes(position, clamp(Math.round(base), 28, 62));
  const pot = clamp(Math.round(a.ovr + 12 + quality * 4 + gauss() * 8), a.ovr + 3, 94);
  const { name, nat } = makeName();
  const id = nextPlayerId();
  return {
    id, clubId, name, age, nat, pos: position, ovr: a.ovr, pot,
    value: valueOf(a.ovr, age, pot, 3), wage: Math.max(300, Math.round((wageFor(a.ovr, age) * 0.35) / 50) * 50),
    contractYears: 3, contractEnd: clubId ? contractEndFor(genDate, 3) : undefined,
    fitness: 100, morale: 75, tech: a.tech, phys: a.phys, mental: a.mental,
    injuredDays: 0, injuries: [], returnDays: 0, suspended: 0, yellowCount: 0, benchStreak: 0, lastComplaint: 0,
    stats: { apps: 0, starts: 0, goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0, ratingSum: 0, cleanSheets: 0 },
    personality: personalityFor(id, age), agent: agentFor(id), recentMinutes: 0, form: 6.5, focus: 'auto',
    career: { apps: 0, goals: 0, assists: 0, cleanSheets: 0, seasons: [] }, joined: genDate,
    academy: !!clubId, prospect: !clubId,
  };
}

export { seasonOf };
