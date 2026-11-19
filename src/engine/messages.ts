import type { Category, Game, Message, MsgAction, Tx } from './types';

const DAY = 86400000;
export const gameDateMs = (g: Game, week: number): number => g.meta.startDate + (Math.min(week, 38) - 1) * 7 * DAY;
export const gameDate = (g: Game, week: number): string =>
  new Date(gameDateMs(g, week)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function addMessage(
  g: Game,
  m: { category: Category; from: string; subject: string; body: string; important?: boolean; action?: MsgAction },
): Message {
  const msg: Message = {
    id: `m${String(g.meta.nextMsg++).padStart(5, '0')}`,
    week: g.meta.week,
    createdAt: gameDateMs(g, g.meta.week) + g.messages.length,
    category: m.category,
    from: m.from,
    subject: m.subject,
    body: m.body,
    read: false,
    important: !!m.important,
    action: m.action,
  };
  g.messages.push(msg);
  return msg;
}

export function addTx(g: Game, clubId: string, type: Tx['type'], amount: number, desc: string): void {
  // Only the user's club keeps a detailed ledger (keeps storage small).
  if (clubId !== g.meta.userClubId) return;
  g.tx.push({ id: `t${String(g.meta.nextTx++).padStart(5, '0')}`, week: g.meta.week, clubId, type, amount, desc });
}

export const unreadCount = (g: Game): number => g.messages.filter((m) => !m.read).length;
