import { useState } from 'react';
import { store, useStore } from '../store';
import { Ovr, Panel, PosTag, POS_COLOR, statusOf } from '../common';
import type { Club, Formation, Instructions, Mentality, Player } from '../../engine/types';
import type { Nation } from '../../engine/types3';
import { BENCH_SIZE, FORMATIONS, FORMATION_LIST, autoLineup, effective, pickCaptain, posFit, repairLineup, squadOf, validateLineup } from '../../engine/team';
import { MENTALITIES, MENTALITY_LABEL, PRESETS, applyPreset, autoRoles, instrOf, roleAt, rolesForSlot, styleFromInstr } from '../../engine/tactics';
import { autoNationTeam, nationAvailable, validateNationTeam } from '../../engine/intl';
import { Bar } from '../common';

type Sel = { kind: 'xi' | 'bench'; idx: number } | null;

type Tab = 'lineup' | 'instr' | 'roles';
const LEVEL = ['', 'Very low', 'Low', 'Standard', 'High', 'Very high'];
const LINE = ['', 'Very deep', 'Deep', 'Standard', 'High', 'Very high'];

export function TacticsScreen() {
  const { g, ui } = useStore();
  const club = g!.clubs[g!.meta.userClubId];
  const nation: Nation | undefined = g!.intl?.userNation ? g!.intl.nations[g!.intl.userNation] : undefined;
  const forNation = !!nation && ui.tacticsFor === 'nation';
  const me = (forNation ? nation : club) as Club & Nation;
  const [tab, setTab] = useState<Tab>('lineup');
  const slots = FORMATIONS[me.formation];
  const [sel, setSel] = useState<Sel>({ kind: 'xi', idx: 0 });
  const errors = forNation ? validateNationTeam(g!, nation!) : validateLineup(g!, club);
  const squad: Player[] = forNation ? nation!.squad.map((id) => g!.players[id]).filter(Boolean) : squadOf(g!, club.id);
  const instr: Instructions = me.instr ?? instrOf(me as Club);
  const setInstr = (patch: Partial<Instructions>) => store.mutate(() => { const n = { ...instr, ...patch }; me.instr = n; me.style = styleFromInstr(n); });
  const fam = forNation ? nation!.familiarity : g!.training.familiarity;
  const selSlot = sel?.kind === 'xi' ? slots[sel.idx] : null;

  const locate = (id: string): Sel => {
    const i = me.lineup.indexOf(id);
    if (i >= 0) return { kind: 'xi', idx: i };
    const b = me.bench.indexOf(id);
    return b >= 0 ? { kind: 'bench', idx: b } : null;
  };

  const assign = (pid: string) => {
    if (!sel) return;
    const p = g!.players[pid];
    if (p.injuredDays > 0 || p.suspended > 0) { store.toast(`${p.name} is unavailable`, 'bad'); return; }
    store.mutate(() => {
      if (forNation && !squad.some((q) => q.id === pid)) return;
      const from = locate(pid);
      const get = (s: NonNullable<Sel>) => (s.kind === 'xi' ? me.lineup[s.idx] : me.bench[s.idx]) ?? '';
      const set = (s: NonNullable<Sel>, id: string) => {
        if (s.kind === 'xi') me.lineup[s.idx] = id;
        else { while (me.bench.length <= s.idx) me.bench.push(''); me.bench[s.idx] = id; }
      };
      const occupant = get(sel);
      set(sel, pid);
      if (from) set(from, occupant);
      me.bench = me.bench.filter((x, i) => x !== '' || i < BENCH_SIZE).slice(0, BENCH_SIZE);
      me.bench = me.bench.filter((x) => x);
      if (!me.lineup.includes(me.captainId)) me.captainId = pickCaptain(g!, me);
    });
  };

  const clearBench = () => {
    if (sel?.kind !== 'bench') return;
    store.mutate(() => { me.bench = me.bench.filter((_, i) => i !== sel.idx); });
  };

  const setFormation = (f: Formation) => store.mutate(() => {
    me.formation = f;
    const res = autoLineup(forNation ? nationAvailable(g!, nation!.id) : squad, f);
    me.lineup = res.lineup;
    me.bench = res.bench;
    if (!me.lineup.includes(me.captainId)) me.captainId = pickCaptain(g!, me);
    if (forNation) autoNationTeam(g!, nation!); else autoRoles(g!, club);
    setSel({ kind: 'xi', idx: 0 });
  });

  const auto = () => store.mutate(() => {
    if (forNation) { autoNationTeam(g!, nation!); return; }
    const r = autoLineup(squad, me.formation);
    me.lineup = r.lineup; me.bench = r.bench; me.captainId = pickCaptain(g!, me); autoRoles(g!, club);
  }).then(() => store.toast('Best available lineup selected'));

  const fix = () => store.mutate(() => { if (forNation) autoNationTeam(g!, nation!); else repairLineup(g!, club); }).then(() => store.toast('Lineup repaired'));

  const candidates = [...squad].sort((a, b) => {
    const pos = selSlot?.pos;
    return (pos ? effective(b, pos) - effective(a, pos) : b.ovr - a.ovr);
  });
  const benchSlots = Array.from({ length: BENCH_SIZE }, (_, i) => me.bench[i] ?? '');

  return (
    <div className="h-full flex gap-2 fade-in">
      {/* Pitch */}
      <div className="flex flex-col gap-1.5 w-[34%] min-w-[210px]">
        <div className="relative flex-1 min-h-0 rounded-md border border-line overflow-hidden" style={{ background: 'linear-gradient(180deg,#14532d,#166534 50%,#14532d)' }}>
          <div className="absolute inset-2 border border-white/25 rounded-sm" />
          <div className="absolute left-2 right-2 top-1/2 border-t border-white/25" />
          <div className="absolute left-1/2 top-1/2 w-12 h-12 -ml-6 -mt-6 border border-white/25 rounded-full" />
          <div className="absolute left-[30%] right-[30%] bottom-2 h-[14%] border border-white/25 border-b-0" />
          <div className="absolute left-[30%] right-[30%] top-2 h-[14%] border border-white/25 border-t-0" />
          {slots.map((s, i) => {
            const p = g!.players[me.lineup[i]];
            const active = sel?.kind === 'xi' && sel.idx === i;
            const bad = !p || p.injuredDays > 0 || p.suspended > 0;
            return (
              <button key={i} onClick={() => setSel({ kind: 'xi', idx: i })} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[11px] font-extrabold text-black ${active ? 'ring-2 ring-white' : ''}`} style={{ background: bad ? 'rgb(var(--bad))' : p ? POS_COLOR[s.pos] : '#475569', borderColor: active ? '#fff' : 'rgba(0,0,0,.5)' }}>
                  {p ? p.ovr : '?'}
                </span>
                <span className="text-[9px] leading-tight mt-0.5 px-1 rounded bg-black/60 max-w-[64px] truncate">{p ? p.name.split(' ').slice(-1)[0] : s.label}</span>
                {p && me.captainId === p.id && <span className="absolute -top-1 -right-1 text-[8px] bg-warn text-black rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">C</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 shrink-0">
          {benchSlots.map((id, i) => {
            const p = id ? g!.players[id] : null;
            const active = sel?.kind === 'bench' && sel.idx === i;
            return (
              <button key={i} onClick={() => setSel({ kind: 'bench', idx: i })} className={`flex-1 min-w-0 rounded border px-0.5 py-1 text-center ${active ? 'border-white bg-panel2' : 'border-line bg-panel'}`}>
                <div className="text-[9px] text-slate-400">S{i + 1}</div>
                <div className="text-[10px] font-bold truncate">{p ? p.name.split(' ').slice(-1)[0] : '-'}</div>
                <div className="text-[10px]">{p ? p.pos : ''}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex gap-1 items-center shrink-0">
          {nation && <><button className={`btn btn-sm ${!forNation ? 'btn-primary' : ''}`} onClick={() => store.setUi({ tacticsFor: 'club' })}>{club.short}</button><button className={`btn btn-sm ${forNation ? 'btn-primary' : ''}`} onClick={() => store.setUi({ tacticsFor: 'nation' })}>{nation.name}</button><span className="w-2" /></>}
          {(['lineup', 'instr', 'roles'] as Tab[]).map((t) => <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t === 'lineup' ? 'Lineup' : t === 'instr' ? 'Instructions' : 'Roles'}</button>)}
          <div className="flex-1" />
          <div className="w-28"><div className="text-[9px] text-slate-400 uppercase">Familiarity {Math.round(fam)}%</div><Bar value={fam} /></div>
        </div>
        {errors.length > 0 && (
          <div className="border border-bad/60 bg-bad/10 rounded px-2 py-1 text-[11px] text-bad shrink-0">
            {errors.slice(0, 3).join(' ')}{errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}
          </div>
        )}

        {tab === 'lineup' && (<>
          <Panel>
            <div className="p-2 flex items-center gap-2">
              <div className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Formation</div>
              <div className="flex gap-1 flex-1">{FORMATION_LIST.map((f) => <button key={f} className={`btn btn-sm flex-1 whitespace-nowrap ${me.formation === f ? 'btn-primary' : ''}`} onClick={() => setFormation(f)}>{f}</button>)}</div>
            </div>
          </Panel>
          <div className="flex gap-1 items-center shrink-0">
            <button className="btn btn-sm" onClick={auto}>Auto-pick best XI</button>
            <button className="btn btn-sm" onClick={fix}>Fix lineup</button>
            {sel?.kind === 'bench' && me.bench[sel.idx] && <button className="btn btn-sm" onClick={clearBench}>Remove sub</button>}
            <div className="flex-1 text-[11px] text-right text-slate-400">{sel ? `Selecting: ${sel.kind === 'xi' ? slots[sel.idx].label : `Sub ${sel.idx + 1}`}` : 'Tap a slot'}</div>
          </div>
          <Panel className="flex-1" title={forNation ? 'National squad - tap a player to place him' : 'Squad - tap a player to place him'}>
            <div className="scroll-y h-full">
              <table className="w-full">
                <tbody>
                  {candidates.map((p) => {
                    const loc = locate(p.id);
                    const st = statusOf(p);
                    const fit = selSlot ? posFit(p.pos, selSlot.pos) : 1;
                    const unavailable = p.injuredDays > 0 || p.suspended > 0;
                    return (
                      <tr key={p.id} onClick={() => assign(p.id)} className={`border-t border-line/40 ${unavailable ? 'opacity-50' : 'active:bg-panel2'}`}>
                        <td className="td"><PosTag pos={p.pos} /></td>
                        <td className="td font-semibold">{p.name}</td>
                        <td className="td"><Ovr v={p.ovr} /></td>
                        <td className="td text-slate-400">Fit {Math.round(p.fitness)}</td>
                        <td className="td text-slate-400">{fit < 1 && !unavailable ? <span className="text-warn">out of position</span> : ''}</td>
                        <td className="td text-right">
                          {st ? <span style={{ color: st.color }}>{st.text}</span> : loc ? <span className={loc.kind === 'xi' ? 'text-accent font-semibold' : 'text-accent2 font-semibold'}>{loc.kind === 'xi' ? `XI ${slots[loc.idx].label}` : `SUB ${loc.idx + 1}`}</span> : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>)}

        {tab === 'instr' && (
          <div className="flex-1 min-h-0 scroll-y flex flex-col gap-1.5">
            <Panel title="Presets" className="shrink-0"><div className="p-1.5 flex flex-wrap gap-1">{PRESETS.map((p) => <button key={p.id} className="btn btn-sm" onClick={() => store.mutate(() => { applyPreset(me as Club, p.id); me.style = styleFromInstr(me.instr!); })}>{p.name}</button>)}</div></Panel>
            <Panel title="Mentality" className="shrink-0"><div className="p-1.5 flex gap-1">{MENTALITIES.map((m) => <button key={m} className={`btn btn-sm flex-1 ${me.mentality === m ? 'btn-primary' : ''}`} onClick={() => store.mutate(() => { me.mentality = m as Mentality; })}>{MENTALITY_LABEL[m]}</button>)}</div></Panel>
            <Panel title="Shape and tempo" className="shrink-0">
              <div className="p-1.5 space-y-1">
                {([['press', 'Pressing', LEVEL, 'High press wins the ball early but tires players.'], ['line', 'Defensive line', LINE, 'High line squeezes play but risks balls in behind.'], ['tempo', 'Tempo', LEVEL, 'Fast tempo means more chances and more fatigue.'], ['width', 'Width', LEVEL, 'Wide play stretches defences and creates crosses.']] as const).map(([k, label, names, hint]) => (
                  <div key={k} className="flex items-center gap-2"><div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-slate-400" title={hint}>{label}</div>
                    <div className="flex gap-1 flex-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`btn btn-sm flex-1 px-0 ${instr[k] === n ? 'btn-primary' : ''}`} onClick={() => setInstr({ [k]: n })}>{n}</button>)}</div>
                    <div className="w-16 text-[10px] text-slate-400 text-right">{names[instr[k]]}</div></div>
                ))}
              </div>
            </Panel>
            <Panel title="Approach" className="shrink-0">
              <div className="p-1.5 space-y-1">
                <div className="flex items-center gap-2"><div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Passing</div><div className="flex gap-1 flex-1">{(['short', 'mixed', 'long'] as const).map((x) => <button key={x} className={`btn btn-sm flex-1 capitalize ${instr.passing === x ? 'btn-primary' : ''}`} onClick={() => setInstr({ passing: x })}>{x}</button>)}</div></div>
                <div className="flex items-center gap-2"><div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Counter</div><div className="flex gap-1 flex-1">{[false, true].map((x) => <button key={String(x)} className={`btn btn-sm flex-1 ${instr.counter === x ? 'btn-primary' : ''}`} onClick={() => setInstr({ counter: x })}>{x ? 'Counter-attack' : 'Hold shape'}</button>)}</div></div>
                <div className="flex items-center gap-2"><div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Set pieces</div><div className="flex gap-1 flex-1">{(['zonal', 'mixed', 'man'] as const).map((x) => <button key={x} className={`btn btn-sm flex-1 capitalize ${instr.setPieces === x ? 'btn-primary' : ''}`} onClick={() => setInstr({ setPieces: x })}>{x === 'man' ? 'Man-marking' : x}</button>)}</div></div>
                <div className="flex items-center gap-2"><div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Corners</div><div className="flex gap-1 flex-1">{(['near', 'far', 'short'] as const).map((x) => <button key={x} className={`btn btn-sm flex-1 capitalize ${instr.corners === x ? 'btn-primary' : ''}`} onClick={() => setInstr({ corners: x })}>{x === 'near' ? 'Near post' : x === 'far' ? 'Far post' : 'Short'}</button>)}</div></div>
              </div>
            </Panel>
            <div className="text-[10px] text-slate-500 px-1">Changing many instructions at once lowers tactical familiarity; training and repeated matches rebuild it.</div>
          </div>
        )}

        {tab === 'roles' && (
          <Panel className="flex-1" title="Player roles - choose by position" right={<button className="btn btn-sm" onClick={() => store.mutate(() => { if (forNation) autoNationTeam(g!, nation!); else autoRoles(g!, club); })}>Best roles</button>}>
            <div className="scroll-y h-full">
              {slots.map((sl, i) => {
                const p = g!.players[me.lineup[i]];
                const cur = roleAt(me as Club, i);
                return (
                  <div key={i} className="px-2 py-1 border-b border-line/40">
                    <div className="flex items-center gap-2 text-[11px]"><PosTag pos={sl.pos} /><b className="w-9">{sl.label}</b><span className="flex-1 truncate">{p ? p.name : 'Empty'}</span><span className="text-accent2">{cur.label}</span></div>
                    <div className="flex flex-wrap gap-1 mt-1">{rolesForSlot(sl).map((r) => <button key={r.id} title={r.desc} className={`btn btn-sm ${cur.id === r.id ? 'btn-primary' : ''}`} onClick={() => store.mutate(() => { const arr = [...(me.roles ?? me.lineup.map((_, j) => roleAt(me as Club, j).id))]; arr[i] = r.id; me.roles = arr; })}>{r.label}</button>)}</div>
                    {cur && <div className="text-[10px] text-slate-500 mt-0.5">{cur.desc}</div>}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
