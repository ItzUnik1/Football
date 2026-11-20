import type { CareerEntry, Club, Game, ManagerCareer, MatchReport, Mgr } from './types';
import { MANAGER_FIRST, MANAGER_LAST, MANAGER_STYLES, NATIONS } from './names';
import { chance, clamp, gauss, hash01, pick, randInt, shuffle } from './rng';
import { addDays, dayDiff, fmtDate, seasonLabel, utc, seasonOf } from './calendar';
import { addMessage, gameNow } from './messages';
import { addNews } from './news';
import { computeTable, leagueIdOf } from './fixtures';
import { repRankIn } from './board';
import { fmtMoney } from './valuation';
import { instrOf } from './tactics';

export const USER_MGR_ID = 'USER';

// ---------- Creation ----------
function mkMgr(g: Game, rep: number, ageMin = 38, ageMax = 66): Mgr {
  const q = clamp(Math.round(5 + rep / 6 + gauss() * 1.5), 3, 20);
  const age = randInt(ageMin, ageMax);
  return {
    id: `mg${g.mgrs.nextId++}`, name: `${pick(MANAGER_FIRST)} ${pick(MANAGER_LAST)}`, age, nat: pick(NATIONS).nat, style: pick(MANAGER_STYLES),
    rep, tactical: clamp(q + randInt(-2, 2), 3, 20), motivation: clamp(q + randInt(-3, 3), 3, 20), youth: clamp(q + randInt(-4, 4), 3, 20),
    exp: Math.max(0, age - 36), wage: managerWage(rep),
  };
}
export const managerWage = (rep: number): number => Math.round((rep * rep * 16) / 500) * 500;

export function initManagers(g: Game): void {
  if (g.mgrs) return;
  g.mgrs = { pool: [], vacancies: [], nextId: 1, log: [] };
  const user = g.clubs[g.meta.userClubId];
  const now = gameNow(g);
  // The user's persona
  const persona = user.manager;
  const rep = clamp(Math.round(user.reputation * 0.55 + 8), 8, 70);
  g.career = {
    name: persona.name, age: persona.age, nat: persona.nat, rep, intlRep: 6, exp: 0, tactical: 10,
    history: [{ kind: 'club', id: user.id, name: user.name, from: now, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [] }],
    trophies: [], achievements: [], milestones: [{ date: now, text: `Appointed manager of ${user.name}` }],
    totals: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, contract: null, nationContract: null,
    identity: { possession: 0, pressing: 0, counter: 0, direct: 0, defensive: 0, attacking: 0, matches: 0 }, offers: [], interviewsDone: 0,
  };
  user.manager = { ...persona, id: USER_MGR_ID, rep, tactical: 10, motivation: 12, youth: 10, exp: 0, wage: managerWage(rep), since: now, contractEnd: utc(g.meta.season + 3, 5, 30) };
  g.career.contract = { clubId: user.id, wage: managerWage(rep), end: utc(g.meta.season + 3, 5, 30) };
  for (const c of Object.values(g.clubs)) if (c.id !== user.id) enrichClubManager(g, c);
  for (let i = 0; i < 70; i++) g.mgrs.pool.push(mkMgr(g, clamp(Math.round(18 + hash01('p' + i) * 55 + gauss() * 4), 12, 82)));
}

function enrichClubManager(g: Game, c: Club): void {
  const m = c.manager;
  if (m.id) return;
  const rep = clamp(Math.round(c.reputation + (hash01(c.id + 'mrep') - 0.5) * 18), 10, 92);
  const q = clamp(Math.round(5 + rep / 6 + (hash01(c.id + 'mq') - 0.5) * 4), 3, 20);
  Object.assign(m, {
    id: `mg${g.mgrs.nextId++}`, rep, tactical: q, motivation: clamp(q + Math.round((hash01(c.id + 'mm') - 0.5) * 6), 3, 20), youth: clamp(q + Math.round((hash01(c.id + 'my') - 0.5) * 8), 3, 20),
    exp: Math.max(0, m.age - 36), wage: managerWage(rep), pressure: 0,
    since: utc(g.meta.season - randInt(0, 3), 6, 1), contractEnd: utc(g.meta.season + randInt(1, 3), 5, 30),
  });
}
export const isUserManager = (c: Club): boolean => c.manager.id === USER_MGR_ID;

// ---------- Vacancies, dismissals and appointments ----------
const caretaker = (): Club['manager'] => ({ name: 'Caretaker', age: 50, nat: 'England', style: 'Pragmatic', id: 'CARE', caretaker: true, rep: 20, tactical: 8, motivation: 9, youth: 8, exp: 3, wage: 2000, pressure: 0 });
export const clubHasVacancy = (g: Game, clubId: string): boolean => g.mgrs.vacancies.some((v) => v.clubId === clubId);

function openVacancy(g: Game, spec: { clubId?: string; nationId?: string }, minDays = 7, maxDays = 28): void {
  g.mgrs.vacancies.push({ ...spec, since: gameNow(g), fillOn: addDays(gameNow(g), randInt(minDays, maxDays)) });
}

export function dismissManager(g: Game, clubId: string, reason: 'sacked' | 'resigned' | 'expired' | 'poached'): void {
  const c = g.clubs[clubId];
  const m = c.manager;
  if (m.caretaker || m.id === USER_MGR_ID) return;
  const out: Mgr = { ...(m as Mgr), clubId: null } as Mgr;
  out.rep = clamp((out.rep ?? 40) + (reason === 'sacked' ? -3 : 0), 5, 99);
  out.contractEnd = undefined; out.since = undefined;
  g.mgrs.pool.push(out);
  c.manager = caretaker();
  openVacancy(g, { clubId });
  const verb = reason === 'sacked' ? 'sacked' : reason === 'resigned' ? 'has resigned as manager of' : reason === 'poached' ? 'leaves for a bigger job, quitting' : 'leaves as manager of (contract expired)';
  addNews(g, 'manager', reason === 'sacked' ? `${c.name} sack ${m.name}` : `${m.name} ${verb} ${c.name}`, { clubId, imp: c.reputation >= 60 ? 1 : 0, body: `${m.name} (${m.style}) departs ${c.name}. ${reason === 'sacked' ? `The club is ${ordinalPos(g, clubId)} in the ${g.leagues[c.leagueId ?? 'L1']?.short}.` : ''} A replacement will be sought.` });
}
const ordinalPos = (g: Game, id: string): string => { const p = computeTable(g, leagueIdOf(g, id)).findIndex((r) => r.clubId === id) + 1; return `${p}${p === 1 ? 'st' : p === 2 ? 'nd' : p === 3 ? 'rd' : 'th'}`; };

function bestCandidate(g: Game, target: number, ambition: number, exclude: Set<string> = new Set()): Mgr | undefined {
  const aim = target + (ambition - 10) * 1.2;
  let best: Mgr | undefined, bs = -1e9;
  for (const m of g.mgrs.pool) {
    if (m.retired || exclude.has(m.id)) continue;
    if (m.rep > aim + 18) continue; // would not take a smaller job
    const s = -Math.abs(m.rep - aim) + m.tactical * 0.35 + m.motivation * 0.15 + (Math.random() - 0.5) * 3;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

function appointClub(g: Game, clubId: string): boolean {
  const c = g.clubs[clubId];
  const cand = bestCandidate(g, c.reputation, c.econ?.ambition ?? 10);
  if (!cand) return false;
  g.mgrs.pool = g.mgrs.pool.filter((m) => m.id !== cand.id);
  const now = gameNow(g);
  const years = randInt(1, 3);
  c.manager = { ...cand, since: now, contractEnd: utc(seasonOf(now) + years, 5, 30), pressure: 0, record: { p: 0, w: 0, d: 0, l: 0 } };
  c.balance += 0; c.transferBudget += Math.round(c.reputation * 20000 * (1 + (c.econ?.ambition ?? 10) / 20));
  // honeymoon: new-manager bounce
  for (const id in g.players) { const p = g.players[id]; if (p.clubId === clubId && !p.academy) p.morale = clamp(p.morale + 3, 15, 100); }
  addNews(g, 'manager', `${c.name} appoint ${cand.name}`, { clubId, imp: c.reputation >= 60 ? 1 : 0, body: `${cand.name} (${cand.style}, reputation ${cand.rep}) signs a ${years}-year deal at ${c.name}.` });
  return true;
}

function appointNation(g: Game, nationId: string): void {
  const n = g.intl.nations[nationId];
  const cand = bestCandidate(g, Math.min(75, 30 + (1500 - 1500 + (g.intl.nations[nationId].pts - 1400) / 12)), 10);
  if (!cand) return;
  g.mgrs.pool = g.mgrs.pool.filter((m) => m.id !== cand.id);
  n.managerName = cand.name; n.managerRep = cand.rep; n.managerSince = gameNow(g); n.philosophy = cand.style; n.familiarity = Math.min(n.familiarity, 45);
  addNews(g, 'manager', `${n.name} appoint ${cand.name} as national team manager`, { imp: 1 });
}

// ---------- Weekly / monthly ----------
export function mgrWeekly(g: Game): void {
  const now = gameNow(g);
  // Fill vacancies
  for (const v of g.mgrs.vacancies.slice()) {
    if (now < v.fillOn) continue;
    if (v.clubId) {
      if (v.clubId === g.meta.userClubId && g.meta.sacked) continue;
      if (appointClub(g, v.clubId)) g.mgrs.vacancies = g.mgrs.vacancies.filter((x) => x !== v);
    } else if (v.nationId) {
      // the user may have been approached; if still unfilled after fillOn the FA appoints
      if (g.career.offers.some((o) => o.nationId === v.nationId && !o.declined && o.expires > now)) continue;
      appointNation(g, v.nationId); g.mgrs.vacancies = g.mgrs.vacancies.filter((x) => x !== v);
    }
  }
  // Pressure on AI managers
  for (const c of Object.values(g.clubs)) {
    if (c.manager.id === USER_MGR_ID || c.manager.caretaker) continue;
    const m = c.manager;
    enrichClubManager(g, c);
    const lid = leagueIdOf(g, c.id);
    const table = computeTable(g, lid);
    const row = table.find((r) => r.clubId === c.id)!;
    if (row.played < 6) continue;
    const pos = table.indexOf(row) + 1;
    const exp = repRankIn(g, c.id);
    const lg = g.leagues[lid];
    let d = clamp((pos - exp) * 0.26, -1.5, 2.2);
    const last5 = row.form.slice(-5);
    d += last5.filter((x) => x === 'L').length * 0.22 - last5.filter((x) => x === 'W').length * 0.2;
    if (lg && pos > table.length - lg.relegate - 1 && exp < table.length - lg.relegate - 2) d += 0.8;
    if (c.balance < -5_000_000) d += 0.8;
    m.pressure = clamp((m.pressure ?? 0) * 0.965 + d, 0, 100);
    const tenure = m.since !== undefined ? dayDiff(m.since, now) : 999;
    if (tenure < 70) continue;
    const amb = c.econ?.ambition ?? 10;
    const threshold = 27 - (amb - 10) * 0.5;
    if (m.pressure >= threshold && chance(clamp(0.06 + (m.pressure - threshold) * 0.03, 0, 0.4))) dismissManager(g, c.id, 'sacked');
  }
  if (g.mgrs.log.length > 60) g.mgrs.log.splice(0, g.mgrs.log.length - 60);
}

/** Monthly: poaching chains, job approaches for the user. */
export function mgrMonthly(g: Game): void {
  const now = gameNow(g);
  // Ambitious managers at small clubs are poached by clubs with vacancies
  for (const v of g.mgrs.vacancies) {
    if (!v.clubId || now < v.fillOn - 6 * 86400000 || v.clubId === g.meta.userClubId) continue;
    const vc = g.clubs[v.clubId];
    const cands = Object.values(g.clubs).filter((c) => c.id !== vc.id && !isUserManager(c) && !c.manager.caretaker && (c.manager.rep ?? 0) >= vc.reputation - 6 && vc.reputation > c.reputation + 8 && (c.manager.rep ?? 0) > c.reputation + 4 && dayDiff(c.manager.since ?? 0, now) > 180);
    if (cands.length && chance(0.3)) {
      const from = pick(cands);
      const m = from.manager;
      dismissManager(g, from.id, 'poached');
      // take him directly
      const out = g.mgrs.pool.find((x) => x.id === m.id);
      if (out) { g.mgrs.pool = g.mgrs.pool.filter((x) => x !== out); vc.manager = { ...out, since: now, contractEnd: utc(seasonOf(now) + 3, 5, 30), pressure: 0 }; g.mgrs.vacancies = g.mgrs.vacancies.filter((x) => x !== v); addNews(g, 'manager', `${vc.name} appoint ${out.name} from ${from.name}`, { clubId: vc.id, imp: 1 }); }
      break;
    }
  }
  userJobApproaches(g);
}

// ---------- User career ----------
function currentEntry(g: Game, kind: 'club' | 'nation'): CareerEntry | undefined {
  for (let i = g.career.history.length - 1; i >= 0; i--) { const e = g.career.history[i]; if (e.kind === kind && e.to === undefined) return e; }
  return undefined;
}

export function recordUserMatch(g: Game, report: MatchReport, forNation = false): void {
  const c = g.career;
  const side = forNation ? g.intl.userNation : g.meta.userClubId;
  const home = report.homeId === side;
  const gf = home ? report.hg : report.ag, ga = home ? report.ag : report.hg;
  let res: 'w' | 'd' | 'l' = gf > ga ? 'w' : gf < ga ? 'l' : 'd';
  if (res === 'd' && report.shootout) res = (home ? report.shootout.home > report.shootout.away : report.shootout.away > report.shootout.home) ? 'w' : 'l';
  c.totals.p++; c.totals[res]++; c.totals.gf += gf; c.totals.ga += ga;
  const e = currentEntry(g, forNation ? 'nation' : 'club');
  if (e) { e.p++; e[res]++; e.gf += gf; e.ga += ga; }
  const me = forNation ? g.intl.nations[g.intl.userNation!] : g.clubs[g.meta.userClubId];
  const I = me.instr ?? instrOf(me as Club);
  const id = c.identity; id.matches++;
  if (I.passing === 'short') id.possession++;
  if (I.press >= 4) id.pressing++;
  if (I.counter) id.counter++;
  if (I.passing === 'long') id.direct++;
  if (me.mentality === 'defensive' || me.mentality === 'very_defensive') id.defensive++;
  if (me.mentality === 'attacking' || me.mentality === 'very_attacking') id.attacking++;
  const m = c.totals.p;
  if (!forNation && m === 1) milestone(g, 'first_match', 'Debut', 'Managed your first match.');
  if (res === 'w' && c.totals.w === 1) milestone(g, 'first_win', 'First win', 'Won your first match as manager.');
  if (c.totals.p === 100) milestone(g, 'm100', '100 matches', 'Managed 100 matches.');
  if (c.totals.w === 50) milestone(g, 'w50', '50 wins', 'Reached 50 managerial wins.');
  if (gf - ga >= 5 && res === 'w') milestone(g, 'thrash', 'Demolition', `Won ${gf}-${ga}: a five-goal victory.`);
  if (c.totals.p >= 10) {
    const hist = (g as unknown as { _unb?: number })._unb;
    void hist;
  }
}

export function milestone(g: Game, id: string, title: string, detail: string): void {
  const c = g.career;
  if (c.achievements.some((a) => a.id === id)) return;
  c.achievements.push({ id, date: gameNow(g), title, detail });
  c.milestones.push({ date: gameNow(g), text: `${title}: ${detail}` });
  addNews(g, 'record', `Manager milestone - ${title}`, { body: detail });
}

export function tacticalIdentity(g: Game): { label: string; parts: [string, number][] } {
  const id = g.career.identity;
  const n = Math.max(1, id.matches);
  const parts: [string, number][] = [['Possession', id.possession / n], ['Pressing', id.pressing / n], ['Counter-attacking', id.counter / n], ['Direct', id.direct / n], ['Defensive', id.defensive / n], ['Attacking', id.attacking / n]];
  parts.sort((a, b) => b[1] - a[1]);
  const top = parts.filter((p) => p[1] >= 0.4).slice(0, 2).map((p) => p[0]);
  return { label: id.matches < 5 ? 'Still forming' : top.length ? top.join(' + ') : 'Flexible / pragmatic', parts };
}

/** Called at each season rollover for the user's club. */
export function careerSeasonEnd(g: Game, info: { pos: number; metObjective: boolean; champion: boolean; promoted: boolean; relegated: boolean }): void {
  const c = g.career;
  const e = currentEntry(g, 'club');
  const club = g.clubs[g.meta.userClubId];
  c.exp++;
  let d = info.metObjective ? 2.5 : -2;
  if (info.champion) { d += 4; milestone(g, `title${g.meta.season}`, 'League champions', `Won the title with ${club.name}.`); if (e) e.trophies.push(`${seasonLabel(g.meta.season)} league title`); c.trophies.push({ season: g.meta.season, name: g.leagues[club.leagueId ?? 'L1'].name, club: club.name }); }
  if (info.promoted) { d += 2.5; milestone(g, `promo${g.meta.season}`, 'Promotion', `Promoted with ${club.name}.`); }
  if (info.relegated) { d -= 3; }
  c.rep = clamp(c.rep + d, 5, 99);
  const lt = g.leagues[club.leagueId ?? 'L1'].tier;
  if (info.champion && lt === 1) milestone(g, 'top_champion', 'Top-flight champion', 'Won the top division.');
  if (e && (!e.best || info.pos < parseInt(e.best))) e.best = String(info.pos);
  c.tactical = clamp(c.tactical + 0.4, 1, 20);
  // sync persona record on the club manager object
  club.manager.rep = Math.round(c.rep); club.manager.exp = c.exp;
}

export function addCupTrophyToEntry(g: Game, name: string): void {
  const e = currentEntry(g, 'club'); if (e) e.trophies.push(name);
  milestone(g, `cup${g.meta.season}`, 'Cup winner', `Won the ${name}.`);
}

// ---------- Jobs ----------
export interface JobTerms { wage: number; years: number; cap: number; label: string; rep: number; kind: 'club' | 'nation' }
export function jobTerms(g: Game, spec: { clubId?: string; nationId?: string }): JobTerms {
  if (spec.clubId) {
    const c = g.clubs[spec.clubId];
    const cap = Math.round(managerWage(clamp(c.reputation + 4, 10, 95)) * 1.25);
    const wage = Math.round((managerWage(clamp((g.career.rep + c.reputation) / 2, 10, 95))) / 500) * 500;
    return { wage: Math.min(wage, cap), years: 3, cap, label: c.name, rep: c.reputation, kind: 'club' };
  }
  const n = g.intl.nations[spec.nationId!];
  const rep = clamp(Math.round(20 + (n.pts - 1300) / 6), 10, 90);
  const cap = Math.round(managerWage(rep) * 0.5);
  return { wage: Math.round(cap * 0.8 / 500) * 500, years: 2, cap, label: n.name, rep, kind: 'nation' };
}

export function availableJobs(g: Game): { clubId?: string; nationId?: string; since: number; terms: JobTerms; fit: 'dream' | 'good' | 'reach' | 'step_down' }[] {
  const cur = g.clubs[g.meta.userClubId];
  const unemployed = !!g.meta.sacked;
  const out: ReturnType<typeof availableJobs> = [];
  for (const v of g.mgrs.vacancies) {
    if (v.clubId) {
      if (v.clubId === cur.id) continue;
      const c = g.clubs[v.clubId];
      const diff = c.reputation - g.career.rep;
      if (diff > 22) continue;
      if (!unemployed && c.reputation < cur.reputation - 3) continue;
      out.push({ clubId: v.clubId, since: v.since, terms: jobTerms(g, { clubId: v.clubId }), fit: diff > 10 ? 'reach' : diff > 0 ? 'dream' : diff > -15 ? 'good' : 'step_down' });
    } else if (v.nationId) {
      const t = jobTerms(g, { nationId: v.nationId });
      if (g.career.nationContract) continue;
      if (g.career.rep < 35 && g.career.intlRep < 15) continue;
      out.push({ nationId: v.nationId, since: v.since, terms: t, fit: t.rep > g.career.rep + 15 ? 'reach' : 'good' });
    }
  }
  return out.sort((a, b) => b.terms.rep - a.terms.rep);
}

/** Ensures a sacked/resigned user always has some clubs to apply to. */
function ensureOffers(g: Game): void {
  const need = 4 - availableJobs(g).filter((j) => j.clubId).length;
  if (need <= 0) return;
  const lo = g.career.rep - 25, hi = g.career.rep + 15;
  const cands = shuffle(Object.values(g.clubs).filter((c) => c.id !== g.meta.userClubId && !isUserManager(c) && !c.manager.caretaker && c.reputation >= lo && c.reputation <= hi && (c.manager.pressure ?? 0) > 5)).slice(0, need);
  for (const c of cands) dismissManager(g, c.id, 'sacked');
  // make vacancies immediately available to the user
  g.mgrs.vacancies.forEach((v) => { if (v.clubId && v.fillOn < addDays(gameNow(g), 10)) v.fillOn = addDays(gameNow(g), 10 + randInt(0, 10)); });
}

function leaveClub(g: Game, reason: 'sacked' | 'resigned' | 'moved' | 'expired'): void {
  const club = g.clubs[g.meta.userClubId];
  const e = currentEntry(g, 'club');
  if (e) { e.to = gameNow(g); e.reason = reason; }
  g.career.contract = null;
  if (reason === 'sacked') { g.career.rep = clamp(g.career.rep - 4, 5, 99); milestone(g, `sacked${gameNow(g)}`, 'Dismissed', `Sacked by ${club.name}.`); }
  if (reason === 'resigned') g.career.rep = clamp(g.career.rep - 1.5, 5, 99);
  club.manager = caretaker();
  openVacancy(g, { clubId: club.id }, 14, 30);
  g.career.resigned = reason === 'resigned';
  g.career.unemployedSince = gameNow(g);
  addNews(g, 'manager', reason === 'sacked' ? `${club.name} sack ${g.career.name}` : reason === 'resigned' ? `${g.career.name} resigns as ${club.name} manager` : `${g.career.name} leaves ${club.name}`, { clubId: club.id, imp: 1 });
}

/** Called when the board dismisses the user (see board.ts). */
export function onUserDismissed(g: Game): void {
  g.meta.sacked = true;
  leaveClub(g, 'sacked');
  ensureOffers(g);
}
export function resign(g: Game): { ok: boolean; message: string } {
  if (g.meta.sacked) return { ok: false, message: 'You are already without a club.' };
  const left = g.career.contract ? dayDiff(gameNow(g), g.career.contract.end) : 0;
  leaveClub(g, 'resigned');
  g.meta.sacked = true;
  ensureOffers(g);
  return { ok: true, message: left > 365 ? 'You resigned with more than a year left on your deal; your reputation has taken a hit.' : 'You have resigned. Look at the job market to find a new club.' };
}

export interface Interview { ambition: 'title' | 'realistic' | 'safe'; transfers: 'invest' | 'balanced' | 'frugal'; youth: boolean }
export function interviewImpression(g: Game, clubId: string, iv: Interview): { score: number; notes: string[] } {
  const c = g.clubs[clubId];
  const notes: string[] = [];
  let s = 48 + (g.career.rep - c.reputation) * 0.7 + g.career.exp * 0.8;
  const rank = repRankIn(g, clubId);
  const realistic = rank <= 3 ? 'title' : rank <= 12 ? 'realistic' : 'safe';
  if (iv.ambition === realistic) { s += 10; notes.push('Your ambitions match the board\'s own expectations.'); }
  else if (iv.ambition === 'title' && realistic !== 'title') { s += 4; notes.push('The board liked your ambition but think it unrealistic.'); }
  else if (iv.ambition === 'safe' && realistic !== 'safe') { s -= 8; notes.push('The board expected more ambition.'); }
  if (iv.transfers === 'frugal' && c.balance < 0) { s += 6; notes.push('Your frugality suits the club\'s finances.'); }
  if (iv.transfers === 'invest' && c.balance < 0) { s -= 8; notes.push('The board is worried about spending.'); }
  if (iv.youth) { s += (c.econ?.profile === 'youth' ? 8 : 2); }
  return { score: clamp(Math.round(s), 0, 100), notes };
}

export function acceptClubJob(g: Game, clubId: string, iv: Interview, wage?: number, years = 3): { ok: boolean; message: string } {
  const v = g.mgrs.vacancies.find((x) => x.clubId === clubId);
  if (!v) return { ok: false, message: 'The vacancy has been filled.' };
  const t = jobTerms(g, { clubId });
  const ask = wage ?? t.wage;
  if (ask > t.cap * 1.2) return { ok: false, message: `The board will not go above ${fmtMoney(Math.round(t.cap * 1.2))} a week.` };
  const imp = interviewImpression(g, clubId, iv);
  g.career.interviewsDone++;
  let score = imp.score - (ask > t.cap ? (ask / t.cap - 1) * 120 : 0) - (years > 3 ? 4 : 0);
  if (score < 38) {
    g.mgrs.vacancies = g.mgrs.vacancies.filter((x) => x !== v);
    const c = g.clubs[clubId]; if (!appointClub(g, clubId)) openVacancy(g, { clubId });
    return { ok: false, message: `${g.clubs[clubId].name} chose another candidate. ${imp.notes.join(' ')}` };
  }
  score = clamp(score, 0, 100);
  const club = g.clubs[clubId];
  if (!g.meta.sacked) leaveClub(g, 'moved');
  g.mgrs.vacancies = g.mgrs.vacancies.filter((x) => x !== v);
  const now = gameNow(g);
  const end = utc(seasonOf(now) + years, 5, 30);
  g.meta.userClubId = clubId; g.meta.sacked = false;
  club.manager = { name: g.career.name, age: g.career.age, nat: g.career.nat, style: club.manager.style, id: USER_MGR_ID, rep: Math.round(g.career.rep), tactical: Math.round(g.career.tactical), motivation: 12, youth: 10, exp: g.career.exp, wage: ask, since: now, contractEnd: end };
  g.career.contract = { clubId, wage: ask, end };
  g.career.history.push({ kind: 'club', id: clubId, name: club.name, from: now, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [] });
  g.career.unemployedSince = undefined; g.career.resigned = false;
  g.career.offers = g.career.offers.filter((o) => !o.clubId);
  milestone(g, `join${clubId}${now}`, 'New job', `Appointed manager of ${club.name}.`);
  addNews(g, 'manager', `${club.name} appoint ${g.career.name}`, { clubId, imp: 1 });
  return { ok: true, message: `Welcome to ${club.name}. ${imp.notes.join(' ')} Interview score ${score}/100.` };
}

export function acceptNationJob(g: Game, nationId: string, wage?: number, years = 2): { ok: boolean; message: string } {
  if (g.career.nationContract) return { ok: false, message: 'You already manage a national team.' };
  const v = g.mgrs.vacancies.find((x) => x.nationId === nationId);
  if (!v) return { ok: false, message: 'The vacancy has been filled.' };
  const t = jobTerms(g, { nationId });
  if ((wage ?? t.wage) > t.cap * 1.2) return { ok: false, message: `The FA will not pay more than ${fmtMoney(Math.round(t.cap * 1.2))} a week.` };
  const n = g.intl.nations[nationId];
  g.mgrs.vacancies = g.mgrs.vacancies.filter((x) => x !== v);
  const now = gameNow(g);
  n.userManaged = true; n.managerName = g.career.name; n.managerSince = now; n.managerRep = g.career.rep;
  g.intl.userNation = nationId;
  g.career.nationContract = { nationId, end: utc(seasonOf(now) + years, 5, 30), wage: wage ?? t.wage };
  g.career.history.push({ kind: 'nation', id: nationId, name: n.name, from: now, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, trophies: [] });
  g.career.offers = g.career.offers.filter((o) => !o.nationId);
  milestone(g, `nat${nationId}${now}`, 'International job', `Appointed ${n.name} national team manager.`);
  addNews(g, 'manager', `${n.name} appoint ${g.career.name} as national team manager`, { imp: 2 });
  return { ok: true, message: `You are now the manager of ${n.name}, alongside your club job.` };
}

export function leaveNationJob(g: Game, reason: 'resigned' | 'sacked' | 'expired'): void {
  const un = g.intl.userNation; if (!un) return;
  const n = g.intl.nations[un];
  const e = currentEntry(g, 'nation'); if (e) { e.to = gameNow(g); e.reason = reason; }
  n.userManaged = false; g.intl.userNation = undefined; g.career.nationContract = null;
  n.managerName = `${pick(MANAGER_FIRST)} ${pick(MANAGER_LAST)}`;
  openVacancy(g, { nationId: un }, 10, 25);
  if (reason === 'sacked') g.career.intlRep = clamp(g.career.intlRep - 6, 0, 99);
  addNews(g, 'manager', `${g.career.name} ${reason === 'sacked' ? 'dismissed by' : 'leaves'} ${n.name}`, { imp: 1 });
}

/** Monthly: approaches for the user. At most one open offer per vacancy; employed managers get approaches only occasionally. */
function userJobApproaches(g: Game): void {
  const now = gameNow(g);
  g.career.offers = g.career.offers.filter((o) => o.expires > now && !o.declined);
  const jobs = availableJobs(g).filter((j) => !g.career.offers.some((o) => (o.clubId && o.clubId === j.clubId) || (o.nationId && o.nationId === j.nationId)));
  const employed = !g.meta.sacked;
  for (const j of jobs) {
    if (employed && j.clubId && (j.fit === 'step_down' || g.clubs[j.clubId].reputation < g.clubs[g.meta.userClubId].reputation + 4)) continue;
    if (employed && g.career.offers.length >= 2) break;
    const p = j.nationId ? 0.55 : employed ? 0.35 : 0.8;
    if (!chance(p)) continue;
    const id = `jo${g.mgrs.nextId++}`;
    const o = { id, clubId: j.clubId, nationId: j.nationId, date: now, expires: addDays(now, 21), wage: j.terms.wage, years: j.terms.years };
    g.career.offers.push(o);
    const name = j.terms.label;
    addMessage(g, {
      category: 'Manager', from: j.nationId ? 'Football Association' : `${name} board`, important: true,
      subject: `${j.nationId ? 'National team' : 'Job'} offer: ${name}`,
      body: `${name} ${j.nationId ? 'would like to appoint you as national team manager' : 'have a vacancy and are interested in you as manager'}. Proposed terms: ${fmtMoney(j.terms.wage)} per week for ${j.terms.years} years.\n\n${j.nationId ? 'You could take this job alongside your club position.' : employed ? 'Taking this job means leaving your current club.' : ''}\nOpen the Manager screen to interview and negotiate. The offer lapses on ${fmtDate(o.expires)}.`,
      action: { kind: 'job_offer', clubId: j.clubId, nationId: j.nationId, wage: j.terms.wage, years: j.terms.years, expires: o.expires },
    });
  }
}

/** Weekly check on the user's contracts: extension offers and expiry. */
export function userContractWatch(g: Game): void {
  const now = gameNow(g);
  const c = g.career.contract;
  if (c && !g.meta.sacked) {
    const left = dayDiff(now, c.end);
    if (left <= 150 && left > 0 && !g.messages.some((m) => m.category === 'Manager' && m.subject.startsWith('Contract extension') && (m.date ?? 0) > addDays(now, -170))) {
      if (g.board.confidence >= 50) {
        const wage = Math.round(c.wage * 1.12 / 500) * 500;
        addMessage(g, { category: 'Manager', from: 'Chairman', important: true, subject: 'Contract extension offered', body: `Your contract runs out on ${fmtDate(c.end)}. The board would like to extend it by 2 years at ${fmtMoney(wage)} per week. Open the Manager screen to respond.`, action: { kind: 'job_offer', clubId: g.meta.userClubId, wage, years: 2, expires: c.end } });
      } else addMessage(g, { category: 'Manager', from: 'Chairman', subject: 'Contract situation', body: `Your contract ends on ${fmtDate(c.end)}. The board will decide whether to renew it at the end of the season.`, action: { kind: 'goto', screen: 'manager' } });
    }
  }
}
export function extendContract(g: Game, years: number, wage: number): { ok: boolean; message: string } {
  const c = g.career.contract;
  if (!c) return { ok: false, message: 'You have no club contract.' };
  if (g.board.confidence < 45) return { ok: false, message: 'The board is not confident enough to extend your deal.' };
  if (wage > c.wage * 1.35) return { ok: false, message: 'The board will not meet that demand.' };
  c.end = utc(seasonOf(c.end) + years, 5, 30); c.wage = wage;
  g.clubs[g.meta.userClubId].manager.contractEnd = c.end; g.clubs[g.meta.userClubId].manager.wage = wage;
  return { ok: true, message: `Contract extended to ${fmtDate(c.end)}.` };
}

/** 1 July: contract expiry for the user (renewal if the board is content, otherwise out) and for national jobs. Also AI contract expiry and ageing. */
export function rolloverManagers(g: Game): void {
  const now = gameNow(g);
  const user = g.clubs[g.meta.userClubId];
  if (g.career.contract && g.career.contract.end <= now && !g.meta.sacked) {
    if (g.board.confidence >= 45) {
      g.career.contract.end = utc(seasonOf(now) + 1, 5, 30); user.manager.contractEnd = g.career.contract.end;
      addMessage(g, { category: 'Manager', from: 'Chairman', subject: 'Contract rolled over', body: `Your contract expired, but the board has agreed a one-year extension on the same terms.`, action: { kind: 'goto', screen: 'manager' } });
    } else { onUserDismissed(g); addMessage(g, { category: 'Manager', from: 'Chairman', important: true, subject: 'Contract not renewed', body: 'The board has decided not to renew your contract.' }); }
  }
  const nc = g.career.nationContract;
  if (nc && nc.end <= now) {
    const n = g.intl.nations[nc.nationId];
    if (n.rank <= 9 || chance(0.5)) { nc.end = utc(seasonOf(now) + 1, 5, 30); addMessage(g, { category: 'International', from: 'Football Association', subject: 'International contract extended', body: `${n.name} have extended your contract by a year.`, action: { kind: 'goto', screen: 'international' } }); }
    else { leaveNationJob(g, 'expired'); addMessage(g, { category: 'International', from: 'Football Association', subject: 'International contract expired', body: 'The FA has decided not to renew your contract.' }); }
  }
  // AI managers: contracts, ageing, retirements
  for (const c of Object.values(g.clubs)) {
    const m = c.manager;
    if (m.id === USER_MGR_ID || m.caretaker) continue;
    m.age++; m.exp = (m.exp ?? 0) + 1;
    const lgPos = computeTable(g, leagueIdOf(g, c.id)).findIndex((r) => r.clubId === c.id) + 1;
    m.rep = clamp((m.rep ?? 40) + (lgPos <= 3 ? 1.5 : lgPos >= 17 ? -1.5 : 0), 5, 99);
    if (m.contractEnd !== undefined && m.contractEnd <= now) {
      if ((m.pressure ?? 0) < 14 && chance(0.75)) { m.contractEnd = utc(seasonOf(now) + randInt(1, 3), 5, 30); m.wage = managerWage(m.rep!); }
      else dismissManager(g, c.id, 'expired');
    }
    if (m.age >= 68 && chance(0.4)) dismissManager(g, c.id, 'resigned');
  }
  for (const m of g.mgrs.pool) { m.age++; if (m.age >= 70 && chance(0.5)) m.retired = true; }
  g.mgrs.pool = g.mgrs.pool.filter((m) => !m.retired);
  while (g.mgrs.pool.length < 50) g.mgrs.pool.push(mkMgr(g, clamp(randInt(14, 60), 10, 70), 38, 50));
  // user's own persona ages
  g.career.age++;
  // national managers: review
  nationManagerReview(g);
}

export function nationManagerReview(g: Game): void {
  const ranked = Object.values(g.intl.nations).sort((a, b) => a.rank - b.rank);
  const n = ranked.length;
  for (const nat of ranked) {
    if (nat.userManaged) continue;
    const expected = nat.rank;
    const done = g.intl.records[g.intl.records.length - 1];
    let p = 0.05;
    if (nat.w + nat.d + nat.l >= 4) {
      const wr = nat.w / (nat.w + nat.d + nat.l);
      p += wr < 0.3 ? 0.18 : wr < 0.45 ? 0.05 : -0.03;
    }
    if (nat.rank > n - 3) p += 0.1;
    if (dayDiff(nat.managerSince, gameNow(g)) < 365) p *= 0.3;
    void expected; void done;
    if (chance(clamp(p, 0, 0.45))) {
      addNews(g, 'manager', `${nat.name} part company with ${nat.managerName}`, { imp: 1 });
      nat.managerName = ''; nat.managerRep = 0;
      openVacancy(g, { nationId: nat.id }, 14, 40);
    }
  }
}

export function managerSummary(g: Game): { record: string; winPct: number } {
  const t = g.career.totals;
  return { record: `${t.w}W ${t.d}D ${t.l}L`, winPct: t.p ? Math.round((t.w / t.p) * 100) : 0 };
}
export type { ManagerCareer };
