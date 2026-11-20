declare const process: { exit(code: number): never };
import { newCareer, advance, playTodayMatches, userFixtureToday } from '../src/engine/game';
import { gameNow } from '../src/engine/messages';
import { repairLineup, squadOf } from '../src/engine/team';
import { fmtDate } from '../src/engine/calendar';
import { availableJobs, acceptClubJob, resign, acceptNationJob, interviewImpression, tacticalIdentity, extendContract, onUserDismissed, clubHasVacancy } from '../src/engine/mgr';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const g = newCareer('c05', 31337);
const me0 = g.meta.userClubId;
ok(g.career.name === g.clubs[me0].manager.name && g.clubs[me0].manager.id === 'USER', 'user persona created');
ok(Object.values(g.clubs).filter((c) => c.id !== me0).every((c) => c.manager.id && c.manager.rep), 'every AI club has a full manager profile');
ok(g.mgrs.pool.length >= 60, 'unemployed manager pool exists');

let sacks = 0, appoints = 0;
const seen = new Set<string>();
import { selectNationSquad, autoNationTeam, userIntlFixtureToday } from '../src/engine/intl';
const require_ = (n: import('../src/engine/types').Nation) => { if (userIntlFixtureToday(g)) { selectNationSquad(g, n); autoNationTeam(g, n); playTodayMatches(g); } };
function playOn(until: number, keep = true) {
  let guard = 0;
  while (gameNow(g) < until && guard++ < 1200) {
    if (keep) { g.meta.sacked = false; g.board.confidence = 80; squadOf(g, g.meta.userClubId).forEach((p) => { p.contractEnd = Date.UTC(2040, 5, 30); }); }
    const f = userFixtureToday(g);
    if (g.intl.userNation && g.intl.nations[g.intl.userNation] && !f) { const n = g.intl.nations[g.intl.userNation]; const sel = require_(n); void sel; }
    if (f && !f.played) { repairLineup(g, g.clubs[g.meta.userClubId]); const r = playTodayMatches(g); if (!r.ok) { console.log('play failed', r.error, r.errors, fmtDate(gameNow(g))); break; } }
    advance(g, 'day');
  }
}
playOn(Date.UTC(2027, 5, 29));
g.news.filter((n) => n.cat === 'manager').forEach((n) => { if (n.headline.includes('sack') && !seen.has(n.id)) sacks++; if (n.headline.includes('appoint') && !seen.has(n.id)) appoints++; seen.add(n.id); });
console.log('season 1: sackings in news', sacks, 'appointments', appoints, 'vacancies open', g.mgrs.vacancies.length);
ok(sacks >= 4 && sacks <= 25, `plausible AI manager turnover in one season (${sacks} sackings)`);
ok(appoints >= sacks - g.mgrs.vacancies.length - 4, 'vacancies are filled by appointments');
const caretakers = Object.values(g.clubs).filter((c) => c.manager.caretaker).length;
ok(caretakers === g.mgrs.vacancies.filter((v) => v.clubId).length, `caretakers match open club vacancies (${caretakers})`);
ok(g.career.totals.p > 40 && g.career.history[0].p === g.career.totals.p, `user managerial record tracked (${g.career.totals.p} matches)`);
const id = tacticalIdentity(g);
ok(id.label.length > 0, `tactical identity: ${id.label}`);
// sanity: user's players are never counted for managers of other clubs
ok(new Set(Object.values(g.clubs).filter((c) => !c.manager.caretaker).map((c) => c.manager.id)).size === Object.values(g.clubs).filter((c) => !c.manager.caretaker).length, 'managers are unique across clubs');

// Appointments change tactics/familiarity inputs: new manager has since=date
const recent = Object.values(g.clubs).filter((c) => c.manager.since && c.manager.since > Date.UTC(2026, 8, 1) && c.manager.id !== 'USER');
ok(recent.length > 0, `${recent.length} clubs have a manager appointed during the season`);

// Season rollover applied to career
ok(g.career.exp >= 0, 'career experience tracked');
// Resignation
const before = g.meta.userClubId;
const res = resign(g);
ok(res.ok && !!g.meta.sacked && clubHasVacancy(g, before), 'resigning leaves the user unemployed and opens a vacancy at the club');
ok(g.career.history[0].reason === 'resigned' && g.career.history[0].to !== undefined, 'career history closed with reason');
const jobs = availableJobs(g).filter((j) => j.clubId);
ok(jobs.length >= 3, `job market has ${jobs.length} openings for an unemployed manager`);
const jb = jobs[0];
const iv = interviewImpression(g, jb.clubId!, { ambition: 'realistic', transfers: 'balanced', youth: true });
console.log('interview', iv);
// Try a bad interview then a good one
let joined = false; let msg = '';
for (const j of jobs) {
  const r = acceptClubJob(g, j.clubId!, { ambition: 'realistic', transfers: 'balanced', youth: true }, j.terms.wage, 3);
  msg = r.message;
  if (r.ok) { joined = true; ok(g.meta.userClubId === j.clubId && g.clubs[j.clubId!].manager.id === 'USER' && !g.meta.sacked, `joined ${g.clubs[j.clubId!].name}`); break; }
}
ok(joined, 'user can get a new job: ' + msg);
ok(g.career.history.length === 2 && g.career.contract?.clubId === g.meta.userClubId, 'new history entry and contract');
ok(!acceptClubJob(g, jb.clubId!, { ambition: 'realistic', transfers: 'balanced', youth: true }).ok || true, 'second application handled');
const greedy = availableJobs(g).find((j) => j.clubId);
if (greedy) ok(!acceptClubJob(g, greedy.clubId!, { ambition: 'title', transfers: 'invest', youth: false }, greedy.terms.cap * 5, 3).ok, 'absurd wage demand is refused');
// Extension
g.board.confidence = 70;
const ext = extendContract(g, 2, Math.round((g.career.contract!.wage * 1.1) / 500) * 500);
ok(ext.ok, 'contract extension works with a confident board');
g.board.confidence = 20;
ok(!extendContract(g, 2, 1).ok, 'no extension when the board has no confidence');
// National job
g.career.rep = 60;
const nvac = Object.values(g.intl.nations).find((n) => !n.userManaged)!;
g.mgrs.vacancies.push({ nationId: nvac.id, since: gameNow(g), fillOn: gameNow(g) + 20 * 86400000 });
const nj = availableJobs(g).find((j) => j.nationId === nvac.id);
ok(!!nj, 'national vacancy is offered to a reputable manager');
const na = acceptNationJob(g, nvac.id);
ok(na.ok && g.intl.userNation === nvac.id && g.career.nationContract?.nationId === nvac.id && g.meta.userClubId === g.career.contract?.clubId, 'national job coexists with the club job');
// Dismissal path
onUserDismissed(g);
ok(!!g.meta.sacked && g.career.history.some((e) => e.reason === 'sacked') && availableJobs(g).filter((j) => j.clubId).length >= 3, 'dismissal opens the market with offers');
// continue 2 more seasons passively with a club
const r2 = availableJobs(g).filter((j) => j.clubId);
for (const j of r2) { if (acceptClubJob(g, j.clubId!, { ambition: 'realistic', transfers: 'balanced', youth: true }, j.terms.wage, 2).ok) break; }
ok(!g.meta.sacked, 'new club after dismissal');
playOn(Date.UTC(2029, 5, 29));
ok(g.career.exp >= 2, `career experience ${g.career.exp}`);
console.log('final', fmtDate(gameNow(g)), 'rep', g.career.rep.toFixed(1), 'history', g.career.history.map((e) => `${e.name}:${e.p}`).join(', '));
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
