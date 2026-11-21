import type { Game, Message } from './types';
import { aiValuation, askingPrice, executeDeal, loanFeeFor, maxYears, negotiateRenewal, validateDeal } from './transfers';
import { fmtMoney } from './valuation';
import { addMessage, gameNow } from './messages';
import { activateLoanOption } from './transfers';
import { promoteYouth, releaseYouth } from './youth';
import { addDays } from './calendar';
import { clamp } from './rng';
import { acceptClubJob, acceptNationJob } from './mgr';
import { renewStaff } from './staff';

export type InboxChoice = 'accept' | 'reject' | 'counter' | 'promise' | 'ignore';
export interface ActionResult { ok: boolean; message: string; goto?: { screen: string; playerId?: string } }

const roundTo = (n: number, s: number) => Math.round(n / s) * s;

function resolve(m: Message, text: string): void {
  m.resolved = text;
  m.read = true;
}

// Executes the real gameplay consequence of an interactive inbox message.
export function performAction(g: Game, msgId: string, choice: InboxChoice): ActionResult {
  const m = g.messages.find((x) => x.id === msgId);
  if (!m || !m.action) return { ok: false, message: 'Nothing to do.' };
  if (m.resolved) return { ok: false, message: `Already handled: ${m.resolved}` };
  const a = m.action;
  const user = g.meta.userClubId;

  if (a.kind === 'goto') return { ok: true, message: '', goto: { screen: a.screen, playerId: a.playerId } };

  if (a.kind === 'transfer_offer' || a.kind === 'loan_offer') {
    const p = g.players[a.playerId];
    const buyer = g.clubs[a.clubId];
    if (!p || !buyer || p.clubId !== user) { resolve(m, 'No longer applicable'); return { ok: false, message: 'The player is no longer at the club.' }; }
    if (gameNow(g) > a.expires) { resolve(m, 'Offer expired'); return { ok: false, message: 'This offer has expired.' }; }
    const loan = a.kind === 'loan_offer';
    if (choice === 'reject') { resolve(m, 'Offer rejected'); return { ok: true, message: `You rejected ${buyer.name}'s offer.` }; }
    if (choice === 'accept') {
      const deal = { playerId: p.id, buyerId: buyer.id, fee: a.fee, wage: p.wage, years: Math.max(2, Math.min(p.contractYears + 1, maxYears(p))), kind: (loan ? 'loan' : 'permanent') as 'loan' | 'permanent' };
      const errs = validateDeal(g, deal);
      if (errs.length) return { ok: false, message: `Cannot complete: ${errs[0]}` };
      const ex = executeDeal(g, deal);
      if (!ex.ok) return { ok: false, message: ex.error ?? 'Deal failed.' };
      resolve(m, loan ? `Loan agreed with ${buyer.name} for ${fmtMoney(a.fee)}` : `Sold to ${buyer.name} for ${fmtMoney(a.fee)}`);
      return { ok: true, message: loan ? `${p.name} has gone on loan to ${buyer.name}.` : `${p.name} sold to ${buyer.name} for ${fmtMoney(a.fee)}.` };
    }
    if (choice === 'counter' && !loan) {
      const asked = Math.max(roundTo(a.fee * 1.15, 50000), a.fee + 50000);
      const willing = aiValuation(g, buyer, p);
      if (asked <= willing) {
        const deal = { playerId: p.id, buyerId: buyer.id, fee: asked, wage: p.wage, years: Math.max(2, Math.min(p.contractYears + 1, maxYears(p))), kind: 'permanent' as const };
        const errs = validateDeal(g, deal);
        if (errs.length) return { ok: false, message: `Cannot complete: ${errs[0]}` };
        executeDeal(g, deal);
        resolve(m, `Counter accepted - sold for ${fmtMoney(asked)}`);
        return { ok: true, message: `${buyer.name} accepted your counter. ${p.name} sold for ${fmtMoney(asked)}.` };
      }
      if (asked <= willing * 1.12) {
        const improved = Math.min(asked, roundTo(willing, 50000));
        a.fee = Math.max(a.fee, improved);
        a.expires = addDays(gameNow(g), 3);
        m.body += `\n\n${buyer.name} have improved their offer to ${fmtMoney(a.fee)}.`;
        return { ok: true, message: `${buyer.name} raised their bid to ${fmtMoney(a.fee)}.` };
      }
      resolve(m, 'Negotiation failed - bid withdrawn');
      return { ok: true, message: `${buyer.name} withdrew their interest after your counter-demand.` };
    }
    return { ok: false, message: 'Unsupported response.' };
  }

  if (a.kind === 'contract') {
    const p = g.players[a.playerId];
    if (!p || p.clubId !== user) { resolve(m, 'No longer applicable'); return { ok: false, message: 'The player is no longer at the club.' }; }
    if (choice === 'accept') {
      const r = negotiateRenewal(g, p.id, a.wage, a.years);
      if (r.done) { resolve(m, `Renewed: ${fmtMoney(a.wage)}/wk for ${a.years} years`); return { ok: true, message: r.message }; }
      return { ok: false, message: r.message };
    }
    if (choice === 'reject') {
      p.morale = Math.max(10, p.morale - 8);
      resolve(m, 'Proposal rejected');
      return { ok: true, message: `${p.name} is unhappy that you rejected his proposal.` };
    }
    return { ok: false, message: 'Unsupported response.' };
  }

  if (a.kind === 'job_offer') {
    if (gameNow(g) > a.expires) { resolve(m, 'Offer expired'); return { ok: false, message: 'This offer has expired.' }; }
    if (choice === 'accept') {
      const r = a.nationId ? acceptNationJob(g, a.nationId, a.wage, a.years) : a.clubId ? acceptClubJob(g, a.clubId, { ambition: 'realistic', transfers: 'balanced', youth: false }, a.wage, a.years) : { ok: false, message: 'Unknown job.' };
      if (r.ok) resolve(m, 'Accepted'); return r;
    }
    resolve(m, 'Declined'); return { ok: true, message: 'You declined the offer.' };
  }
  if (a.kind === 'staff_offer') {
    if (gameNow(g) > a.expires) { resolve(m, 'Offer expired'); return { ok: false, message: 'This offer has expired.' }; }
    if (choice === 'accept') { const r = renewStaff(g, a.staffId, 2); if (r.ok) resolve(m, 'Renewed'); return r; }
    resolve(m, 'Let go'); return { ok: true, message: 'You will not renew him.' };
  }
  if (a.kind === 'complaint') {
    const p = g.players[a.playerId];
    if (!p || p.clubId !== user) { resolve(m, 'No longer applicable'); return { ok: false, message: 'The player is no longer at the club.' }; }
    if (choice === 'promise') {
      p.promisedStart = true; p.morale = Math.min(100, p.morale + 12); p.benchStreak = 0;
      resolve(m, 'Promised more playing time');
      return { ok: true, message: `${p.name} is happier. Make sure he gets minutes soon.` };
    }
    p.morale = Math.max(10, p.morale - 6);
    resolve(m, 'Told to fight for his place');
    return { ok: true, message: `${p.name} accepted it, but his morale dropped.` };
  }

  if (a.kind === 'wants_move') {
    const p = g.players[a.playerId];
    if (!p || p.clubId !== user) { resolve(m, 'No longer applicable'); return { ok: false, message: 'The player is no longer at the club.' }; }
    if (choice === 'accept') { p.listed = true; p.morale = clamp(p.morale + 4, 0, 100); resolve(m, 'Transfer listed'); return { ok: true, message: `${p.name} has been placed on the transfer list.` }; }
    if (choice === 'promise') { p.promisedStart = true; p.morale = clamp(p.morale + 10, 0, 100); p.wantsMove = false; resolve(m, 'Persuaded to stay'); return { ok: true, message: `${p.name} agreed to stay - for now. Give him minutes.` }; }
    p.morale = clamp(p.morale - 6, 0, 100); resolve(m, 'Request refused');
    return { ok: true, message: `${p.name} is unhappy with your decision.` };
  }

  if (a.kind === 'youth_contract') {
    const p = g.players[a.playerId];
    if (!p || p.clubId !== user || !p.academy) { resolve(m, 'No longer applicable'); return { ok: false, message: 'The youngster is no longer in the academy.' }; }
    if (gameNow(g) > a.expires) { resolve(m, 'Expired'); return { ok: false, message: 'This offer has expired.' }; }
    if (choice === 'accept') {
      const r = promoteYouth(g, p.id);
      if (r.ok) resolve(m, 'Professional contract signed');
      return { ok: r.ok, message: r.message };
    }
    const r = releaseYouth(g, p.id); resolve(m, 'Released'); return { ok: r.ok, message: r.message };
  }

  if (a.kind === 'loan_option') {
    const p = g.players[a.playerId];
    if (!p || !p.parentClubId) { resolve(m, 'No longer applicable'); return { ok: false, message: 'No option available.' }; }
    if (choice === 'accept') { const r = activateLoanOption(g, p.id); if (r.ok) resolve(m, 'Option exercised'); return { ok: r.ok, message: r.message }; }
    resolve(m, 'Option declined'); return { ok: true, message: 'You declined the option to buy.' };
  }

  if (a.kind === 'board_funds') {
    if (gameNow(g) > a.expires) { resolve(m, 'Expired'); return { ok: false, message: 'The board withdrew the offer.' }; }
    if (choice === 'accept') {
      const c = g.clubs[user]; c.transferBudget += a.amount; g.board.fundsRequested = true;
      resolve(m, `Accepted ${fmtMoney(a.amount)}`); return { ok: true, message: `${fmtMoney(a.amount)} added to your transfer budget.` };
    }
    resolve(m, 'Declined'); return { ok: true, message: 'You declined the extra funds.' };
  }

  if (a.kind === 'scout_report') return { ok: true, message: '', goto: { screen: 'scouting', playerId: a.playerId } };
  return { ok: false, message: 'Unsupported.' };
}

// Offers and proposals lapse if not answered in time.
export function expireMessages(g: Game): void {
  for (const m of g.messages) {
    if (m.resolved || !m.action) continue;
    const a = m.action;
    if ('expires' in a && gameNow(g) > a.expires) {
      m.resolved = 'Expired';
      if (a.kind === 'youth_contract') { const p = g.players[a.playerId]; if (p?.academy && p.clubId === g.meta.userClubId) releaseYouth(g, p.id); }
    }
  }
}

export function markRead(g: Game, id: string, read = true): void {
  const m = g.messages.find((x) => x.id === id);
  if (m) m.read = read;
}

export function markAllRead(g: Game): void {
  g.messages.forEach((m) => { m.read = true; });
}

export function contractProposalMessage(g: Game, pid: string, demand: number): void {
  const p = g.players[pid];
  const years = Math.min(maxYears(p), 3);
  addMessage(g, {
    category: 'Contracts', from: `${p.name}'s agent`, important: p.ovr >= 70,
    subject: `Contract talks: ${p.name}`,
    body: `${p.name}'s contract runs out at the end of the season. His agent proposes a new ${years}-year deal at ${fmtMoney(demand)} per week (currently ${fmtMoney(p.wage)}). Accepting runs the renewal through the club's wage budget. Open his profile to negotiate your own terms.`,
    action: { kind: 'contract', playerId: pid, wage: demand, years, expires: addDays(gameNow(g), 30) },
  });
}

export { askingPrice, loanFeeFor };
