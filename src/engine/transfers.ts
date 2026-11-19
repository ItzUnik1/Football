import type { Club, Game, Player, Pos } from './types';
import { MAX_SQUAD, MIN_SQUAD, repairLineup, squadOf, wageBill } from './team';
import { fmtMoney, repNeeded, valueOf, wageFor } from './valuation';
import { hash01 } from './rng';
import { addMessage, addTx } from './messages';

// ---------- Transfer windows ----------
export const WINDOWS = [
  { from: 1, to: 5, name: 'Summer window' },
  { from: 19, to: 23, name: 'January window' },
];
export const isWindowOpen = (week: number): boolean => WINDOWS.some((w) => week >= w.from && week <= w.to);
export function windowLabel(week: number): string {
  const cur = WINDOWS.find((w) => week >= w.from && week <= w.to);
  if (cur) return `${cur.name} open - closes after matchday ${cur.to}`;
  const next = WINDOWS.find((w) => w.from > week);
  return next ? `Window closed - ${next.name.toLowerCase()} opens at matchday ${next.from}` : 'Window closed for the season';
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const SQUAD_NEED: Record<Pos, number> = { GK: 2, DF: 6, MF: 6, FW: 4 };
const STARTERS: Record<Pos, number> = { GK: 1, DF: 4, MF: 3, FW: 3 };

export const ownerOf = (p: Player): string | null => p.parentClubId ?? p.clubId;
export const maxYears = (p: Player): number => (p.age >= 33 ? 1 : p.age >= 31 ? 2 : 5);

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
  return Math.max(50000, roundTo(p.value * f, 50000));
}

export const loanFeeFor = (p: Player): number => roundTo(p.value * 0.06, 25000);

export function contractDemand(p: Player, club: Club | null): number {
  let f = 0.95 + 0.1 * hash01(p.id + 'w');
  if (p.morale < 50) f += 0.08;
  if (club) {
    if (club.reputation < repNeeded(p) - 10) f += 0.12;
    else if (club.reputation > repNeeded(p) + 15) f -= 0.05;
  }
  return Math.max(1000, roundTo(wageFor(p.ovr, p.age) * f, 100));
}

// What an AI club would pay for a player (never revealed as a hard rule to the UI).
export function aiValuation(g: Game, buyer: Club, p: Player): number {
  const grp = squadOf(g, buyer.id).filter((x) => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const starterLevel = grp[STARTERS[p.pos] - 1]?.ovr ?? 0;
  const need = p.ovr - starterLevel;
  let f = need > 3 ? 1.25 : need > 0 ? 1.1 : need > -4 ? 0.9 : 0.6;
  if (grp.length < SQUAD_NEED[p.pos]) f *= 1.15;
  return Math.max(50000, roundTo(p.value * f * (0.95 + 0.1 * hash01(buyer.id + p.id)), 50000));
}

// ---------- Validation ----------
export interface Deal {
  playerId: string;
  buyerId: string;
  fee: number;
  wage: number;
  years: number;
  kind: 'permanent' | 'loan';
}

export function validateDeal(g: Game, d: Deal, ignoreWindow = false): string[] {
  const errs: string[] = [];
  const p = g.players[d.playerId];
  const buyer = g.clubs[d.buyerId];
  if (!p || !buyer) return ['Unknown player or club.'];
  if (!ignoreWindow && !isWindowOpen(g.meta.week)) errs.push('The transfer window is closed.');
  if (p.clubId === d.buyerId) errs.push('Player already belongs to this club.');
  if (p.parentClubId) errs.push('Players on loan cannot be traded.');
  if (d.fee < 0 || d.wage < 0) errs.push('Invalid amount.');
  if (d.fee > buyer.transferBudget) errs.push(`Fee exceeds transfer budget (${fmtMoney(buyer.transferBudget)}).`);
  if (d.fee > buyer.balance) errs.push('Club balance is too low for this fee.');
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

export function executeDeal(g: Game, d: Deal): { ok: boolean; error?: string } {
  const errs = validateDeal(g, d);
  if (errs.length) return { ok: false, error: errs[0] };
  const p = g.players[d.playerId];
  const buyer = g.clubs[d.buyerId];
  const seller = p.clubId ? g.clubs[p.clubId] : null;
  const user = g.meta.userClubId;
  const loan = d.kind === 'loan';

  buyer.balance -= d.fee;
  buyer.transferBudget -= d.fee;
  if (seller) {
    seller.balance += d.fee;
    seller.transferBudget += Math.round(d.fee * 0.75);
    dropFromSelections(seller, p.id);
  }
  const label = loan ? 'Loan' : 'Transfer';
  if (buyer.id === user) addTx(g, user, loan ? 'loan_in' : 'transfer_in', -d.fee, `${label} fee: ${p.name} from ${seller ? seller.name : 'free agents'}`);
  if (seller && seller.id === user) addTx(g, user, loan ? 'loan_out' : 'transfer_out', d.fee, `${label} fee: ${p.name} to ${buyer.name}`);

  if (loan) {
    p.parentClubId = seller!.id;
  } else {
    p.wage = d.wage || p.wage;
    p.contractYears = d.years;
    p.value = valueOf(p.ovr, p.age, p.pot, p.contractYears);
  }
  p.clubId = buyer.id;
  p.listed = false; p.loanListed = false;
  p.morale = Math.min(100, p.morale + 8);
  p.benchStreak = 0; p.promisedStart = false;

  if (buyer.id === user || seller?.id === user) {
    if (buyer.id === user) repairLineup(g, buyer);
    if (seller?.id === user) repairLineup(g, seller);
    const incoming = buyer.id === user;
    addMessage(g, {
      category: 'Transfers', from: 'Club Secretary', important: true,
      subject: incoming ? `${loan ? 'Loan' : 'Signing'} completed: ${p.name}` : `${loan ? 'Loan' : 'Sale'} completed: ${p.name}`,
      body: incoming
        ? `${p.name} (${p.pos}, ${p.ovr}) has joined ${buyer.name} ${loan ? `on loan from ${seller!.name}` : `from ${seller ? seller.name : 'the free agent list'}`}. Fee: ${fmtMoney(d.fee)}. Wage: ${fmtMoney(p.wage)}/wk${loan ? '' : `, contract: ${d.years} year(s)`}.`
        : `${p.name} has ${loan ? 'joined' : 'been sold to'} ${buyer.name}${loan ? ' on loan' : ''}. We received ${fmtMoney(d.fee)}. Our wage bill falls by ${fmtMoney(p.wage)}/wk.`,
      action: incoming ? { kind: 'goto', screen: 'squad', playerId: p.id } : undefined,
    });
  } else if (d.fee >= 15_000_000) {
    addMessage(g, {
      category: 'Transfers', from: 'Press Office',
      subject: `Transfer news: ${p.name} to ${buyer.name}`,
      body: `${buyer.name} have signed ${p.name} (${p.pos}, ${p.ovr}) from ${seller ? seller.name : 'free agency'} for ${fmtMoney(d.fee)}.`,
    });
  }
  return { ok: true };
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
}

export function negotiateBid(g: Game, d: Deal): BidResult {
  const p = g.players[d.playerId];
  const buyer = g.clubs[d.buyerId];
  const res: BidResult = { errors: [], feeStatus: 'n/a', wageStatus: 'n/a', message: '', done: false };
  if (!p || !buyer) { res.errors = ['Unknown player or club.']; return res; }
  res.errors = validateDeal(g, d);
  if (res.errors.length) { res.message = res.errors[0]; return res; }

  // Fee
  if (p.clubId) {
    const seller = g.clubs[p.clubId];
    const ask = d.kind === 'loan' ? loanFeeFor(p) : askingPrice(g, p);
    if (d.kind === 'loan') {
      const rank = squadOf(g, seller.id).sort((a, b) => b.ovr - a.ovr).findIndex((x) => x.id === p.id);
      if (rank < 12) {
        res.feeStatus = 'rejected';
        res.message = `${seller.name} will not loan out a key player.`;
        return res;
      }
    }
    if (d.fee >= ask) res.feeStatus = 'accepted';
    else if (d.fee >= ask * 0.9) { res.feeStatus = 'countered'; res.counterFee = Math.max(d.fee, roundTo((d.fee + ask) / 2, 25000)); }
    else if (d.fee >= ask * 0.7) { res.feeStatus = 'countered'; res.counterFee = roundTo(ask * 0.97, 25000); }
    else { res.feeStatus = 'rejected'; res.message = `${seller.name} rejected the bid outright - it is far below their valuation.`; }
  } else {
    res.feeStatus = 'accepted';
  }

  // Contract
  if (d.kind === 'permanent') {
    const demand = contractDemand(p, buyer);
    if (d.wage >= demand) res.wageStatus = 'accepted';
    else if (d.wage >= demand * 0.9) { res.wageStatus = 'countered'; res.counterWage = demand; }
    else res.wageStatus = 'rejected';
  } else res.wageStatus = 'accepted';

  if (res.feeStatus === 'accepted' && res.wageStatus === 'accepted') {
    const ex = executeDeal(g, d);
    if (ex.ok) { res.done = true; res.message = `Deal agreed! ${p.name} is now a ${buyer.name} player.`; }
    else { res.errors = [ex.error!]; res.message = ex.error!; }
    return res;
  }
  const parts: string[] = [];
  if (res.feeStatus === 'countered') parts.push(`${g.clubs[p.clubId!].name} want ${fmtMoney(res.counterFee!)}.`);
  if (res.feeStatus === 'accepted' && p.clubId) parts.push('The club accepts your fee.');
  if (res.wageStatus === 'countered') parts.push(`${p.name} wants ${fmtMoney(res.counterWage!)}/wk.`);
  if (res.wageStatus === 'rejected') parts.push(`${p.name} rejected the contract - the wage is too low.`);
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

export function proposeSale(g: Game, playerId: string, buyerId: string, fee: number, kind: 'permanent' | 'loan' = 'permanent'): SaleResult {
  const p = g.players[playerId];
  const buyer = g.clubs[buyerId];
  if (!p || !buyer || p.clubId !== g.meta.userClubId) return { status: 'rejected', message: 'Invalid sale.', done: false };
  const deal: Deal = { playerId, buyerId, fee, wage: p.wage, years: Math.max(2, Math.min(p.contractYears + 1, maxYears(p))), kind };
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
  const willing = aiValuation(g, buyer, p);
  if (fee <= willing) {
    const ex = executeDeal(g, deal);
    return ex.ok ? { status: 'accepted', message: `${buyer.name} accepted. ${p.name} has been sold for ${fmtMoney(fee)}.`, done: true } : { status: 'rejected', message: ex.error!, done: false };
  }
  if (fee <= willing * 1.25) {
    const c = Math.max(50000, roundTo((fee + willing) / 2, 25000));
    return { status: 'countered', counterFee: Math.min(c, willing), message: `${buyer.name} counter with ${fmtMoney(Math.min(c, willing))}.`, done: false };
  }
  return { status: 'rejected', message: `${buyer.name} rejected your asking price.`, done: false };
}

// ---------- Contract renewals ----------
export function negotiateRenewal(g: Game, playerId: string, wage: number, years: number): { status: Status; counterWage?: number; message: string; done: boolean } {
  const p = g.players[playerId];
  const club = p?.clubId ? g.clubs[p.clubId] : null;
  if (!p || !club) return { status: 'rejected', message: 'Invalid player.', done: false };
  if (p.parentClubId) return { status: 'rejected', message: 'Loan players cannot be renewed.', done: false };
  if (years < 1 || years > maxYears(p)) return { status: 'rejected', message: `Contract length must be 1-${maxYears(p)} years.`, done: false };
  if (wageBill(g, club.id) - p.wage + wage > club.wageBudget) return { status: 'rejected', message: 'This wage would exceed the club wage budget.', done: false };
  const demand = contractDemand(p, club);
  if (wage >= demand) {
    p.wage = wage; p.contractYears = years;
    p.value = valueOf(p.ovr, p.age, p.pot, years);
    p.morale = Math.min(100, p.morale + 6);
    if (club.id === g.meta.userClubId) {
      addTx(g, club.id, 'contract', 0, `Contract renewal: ${p.name} - ${fmtMoney(wage)}/wk until +${years}y`);
      addMessage(g, { category: 'Contracts', from: 'Club Secretary', subject: `${p.name} signs new contract`, body: `${p.name} has agreed a new ${years}-year deal worth ${fmtMoney(wage)} per week.` });
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
