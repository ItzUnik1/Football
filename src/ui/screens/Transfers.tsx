import { useMemo, useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Ovr, Panel, PosTag, statusOf } from '../common';
import type { Pos } from '../../engine/types';
import { fmtMoney } from '../../engine/valuation';
import { askingPrice, isWindowOpen, windowLabel } from '../../engine/transfers';
import { squadOf } from '../../engine/team';
import { scoutedView } from '../../engine/scouting';
import { fmtDateShort } from '../../engine/calendar';

type Tab = 'search' | 'free' | 'mine' | 'history';
type SortKey = 'ovr' | 'value' | 'age' | 'pot' | 'wage';

export function TransfersScreen() {
  const { g, v } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<'ALL' | Pos>('ALL');
  const [minAge, setMinAge] = useState(16);
  const [maxAge, setMaxAge] = useState(40);
  const [clubF, setClubF] = useState('ALL');
  const [maxFee, setMaxFee] = useState(0);
  const [sort, setSort] = useState<SortKey>('ovr');
  const open = isWindowOpen(g!.meta.date!);

  const results = useMemo(() => {
    const free = tab === 'free';
    let list = Object.values(g!.players).filter((p) => (free ? !p.clubId : !!p.clubId && p.clubId !== me.id));
    if (!free) list = list.filter((p) => !p.parentClubId);
    if (q.trim()) list = list.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (pos !== 'ALL') list = list.filter((p) => p.pos === pos);
    list = list.filter((p) => p.age >= minAge && p.age <= maxAge);
    if (clubF !== 'ALL' && !free) list = list.filter((p) => p.clubId === clubF);
    if (maxFee > 0) list = list.filter((p) => askingPrice(g!, p) <= maxFee);
    list.sort((a, b) => (b[sort] as number) - (a[sort] as number));
    return list.slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, pos, minAge, maxAge, clubF, maxFee, sort, v]);

  const mySquad = squadOf(g!, me.id).sort((a, b) => b.ovr - a.ovr);
  const moves = g!.tx.filter((t) => ['transfer_in', 'transfer_out', 'loan_in', 'loan_out', 'contract'].includes(t.type)).slice().reverse();
  const pending = g!.messages.filter((m) => !m.resolved && (m.action?.kind === 'transfer_offer' || m.action?.kind === 'loan_offer'));
  const clubs = Object.values(g!.clubs).filter((c) => c.id !== me.id).sort((a, b) => a.name.localeCompare(b.name));
  const sel = 'bg-black/40 border border-line rounded px-1.5 py-1 text-[11px]';

  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <div className={`shrink-0 flex items-center gap-3 px-2 py-1 rounded border text-[11px] ${open ? 'border-accent/50 bg-accent/10 text-accent' : 'border-warn/50 bg-warn/10 text-warn'}`}>
        <b>{open ? 'WINDOW OPEN' : 'WINDOW CLOSED'}</b><span className="flex-1">{windowLabel(g!.meta.date!)}</span>
        <span className="text-slate-300">Budget <b>{fmtMoney(me.transferBudget)}</b></span>
        <button className="underline text-slate-300" onClick={() => store.go('finances')}>Finances</button>
      </div>
      <div className="flex gap-1 shrink-0">
        {([['search', 'Player search'], ['free', 'Free agents'], ['mine', 'My players'], ['history', 'Offers & history']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : ''}`} onClick={() => setTab(k)}>{l}{k === 'history' && pending.length ? ` (${pending.length})` : ''}</button>
        ))}
      </div>

      {(tab === 'search' || tab === 'free') && (
        <>
          <div className="flex flex-wrap gap-1.5 items-center shrink-0">
            <input className={`${sel} w-28`} placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={sel} value={pos} onChange={(e) => setPos(e.target.value as 'ALL' | Pos)}>{['ALL', 'GK', 'DF', 'MF', 'FW'].map((p) => <option key={p}>{p}</option>)}</select>
            <label className="text-[11px] text-slate-400 flex items-center gap-1">Age
              <input type="number" className={`${sel} w-12`} value={minAge} min={16} max={40} onChange={(e) => setMinAge(Number(e.target.value) || 16)} />-
              <input type="number" className={`${sel} w-12`} value={maxAge} min={16} max={40} onChange={(e) => setMaxAge(Number(e.target.value) || 40)} /></label>
            {tab === 'search' && (
              <>
                <select className={`${sel} max-w-[120px]`} value={clubF} onChange={(e) => setClubF(e.target.value)}><option value="ALL">All clubs</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select className={sel} value={maxFee} onChange={(e) => setMaxFee(Number(e.target.value))}>
                  <option value={0}>Any fee</option>
                  {[1e6, 3e6, 5e6, 10e6, 20e6, 40e6].map((n) => <option key={n} value={n}>{'<'} {fmtMoney(n)}</option>)}
                </select>
              </>
            )}
            <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="ovr">Sort: Overall</option><option value="pot">Sort: Potential</option><option value="value">Sort: Value</option><option value="age">Sort: Age</option><option value="wage">Sort: Wage</option>
            </select>
            <span className="text-[10px] text-slate-500 ml-auto">{results.length} shown</span>
          </div>
          <Panel className="flex-1">
            <div className="scroll-y h-full">
              <table className="w-full">
                <thead><tr><th className="th">Pos</th><th className="th">Name</th><th className="th">Age</th><th className="th">Ovr</th><th className="th">Pot</th><th className="th">Club</th><th className="th text-right">Value</th><th className="th text-right">Asking</th><th className="th text-right">Wage</th></tr></thead>
                <tbody>
                  {results.map((p) => (
                    <tr key={p.id} className="border-t border-line/40 active:bg-panel2" onClick={() => store.openProfile(p.id)}>
                      <td className="td"><PosTag pos={p.pos} /></td>
                      <td className="td font-semibold">{p.name}</td>
                      <td className="td">{p.age}</td>
                      <td className="td"><Ovr v={p.ovr} /></td>
                      <td className="td text-slate-400">{scoutedView(g!, p).pot}</td>
                      <td className="td">{p.clubId ? <span className="inline-flex items-center gap-1"><Badge club={g!.clubs[p.clubId]} size={14} />{g!.clubs[p.clubId].short}</span> : <span className="text-warn">Free</span>}</td>
                      <td className="td text-right">{fmtMoney(p.value)}</td>
                      <td className="td text-right">{p.clubId ? fmtMoney(askingPrice(g!, p)) : 'Free'}</td>
                      <td className="td text-right">{fmtMoney(p.wage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length === 0 && <div className="p-4 text-center text-slate-500">No players match these filters.</div>}
            </div>
          </Panel>
        </>
      )}

      {tab === 'mine' && (
        <Panel className="flex-1" title="Open a player to sell, loan out or list him">
          <div className="scroll-y h-full">
            <table className="w-full">
              <thead><tr><th className="th">Pos</th><th className="th">Name</th><th className="th">Age</th><th className="th">Ovr</th><th className="th">Status</th><th className="th text-right">Value</th><th className="th text-right">Wage</th><th className="th">Contract</th></tr></thead>
              <tbody>
                {mySquad.map((p) => {
                  const st = statusOf(p);
                  return (
                    <tr key={p.id} className="border-t border-line/40 active:bg-panel2" onClick={() => store.openProfile(p.id)}>
                      <td className="td"><PosTag pos={p.pos} /></td><td className="td font-semibold">{p.name}</td><td className="td">{p.age}</td><td className="td"><Ovr v={p.ovr} /></td>
                      <td className="td">{st ? <span style={{ color: st.color }}>{st.text}</span> : p.listed ? <span className="text-accent2">Listed</span> : p.loanListed ? <span className="text-accent2">Loan listed</span> : ''}</td>
                      <td className="td text-right">{fmtMoney(p.value)}</td><td className="td text-right">{fmtMoney(p.wage)}</td><td className="td">{p.contractEnd ? new Date(p.contractEnd).getUTCFullYear() : p.contractYears + 'y'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === 'history' && (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">
          <Panel title="Pending offers">
            <div className="scroll-y h-full">
              {pending.length === 0 ? <div className="p-3 text-slate-500 text-center">No pending offers. List players for transfer to attract bids.</div> : pending.map((m) => (
                <button key={m.id} className="w-full text-left px-2 py-1.5 border-b border-line/40 active:bg-panel2" onClick={() => store.go('inbox')}>
                  <div className="font-semibold">{m.subject}</div><div className="text-[10px] text-slate-400 truncate">{m.from} - open in Inbox</div>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Transfer history">
            <div className="scroll-y h-full">
              {moves.length === 0 ? <div className="p-3 text-slate-500 text-center">No transfers yet.</div> : moves.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1 border-b border-line/40">
                  <span className="text-[10px] text-slate-500 w-12">{t.date ? fmtDateShort(t.date) : `MD${t.week}`}</span>
                  <span className="flex-1 truncate">{t.desc}</span>
                  <b className={t.amount > 0 ? 'text-accent' : t.amount < 0 ? 'text-bad' : 'text-slate-400'}>{t.amount === 0 ? '-' : fmtMoney(t.amount)}</b>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
