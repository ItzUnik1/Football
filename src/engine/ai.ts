import type { Game, Player, Pos } from './types';
import { MAX_SQUAD, squadOf, wageBill } from './team';
import { addMessage } from './messages';
import { askingPrice, aiValuation, contractDemand, executeDeal, interestedClubs, isWindowOpen, loanFeeFor, maxYears, ownerOf, validateDeal } from './transfers';
import { chance, pick, rand, randInt, shuffle } from './rng';
import { fmtMoney, valueOf, wageFor } from './valuation';

const NEED: Record<Pos, number> = { GK: 3, DF: 7, MF: 7, FW: 4 };
const STARTERS: Record<Pos, number> = { GK: 1, DF: 4, MF: 3, FW: 3 };
const roundTo = (n: number, s: number) => Math.round(n / s) * s;

function hasPendingOffer(g: Game, pid: string): boolean {
  return g.messages.some((m) => !m.resolved && m.action && (m.action.kind === 'transfer_offer' || m.action.kind === 'loan_offer') && m.action.playerId === pid);
}

export function releaseToFreeAgents(g: Game, p: Player): void {
  const club = p.clubId ? g.clubs[p.clubId] : null;
  if (club) {
    club.lineup = club.lineup.map((id) => (id === p.id ? '' : id));
    club.bench = club.bench.filter((id) => id !== p.id);
  }
  p.clubId = null; p.parentClubId = undefined; p.contractYears = 0;
  p.value = valueOf(p.ovr, p.age, p.pot, 0);
}

// One round of AI transfer activity. Only called while a window is open.
export function aiTransferRound(g: Game): { deals: number } {
  let deals = 0;
  if (!isWindowOpen(g.meta.week)) return { deals };
  const user = g.meta.userClubId;
  let userOffers = 0;
  const all = Object.values(g.players);

  for (const club of shuffle(Object.values(g.clubs))) {
    if (club.id === user) continue;
    const squad = squadOf(g, club.id);
    // Trim oversized squads (surplus players leave on free transfers)
    if (squad.length >= MAX_SQUAD - 1) {
      const surplus = squad.filter((p) => !p.parentClubId).sort((a, b) => a.ovr - b.ovr)[0];
      if (surplus) releaseToFreeAgents(g, surplus);
      continue;
    }
    if (!chance(0.4)) continue;

    // Work out the biggest need
    let bestPos: Pos = 'MF';
    let bestScore = -Infinity;
    (Object.keys(NEED) as Pos[]).forEach((pos) => {
      const grp = squad.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
      const weakest = grp[STARTERS[pos] - 1]?.ovr ?? 40;
      const avg = grp.slice(0, STARTERS[pos]).reduce((s, p) => s + p.ovr, 0) / Math.max(1, Math.min(grp.length, STARTERS[pos]));
      const score = (grp.length < NEED[pos] ? 100 : 0) + (avg - weakest) + rand() * 6 - (weakest > 70 ? 10 : 0);
      if (score > bestScore) { bestScore = score; bestPos = pos; }
    });
    const grp = squad.filter((p) => p.pos === bestPos).sort((a, b) => b.ovr - a.ovr);
    const weakest = grp[STARTERS[bestPos] - 1]?.ovr ?? 45;
    const short = grp.length < NEED[bestPos];

    const pool = all.filter((p) => p.pos === bestPos && p.clubId !== club.id && !p.parentClubId
      && p.ovr >= (short ? weakest - 3 : weakest + 2) && p.ovr <= weakest + 9
      && (p.clubId ? askingPrice(g, p) * 1.05 <= club.transferBudget : true));
    if (!pool.length) continue;
    const ranked = pool.sort((a, b) => (b.ovr - b.age * 0.25) - (a.ovr - a.age * 0.25)).slice(0, 4);
    const target = pick(ranked);
    const wage = contractDemand(target, club);
    const years = Math.min(maxYears(target), randInt(2, 4));

    if (!target.clubId) {
      if (executeDeal(g, { playerId: target.id, buyerId: club.id, fee: 0, wage, years, kind: 'permanent' }).ok) deals++;
      continue;
    }
    const owner = ownerOf(target)!;
    const fee = askingPrice(g, target);
    if (owner === user) {
      if (userOffers < 2 && !hasPendingOffer(g, target.id) && chance(target.listed ? 1 : 0.35)) {
        const offer = roundTo(fee * (0.88 + rand() * 0.27), 50000);
        if (validateDeal(g, { playerId: target.id, buyerId: club.id, fee: offer, wage: target.wage, years: Math.max(2, target.contractYears), kind: 'permanent' }).length === 0) {
          userOffers++;
          addMessage(g, {
            category: 'Transfers', from: `${club.name} (Board)`, important: offer >= target.value, subject: `Offer for ${target.name}`,
            body: `${club.name} have submitted a ${fmtMoney(offer)} bid for ${target.name} (${target.pos}, ${target.ovr}, age ${target.age}). Our valuation is ${fmtMoney(fee)}. The offer is valid for two matchdays.`,
            action: { kind: 'transfer_offer', playerId: target.id, clubId: club.id, fee: offer, expires: g.meta.week + 2 },
          });
        }
      }
      continue;
    }
    // AI-to-AI: key players are rarely sold
    const rank = squadOf(g, owner).sort((a, b) => b.ovr - a.ovr).findIndex((x) => x.id === target.id);
    if (rank < 11 && !chance(0.2)) continue;
    if (executeDeal(g, { playerId: target.id, buyerId: club.id, fee, wage, years, kind: 'permanent' }).ok) deals++;
  }

  // Interest in the user's transfer-listed players
  g.meta && Object.values(g.players).filter((p) => p.clubId === user && (p.listed || p.loanListed)).forEach((p) => {
    if (hasPendingOffer(g, p.id) || !chance(0.5)) return;
    const clubs = interestedClubs(g, p);
    if (!clubs.length) return;
    const c = pick(clubs.slice(0, 5));
    if (p.loanListed && !p.listed) {
      const fee = loanFeeFor(p);
      addMessage(g, {
        category: 'Transfers', from: `${g.clubs[c.clubId].name} (Board)`, subject: `Loan request: ${p.name}`,
        body: `${g.clubs[c.clubId].name} would like to take ${p.name} on loan until the end of the season. They will cover his full wages and pay a ${fmtMoney(fee)} loan fee.`,
        action: { kind: 'loan_offer', playerId: p.id, clubId: c.clubId, fee, expires: g.meta.week + 2 },
      });
    } else {
      const offer = roundTo(c.estimate * (0.9 + rand() * 0.12), 50000);
      addMessage(g, {
        category: 'Transfers', from: `${g.clubs[c.clubId].name} (Board)`, important: true, subject: `Bid for listed player ${p.name}`,
        body: `${g.clubs[c.clubId].name} have bid ${fmtMoney(offer)} for ${p.name}, who is on the transfer list. Our valuation is ${fmtMoney(p.value)}.`,
        action: { kind: 'transfer_offer', playerId: p.id, clubId: c.clubId, fee: offer, expires: g.meta.week + 2 },
      });
    }
  });
  return { deals };
}

// AI contract renewals for important players with one year left.
export function aiRenewals(g: Game): void {
  for (const club of Object.values(g.clubs)) {
    if (club.id === g.meta.userClubId) continue;
    const squad = squadOf(g, club.id).sort((a, b) => b.ovr - a.ovr);
    const median = squad[Math.floor(squad.length / 2)]?.ovr ?? 0;
    squad.forEach((p) => {
      if (p.parentClubId || p.contractYears > 1 || p.ovr < median) return;
      const wage = Math.max(p.wage, contractDemand(p, club));
      if (wageBill(g, club.id) - p.wage + wage > club.wageBudget) return;
      p.wage = wage;
      p.contractYears = Math.min(maxYears(p), randInt(2, 4));
      p.value = valueOf(p.ovr, p.age, p.pot, p.contractYears);
    });
  }
}

// AI financial management: shed excess wages and freeze spending when broke.
export function aiFinance(g: Game): void {
  for (const club of Object.values(g.clubs)) {
    if (club.id === g.meta.userClubId) continue;
    if (club.balance < 0) club.transferBudget = Math.min(club.transferBudget, 0);
    const bill = wageBill(g, club.id);
    if (bill > club.wageBudget * 1.03) {
      const squad = squadOf(g, club.id);
      if (squad.length <= 19) continue;
      const worst = squad.filter((p) => !p.parentClubId).sort((a, b) => (b.wage - wageFor(b.ovr, b.age) * 0.5 - b.ovr * 50) - (a.wage - wageFor(a.ovr, a.age) * 0.5 - a.ovr * 50)).slice(0, 8)
        .sort((a, b) => a.ovr - b.ovr)[0];
      if (worst) releaseToFreeAgents(g, worst);
    }
  }
}

export { aiValuation };
