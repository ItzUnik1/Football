import type { Game, Player, Pos } from './types';
import { MAX_SQUAD, invalidateIndex, squadOf, wageBill } from './team';
import { addMessage, gameNow } from './messages';
import { addDays, daysToDeadline, contractEndFor } from './calendar';
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
  p.clubId = null; p.parentClubId = undefined; p.contractYears = 0; p.contractEnd = undefined; p.loanOption = undefined;
  invalidateIndex(g);
  p.value = valueOf(p.ovr, p.age, p.pot, 0);
}

// One round of AI transfer activity. Only called while a window is open.
export function aiTransferRound(g: Game): { deals: number } {
  let deals = 0;
  const now = gameNow(g);
  if (!isWindowOpen(now)) return { deals };
  const user = g.meta.userClubId;
  let userOffers = 0;
  const dl = daysToDeadline(now);
  const deadline = dl !== null && dl <= 1; // frantic last-two-days activity
  const all = Object.values(g.players).filter((p) => (p.clubId || !p.prospect) && !p.academy && !p.parentClubId);
  const expires = addDays(now, 3);

  for (const club of shuffle(Object.values(g.clubs))) {
    if (club.id === user) continue;
    const squad = squadOf(g, club.id);
    // Trim oversized squads (surplus players leave on free transfers)
    if (squad.length >= MAX_SQUAD - 1) {
      const surplus = squad.filter((p) => !p.parentClubId).sort((a, b) => a.ovr - b.ovr)[0];
      if (surplus) releaseToFreeAgents(g, surplus);
      continue;
    }
    if (!chance(deadline ? 0.7 : 0.3)) continue;

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
      if (userOffers < 2 && !hasPendingOffer(g, target.id) && chance(target.listed ? 1 : 0.3)) {
        // A release clause can be triggered outright
        const clause = target.releaseClause;
        if (clause && clause <= club.transferBudget && clause <= club.balance && chance(0.5)) {
          const wage = contractDemand(target, club);
          const ok = !(target.personality && target.personality.loyalty >= 17 && chance(0.6));
          if (ok && executeDeal(g, { playerId: target.id, buyerId: club.id, fee: clause, wage, years: Math.min(maxYears(target), 4), kind: 'permanent' }).ok) {
            addMessage(g, { category: 'Transfers', from: 'Club Secretary', important: true, subject: `Release clause triggered: ${target.name}`, body: `${club.name} paid the ${fmtMoney(clause)} release clause in ${target.name}'s contract. He has agreed personal terms and left the club.` });
            deals++;
          }
          continue;
        }
        const offer = roundTo(fee * (0.88 + rand() * 0.27), 50000);
        if (validateDeal(g, { playerId: target.id, buyerId: club.id, fee: offer, wage: target.wage, years: Math.max(2, target.contractYears), kind: 'permanent' }).length === 0) {
          userOffers++;
          addMessage(g, {
            category: 'Transfers', from: `${club.name} (Board)`, important: offer >= target.value, subject: `Offer for ${target.name}`,
            body: `${club.name} have submitted a ${fmtMoney(offer)} bid for ${target.name} (${target.pos}, ${target.ovr}, age ${target.age}). Our valuation is ${fmtMoney(fee)}. The offer is valid for three days.`,
            action: { kind: 'transfer_offer', playerId: target.id, clubId: club.id, fee: offer, expires },
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
        action: { kind: 'loan_offer', playerId: p.id, clubId: c.clubId, fee, expires },
      });
    } else {
      const offer = roundTo(c.estimate * (0.9 + rand() * 0.12), 50000);
      addMessage(g, {
        category: 'Transfers', from: `${g.clubs[c.clubId].name} (Board)`, important: true, subject: `Bid for listed player ${p.name}`,
        body: `${g.clubs[c.clubId].name} have bid ${fmtMoney(offer)} for ${p.name}, who is on the transfer list. Our valuation is ${fmtMoney(p.value)}.`,
        action: { kind: 'transfer_offer', playerId: p.id, clubId: c.clubId, fee: offer, expires },
      });
    }
  });
  return { deals };
}

// Young surplus players go on loan to lower-ranked clubs (some with an option to buy).
export function aiLoanRound(g: Game): void {
  const user = g.meta.userClubId;
  for (const club of shuffle(Object.values(g.clubs))) {
    if (club.id === user || !chance(0.12)) continue;
    const squad = squadOf(g, club.id).sort((a, b) => b.ovr - a.ovr);
    if (squad.length < 24) continue;
    const cand = squad.slice(18).find((p) => p.age <= 23 && !p.parentClubId && p.pot - p.ovr >= 4);
    if (!cand) continue;
    const tier = g.leagues[club.leagueId ?? 'L1']?.tier ?? 1;
    const dest = shuffle(Object.values(g.clubs)).find((c) => c.id !== user && c.id !== club.id && (g.leagues[c.leagueId ?? 'L1']?.tier ?? 1) >= tier
      && squadOf(g, c.id).length < 26 && squadOf(g, c.id).filter((x) => x.pos === cand.pos).length < NEED[cand.pos] && c.wageBudget - wageBill(g, c.id) > cand.wage);
    if (!dest) continue;
    executeDeal(g, { playerId: cand.id, buyerId: dest.id, fee: 0, wage: cand.wage, years: 1, kind: 'loan', loanOption: chance(0.3) ? { fee: cand.value, obligatory: false } : undefined });
  }
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
      p.contractEnd = contractEndFor(gameNow(g), p.contractYears);
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
