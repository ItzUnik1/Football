import { useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Panel, Stat } from '../common';
import { fmtMoney } from '../../engine/valuation';
import { boardObjective, repRank } from '../../engine/game';
import { squadOf, squadStrength, wageBill } from '../../engine/team';
import { positionOf } from '../../engine/fixtures';

export function ClubScreen() {
  const { g, ui } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const squad = squadOf(g!, me.id);
  const obj = boardObjective(g!, me.id);
  const nats = Object.entries(squad.reduce<Record<string, number>>((m, p) => { m[p.nat] = (m[p.nat] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const [confirm, setConfirm] = useState(false);
  const avgAge = squad.reduce((s, p) => s + p.age, 0) / squad.length;
  return (
    <div className="h-full flex gap-2 fade-in">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Panel>
          <div className="p-3 flex items-center gap-3">
            <Badge club={me} size={64} />
            <div className="flex-1 min-w-0">
              <div className="text-xl font-extrabold leading-tight">{me.name}</div>
              <div className="text-slate-400">{me.city} - {me.stadium} ({me.capacity.toLocaleString()})</div>
              <div className="text-slate-400">Reputation {me.reputation} - ranked {repRank(g!, me.id)} of 20 in its division</div>
            </div>
            <div className="flex gap-1">{me.colors.map((c) => <span key={c} className="w-5 h-5 rounded border border-line" style={{ background: c }} />)}</div>
          </div>
        </Panel>
        <Panel title="Board">
          <div className="p-2 text-xs">
            <div>Objective: <b>{obj.text}</b></div>
            <div className="text-slate-400 mt-1">Current position: {positionOf(g!, me.id)} - Season {g!.meta.season}/{String(g!.meta.season + 1).slice(2)} - {g!.leagues[me.leagueId ?? 'L1'].name}</div>
          </div>
        </Panel>
        <Panel title="Squad profile">
          <div className="grid grid-cols-4">
            <Stat label="Strength" value={squadStrength(g!, me.id)} />
            <Stat label="Players" value={squad.length} />
            <Stat label="Avg age" value={avgAge.toFixed(1)} />
            <Stat label="Wage bill" value={`${fmtMoney(wageBill(g!, me.id))}/wk`} />
          </div>
          <div className="px-2 pb-2 text-[11px] text-slate-400">Nationalities: {nats.map(([n, c]) => `${n} ${c}`).join(' - ')}</div>
        </Panel>
      </div>
      <div className="w-[36%] min-w-[210px] flex flex-col gap-2">
        <Panel title="Manager">
          <div className="p-2 text-xs space-y-0.5">
            <div className="font-bold text-sm">{me.manager.name}</div>
            <div className="text-slate-400">Age {me.manager.age} - {me.manager.nat}</div>
            <div className="text-slate-400">Philosophy: {me.manager.style}</div>
          </div>
        </Panel>
        <Panel title="Facilities & commercial">
          <div className="p-2 text-xs space-y-0.5">
            <div>Ticket price: <b>£{me.ticketPrice}</b></div>
            <div>TV & commercial: <b>{fmtMoney(me.weeklyIncome)}/wk</b></div>
            <div>Balance: <b>{fmtMoney(me.balance)}</b></div>
          </div>
        </Panel>
        <Panel title="Career">
          <div className="p-2 space-y-2">
            <div className="text-[11px] text-slate-400">Progress is saved automatically after every action on this device (IndexedDB).</div>
            <div className="flex gap-2">
              <button className="btn btn-sm" onClick={() => store.quitToMenu()}>Main menu</button>
              <button className="btn btn-sm btn-danger" onClick={() => setConfirm(true)}>Delete career</button>
            </div>
            <div className="text-[10px] text-slate-500">{ui.saving ? 'Saving...' : 'All changes saved'}</div>
          </div>
        </Panel>
      </div>
      {confirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40" onClick={() => setConfirm(false)}>
          <div className="panel p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-1">Delete this career?</div>
            <div className="text-slate-400 text-xs mb-3">This permanently removes your save.</div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => { setConfirm(false); await store.deleteCareer(); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
