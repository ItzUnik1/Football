import type { Game, Player } from './types';
import { makeYouth } from './generator';
import { addMessage, addTx, gameNow } from './messages';
import { MAX_SQUAD, invalidateIndex, academyOf, repairLineup, squadOf, wageBill } from './team';
import { contractEndFor, addDays } from './calendar';
import { chance, randInt } from './rng';
import { valueOf } from './valuation';
import { fmtMoney } from './valuation';
import { staffEff } from './staff';

export const ACADEMY_MAX = 14;

/** Annual youth intake for a club's academy. Quality depends on youth facilities. */
export function youthIntake(g: Game, clubId: string): Player[] {
  const club = g.clubs[clubId];
  const lvl = Math.min(5.5, (club.youthLevel ?? 3) * (0.8 + 0.2 * staffEff(club, 'youth_coach')));
  const count = randInt(3, 4) + Math.floor(lvl / 2);
  const out: Player[] = [];
  const room = ACADEMY_MAX - academyOf(g, clubId).length;
  for (let i = 0; i < Math.min(count, room); i++) {
    const p = makeYouth(clubId, lvl);
    g.players[p.id] = p;
    out.push(p);
  }
  invalidateIndex(g);
  return out;
}

export function intakeMessage(g: Game, players: Player[]): void {
  if (!players.length) return;
  const best = [...players].sort((a, b) => b.pot - a.pot);
  addMessage(g, {
    category: 'Youth', from: 'Youth Coach', important: best[0].pot >= 78, subject: `Youth intake: ${players.length} new prospects`,
    body: `The new academy intake has arrived. Most promising: ${best.slice(0, 3).map((p) => `${p.name} (${p.pos}, ${p.age}, ${p.ovr}, potential ${p.pot >= 80 ? 'excellent' : p.pot >= 70 ? 'good' : 'average'})`).join('; ')}.`,
    action: { kind: 'goto', screen: 'academy' },
  });
}

export function promoteYouth(g: Game, playerId: string): { ok: boolean; message: string } {
  const p = g.players[playerId];
  const club = g.clubs[g.meta.userClubId];
  if (!p || !p.academy || p.clubId !== club.id) return { ok: false, message: 'Not an academy player.' };
  if (squadOf(g, club.id).length >= MAX_SQUAD) return { ok: false, message: `The first-team squad is full (${MAX_SQUAD}).` };
  const wage = Math.max(p.wage, 700);
  if (wageBill(g, club.id) + wage > club.wageBudget) return { ok: false, message: 'Wage budget exceeded.' };
  const now = gameNow(g);
  p.academy = false; p.wage = wage; p.contractYears = 3; p.contractEnd = contractEndFor(now, 3); p.value = valueOf(p.ovr, p.age, p.pot, 3);
  p.role = 'prospect'; p.joined = now;
  g.board.youthPromoted++;
  invalidateIndex(g);
  repairLineup(g, club);
  addTx(g, club.id, 'contract', 0, `Youth promotion: ${p.name}`);
  return { ok: true, message: `${p.name} has been promoted to the first-team squad.` };
}

export function releaseYouth(g: Game, playerId: string): { ok: boolean; message: string } {
  const p = g.players[playerId];
  if (!p || !p.academy || p.clubId !== g.meta.userClubId) return { ok: false, message: 'Not an academy player.' };
  p.clubId = null; p.academy = false; p.prospect = p.age <= 18; p.contractEnd = undefined; p.contractYears = 0;
  invalidateIndex(g);
  return { ok: true, message: `${p.name} has been released.` };
}

/** Rollover: academy players aged 19+ must be promoted, loaned or released. */
export function academyAgeOut(g: Game, clubId: string): void {
  const isUser = clubId === g.meta.userClubId;
  const now = gameNow(g);
  for (const p of academyOf(g, clubId)) {
    if (p.age < 19) continue;
    if (isUser) {
      addMessage(g, {
        category: 'Youth', from: 'Youth Coach', subject: `Youth contract decision: ${p.name}`,
        body: `${p.name} (${p.pos}, ${p.age}, ${p.ovr}/${p.pot}) is too old for the academy. Offer him a professional contract (${fmtMoney(Math.max(p.wage, 700))}/wk) or he will leave in 30 days.`,
        action: { kind: 'youth_contract', playerId: p.id, expires: addDays(now, 30) },
      });
    } else if (p.pot >= 62 && chance(0.7)) { p.academy = false; p.contractYears = 3; p.contractEnd = contractEndFor(now, 3); }
    else { p.clubId = null; p.academy = false; p.contractYears = 0; p.contractEnd = undefined; }
  }
  invalidateIndex(g);
}
