import { useMemo, useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Ovr, Panel, PosTag, Stat } from '../common';
import { fmtMoney } from '../../engine/valuation';
import { boardObjective, repRank } from '../../engine/game';
import { createWorld } from '../../engine/generator';
import { squadOf, squadStrength, wageBill } from '../../engine/team';
import type { Game } from '../../engine/types';

export function StartScreen() {
  const { ui } = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-[#0b0f17] via-[#0f1a2b] to-[#0b0f17]">
      <div className="text-center fade-in">
        <div className="text-5xl font-extrabold tracking-tight text-white">Touch<span className="text-accent">line</span></div>
        <div className="text-slate-400 mt-1 mb-5 text-xs">Football management simulation</div>
        <div className="flex flex-col gap-2 items-stretch w-56 mx-auto">
          {ui.hasSave && <button className="btn btn-primary min-h-[38px] text-sm" onClick={() => store.continueCareer()}>Continue Career</button>}
          <button className="btn min-h-[38px] text-sm" onClick={() => (ui.hasSave ? setConfirm(true) : store.setUi({ phase: 'select' }))}>New Career</button>
        </div>
        <div className="text-[10px] text-slate-500 mt-4">Offline-first - saves on this device</div>
      </div>
      {confirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40" onClick={() => setConfirm(false)}>
          <div className="panel p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-1">Replace saved career?</div>
            <div className="text-slate-400 text-xs mb-3">Starting a new career will permanently overwrite your current save.</div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { setConfirm(false); store.setUi({ phase: 'select' }); }}>Start new</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClubSelect() {
  // The world shown here is the exact world the career will use.
  const world = useMemo(() => createWorld(), []);
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
        <button className="btn btn-sm" onClick={() => store.setUi({ phase: 'start' })}>Back</button>
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
