import type { Club, ClubEcon, Fixture, Game } from './types';
import { chance, clamp, hash01, pick, randInt } from './rng';
import { addDays, dayDiff, fmtDate, fmtDateShort, parts, utc, seasonOf } from './calendar';
import { addMessage, addTx, gameNow } from './messages';
import { addNews } from './news';
import { fmtMoney } from './valuation';
import { wageBill } from './team';
import { repRankIn } from './board';
import { computeTable, leagueIdOf } from './fixtures';
import { staffWageBill } from './staff';

const SPONSORS = ['Aurora Telecom', 'Northgate Bank', 'Helix Energy', 'Vantage Air', 'Corvid Motors', 'Meridian Insurance', 'Zenith Foods', 'Atlas Logistics', 'Pinnacle Brewing', 'Solace Pharma', 'Orbit Mobile', 'Granite Capital', 'Falcon Sports', 'Kestrel Tech', 'Lumen Utilities'];
const KITS = ['Velox', 'Kinetic', 'Aeris', 'Stratos', 'Nordik', 'Bravura', 'Ardent', 'Torque'];
export const TIER_TV: Record<number, number> = { 1: 1, 2: 0.4, 3: 0.22 };
export const PROFILE_LABEL: Record<ClubEcon['profile'], string> = { rich: 'Wealthy owner', big: 'Big spender', balanced: 'Balanced', frugal: 'Frugal', youth: 'Youth-focused', trader: 'Player trader' };

export function initEcon(g: Game): void {
  const clubs = Object.values(g.clubs);
  const byRep = [...clubs].sort((a, b) => b.reputation - a.reputation);
  for (const c of clubs) {
    if (c.econ) continue;
    const total = c.weeklyIncome;
    const merchIndex = clamp(Math.round(c.reputation * 0.7 + hash01(c.id + 'mi') * 22), 4, 99);
    const rank = byRep.indexOf(c);
    const r = hash01(c.id + 'prof');
    const profile: ClubEcon['profile'] = rank < 3 && c.balance > 50_000_000 ? 'rich' : c.reputation >= 62 ? 'big' : r < 0.25 ? 'frugal' : r < 0.5 ? 'youth' : r < 0.72 ? 'trader' : 'balanced';
    const tier = g.leagues[c.leagueId ?? 'L1']?.tier ?? 1;
    c.econ = {
      sponsor: { name: SPONSORS[Math.floor(hash01(c.id + 'sp') * SPONSORS.length)], weekly: Math.round(total * 0.22), end: utc(g.meta.season + 1 + Math.floor(hash01(c.id + 'se') * 3), 5, 30) },
      kitDeal: { name: KITS[Math.floor(hash01(c.id + 'kt') * KITS.length)], weekly: Math.round(total * 0.1), end: utc(g.meta.season + 1 + Math.floor(hash01(c.id + 'ke') * 3), 5, 30) },
      merchIndex, merchBase: Math.round((total * 0.13) / (0.5 + merchIndex / 100)), tvBase: Math.round(total * 0.5), sponsorBase: Math.round(total * 0.22), tier,
      seasonTickets: Math.round(c.capacity * clamp(0.3 + c.reputation * 0.004, 0.2, 0.7)), seasonTicketPrice: Math.round(c.ticketPrice * 0.85 * 19), stSeason: 0,
      debt: 0, interestRate: 0.06, stadiumLevel: clamp(1 + Math.floor(c.reputation / 22), 1, 5), scoutingLevel: c.trainingLevel ?? 3,
      maintenanceWeek: 0, profile, ambition: clamp(Math.round(5 + c.reputation / 8 + (hash01(c.id + 'amb') - 0.5) * 8), 1, 20), tvDeal: Math.round(total * 0.5),
      maxCapacity: Math.round(Math.min(c.capacity * 1.8, c.capacity + 20000) / 500) * 500,
      rev: { matchday: 0, tickets: 0, sponsor: 0, merch: 0, tv: 0, prize: 0, other: 0 }, exp: { wages: 0, staff: 0, stadium: 0, interest: 0, transfers: 0, bonuses: 0 },
    };
  }
}

export const merchWeekly = (c: Club): number => Math.round((c.econ!.merchBase * (0.5 + c.econ!.merchIndex / 100)) / 10) * 10;
export const otherWeekly = (c: Club): number => Math.round(c.capacity * 1.5 * (0.7 + c.econ!.stadiumLevel * 0.15));
export const stadiumMaintenance = (c: Club): number => Math.round(c.capacity * 1.2 * (1 + (c.econ!.stadiumLevel - 1) * 0.12));
export const facilityMaintenance = (c: Club): number => ((c.medicalLevel ?? 3) + (c.youthLevel ?? 3) + (c.trainingLevel ?? 3) + (c.econ?.scoutingLevel ?? 3)) * 1200;
export function incomeWeekly(c: Club): { tv: number; sponsor: number; kit: number; merch: number; other: number; total: number } {
  const e = c.econ!;
  const tv = e.tvDeal ?? e.tvBase, sponsor = e.sponsor.weekly, kit = e.kitDeal.weekly, merch = merchWeekly(c), other = otherWeekly(c);
  return { tv, sponsor, kit, merch, other, total: tv + sponsor + kit + merch + other };
}
export function costsWeekly(g: Game, c: Club): { wages: number; staff: number; stadium: number; manager: number; scouts: number } {
  const academy = Object.values(g.players).reduce((s, p) => (p.clubId === c.id && p.academy ? s + p.wage : s), 0);
  const scouts = c.id === g.meta.userClubId ? g.scouting.scouts.filter((s) => s.hired).reduce((s, x) => s + x.wage, 0) : 0;
  const manager = c.manager.caretaker ? 0 : (c.manager.id === 'USER' ? (g.career?.contract?.wage ?? 0) : (c.manager.wage ?? 0));
  return { wages: wageBill(g, c.id) + academy, staff: staffWageBill(c) + facilityMaintenance(c) + scouts + manager, scouts, stadium: stadiumMaintenance(c), manager };
}

// ---------- Matchday ----------
const refPrice = (c: Club): number => 14 + c.reputation * 0.3;
export const priceFactor = (c: Club): number => clamp(1 - (c.ticketPrice / refPrice(c) - 1) * 0.35, 0.6, 1.08);
export function attendanceFor(g: Game, f: Fixture): number {
  const h = g.clubs[f.home], a = g.clubs[f.away];
  const lvl = h.econ?.stadiumLevel ?? 3;
  const base = clamp(0.5 + h.reputation * 0.004 + a.reputation * 0.0015 + lvl * 0.008 + (Math.random() - 0.5) * 0.06, 0.4, 1) * priceFactor(h);
  const cap = f.neutral ? 60000 : h.capacity;
  return Math.round(cap * clamp(base, 0.3, 1));
}
export function gateFor(g: Game, f: Fixture): { attendance: number; gate: number; seasonTickets: number } {
  const h = g.clubs[f.home];
  const att = attendanceFor(g, f);
  const st = !f.neutral && h.econ && h.econ.stSeason === g.meta.season ? Math.min(h.econ.seasonTickets, Math.round(att * 0.92)) : 0;
  return { attendance: att, seasonTickets: st, gate: Math.round(Math.max(0, att - st) * h.ticketPrice) };
}
/** Credits gate receipts (matchday revenue). Cup finals are split between both finalists. */
export function matchdayRevenue(g: Game, f: Fixture): void {
  const h = g.clubs[f.home], a = g.clubs[f.away];
  if (!h) return;
  const { gate } = gateFor(g, f);
  const credit = (c: Club, amt: number, label: string) => {
    c.balance += amt; c.transferBudget += Math.round(amt * 0.1);
    addTx(g, c.id, 'matchday', amt, label);
    if (c.econ) c.econ.rev.matchday += amt;
  };
  if (f.neutral && a) { credit(h, Math.round(gate / 2), `Cup final gate share vs ${a.name}`); credit(a, Math.round(gate / 2), `Cup final gate share vs ${h.name}`); }
  else credit(h, gate, `Matchday revenue vs ${a?.name ?? 'opponent'}`);
}

// ---------- Weekly ----------
export interface WeekFinance { clubId: string; wages: number; tv: number; staff: number; net: number }
export function weeklyEcon(g: Game): Record<string, WeekFinance> {
  const out: Record<string, WeekFinance> = {};
  for (const c of Object.values(g.clubs)) {
    const e = c.econ!;
    const inc = incomeWeekly(c), cost = costsWeekly(g, c);
    let interest = 0;
    if (c.balance < 0) interest = Math.round((-c.balance * e.interestRate) / 52);
    let build = 0;
    if (e.construction) { const k = e.construction; const weeks = Math.max(1, Math.round((k.ready - k.start) / (7 * 86400000))); build = Math.round((k.cost * 0.6) / weeks); k.paid += build; }
    const expense = cost.wages + cost.staff + cost.stadium + interest + build;
    const net = inc.total - expense;
    c.balance += net;
    if (net > 0) c.transferBudget += Math.round(net * 0.3);
    c.weeklyIncome = inc.total;
    e.debt = Math.max(0, -c.balance);
    e.lastWeek = { tv: inc.tv, matchday: 0, sponsor: inc.sponsor + inc.kit, merch: inc.merch, wages: cost.wages, staff: cost.staff, stadium: cost.stadium + build, interest, net };
    e.rev.tv += inc.tv; e.rev.sponsor += inc.sponsor + inc.kit; e.rev.merch += inc.merch; e.rev.other += inc.other;
    e.exp.wages += cost.wages; e.exp.staff += cost.staff; e.exp.stadium += cost.stadium + build; e.exp.interest += interest;
    out[c.id] = { clubId: c.id, wages: cost.wages, tv: inc.total, staff: cost.staff + cost.stadium + interest + build, net };
    if (c.id === g.meta.userClubId) {
      addTx(g, c.id, 'tv', inc.tv, 'Television income');
      addTx(g, c.id, 'sponsor', inc.sponsor + inc.kit, `Sponsorship: ${e.sponsor.name} / kit: ${e.kitDeal.name}`);
      addTx(g, c.id, 'merch', inc.merch + inc.other, 'Merchandise and stadium commercial income');
      addTx(g, c.id, 'wages', -cost.wages, 'Player wages');
      addTx(g, c.id, 'staff', -cost.staff, 'Staff, manager, scouting and facilities');
      addTx(g, c.id, 'stadium', -(cost.stadium + build), build ? 'Stadium upkeep and construction' : 'Stadium upkeep');
      if (interest) addTx(g, c.id, 'interest', -interest, 'Interest on overdraft');
    }
  }
  return out;
}

// ---------- Daily ----------
export function econDaily(g: Game): void {
  const t = gameNow(g);
  const p = parts(t);
  if (p.m === 7 && p.d === 1) seasonTicketSales(g);
  for (const c of Object.values(g.clubs)) {
    const k = c.econ?.construction;
    if (k && t >= k.ready) completeConstruction(g, c);
  }
}

function seasonTicketSales(g: Game): void {
  for (const c of Object.values(g.clubs)) {
    const e = c.econ!;
    const lg = g.leagues[c.leagueId ?? 'L1'];
    const rankFactor = lg ? 1 - repRankIn(g, c.id) / Math.max(1, lg.clubIds.length) : 0.5;
    const frac = clamp(0.28 + c.reputation * 0.0035 + rankFactor * 0.1 + (e.stadiumLevel - 3) * 0.015, 0.15, 0.8) * priceFactor(c);
    e.seasonTickets = Math.round(c.capacity * frac);
    e.seasonTicketPrice = Math.round(c.ticketPrice * 0.85 * 19);
    e.stSeason = g.meta.season;
    const income = e.seasonTickets * e.seasonTicketPrice;
    c.balance += income; c.transferBudget += Math.round(income * 0.1);
    e.rev.tickets += income;
    if (c.id === g.meta.userClubId) {
      addTx(g, c.id, 'season_tickets', income, `Season tickets: ${e.seasonTickets.toLocaleString()} sold`);
      addMessage(g, { category: 'Finances', from: 'Commercial Director', subject: `Season tickets sold: ${e.seasonTickets.toLocaleString()}`, body: `${e.seasonTickets.toLocaleString()} season tickets (${Math.round((e.seasonTickets / c.capacity) * 100)}% of capacity) were sold at ${fmtMoney(e.seasonTicketPrice)}, bringing in ${fmtMoney(income)}. Ticket price and the success of the team affect next year's sales.`, action: { kind: 'goto', screen: 'finances' } });
    }
  }
}

// ---------- Stadium and facilities ----------
export const FAC_LABEL = { training: 'Training facilities', youth: 'Youth facilities', medical: 'Medical facilities', scouting: 'Scouting network' } as const;
export const standCost = (c: Club, seats: number): number => Math.round((seats * (1800 + c.capacity * 0.04)) / 50000) * 50000;
export const standDays = (seats: number): number => 120 + Math.round(seats / 40);
export const stadiumUpgradeCost = (c: Club): number => Math.round((Math.pow(c.econ!.stadiumLevel, 2) * 1_500_000 * Math.max(0.4, c.capacity / 20000)) / 50000) * 50000;
export const facilityUpgradeCost = (lvl: number): number => Math.round((lvl * lvl * 1_200_000) / 100000) * 100000;
export const facilityLevel = (c: Club, k: 'training' | 'youth' | 'medical' | 'scouting'): number => (k === 'scouting' ? c.econ?.scoutingLevel : k === 'training' ? c.trainingLevel : k === 'youth' ? c.youthLevel : c.medicalLevel) ?? 3;

export type BuildSpec = { kind: 'stand'; seats: number } | { kind: 'roof' } | { kind: 'facility'; facility: 'training' | 'youth' | 'medical' | 'scouting' };
export function startConstruction(g: Game, clubId: string, spec: BuildSpec): { ok: boolean; message: string } {
  const c = g.clubs[clubId]; const e = c.econ!;
  if (e.construction) return { ok: false, message: `Construction is already under way (${e.construction.label}, ready ${fmtDate(e.construction.ready)}).` };
  if (c.balance < 0) return { ok: false, message: 'The club is in debt: the bank will not finance construction.' };
  const now = gameNow(g);
  let cost = 0, days = 0, label = '';
  const k: Parameters<typeof Object.assign>[1] = {};
  if (spec.kind === 'stand') {
    if (c.capacity + spec.seats > e.maxCapacity) return { ok: false, message: `Planning permission limits the stadium to ${e.maxCapacity.toLocaleString()} seats.` };
    cost = standCost(c, spec.seats); days = standDays(spec.seats); label = `New stand: +${spec.seats.toLocaleString()} seats`;
    Object.assign(k, { addCapacity: spec.seats });
  } else if (spec.kind === 'roof') {
    if (e.stadiumLevel >= 5) return { ok: false, message: 'The stadium is already at the highest standard.' };
    cost = stadiumUpgradeCost(c); days = 90 + e.stadiumLevel * 20; label = `Stadium upgrade to level ${e.stadiumLevel + 1}`;
  } else {
    const lvl = facilityLevel(c, spec.facility);
    if (lvl >= 5) return { ok: false, message: 'Already at the highest level.' };
    cost = facilityUpgradeCost(lvl); days = 60 + lvl * 30; label = `${FAC_LABEL[spec.facility]} to level ${lvl + 1}`;
    Object.assign(k, { facility: spec.facility, level: lvl + 1 });
  }
  const upfront = Math.round(cost * 0.4);
  if (c.balance < cost) return { ok: false, message: `You need ${fmtMoney(cost)} available (40% is paid now, the rest during construction).` };
  c.balance -= upfront; addTx(g, c.id, 'stadium', -upfront, `Construction deposit: ${label}`);
  e.exp.stadium += upfront;
  const built = { kind: spec.kind === 'facility' ? 'facility' : spec.kind, label, cost, start: now, ready: addDays(now, days), paid: upfront, ...k } as NonNullable<ClubEcon['construction']>;
  e.construction = built;
  if (c.id === g.meta.userClubId) addMessage(g, { category: 'Finances', from: 'Project Manager', subject: `Construction started: ${label}`, body: `Total cost ${fmtMoney(cost)}. The project will be completed on ${fmtDate(built.ready)}. The remainder is paid in weekly instalments.`, action: { kind: 'goto', screen: 'stadium' } });
  return { ok: true, message: `${label} - ready ${fmtDate(built.ready)}.` };
}

function completeConstruction(g: Game, c: Club): void {
  const e = c.econ!; const k = e.construction!;
  const rest = Math.max(0, k.cost - k.paid);
  if (rest) { c.balance -= rest; addTx(g, c.id, 'stadium', -rest, `Final construction payment: ${k.label}`); e.exp.stadium += rest; }
  if (k.addCapacity) { c.capacity += k.addCapacity; e.seasonTickets = Math.min(e.seasonTickets, c.capacity); }
  else if (k.kind === 'roof') e.stadiumLevel = Math.min(5, e.stadiumLevel + 1);
  else if (k.facility === 'training') c.trainingLevel = k.level;
  else if (k.facility === 'youth') c.youthLevel = k.level;
  else if (k.facility === 'medical') c.medicalLevel = k.level;
  else if (k.facility === 'scouting') e.scoutingLevel = k.level ?? e.scoutingLevel;
  e.construction = undefined;
  if (c.id === g.meta.userClubId) addMessage(g, { category: 'Finances', from: 'Project Manager', important: true, subject: `Completed: ${k.label}`, body: `Construction has finished. ${k.addCapacity ? `Capacity is now ${c.capacity.toLocaleString()}.` : 'The improvement is now in effect.'}`, action: { kind: 'goto', screen: 'stadium' } });
  else if (k.addCapacity) addNews(g, 'club', `${c.name} open new stand: capacity now ${c.capacity.toLocaleString()}`, { clubId: c.id });
}

/** AI clubs invest when rich and ambitious. Runs monthly. */
export function aiInvestment(g: Game): void {
  for (const c of Object.values(g.clubs)) {
    const e = c.econ!;
    if (c.id === g.meta.userClubId || e.construction || c.balance < 15_000_000) continue;
    const wealth = c.balance / Math.max(1, c.weeklyIncome * 52);
    if (wealth < 0.5 || !chance(0.05 + e.ambition * 0.004)) continue;
    const opts: BuildSpec[] = [];
    if (c.capacity + 5000 <= e.maxCapacity && c.reputation >= 40) opts.push({ kind: 'stand', seats: c.capacity < 20000 ? 2000 : 5000 });
    for (const f of ['training', 'youth', 'medical', 'scouting'] as const) if (facilityLevel(c, f) < (e.profile === 'youth' && f === 'youth' ? 5 : 4)) opts.push({ kind: 'facility', facility: f });
    if (opts.length && c.balance > 2.5 * 1_500_000) {
      const choice = e.profile === 'youth' ? (opts.find((o) => o.kind === 'facility' && o.facility === 'youth') ?? pick(opts)) : pick(opts);
      if (choice.kind === 'stand' && c.balance < standCost(c, choice.seats) * 2.5) continue;
      startConstruction(g, c.id, choice);
    }
  }
}

// ---------- Monthly: brand, sanctions ----------
export function econMonthly(g: Game): void {
  for (const c of Object.values(g.clubs)) {
    const e = c.econ!;
    const lid = leagueIdOf(g, c.id);
    const table = computeTable(g, lid);
    const row = table.find((r) => r.clubId === c.id);
    const pos = table.indexOf(row!) + 1;
    const exp = repRankIn(g, c.id);
    if (row && row.played >= 4) e.merchIndex = clamp(e.merchIndex + (exp - pos) * 0.12 + (pos <= 3 ? 0.3 : 0) - 0.1, 3, 99);
    else e.merchIndex = clamp(e.merchIndex - 0.05, 3, 99);
    const star = Math.max(0, ...Object.values(g.players).filter((p) => p.clubId === c.id && !p.academy).map((p) => p.ovr));
    e.merchIndex = clamp(e.merchIndex + (star >= 85 ? 0.25 : 0), 3, 99);
    // Sanctions: deep debt
    const annual = incomeWeekly(c).total * 52;
    const lg = g.leagues[lid];
    if (lg && c.balance < -annual * 0.6 && e.penaltySeason !== g.meta.season) {
      e.penaltySeason = g.meta.season;
      (lg.penalties ??= {})[c.id] = (lg.penalties[c.id] ?? 0) + 6;
      c.transferBudget = Math.min(0, c.transferBudget);
      addNews(g, 'finance', `${c.name} docked 6 points for financial breaches`, { clubId: c.id, imp: 2, body: `Debts of ${fmtMoney(-c.balance)} breached league rules.` });
      if (c.id === g.meta.userClubId) { g.board.confidence = Math.max(0, g.board.confidence - 12); addMessage(g, { category: 'Board', from: 'Chairman', important: true, subject: 'Points deduction', body: `The league has docked us 6 points because our debts reached ${fmtMoney(-c.balance)}. The board is furious.`, action: { kind: 'goto', screen: 'finances' } }); }
    } else if (c.balance < -annual * 0.25 && c.id !== g.meta.userClubId && chance(0.15)) addNews(g, 'finance', `${c.name} face financial trouble`, { clubId: c.id, body: `Reported debts: ${fmtMoney(-c.balance)}.` });
    if (c.id === g.meta.userClubId && c.balance < 0 && !g.messages.some((m) => m.category === 'Finances' && m.subject.startsWith('Overdraft') && (m.date ?? 0) > addDays(gameNow(g), -50))) {
      addMessage(g, { category: 'Finances', from: 'Finance Director', important: true, subject: 'Overdraft interest', body: `The club is ${fmtMoney(-c.balance)} overdrawn at ${Math.round(e.interestRate * 100)}% interest (${fmtMoney(Math.round((-c.balance * e.interestRate) / 52))} per week). Transfers are frozen and the board is concerned. Sell players or cut costs.`, action: { kind: 'goto', screen: 'finances' } });
    }
  }
  aiInvestment(g);
}

// ---------- Rollover: new sponsor and TV deals ----------
export function econRollover(g: Game): void {
  const now = gameNow(g);
  for (const c of Object.values(g.clubs)) {
    const e = c.econ!;
    const lg = g.leagues[c.leagueId ?? 'L1'];
    const tier = lg?.tier ?? 1;
    if (tier !== e.tier) {
      const ratio = (TIER_TV[tier] ?? 1) / (TIER_TV[e.tier] ?? 1);
      e.tvBase = Math.round(e.tvBase * ratio); e.sponsorBase = Math.round(e.sponsorBase * (0.5 + ratio / 2));
      e.merchBase = Math.round(e.merchBase * (0.7 + ratio * 0.3));
      if (tier < e.tier) c.reputation = clamp(c.reputation, 1, 99);
      e.tier = tier;
    }
    // TV merit payment by position
    const table = lg ? computeTable(g, lg.id) : [];
    const pos = Math.max(1, table.findIndex((r) => r.clubId === c.id) + 1);
    const n = Math.max(2, table.length);
    e.tvDeal = Math.round(e.tvBase * (1.2 - 0.4 * ((pos - 1) / (n - 1))));
    // Sponsors renew when expired
    for (const key of ['sponsor', 'kitDeal'] as const) {
      const d = e[key];
      if (d.end > now) continue;
      const success = pos <= 3 ? 1.12 : pos <= n / 2 ? 1.03 : pos >= n - 3 ? 0.9 : 0.97;
      const base = key === 'sponsor' ? e.sponsorBase : Math.round(e.sponsorBase * 0.45);
      const old = d.weekly;
      d.weekly = Math.round((base * success * (0.97 + Math.random() * 0.1) * (0.85 + c.reputation / 300)) / 100) * 100;
      d.end = utc(seasonOf(now) + randInt(1, 3), 5, 30);
      d.name = key === 'sponsor' ? pick(SPONSORS) : pick(KITS);
      if (c.id === g.meta.userClubId) addMessage(g, { category: 'Finances', from: 'Commercial Director', subject: `New ${key === 'sponsor' ? 'sponsorship' : 'kit'} deal: ${d.name}`, body: `We have agreed a new deal with ${d.name} worth ${fmtMoney(d.weekly)} per week until ${fmtDate(d.end)} (previously ${fmtMoney(old)}).`, action: { kind: 'goto', screen: 'finances' } });
    }
    // Merchandise index drifts back, title winners get a boost
    if (pos === 1) e.merchIndex = clamp(e.merchIndex + 4, 3, 99);
    e.penaltySeason = e.penaltySeason === g.meta.season ? e.penaltySeason : e.penaltySeason;
    e.rev = { matchday: 0, tickets: 0, sponsor: 0, merch: 0, tv: 0, prize: 0, other: 0 }; e.exp = { wages: 0, staff: 0, stadium: 0, interest: 0, transfers: 0, bonuses: 0 };
  }
}

// ---------- Projection ----------
export interface Projection { weeks: number; start: number; end: number; points: { date: number; balance: number }[]; income: number; costs: number; gate: number; notes: string[] }
export function projection(g: Game, clubId: string, weeks = 26): Projection {
  const c = g.clubs[clubId]; const e = c.econ!;
  const inc = incomeWeekly(c), cost = costsWeekly(g, c);
  const now = gameNow(g);
  const horizon = addDays(now, weeks * 7);
  const home = g.fixtures.filter((f) => !f.played && f.home === clubId && (f.date ?? 0) <= horizon);
  const avgGate = home.length ? home.reduce((s, f) => s + gateFor(g, f).gate, 0) / home.length : 0;
  const notes: string[] = [];
  let bal = c.balance;
  const points: Projection['points'] = [{ date: now, balance: bal }];
  let income = 0, costs = 0, gate = 0;
  const inst = g.installments.filter((i) => i.toClubId !== clubId && i.fromClubId === clubId || i.toClubId === clubId);
  for (let w = 1; w <= weeks; w++) {
    const d = addDays(now, w * 7);
    let delta = inc.total - cost.wages - cost.staff - cost.stadium;
    income += inc.total; costs += cost.wages + cost.staff + cost.stadium;
    for (const f of home) if ((f.date ?? 0) > addDays(now, (w - 1) * 7) && (f.date ?? 0) <= d) { delta += avgGate; gate += avgGate; }
    if (e.construction && d <= e.construction.ready) { const wk = Math.max(1, Math.round((e.construction.ready - e.construction.start) / (7 * 86400000))); delta -= Math.round((e.construction.cost * 0.6) / wk); }
    for (const i of inst) if (i.date > addDays(now, (w - 1) * 7) && i.date <= d) delta += i.toClubId === clubId ? i.amount : -i.amount;
    const p = parts(d), pp = parts(addDays(d, -7));
    if ((p.m === 7 && p.d <= 7 && pp.m !== 7) || (p.m === 7 && p.d >= 1 && pp.m === 6)) { const st = Math.round(c.capacity * 0.45) * e.seasonTicketPrice; delta += st; income += st; notes.push(`Season ticket sales around ${fmtDateShort(d)}`); }
    if (bal < 0) delta -= Math.round((-bal * e.interestRate) / 52);
    bal += delta;
    if (w % 2 === 0 || w === weeks) points.push({ date: d, balance: Math.round(bal) });
  }
  if (e.construction) notes.push(`Construction payments for ${e.construction.label}`);
  if (inst.length) notes.push('Transfer instalments included');
  if (bal < 0) notes.push('Projected to end in debt: expect interest, a transfer freeze and board anger.');
  return { weeks, start: c.balance, end: Math.round(bal), points, income, costs, gate, notes };
}
void dayDiff;
