import { useState } from 'react';
import { store, useStore } from '../store';
import { Bar, Empty, Modal, Panel, Stat } from '../common';
import { fmtDate, fmtDateShort, seasonLabel, dayDiff } from '../../engine/calendar';
import { fmtMoney } from '../../engine/valuation';
import { gameNow } from '../../engine/messages';
import { acceptClubJob, acceptNationJob, availableJobs, extendContract, interviewImpression, leaveNationJob, resign, tacticalIdentity, managerSummary, type Interview } from '../../engine/mgr';
import { ALL_ROLES, ROLE_EFFECT, ROLE_LABEL, ROLE_MAX, ROLE_MIN, availableStaff, hireStaff, releaseStaff, renewStaff, staffOf, staffWageBill } from '../../engine/staff';
import { FAC_LABEL, facilityLevel, facilityUpgradeCost, gateFor, standCost, standDays, startConstruction, stadiumUpgradeCost, PROFILE_LABEL, type BuildSpec } from '../../engine/econ';
import { PRESS_TOPICS, answerPress } from '../../engine/media';
import { ordinal } from '../../engine/board';
import type { StaffRole } from '../../engine/types3';

const res = (r: { ok: boolean; message: string }) => store.toast(r.message, r.ok ? 'ok' : 'bad');

// ---------- Manager career ----------
export function ManagerScreen() {
  const { g } = useStore();
  const c = g!.career; const me = g!.clubs[g!.meta.userClubId];
  const sum = managerSummary(g!); const id = tacticalIdentity(g!);
  const jobs = availableJobs(g!);
  const [apply, setApply] = useState<string | null>(null);
  const [iv, setIv] = useState<Interview>({ ambition: 'realistic', transfers: 'balanced', youth: false });
  const nat = g!.intl.userNation ? g!.intl.nations[g!.intl.userNation] : undefined;
  const job = jobs.find((j) => (j.clubId ?? j.nationId) === apply);
  const imp = job?.clubId ? interviewImpression(g!, job.clubId, iv) : null;
  return (
    <div className="h-full grid grid-cols-[1.1fr_1fr] gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title={`${c.name} (${c.age})`}>
          <div className="grid grid-cols-4">
            <Stat label="Reputation" value={Math.round(c.rep)} sub="clubs" />
            <Stat label="Int'l rep" value={Math.round(c.intlRep)} />
            <Stat label="Experience" value={`${c.exp} yrs`} />
            <Stat label="Record" value={sum.record} sub={`${sum.winPct}% wins`} />
          </div>
          <div className="px-2 pb-2 text-[11px] text-slate-300">Style: <b className="text-accent2">{id.label}</b></div>
        </Panel>
        <Panel title="Contracts">
          <div className="p-2 text-[11px] space-y-1.5">
            {c.contract ? <div className="flex items-center gap-2"><span className="flex-1">{me.name}: {fmtMoney(c.contract.wage)}/wk until {fmtDate(c.contract.end)}</span>
              <button className="btn btn-sm" onClick={() => store.mutate((gg) => extendContract(gg, 2, Math.round(gg.career.contract!.wage * 1.1))).then(res)}>Extend 2y</button>
              <button className="btn btn-sm btn-danger" onClick={() => { if (window.confirm('Resign as manager?')) store.mutate((gg) => resign(gg)).then(res); }}>Resign</button></div> : <div className="text-slate-400">No club contract.</div>}
            {nat ? <div className="flex items-center gap-2"><span className="flex-1">{nat.name} national team until {fmtDate(c.nationContract?.end ?? 0)}</span><button className="btn btn-sm btn-danger" onClick={() => store.mutate((gg) => leaveNationJob(gg, 'resigned')).then(() => store.toast('You left the national job'))}>Resign</button></div> : null}
          </div>
        </Panel>
        <Panel className="flex-1" title="Career history">
          <div className="scroll-y h-full">
            {c.history.slice().reverse().map((e, i) => <div key={i} className="px-2 py-1 border-b border-line/40 text-[11px]"><b>{e.name}</b> <span className="text-slate-400">{e.kind === 'nation' ? '(national)' : ''} {fmtDateShort(e.from)} - {e.to ? fmtDateShort(e.to) : 'present'}{e.reason ? ` - ${e.reason}` : ''}</span><div className="text-slate-400">P{e.p} W{e.w} D{e.d} L{e.l} - {e.trophies.length ? e.trophies.join(', ') : 'no trophies'}</div></div>)}
            {c.trophies.length > 0 && <div className="px-2 py-1 text-[11px] text-accent">Trophies: {c.trophies.map((t) => `${t.name} ${seasonLabel(t.season)}`).join(', ')}</div>}
            {c.achievements.slice().reverse().map((a) => <div key={a.id} className="px-2 py-0.5 text-[11px]">★ <b>{a.title}</b> <span className="text-slate-400">{a.detail}</span></div>)}
          </div>
        </Panel>
      </div>
      <Panel title={`Job market (${jobs.length})`} className="min-h-0">
        <div className="scroll-y h-full">
          {jobs.length === 0 && <Empty>No vacancies suit your reputation right now. Offers also arrive in the inbox.</Empty>}
          {jobs.map((j) => { const key = (j.clubId ?? j.nationId)!; const name = j.terms.label; return (
            <div key={key} className="px-2 py-1.5 border-b border-line/40 flex items-center gap-2 text-[11px]">
              <div className="flex-1 min-w-0"><div className="font-semibold truncate">{name} <span className="text-[10px] text-slate-400">{j.terms.kind === 'nation' ? 'national team' : ''}</span></div>
                <div className="text-slate-400">Rep {j.terms.rep} - {fmtMoney(j.terms.wage)}/wk - {j.terms.years}y - <span className="capitalize">{j.fit.replace('_', ' ')}</span></div></div>
              <button className="btn btn-sm" onClick={() => { setApply(key); setIv({ ambition: 'realistic', transfers: 'balanced', youth: false }); }}>{j.nationId ? 'Accept' : 'Interview'}</button>
            </div>); })}
        </div>
      </Panel>
      {apply && job && (
        <Modal title={`Job: ${job.terms.label}`} onClose={() => setApply(null)} footer={<><button className="btn" onClick={() => setApply(null)}>Cancel</button><button className="btn btn-primary" onClick={() => {
          store.mutate((gg) => job.clubId ? acceptClubJob(gg, job.clubId, iv, job.terms.wage, job.terms.years) : acceptNationJob(gg, job.nationId!, job.terms.wage, job.terms.years)).then((r) => { res(r); if (r.ok) { setApply(null); store.go(job.clubId ? 'inbox' : 'international'); } });
        }}>{job.nationId ? 'Take the job' : 'Take the interview and apply'}</button></>}>
          <div className="text-xs space-y-2">
            <p>Wage {fmtMoney(job.terms.wage)}/wk for {job.terms.years} years.{job.nationId ? ' You will manage the nation alongside any club job.' : ' Taking this job ends your current club contract.'}</p>
            {job.clubId && <>
              <div><div className="text-[10px] uppercase text-slate-400 mb-1">Ambition</div><div className="flex gap-1">{(['title', 'realistic', 'safe'] as const).map((x) => <button key={x} className={`btn btn-sm flex-1 capitalize ${iv.ambition === x ? 'btn-primary' : ''}`} onClick={() => setIv({ ...iv, ambition: x })}>{x === 'title' ? 'Win the league' : x === 'realistic' ? 'Realistic target' : 'Stay safe'}</button>)}</div></div>
              <div><div className="text-[10px] uppercase text-slate-400 mb-1">Transfers</div><div className="flex gap-1">{(['invest', 'balanced', 'frugal'] as const).map((x) => <button key={x} className={`btn btn-sm flex-1 capitalize ${iv.transfers === x ? 'btn-primary' : ''}`} onClick={() => setIv({ ...iv, transfers: x })}>{x}</button>)}</div></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={iv.youth} onChange={(e) => setIv({ ...iv, youth: e.target.checked })} /> I will promote young players</label>
              <div className="panel p-2">Board impression: <b>{imp!.score}%</b>{imp!.notes.map((n, i) => <div key={i} className="text-slate-400">{n}</div>)}</div></>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Media ----------
export function MediaScreen() {
  const { g } = useStore();
  const m = g!.media;
  const now = gameNow(g!);
  const open = g!.messages.filter((x) => x.action?.kind === 'press' && !x.resolved && (x.action as { expires: number }).expires >= now).reverse();
  return (
    <div className="h-full grid grid-cols-[1.2fr_1fr] gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0">
        <Panel><div className="p-2"><div className="flex justify-between text-[11px] mb-1"><span>Relationship with the press</span><b>{Math.round(m.relationship)}</b></div><Bar value={m.relationship} h={8} /><div className="text-[10px] text-slate-400 mt-1">Humility and kept promises improve it; blaming others and broken promises damage it. A good relationship brings kinder headlines and calmer players.</div></div></Panel>
        <Panel className="flex-1" title={`Press requests (${open.length})`}>
          <div className="scroll-y h-full">
            {open.length === 0 && <Empty>No journalists are waiting. Interviews come around matches, and questions about transfers or unhappy players come during the week.</Empty>}
            {open.map((x) => { const a = x.action as { topic: string }; const t = PRESS_TOPICS[a.topic]; return (
              <div key={x.id} className="p-2 border-b border-line/40"><div className="font-semibold text-[11px]">{x.subject}</div><div className="text-[11px] text-slate-300 mb-1">{x.body}</div>
                <div className="flex flex-col gap-1">{t.choices.map((c) => <button key={c.id} className="btn btn-sm justify-start text-left" onClick={() => store.mutate((gg) => answerPress(gg, x.id, c.id)).then(res)}><b>{c.label}</b><span className="text-slate-400 font-normal"> - {c.hint}</span></button>)}</div></div>); })}
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title="Promises"><div className="p-2 text-[11px] space-y-0.5">{m.promises.length ? m.promises.map((p, i) => <div key={i}>{g!.players[p.playerId]?.name}: starts before {fmtDateShort(p.until)} ({dayDiff(now, p.until)}d left)</div>) : <span className="text-slate-500">No outstanding promises.</span>}</div></Panel>
        <Panel className="flex-1" title="What you said">
          <div className="scroll-y h-full">{m.history.slice().reverse().map((h, i) => <div key={i} className="px-2 py-1 border-b border-line/40 text-[11px]"><span className="text-slate-500">{fmtDateShort(h.date)}</span> {PRESS_TOPICS[h.topic]?.title}: <b>{PRESS_TOPICS[h.topic]?.choices.find((c) => c.id === h.choice)?.label}</b><div className="text-slate-400">{h.effect}</div></div>)}{!m.history.length && <Empty>Nothing yet.</Empty>}</div>
        </Panel>
      </div>
    </div>
  );
}

// ---------- Staff ----------
export function StaffScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const [role, setRole] = useState<StaffRole | null>(null);
  const pool = role ? availableStaff(g!, role).sort((a, b) => b.ability - a.ability).slice(0, 25) : [];
  const stars = (a: number) => '★'.repeat(Math.max(1, Math.round(a / 4))) + '☆'.repeat(5 - Math.max(1, Math.round(a / 4)));
  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <Panel><div className="grid grid-cols-3"><Stat label="Staff wage bill" value={`${fmtMoney(staffWageBill(me))}/wk`} /><Stat label="Staff" value={(me.staff ?? []).length} /><Stat label="Club balance" value={fmtMoney(me.balance)} /></div></Panel>
      <Panel className="flex-1" title="Backroom team">
        <div className="scroll-y h-full">
          {ALL_ROLES.map((r) => { const have = staffOf(me, r); return (
            <div key={r} className="px-2 py-1 border-b border-line/40">
              <div className="flex items-center gap-2 text-[11px]"><b className="w-36">{ROLE_LABEL[r]}</b><span className="flex-1 text-slate-500 truncate">{ROLE_EFFECT[r]}</span><span className="text-slate-400">{have.length}/{ROLE_MAX[r]}</span><button className="btn btn-sm" disabled={have.length >= ROLE_MAX[r]} onClick={() => setRole(r)}>Hire</button></div>
              {have.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[11px] pl-3 py-0.5"><span className="flex-1 truncate">{s.name} <span className="text-slate-500">{s.nat}</span></span><span className="text-warn w-16">{stars(s.ability)}</span><span className="w-12 text-right">{s.ability}</span><span className="w-20 text-right">{fmtMoney(s.wage)}/wk</span><span className="w-16 text-right text-slate-400">{fmtDateShort(s.contractEnd)}</span>
                  <button className="btn btn-sm" onClick={() => store.mutate((gg) => renewStaff(gg, s.id, 2)).then(res)}>Renew</button>
                  <button className="btn btn-sm btn-danger" disabled={have.length <= ROLE_MIN[r]} onClick={() => store.mutate((gg) => releaseStaff(gg, s.id)).then(res)}>Release</button></div>))}
              {have.length === 0 && <div className="pl-3 text-[11px] text-bad">Vacant</div>}
            </div>); })}
        </div>
      </Panel>
      {role && (
        <Modal wide title={`Hire: ${ROLE_LABEL[role]}`} onClose={() => setRole(null)}>
          <div className="text-[11px] text-slate-400 mb-1">{ROLE_EFFECT[role]} Staff hired from the free-agent pool; rivals also recruit from it.</div>
          <table className="w-full"><thead><tr><th className="th">Name</th><th className="th">Age</th><th className="th">Ability</th><th className="th">Wage</th><th className="th" /></tr></thead><tbody>
            {pool.map((s) => <tr key={s.id} className="border-t border-line/40"><td className="td font-semibold">{s.name}</td><td className="td">{s.age}</td><td className="td"><span className="text-warn">{stars(s.ability)}</span> {s.ability}</td><td className="td">{fmtMoney(s.wage)}/wk</td><td className="td text-right"><button className="btn btn-sm btn-primary" onClick={() => store.mutate((gg) => hireStaff(gg, s.id)).then((r) => { res(r); if (r.ok) setRole(null); })}>Hire</button></td></tr>)}
          </tbody></table>{pool.length === 0 && <Empty>No candidates available.</Empty>}
        </Modal>
      )}
    </div>
  );
}

// ---------- Stadium ----------
export function StadiumScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId]; const e = me.econ!;
  const nextHome = g!.fixtures.find((f) => !f.played && f.home === me.id);
  const gate = nextHome ? gateFor(g!, nextHome) : null;
  const k = e.construction;
  const build = (spec: BuildSpec) => store.mutate((gg) => startConstruction(gg, gg.meta.userClubId, spec)).then(res);
  const setPrice = (d: number) => store.mutate((gg) => { const c = gg.clubs[gg.meta.userClubId]; c.ticketPrice = Math.max(5, Math.min(250, c.ticketPrice + d)); });
  return (
    <div className="h-full grid grid-cols-2 gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title={me.stadium}><div className="grid grid-cols-3"><Stat label="Capacity" value={me.capacity.toLocaleString()} sub={`limit ${e.maxCapacity.toLocaleString()}`} /><Stat label="Standard" value={`Level ${e.stadiumLevel}/5`} sub="atmosphere and comfort" /><Stat label="Season tickets" value={e.seasonTickets.toLocaleString()} sub={`${fmtMoney(e.seasonTicketPrice)} each`} /></div></Panel>
        <Panel title="Ticket pricing"><div className="p-2 text-[11px] space-y-1.5">
          <div className="flex items-center gap-2"><button className="btn btn-sm" onClick={() => setPrice(-2)}>-2</button><b className="text-sm w-14 text-center">{fmtMoney(me.ticketPrice)}</b><button className="btn btn-sm" onClick={() => setPrice(2)}>+2</button><span className="text-slate-400">Higher prices raise gate income but reduce attendance and season ticket sales.</span></div>
          {gate && <div>Next home game estimate: {gate.attendance.toLocaleString()} fans ({gate.seasonTickets.toLocaleString()} season ticket holders) - gate {fmtMoney(gate.gate)}</div>}
        </div></Panel>
        <Panel className="flex-1" title="Finance profile"><div className="p-2 text-[11px] space-y-1"><div>Owner type: <b>{PROFILE_LABEL[e.profile]}</b></div><div>Merchandise strength {Math.round(e.merchIndex)}/100</div><div>Sponsor: {e.sponsor.name} {fmtMoney(e.sponsor.weekly)}/wk until {fmtDate(e.sponsor.end)}</div><div>Kit: {e.kitDeal.name} {fmtMoney(e.kitDeal.weekly)}/wk until {fmtDate(e.kitDeal.end)}</div></div></Panel>
      </div>
      <Panel title="Construction" className="min-h-0">
        <div className="scroll-y h-full p-2 space-y-2 text-[11px]">
          {k && <div className="panel p-2"><div className="font-bold">{k.label}</div><div className="text-slate-400">Cost {fmtMoney(k.cost)} - ready {fmtDate(k.ready)} ({Math.max(0, dayDiff(gameNow(g!), k.ready))} days)</div><Bar value={gameNow(g!) - k.start} max={Math.max(1, k.ready - k.start)} h={6} color="#38bdf8" /></div>}
          <div className="text-slate-400">Only one project at a time. 40% is paid at the start, the rest in weekly instalments. Clubs in debt cannot build.</div>
          {[2000, 5000, 10000].map((s) => <div key={s} className="flex items-center gap-2"><span className="flex-1">New stand +{s.toLocaleString()} seats - {fmtMoney(standCost(me, s))}, {standDays(s)} days</span><button className="btn btn-sm" disabled={!!k || me.capacity + s > e.maxCapacity} onClick={() => build({ kind: 'stand', seats: s })}>Build</button></div>)}
          <div className="flex items-center gap-2"><span className="flex-1">Stadium upgrade to level {Math.min(5, e.stadiumLevel + 1)} - {e.stadiumLevel < 5 ? fmtMoney(stadiumUpgradeCost(me)) : 'maximum'}</span><button className="btn btn-sm" disabled={!!k || e.stadiumLevel >= 5} onClick={() => build({ kind: 'roof' })}>Upgrade</button></div>
          <div className="text-slate-500">A better stadium raises the home atmosphere and non-matchday income, but increases maintenance costs.</div>
        </div>
      </Panel>
    </div>
  );
}

// ---------- Facilities ----------
const FAC_EFFECT = { training: 'Faster player development and tactical learning.', youth: 'Better academy intake and prospect growth.', medical: 'Fewer injuries and shorter recovery.', scouting: 'More accurate reports and global scouting (level 3+).' } as const;
export function FacilitiesScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId]; const k = me.econ!.construction;
  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      {k && <Panel><div className="p-2 text-[11px]"><b>{k.label}</b> - ready {fmtDate(k.ready)}</div></Panel>}
      <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
        {(['training', 'youth', 'medical', 'scouting'] as const).map((f) => { const lvl = facilityLevel(me, f); return (
          <Panel key={f} title={FAC_LABEL[f]}><div className="p-2 text-[11px] space-y-1.5">
            <div className="flex items-center gap-2"><b className="text-lg">Level {lvl}</b><div className="flex-1"><Bar value={lvl} max={5} color="#22c55e" h={8} /></div></div>
            <div className="text-slate-400">{FAC_EFFECT[f]}</div>
            <div className="flex items-center gap-2"><span className="flex-1">{lvl < 5 ? `To level ${lvl + 1}: ${fmtMoney(facilityUpgradeCost(lvl))}, ${60 + lvl * 30} days` : 'Maximum level'}</span><button className="btn btn-sm btn-primary" disabled={!!k || lvl >= 5} onClick={() => store.mutate((gg) => startConstruction(gg, gg.meta.userClubId, { kind: 'facility', facility: f })).then(res)}>Upgrade</button></div>
          </div></Panel>); })}
      </div>
    </div>
  );
}
void ordinal;
