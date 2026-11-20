import type { Formation, MatchEvent, MatchReport, Mentality, Player, PlayerMatch, Pos, Style, TeamStats } from './types';
import { FORMATIONS, condition, posFit } from './team';
import { chance, clamp, gauss, pick, rand, randInt, weighted } from './rng';

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
}

interface Live {
  p: Player;
  slot: Pos;
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
  live: Live[];
  bench: Live[];
  subs: number;
  reds: number;
  poss: number;
  stats: TeamStats;
  lines: { atk: number; mid: number; def: number; gk: number };
  dirty: boolean;
}

function mkLive(p: Player, slot: Pos, start: boolean): Live {
  const fit = posFit(p.pos, slot) * condition(p);
  const att = ((p.tech.shooting + p.tech.finishing + p.tech.dribbling + p.phys.pace) / 4) * fit;
  const cre = ((p.tech.passing + p.mental.vision + p.tech.dribbling) / 3) * fit;
  const def = ((p.tech.tackling + p.mental.positioning + p.phys.strength + p.mental.workrate) / 4) * fit;
  const gk = (p.tech.handling * 0.7 + p.mental.positioning * 0.3) * fit;
  return { p, slot, fit, att, cre, def, gk, start, on: start, from: 0, to: 90, goals: 0, assists: 0, shots: 0, saves: 0, yellow: 0, red: 0, fouls: 0 };
}

function emptyStats(): TeamStats {
  return { possession: 0, shots: 0, onTarget: 0, blocked: 0, xg: 0, passes: 0, passAcc: 0, fouls: 0, corners: 0, yellow: 0, red: 0, saves: 0 };
}

function computeLines(s: Side): void {
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
  // Tactics
  const m = s.sheet.mentality, st = s.sheet.style;
  if (m === 'attacking') { atk += 3; def -= 3; } else if (m === 'defensive') { atk -= 3; def += 3; }
  if (st === 'possession') mid += 2; else if (st === 'direct') { mid -= 2; atk += 1; } else { mid -= 3; atk += 2; def += 1; }
  // Numerical disadvantage / fewer players on pitch
  const missing = Math.max(0, 11 - on.length);
  const pen = 1 - missing * 0.075;
  s.lines = { atk: atk * pen, mid: mid * pen, def: def * pen, gk: gkv };
  s.dirty = false;
}

function pickShooter(s: Side): Live {
  const on = s.live.filter((l) => l.on && l.slot !== 'GK');
  return weighted(on, (l) => ({ FW: 5, MF: 2.2, DF: 0.6, GK: 0 }[l.slot]) * (l.p.tech.finishing * 0.6 + l.p.tech.shooting * 0.4) / 60);
}
function pickAssister(s: Side, not: Live): Live | null {
  const on = s.live.filter((l) => l.on && l !== not && l.slot !== 'GK');
  if (!on.length) return null;
  return weighted(on, (l) => ({ FW: 2.4, MF: 3, DF: 1, GK: 0 }[l.slot]) * (l.p.tech.passing * 0.5 + l.p.mental.vision * 0.5) / 60);
}

export function simulateMatch(home: TeamSheet, away: TeamSheet, fixtureId: string, week: number, date?: number, leagueId?: string): MatchReport {
  const mkSide = (sheet: TeamSheet, key: 'home' | 'away'): Side => {
    const slots = FORMATIONS[sheet.formation];
    const fam = 0.97 + 0.03 * ((sheet.familiarity ?? 60) / 100);
    const tune = (l: Live): Live => { l.att *= fam; l.cre *= fam; l.def *= fam; return l; };
    const live = sheet.xi.map((p, i) => tune(mkLive(p, slots[i].pos, true)));
    const bench = sheet.bench.map((p) => tune(mkLive(p, p.pos, false)));
    return { sheet, key, live, bench, subs: 0, reds: 0, poss: 0, stats: emptyStats(), lines: { atk: 50, mid: 50, def: 50, gk: 50 }, dirty: true };
  };
  const H = mkSide(home, 'home');
  const A = mkSide(away, 'away');
  const events: MatchEvent[] = [];
  const injuries: MatchReport['injuries'] = [];
  const bans: MatchReport['bans'] = [];
  let hg = 0, ag = 0;
  const yellowed = new Set<string>();

  const sideOf = (k: 'home' | 'away') => (k === 'home' ? H : A);
  const opp = (s: Side) => (s === H ? A : H);

  const pushEvent = (e: MatchEvent) => events.push(e);

  const substitute = (s: Side, out: Live, minute: number, reason: string): boolean => {
    if (s.subs >= 5) return false;
    const cands = s.bench.filter((b) => !b.on && b.to === 90 && b.p.injuredDays <= 0 && b.p.suspended <= 0 && !b.red);
    if (!cands.length) return false;
    const grp = out.slot;
    const sameGroup = cands.filter((b) => b.p.pos === grp);
    const choice = (sameGroup.length ? sameGroup : cands).sort((a, b) => b.p.ovr * condition(b.p) - a.p.ovr * condition(a.p))[0];
    // goalkeeper can only be replaced by another goalkeeper
    if (grp === 'GK' && choice.p.pos !== 'GK') return false;
    out.on = false; out.to = minute;
    const slotPos = out.slot;
    const idx = s.live.indexOf(out);
    const fresh = mkLive(choice.p, slotPos, false);
    fresh.on = true; fresh.from = minute;
    // reuse bench record so stats stay attached
    Object.assign(choice, fresh);
    s.live[idx] = out; // keep outgoing record for stats
    s.live.push(choice);
    s.subs++;
    s.dirty = true;
    pushEvent({ min: minute, type: 'sub', team: s.key, playerId: choice.p.id, player: choice.p.name, assistId: out.p.id, assist: out.p.name, detail: reason });
    return true;
  };

  const shoot = (att: Side, def: Side, minute: number, xg: number, penalty = false): void => {
    const shooter = penalty ? [...att.live.filter((l) => l.on && l.slot !== 'GK')].sort((a, b) => b.p.tech.finishing - a.p.tech.finishing)[0] : pickShooter(att);
    const gk = def.lines.gk;
    const adj = clamp(1 + (shooter.p.tech.finishing - gk) / 110, 0.6, 1.5);
    att.stats.shots++; shooter.shots++; att.stats.xg += xg;
    if (rand() < Math.min(0.95, xg * adj)) {
      att.stats.onTarget++;
      let assister: Live | null = null;
      if (!penalty && chance(0.72)) assister = pickAssister(att, shooter);
      shooter.goals++;
      if (assister) assister.assists++;
      if (att.key === 'home') hg++; else ag++;
      pushEvent({ min: minute, type: 'goal', team: att.key, playerId: shooter.p.id, player: shooter.p.name, assistId: assister?.p.id, assist: assister?.p.name, detail: penalty ? 'penalty' : undefined });
      return;
    }
    if (penalty) {
      // missed penalty: saved or off target
      if (chance(0.6)) { att.stats.onTarget++; def.stats.saves++; const g = def.live.find((l) => l.on && l.slot === 'GK'); if (g) g.saves++; }
      pushEvent({ min: minute, type: 'pen_miss', team: att.key, playerId: shooter.p.id, player: shooter.p.name });
      return;
    }
    const r = rand();
    if (r < 0.28) {
      att.stats.onTarget++; def.stats.saves++;
      const g = def.live.find((l) => l.on && l.slot === 'GK'); if (g) g.saves++;
      if (chance(0.3)) att.stats.corners++;
    } else if (r < 0.43) {
      att.stats.blocked++;
      if (chance(0.4)) att.stats.corners++;
    } else if (chance(0.08)) att.stats.corners++;
  };

  for (let minute = 1; minute <= 90; minute++) {
    if (H.dirty) computeLines(H);
    if (A.dirty) computeLines(A);

    // Possession for this minute
    const hMid = H.lines.mid * (home.home ? 1.03 : 1);
    const aMid = A.lines.mid;
    const pH = Math.pow(hMid, 3.2) / (Math.pow(hMid, 3.2) + Math.pow(aMid, 3.2));
    const attSide = rand() < pH ? H : A;
    const defSide = opp(attSide);
    attSide.poss++;
    const passBase = 6 + randInt(0, 5) + (attSide.sheet.style === 'possession' ? 1.5 : attSide.sheet.style === 'direct' ? -2 : -0.5);
    attSide.stats.passes += Math.round(passBase);

    // Attack phase
    const attackProb = clamp(0.46 + (attSide.sheet.mentality === 'attacking' ? 0.04 : attSide.sheet.mentality === 'defensive' ? -0.04 : 0) + (attSide.sheet.style === 'direct' ? 0.02 : 0), 0.3, 0.6);
    if (chance(attackProb)) {
      const diff = attSide.lines.atk + (attSide.sheet.home ? 1.5 : 0) - defSide.lines.def;
      const shotProb = clamp(0.5 + diff / 120, 0.3, 0.75);
      if (chance(shotProb)) {
        const q = Math.exp(diff / 35);
        const base = 0.105 * q * (attSide.sheet.style === 'direct' ? 0.9 : attSide.sheet.style === 'counter' ? 1.08 : 1);
        const xg = clamp(base * (-Math.log(1 - rand() * 0.98) * 0.85 + 0.15), 0.01, 0.75);
        shoot(attSide, defSide, minute, xg);
      }
    }

    // Fouls and discipline
    if (chance(0.22)) {
      const foulSide = chance(0.6) ? defSide : attSide;
      const fouler = weighted(foulSide.live.filter((l) => l.on), (l) => ({ DF: 1.2, MF: 1.4, FW: 0.7, GK: 0.05 }[l.slot]) * (110 - l.p.mental.composure));
      foulSide.stats.fouls++; fouler.fouls++;
      if (foulSide === defSide && chance(0.04)) {
        // penalty to the attacking side
        shoot(attSide, defSide, minute, 0.76, true);
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
    if (minute === 62 || minute === 72 || minute === 80) {
      for (const s of [H, A]) {
        const tired = s.live.filter((l) => l.on && l.slot !== 'GK' && l.p.fitness < 72).sort((a, b) => a.p.fitness - b.p.fitness);
        if (tired[0] && s.subs < 5 && chance(0.8)) substitute(s, tired[0], minute, 'tactical');
      }
    }
  }

  // ---- Final stats from simulated events ----
  const all = [...H.live, ...A.live];
  // dedupe (bench records were reused)
  const uniq = Array.from(new Set(all));
  uniq.forEach((l) => { if (l.on) l.to = 90; });

  const finalise = (s: Side) => {
    const st = s.stats;
    st.possession = Math.round((s.poss / 90) * 100);
    const live = s.live.filter((l) => l.from < l.to || l.start);
    const pass = live.length ? live.reduce((a, l) => a + (l.p.tech.passing + l.p.mental.vision) / 2, 0) / live.length : 55;
    const acc = clamp(0.55 + 0.005 * pass + (s.sheet.style === 'possession' ? 0.02 : s.sheet.style === 'direct' ? -0.04 : 0) + gauss() * 0.01, 0.6, 0.95);
    st.passAcc = Math.round(acc * 100);
    st.xg = Math.round(st.xg * 100) / 100;
  };
  H.stats.possession = 0;
  finalise(H); finalise(A);
  // keep possession summing to 100
  A.stats.possession = 100 - H.stats.possession;

  const cleanH = ag === 0, cleanA = hg === 0;
  const players: PlayerMatch[] = [];
  const buildRatings = (s: Side, gf: number, ga: number, won: boolean, lost: boolean) => {
    const seen = new Set<Live>();
    s.live.forEach((l) => {
      if (seen.has(l)) return; seen.add(l);
      if (!l.start && l.from === 0 && !l.on && l.to === 90 && l.p.id) {
        // unused bench record that never entered? (from stays 0 & never subbed)
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
  };
  report.analysis = buildAnalysis(report, home, away);
  return report;
}

function buildAnalysis(r: MatchReport, home: TeamSheet, away: TeamSheet): string[] {
  const out: string[] = [];
  const { home: hs, away: as } = r.stats;
  const winner = r.hg > r.ag ? r.homeName : r.ag > r.hg ? r.awayName : null;
  const xgDiff = hs.xg - as.xg;
  if (!winner) {
    out.push(`A ${r.hg}-${r.ag} draw. ${Math.abs(xgDiff) > 0.8 ? `${xgDiff > 0 ? r.homeName : r.awayName} created the better chances (xG ${hs.xg.toFixed(2)} - ${as.xg.toFixed(2)}) but could not take them.` : 'Neither side created a clear advantage.'}`);
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
