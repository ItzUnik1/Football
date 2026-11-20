import type { Category, Game, Message, MsgAction, Tx } from './types';
import { DAY, fmtDateLong, utc } from './calendar';

export const gameNow = (g: Game): number => g.meta.date ?? g.meta.startDate;
/** Legacy helper kept for Phase 1 callers: formatted date of the current day. */
export const gameDate = (g: Game, _week?: number): string => fmtDateLong(gameNow(g));
export const gameDateMs = (g: Game): number => gameNow(g);

export function addMessage(
  g: Game,
  m: { category: Category; from: string; subject: string; body: string; important?: boolean; action?: MsgAction },
): Message {
  const msg: Message = {
    id: `m${String(g.meta.nextMsg++).padStart(5, '0')}`,
    week: g.meta.week,
    date: gameNow(g),
    createdAt: gameNow(g) + (g.meta.nextMsg % DAY),
    category: m.category, from: m.from, subject: m.subject, body: m.body,
    read: false, important: !!m.important, action: m.action,
  };
  g.messages.push(msg);
  return msg;
}

export function addTx(g: Game, clubId: string, type: Tx['type'], amount: number, desc: string): void {
  if (clubId !== g.meta.userClubId) return; // detailed ledger only for the user's club
  g.tx.push({ id: `t${String(g.meta.nextTx++).padStart(5, '0')}`, week: g.meta.week, date: gameNow(g), clubId, type, amount, desc });
}

export const unreadCount = (g: Game): number => g.messages.filter((m) => !m.read).length;
export const nextUnread = (g: Game): Message | undefined => {
  // Oldest unread, important first
  const un = g.messages.filter((m) => !m.read);
  return un[0]; // oldest first, so the inbox reads chronologically
};
export { utc };
