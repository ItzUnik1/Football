import type { Game, Player, SessionType, SquadRole } from './types';
import { addMessage, gameNow } from './messages';
import { chance, clamp, rand, randInt, pick } from './rng';
import { computeOvr, valueOf } from './valuation';
import { squadOf } from './team';
import { dayDiff, weekday, fmtDate } from './calendar';

type AttrKey = 'passing' | 'dribbling' | 'shooting' | 'finishing' | 'tackling' | 'handling' | 'pace' | 'stamina' | 'strength' | 'jumping' | 'vision' | 'composure' | 'positioning' | 'workrate';
const TECH: AttrKey[] = ['passing', 'dribbling', 'shooting', 'finishing', 'tackling'];
const PHYS: AttrKey[] = ['pace', 'stamina', 'strength', 'jumping'];
const MENTAL: AttrKey[] = ['vision', 'composure', 'positioning', 'workrate'];
const KEY: Record<string, AttrKey[]> = {
  GK: ['handling', 'positioning', 'composure', 'jumping'],
  DF: ['tackling', 'positioning', 'strength', 'pace', 'jumping'],
  MF: ['passing', 'vision', 'dribbling', 'stamina', 'workrate'],
  FW: ['finishing', 'shooting', 'dribbling', 'pace', 'composure'],
};

function getAttr(p: Player, k: AttrKey): number {
  return (p.tech as any)[k] ?? (p.phys as any)[k] ?? (p.mental as any)[k];
}
function setAttr(p: Player, k: AttrKey, v: number): void {
  v = clamp(v, 5, 97);
  if (k in p.tech) (p.tech as any)[k] = v; else if (k in p.phys) (p.phys as any)[k] = v; else (p.mental as any)[k] = v;
}
export function recomputeOvr(p: Player): void {
  const a: any = { ...p.tech, ...p.phys, ...p.mental };
  p.ovr = clamp(computeOvr(p.pos, a), 20, 97);
  if (p.pot < p.ovr) p.pot = p.ovr;
  p.value = valueOf(p.ovr, p.age, p.pot, Math.max(0, p.contractYears));
}

/** Add a bounded improvement/decline to a player; returns the ovr delta. */
export function nudge(p: Player, k: AttrKey, d: number): number {
  const before = p.ovr;
  setAttr(p, k, getAttr(p, k) + d);
  recomputeOvr(p);
  return p.ovr - before;
}

export const roleOf = (g: Game, p: Player): SquadRole => {
  if (p.academy) return 'prospect';
  if (p.role) return p.role;
  const sq = squadOf(g, p.clubId ?? '').sort((a, b) => b.ovr - a.ovr);
  const i = sq.findIndex((x) => x.id === p.id);
  return i < 3 ? 'key' : i < 13 ? 'first' : i < 21 ? 'rotation' : 'prospect';
};

// ---------- Injuries ----------
export function injure(g: Game, p: Player, days: number, type: string): void {
  p.injuredDays = Math.max(p.injuredDays, days);
  p.injury = type;
  p.returnDays = 0;
  p.fitness = Math.max(40, p.fitness - 10);
  (p.injuries ??= []).push({ date: gameNow(g), type, days });
  if (p.injuries.length > 12) p.injuries.shift();
}

// ---------- Monthly development ----------
export function monthlyDevelopment(g: Game): void {
  const userClub = g.meta.userClubId;
  for (const id in g.players) {
    const p = g.players[id];
    if (!p.clubId && !p.prospect) continue;
    const club = p.clubId ? g.clubs[p.clubId] : null;
    const tl = club?.trainingLevel ?? 2;
    const pro = (p.personality?.professionalism ?? 10) / 20;
    const minutes = p.recentMinutes ?? 0; // rolling minutes (decayed monthly)
    const playBonus = p.academy ? (p.trainWithFirst ? 0.8 : 0.4) : clamp(minutes / 360, 0, 1);
    const gap = p.pot - p.ovr;
    let pUp = 0;
    if (p.age <= 20) pUp = 0.5;
    else if (p.age <= 23) pUp = 0.36;
    else if (p.age <= 26) pUp = 0.16;
    else if (p.age <= 29) pUp = 0.05;
    if (gap <= 0) pUp *= 0.25;
    else pUp *= clamp(0.4 + gap / 12, 0.4, 1.4);
    pUp *= 0.65 + tl * 0.1 + pro * 0.3 + playBonus * 0.35;
    if (p.academy) pUp *= club?.youthLevel ? 0.6 + (club.youthLevel ?? 3) * 0.1 : 0.8;
    if (chance(pUp)) {
      let key: AttrKey;
      let f = p.focus ?? 'auto';
      if (p.academy && p.clubId === userClub && g.training?.youthProgram && g.training.youthProgram !== 'balanced') f = g.training.youthProgram;
      if (id && p.clubId === userClub && f !== 'auto') {
        const grp = f === 'technical' ? TECH : f === 'physical' ? PHYS : f === 'mental' ? MENTAL : f === 'attack' ? ['finishing', 'shooting', 'dribbling', 'pace'] as AttrKey[] : ['tackling', 'positioning', 'strength'] as AttrKey[];
        key = pick(grp);
      } else key = pick(KEY[p.pos]);
      if (key === 'handling' && p.pos !== 'GK') key = 'passing';
      nudge(p, key, 1);
      if (chance(0.3)) nudge(p, pick(KEY[p.pos]), 1);
    }
    // Natural decline
    if (p.age >= 30) {
      const pDown = clamp((p.age - 29) * 0.1 - pro * 0.08, 0.02, 0.7);
      if (chance(pDown)) nudge(p, pick(['pace', 'stamina', 'strength', 'jumping'] as AttrKey[]), -1);
      if (p.age >= 33 && chance(pDown * 0.6)) nudge(p, pick(KEY[p.pos]), -1);
      if (chance(0.15)) nudge(p, pick(['composure', 'vision'] as AttrKey[]), 1);
    }
    p.recentMinutes = Math.round(minutes * 0.5);
    if (p.pot < p.ovr) p.pot = p.ovr;
  }
}

/** Birthdays and annual development jump at the season rollover. */
export function annualDevelopment(g: Game): void {
  for (const id in g.players) {
    const p = g.players[id];
    p.age += 1;
    if (p.age <= 19 && p.pot - p.ovr >= 4 && chance(0.45)) nudge(p, pick(KEY[p.pos]), randInt(1, 2));
    if (p.age >= 33 && chance(0.5)) nudge(p, pick(['pace', 'stamina'] as AttrKey[]), -randInt(1, 2));
    if (p.age >= 30 && p.pot > p.ovr) p.pot = p.ovr;
    if (p.age >= 28 && p.pot > p.ovr + 3) p.pot = p.ovr + 3;
  }
}

// ---------- Training ----------
export const SESSION_TYPES: SessionType[] = ['Rest', 'Recovery', 'Fitness', 'Technical', 'Tactical', 'Attacking', 'Defending', 'Set pieces'];
export const DEFAULT_PLAN: SessionType[] = ['Recovery', 'Fitness', 'Tactical', 'Technical', 'Set pieces', 'Rest', 'Rest'];
export const INTENSITY_MULT = { low: 0.6, medium: 1, high: 1.5 } as const;

export function initTraining(g: Game): void {
  g.training = { plan: DEFAULT_PLAN.slice(), intensity: 'medium', familiarity: 55, formation: g.clubs[g.meta.userClubId].formation, youthProgram: 'balanced', log: [] };
}

/** Today's planned session for the user club (match days and the day before are overridden). */
export function sessionFor(g: Game, t: number, matchToday: boolean, matchTomorrow: boolean): SessionType {
  if (matchToday) return 'Rest';
  if (matchTomorrow) return 'Recovery';
  return g.training.plan[weekday(t)] ?? 'Rest';
}

export function dailyUserTraining(g: Game, session: SessionType): void {
  const tr = g.training;
  const club = g.clubs[g.meta.userClubId];
  const im = INTENSITY_MULT[tr.intensity];
  const tl = club.trainingLevel ?? 3;
  for (const p of squadOf(g, club.id)) {
    if (p.injuredDays > 0) continue;
    const pro = (p.personality?.professionalism ?? 10) / 20;
    if (session === 'Fitness') {
      p.fitness = clamp(p.fitness - 1.5 * im + 1.5, 20, 100);
      if (chance(0.012 * im * (0.7 + tl * 0.1 + pro * 0.3))) nudge(p, pick(PHYS), 1);
    } else if (session === 'Technical') {
      if (chance(0.012 * im * (0.7 + tl * 0.1 + pro * 0.3))) nudge(p, pick(TECH.filter((k) => k !== 'tackling' || p.pos !== 'FW')), 1);
    } else if (session === 'Attacking' && p.pos !== 'GK') {
      if (chance(0.01 * im * (0.7 + tl * 0.1))) nudge(p, pick(['finishing', 'shooting', 'dribbling'] as AttrKey[]), 1);
    } else if (session === 'Defending' && p.pos !== 'FW') {
      if (chance(0.01 * im * (0.7 + tl * 0.1))) nudge(p, pick(['tackling', 'positioning', 'strength'] as AttrKey[]), 1);
    } else if (session === 'Recovery') p.fitness = clamp(p.fitness + 4, 20, 100);
    else if (session === 'Rest') p.fitness = clamp(p.fitness + 2, 20, 100);
    // Injury risk from hard sessions (lower with good medical staff, higher when tired or returning)
    if (session !== 'Rest' && session !== 'Recovery') {
      const risk = 0.0006 * im * (p.fitness < 60 ? 2 : 1) * ((p.returnDays ?? 0) > 0 ? 2 : 1) * (1.2 - (club.medicalLevel ?? 3) * 0.1);
      if (chance(risk)) {
        const days = randInt(3, 24);
        injure(g, p, days, pick(['Muscle strain', 'Twisted ankle', 'Groin strain', 'Calf strain']));
        addMessage(g, { category: 'Medical', from: 'Head Physio', important: p.ovr >= 70, subject: `Training injury: ${p.name}`, body: `${p.name} was hurt in training (${p.injury?.toLowerCase()}). Expected recovery: ${days} days, back around ${fmtDate(gameNow(g) + days * 86400000)}.`, action: { kind: 'goto', screen: 'squad', playerId: p.id } });
      }
    }
  }
  if (session === 'Tactical') tr.familiarity = clamp(tr.familiarity + 3 * im, 0, 100);
  else if (session === 'Set pieces' || session === 'Attacking' || session === 'Defending') tr.familiarity = clamp(tr.familiarity + 1 * im, 0, 100);
  else tr.familiarity = clamp(tr.familiarity - 0.15, 0, 100);
  tr.log.unshift({ date: gameNow(g), session, note: `${session} (${tr.intensity})` });
  if (tr.log.length > 14) tr.log.length = 14;
}

// ---------- Daily recovery for everyone (injury countdown, fitness) ----------
export function dailyRecovery(g: Game): { recovered: Player[] } {
  const recovered: Player[] = [];
  for (const id in g.players) {
    const p = g.players[id];
    if (!p.clubId) continue;
    const club = g.clubs[p.clubId];
    if (p.injuredDays > 0) {
      p.injuredDays -= 1 + (chance(((club?.medicalLevel ?? 3) - 1) * 0.06) ? 1 : 0);
      if (p.injuredDays <= 0) {
        p.injuredDays = 0;
        const last = p.injuries?.[p.injuries.length - 1];
        p.returnDays = Math.min(14, Math.ceil((last?.days ?? 7) / 4));
        p.fitness = Math.min(p.fitness, 72);
        p.injury = undefined;
        recovered.push(p);
      }
    } else if ((p.returnDays ?? 0) > 0) p.returnDays = (p.returnDays ?? 0) - 1;
    const rec = 1.1 + p.phys.stamina / 60 + (100 - p.fitness) * 0.025;
    if (p.injuredDays === 0 && p.fitness < 100) p.fitness = clamp(p.fitness + rec, 20, 100);
    if (p.fitness > 100) p.fitness = 100;
  }
  return { recovered };
}

// ---------- Personality / dressing room (weekly, user club only) ----------
export function weeklyDressingRoom(g: Game): void {
  const club = g.clubs[g.meta.userClubId];
  const squad = squadOf(g, club.id).filter((p) => !p.parentClubId);
  const leaders = squad.filter((p) => (p.personality?.leadership ?? 0) >= 15 && p.morale >= 55);
  const rooted = leaders.length ? 0.4 + leaders.length * 0.2 : 0;
  const toxic = squad.filter((p) => p.morale < 35 && (p.personality?.professionalism ?? 10) < 8).length;
  let sent = 0;
  for (const p of squad) {
    const per = p.personality;
    if (!per) continue;
    p.morale = clamp(p.morale + rooted - toxic * 0.3 + (p.morale < 50 ? (per.professionalism - 10) * 0.05 : 0), 10, 100);
    // Ambitious/disloyal key players ask to leave only after sustained unhappiness
    const unhappy = p.morale < 42 || (p.benchStreak >= 6 && roleOf(g, p) !== 'prospect');
    if (!p.wantsMove && unhappy && per.ambition >= 13 && per.loyalty <= 9 && p.ovr >= 62 && sent < 1 && !p.parentClubId && !p.academy
      && !g.messages.some((m) => m.action?.kind === 'wants_move' && m.action.playerId === p.id && !m.resolved)) {
      p.wantsMove = true; sent++;
      addMessage(g, {
        category: 'Players', from: p.name, important: p.ovr >= 72, subject: `${p.name} wants to leave`,
        body: `${p.name} (${p.pos}, ${p.ovr}) is unhappy with his situation and has asked for a transfer. You can list him for sale, try to persuade him to stay, or ignore it - his morale will keep falling.`,
        action: { kind: 'wants_move', playerId: p.id, expires: gameNow(g) + 14 * 86400000 },
      });
    }
  }
}

export function recentForm(g: Game, p: Player, rating: number): void {
  p.form = Math.round(((p.form ?? 6.5) * 0.75 + rating * 0.25) * 100) / 100;
  void g;
}

export const daysUntil = (g: Game, t: number): number => dayDiff(gameNow(g), t);
void rand;
