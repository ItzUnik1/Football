import { store, useStore } from '../store';
import { Bar, Ovr, Panel, PosTag, Stat } from '../common';
import type { Intensity, SessionType, TrainingFocus } from '../../engine/types';
import { DEFAULT_PLAN, SESSION_TYPES } from '../../engine/development';
import { academyOf, squadOf } from '../../engine/team';
import { facilityCost, upgradeFacility } from '../../engine/finance';
import { promoteYouth, releaseYouth } from '../../engine/youth';
import { addDays, fmtDate, fmtDateShort } from '../../engine/calendar';
import { fmtMoney } from '../../engine/valuation';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const sel = 'bg-black/40 border border-line rounded px-1.5 py-1 text-[11px]';

function Facility({ kind, label }: { kind: 'medical' | 'youth' | 'training'; label: string }) {
  const { g } = useStore();
  const c = g!.clubs[g!.meta.userClubId];
  const lvl = (kind === 'medical' ? c.medicalLevel : kind === 'youth' ? c.youthLevel : c.trainingLevel) ?? 3;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`w-2.5 h-2.5 rounded-sm ${i <= lvl ? 'bg-accent' : 'bg-white/10'}`} />)}</span>
      <button className="btn btn-sm" disabled={lvl >= 5} onClick={() => store.mutate((gg) => upgradeFacility(gg, kind)).then((r) => store.toast(r.message, r.ok ? 'ok' : 'bad'))}>{lvl >= 5 ? 'Max' : `Upgrade ${fmtMoney(facilityCost(lvl))}`}</button>
    </div>
  );
}

export function TrainingScreen() {
  const { g } = useStore();
  const tr = g!.training;
  const me = g!.clubs[g!.meta.userClubId];
  const squad = squadOf(g!, me.id).sort((a, b) => b.ovr - a.ovr);
  const date = g!.meta.date!;
  const setPlan = (i: number, s: SessionType) => store.mutate((gg) => { gg.training.plan[i] = s; });
  const next7 = Array.from({ length: 7 }, (_, i) => addDays(date, i));
  return (
    <div className="h-full grid grid-cols-[1fr_1.2fr] gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0 scroll-y pr-0.5">
        <Panel className="shrink-0" title="Weekly schedule" right={<button className="text-[10px] text-accent2 underline" onClick={() => store.mutate((gg) => { gg.training.plan = DEFAULT_PLAN.slice(); })}>Reset</button>}>
          <div className="p-2 grid grid-cols-[28px_1fr_28px_1fr] gap-x-2 gap-y-1 items-center">
            {DAYS.map((d, i) => (<><span key={d} className="text-[11px] text-slate-400">{d}</span>
              <select key={d + 's'} className={sel} value={tr.plan[i]} onChange={(e) => setPlan(i, e.target.value as SessionType)}>{SESSION_TYPES.map((s) => <option key={s}>{s}</option>)}</select></>))}
          </div>
          <div className="px-2 pb-2 text-[10px] text-slate-500">Match days are rest days and the day before a match is a recovery session automatically.</div>
        </Panel>
        <Panel className="shrink-0" title="Intensity and tactics">
          <div className="p-2 space-y-2">
            <div className="flex gap-1">{(['low', 'medium', 'high'] as Intensity[]).map((i) => <button key={i} className={`btn btn-sm flex-1 capitalize ${tr.intensity === i ? 'btn-primary' : ''}`} onClick={() => store.mutate((gg) => { gg.training.intensity = i; })}>{i}</button>)}</div>
            <div className="text-[10px] text-slate-400">Higher intensity improves players faster and builds familiarity, but raises injury risk and fatigue.</div>
            <div><div className="flex justify-between text-[10px] text-slate-400"><span>Tactical familiarity ({tr.formation})</span><span>{Math.round(tr.familiarity)}%</span></div><Bar value={tr.familiarity} /></div>
            <Facility kind="training" label="Training facilities" />
          </div>
        </Panel>
        <Panel title="Next 7 days" className="shrink-0">
          <div className="p-1 text-[11px] grid grid-cols-2">
            {next7.map((t, i) => { const sess = g!.fixtures.some((f) => f.date === t && (f.home === me.id || f.away === me.id)) ? 'Match day' : g!.training.plan[(new Date(t).getUTCDay() + 6) % 7]; return <div key={i} className="flex gap-2 px-1 py-0.5"><span className="w-14 text-slate-400">{fmtDateShort(t)}</span><span>{sess}</span></div>; })}
          </div>
        </Panel>
      </div>
      <Panel title="Individual focus" className="min-h-0">
        <div className="scroll-y h-full">
          <table className="w-full">
            <thead><tr><th className="th">Pos</th><th className="th">Name</th><th className="th">Age</th><th className="th">Ovr/Pot</th><th className="th">Form</th><th className="th">Focus</th></tr></thead>
            <tbody>{squad.map((p) => (
              <tr key={p.id} className="border-t border-line/40">
                <td className="td"><PosTag pos={p.pos} /></td><td className="td font-semibold" onClick={() => store.openProfile(p.id)}>{p.name}</td><td className="td">{p.age}</td>
                <td className="td"><Ovr v={p.ovr} /> <span className="text-slate-500">{p.age <= 24 ? p.pot : ''}</span></td><td className="td">{(p.form ?? 6.5).toFixed(1)}</td>
                <td className="td"><select className={sel} value={p.focus ?? 'auto'} onChange={(e) => store.mutate(() => { p.focus = e.target.value as TrainingFocus; })}>
                  {['auto', 'technical', 'physical', 'mental', 'attack', 'defence'].map((f) => <option key={f}>{f}</option>)}</select></td>
              </tr>))}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function MedicalScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const date = g!.meta.date!;
  const squad = squadOf(g!, me.id);
  const inj = squad.filter((p) => p.injuredDays > 0).sort((a, b) => b.injuredDays - a.injuredDays);
  const ret = squad.filter((p) => p.injuredDays === 0 && (p.returnDays ?? 0) > 0);
  const banned = squad.filter((p) => p.suspended > 0);
  const tired = squad.filter((p) => p.fitness < 70 && p.injuredDays === 0).sort((a, b) => a.fitness - b.fitness);
  const prone = squad.filter((p) => (p.injuries?.length ?? 0) >= 2);
  return (
    <div className="h-full grid grid-cols-2 gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title={`Injured (${inj.length})`} className="flex-1">
          <div className="scroll-y h-full">
            {inj.length === 0 && <div className="p-3 text-slate-500 text-center">No injuries. The squad is fully fit.</div>}
            {inj.map((p) => (
              <button key={p.id} onClick={() => store.openProfile(p.id)} className="w-full flex items-center gap-2 px-2 py-1.5 border-b border-line/40 text-left active:bg-panel2">
                <PosTag pos={p.pos} /><div className="flex-1 min-w-0"><div className="font-semibold truncate">{p.name}</div><div className="text-[10px] text-slate-400">{p.injury}</div></div>
                <div className="text-right"><div className="text-bad font-bold">{p.injuredDays}d</div><div className="text-[10px] text-slate-400">back {fmtDate(addDays(date, p.injuredDays)).slice(0, -5)}</div></div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Suspended">
          <div className="p-2 text-[11px]">{banned.length ? banned.map((p) => <div key={p.id}>{p.name} - {p.suspended} match{p.suspended > 1 ? 'es' : ''}</div>) : <span className="text-slate-500">Nobody suspended.</span>}</div>
        </Panel>
      </div>
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title="Medical department"><div className="p-2 space-y-1.5"><Facility kind="medical" label="Medical facilities" /><div className="text-[10px] text-slate-500">Better facilities shorten injuries and reduce training injury risk.</div></div></Panel>
        <Panel title="Returning from injury / low fitness" className="flex-1">
          <div className="scroll-y h-full text-[11px]">
            {ret.map((p) => <div key={p.id} className="flex gap-2 px-2 py-1 border-b border-line/40"><span className="flex-1 font-semibold">{p.name}</span><span className="text-warn">Returning ({p.returnDays}d) - higher risk</span></div>)}
            {tired.slice(0, 12).map((p) => <div key={p.id} className="flex items-center gap-2 px-2 py-1 border-b border-line/40"><span className="flex-1">{p.name}</span><div className="w-20"><Bar value={p.fitness} /></div><span className="w-8 text-right">{Math.round(p.fitness)}%</span></div>)}
            {prone.length > 0 && <div className="px-2 py-1 text-slate-400">Injury-prone: {prone.map((p) => p.name).join(', ')}</div>}
            {!ret.length && !tired.length && <div className="p-3 text-slate-500 text-center">Everyone is fresh.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const stars = (pot: number) => Math.max(1, Math.min(5, Math.round((pot - 45) / 9)));

export function AcademyScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const list = academyOf(g!, me.id).sort((a, b) => b.pot - a.pot);
  const tr = g!.training;
  const act = (fn: () => { ok: boolean; message: string }) => store.mutate(fn).then((r) => store.toast(r.message, r.ok ? 'ok' : 'bad'));
  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <Facility kind="youth" label="Youth facilities" />
        <label className="text-[11px] text-slate-400 flex items-center gap-1">Programme
          <select className={sel} value={tr.youthProgram} onChange={(e) => store.mutate((gg) => { gg.training.youthProgram = e.target.value as typeof tr.youthProgram; })}>
            {['balanced', 'technical', 'physical', 'mental'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <span className="text-[10px] text-slate-500 ml-auto">{list.length} prospects. Intake arrives every 1 July. Promote players before they turn 19.</span>
      </div>
      <Panel className="flex-1">
        <div className="scroll-y h-full">
          <table className="w-full">
            <thead><tr><th className="th">Pos</th><th className="th">Name</th><th className="th">Age</th><th className="th">Ovr</th><th className="th">Potential</th><th className="th">Form</th><th className="th">Train w/ first team</th><th className="th">Actions</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} className="border-t border-line/40">
                <td className="td"><PosTag pos={p.pos} /></td><td className="td font-semibold" onClick={() => store.openProfile(p.id)}>{p.name}</td><td className="td">{p.age}</td>
                <td className="td"><Ovr v={p.ovr} /></td>
                <td className="td text-warn">{'★'.repeat(stars(p.pot))}<span className="text-slate-600">{'★'.repeat(5 - stars(p.pot))}</span></td>
                <td className="td">{(p.form ?? 6.5).toFixed(1)}</td>
                <td className="td"><input type="checkbox" checked={!!p.trainWithFirst} onChange={(e) => store.mutate(() => { p.trainWithFirst = e.target.checked; })} /></td>
                <td className="td"><div className="flex gap-1"><button className="btn btn-sm btn-primary" onClick={() => act(() => promoteYouth(g!, p.id))}>Promote</button><button className="btn btn-sm btn-danger" onClick={() => act(() => releaseYouth(g!, p.id))}>Release</button></div></td>
              </tr>))}</tbody>
          </table>
          {list.length === 0 && <div className="p-4 text-center text-slate-500">The academy is empty. A new intake arrives on 1 July.</div>}
        </div>
      </Panel>
    </div>
  );
}
void Stat;
