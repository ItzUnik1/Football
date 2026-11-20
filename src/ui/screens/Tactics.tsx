import { useState } from 'react';
import { store, useStore } from '../store';
import { Ovr, Panel, PosTag, POS_COLOR, statusOf } from '../common';
import type { Formation, Mentality, Style } from '../../engine/types';
import { BENCH_SIZE, FORMATIONS, FORMATION_LIST, autoLineup, effective, pickCaptain, posFit, repairLineup, squadOf, validateLineup } from '../../engine/team';

type Sel = { kind: 'xi' | 'bench'; idx: number } | null;

export function TacticsScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const slots = FORMATIONS[me.formation];
  const [sel, setSel] = useState<Sel>({ kind: 'xi', idx: 0 });
  const errors = validateLineup(g!, me);
  const squad = squadOf(g!, me.id);
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
    const res = autoLineup(squad, f);
    me.lineup = res.lineup;
    me.bench = res.bench;
    if (!me.lineup.includes(me.captainId)) me.captainId = pickCaptain(g!, me);
    setSel({ kind: 'xi', idx: 0 });
  });

  const auto = () => store.mutate(() => {
    const r = autoLineup(squad, me.formation);
    me.lineup = r.lineup; me.bench = r.bench; me.captainId = pickCaptain(g!, me);
  }).then(() => store.toast('Best available lineup selected'));

  const fix = () => store.mutate(() => repairLineup(g!, me)).then(() => store.toast('Lineup repaired'));

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
                <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[11px] font-extrabold text-black ${active ? 'ring-2 ring-white' : ''}`} style={{ background: bad ? '#ef4444' : p ? POS_COLOR[s.pos] : '#475569', borderColor: active ? '#fff' : 'rgba(0,0,0,.5)' }}>
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
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Panel>
          <div className="p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Formation</div>
              <div className="flex gap-1 flex-1">{FORMATION_LIST.map((f) => <button key={f} className={`btn btn-sm flex-1 whitespace-nowrap ${me.formation === f ? 'btn-primary' : ''}`} onClick={() => setFormation(f)}>{f}</button>)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Mentality</div>
              <div className="flex gap-1 flex-1">{(['defensive', 'balanced', 'attacking'] as Mentality[]).map((m) => <button key={m} className={`btn btn-sm flex-1 capitalize ${me.mentality === m ? 'btn-primary' : ''}`} onClick={() => store.mutate(() => { me.mentality = m; })}>{m.slice(0, 3) === 'def' ? 'Defend' : m === 'balanced' ? 'Balanced' : 'Attack'}</button>)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">Style</div>
              <div className="flex gap-1 flex-1">{(['possession', 'direct', 'counter'] as Style[]).map((s) => <button key={s} className={`btn btn-sm flex-1 capitalize ${me.style === s ? 'btn-primary' : ''}`} onClick={() => store.mutate(() => { me.style = s; })}>{s === 'possession' ? 'Possess' : s === 'direct' ? 'Direct' : 'Counter'}</button>)}</div>
            </div>
          </div>
        </Panel>
        <div className="flex gap-1 items-center shrink-0">
          <button className="btn btn-sm" onClick={auto}>Auto-pick best XI</button>
          <button className="btn btn-sm" onClick={fix}>Fix lineup</button>
          {sel?.kind === 'bench' && me.bench[sel.idx] && <button className="btn btn-sm" onClick={clearBench}>Remove sub</button>}
          <div className="flex-1 text-[11px] text-right text-slate-400">{sel ? `Selecting: ${sel.kind === 'xi' ? slots[sel.idx].label : `Sub ${sel.idx + 1}`}` : 'Tap a slot'}</div>
        </div>
        {errors.length > 0 && (
          <div className="border border-bad/60 bg-bad/10 rounded px-2 py-1 text-[11px] text-bad shrink-0">
            {errors.slice(0, 3).join(' ')}{errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}
          </div>
        )}
        <Panel className="flex-1" title="Squad - tap a player to place him">
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
      </div>
    </div>
  );
}
