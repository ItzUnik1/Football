import type { Club, Player, Pos } from './types';
import { CLUB_DEFS, MANAGER_FIRST, MANAGER_LAST, MANAGER_STYLES, NATIONS } from './names';
import { clamp, gauss, pick, rand, randInt, weighted } from './rng';
import { buildAttributes, valueOf, wageFor } from './valuation';
import { autoLineup } from './team';

const POS_PLAN: { pos: Pos; offsets: number[] }[] = [
  { pos: 'GK', offsets: [3, -6, -11] },
  { pos: 'DF', offsets: [3, 2, 1, 0, -3, -6, -9] },
  { pos: 'MF', offsets: [4, 3, 2, 0, -1, -5, -8, -10] },
  { pos: 'FW', offsets: [4, 2, -2, -8] },
];

const usedNames = new Set<string>();

function makeName(): { name: string; nat: string } {
  for (let i = 0; i < 50; i++) {
    const n = weighted(NATIONS, (x) => x.weight);
    const name = `${pick(n.first)} ${pick(n.last)}`;
    if (!usedNames.has(name)) { usedNames.add(name); return { name, nat: n.nat }; }
  }
  const n = pick(NATIONS);
  const name = `${pick(n.first)} ${pick(n.last)} ${usedNames.size}`;
  usedNames.add(name);
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

export function makePlayer(clubId: string | null, pos: Pos, targetOvr: number, ageOverride?: number): Player {
  const age = ageOverride ?? makeAge();
  let t = targetOvr;
  if (age < 22) t -= (22 - age) * 1.2;
  if (age > 31) t -= (age - 31) * 0.9;
  t = clamp(Math.round(t), 38, 92);
  const a = buildAttributes(pos, t);
  const ovr = a.ovr;
  let pot = ovr;
  if (age <= 20) pot = ovr + randInt(5, 18);
  else if (age <= 23) pot = ovr + randInt(2, 10);
  else if (age <= 27) pot = ovr + randInt(0, 4);
  pot = clamp(pot, ovr, 96);
  const contractYears = age <= 21 ? randInt(2, 5) : age >= 32 ? randInt(1, 2) : randInt(1, 5);
  const { name, nat } = makeName();
  return {
    id: `p${String(++playerCounter).padStart(4, '0')}`,
    clubId, name, age, nat, pos, ovr, pot,
    value: valueOf(ovr, age, pot, contractYears),
    wage: wageFor(ovr, age),
    contractYears,
    fitness: randInt(88, 100),
    morale: randInt(62, 85),
    tech: a.tech, phys: a.phys, mental: a.mental,
    injuredWeeks: 0, suspended: 0, yellowCount: 0, benchStreak: 0, lastComplaint: -10,
    stats: { apps: 0, starts: 0, goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0, ratingSum: 0, cleanSheets: 0 },
  };
}

export function createWorld(): { clubs: Record<string, Club>; players: Record<string, Player> } {
  usedNames.clear();
  playerCounter = 0;
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  CLUB_DEFS.forEach((d, i) => {
    const id = `c${String(i + 1).padStart(2, '0')}`;
    const rep = d.rep;
    const mu = 54 + rep * 0.21;
    const squad: Player[] = [];
    POS_PLAN.forEach(({ pos, offsets }) => offsets.forEach((o) => {
      squad.push(makePlayer(id, pos, mu + o + gauss() * 2.2));
    }));
    squad.forEach((p) => { players[p.id] = p; });
    const wageBill = squad.reduce((s, p) => s + p.wage, 0);
    const transferBudget = Math.round((3_000_000 + rep * rep * 4500) / 50000) * 50000;
    const club: Club = {
      id, name: d.name, short: d.short, city: d.city, colors: d.colors, badge: i % 6,
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
    };
    const { lineup, bench } = autoLineup(squad, club.formation);
    club.lineup = lineup;
    club.bench = bench;
    const xi = lineup.map((pid) => players[pid]).sort((a, b) => b.age + b.mental.composure - (a.age + a.mental.composure));
    club.captainId = xi[0]?.id ?? '';
    clubs[id] = club;
  });
  // Free agents (extra market depth)
  const faPlan: { pos: Pos; ovr: number }[] = [
    { pos: 'GK', ovr: 56 }, { pos: 'GK', ovr: 52 }, { pos: 'DF', ovr: 63 }, { pos: 'DF', ovr: 60 }, { pos: 'DF', ovr: 57 }, { pos: 'DF', ovr: 54 },
    { pos: 'MF', ovr: 64 }, { pos: 'MF', ovr: 61 }, { pos: 'MF', ovr: 58 }, { pos: 'MF', ovr: 55 }, { pos: 'MF', ovr: 52 },
    { pos: 'FW', ovr: 65 }, { pos: 'FW', ovr: 61 }, { pos: 'FW', ovr: 57 }, { pos: 'FW', ovr: 53 },
    { pos: 'DF', ovr: 66 }, { pos: 'MF', ovr: 67 }, { pos: 'GK', ovr: 61 }, { pos: 'FW', ovr: 68 }, { pos: 'MF', ovr: 50 },
  ];
  faPlan.forEach((f) => {
    const p = makePlayer(null, f.pos, f.ovr + gauss() * 1.5, randInt(19, 34));
    p.contractYears = 0;
    p.value = valueOf(p.ovr, p.age, p.pot, 0);
    players[p.id] = p;
  });
  return { clubs, players };
}

export function nextPlayerId(): string { return `p${String(++playerCounter).padStart(4, '0')}`; }
export function syncPlayerCounter(n: number): void { playerCounter = Math.max(playerCounter, n); }
