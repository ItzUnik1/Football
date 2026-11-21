import type { Fixture, Game, MatchReport, Player } from './types';
import { chance, clamp, pick } from './rng';
import { addDays, dayDiff, fmtDate, isWindowOpen } from './calendar';
import { addMessage, gameNow } from './messages';
import { addNews } from './news';
import { fmtMoney } from './valuation';
import { squadOf } from './team';
import { computeTable } from './fixtures';

export interface PressChoice { id: string; label: string; hint: string }
export const PRESS_TOPICS: Record<string, { title: string; choices: PressChoice[] }> = {
  pre: { title: 'Pre-match interview', choices: [
    { id: 'confident', label: 'We are confident', hint: 'Lifts the squad, but looks bad if we lose.' },
    { id: 'cautious', label: 'We expect a tough game', hint: 'Safe answer. No risk, no reward.' },
    { id: 'respect', label: 'Praise the opposition', hint: 'Fans and press like humility. Slightly lowers confidence.' } ] },
  post_win: { title: 'Post-match interview: victory', choices: [
    { id: 'praise_player', label: 'Praise the match-winner', hint: 'Big morale boost for him.' },
    { id: 'praise_team', label: 'Praise the whole team', hint: 'Small boost for everyone.' },
    { id: 'humble', label: 'Stay humble, talk about the next game', hint: 'Improves your relationship with the press.' } ] },
  post_loss: { title: 'Post-match interview: defeat', choices: [
    { id: 'back_team', label: 'Back the team', hint: 'Protects morale.' },
    { id: 'blame_player', label: 'Single out a player', hint: 'Hurts that player. Others note the honesty.' },
    { id: 'blame_ref', label: 'Blame the officials', hint: 'Squad rallies, but the press and board dislike excuses.' } ] },
  transfer: { title: 'Transfer question', choices: [
    { id: 'interest', label: 'Admit you like him', hint: 'Flatters the player, but his club will ask for more.' },
    { id: 'deny', label: 'Deny any interest', hint: 'No effect on negotiations.' },
    { id: 'nocomment', label: 'No comment', hint: 'Mild annoyance for the press.' } ] },
  promise: { title: 'Asked about an unhappy player', choices: [
    { id: 'promise', label: 'Promise him a run in the team', hint: 'Boosts morale now. A broken promise hurts a lot.' },
    { id: 'fight', label: 'Tell him to earn his place', hint: 'Press approve; he may sulk.' } ] },
};

const media = (g: Game) => g.media;
export function initMedia(g: Game): void {
  g.media ??= { relationship: 55, lastPressDay: 0, lastPreMatch: 0, lastPostMatch: 0, promises: [], statements: [], history: [], pending: [], leader: {}, streaks: {} };
}

function pressMessage(g: Game, topic: string, subject: string, body: string, ids: { playerId?: string; clubId?: string } = {}): boolean {
  const m = media(g); const now = gameNow(g);
  if (now - m.lastPressDay < 4 * 86400000) return false; // never spam
  if (m.history.slice(-3).some((h) => h.topic === topic && now - h.date < 14 * 86400000)) return false;
  m.lastPressDay = now;
  addMessage(g, { category: 'Media', from: 'Press Officer', subject, body, action: { kind: 'press', topic, ...ids, expires: addDays(now, 3) } });
  return true;
}
const star = (g: Game, report: MatchReport, userId: string): Player | undefined => {
  const mine = report.players.filter((pm) => g.players[pm.id]?.clubId === userId).sort((a, b) => b.rating - a.rating)[0];
  return mine ? g.players[mine.id] : undefined;
};

/** Called after the user's club plays. Queues a post-match interview when the result is worth talking about. */
export function pressAfterMatch(g: Game, report: MatchReport, fixture: Fixture): void {
  initMedia(g); const m = media(g); const user = g.meta.userClubId;
  const home = fixture.home === user; const gf = home ? report.hg : report.ag, ga = home ? report.ag : report.hg;
  const opp = g.clubs[home ? fixture.away : fixture.home];
  // settle pre-match stance
  const pre = (m.pending ??= []).find((x) => x.fixtureId === fixture.id);
  if (pre) {
    m.pending = m.pending.filter((x) => x !== pre);
    if (pre.stance === 'confident') {
      if (gf > ga) { m.relationship = clamp(m.relationship + 2, 0, 100); squadOf(g, user).forEach((p) => { p.morale = clamp(p.morale + 1, 0, 100); }); }
      else if (gf < ga) { m.relationship = clamp(m.relationship - 4, 0, 100); g.board.confidence = clamp(g.board.confidence - 1, 0, 100); addNews(g, 'media', `${g.clubs[user].manager.name}'s confidence backfires after defeat to ${opp.name}`, { clubId: user }); }
    }
  }
  settlePromises(g);
  const won = gf > ga, lost = gf < ga;
  if (!(chance(0.55) || Math.abs(gf - ga) >= 3 || (lost && fixture.comp === 'cup'))) return;
  if (won) { const s = star(g, report, user); if (s) pressMessage(g, 'post_win', `Press room: ${gf}-${ga} against ${opp.name}`, `Reporters want to know about ${s.name}, who was the best player in the ${gf}-${ga} win over ${opp.name}. How do you respond?`, { playerId: s.id }); }
  else if (lost) { const mine = report.players.filter((pm) => g.players[pm.id]?.clubId === user).sort((a, b) => a.rating - b.rating)[0]; pressMessage(g, 'post_loss', `Press room: ${gf}-${ga} defeat to ${opp.name}`, `The press are asking about the ${gf}-${ga} defeat.${mine ? ` ${g.players[mine.id]?.name} had a poor game.` : ''} What do you say?`, { playerId: mine?.id }); }
}

/** Day before a user league fixture: sometimes a pre-match interview, or a transfer question. */
export function pressDaily(g: Game, tomorrow: Fixture | undefined): void {
  initMedia(g); const m = media(g); const now = gameNow(g); const user = g.meta.userClubId;
  if (tomorrow && tomorrow.comp !== 'cup' && now - m.lastPreMatch > 9 * 86400000 && chance(0.45)) {
    const opp = g.clubs[tomorrow.home === user ? tomorrow.away : tomorrow.home];
    if (pressMessage(g, 'pre', `Press conference before ${opp.name}`, `The press ask how you rate your chances against ${opp.name} on ${fmtDate(tomorrow.date ?? now)}.`, { clubId: opp.id })) { m.lastPreMatch = now; (m.pending ??= []).push({ kind: 'pre', stance: '', fixtureId: tomorrow.id }); }
    return;
  }
  // transfer talk: asked about an outstanding player elsewhere, weekly at most
  if (new Date(now).getUTCDay() === 5 && chance(0.3) && isWindowOpen(gameNow(g))) {
    const me = g.clubs[user];
    const cands = Object.values(g.players).filter((p) => p.clubId && p.clubId !== user && !p.academy && p.ovr >= 72 && p.value < me.transferBudget * 1.5 && !m.statements.some((s) => s.playerId === p.id && now - s.date < 60 * 86400000));
    if (cands.length) { const p = pick(cands); pressMessage(g, 'transfer', `Press asks about ${p.name}`, `Journalists have linked you with ${p.name} (${p.pos}, ${p.ovr}) of ${g.clubs[p.clubId!].name}. Will you confirm interest?`, { playerId: p.id, clubId: p.clubId! }); }
  }
}

function settlePromises(g: Game): void {
  const m = media(g); const now = gameNow(g);
  m.promises = m.promises.filter((pr) => {
    const p = g.players[pr.playerId];
    if (!p || p.clubId !== g.meta.userClubId) return false;
    if (!p.promisedStart) { pr.kept = true; m.relationship = clamp(m.relationship + 1, 0, 100); return false; }
    if (now > pr.until) {
      p.promisedStart = false; p.morale = clamp(p.morale - 14, 0, 100); m.relationship = clamp(m.relationship - 4, 0, 100);
      addMessage(g, { category: 'Players', from: p.name, important: true, subject: `${p.name} accuses you of breaking your promise`, body: `${p.name} was promised a run in the team and has not got it. His morale has dropped sharply and the press have noticed.` });
      addNews(g, 'media', `${p.name} says manager broke promise`, { clubId: p.clubId ?? undefined, playerId: p.id });
      return false;
    }
    return true;
  });
}

export function answerPress(g: Game, msgId: string, choiceId: string): { ok: boolean; message: string } {
  initMedia(g); const m = media(g);
  const msg = g.messages.find((x) => x.id === msgId);
  if (!msg || msg.action?.kind !== 'press') return { ok: false, message: 'Nothing to answer.' };
  if (msg.resolved) return { ok: false, message: 'Already answered.' };
  const a = msg.action; const now = gameNow(g); const user = g.meta.userClubId;
  if (now > a.expires) { msg.resolved = 'Missed the interview'; m.relationship = clamp(m.relationship - 1, 0, 100); return { ok: false, message: 'The press moved on.' }; }
  const t = PRESS_TOPICS[a.topic]; if (!t || !t.choices.some((c) => c.id === choiceId)) return { ok: false, message: 'Unknown answer.' };
  const p = a.playerId ? g.players[a.playerId] : undefined;
  const squad = squadOf(g, user);
  let effect = '';
  const rel = (d: number) => { m.relationship = clamp(m.relationship + d, 0, 100); };
  const mor = (pl: Player, d: number) => { pl.morale = clamp(pl.morale + d, 0, 100); };
  switch (a.topic + ':' + choiceId) {
    case 'pre:confident': (m.pending ?? []).forEach((x) => { if (!x.stance) x.stance = 'confident'; }); squad.forEach((pl) => mor(pl, 1.5)); effect = 'Squad lifted. The press will hold you to it.'; break;
    case 'pre:cautious': (m.pending ?? []).forEach((x) => { if (!x.stance) x.stance = 'cautious'; }); rel(0.5); effect = 'A safe answer.'; break;
    case 'pre:respect': (m.pending ?? []).forEach((x) => { if (!x.stance) x.stance = 'respect'; }); rel(2); squad.forEach((pl) => mor(pl, -0.5)); effect = 'Warm headlines; a few players felt undersold.'; break;
    case 'post_win:praise_player': if (p) { mor(p, 6); effect = `${p.name} is delighted.`; } break;
    case 'post_win:praise_team': squad.forEach((pl) => mor(pl, 2)); effect = 'Team spirit up.'; break;
    case 'post_win:humble': rel(3); effect = 'Press relations improved.'; break;
    case 'post_loss:back_team': squad.forEach((pl) => mor(pl, 1)); effect = 'The dressing room appreciates the support.'; break;
    case 'post_loss:blame_player': if (p) { mor(p, -8); effect = `${p.name} was hurt by your comments.`; } rel(1); break;
    case 'post_loss:blame_ref': squad.forEach((pl) => mor(pl, 1)); rel(-3); g.board.confidence = clamp(g.board.confidence - 1, 0, 100); effect = 'The press called it an excuse.'; break;
    case 'transfer:interest': if (p) { m.statements.push({ playerId: p.id, clubId: a.clubId, date: now, kind: 'target' }); mor(p, 3); effect = `${p.name} is flattered, but ${g.clubs[p.clubId!]?.name ?? 'his club'} will now ask for more (+12% for 60 days).`; addNews(g, 'transfer', `${g.clubs[user].manager.name} admits interest in ${p.name}`, { playerId: p.id, clubId: p.clubId ?? undefined }); } break;
    case 'transfer:deny': effect = 'Nothing changes.'; break;
    case 'transfer:nocomment': rel(-1); effect = 'The press were not impressed.'; break;
    case 'promise:promise': if (p) { p.promisedStart = true; mor(p, 8); p.benchStreak = 0; m.promises.push({ playerId: p.id, kind: 'start', date: now, until: addDays(now, 28) }); effect = `${p.name} expects to start within four weeks.`; } break;
    case 'promise:fight': if (p) { mor(p, -3); rel(1); effect = `${p.name} is not happy but will fight for his place.`; } break;
  }
  m.history.push({ date: now, topic: a.topic, choice: choiceId, effect }); if (m.history.length > 40) m.history.shift();
  msg.resolved = `${t.choices.find((c) => c.id === choiceId)!.label}`; msg.read = true;
  return { ok: true, message: effect || 'Answered.' };
}

/** Price markup after the user publicly admitted interest. */
export function pressPriceFactor(g: Game, playerId: string): number {
  const now = gameNow(g);
  return g.media?.statements.some((s) => s.playerId === playerId && s.kind === 'target' && now - s.date < 60 * 86400000) ? 1.12 : 1;
}

// ---------- Weekly world news and speculation ----------
export function newsWeekly(g: Game): void {
  initMedia(g); const m = media(g); const user = g.meta.userClubId;
  m.statements = m.statements.filter((s) => gameNow(g) - s.date < 120 * 86400000);
  m.relationship = clamp(m.relationship + (55 - m.relationship) * 0.03, 0, 100);
  for (const lg of Object.values(g.leagues)) {
    const table = computeTable(g, lg.id);
    if (!table.length || table[0].played < 3) continue;
    const leader = table[0].clubId;
    if ((m.leader ??= {})[lg.id] && m.leader[lg.id] !== leader) addNews(g, 'league', `${g.clubs[leader].name} go top of the ${lg.name}`, { clubId: leader, imp: lg.tier === 1 ? 1 : 0 });
    m.leader[lg.id] = leader;
    for (const r of table) { // unbeaten and winning runs
      const rec = g.fixtures.filter((f) => f.played && f.leagueId === lg.id && (f.home === r.clubId || f.away === r.clubId)).slice(-8);
      let run = 0; for (let i = rec.length - 1; i >= 0; i--) { const f = rec[i]; const gf = f.home === r.clubId ? f.hg! : f.ag!, ga = f.home === r.clubId ? f.ag! : f.hg!; if (gf < ga) break; run++; }
      const k = `${lg.id}:${r.clubId}`; const prev = (m.streaks ??= {})[k] ?? 0;
      if (run >= 6 && prev < 6 && lg.tier === 1) addNews(g, 'league', `${g.clubs[r.clubId].name} unbeaten in ${run} league games`, { clubId: r.clubId });
      m.streaks[k] = run;
    }
  }
  // Speculation: a big club is linked with a player of another club; user's players too.
  const now = gameNow(g);
  if (isWindowOpen(gameNow(g)) && chance(0.5)) {
    const top = Object.values(g.players).filter((p) => p.clubId && !p.academy && p.ovr >= 76 && (p.contractYears <= 2 || p.morale < 55));
    if (top.length) {
      const p = pick(top);
      const buyers = Object.values(g.clubs).filter((c) => c.id !== p.clubId && c.transferBudget > p.value * 0.6);
      if (buyers.length) {
        const b = pick(buyers);
        addNews(g, 'transfer', `${b.name} linked with ${p.name}`, { playerId: p.id, clubId: b.id, body: `${p.name} (${p.pos}, ${p.ovr}) is reported to be a target for ${b.name}. Value around ${fmtMoney(p.value)}.` });
        if (p.clubId === user) { p.morale = clamp(p.morale - 2, 0, 100); if (!g.messages.some((x) => x.category === 'Media' && x.subject.includes(p.name) && dayDiff((x.date ?? 0), now) < 40)) addMessage(g, { category: 'Media', from: 'Press Officer', subject: `Speculation: ${b.name} want ${p.name}`, body: `The papers say ${b.name} are preparing a move for ${p.name}. He is reportedly unsettled by the talk. A contract extension would settle him.`, action: { kind: 'goto', screen: 'squad', playerId: p.id } }); }
      }
    }
  }
  void fixtureUnused;
}
const fixtureUnused = null;
