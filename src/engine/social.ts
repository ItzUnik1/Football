import type { ContractBonuses, Game, Player, PlayerMatch } from './types';
import { chance, clamp, hash01 } from './rng';
import { dayDiff, fmtDate } from './calendar';
import { addMessage, addTx, gameNow } from './messages';
import { addNews } from './news';
import { fmtMoney } from './valuation';
import { squadOf } from './team';
import { contractDemand } from './transfers';

// ---------- Hierarchy, friendships, rivalries ----------
export function leadershipScore(g: Game, p: Player): number {
  const tenure = Math.min(8, dayDiff(p.joined ?? gameNow(g), gameNow(g)) / 365);
  return (p.personality?.leadership ?? 8) * 2 + p.age * 0.6 + p.ovr * 0.35 + tenure * 1.5 + (p.captainOf ? 6 : 0) + (p.mental.composure ?? 10) * 0.2;
}
export function hierarchy(g: Game, clubId: string): Player[] { return squadOf(g, clubId).sort((a, b) => leadershipScore(g, b) - leadershipScore(g, a)); }
export const leadershipGroup = (g: Game, clubId: string): Player[] => hierarchy(g, clubId).slice(0, 4);

export function initSocial(g: Game): void {
  for (const c of Object.values(g.clubs)) {
    const sq = squadOf(g, c.id);
    for (const p of sq) {
      if (p.friends) continue;
      const mine: string[] = (p.friends = []); p.rivals = [];
      const mates = sq.filter((q) => q.id !== p.id);
      const same = mates.filter((q) => q.nat === p.nat);
      const pool = same.length ? same : mates;
      if (pool.length) {
        const f = pool[Math.floor(hash01(p.id + 'f') * pool.length)];
        mine.push(f.id);
        if (!f.friends) f.friends = [];
        if (!f.friends.includes(p.id) && f.friends.length < 3) f.friends.push(p.id);
      }
      if (hash01(p.id + 'r') < 0.18) {
        const rs = mates.filter((q) => q.pos === p.pos && Math.abs(q.ovr - p.ovr) <= 6 && !mine.includes(q.id));
        if (rs.length) { const r = rs[Math.floor(hash01(p.id + 'rr') * rs.length)]; p.rivals.push(r.id); }
      }
    }
  }
}

/** 0..100: how well the dressing room gets on. */
export function harmony(g: Game, clubId: string): number {
  const sq = squadOf(g, clubId); if (!sq.length) return 50;
  const lead = leadershipGroup(g, clubId);
  const avg = sq.reduce((s, p) => s + p.morale, 0) / sq.length;
  const leadAvg = lead.reduce((s, p) => s + p.morale, 0) / Math.max(1, lead.length);
  const unhappy = sq.filter((p) => p.wantsMove || (p.ptExp ?? 0) < -0.4).length / sq.length;
  const nats: Record<string, number> = {}; sq.forEach((p) => { nats[p.nat] = (nats[p.nat] ?? 0) + 1; });
  const cliques = Math.max(...Object.values(nats)) / sq.length > 0.55 ? 4 : 0;
  const feuds = sq.filter((p) => p.rivals?.some((r) => sq.find((q) => q.id === r))).length;
  return Math.round(clamp(avg * 0.5 + leadAvg * 0.35 + 15 - unhappy * 60 - feuds * 1.2 - cliques, 0, 100));
}
/** Small team-chemistry modifier (about -3..+3) used as familiarity bonus. */
export const chemistry = (g: Game, clubId: string): number => (harmony(g, clubId) - 60) * 0.12;

// ---------- Weekly dynamics ----------
export function socialWeekly(g: Game): void {
  const now = gameNow(g); const user = g.meta.userClubId;
  for (const c of Object.values(g.clubs)) {
    const sq = squadOf(g, c.id).filter((p) => !p.parentClubId || p.parentClubId === c.id).sort((a, b) => b.ovr - a.ovr);
    const lead = leadershipGroup(g, c.id);
    const leadMood = lead.reduce((s, p) => s + p.morale, 0) / Math.max(1, lead.length);
    sq.forEach((p, i) => {
      // playing time expectation
      const expected = i < 11 ? 1 : i < 16 ? 0.4 : 0.1;
      const actual = clamp((p.recentMinutes ?? 0) / 360, 0, 1);
      p.ptExp = Math.round(((p.ptExp ?? 0) * 0.8 + (actual - expected) * 0.2) * 1000) / 1000;
      if (p.ptExp < -0.3 && p.age >= 21) p.morale = clamp(p.morale - 1.5, 0, 100);
      // leaders spread mood
      p.morale = clamp(p.morale + (leadMood - 60) * 0.015, 0, 100);
      // a departed friend hurts
      if (p.friends?.length) {
        const gone = p.friends.filter((f) => g.players[f]?.clubId !== p.clubId);
        if (gone.length) { p.friends = p.friends.filter((f) => !gone.includes(f)); p.morale = clamp(p.morale - 3, 0, 100); }
        if (!p.friends.length && sq.length > 3 && chance(0.5)) { const q = sq[Math.floor(hash01(p.id + now) * sq.length)]; if (q.id !== p.id) p.friends.push(q.id); }
      }
      // rivals in same XI/competing breed friction
      if (p.rivals?.length) { const r = p.rivals.map((id) => g.players[id]).find((q) => q?.clubId === p.clubId); if (r && r.pos === p.pos && chance(0.04)) { p.morale = clamp(p.morale - 2, 0, 100); } }
      // transfer requests
      const underpaid = p.ovr >= 68 && p.wage < contractDemand(p, c) * 0.72;
      const reasons: string[] = [];
      if ((p.ptExp ?? 0) < -0.5 && p.morale < 48) reasons.push('lack of playing time');
      if (underpaid && p.morale < 55) reasons.push('contract dissatisfaction');
      if (reasons.length && !p.wantsMove && !p.parentClubId && chance(0.2) && p.ovr >= 62) {
        p.wantsMove = true;
        if (c.id !== user) p.listed = true;
        else if (!g.messages.some((m) => m.action?.kind === 'wants_move' && m.action.playerId === p.id && !m.resolved)) addMessage(g, { category: 'Players', from: p.name, important: true, subject: `${p.name} asks to leave`, body: `${p.name} (${p.pos}, ${p.ovr}) has asked to leave because of ${reasons.join(' and ')}. You can list him, try to persuade him to stay with a promise of football, or refuse.`, action: { kind: 'wants_move', playerId: p.id, expires: now + 14 * 86400000 } });
        if (p.ovr >= 75) addNews(g, 'transfer', `${p.name} wants to leave ${c.name}`, { clubId: c.id, playerId: p.id });
      }
    });
  }
  contractNotices(g);
}

// ---------- Contract expiry notices ----------
export function contractNotices(g: Game): void {
  const now = gameNow(g); const user = g.meta.userClubId;
  for (const p of squadOf(g, user)) {
    if (p.parentClubId || p.contractEnd === undefined) continue;
    const left = dayDiff(now, p.contractEnd);
    const stage = left <= 30 ? 30 : left <= 90 ? 90 : left <= 180 ? 180 : 0;
    if (!stage) { if (left > 200) p.contractWarn = undefined; continue; }
    if ((p.contractWarn ?? 999) <= stage || p.ovr < 62) continue;
    p.contractWarn = stage;
    addMessage(g, { category: 'Contracts', from: 'Club Secretary', important: stage <= 30, subject: `${p.name}: contract expires in ${left} days`, body: `${p.name}'s contract runs out on ${fmtDate(p.contractEnd)}. After that he can leave for free${left <= 180 ? ', and from January he may negotiate with other clubs' : ''}. Offer a new deal, or sell him while he still has value.`, action: { kind: 'goto', screen: 'squad', playerId: p.id } });
  }
}

// ---------- Contract bonuses ----------
export const bonusExpected = (b: ContractBonuses | undefined, p: Player): number => b ? Math.round(b.appearance * 30 + b.goal * (p.pos === 'FW' ? 14 : p.pos === 'MF' ? 6 : 2) + b.cleanSheet * (p.pos === 'GK' || p.pos === 'DF' ? 12 : 0)) / 38 * 1 : 0;
/** Pays appearance / goal / clean-sheet bonuses after a match. */
export function payBonuses(g: Game, p: Player, pm: PlayerMatch, conceded: number): void {
  const b = p.bonuses; if (!b || !p.clubId) return;
  const c = g.clubs[p.clubId]; if (!c) return;
  let amt = 0; const parts: string[] = [];
  if (b.appearance) { amt += b.appearance; parts.push('appearance'); }
  if (b.goal && pm.goals) { amt += b.goal * pm.goals; parts.push(`${pm.goals} goal${pm.goals > 1 ? 's' : ''}`); }
  if (b.cleanSheet && conceded === 0 && pm.minutes >= 60 && (p.pos === 'GK' || p.pos === 'DF')) { amt += b.cleanSheet; parts.push('clean sheet'); }
  if (!amt) return;
  c.balance -= amt; if (c.econ) c.econ.exp.bonuses += amt;
  if (c.id === g.meta.userClubId) addTx(g, c.id, 'bonus', -amt, `Bonus: ${p.name} (${parts.join(', ')})`);
}
/** Called at season rollover: loyalty bonuses and scheduled wage rises. */
export function bonusRollover(g: Game): void {
  const user = g.meta.userClubId;
  for (const p of Object.values(g.players)) {
    if (!p.clubId || p.academy || !p.bonuses) continue;
    const c = g.clubs[p.clubId]; if (!c) continue;
    p.loyaltyYears = (p.loyaltyYears ?? 0) + 1;
    if (p.bonuses.loyalty && p.loyaltyYears >= 2) { c.balance -= p.bonuses.loyalty; if (c.econ) c.econ.exp.bonuses += p.bonuses.loyalty; if (c.id === user) addTx(g, c.id, 'bonus', -p.bonuses.loyalty, `Loyalty bonus: ${p.name}`); }
    if (p.bonuses.wageRise && (p.contractEnd ?? 0) > gameNow(g)) { p.wage = Math.round((p.wage * (1 + p.bonuses.wageRise / 100)) / 100) * 100; }
  }
}
