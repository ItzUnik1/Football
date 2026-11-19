import type { Game, Message } from './types';
import { aiValuation, askingPrice, executeDeal, loanFeeFor, maxYears, negotiateRenewal, validateDeal } from './transfers';
import { fmtMoney } from './valuation';
import { addMessage } from './messages';

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
    if (g.meta.week > a.expires) { resolve(m, 'Offer expired'); return { ok: false, message: 'This offer has expired.' }; }
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
        a.expires = g.meta.week + 2;
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
  return { ok: false, message: 'Unsupported.' };
}

// Offers and proposals lapse if not answered in time.
export function expireMessages(g: Game): void {
  for (const m of g.messages) {
    if (m.resolved || !m.action) continue;
    const a = m.action;
    if ((a.kind === 'transfer_offer' || a.kind === 'loan_offer' || a.kind === 'contract') && g.meta.week > a.expires) {
      m.resolved = 'Expired';
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
    body: `${p.name}'s contract runs out after this season. His agent proposes a new ${years}-year deal at ${fmtMoney(demand)} per week (currently ${fmtMoney(p.wage)}). Accepting runs the renewal through the club's wage budget.`,
    action: { kind: 'contract', playerId: pid, wage: demand, years, expires: g.meta.week + 6 },
  });
}

export { askingPrice, loanFeeFor };
