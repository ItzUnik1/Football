import type { Game, LeagueSeason, Player, SeasonAward, SeasonRecord } from './types';
import { computeTable } from './fixtures';
import { makeFixtures } from './fixtures';
import { addMessage, gameNow } from './messages';
import { annualDevelopment } from './development';
import { prizeMoney } from './finance';
import { academyAgeOut, intakeMessage, youthIntake } from './youth';
import { clubRecords } from './history';
import { invalidateIndex, squadOf } from './team';
import { makeLeagues, makePlayer, makeYouth } from './generator';
import { seasonLabel, seasonOf, contractEndFor, contractYearsLeft, addDays, seasonStart } from './calendar';
import { ordinal, seasonEndBoard, initBoard } from './board';
import { activateLoanOption, contractDemand, maxYears } from './transfers';
import { chance, randInt, pick, clamp } from './rng';
import { fmtMoney, valueOf } from './valuation';
import { LEAGUE_DEFS } from './names';
import { addTx } from './messages';

const avg = (p: Player) => (p.stats.apps ? p.stats.ratingSum / p.stats.apps : 0);

function leagueSeason(g: Game, lid: string): LeagueSeason {
  const lg = g.leagues[lid];
  const table = computeTable(g, lid);
  const ids = new Set(lg.clubIds);
  const ps = Object.values(g.players).filter((p) => p.clubId && ids.has(p.parentClubId ?? p.clubId));
  const top = (key: 'goals' | 'assists' | 'cleanSheets') => ps.filter((p) => p.stats[key] > 0).sort((a, b) => b.stats[key] - a.stats[key]).slice(0, 5);
  return {
    leagueId: lid, leagueName: lg.name, tier: lg.tier, table, champion: table[0].clubId,
    promoted: table.slice(0, lg.promote).map((r) => r.clubId),
    relegated: lg.relegate ? table.slice(-lg.relegate).map((r) => r.clubId) : [],
    topScorers: top('goals').map((p) => ({ playerId: p.id, name: p.name, clubId: p.parentClubId ?? p.clubId!, goals: p.stats.goals })),
    topAssists: top('assists').map((p) => ({ playerId: p.id, name: p.name, clubId: p.parentClubId ?? p.clubId!, assists: p.stats.assists })),
    cleanSheets: top('cleanSheets').map((p) => ({ playerId: p.id, name: p.name, clubId: p.parentClubId ?? p.clubId!, n: p.stats.cleanSheets })),
  };
}

function awards(g: Game, l1: LeagueSeason): SeasonAward[] {
  const ids = new Set(g.leagues.L1.clubIds);
  const ps = Object.values(g.players).filter((p) => p.clubId && ids.has(p.parentClubId ?? p.clubId) && p.stats.apps >= 15);
  const out: SeasonAward[] = [];
  const best = [...ps].sort((a, b) => avg(b) + b.stats.goals * 0.02 - (avg(a) + a.stats.goals * 0.02))[0];
  if (best) out.push({ award: 'Player of the Season', playerId: best.id, name: best.name, clubId: best.clubId!, detail: `${avg(best).toFixed(2)} avg rating, ${best.stats.goals} goals` });
  const sc = l1.topScorers[0];
  if (sc) out.push({ award: 'Golden Boot', playerId: sc.playerId, name: sc.name, clubId: sc.clubId, detail: `${sc.goals} goals` });
  const as = l1.topAssists[0];
  if (as) out.push({ award: 'Playmaker Award', playerId: as.playerId, name: as.name, clubId: as.clubId, detail: `${as.assists} assists` });
  const young = ps.filter((p) => p.age <= 21).sort((a, b) => avg(b) - avg(a))[0];
  if (young) out.push({ award: 'Young Player of the Season', playerId: young.id, name: young.name, clubId: young.clubId!, detail: `${avg(young).toFixed(2)} avg rating (age ${young.age})` });
  const gk = ps.filter((p) => p.pos === 'GK').sort((a, b) => b.stats.cleanSheets - a.stats.cleanSheets)[0];
  if (gk) out.push({ award: 'Golden Glove', playerId: gk.id, name: gk.name, clubId: gk.clubId!, detail: `${gk.stats.cleanSheets} clean sheets` });
  return out;
}

/** Performs everything that happens on 1 July: season records, promotion/relegation, contracts, ageing, new fixtures. */
export function rolloverSeason(g: Game): void {
  const season = g.meta.season;
  const now = gameNow(g);
  const user = g.meta.userClubId;
  const userClub = g.clubs[user];
  const userLid = userClub.leagueId ?? 'L1';

  // 1. Season records and awards
  const lss = Object.keys(g.leagues).map((lid) => leagueSeason(g, lid));
  const l1 = lss.find((l) => l.leagueId === 'L1')!;
  const userLS = lss.find((l) => l.leagueId === userLid)!;
  const userPos = userLS.table.findIndex((r) => r.clubId === user) + 1;
  const userRow = userLS.table[userPos - 1];
  const aw = awards(g, l1);

  // 2. Prize money and board
  lss.forEach((ls) => ls.table.forEach((r, i) => {
    const pm = prizeMoney(ls.tier, i + 1);
    g.clubs[r.clubId].balance += pm;
    g.clubs[r.clubId].transferBudget += Math.round(pm * 0.2);
    if (r.clubId === user) addTx(g, user, 'prize', pm, `Prize money: ${ordinal(i + 1)} in ${ls.leagueName}`);
  }));
  const board = seasonEndBoard(g, userPos);
  const rec = clubRecords(g, user);
  if (userPos === 1) rec.titles.push(season);
  if (!rec.bestFinish || userLS.tier < rec.bestFinish.tier || (userLS.tier === rec.bestFinish.tier && userPos < rec.bestFinish.pos)) rec.bestFinish = { season, pos: userPos, tier: userLS.tier };
  if (!rec.highestPoints || userRow.points > rec.highestPoints.points) rec.highestPoints = { season, points: userRow.points };
  // Win/defeat records
  for (const f of g.fixtures) {
    if (!f.played || (f.home !== user && f.away !== user)) continue;
    const gf = f.home === user ? f.hg : f.ag, ga = f.home === user ? f.ag : f.hg;
    const opp = g.clubs[f.home === user ? f.away : f.home].name;
    if (gf - ga > 0 && (!rec.biggestWin || gf - ga > Number(rec.biggestWin.score.split('-')[0]) - Number(rec.biggestWin.score.split('-')[1]))) rec.biggestWin = { season, score: `${gf}-${ga}`, opp };
    if (ga - gf > 0 && (!rec.heaviestDefeat || ga - gf > Number(rec.heaviestDefeat.score.split('-')[1]) - Number(rec.heaviestDefeat.score.split('-')[0]))) rec.heaviestDefeat = { season, score: `${gf}-${ga}`, opp };
  }
  const sr: SeasonRecord = { season, leagues: lss, awards: aw, userClubId: user, userLeagueId: userLid, userPos, userPoints: userRow.points, objective: g.board.objectives[0].desc, objectiveMet: board.met };
  g.history.seasons.push(sr);
  const ps = Object.values(g.players).filter((p) => p.clubId === user).sort((a, b) => b.stats.goals - a.stats.goals);
  if (ps[0] && ps[0].stats.goals > 0) {
    const tot = ps[0].career ? ps[0].career.goals + ps[0].stats.goals : ps[0].stats.goals;
    if (!rec.topScorerAllTime || tot > rec.topScorerAllTime.goals) rec.topScorerAllTime = { name: ps[0].name, goals: tot };
  }

  // 3. Career stats and reset
  for (const p of Object.values(g.players)) {
    const cid = p.parentClubId ?? p.clubId;
    if (p.stats.apps > 0 && cid) {
      p.career ??= { apps: 0, goals: 0, assists: 0, cleanSheets: 0, seasons: [] };
      p.career.apps += p.stats.apps; p.career.goals += p.stats.goals; p.career.assists += p.stats.assists; p.career.cleanSheets += p.stats.cleanSheets;
      p.career.seasons.push({ season, clubId: p.clubId ?? cid, leagueId: g.clubs[cid]?.leagueId ?? 'L1', apps: p.stats.apps, goals: p.stats.goals, assists: p.stats.assists, cleanSheets: p.stats.cleanSheets, avgRating: Math.round(avg(p) * 100) / 100, minutes: p.stats.minutes });
      if (p.career.seasons.length > 20) p.career.seasons.shift();
    }
    p.stats = { apps: 0, starts: 0, goals: 0, assists: 0, yellow: 0, red: 0, minutes: 0, ratingSum: 0, cleanSheets: 0 };
    p.suspended = 0; p.yellowCount = 0; p.benchStreak = 0;
  }

  // 4. Promotion / relegation
  const move: Record<string, string> = {};
  const ordered = lss.sort((a, b) => a.tier - b.tier);
  for (let i = 0; i < ordered.length - 1; i++) {
    const upper = ordered[i], lower = ordered[i + 1];
    upper.relegated.forEach((id) => { move[id] = lower.leagueId; });
    lower.promoted.forEach((id) => { move[id] = upper.leagueId; });
  }
  for (const [cid, lid] of Object.entries(move)) g.clubs[cid].leagueId = lid;
  const byLeague: Record<string, string[]> = {};
  Object.values(g.clubs).forEach((c) => { (byLeague[c.leagueId ?? 'L1'] ??= []).push(c.id); });

  // 5. Contracts, loans, retirements
  const freed: string[] = [];
  const newSeason = season + 1;
  for (const p of Object.values(g.players)) {
    if (!p.clubId || p.academy) continue;
    // Loans return (obligatory options convert)
    if (p.parentClubId) {
      const buyer = g.clubs[p.clubId];
      if (p.loanOption?.obligatory || (p.loanOption && chance(0.35) && p.clubId !== user)) {
        const r = activateLoanOption(g, p.id);
        if (r.ok) continue;
      }
      if (p.loanOption && p.clubId === user && buyer) {
        addMessage(g, { category: 'Transfers', from: 'Club Secretary', subject: `Loan ended: ${p.name}`, body: `${p.name}'s loan has ended and he returns to ${g.clubs[p.parentClubId].name}. The option to buy (${fmtMoney(p.loanOption.fee)}) has lapsed.` });
      }
      if (p.parentClubId === user) addMessage(g, { category: 'Players', from: 'Club Secretary', subject: `${p.name} returns from loan`, body: `${p.name} is back from ${buyer?.name ?? 'his loan'} and available for selection.` });
      p.clubId = p.parentClubId; p.parentClubId = undefined; p.loanOption = undefined;
    }
    if (p.contractEnd !== undefined && p.contractEnd < now) {
      const club = g.clubs[p.clubId];
      const isUser = p.clubId === user;
      const keep = !isUser && (p.ovr >= 55 || chance(0.5)) && p.age < 36 && chance(0.85);
      if (keep) {
        p.contractYears = Math.min(maxYears(p), randInt(1, 4)); p.contractEnd = contractEndFor(now, p.contractYears);
        p.wage = Math.max(p.wage, contractDemand(p, club));
      } else {
        freed.push(p.id);
        if (isUser) addMessage(g, { category: 'Contracts', from: 'Club Secretary', important: p.ovr >= 65, subject: `${p.name} has left`, body: `${p.name}'s contract expired on 30 June and he has left the club on a free transfer.` });
      }
    } else p.contractYears = contractYearsLeft(p.contractEnd, now);
  }
  for (const id of freed) { const p = g.players[id]; p.clubId = null; p.contractYears = 0; p.contractEnd = undefined; p.releaseClause = undefined; p.listed = false; p.value = valueOf(p.ovr, p.age + 1, p.pot, 0); }
  invalidateIndex(g);

  // 6. Ageing and development
  annualDevelopment(g);
  for (const p of Object.values(g.players)) { // retirements
    if ((p.age >= 36 && chance(0.6)) || (p.age >= 34 && p.ovr < 48 && !p.clubId)) {
      if (p.clubId === user) addMessage(g, { category: 'Players', from: p.name, subject: `${p.name} retires`, body: `${p.name} (${p.age}) has announced his retirement from football.` });
      delete g.players[p.id];
      invalidateIndex(g);
    }
  }
  // Trim the free-agent pool
  const fas = Object.values(g.players).filter((p) => !p.clubId && !p.prospect).sort((a, b) => b.ovr - a.ovr);
  fas.slice(90).forEach((p) => { delete g.players[p.id]; });
  Object.values(g.players).filter((p) => p.prospect).slice(30).forEach((p) => { delete g.players[p.id]; });

  // 7. Youth (academy age-out, intake) and AI squad top-ups
  for (const c of Object.values(g.clubs)) academyAgeOut(g, c.id);
  const intake = youthIntake(g, user);
  intakeMessage(g, intake);
  for (let i = 0; i < 10; i++) { const p = makeYouth(null, 3); g.players[p.id] = p; }
  for (const c of Object.values(g.clubs)) {
    if (c.id === user) continue;
    const sq = squadOf(g, c.id);
    const need = (['GK', 'DF', 'MF', 'FW'] as const).map((pos) => ({ pos, n: ({ GK: 2, DF: 6, MF: 6, FW: 4 })[pos] - sq.filter((p) => p.pos === pos).length }));
    for (const { pos, n } of need) for (let i = 0; i < Math.max(0, n); i++) {
      const rep = c.reputation;
      const p = makePlayer(c.id, pos, 40 + rep * 0.22 + randInt(-3, 2), randInt(18, 30));
      p.contractEnd = contractEndFor(now, p.contractYears); g.players[p.id] = p;
    }
    if (sq.length < 22) for (let i = sq.length; i < 22; i++) {
      const y = makeYouth(c.id, c.youthLevel ?? 2); y.academy = false; y.age = 18; y.contractEnd = contractEndFor(now, 3); y.contractYears = 3; g.players[y.id] = y;
    }
    // reset spending money for the new season, scaled by reputation, and keep wage budget sane
    c.transferBudget = Math.max(c.transferBudget, Math.round((2_000_000 + c.reputation * c.reputation * 3500) / 50000) * 50000);
    c.wageBudget = Math.max(c.wageBudget, Math.round(squadOf(g, c.id).reduce((s, p) => s + p.wage, 0) * 1.15));
  }
  invalidateIndex(g);

  // 8. New season: leagues, fixtures
  g.meta.season = newSeason;
  g.meta.week = 1;
  g.leagues = makeLeagues(newSeason, byLeague);
  g.fixtures = [];
  for (const lg of Object.values(g.leagues)) g.fixtures.push(...makeFixtures(lg.clubIds, lg, newSeason));
  g.reports = {}; g.lastReportId = undefined;
  // user tier changes
  const newLid = g.clubs[user].leagueId ?? 'L1';
  initBoard(g);
  g.board.confidence = clamp(g.board.confidence, 40, 90);
  const lgName = g.leagues[newLid].name;
  const moved = userLid !== newLid;
  addMessage(g, {
    category: 'Board', from: 'Chairman', important: true, subject: `Season review ${seasonLabel(season)}`,
    body: `We finished ${ordinal(userPos)} in the ${g.leagues[userLid].name} with ${userRow.points} points. ${board.met ? 'The board is pleased - objective achieved.' : 'The board expected more.'}\n${board.summary}.${moved ? `\n\nThe club ${newLid < userLid ? 'was promoted to' : 'was relegated to'} the ${lgName}.` : ''}\n\nNew objective: ${g.board.objectives[0].desc}`,
    action: { kind: 'goto', screen: 'history' },
  });
  addMessage(g, {
    category: 'Competitions', from: 'League Office', subject: `${seasonLabel(season)} champions: ${g.clubs[l1.champion].name}`,
    body: `${g.clubs[l1.champion].name} won the ${g.leagues.L1.name}. ${aw[0] ? `${aw[0].award}: ${aw[0].name}. ` : ''}${l1.topScorers[0] ? `Golden Boot: ${l1.topScorers[0].name} (${l1.topScorers[0].goals}).` : ''}\nPromoted: ${ordered[1].promoted.map((id) => g.clubs[id].name).join(', ')}. Relegated from the top division: ${l1.relegated.map((id) => g.clubs[id].name).join(', ')}.`,
    action: { kind: 'goto', screen: 'history' },
  });
  addMessage(g, {
    category: 'Fixtures', from: 'Fixtures Secretary', subject: `${seasonLabel(newSeason)} fixtures released`, body: `The new season's fixtures are out. Your league (${lgName}) starts on ${new Date(g.leagues[newLid].startDate).toUTCString().slice(0, 16)}.`,
    action: { kind: 'goto', screen: 'fixtures' },
  });
  g.board.seasonStartBalance = g.clubs[user].balance;
  g.events = g.events.filter((e) => e.date >= seasonStart(newSeason));
  void pick;
  void LEAGUE_DEFS;
  invalidateIndex(g);
  for (const c of Object.values(g.clubs)) {
    c.lineup = c.lineup.map((id) => (g.players[id]?.clubId === c.id ? id : ''));
    c.bench = c.bench.filter((id) => g.players[id]?.clubId === c.id);
    if (!g.players[c.captainId]) c.captainId = '';
  }
}

export const seasonYear = (t: number): number => seasonOf(t);
