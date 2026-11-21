import type { ContractBonuses, Club, Game, Player, Pos, SquadRole } from './types';
import { MAX_SQUAD, MIN_SQUAD, invalidateIndex, repairLineup, squadOf, wageBill } from './team';
import { fmtMoney, repNeeded, valueOf, wageFor } from './valuation';
import { hash01, chance } from './rng';
import { addMessage, addTx, gameNow } from './messages';
import { addDays, contractEndFor, contractYearsLeft, daysToDeadline, isWindowOpen as winOpen, seasonOf, windowLabel as winLabel } from './calendar';
import { clubRecords } from './history';

// ---------- Transfer windows (date based; see calendar.ts) ----------
export const isWindowOpen = (t: number): boolean => winOpen(t);
export const windowLabel = (t: number): string => winLabel(t);
export { daysToDeadline };

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const SQUAD_NEED: Record<Pos, number> = { GK: 2, DF: 6, MF: 6, FW: 4 };
const STARTERS: Record<Pos, number> = { GK: 1, DF: 4, MF: 3, FW: 3 };

export const ownerOf = (p: Player): string | null => p.parentClubId ?? p.clubId;
export const maxYears = (p: Player): number => (p.age >= 33 ? 1 : p.age >= 31 ? 2 : 5);

export const ROLE_LABEL: Record<SquadRole, string> = { key: 'Key player', first: 'First team', rotation: 'Rotation', prospect: 'Prospect' };

// ---------- Prices ----------
export function askingPrice(g: Game, p: Player): number {
  if (!p.clubId) return 0;
  const owner = ownerOf(p)!;
  const sq = squadOf(g, owner).filter((x) => !x.parentClubId || x.parentClubId === owner).sort((a, b) => b.ovr - a.ovr);
  const rank = Math.max(0, sq.findIndex((x) => x.id === p.id));
  let f = 0.98 + 0.3 * hash01(p.id);
  if (rank < 8) f *= 1.2; else if (rank >= 16) f *= 0.85;
  if (p.age >= 31) f *= 0.85;
  if (p.contractYears <= 1) f *= 0.85;
  if (p.listed) f *= 0.9;
  if ((p.personality?.loyalty ?? 0) >= 17 && !p.listed) f *= 1.08; // loyal players are harder to prise away
  return Math.max(50000, roundTo(p.value * f * pressPriceFactor(g, p.id), 50000));
}

export const loanFeeFor = (p: Player): number => roundTo(p.value * 0.06, 25000);

export function contractDemand(p: Player, club: Club | null, role?: SquadRole): number {
  let f = 0.95 + 0.1 * hash01(p.id + 'w');
  if (p.morale < 50) f += 0.08;
  if (club) {
    if (club.reputation < repNeeded(p) - 10) f += 0.12;
    else if (club.reputation > repNeeded(p) + 15) f -= 0.05;
  }
  if (role === 'key') f += 0.1; else if (role === 'rotation') f -= 0.05; else if (role === 'prospect') f -= 0.1;
  if ((p.personality?.ambition ?? 10) >= 16) f += 0.04;
  return Math.max(1000, roundTo(wageFor(p.ovr, p.age) * f, 100));
}

export const agentFeeFor = (p: Player, wage: number, years: number): number =>
  roundTo(wage * 52 * Math.min(years, 3) * (0.02 + (p.agent?.greed ?? 0.4) * 0.06), 5000);

// What an AI club would pay for a player.
export function aiValuation(g: Game, buyer: Club, p: Player): number {
  const grp = squadOf(g, buyer.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const starterLevel = grp[STARTERS[p.pos] - 1]?.ovr ?? 0;
  const need = p.ovr - starterLevel;
  let f = need > 3 ? 1.25 : need > 0 ? 1.1 : need > -4 ? 0.9 : 0.6;
  if (grp.length < SQUAD_NEED[p.pos]) f *= 1.15;
  return Math.max(50000, roundTo(p.value * f * (0.95 + 0.1 * hash01(buyer.id + p.id)), 50000));
}

// ---------- Player preferences ----------
export function bestRoleAt(g: Game, p: Player, buyer: Club): SquadRole {
  const grp = squadOf(g, buyer.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const starter = grp[STARTERS[p.pos] - 1]?.ovr ?? 0;
  const best = grp[0]?.ovr ?? 0;
  if (p.ovr >= best) return 'key';
  if (p.ovr >= starter) return 'first';
  if (p.age <= 21 && p.pot - p.ovr >= 10) return 'prospect';
  return 'rotation';
}
const ROLE_RANK: Record<SquadRole, number> = { prospect: 0, rotation: 1, first: 2, key: 3 };

/** Reasons a player would refuse to join. Empty = willing. */
export function playerRefusals(g: Game, p: Player, buyer: Club, role: SquadRole): string[] {
  const out: string[] = [];
  const cur = p.clubId ? g.clubs[p.clubId] : null;
  const amb = p.personality?.ambition ?? 10;
  if (cur && amb >= 14 && buyer.reputation < cur.reputation - 10) out.push(`${p.name} is ambitious and does not see ${buyer.name} as a step forward.`);
  const real = bestRoleAt(g, p, buyer);
  if (ROLE_RANK[role] > ROLE_RANK[real] + 1) out.push(`${p.name} does not believe he will be a ${ROLE_LABEL[role].toLowerCase()} at ${buyer.name}.`);
  if (amb >= 12 && p.age >= 23 && real === 'rotation' && role === 'rotation') out.push(`${p.name} wants regular football and is not convinced at ${buyer.name}.`);
  return out;
}

export interface RivalInterest { clubId: string; strength: number }
export function rivalsFor(g: Game, p: Player, buyer: Club): RivalInterest[] {
  if (!p.clubId) return [];
  const out: RivalInterest[] = [];
  const dateKey = String(Math.floor(gameNow(g) / (7 * 86400000)));
  for (const c of Object.values(g.clubs)) {
    if (c.id === buyer.id || c.id === p.clubId || c.id === g.meta.userClubId) continue;
    const grp = squadOf(g, c.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
    const starter = grp[STARTERS[p.pos] - 1]?.ovr ?? 0;
    if (p.ovr < starter + 2 || c.transferBudget < askingPrice(g, p) * 0.9) continue;
    if (hash01(c.id + p.id + dateKey) < 0.22) out.push({ clubId: c.id, strength: c.reputation });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}

// ---------- Validation ----------
export interface Deal {
  playerId: string;
  buyerId: string;
  fee: number;
  wage: number;
  years: number;
  kind: 'permanent' | 'loan';
  // Phase 2 terms
  instalments?: number; // 1 (default) .. 3 payments, one per year
  sellOn?: number; // percentage of future fee to the selling club (0..30)
  role?: SquadRole;
  loanOption?: { fee: number; obligatory: boolean };
  signingBonus?: number;
}

export function validateDeal(g: Game, d: Deal, ignoreWindow = false): string[] {
  const errs: string[] = [];
  const p = g.players[d.playerId];
  const buyer = g.clubs[d.buyerId];
  if (!p || !buyer) return ['Unknown player or club.'];
  if (!ignoreWindow && !isWindowOpen(gameNow(g))) errs.push('The transfer window is closed.');
  if (p.clubId === d.buyerId) errs.push('Player already belongs to this club.');
  if (p.parentClubId) errs.push('Players on loan cannot be traded.');
  if (p.academy) errs.push('Academy players are handled from the Academy screen.');
  if (d.fee < 0 || d.wage < 0) errs.push('Invalid amount.');
  const n = Math.max(1, d.instalments ?? 1);
  const first = d.kind === 'loan' ? d.fee : Math.round(d.fee / n);
  if (first > buyer.transferBudget) errs.push(`The ${n > 1 ? 'first payment' : 'fee'} exceeds the transfer budget (${fmtMoney(buyer.transferBudget)}).`);
  const bonus = (d.signingBonus ?? 0) + (d.kind === 'permanent' ? agentFeeFor(p, d.wage, d.years) : 0);
  if (first + bonus > buyer.balance) errs.push('Club balance is too low for this deal.');
  const wage = d.kind === 'loan' ? p.wage : d.wage;
  if (wageBill(g, buyer.id) + wage > buyer.wageBudget) errs.push(`Wages would exceed the wage budget (${fmtMoney(buyer.wageBudget)}/wk).`);
  if (squadOf(g, buyer.id).length >= MAX_SQUAD) errs.push(`Squad is full (${MAX_SQUAD} players).`);
  if (d.kind === 'permanent' && (d.years < 1 || d.years > maxYears(p))) errs.push(`Contract length must be 1-${maxYears(p)} years.`);
  if (p.clubId) {
    const sq = squadOf(g, p.clubId);
    if (sq.length <= MIN_SQUAD) errs.push('Selling club cannot reduce its squad further.');
    if (p.pos === 'GK' && sq.filter((x) => x.pos === 'GK').length <= 2) errs.push('Selling club needs to keep two goalkeepers.');
  } else if (d.fee !== 0) errs.push('Free agents cost no transfer fee.');
  return errs;
}

// ---------- Execution ----------
function dropFromSelections(club: Club, pid: string): void {
  club.lineup = club.lineup.map((id) => (id === pid ? '' : id));
  club.bench = club.bench.filter((id) => id !== pid);
  if (club.captainId === pid) club.captainId = '';
}

import { pressPriceFactor } from './media';
import { bonusExpected } from './social';
import { recordTransfer } from './records';
import { addNews } from './news';
export function executeDeal(g: Game, d: Deal): { ok: boolean; error?: string } {
  const errs = validateDeal(g, d);
  if (errs.length) return { ok: false, error: errs[0] };
  const p = g.players[d.playerId];
  const buyer = g.clubs[d.buyerId];
  const seller = p.clubId ? g.clubs[p.clubId] : null;
  const user = g.meta.userClubId;
  const loan = d.kind === 'loan';
  const now = gameNow(g);
  const n = Math.max(1, d.instalments ?? 1);
  const firstPay = loan ? d.fee : Math.round(d.fee / n);
  const agent = loan ? 0 : agentFeeFor(p, d.wage, d.years);
  const bonus = d.signingBonus ?? 0;

  buyer.balance -= firstPay + agent + bonus;
  buyer.transferBudget -= firstPay;
  if (seller) {
    seller.balance += firstPay;
    seller.transferBudget += Math.round(firstPay * 0.75);
    dropFromSelections(seller, p.id);
  }
  // Remaining instalments
  for (let i = 1; i < n; i++) {
    g.installments.push({
      id: `i${g.meta.nextId = (g.meta.nextId ?? 1) + 1}`, date: addDays(now, 365 * i), fromClubId: buyer.id, toClubId: seller?.id ?? null,
      amount: Math.round(d.fee / n), playerId: p.id, desc: `Instalment ${i + 1}/${n} for ${p.name}`,
    });
  }
  // Sell-on clause owed to a previous club
  const prior = p.sellOn;
  let sellOnPaid = 0;
  if (prior && !loan && prior.clubId !== buyer.id && g.clubs[prior.clubId] && d.fee > 0) {
    sellOnPaid = Math.round((d.fee * prior.pct) / 100);
    const sellerSide = seller;
    if (sellerSide) sellerSide.balance -= sellOnPaid;
    g.clubs[prior.clubId].balance += sellOnPaid;
    if (sellerSide?.id === user) addTx(g, user, 'transfer_out', -sellOnPaid, `Sell-on clause for ${p.name} paid to ${g.clubs[prior.clubId].name}`);
    if (prior.clubId === user) {
      addTx(g, user, 'transfer_out', sellOnPaid, `Sell-on income for ${p.name}`);
      addMessage(g, { category: 'Finances', from: 'Finance Director', subject: `Sell-on payment: ${fmtMoney(sellOnPaid)}`, body: `${p.name} moved to ${buyer.name} and our ${prior.pct}% sell-on clause pays ${fmtMoney(sellOnPaid)}.` });
    }
  }
  const label = loan ? 'Loan' : 'Transfer';
  if (buyer.id === user) {
    addTx(g, user, loan ? 'loan_in' : 'transfer_in', -firstPay, `${label} fee: ${p.name} from ${seller ? seller.name : 'free agents'}${n > 1 ? ` (1/${n})` : ''}`);
    if (agent) addTx(g, user, 'agent', -agent, `Agent fee: ${p.name} (${p.agent?.name ?? 'agent'})`);
    if (bonus) addTx(g, user, 'contract', -bonus, `Signing bonus: ${p.name}`);
  }
  if (seller && seller.id === user) addTx(g, user, loan ? 'loan_out' : 'transfer_out', firstPay, `${label} fee: ${p.name} to ${buyer.name}${n > 1 ? ` (1/${n})` : ''}`);

  const prevClub = p.clubId;
  if (loan) {
    p.parentClubId = seller!.id;
    p.loanOption = d.loanOption;
  } else {
    p.wage = d.wage || p.wage;
    p.contractEnd = contractEndFor(now, d.years);
    p.contractYears = d.years;
    p.value = valueOf(p.ovr, p.age, p.pot, p.contractYears);
    p.sellOn = d.sellOn && d.sellOn > 0 && seller ? { clubId: seller.id, pct: d.sellOn } : undefined;
    p.role = d.role;
    p.joined = now;
    p.wantsMove = false;
    p.releaseClause = undefined;
  }
  p.clubId = buyer.id;
  p.listed = false; p.loanListed = false;
  p.morale = Math.min(100, p.morale + 8);
  p.benchStreak = 0; p.promisedStart = false; p.recentMinutes = 0;
  invalidateIndex(g);

  if (!loan && d.fee > 0) recordTransfer(g, p.name, seller?.name ?? 'Free agent', buyer.name, d.fee, seasonOf(now));
  // Records for the user's club
  if (!loan && d.fee > 0) {
    if (buyer.id === user) { const r = clubRecords(g, user); if (!r.recordSigning || d.fee > r.recordSigning.fee) r.recordSigning = { name: p.name, fee: d.fee, season: seasonOf(now) }; }
    if (seller?.id === user) { const r = clubRecords(g, user); if (!r.recordSale || d.fee > r.recordSale.fee) r.recordSale = { name: p.name, fee: d.fee, season: seasonOf(now) }; }
  }
  if (buyer.id === user) g.board.netSpend += d.fee; // gross spend, net with sales below
  if (seller?.id === user) g.board.netSpend -= d.fee;

  if (buyer.id === user || seller?.id === user) {
    if (buyer.id === user) repairLineup(g, buyer);
    if (seller?.id === user) repairLineup(g, seller);
    const incoming = buyer.id === user;
    const extras = [n > 1 ? `Paid in ${n} instalments` : '', d.sellOn ? `${d.sellOn}% sell-on to ${seller?.name}` : '', agent ? `agent fee ${fmtMoney(agent)}` : '', d.loanOption ? `${d.loanOption.obligatory ? 'Obligation' : 'Option'} to buy for ${fmtMoney(d.loanOption.fee)}` : ''].filter(Boolean).join('. ');
    addMessage(g, {
      category: 'Transfers', from: 'Club Secretary', important: true,
      subject: incoming ? `${loan ? 'Loan' : 'Signing'} completed: ${p.name}` : `${loan ? 'Loan' : 'Sale'} completed: ${p.name}`,
      body: incoming
        ? `${p.name} (${p.pos}, ${p.ovr}) has joined ${buyer.name} ${loan ? `on loan from ${seller!.name}` : `from ${seller ? seller.name : 'the free agent list'}`}. Fee: ${fmtMoney(d.fee)}. Wage: ${fmtMoney(p.wage)}/wk${loan ? '' : `, contract until ${new Date(p.contractEnd!).getUTCFullYear()}`}.${extras ? `\n${extras}.` : ''}`
        : `${p.name} has ${loan ? 'joined' : 'been sold to'} ${buyer.name}${loan ? ' on loan' : ''}. We received ${fmtMoney(firstPay)}${n > 1 ? ` now (of ${fmtMoney(d.fee)})` : ''}. Our wage bill falls by ${fmtMoney(p.wage)}/wk.${extras ? `\n${extras}.` : ''}`,
      action: incoming ? { kind: 'goto', screen: 'squad', playerId: p.id } : undefined,
    });
  }
  if (d.fee >= 8_000_000 || (buyer.id === user || seller?.id === user)) addNews(g, 'transfer', `${p.name} ${loan ? 'joins' : 'signs for'} ${buyer.name}${loan ? ' on loan' : ''}${d.fee ? ` (${fmtMoney(d.fee)})` : ''}`, { playerId: p.id, clubId: buyer.id, imp: d.fee >= 40_000_000 ? 2 : 1 });
  if (!(buyer.id === user || seller?.id === user) && d.fee >= 15_000_000) {
    addMessage(g, {
      category: 'Transfers', from: 'Press Office',
      subject: `Transfer news: ${p.name} to ${buyer.name}`,
      body: `${buyer.name} have signed ${p.name} (${p.pos}, ${p.ovr}) from ${prevClub ? g.clubs[prevClub].name : 'free agency'} for ${fmtMoney(d.fee)}.`,
    });
  }
  return { ok: true };
}

/** Pay due instalments (called daily). */
export function processInstalments(g: Game): void {
  const now = gameNow(g);
  const rest = [];
  for (const i of g.installments) {
    if (i.date > now) { rest.push(i); continue; }
    const from = g.clubs[i.fromClubId];
    if (from) from.balance -= i.amount;
    if (i.toClubId && g.clubs[i.toClubId]) { g.clubs[i.toClubId].balance += i.amount; }
    if (i.fromClubId === g.meta.userClubId) addTx(g, i.fromClubId, 'installment', -i.amount, i.desc);
    if (i.toClubId === g.meta.userClubId) addTx(g, i.toClubId, 'installment', i.amount, i.desc);
  }
  g.installments = rest;
}

// ---------- Negotiation (user buying) ----------
export type Status = 'accepted' | 'countered' | 'rejected' | 'n/a';
export interface BidResult {
  errors: string[];
  feeStatus: Status;
  counterFee?: number;
  wageStatus: Status;
  counterWage?: number;
  message: string;
  done: boolean;
  refusals?: string[];
  rivals?: RivalInterest[];
  lostToRival?: string;
  agentFee?: number;
  askingPrice?: number;
  clauseTriggered?: boolean;
}

/** Fee the selling club requires once the structure of the bid (instalments, sell-on) is taken into account. */
export function requiredFee(g: Game, p: Player, d: Deal): number {
  const ask = d.kind === 'loan' ? loanFeeFor(p) : askingPrice(g, p);
  if (d.kind === 'loan') return ask;
  let f = ask;
  const n = Math.max(1, d.instalments ?? 1);
  f *= 1 + (n - 1) * 0.04; // instalments cost the seller (risk)
  f *= 1 - Math.min(30, d.sellOn ?? 0) * 0.008;
  if (g.players[d.playerId].listed) f *= 0.95;
  return roundTo(f, 25000);
}

export function negotiateBid(g: Game, d: Deal): BidResult {
  const p = g.players[d.playerId];
  const buyer = g.clubs[d.buyerId];
  const res: BidResult = { errors: [], feeStatus: 'n/a', wageStatus: 'n/a', message: '', done: false };
  if (!p || !buyer) { res.errors = ['Unknown player or club.']; return res; }
  res.errors = validateDeal(g, d);
  if (res.errors.length) { res.message = res.errors[0]; return res; }
  const role = d.role ?? bestRoleAt(g, p, buyer);
  d.role = role;
  if (d.kind === 'permanent') res.agentFee = agentFeeFor(p, d.wage, d.years);
  res.rivals = rivalsFor(g, p, buyer);

  // Release clause: pay it and the club cannot refuse.
  const clause = p.releaseClause && d.kind === 'permanent' && d.fee >= p.releaseClause;
  res.clauseTriggered = !!clause;

  // Fee
  if (p.clubId) {
    const seller = g.clubs[p.clubId];
    const ask = requiredFee(g, p, d) * (res.rivals.length ? 1.05 : 1);
    res.askingPrice = ask;
    if (d.kind === 'loan') {
      const rank = squadOf(g, seller.id).sort((a, b) => b.ovr - a.ovr).findIndex((x) => x.id === p.id);
      if (rank < 12) { res.feeStatus = 'rejected'; res.message = `${seller.name} will not loan out a key player.`; return res; }
    }
    if (clause || d.fee >= ask) res.feeStatus = 'accepted';
    else if (d.fee >= ask * 0.9) { res.feeStatus = 'countered'; res.counterFee = Math.max(d.fee, roundTo((d.fee + ask) / 2, 25000)); }
    else if (d.fee >= ask * 0.7) { res.feeStatus = 'countered'; res.counterFee = roundTo(ask * 0.97, 25000); }
    else { res.feeStatus = 'rejected'; res.message = `${seller.name} rejected the bid outright - it is far below their valuation.`; }
  } else res.feeStatus = 'accepted';

  // Personal terms
  if (d.kind === 'permanent') {
    const demand = contractDemand(p, buyer, role);
    res.refusals = playerRefusals(g, p, buyer, role);
    if (res.refusals.length) { res.wageStatus = 'rejected'; }
    else if (d.wage >= demand) res.wageStatus = 'accepted';
    else if (d.wage >= demand * 0.9) { res.wageStatus = 'countered'; res.counterWage = demand; }
    else res.wageStatus = 'rejected';
  } else res.wageStatus = 'accepted';

  if (res.feeStatus === 'accepted' && res.wageStatus === 'accepted') {
    const ex = executeDeal(g, d);
    if (ex.ok) { res.done = true; res.message = `Deal agreed! ${p.name} is now a ${buyer.name} player.`; }
    else { res.errors = [ex.error!]; res.message = ex.error!; }
    return res;
  }
  // Competition: while talks drag on, a rival may complete the deal.
  if (res.rivals.length && res.feeStatus !== 'rejected' && chance(0.18)) {
    const rv = g.clubs[res.rivals[0].clubId];
    const ask = askingPrice(g, p);
    const ex = executeDeal(g, { playerId: p.id, buyerId: rv.id, fee: ask, wage: contractDemand(p, rv), years: Math.min(maxYears(p), 4), kind: 'permanent' });
    if (ex.ok) {
      res.lostToRival = rv.name; res.done = true;
      res.message = `${rv.name} stepped in and completed the signing of ${p.name} while talks continued.`;
      return res;
    }
  }
  const parts: string[] = [];
  if (res.feeStatus === 'countered') parts.push(`${g.clubs[p.clubId!].name} want ${fmtMoney(res.counterFee!)}.`);
  if (res.feeStatus === 'accepted' && p.clubId) parts.push(clause ? 'Release clause triggered - the club cannot refuse.' : 'The club accepts your fee.');
  if (res.refusals?.length) parts.push(res.refusals[0]);
  else if (res.wageStatus === 'countered') parts.push(`${p.name} wants ${fmtMoney(res.counterWage!)}/wk.`);
  else if (res.wageStatus === 'rejected') parts.push(`${p.name} rejected the contract - the wage is too low.`);
  if (res.rivals.length) parts.push(`Interest from ${res.rivals.length} other club${res.rivals.length > 1 ? 's' : ''} is pushing the price up.`);
  res.message = res.message || parts.join(' ');
  return res;
}

// ---------- Selling (user offering a player to an AI club) ----------
export interface SaleInterest { clubId: string; estimate: number }

export function interestedClubs(g: Game, p: Player): SaleInterest[] {
  const out: SaleInterest[] = [];
  Object.values(g.clubs).forEach((c) => {
    if (c.id === g.meta.userClubId) return;
    const est = aiValuation(g, c, p);
    const errs = validateDeal(g, { playerId: p.id, buyerId: c.id, fee: est, wage: p.wage, years: Math.max(2, p.contractYears), kind: 'permanent' });
    if (errs.length) return;
    if (est >= p.value * 0.85) out.push({ clubId: c.id, estimate: est });
  });
  return out.sort((a, b) => b.estimate - a.estimate).slice(0, 8);
}

export interface SaleResult { status: Status; counterFee?: number; message: string; done: boolean }

export function proposeSale(g: Game, playerId: string, buyerId: string, fee: number, kind: 'permanent' | 'loan' = 'permanent', terms?: { instalments?: number; sellOn?: number; loanOption?: { fee: number; obligatory: boolean } }): SaleResult {
  const p = g.players[playerId];
  const buyer = g.clubs[buyerId];
  if (!p || !buyer || p.clubId !== g.meta.userClubId) return { status: 'rejected', message: 'Invalid sale.', done: false };
  const deal: Deal = { playerId, buyerId, fee, wage: p.wage, years: Math.max(2, Math.min(p.contractYears + 1, maxYears(p))), kind, ...terms };
  const errs = validateDeal(g, deal);
  if (errs.length) {
    const own = errs.find((e) => e.includes('Selling club') || e.includes('window') || e.includes('loan'));
    return { status: 'rejected', message: own ? own.replace('Selling club', 'You') : `${buyer.name} cannot complete this deal: ${errs[0]}`, done: false };
  }
  if (kind === 'loan') {
    const want = loanFeeFor(p);
    if (fee > want * 1.3) return { status: 'rejected', message: `${buyer.name} will not pay that loan fee.`, done: false };
    const ex = executeDeal(g, deal);
    return ex.ok ? { status: 'accepted', message: `${p.name} has joined ${buyer.name} on loan.`, done: true } : { status: 'rejected', message: ex.error!, done: false };
  }
  // The buyer values instalments and sell-on terms as a discount to them
  const willing = aiValuation(g, buyer, p) * (1 + (deal.instalments && deal.instalments > 1 ? 0.03 * (deal.instalments - 1) : 0)) * (1 + Math.min(30, deal.sellOn ?? 0) * 0.006) * (1 - Math.min(30, deal.sellOn ?? 0) * 0.002);
  if (fee <= willing) {
    const ex = executeDeal(g, deal);
    return ex.ok ? { status: 'accepted', message: `${buyer.name} accepted. ${p.name} has been sold for ${fmtMoney(fee)}.`, done: true } : { status: 'rejected', message: ex.error!, done: false };
  }
  if (fee <= willing * 1.25) {
    const c = Math.max(50000, roundTo((fee + willing) / 2, 25000));
    return { status: 'countered', counterFee: Math.min(c, roundTo(willing, 25000)), message: `${buyer.name} counter with ${fmtMoney(Math.min(c, roundTo(willing, 25000)))}.`, done: false };
  }
  return { status: 'rejected', message: `${buyer.name} rejected your asking price.`, done: false };
}

// ---------- Contract renewals ----------
export interface RenewOpts { role?: SquadRole; releaseClause?: number | null; bonuses?: ContractBonuses }
export function negotiateRenewal(g: Game, playerId: string, wage: number, years: number, opts: RenewOpts = {}): { status: Status; counterWage?: number; message: string; done: boolean } {
  const p = g.players[playerId];
  const club = p?.clubId ? g.clubs[p.clubId] : null;
  if (!p || !club) return { status: 'rejected', message: 'Invalid player.', done: false };
  if (p.parentClubId) return { status: 'rejected', message: 'Loan players cannot be renewed.', done: false };
  if (years < 1 || years > maxYears(p)) return { status: 'rejected', message: `Contract length must be 1-${maxYears(p)} years.`, done: false };
  if (wageBill(g, club.id) - p.wage + wage > club.wageBudget) return { status: 'rejected', message: 'This wage would exceed the club wage budget.', done: false };
  let demand = contractDemand(p, club, opts.role);
  if (opts.releaseClause) demand *= 0.97; // a release clause makes the player slightly more willing
  if ((p.personality?.loyalty ?? 0) >= 15) demand *= 0.96;
  if (p.wantsMove) demand *= 1.2;
  demand = roundTo(demand, 100);
  const agent = agentFeeFor(p, wage, years) * 0.5;
  const bonusValue = opts.bonuses ? bonusExpected(opts.bonuses, p) * 0.6 + (opts.bonuses.wageRise ? wage * opts.bonuses.wageRise * 0.004 : 0) : 0;
  if (wage + bonusValue >= demand) {
    if (agent > club.balance) return { status: 'rejected', message: 'The club cannot afford the agent fee.', done: false };
    const now = gameNow(g);
    p.wage = wage; p.contractYears = years; p.contractEnd = contractEndFor(now, years);
    p.value = valueOf(p.ovr, p.age, p.pot, years);
    p.morale = Math.min(100, p.morale + 6);
    p.wantsMove = false;
    if (opts.role) p.role = opts.role;
    if (opts.bonuses) p.bonuses = opts.bonuses;
    if (opts.releaseClause !== undefined) p.releaseClause = opts.releaseClause ?? undefined;
    club.balance -= agent;
    if (club.id === g.meta.userClubId) {
      addTx(g, club.id, 'contract', 0, `Contract renewal: ${p.name} - ${fmtMoney(wage)}/wk, ${years}y`);
      if (agent) addTx(g, club.id, 'agent', -agent, `Agent fee (renewal): ${p.name}`);
      addMessage(g, { category: 'Contracts', from: 'Club Secretary', subject: `${p.name} signs new contract`, body: `${p.name} has agreed a new ${years}-year deal worth ${fmtMoney(wage)} per week.${p.releaseClause ? ` Release clause: ${fmtMoney(p.releaseClause)}.` : ''}` });
    }
    return { status: 'accepted', message: `${p.name} signed a ${years}-year contract.`, done: true };
  }
  if (wage >= demand * 0.9) return { status: 'countered', counterWage: demand, message: `${p.name} wants ${fmtMoney(demand)}/wk.`, done: false };
  return { status: 'rejected', message: `${p.name} rejected the offer - far too low.`, done: false };
}

export function setListed(g: Game, pid: string, listed: boolean, loan = false): void {
  const p = g.players[pid];
  if (!p || p.clubId !== g.meta.userClubId) return;
  if (loan) p.loanListed = listed; else p.listed = listed;
}

/** Convert a loan into a permanent move using the loan option. */
export function activateLoanOption(g: Game, playerId: string, wageOverride?: number): { ok: boolean; message: string } {
  const p = g.players[playerId];
  if (!p || !p.parentClubId || !p.loanOption) return { ok: false, message: 'No purchase option on this player.' };
  const buyer = g.clubs[p.clubId!];
  const owner = g.clubs[p.parentClubId];
  const fee = p.loanOption.fee;
  const wage = wageOverride ?? Math.max(p.wage, contractDemand(p, buyer));
  const years = Math.min(maxYears(p), 3);
  const errs: string[] = [];
  if (fee > buyer.transferBudget) errs.push(`Fee exceeds transfer budget (${fmtMoney(buyer.transferBudget)}).`);
  if (fee > buyer.balance) errs.push('Club balance is too low.');
  if (wageBill(g, buyer.id) - p.wage + wage > buyer.wageBudget) errs.push('Wages would exceed the wage budget.');
  if (errs.length) return { ok: false, message: errs[0] };
  buyer.balance -= fee; buyer.transferBudget -= fee;
  owner.balance += fee; owner.transferBudget += Math.round(fee * 0.75);
  if (buyer.id === g.meta.userClubId) { addTx(g, buyer.id, 'transfer_in', -fee, `Loan option exercised: ${p.name}`); g.board.netSpend += fee; }
  if (owner.id === g.meta.userClubId) { addTx(g, owner.id, 'transfer_out', fee, `Loan option exercised by ${buyer.name}: ${p.name}`); g.board.netSpend -= fee; }
  const now = gameNow(g);
  p.parentClubId = undefined; p.loanOption = undefined;
  p.wage = wage; p.contractYears = years; p.contractEnd = contractEndFor(now, years);
  p.value = valueOf(p.ovr, p.age, p.pot, years); p.joined = now;
  invalidateIndex(g);
  if (buyer.id === g.meta.userClubId || owner.id === g.meta.userClubId) {
    addMessage(g, { category: 'Transfers', from: 'Club Secretary', important: true, subject: `Loan-to-buy completed: ${p.name}`, body: `${p.name}'s move to ${buyer.name} has been made permanent for ${fmtMoney(fee)}.` });
  }
  return { ok: true, message: `${p.name} signed permanently for ${fmtMoney(fee)}.` };
}

export { contractYearsLeft };
