import { useMemo, useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Ovr, Panel, PosTag, Stat } from '../common';
import { fmtMoney } from '../../engine/valuation';
import { boardObjective, repRank } from '../../engine/game';
import { createWorld } from '../../engine/generator';
import { squadOf, squadStrength, wageBill } from '../../engine/team';
import type { Game } from '../../engine/types';
import type { Background, ManagerProfile } from '../../engine/types3';
import { NATIONS, MANAGER_STYLES } from '../../engine/names';
import { BACKGROUNDS } from '../../engine/mgr';

const fmtWhen = (d?: number) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const NAMES_FIRST = ['Alex', 'Chris', 'Sam', 'Jamie', 'Luca', 'Mateo', 'Noah', 'Ethan', 'Lewis', 'Daniel'];
const NAMES_LAST = ['Walker', 'Rossi', 'Hughes', 'Moreno', 'Fischer', 'Silva', 'Murray', 'Costa', 'Bennett', 'Novak'];

export function StartScreen() {
  const { ui } = useStore();
  const last = store.lastSlot();
  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-[#0b0f17] via-[#0f1a2b] to-[#0b0f17]">
      <div className="text-center fade-in">
        <div className="text-5xl font-extrabold tracking-tight text-white">Touch<span className="text-accent">line</span></div>
        <div className="text-slate-400 mt-1 mb-5 text-xs">Football management simulation</div>
        <div className="flex flex-col gap-2 items-stretch w-56 mx-auto">
          {ui.hasSave && last && <button className="btn btn-primary min-h-[38px] text-sm" onClick={() => store.continueCareer(last)}>Continue Career{ui.slots.find((x) => x.slot === last)?.club ? ` - ${ui.slots.find((x) => x.slot === last)!.club}` : ''}</button>}
          {ui.hasSave && <button className="btn min-h-[38px] text-sm" onClick={() => store.setUi({ phase: 'slots' })}>Load / Manage Saves</button>}
          <button className="btn min-h-[38px] text-sm" onClick={() => { const free = ui.slots.find((x) => !x.used)?.slot ?? last ?? 1; store.setUi({ phase: 'profile', draft: ui.draft ?? { profile: { name: `${NAMES_FIRST[Math.floor(Math.random() * 10)]} ${NAMES_LAST[Math.floor(Math.random() * 10)]}`, age: 45, nat: 'England', background: 'journeyman', style: 'Pragmatic' }, slot: free, realNames: true } }); }}>New Career</button>
        </div>
        <div className="text-[10px] text-slate-500 mt-4">Offline-first - {ui.slots.length || 6} save slots on this device</div>
      </div>
    </div>
  );
}

export function SlotsScreen() {
  const { ui } = useStore();
  const [del, setDel] = useState<number | null>(null);
  return (
    <div className="h-full flex flex-col p-2 gap-2">
      <div className="flex items-center justify-between shrink-0"><div className="font-bold text-sm">Saved careers</div><button className="btn btn-sm" onClick={() => store.setUi({ phase: 'start' })}>Back</button></div>
      <div className="flex-1 min-h-0 scroll-y grid grid-cols-2 gap-2 content-start">
        {ui.slots.map((sl) => (
          <Panel key={sl.slot}>
            <div className="p-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-panel2 flex items-center justify-center font-extrabold text-accent shrink-0">{sl.slot}</div>
              <div className="flex-1 min-w-0 text-[11px]">
                {sl.used ? (<><div className="font-bold truncate">{sl.club}</div><div className="text-slate-400 truncate">{sl.manager} - {sl.league}</div><div className="text-slate-500">Season {sl.season}/{String((sl.season ?? 0) + 1).slice(2)} - {fmtWhen(sl.date)}</div></>) : <div className="text-slate-500">Empty slot</div>}
              </div>
              {sl.used ? <div className="flex flex-col gap-1"><button className="btn btn-sm btn-primary" onClick={() => store.continueCareer(sl.slot)}>Load</button><button className="btn btn-sm btn-danger" onClick={() => setDel(sl.slot)}>Delete</button></div>
                : <button className="btn btn-sm" onClick={() => store.setUi({ phase: 'profile', draft: { profile: { name: 'New Manager', age: 45, nat: 'England', background: 'journeyman', style: 'Pragmatic' }, slot: sl.slot, realNames: true } })}>New</button>}
            </div>
          </Panel>
        ))}
      </div>
      {del && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40" onClick={() => setDel(null)}>
          <div className="panel p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-1">Delete slot {del}?</div>
            <div className="text-slate-400 text-xs mb-3">This career will be permanently deleted.</div>
            <div className="flex gap-2 justify-end"><button className="btn" onClick={() => setDel(null)}>Cancel</button><button className="btn btn-danger" onClick={() => { const n = del; setDel(null); store.deleteSlotSave(n); }}>Delete</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfileScreen() {
  const { ui } = useStore();
  const d = ui.draft!;
  const set = (p: Partial<ManagerProfile>) => store.setUi({ draft: { ...d, profile: { ...d.profile, ...p } } });
  const pr = d.profile; const bg = BACKGROUNDS[pr.background];
  const target = ui.slots.find((x) => x.slot === d.slot);
  const valid = pr.name.trim().length >= 3;
  const Bar2 = ({ label, v }: { label: string; v: number }) => <div className="flex items-center gap-2 text-[10px]"><span className="w-20 text-slate-400 uppercase tracking-wider">{label}</span><div className="flex-1 h-1.5 bg-line rounded"><div className="h-full rounded bg-accent" style={{ width: `${(v / 20) * 100}%` }} /></div><b className="w-5 text-right">{v}</b></div>;
  return (
    <div className="h-full flex flex-col p-2 gap-2">
      <div className="flex items-center justify-between shrink-0"><div className="font-bold text-sm">Create your manager</div><button className="btn btn-sm" onClick={() => store.setUi({ phase: 'start' })}>Back</button></div>
      <div className="flex-1 min-h-0 flex gap-2">
        <Panel className="flex-1 min-w-0" title="Profile">
          <div className="scroll-y h-full p-2 space-y-2 text-[11px]">
            <div className="grid grid-cols-[1fr_70px_1fr] gap-2">
              <label className="block"><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Name</div><input className="w-full bg-panel2 border border-line rounded px-2 py-1.5 text-sm" maxLength={28} value={pr.name} onChange={(e) => set({ name: e.target.value })} /></label>
              <label className="block"><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Age</div><input type="number" min={30} max={70} className="w-full bg-panel2 border border-line rounded px-2 py-1.5 text-sm" value={pr.age} onChange={(e) => set({ age: Math.max(30, Math.min(70, parseInt(e.target.value, 10) || 45)) })} /></label>
              <label className="block"><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Nationality</div><select className="w-full bg-panel2 border border-line rounded px-2 py-1.5 text-sm" value={pr.nat} onChange={(e) => set({ nat: e.target.value })}>{NATIONS.map((n) => <option key={n.nat}>{n.nat}</option>)}</select></label>
            </div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Background</div>
              <div className="grid grid-cols-2 gap-1">{(Object.keys(BACKGROUNDS) as Background[]).map((k) => <button key={k} className={`btn btn-sm justify-start text-left ${pr.background === k ? 'btn-primary' : ''}`} onClick={() => set({ background: k })}>{BACKGROUNDS[k].label}</button>)}</div>
              <div className="text-slate-400 mt-1">{bg.blurb}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Preferred style (sets your starting tactics)</div>
              <div className="flex flex-wrap gap-1">{MANAGER_STYLES.map((st) => <button key={st} className={`btn btn-sm ${pr.style === st ? 'btn-primary' : ''}`} onClick={() => set({ style: st })}>{st}</button>)}</div></div>
          </div>
        </Panel>
        <div className="w-[38%] min-w-[210px] flex flex-col gap-2">
          <Panel title="Starting attributes"><div className="p-2 space-y-1"><Bar2 label="Tactics" v={bg.tactical} /><Bar2 label="Motivation" v={bg.motivation} /><Bar2 label="Youth" v={bg.youth} /><div className="text-[10px] text-slate-400 pt-1">Reputation {bg.rep >= 0 ? '+' : ''}{bg.rep}, experience {bg.exp} seasons. Attributes grow with success.</div></div></Panel>
          <Panel title="World"><div className="p-2 space-y-1.5 text-[11px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.realNames} onChange={(e) => store.setUi({ draft: { ...d, realNames: e.target.checked } })} /> Real club names <span className="text-slate-500">(names only; players, badges and kits are fictional)</span></label>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Save slot</div><div className="flex gap-1 flex-wrap">{ui.slots.map((sl) => <button key={sl.slot} className={`btn btn-sm ${d.slot === sl.slot ? 'btn-primary' : ''}`} onClick={() => store.setUi({ draft: { ...d, slot: sl.slot } })}>{sl.slot}{sl.used ? '*' : ''}</button>)}</div>
              {target?.used && <div className="text-warn mt-1">Slot {d.slot} holds {target.club} and will be overwritten.</div>}</div>
          </div></Panel>
          <button className="btn btn-primary min-h-[38px]" disabled={!valid} onClick={() => store.setUi({ phase: 'select' })}>Choose a club</button>
        </div>
      </div>
    </div>
  );
}

export function ClubSelect() {
  // The world shown here is the exact world the career will use.
  const { ui } = useStore();
  const world = useMemo(() => createWorld(2026, ui.draft?.realNames ?? true), []); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => {
    const w = world;
    return { clubs: w.clubs, players: w.players, leagues: w.leagues, fixtures: [], messages: [], reports: {}, tx: [], meta: { userClubId: '', week: 1, season: 2026, startDate: 0, nextMsg: 1, nextTx: 1, seed: 0, version: 2 } } as unknown as Game;
  }, [world]);
  const [tier, setTier] = useState('L1');
  const clubs = Object.values(preview.clubs).filter((c) => c.leagueId === tier).sort((a, b) => b.reputation - a.reputation);
  const [sel, setSel] = useState(Object.values(preview.clubs).filter((c) => c.leagueId === 'L1').sort((a, b) => b.reputation - a.reputation)[0].id);
  const club = preview.clubs[sel];
  const squad = squadOf(preview, sel).sort((a, b) => b.ovr - a.ovr);
  const obj = boardObjective(preview, sel);
  const [busy, setBusy] = useState(false);

  return (
    <div className="h-full flex flex-col p-2 gap-2">
      <div className="flex items-center justify-between shrink-0">
        <div className="font-bold text-sm">Select your club</div>
        <button className="btn btn-sm" onClick={() => store.setUi({ phase: 'profile' })}>Back</button>
      </div>
      <div className="flex-1 min-h-0 flex gap-2">
        <Panel className="w-60 shrink-0">
          <div className="flex gap-1 p-1 border-b border-line">{Object.values(preview.leagues).map((l) => <button key={l.id} className={`btn btn-sm flex-1 ${tier === l.id ? 'btn-primary' : ''}`} onClick={() => { setTier(l.id); setSel(Object.values(preview.clubs).filter((c) => c.leagueId === l.id).sort((a, b) => b.reputation - a.reputation)[0].id); }}>{l.short}</button>)}</div>
          <div className="scroll-y" style={{ height: 'calc(100% - 34px)' }}>
            {clubs.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-line/50 ${sel === c.id ? 'bg-accent/15' : 'active:bg-panel2'}`}>
                <Badge club={c} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-[10px] text-slate-400">Strength {squadStrength(preview, c.id)} - {fmtMoney(c.transferBudget)} budget</div>
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="flex-1 min-w-0">
          <div className="scroll-y h-full p-2 fade-in" key={sel}>
            <div className="flex items-center gap-3 mb-2">
              <Badge club={club} size={54} />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-extrabold leading-tight">{club.name}</div>
                <div className="text-slate-400 text-xs">{club.stadium} - capacity {club.capacity.toLocaleString()}</div>
                <div className="text-slate-400 text-xs">Manager: {club.manager.name} ({club.manager.style})</div>
              </div>
              <button className="btn btn-primary min-h-[38px] px-5" disabled={busy} onClick={() => { setBusy(true); store.startCareer(sel, world); }}>Begin Career</button>
            </div>
            <div className="grid grid-cols-4 gap-1 panel mb-2">
              <Stat label="Squad strength" value={squadStrength(preview, sel)} sub={`Rank ${repRank(preview, sel)} of 20 - ${preview.leagues[club.leagueId ?? 'L1'].name}`} />
              <Stat label="Transfer budget" value={fmtMoney(club.transferBudget)} />
              <Stat label="Wage budget" value={`${fmtMoney(club.wageBudget)}/wk`} sub={`Bill ${fmtMoney(wageBill(preview, sel))}`} />
              <Stat label="Balance" value={fmtMoney(club.balance)} />
            </div>
            <div className="text-xs text-slate-300 mb-2">Board objective: <span className="text-white font-semibold">{obj.text}</span></div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Key players</div>
            <table className="w-full">
              <tbody>
                {squad.slice(0, 6).map((p) => (
                  <tr key={p.id} className="border-t border-line/50">
                    <td className="td w-8"><PosTag pos={p.pos} /></td>
                    <td className="td">{p.name}</td>
                    <td className="td text-slate-400">{p.age}y - {p.nat}</td>
                    <td className="td text-right"><Ovr v={p.ovr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
