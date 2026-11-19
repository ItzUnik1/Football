import { useMemo } from 'react';
import { store, useStore } from '../store';
import { Badge, Bar, CatIcon, FormChips, Ovr, Panel, PosTag, Stat } from '../common';
import { computeTable } from '../../engine/fixtures';
import { nextFixture, ordinal, seasonComplete } from '../../engine/game';
import { fmtMoney } from '../../engine/valuation';
import { squadOf, squadStrength, wageBill } from '../../engine/team';
import { gameDate } from '../../engine/messages';
import { isWindowOpen } from '../../engine/transfers';

export function DashboardScreen() {
  const { g, v } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const table = useMemo(() => computeTable(g!), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = table.findIndex((r) => r.clubId === me.id);
  const row = table[idx];
  const lo = Math.max(0, Math.min(idx - 2, table.length - 5));
  const mini = table.slice(lo, lo + 5);
  const squad = squadOf(g!, me.id);
  const played = g!.fixtures.filter((f) => f.played && (f.home === me.id || f.away === me.id)).sort((a, b) => b.week - a.week);
  const upcoming = g!.fixtures.filter((f) => !f.played && (f.home === me.id || f.away === me.id)).sort((a, b) => a.week - b.week).slice(0, 3);
  const next = nextFixture(g!);
  const unread = g!.messages.filter((m) => !m.read);
  const latest = g!.messages.slice().reverse().slice(0, 4);
  const bill = wageBill(g!, me.id);
  const injured = squad.filter((p) => p.injuredWeeks > 0);
  const banned = squad.filter((p) => p.suspended > 0);
  const top = squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 4);
  const oppOf = (f: typeof upcoming[number]) => g!.clubs[f.home === me.id ? f.away : f.home];

  return (
    <div className="h-full scroll-y fade-in"><div className="min-h-full h-[400px] grid grid-cols-3 grid-rows-2 gap-2">
      <Panel title="Club">
        <div className="p-2 flex flex-col gap-1.5 h-full">
          <div className="flex items-center gap-2">
            <Badge club={me} size={44} />
            <div className="min-w-0"><div className="font-extrabold text-sm leading-tight truncate">{me.name}</div><div className="text-[11px] text-slate-400 truncate">{me.stadium}</div><div className="text-[11px] text-slate-400">Mgr {me.manager.name}</div></div>
          </div>
          <div className="grid grid-cols-3 panel">
            <Stat label="Position" value={row ? ordinal(idx + 1) : '-'} tone={idx < 4 ? 'good' : undefined} />
            <Stat label="Points" value={row?.points ?? 0} sub={`${row?.played ?? 0} played`} />
            <Stat label="GD" value={row ? (row.gd > 0 ? `+${row.gd}` : row.gd) : 0} />
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400">Form <FormChips form={row?.form ?? []} /></div>
        </div>
      </Panel>

      <Panel title="Next match" right={next ? <span className="text-[10px] text-slate-400">MD {next.week}</span> : undefined}>
        {seasonComplete(g!) ? (
          <div className="p-3 text-center">
            <div className="text-lg font-extrabold text-accent">Season complete</div>
            <div className="text-slate-300 mt-1">Champions: {g!.clubs[table[0].clubId].name}</div>
            <div className="text-slate-300">You finished {ordinal(idx + 1)}</div>
            <button className="btn btn-sm mt-2" onClick={() => store.go('league')}>View final table</button>
          </div>
        ) : next ? (
          <div className="p-2 flex flex-col h-full">
            <div className="flex items-center justify-around my-1">
              <div className="text-center"><Badge club={g!.clubs[next.home]} size={40} /><div className="text-[10px] mt-0.5 max-w-[80px] truncate">{g!.clubs[next.home].short}</div></div>
              <div className="text-[11px] text-slate-400 text-center">{next.home === me.id ? 'HOME' : 'AWAY'}<div className="text-lg font-bold text-white">vs</div></div>
              <div className="text-center"><Badge club={g!.clubs[next.away]} size={40} /><div className="text-[10px] mt-0.5 max-w-[80px] truncate">{g!.clubs[next.away].short}</div></div>
            </div>
            <div className="text-center text-[11px] text-slate-400">{gameDate(g!, next.week)}</div>
            <div className="text-center text-[11px] mt-1">{oppOf(next).name} - {ordinal(table.findIndex((r) => r.clubId === oppOf(next).id) + 1)} - Strength {squadStrength(g!, oppOf(next).id)}</div>
            <div className="mt-auto pt-1 text-[10px] text-slate-500">Then: {upcoming.slice(1).map((f) => `${f.home === me.id ? 'vs' : '@'} ${oppOf(f).short}`).join(', ') || '-'}</div>
          </div>
        ) : null}
      </Panel>

      <Panel title="League" right={<button className="text-[10px] text-accent2" onClick={() => store.go('league')}>Full table</button>}>
        <table className="w-full">
          <tbody>
            {mini.map((r) => (
              <tr key={r.clubId} className={`border-t border-line/40 ${r.clubId === me.id ? 'bg-accent/15 font-semibold' : ''}`}>
                <td className="td w-5 text-slate-400">{table.indexOf(r) + 1}</td>
                <td className="td"><span className="inline-flex items-center gap-1"><Badge club={g!.clubs[r.clubId]} size={14} />{g!.clubs[r.clubId].short}</span></td>
                <td className="td text-right">{r.played}</td><td className="td text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td className="td text-right font-bold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Recent results">
        <div className="scroll-y h-full">
          {played.length === 0 ? <div className="p-3 text-center text-slate-500">No matches played yet.</div> : played.slice(0, 5).map((f) => {
            const home = f.home === me.id; const opp = g!.clubs[home ? f.away : f.home];
            const gf = home ? f.hg : f.ag, ga = home ? f.ag : f.hg; const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
            return (
              <button key={f.id} className="w-full flex items-center gap-2 px-2 py-1 border-b border-line/40 text-left active:bg-panel2" onClick={() => g!.reports[f.id] && store.openReport(f.id)}>
                <span className="w-4 h-4 rounded-sm text-[9px] font-bold text-black flex items-center justify-center" style={{ background: r === 'W' ? '#22c55e' : r === 'D' ? '#eab308' : '#ef4444' }}>{r}</span>
                <span className="flex-1 truncate">{home ? 'vs' : '@'} {opp.name}</span><b>{f.hg}-{f.ag}</b>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Squad" right={<button className="text-[10px] text-accent2" onClick={() => store.go('squad')}>Open</button>}>
        <div className="p-2 text-[11px]">
          <div className="grid grid-cols-3 mb-1 panel"><Stat label="XI strength" value={squadStrength(g!, me.id)} /><Stat label="Injured" value={injured.length} tone={injured.length ? 'bad' : undefined} /><Stat label="Suspended" value={banned.length} tone={banned.length ? 'warn' : undefined} /></div>
          {top.map((p) => <div key={p.id} className="flex items-center gap-1.5 py-0.5"><PosTag pos={p.pos} /><span className="flex-1 truncate">{p.name}</span><Ovr v={p.ovr} /></div>)}
        </div>
      </Panel>

      <div className="grid grid-rows-2 gap-2 min-h-0">
        <Panel title="Finances" right={<button className="text-[10px] text-accent2" onClick={() => store.go('finances')}>Open</button>}>
          <div className="p-2 text-[11px]">
            <div className="grid grid-cols-2"><Stat label="Balance" value={fmtMoney(me.balance)} tone={me.balance < 0 ? 'bad' : undefined} /><Stat label="Transfer budget" value={fmtMoney(me.transferBudget)} /></div>
            <div className="flex justify-between text-[10px] text-slate-400 px-2"><span>Wages {fmtMoney(bill)}/wk</span><span>{Math.round((bill / me.wageBudget) * 100)}%</span></div>
            <div className="px-2"><Bar value={bill} max={me.wageBudget} color="#38bdf8" /></div>
            <div className="px-2 mt-1 text-[10px]" style={{ color: isWindowOpen(g!.meta.week) ? '#22c55e' : '#f59e0b' }}>{isWindowOpen(g!.meta.week) ? 'Transfer window open' : 'Window closed'}</div>
          </div>
        </Panel>
        <Panel title="Inbox" right={<button className="text-[10px] text-accent2" onClick={() => store.go('inbox')}>{unread.length} unread</button>}>
          <div className="scroll-y h-full">
            {latest.map((m) => (
              <button key={m.id} className="w-full text-left flex items-center gap-1.5 px-2 py-0.5 border-b border-line/40" onClick={() => store.go('inbox')}>
                <CatIcon cat={m.category} /><span className={`truncate ${m.read ? 'text-slate-400' : 'font-bold'}`}>{m.subject}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div></div>
  );
}
