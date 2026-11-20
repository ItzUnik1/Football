import type { Formation, Instructions, MatchEvent, MatchReport, Mentality, Player, PlayerMatch, Pos, Style, TacticalLog, TeamStats } from './types';
import { FORMATIONS, condition, posFit } from './team';
import { chance, clamp, gauss, pick, rand, randInt, weighted } from './rng';
import { DEFAULT_INSTR, isWideSlot, mentalityLevel, roleDef, roleSuitability, type RoleDef, defaultRoleFor } from './tactics';

export interface TeamSheet {
  clubId: string;
  name: string;
  formation: Formation;
  mentality: Mentality;
  style: Style;
  xi: Player[]; // slot ordered
  bench: Player[];
  captainId: string;
  home: boolean;
  familiarity?: number; // tactical familiarity 0..100
  medical?: number; // medical level 1..5 (shorter injuries)
  instr?: Instructions;
  roles?: string[]; // role id per XI slot
  analyst?: number; // 0..20 analyst quality (small bonus)
}

export interface MatchOpts { knockout?: boolean; comp?: string; compName?: string; neutral?: boolean }

interface Live {
  p: Player;
  slot: Pos;
  wide: boolean;
  role: RoleDef;
  fit: number; // posFit * condition
  att: number; cre: number; def: number; gk: number;
  start: boolean;
  on: boolean;
  from: number; to: number; // minutes on pitch
  goals: number; assists: number; shots: number; saves: number; yellow: number; red: number;
  fouls: number;
}

interface Side {
  sheet: TeamSheet;
  key: 'home' | 'away';
  instr: Instructions;
  ml: number; // mentality level -2..2
  fam: number;
  live: Live[];
  bench: Live[];
  subs: number;
  reds: number;
  poss: number;
  stats: TeamStats;
  lines: { atk: number; mid: number; def: number; gk: number };
  tac: { pressPower: number; resist: number; wideAtt: number; centreAtt: number; wideDef: number; centreDef: number; air: number; paceAtk: number; paceDef: number; fat: number; sweeper: boolean; counterBias: number };
  log: TacticalLog;
  dirty: boolean;
}

function mkLive(p: Player, slot: Pos, wide: boolean, role: RoleDef, start: boolean): Live {
  const fitPos = posFit(p.pos, slot) * condition(p);
  const suit = roleSuitability(p, role);
  const q = clamp((suit - 35) / 35, 0, 1.15);
  const adj = 0.97 + 0.03 * clamp((suit - 40) / 30, 0, 1);
  const m = (x: number) => 1 + (x - 1) * q;
  const att = ((p.tech.shooting + p.tech.finishing + p.tech.dribbling + p.phys.pace) / 4) * fitPos * m(role.mul.att) * adj;
  const cre = ((p.tech.passing + p.mental.vision + p.tech.dribbling) / 3) * fitPos * m(role.mul.cre) * adj;
  const def = ((p.tech.tackling + p.mental.positioning + p.phys.strength + p.mental.workrate) / 4) * fitPos * m(role.mul.def) * adj;
  const gk = (p.tech.handling * 0.7 + p.mental.positioning * 0.3) * fitPos * (role.id === 'sweeper_keeper' ? 0.975 : 1);
  return { p, slot, wide, role, fit: fitPos, att, cre, def, gk, start, on: start, from: 0, to: 90, goals: 0, assists: 0, shots: 0, saves: 0, yellow: 0, red: 0, fouls: 0 };
}

function emptyStats(): TeamStats {
  return { possession: 0, shots: 0, onTarget: 0, blocked: 0, xg: 0, passes: 0, passAcc: 0, fouls: 0, corners: 0, yellow: 0, red: 0, saves: 0 };
}
const emptyLog = (fam: number): TacticalLog => ({
  pressWins: 0, pressShots: 0, pressGoals: 0, counterAttacks: 0, counterGoals: 0, behindChances: 0, behindGoals: 0,
  cornerGoals: 0, corners: 0, setPieceGoals: 0, wideChances: 0, centralChances: 0, lateConceded: 0, fatigue: 0, familiarity: Math.round(fam), gkSweeps: 0,
});

export function instrOfSheet(sheet: TeamSheet): Instructions {
  if (sheet.instr) return sheet.instr;
  const st = sheet.style;
  if (st === 'possession') return { ...DEFAULT_INSTR, passing: 'short', tempo: 2 };
  if (st === 'direct') return { ...DEFAULT_INSTR, passing: 'long', tempo: 4, width: 4 };
  return { ...DEFAULT_INSTR, counter: true, line: 2, tempo: 4 };
}

const avg = (a: number[], d = 50): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : d);

function computeLines(s: Side, minute: number): void {
  const on = s.live.filter((l) => l.on);
  const g = (grp: Pos) => on.filter((l) => l.slot === grp);
  const wavg = (parts: { v: number; w: number }[]) => {
    const tw = parts.reduce((a, b) => a + b.w, 0);
    return tw ? parts.reduce((a, b) => a + b.v * b.w, 0) / tw : 30;
  };
  const fw = g('FW'), mf = g('MF'), df = g('DF'), gk = g('GK');
  let atk = wavg([...fw.map((l) => ({ v: l.att, w: 1 })), ...mf.map((l) => ({ v: l.att, w: 0.55 })), ...df.map((l) => ({ v: l.att, w: 0.15 }))]);
  let mid = wavg([...mf.map((l) => ({ v: l.cre, w: 1 })), ...fw.map((l) => ({ v: l.cre, w: 0.3 })), ...df.map((l) => ({ v: l.cre, w: 0.3 }))]);
  let def = wavg([...df.map((l) => ({ v: l.def, w: 1 })), ...mf.map((l) => ({ v: l.def, w: 0.5 })), ...fw.map((l) => ({ v: l.def, w: 0.1 }))]);
  const gkv = gk.length ? gk[0].gk : 25;
  const I = s.instr;
  const outfield = on.filter((l) => l.slot !== 'GK');

  // Mentality
  atk += s.ml * 2.4; def -= s.ml * 2.4; mid += s.ml * 0.5;
  // Passing style
  if (I.passing === 'short') { mid += 3.6; atk -= 0.4; } else if (I.passing === 'long') { mid -= 2.5; atk += 1.0; }
  // Defensive line / press shape
  mid += (I.line - 3) * 0.7;
  def += (3 - I.press) * 0.4;
  // Tactical analyst
  const an = s.sheet.analyst ?? 10;
  const anB = (an - 10) * 0.05;
  atk += anB; def += anB;

  // Fatigue: intensity vs stamina, increasing through the match
  const roleTire = avg(outfield.map((l) => l.role.tire ?? 1), 1);
  const load = Math.max(0, I.press - 3) * 0.55 + Math.max(0, I.tempo - 3) * 0.45 + Math.max(0, s.ml) * 0.15 + (roleTire - 1) * 1.2;
  const stam = avg(outfield.map((l) => l.p.phys.stamina * (0.6 + 0.4 * l.p.fitness / 100)), 60);
  const fat = clamp(load * (Math.max(0, 74 - stam) / 74 + 0.12) * clamp((minute - 45) / 45, 0, 2) * 0.55, 0, 0.14);
  atk *= 1 - fat; mid *= 1 - fat; def *= 1 - fat;

  // Pressing power and press resistance
  s.tac.pressPower = avg(outfield.map((l) => (l.p.mental.workrate * 0.4 + l.p.phys.stamina * 0.25 + l.p.phys.pace * 0.15 + l.p.tech.tackling * 0.2) * (l.role.press ?? 1)), 55) * (1 - fat);
  s.tac.resist = avg([...mf, ...df].map((l) => (l.p.tech.passing * 0.4 + l.p.tech.dribbling * 0.3 + l.p.mental.composure * 0.3) * (1 + (l.role.resist ?? 0))), 55);
  // Wide vs central quality
  const wideA = outfield.filter((l) => l.wide && l.slot !== 'DF');
  const wbs = outfield.filter((l) => l.wide && l.slot === 'DF');
  const cenA = outfield.filter((l) => !l.wide && (l.slot === 'FW' || l.slot === 'MF'));
  const wideScore = (l: Live) => (l.att * 0.5 + l.cre * 0.5) * (0.85 + (l.role.wideplay ?? 0) * 0.15) * (1 - (l.role.central ?? 0) * 0.12);
  const cenScore = (l: Live) => (l.att * 0.5 + l.cre * 0.5) * (1 + (l.role.central ?? 0) * 0.06);
  s.tac.wideAtt = avg([...wideA.map(wideScore), ...wbs.map((l) => (l.att * 0.4 + l.cre * 0.6) * (0.8 + (l.role.wideplay ?? 0) * 0.2))], 45);
  s.tac.centreAtt = avg(cenA.map(cenScore), 45);
  s.tac.wideDef = avg(outfield.filter((l) => l.wide).map((l) => l.def * (1 + (l.role.shield ?? 0) * 0.05)), 45);
  s.tac.centreDef = avg(outfield.filter((l) => !l.wide && (l.slot === 'DF' || (l.slot === 'MF' && l.role.shield))).map((l) => l.def * (1 + (l.role.shield ?? 0) * 0.04)), 45);
  s.tac.air = avg(outfield.map((l) => (l.p.phys.jumping * 0.5 + l.p.phys.strength * 0.5) * (1 + (l.role.air ?? 0) * 0.12)).sort((a, b) => b - a).slice(0, 4), 50);
  s.tac.paceAtk = avg([...fw, ...mf.filter((l) => l.wide)].map((l) => l.p.phys.pace), 55);
  s.tac.paceDef = avg(df.map((l) => l.p.phys.pace), 55);
  s.tac.sweeper = gk.length > 0 && gk[0].role.id === 'sweeper_keeper';
  s.tac.fat = fat;
  s.tac.counterBias = I.counter ? 1 : 0;

  const missing = Math.max(0, 11 - on.length);
  const pen = 1 - missing * 0.075;
  const fam = 0.955 + 0.045 * (s.fam / 100);
  s.lines = { atk: atk * pen * fam, mid: mid * pen * fam, def: def * pen * fam, gk: gkv };
  s.log.fatigue = Math.max(s.log.fatigue, Math.round(fat * 1000) / 1000);
  s.dirty = false;
}

function pickShooter(s: Side, bias?: 'air'): Live {
  const on = s.live.filter((l) => l.on && l.slot !== 'GK');
  return weighted(on, (l) => {
    let w = ({ FW: 5, MF: 2.2, DF: 0.6, GK: 0 }[l.slot]) * (l.p.tech.finishing * 0.6 + l.p.tech.shooting * 0.4) / 60;
    if (l.role.id === 'poacher') w *= 1.25;
    if (l.role.id === 'inside_forward') w *= 1.15;
    if (bias === 'air') w = (0.4 + l.p.phys.jumping / 40 * (l.slot === 'DF' ? 1.6 : 1) + (l.role.air ?? 0) * 1.2) * (l.slot === 'GK' ? 0 : 1) * (l.p.tech.finishing / 70 + 0.3);
    return w;
  });
}
function pickAssister(s: Side, not: Live): Live | null {
  const on = s.live.filter((l) => l.on && l !== not && l.slot !== 'GK');
  if (!on.length) return null;
  return weighted(on, (l) => {
    let w = ({ FW: 2.4, MF: 3, DF: 1, GK: 0 }[l.slot]) * (l.p.tech.passing * 0.5 + l.p.mental.vision * 0.5) / 60;
    if (l.role.id === 'app' || l.role.id === 'dlp') w *= 1.35;
    else if (l.role.id === 'winger' || l.role.id === 'fwinger' || l.role.id === 'wing_back') w *= 1.2;
    return w;
  });
}

export function simulateMatch(home: TeamSheet, away: TeamSheet, fixtureId: string, week: number, date?: number, leagueId?: string, opts: MatchOpts = {}): MatchReport {
  const mkSide = (sheet: TeamSheet, key: 'home' | 'away'): Side => {
    const slots = FORMATIONS[sheet.formation];
    const fam = sheet.familiarity ?? 60;
    const live = sheet.xi.map((p, i) => {
      const slot = slots[i];
      const wide = isWideSlot(slot);
      const r = roleDef(sheet.roles?.[i]);
      const role = r && r.pos === slot.pos ? r : roleDef(defaultRoleFor(slot))!;
      return mkLive(p, slot.pos, wide, role, true);
    });
    const bench = sheet.bench.map((p) => mkLive(p, p.pos, false, roleDef(defaultRoleFor({ label: '', pos: p.pos, x: 50, y: 50 }))!, false));
    return {
      sheet, key, instr: instrOfSheet(sheet), ml: mentalityLevel(sheet.mentality), fam, live, bench, subs: 0, reds: 0, poss: 0, stats: emptyStats(),
      lines: { atk: 50, mid: 50, def: 50, gk: 50 },
      tac: { pressPower: 55, resist: 55, wideAtt: 50, centreAtt: 50, wideDef: 50, centreDef: 50, air: 50, paceAtk: 55, paceDef: 55, fat: 0, sweeper: false, counterBias: 0 },
      log: emptyLog(fam), dirty: true,
    };
  };
  const H = mkSide(home, 'home');
  const A = mkSide(away, 'away');
  const events: MatchEvent[] = [];
  const injuries: MatchReport['injuries'] = [];
  const bans: MatchReport['bans'] = [];
  let hg = 0, ag = 0;
  const yellowed = new Set<string>();
  const homeAdv = opts.neutral ? 0 : 1;

  const opp = (s: Side) => (s === H ? A : H);
  const pushEvent = (e: MatchEvent) => events.push(e);
  let lastMinute = 90;

  const substitute = (s: Side, out: Live, minute: number, reason: string): boolean => {
    if (s.subs >= (minute > 90 ? 6 : 5)) return false;
    const cands = s.bench.filter((b) => !b.on && b.to === 90 && b.p.injuredDays <= 0 && b.p.suspended <= 0 && !b.red && !events.some((e) => e.type === 'sub' && e.playerId === b.p.id));
    if (!cands.length) return false;
    const grp = out.slot;
    const sameGroup = cands.filter((b) => b.p.pos === grp);
    const choice = (sameGroup.length ? sameGroup : cands).sort((a, b) => b.p.ovr * condition(b.p) - a.p.ovr * condition(a.p))[0];
    if (grp === 'GK' && choice.p.pos !== 'GK') return false;
    out.on = false; out.to = minute;
    const idx = s.live.indexOf(out);
    // the replacement inherits the role if it suits his position, otherwise plays the default role
    const role = choice.p.pos === out.slot ? out.role : roleDef(defaultRoleFor({ label: '', pos: out.slot, x: out.wide ? 10 : 50, y: 50 }))!;
    const fresh = mkLive(choice.p, out.slot, out.wide, role, false);
    fresh.on = true; fresh.from = minute;
    Object.assign(choice, fresh);
    s.live[idx] = out;
    s.live.push(choice);
    s.subs++;
    s.dirty = true;
    pushEvent({ min: minute, type: 'sub', team: s.key, playerId: choice.p.id, player: choice.p.name, assistId: out.p.id, assist: out.p.name, detail: reason });
    return true;
  };

  type Tag = 'open' | 'press' | 'counter' | 'behind' | 'corner' | 'freekick' | 'penalty' | 'cross';
  const shoot = (att: Side, def: Side, minute: number, xg: number, tag: Tag = 'open'): void => {
    const penalty = tag === 'penalty';
    const shooter = penalty
      ? [...att.live.filter((l) => l.on && l.slot !== 'GK')].sort((a, b) => b.p.tech.finishing - a.p.tech.finishing)[0]
      : pickShooter(att, tag === 'corner' || tag === 'cross' ? 'air' : undefined);
    const gk = def.lines.gk;
    const adj = clamp(1 + (shooter.p.tech.finishing - gk) / 110, 0.6, 1.5);
    att.stats.shots++; shooter.shots++; att.stats.xg += xg;
    if (tag === 'press') att.log.pressShots++;
    if (rand() < Math.min(0.95, xg * adj)) {
      att.stats.onTarget++;
      let assister: Live | null = null;
      if (!penalty && tag !== 'corner' && chance(0.72)) assister = pickAssister(att, shooter);
      if (tag === 'corner' && chance(0.5)) assister = pickAssister(att, shooter);
      shooter.goals++;
      if (assister) assister.assists++;
      if (att.key === 'home') hg++; else ag++;
      if (tag === 'press') att.log.pressGoals++;
      if (tag === 'counter') att.log.counterGoals++;
      if (tag === 'behind') att.log.behindGoals++;
      if (tag === 'corner') { att.log.cornerGoals++; att.log.setPieceGoals++; }
      if (tag === 'freekick') att.log.setPieceGoals++;
      if (minute > 65 && minute <= 90) def.log.lateConceded++;
      pushEvent({ min: minute, type: 'goal', team: att.key, playerId: shooter.p.id, player: shooter.p.name, assistId: assister?.p.id, assist: assister?.p.name, detail: tag === 'open' || tag === 'cross' ? undefined : tag });
      return;
    }
    if (penalty) {
      if (chance(0.6)) { att.stats.onTarget++; def.stats.saves++; const g = def.live.find((l) => l.on && l.slot === 'GK'); if (g) g.saves++; }
      pushEvent({ min: minute, type: 'pen_miss', team: att.key, playerId: shooter.p.id, player: shooter.p.name });
      return;
    }
    const r = rand();
    if (r < 0.28) {
      att.stats.onTarget++; def.stats.saves++;
      const g = def.live.find((l) => l.on && l.slot === 'GK'); if (g) g.saves++;
      if (chance(0.3)) corner(att, def, minute);
    } else if (r < 0.43) {
      att.stats.blocked++;
      if (chance(0.4)) corner(att, def, minute);
    } else if (chance(0.08)) corner(att, def, minute);
  };

  /** A corner is awarded and actually taken: set-piece plans and aerial strength matter. */
  const corner = (att: Side, def: Side, minute: number): void => {
    att.stats.corners++; att.log.corners++;
    const takers = att.live.filter((l) => l.on && l.slot !== 'GK');
    const taker = takers.reduce((b, l) => (l.p.tech.passing > b.p.tech.passing ? l : b), takers[0]);
    if (!taker) return;
    const plan = att.instr.corners;
    if (plan === 'short' && chance(0.5)) return; // short routine kept possession but led nowhere
    const airDiff = (att.tac.air - def.tac.air) / 100;
    const marking = def.instr.setPieces; // zonal: solid vs. aerial, man: better vs. runners but exposed to strong targets
    const markAdj = marking === 'zonal' ? 0.92 : marking === 'man' ? (airDiff > 0.04 ? 1.1 : 0.95) : 1;
    const planAdj = plan === 'near' ? 1 : plan === 'far' ? 1 + clamp(airDiff, -0.2, 0.25) * 0.8 : 0.9;
    const p = clamp(0.05 * (1 + (taker.p.tech.passing - 60) / 90 + airDiff * 1.6) * planAdj * markAdj, 0.012, 0.13);
    if (chance(p)) shoot(att, def, minute, clamp(0.1 + airDiff * 0.1, 0.05, 0.2), 'corner');
  };

  const minuteLimit = () => (opts.knockout && hg === ag ? 120 : 90);
  let lastAtt: Side | null = null;
  for (let minute = 1; minute <= minuteLimit(); minute++) {
    lastMinute = minute;
    if (H.dirty || minute % 15 === 0 || minute === 91) computeLines(H, minute);
    if (A.dirty || minute % 15 === 0 || minute === 91) computeLines(A, minute);

    // Possession: mid strength, modified by who is pressing whom
    const pressStrength = (s: Side) => ((s.instr.press - 1) / 4) * clamp(s.tac.pressPower / 58, 0.6, 1.3);
    const resist = (s: Side) => clamp(s.tac.resist / 58, 0.7, 1.3) * (s.instr.passing === 'long' ? 1.5 : s.instr.passing === 'short' ? 0.95 : 1.1);
    const hMid = H.lines.mid * (1 + homeAdv * 0.03) * (1 + 0.012 * (pressStrength(H) - pressStrength(A)));
    const aMid = A.lines.mid;
    const pH = Math.pow(hMid, 3.2) / (Math.pow(hMid, 3.2) + Math.pow(aMid, 3.2));
    let attSide = rand() < pH ? H : A;
    let defSide = opp(attSide);
    let pressTurn = false;
    // High-press turnover: the defending side wins the ball in the opposition half
    const turnP = 0.085 * pressStrength(defSide) / resist(attSide);
    if (turnP > 0.001 && chance(turnP)) { [attSide, defSide] = [defSide, attSide]; pressTurn = true; attSide.log.pressWins++; }
    const transition = lastAtt !== null && lastAtt !== attSide;
    lastAtt = attSide;
    attSide.poss++;
    const tempoAdj = attSide.instr.tempo - 3;
    const passBase = 6 + randInt(0, 5) + (attSide.instr.passing === 'short' ? 1.8 : attSide.instr.passing === 'long' ? -2.2 : 0) - tempoAdj * 0.2;
    attSide.stats.passes += Math.max(2, Math.round(passBase));

    // Attack phase
    const counterNow = transition && attSide.instr.counter && !pressTurn;
    const attackProb = clamp(0.46 + attSide.ml * 0.022 + tempoAdj * 0.022 + (attSide.instr.passing === 'long' ? 0.015 : 0) + (counterNow ? 0.08 : 0) + (pressTurn ? 0.18 : 0), 0.28, 0.7);
    if (chance(attackProb)) {
      if (counterNow) attSide.log.counterAttacks++;
      const lineGap = defSide.instr.line - 3;
      const wideShare = clamp(0.3 + (attSide.instr.width - 3) * 0.12 + (attSide.instr.passing === 'long' ? 0.06 : 0), 0.08, 0.75);
      const viaWide = rand() < wideShare;
      let diff = attSide.lines.atk + (attSide.sheet.home && homeAdv ? 1.5 : 0) - defSide.lines.def;
      if (viaWide) {
        diff += (attSide.tac.wideAtt - defSide.tac.wideDef) * 0.09 + (attSide.tac.air - defSide.tac.air) * 0.03 * (attSide.instr.passing === 'long' ? 1.4 : 1);
        attSide.log.wideChances++;
      } else {
        diff += (attSide.tac.centreAtt - defSide.tac.centreDef) * 0.09;
        attSide.log.centralChances++;
      }
      // Ball in behind a high line
      let behind = false;
      if (lineGap > 0 || counterNow) {
        const paceF = clamp((attSide.tac.paceAtk - defSide.tac.paceDef) / 14 + 1, 0.25, 2);
        const pB = Math.max(0, 0.04 * Math.max(lineGap, 0.5)) * paceF * (defSide.tac.sweeper ? 0.55 : 1) * (counterNow ? 1.6 : 1) * (attSide.instr.passing === 'long' ? 1.25 : 1);
        if (chance(pB)) behind = true;
      }
      if (defSide.tac.sweeper && lineGap > 0 && chance(0.05)) defSide.log.gkSweeps++;
      if (behind) {
        attSide.log.behindChances++;
        shoot(attSide, defSide, minute, clamp(0.17 * Math.exp(diff / 45) * (-Math.log(1 - rand() * 0.9) * 0.6 + 0.55), 0.05, 0.8), 'behind');
      } else {
        const shotProb = clamp(0.5 + diff / 120 - lineGap * 0.02 + (pressTurn ? 0.1 : 0), 0.28, 0.78);
        if (chance(shotProb)) {
          const q = Math.exp(diff / 35);
          const base = 0.105 * q * (attSide.instr.passing === 'long' ? 0.92 : attSide.instr.passing === 'short' ? 1.03 : 1) * (counterNow ? 1.12 : 1) * (pressTurn ? 1.1 : 1);
          const xg = clamp(base * (-Math.log(1 - rand() * 0.98) * 0.85 + 0.15), 0.01, 0.75);
          shoot(attSide, defSide, minute, xg, pressTurn ? 'press' : counterNow ? 'counter' : viaWide ? 'cross' : 'open');
        }
      }
    }

    // Fouls and discipline
    if (chance(0.22 + (defSide.instr.press - 3) * 0.008 + (attSide.instr.tempo - 3) * 0.004)) {
      const foulSide = chance(0.6 + (defSide.instr.press - 3) * 0.03 + (defSide.ml - attSide.ml) * 0.01) ? defSide : attSide;
      const fouler = weighted(foulSide.live.filter((l) => l.on), (l) => ({ DF: 1.2, MF: 1.4, FW: 0.7, GK: 0.05 }[l.slot]) * (110 - l.p.mental.composure) * (l.role.press ? 1 + (l.role.press - 1) * 0.5 : 1));
      foulSide.stats.fouls++; fouler.fouls++;
      if (foulSide === defSide && chance(0.04)) shoot(attSide, defSide, minute, 0.76, 'penalty');
      else if (foulSide === defSide && chance(0.07)) {
        // direct free kick in a shooting position
        const taker = attSide.live.filter((l) => l.on && l.slot !== 'GK').reduce((b, l) => (l.p.tech.shooting + l.p.tech.passing > b.p.tech.shooting + b.p.tech.passing ? l : b));
        shoot(attSide, defSide, minute, clamp(0.03 + (taker.p.tech.shooting - 55) / 900, 0.015, 0.08), 'freekick');
      }
      const r = rand();
      if (r < 0.008) {
        fouler.red++; fouler.on = false; fouler.to = minute; foulSide.reds++; foulSide.stats.red++; foulSide.dirty = true;
        bans.push({ playerId: fouler.p.id, matches: randInt(1, 3) });
        pushEvent({ min: minute, type: 'red', team: foulSide.key, playerId: fouler.p.id, player: fouler.p.name, detail: 'Straight red' });
      } else if (r < 0.008 + 0.16) {
        if (yellowed.has(fouler.p.id)) {
          fouler.yellow++; foulSide.stats.yellow++;
          pushEvent({ min: minute, type: 'yellow', team: foulSide.key, playerId: fouler.p.id, player: fouler.p.name, detail: 'Second yellow' });
          fouler.red++; fouler.on = false; fouler.to = minute; foulSide.reds++; foulSide.stats.red++; foulSide.dirty = true;
          bans.push({ playerId: fouler.p.id, matches: 1 });
          pushEvent({ min: minute, type: 'red', team: foulSide.key, playerId: fouler.p.id, player: fouler.p.name, detail: 'Second yellow' });
        } else {
          yellowed.add(fouler.p.id);
          fouler.yellow++; foulSide.stats.yellow++;
          pushEvent({ min: minute, type: 'yellow', team: foulSide.key, playerId: fouler.p.id, player: fouler.p.name });
        }
      }
    }

    // Injuries
    for (const s of [H, A]) {
      if (chance(0.0018)) {
        const victim = weighted(s.live.filter((l) => l.on), (l) => 110 - l.p.fitness);
        const r = rand();
        const med = 1 - ((s.sheet.medical ?? 3) - 3) * 0.06;
        const weeks = Math.max(1, Math.round((r < 0.7 ? randInt(1, 3) : r < 0.95 ? randInt(4, 8) : randInt(9, 20)) * med));
        const days = Math.max(3, Math.round(weeks * 7 * (0.8 + rand() * 0.4)));
        const label = weeks <= 2 ? pick(['Knock', 'Muscle strain', 'Bruised ankle']) : weeks <= 8 ? pick(['Hamstring injury', 'Ankle sprain', 'Calf strain']) : pick(['Knee ligament injury', 'Broken metatarsal', 'Torn hamstring']);
        victim.on = false; victim.to = minute; s.dirty = true;
        injuries.push({ playerId: victim.p.id, weeks, days, injury: label });
        pushEvent({ min: minute, type: 'injury', team: s.key, playerId: victim.p.id, player: victim.p.name, detail: label });
        substitute(s, victim, minute, 'injury');
      }
    }

    // Tactical fatigue substitutions
    if (minute === 62 || minute === 72 || minute === 80 || minute === 105) {
      for (const s of [H, A]) {
        const tired = s.live.filter((l) => l.on && l.slot !== 'GK' && l.p.fitness < 72).sort((a, b) => a.p.fitness - b.p.fitness);
        if (tired[0] && chance(0.8)) substitute(s, tired[0], minute, 'tactical');
      }
    }
  }

  // ---- Penalty shootout ----
  let shootout: MatchReport['shootout'];
  if (opts.knockout && hg === ag) {
    const takers = (s: Side) => s.live.filter((l) => l.on && l.slot !== 'GK').sort((a, b) => (b.p.tech.finishing + b.p.mental.composure) - (a.p.tech.finishing + a.p.mental.composure));
    const keeperOf = (s: Side) => s.live.find((l) => l.on && l.slot === 'GK');
    const th = takers(H), ta = takers(A);
    const kicks: NonNullable<MatchReport['shootout']>['kicks'] = [];
    let sh = 0, sa = 0;
    const take = (s: Side, list: Live[], n: number, other: Side): boolean => {
      const t = list[n % Math.max(1, list.length)];
      if (!t) return false;
      const gk = keeperOf(other);
      const p = clamp(0.76 + (t.p.mental.composure - 60) * 0.002 + (t.p.tech.finishing - 60) * 0.0015 - ((gk?.p.tech.handling ?? 50) - 60) * 0.0015, 0.55, 0.92);
      const scored = rand() < p;
      kicks.push({ team: s.key, player: t.p.name, scored });
      return scored;
    };
    for (let n = 0; n < 5; n++) {
      if (take(H, th, n, A)) sh++;
      if (sh > sa + (4 - n) || sa > sh + (5 - n)) break;
      if (take(A, ta, n, H)) sa++;
      if (sh > sa + (4 - n) || sa > sh + (4 - n)) break;
    }
    let n = 5;
    while (sh === sa && n < 25) {
      const a = take(H, th, n, A), b = take(A, ta, n, H);
      if (a) sh++;
      if (b) sa++;
      n++;
    }
    if (sh === sa) { if (chance(0.5)) sh++; else sa++; }
    shootout = { home: sh, away: sa, kicks };
  }

  // ---- Final stats from simulated events ----
  const all = [...H.live, ...A.live];
  const uniq = Array.from(new Set(all));
  uniq.forEach((l) => { if (l.on) l.to = lastMinute; });

  const finalise = (s: Side) => {
    const st = s.stats;
    st.possession = Math.round((s.poss / lastMinute) * 100);
    const live = s.live.filter((l) => l.from < l.to || l.start);
    const pass = live.length ? live.reduce((a, l) => a + (l.p.tech.passing + l.p.mental.vision) / 2, 0) / live.length : 55;
    const acc = clamp(0.55 + 0.005 * pass + (s.instr.passing === 'short' ? 0.025 : s.instr.passing === 'long' ? -0.05 : 0) - (s.instr.tempo - 3) * 0.012 + gauss() * 0.01, 0.6, 0.95);
    st.passAcc = Math.round(acc * 100);
    st.xg = Math.round(st.xg * 100) / 100;
  };
  H.stats.possession = 0;
  finalise(H); finalise(A);
  A.stats.possession = 100 - H.stats.possession;

  const cleanH = ag === 0, cleanA = hg === 0;
  const players: PlayerMatch[] = [];
  const buildRatings = (s: Side, gf: number, ga: number, won: boolean, lost: boolean) => {
    const seen = new Set<Live>();
    s.live.forEach((l) => {
      if (seen.has(l)) return; seen.add(l);
      if (!l.start && l.from === 0 && !l.on && l.to === 90 && l.p.id) {
        const used = events.some((e) => e.type === 'sub' && e.playerId === l.p.id);
        if (!used) return;
      }
      const minutes = Math.max(0, l.to - l.from);
      if (minutes === 0 && !l.start) return;
      let r = 6.0;
      r += l.goals * 1.05 + l.assists * 0.65;
      r += l.saves * 0.2;
      const clean = (s.key === 'home' ? cleanH : cleanA) && minutes >= 60;
      if (clean) r += l.slot === 'GK' ? 0.8 : l.slot === 'DF' ? 0.5 : l.slot === 'MF' ? 0.2 : 0;
      if (l.slot === 'GK') r -= ga * 0.25; else if (l.slot === 'DF') r -= ga * 0.15;
      r += won ? 0.35 : lost ? -0.3 : 0;
      r -= l.yellow * 0.2 + l.red * 1.5;
      r += (l.p.ovr * condition(l.p) - 66) / 55;
      r += gauss() * 0.35;
      if (minutes < 45) r = 6 + (r - 6) * (minutes / 45 + 0.3);
      r = Math.round(clamp(r, 3.0, 10.0) * 10) / 10;
      players.push({ id: l.p.id, name: l.p.name, pos: l.p.pos, team: s.key, started: l.start, minutes, rating: r, goals: l.goals, assists: l.assists, shots: l.shots, saves: l.saves, yellow: l.yellow, red: l.red });
    });
  };
  buildRatings(H, hg, ag, hg > ag, hg < ag);
  buildRatings(A, ag, hg, ag > hg, ag < hg);
  const motm = players.reduce((b, p) => (p.rating > b.rating ? p : b), players[0]);

  const report: MatchReport = {
    fixtureId, week, date, leagueId, homeId: home.clubId, awayId: away.clubId, homeName: home.name, awayName: away.name,
    hg, ag, events, stats: { home: H.stats, away: A.stats }, players, motm: motm?.id ?? '',
    analysis: [], injuries, bans,
    comp: opts.comp ?? 'league', compName: opts.compName, et: lastMinute > 90 || undefined, shootout,
    tac: { home: H.log, away: A.log },
  };
  report.analysis = buildAnalysis(report, home, away);
  report.factors = tacticalFactors(report, H, A);
  return report;
}

// ---------- Tactical explanation ----------
function tacticalFactors(r: MatchReport, H: Side, A: Side): string[] {
  const out: string[] = [];
  const sides: [Side, Side, string, string][] = [[H, A, r.homeName, r.awayName], [A, H, r.awayName, r.homeName]];
  const goalsFor = (s: Side) => (s.key === 'home' ? r.hg : r.ag);
  for (const [s, o, name, oname] of sides) {
    const L = s.log, I = s.instr;
    if (I.press >= 4 && L.pressWins >= 3) out.push(`${name}'s ${I.press === 5 ? 'gegenpress' : 'high press'} won the ball back ${L.pressWins} times in advanced areas, producing ${L.pressShots} shot${L.pressShots === 1 ? '' : 's'}${L.pressGoals ? ` and ${L.pressGoals} goal${L.pressGoals > 1 ? 's' : ''}` : ''}.`);
    if (L.fatigue >= 0.03 && (I.press >= 4 || I.tempo >= 4)) out.push(`${name}'s intensity (${[I.press >= 4 ? 'pressing' : '', I.tempo >= 4 ? 'tempo' : ''].filter(Boolean).join(' and ')}) drained the legs: output dropped by about ${Math.round(L.fatigue * 100)}% late on${s.log.lateConceded ? ` and they conceded ${s.log.lateConceded} after the 65th minute` : ''}.`);
    if (I.counter && L.counterAttacks >= 3) out.push(`${name} struck on the break ${L.counterAttacks} times${L.counterGoals ? `, scoring ${L.counterGoals}` : ' without finding the finish'}.`);
    if (o.instr.line >= 4 && L.behindChances >= 1) out.push(`${oname}'s ${o.instr.line === 5 ? 'very high' : 'high'} line was exposed by pace: ${name} created ${L.behindChances} big chance${L.behindChances > 1 ? 's' : ''} in behind${L.behindGoals ? ` and scored ${L.behindGoals}` : ''}${o.tac.sweeper ? ' (the sweeper-keeper cut out others)' : ''}.`);
    if (o.tac.sweeper && o.log.gkSweeps >= 2) out.push(`${oname}'s sweeper-keeper mopped up ${o.log.gkSweeps} balls over the top.`);
    if (L.corners >= 4 && L.cornerGoals) out.push(`${name} scored from a corner (${L.corners} won) - the ${I.corners === 'far' ? 'far-post' : 'near-post'} routine against ${o.instr.setPieces} marking paid off.`);
    const wideBias = L.wideChances > L.centralChances * 1.5 && I.width >= 4;
    if (wideBias && L.wideChances >= 8) out.push(`${name} attacked down the flanks (${L.wideChances} wide moves against ${L.centralChances} central).`);
    if (I.width <= 2 && L.centralChances > L.wideChances * 1.5 && L.centralChances >= 8) out.push(`${name} narrowed the pitch and played through the middle (${L.centralChances} central moves).`);
    if (s.fam < 45) out.push(`${name} looked uncomfortable: the players are still learning the system (familiarity ${Math.round(s.fam)}%).`);
    else if (s.fam >= 85) out.push(`${name} were well drilled (familiarity ${Math.round(s.fam)}%).`);
    if (s.ml === 2 && o.log.counterAttacks + o.log.behindChances >= 4 && goalsFor(o) >= 2) out.push(`${name}'s all-out attack left gaps that ${oname} exploited.`);
    if (s.ml <= -2 && goalsFor(s) === 0 && s.stats.shots <= 5) out.push(`${name}'s ultra-defensive approach left them with little attacking threat (${s.stats.shots} shot${s.stats.shots === 1 ? '' : 's'}).`);
    // star role contribution
    const roleMen = s.live.filter((l) => (l.role.id === 'app' || l.role.id === 'dlp' || l.role.id === 'tf' || l.role.id === 'poacher' || l.role.id === 'inside_forward') && (l.assists + l.goals) >= 1);
    const top = roleMen.sort((a, b) => b.goals + b.assists - a.goals - a.assists)[0];
    if (top) out.push(`${top.p.name}, playing as ${top.role.label.toLowerCase()}, was decisive (${top.goals ? `${top.goals} goal${top.goals > 1 ? 's' : ''}` : ''}${top.goals && top.assists ? ' and ' : ''}${top.assists ? `${top.assists} assist${top.assists > 1 ? 's' : ''}` : ''}).`);
  }
  const posDiff = Math.abs(r.stats.home.possession - r.stats.away.possession);
  if (posDiff >= 20) {
    const dom = r.stats.home.possession > r.stats.away.possession ? H : A;
    const dn = dom === H ? r.homeName : r.awayName;
    out.push(`${dn} dominated the ball (${Math.max(r.stats.home.possession, r.stats.away.possession)}%), helped by ${dom.instr.passing === 'short' ? 'short passing' : 'strong midfield control'}${dom.instr.press >= 4 ? ' and a high press' : ''}.`);
  }
  if (r.et) out.push(`The tie went to extra time; tired legs shaped the extra period.`);
  if (r.shootout) out.push(`Decided on penalties: ${r.shootout.home}-${r.shootout.away}.`);
  return out.slice(0, 7);
}

function buildAnalysis(r: MatchReport, home: TeamSheet, away: TeamSheet): string[] {
  const out: string[] = [];
  const { home: hs, away: as } = r.stats;
  const winner = r.hg > r.ag ? r.homeName : r.ag > r.hg ? r.awayName : null;
  const xgDiff = hs.xg - as.xg;
  if (!winner) {
    out.push(`A ${r.hg}-${r.ag} draw${r.et ? ' after extra time' : ''}. ${Math.abs(xgDiff) > 0.8 ? `${xgDiff > 0 ? r.homeName : r.awayName} created the better chances (xG ${hs.xg.toFixed(2)} - ${as.xg.toFixed(2)}) but could not take them.` : 'Neither side created a clear advantage.'}`);
  } else {
    const wInfo = winner === r.homeName ? { xg: hs.xg, oxg: as.xg } : { xg: as.xg, oxg: hs.xg };
    if (wInfo.xg >= wInfo.oxg + 0.5) out.push(`${winner} deserved the win, out-creating their opponents (xG ${wInfo.xg.toFixed(2)} - ${wInfo.oxg.toFixed(2)}).`);
    else out.push(`${winner} won despite the chance quality being fairly even (xG ${wInfo.xg.toFixed(2)} - ${wInfo.oxg.toFixed(2)}) - a result decided by finishing.`);
  }
  const dom = hs.possession >= 58 ? r.homeName : as.possession >= 58 ? r.awayName : null;
  if (dom) out.push(`${dom} controlled the ball with ${Math.max(hs.possession, as.possession)}% possession.`);
  const domSheet = dom === r.homeName ? home : away;
  if (dom && domSheet && winner && winner !== dom) out.push(`${winner} absorbed the pressure and hit back - possession did not turn into goals for ${dom}.`);
  const overH = r.hg - hs.xg, overA = r.ag - as.xg;
  if (overH > 1.2) out.push(`${r.homeName} were clinical, scoring ${r.hg} from just ${hs.xg.toFixed(1)} expected goals.`);
  if (overA > 1.2) out.push(`${r.awayName} were clinical, scoring ${r.ag} from just ${as.xg.toFixed(1)} expected goals.`);
  if (overH < -1.2) out.push(`${r.homeName} were wasteful in front of goal.`);
  if (overA < -1.2) out.push(`${r.awayName} were wasteful in front of goal.`);
  const reds = r.events.filter((e) => e.type === 'red');
  if (reds.length) out.push(`${reds[0].player} was sent off on ${reds[0].min}' for ${reds[0].team === 'home' ? r.homeName : r.awayName}, which shaped the second half.`);
  if (r.injuries.length) out.push(`${r.injuries.length === 1 ? 'One injury' : r.injuries.length + ' injuries'} to monitor after the match.`);
  const m = r.players.find((p) => p.id === r.motm);
  if (m) out.push(`Man of the match: ${m.name} (${m.rating.toFixed(1)}).`);
  return out;
}
