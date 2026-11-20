import type { Club, Game, StaffMember, StaffRole } from './types';
import { MANAGER_FIRST, MANAGER_LAST, NATIONS } from './names';
import { chance, clamp, gauss, hash01, pick, randInt } from './rng';
import { addDays, dayDiff, fmtDate, utc, seasonOf } from './calendar';
import { addMessage, addTx, gameNow } from './messages';
import { addNews } from './news';
import { fmtMoney } from './valuation';

export const ROLE_LABEL: Record<StaffRole, string> = {
  assistant: 'Assistant Manager', coach: 'Coach', fitness: 'Fitness Coach', goalkeeping: 'Goalkeeping Coach', scout: 'Scout', head_scout: 'Head Scout',
  physio: 'Physio / Medical', analyst: 'Analyst', youth_coach: 'Youth Coach',
};
export const ROLE_EFFECT: Record<StaffRole, string> = {
  assistant: 'Speeds up tactical familiarity and lifts morale after bad results.',
  coach: 'Improves player development in training (all players).',
  fitness: 'Fewer training injuries and faster fitness recovery.',
  goalkeeping: 'Develops goalkeepers faster.',
  scout: 'Better and quicker scouting reports.',
  head_scout: 'Improves the accuracy of every scouting report.',
  physio: 'Shortens injuries and lowers match injury severity.',
  analyst: 'Opposition analysis gives a small boost to team performance.',
  youth_coach: 'Improves academy prospects\' development and the quality of the intake.',
};
export const ROLE_MIN: Record<StaffRole, number> = { assistant: 1, coach: 2, fitness: 1, goalkeeping: 1, scout: 1, head_scout: 1, physio: 1, analyst: 1, youth_coach: 1 };
export const ROLE_MAX: Record<StaffRole, number> = { assistant: 1, coach: 4, fitness: 2, goalkeeping: 1, scout: 4, head_scout: 1, physio: 2, analyst: 1, youth_coach: 2 };
export const ALL_ROLES = Object.keys(ROLE_LABEL) as StaffRole[];
const FOCI = ['attack', 'defence', 'technical', 'mental'] as const;

export const staffWage = (ability: number, role: StaffRole): number => Math.round((ability * ability * (role === 'assistant' ? 14 : role === 'head_scout' ? 11 : 9) + 200) / 50) * 50;

export function mkStaff(g: Game, role: StaffRole, target: number, clubId: string | null): StaffMember {
  const ability = clamp(Math.round(target + gauss() * 2.5), 2, 20);
  const age = randInt(30, 62);
  const m: StaffMember = {
    id: `st${g.staffWorld.nextId++}`, name: `${pick(MANAGER_FIRST)} ${pick(MANAGER_LAST)}`, age, nat: pick(NATIONS).nat, role, ability,
    secondary: clamp(Math.round(target + gauss() * 3), 2, 20), exp: Math.max(0, age - 30 - randInt(0, 8)), wage: 0,
    contractEnd: utc(seasonOf(gameNow(g)) + randInt(1, 3), 5, 30), clubId,
  };
  if (role === 'coach') m.focus = pick([...FOCI]);
  if (role === 'scout') m.region = pick(NATIONS).nat;
  m.wage = staffWage(m.ability, role);
  return m;
}

const targetFor = (c: Club): number => clamp(5 + c.reputation / 8 + (c.econ?.ambition ?? 10) * 0.05, 3, 17);

export function initStaff(g: Game): void {
  if (g.staffWorld) return;
  g.staffWorld = { pool: [], nextId: 1 };
  for (const c of Object.values(g.clubs)) {
    c.staff = [];
    fillStaff(g, c, true);
  }
  for (let i = 0; i < 90; i++) g.staffWorld.pool.push(mkStaff(g, ALL_ROLES[i % ALL_ROLES.length], clamp(randInt(4, 16), 3, 18), null));
}

export const staffOf = (c: Club, role: StaffRole): StaffMember[] => (c.staff ?? []).filter((s) => s.role === role);
/** Multiplier around 1.0 (ability 10). 5 -> ~0.75, 15 -> ~1.25, no staff -> 0.7 */
export function staffEff(c: Club | undefined, role: StaffRole): number {
  if (!c?.staff) return 1;
  const list = staffOf(c, role).sort((a, b) => b.ability - a.ability);
  if (!list.length) return 0.7;
  const take = role === 'coach' ? list.slice(0, 3) : list.slice(0, 1);
  const a = take.reduce((s, x) => s + x.ability, 0) / take.length;
  return clamp(0.5 + a / 20, 0.55, 1.5);
}
export const staffAbility = (c: Club | undefined, role: StaffRole): number => {
  const l = c ? staffOf(c, role) : [];
  return l.length ? Math.max(...l.map((s) => s.ability)) : 5;
};
export const staffWageBill = (c: Club): number => (c.staff ?? []).reduce((s, x) => s + x.wage, 0);

/** Fills missing posts with the best affordable candidates from the pool (or newly generated for the initial setup). */
function fillStaff(g: Game, c: Club, initial = false): void {
  c.staff ??= [];
  const isUser = c.id === g.meta.userClubId;
  for (const role of ALL_ROLES) {
    if (isUser && !initial && (role === 'scout')) continue; // the user manages scouts in the scouting screen
    if (isUser && (role === 'scout' || role === 'head_scout') && !initial) continue;
    const need = ROLE_MIN[role] + (role === 'coach' && c.reputation > 55 ? 1 : 0) + (role === 'scout' && c.reputation > 40 ? 1 : 0) - staffOf(c, role).length;
    for (let i = 0; i < need; i++) {
      if (initial) { c.staff.push({ ...mkStaff(g, role, targetFor(c), c.id) }); continue; }
      if (isUser) continue;
      const aim = targetFor(c);
      const cands = g.staffWorld.pool.filter((s) => s.role === role && s.wage * 52 <= c.balance * 0.05 + 150000);
      cands.sort((a, b) => Math.abs(a.ability - aim) - Math.abs(b.ability - aim) || b.ability - a.ability);
      const hire = cands[0];
      if (hire) hireInto(g, c, hire, false);
      else c.staff.push(mkStaff(g, role, aim, c.id));
    }
  }
}

function hireInto(g: Game, c: Club, s: StaffMember, announce: boolean): void {
  g.staffWorld.pool = g.staffWorld.pool.filter((x) => x.id !== s.id);
  s.clubId = c.id; s.contractEnd = utc(seasonOf(gameNow(g)) + randInt(1, 3) + (gameNow(g) >= utc(seasonOf(gameNow(g)), 6, 1) ? 0 : 0), 5, 30);
  (c.staff ??= []).push(s);
  if (announce && s.ability >= 15) addNews(g, 'club', `${c.name} hire ${ROLE_LABEL[s.role].toLowerCase()} ${s.name}`, { clubId: c.id });
}

export function availableStaff(g: Game, role?: StaffRole): StaffMember[] {
  return g.staffWorld.pool.filter((s) => !role || s.role === role).sort((a, b) => b.ability - a.ability);
}

export function hireStaff(g: Game, staffId: string): { ok: boolean; message: string } {
  const c = g.clubs[g.meta.userClubId];
  const s = g.staffWorld.pool.find((x) => x.id === staffId);
  if (!s) return { ok: false, message: 'That candidate is no longer available.' };
  if (staffOf(c, s.role).length >= ROLE_MAX[s.role]) return { ok: false, message: `You already have the maximum number of ${ROLE_LABEL[s.role].toLowerCase()}s (${ROLE_MAX[s.role]}). Release one first.` };
  const signOn = s.wage * 4;
  if (c.balance < signOn) return { ok: false, message: `The club cannot afford the ${fmtMoney(signOn)} signing-on cost.` };
  c.balance -= signOn; addTx(g, c.id, 'staff', -signOn, `Signing-on fee: ${s.name} (${ROLE_LABEL[s.role]})`);
  hireInto(g, c, s, true);
  return { ok: true, message: `${s.name} joins as ${ROLE_LABEL[s.role].toLowerCase()} until ${fmtDate(s.contractEnd)}.` };
}

export function releaseStaff(g: Game, staffId: string): { ok: boolean; message: string } {
  const c = g.clubs[g.meta.userClubId];
  const s = (c.staff ?? []).find((x) => x.id === staffId);
  if (!s) return { ok: false, message: 'Staff member not found.' };
  const left = Math.max(0, dayDiff(gameNow(g), s.contractEnd));
  const comp = Math.round(s.wage * Math.min(left / 7, 52) * 0.5);
  if (c.balance < comp) return { ok: false, message: `You cannot afford the ${fmtMoney(comp)} compensation.` };
  c.balance -= comp; if (comp) addTx(g, c.id, 'staff', -comp, `Compensation: ${s.name}`);
  c.staff = (c.staff ?? []).filter((x) => x.id !== staffId);
  s.clubId = null; g.staffWorld.pool.push(s);
  return { ok: true, message: `${s.name} released${comp ? ` (compensation ${fmtMoney(comp)})` : ''}.` };
}

export function renewStaff(g: Game, staffId: string, years = 2): { ok: boolean; message: string } {
  const c = g.clubs[g.meta.userClubId];
  const s = (c.staff ?? []).find((x) => x.id === staffId);
  if (!s) return { ok: false, message: 'Staff member not found.' };
  s.wage = Math.round(s.wage * 1.08 / 50) * 50;
  s.contractEnd = utc(seasonOf(s.contractEnd) + years, 5, 30);
  return { ok: true, message: `${s.name} extended to ${fmtDate(s.contractEnd)} at ${fmtMoney(s.wage)}/week.` };
}

/** Monthly: expiry warnings for the user, AI recruits and poaching. */
export function staffMonthly(g: Game): void {
  const now = gameNow(g);
  const me = g.clubs[g.meta.userClubId];
  for (const s of me.staff ?? []) {
    const left = dayDiff(now, s.contractEnd);
    if (left > 0 && left <= 90 && s.ability >= 12 && !g.messages.some((m) => m.action?.kind === 'staff_offer' && m.action.staffId === s.id && (m.date ?? 0) > addDays(now, -120))) {
      addMessage(g, { category: 'Staff', from: s.name, subject: `Contract expiring: ${s.name}`, body: `Your ${ROLE_LABEL[s.role].toLowerCase()} ${s.name} (ability ${s.ability}) is out of contract on ${fmtDate(s.contractEnd)}. He is open to a two-year extension at ${fmtMoney(Math.round(s.wage * 1.08 / 50) * 50)} per week. Other clubs may approach him.`, action: { kind: 'staff_offer', staffId: s.id, expires: s.contractEnd } });
    }
  }
  // AI poaching of high-ability staff by richer clubs
  if (chance(0.25)) {
    const rich = Object.values(g.clubs).filter((c) => c.id !== me.id && c.reputation > 50);
    const target = pick(Object.values(g.clubs).filter((c) => c.id !== me.id && c.reputation < 45));
    const buyer = pick(rich);
    const best = (target?.staff ?? []).filter((s) => s.ability >= 13 && s.role !== 'scout').sort((a, b) => b.ability - a.ability)[0];
    if (target && buyer && best && staffOf(buyer, best.role).length < ROLE_MAX[best.role]) {
      target.staff = target.staff!.filter((x) => x !== best);
      best.wage = Math.round(best.wage * 1.25 / 50) * 50; best.clubId = buyer.id;
      (buyer.staff ??= []).push(best);
      addNews(g, 'club', `${buyer.name} poach ${best.name} from ${target.name}`, { clubId: buyer.id });
    }
  }
  for (const c of Object.values(g.clubs)) if (c.id !== me.id && chance(0.5)) fillStaff(g, c);
}

/** 1 July: contracts end. AI clubs renew or replace; the user's staff expire. */
export function staffRollover(g: Game): void {
  const now = gameNow(g);
  for (const c of Object.values(g.clubs)) {
    const isUser = c.id === g.meta.userClubId;
    for (const s of (c.staff ?? []).slice()) {
      s.age++; s.exp++;
      if (s.age > 55 && chance(0.1)) s.ability = clamp(s.ability - 1, 1, 20); else if (s.age < 45 && chance(0.2)) s.ability = clamp(s.ability + 1, 1, 20);
      s.wage = staffWage(s.ability, s.role);
      if (s.contractEnd > now) continue;
      if (isUser) {
        c.staff = c.staff!.filter((x) => x !== s); s.clubId = null; g.staffWorld.pool.push(s);
        addMessage(g, { category: 'Staff', from: 'Club Secretary', subject: `${s.name} has left`, body: `${s.name} (${ROLE_LABEL[s.role]}) has left the club as his contract expired. Look at the staff market for a replacement.`, action: { kind: 'goto', screen: 'staff' } });
      } else if (chance(0.7)) s.contractEnd = utc(seasonOf(now) + randInt(1, 3), 5, 30);
      else { c.staff = c.staff!.filter((x) => x !== s); s.clubId = null; g.staffWorld.pool.push(s); }
    }
    if (!isUser) fillStaff(g, c);
  }
  for (const s of g.staffWorld.pool) { s.age++; if (chance(0.5)) s.ability = clamp(s.ability + randInt(-1, 1), 1, 20); }
  g.staffWorld.pool = g.staffWorld.pool.filter((s) => s.age < 66);
  while (g.staffWorld.pool.length < 90) g.staffWorld.pool.push(mkStaff(g, pick(ALL_ROLES), randInt(4, 16), null));
  if (g.staffWorld.pool.length > 160) g.staffWorld.pool.splice(0, g.staffWorld.pool.length - 160);
  void hash01;
}
