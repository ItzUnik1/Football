import { useMemo, useState } from 'react';
import { store, useStore } from '../store';
import { Bar, Badge, Modal, Ovr, Panel, PosTag, statusOf, moraleLabel, Stat } from '../common';
import type { Player, Pos } from '../../engine/types';
import { fmtMoney } from '../../engine/valuation';
import { squadOf } from '../../engine/team';
import { askingPrice, isWindowOpen, setListed } from '../../engine/transfers';
import { BidDialog, RenewDialog, SaleDialog } from '../dialogs';

type SortKey = 'pos' | 'name' | 'age' | 'ovr' | 'pot' | 'fitness' | 'morale' | 'contract' | 'value' | 'apps' | 'goals';
const POS_ORDER: Record<Pos, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

export function SquadScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const [filter, setFilter] = useState<'ALL' | Pos>('ALL');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'pos', dir: 1 });
  const squad = squadOf(g!, me.id);
  const rows = useMemo(() => {
    const list = squad.filter((p) => filter === 'ALL' || p.pos === filter);
    const val = (p: Player): number | string => {
      switch (sort.key) {
        case 'pos': return POS_ORDER[p.pos] * 1000 - p.ovr;
        case 'name': return p.name;
        case 'contract': return p.contractYears;
        case 'apps': return p.stats.apps;
        case 'goals': return p.stats.goals;
        default: return p[sort.key] as number;
      }
    };
    return list.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad.length, filter, sort, store.getVersion()]);
  const inXI = new Set(me.lineup);
  const inBench = new Set(me.bench);
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`th cursor-pointer ${cls}`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'name' || k === 'pos' ? 1 : -1 }))}>{label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
  );
  const injured = squad.filter((p) => p.injuredWeeks > 0).length;
  const avgAge = squad.reduce((s, p) => s + p.age, 0) / squad.length;
  const bill = squad.reduce((s, p) => s + p.wage, 0);

  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex gap-1">
          {(['ALL', 'GK', 'DF', 'MF', 'FW'] as const).map((f) => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <div className="flex-1 flex gap-4 text-[11px] text-slate-400 justify-end">
          <span>Players <b className="text-white">{squad.length}</b></span>
          <span>Avg age <b className="text-white">{avgAge.toFixed(1)}</b></span>
          <span>Injured <b className={injured ? 'text-bad' : 'text-white'}>{injured}</b></span>
          <span>Wage bill <b className="text-white">{fmtMoney(bill)}/wk</b></span>
        </div>
      </div>
      <Panel className="flex-1">
        <div className="scroll-y h-full">
          <table className="w-full">
            <thead>
              <tr>
                {th('pos', 'Pos')}{th('name', 'Name')}{th('age', 'Age')}{th('ovr', 'Ovr')}{th('pot', 'Pot')}{th('fitness', 'Fit')}{th('morale', 'Mor')}
                <th className="th">Status</th>{th('contract', 'Contract')}{th('value', 'Value')}{th('apps', 'Apps')}{th('goals', 'Gls')}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = statusOf(p);
                return (
                  <tr key={p.id} className="border-t border-line/40 active:bg-panel2" onClick={() => store.openProfile(p.id)}>
                    <td className="td"><PosTag pos={p.pos} /></td>
                    <td className="td font-semibold">{p.name}{me.captainId === p.id && <span className="ml-1 text-[9px] bg-warn text-black rounded px-1">C</span>}</td>
                    <td className="td">{p.age}</td>
                    <td className="td"><Ovr v={p.ovr} /></td>
                    <td className="td text-slate-400">{p.pot}</td>
                    <td className="td w-16"><Bar value={p.fitness} /></td>
                    <td className="td w-16"><Bar value={p.morale} /></td>
                    <td className="td">
                      {st ? <span style={{ color: st.color }} className="font-semibold">{st.text}</span> : inXI.has(p.id) ? <span className="text-accent font-semibold">XI</span> : inBench.has(p.id) ? <span className="text-accent2 font-semibold">SUB</span> : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="td">{p.contractYears}y</td>
                    <td className="td">{fmtMoney(p.value)}</td>
                    <td className="td">{p.stats.apps}</td>
                    <td className="td">{p.stats.goals}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function AttrRow({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-16 text-slate-400">{label}</span>
      <div className="flex-1"><Bar value={v} /></div>
      <span className="w-5 text-right font-semibold">{v}</span>
    </div>
  );
}

export function PlayerProfile({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { g } = useStore();
  const p = g!.players[playerId];
  const [dlg, setDlg] = useState<'bid' | 'sell' | 'renew' | null>(null);
  if (!p) return null;
  const me = g!.clubs[g!.meta.userClubId];
  const mine = p.clubId === me.id;
  const club = p.clubId ? g!.clubs[p.clubId] : null;
  const st = statusOf(p);
  const avg = p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(2) : '-';
  const window = isWindowOpen(g!.meta.week);
  const attr = p.pos === 'GK'
    ? { tech: [['Handling', p.tech.handling], ['Passing', p.tech.passing]], phys: [['Jumping', p.phys.jumping], ['Strength', p.phys.strength], ['Pace', p.phys.pace], ['Stamina', p.phys.stamina]], mental: [['Positioning', p.mental.positioning], ['Composure', p.mental.composure], ['Vision', p.mental.vision]] }
    : { tech: [['Passing', p.tech.passing], ['Dribbling', p.tech.dribbling], ['Shooting', p.tech.shooting], ['Finishing', p.tech.finishing], ['Tackling', p.tech.tackling]], phys: [['Pace', p.phys.pace], ['Stamina', p.phys.stamina], ['Strength', p.phys.strength], ['Jumping', p.phys.jumping]], mental: [['Vision', p.mental.vision], ['Composure', p.mental.composure], ['Positioning', p.mental.positioning], ['Work rate', p.mental.workrate]] };

  return (
    <>
      <Modal wide onClose={onClose} title={
        <div className="flex items-center gap-2">{club && <Badge club={club} size={22} />}<span>{p.name}</span>{st && <span className="text-[10px] rounded px-1.5 py-0.5 text-black" style={{ background: st.color }}>{st.text}</span>}</div>}
        footer={mine ? (
          <>
            {!p.parentClubId && <button className="btn btn-sm" onClick={() => setDlg('renew')}>Renew contract</button>}
            {me.lineup.includes(p.id) && me.captainId !== p.id && <button className="btn btn-sm" onClick={() => store.mutate(() => { me.captainId = p.id; }).then(() => store.toast(`${p.name} is the new captain`))}>Make captain</button>}
            {!p.parentClubId && <button className={`btn btn-sm ${p.listed ? 'btn-primary' : ''}`} onClick={() => store.mutate((gg) => setListed(gg, p.id, !p.listed))}>{p.listed ? 'Transfer listed' : 'Transfer list'}</button>}
            {!p.parentClubId && <button className={`btn btn-sm ${p.loanListed ? 'btn-primary' : ''}`} onClick={() => store.mutate((gg) => setListed(gg, p.id, !p.loanListed, true))}>{p.loanListed ? 'Loan listed' : 'Loan list'}</button>}
            {!p.parentClubId && <button className="btn btn-danger btn-sm" onClick={() => setDlg('sell')}>Sell / loan out</button>}
          </>
        ) : p.parentClubId ? undefined : (
          <button className="btn btn-primary" onClick={() => setDlg('bid')}>{p.clubId ? 'Make offer' : 'Sign free agent'}</button>
        )}>
        <div className="grid grid-cols-[150px_1fr_1fr] gap-3">
          <div>
            <div className="panel p-2 text-center mb-2">
              <div className="flex justify-center gap-1 mb-1"><PosTag pos={p.pos} /></div>
              <div className="text-3xl font-extrabold leading-none"><Ovr v={p.ovr} /></div>
              <div className="text-[10px] text-slate-400 mt-1">Potential {p.pot}</div>
              <div className="text-[11px] mt-1">{p.age} years - {p.nat}</div>
              {club && <div className="text-[11px] text-slate-400">{club.name}{p.parentClubId ? ` (loan from ${g!.clubs[p.parentClubId].name})` : ''}</div>}
              {!club && <div className="text-[11px] text-warn">Free agent</div>}
            </div>
            <div className="space-y-1">
              <div><div className="flex justify-between text-[10px] text-slate-400"><span>Fitness</span><span>{Math.round(p.fitness)}%</span></div><Bar value={p.fitness} /></div>
              <div><div className="flex justify-between text-[10px] text-slate-400"><span>Morale</span><span>{moraleLabel(p.morale)}</span></div><Bar value={p.morale} /></div>
            </div>
          </div>
          <div className="space-y-2">
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Technical</div>{attr.tech.map(([l, v]) => <AttrRow key={l as string} label={l as string} v={v as number} />)}</div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Physical</div>{attr.phys.map(([l, v]) => <AttrRow key={l as string} label={l as string} v={v as number} />)}</div>
          </div>
          <div className="space-y-2">
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Mental</div>{attr.mental.map(([l, v]) => <AttrRow key={l as string} label={l as string} v={v as number} />)}</div>
            <div className="panel grid grid-cols-2">
              <Stat label="Value" value={fmtMoney(p.value)} />
              <Stat label="Wage" value={`${fmtMoney(p.wage)}/wk`} />
              <Stat label="Contract" value={p.clubId ? `${p.contractYears} yr` : 'None'} />
              <Stat label={mine ? 'Ask price' : 'Asking'} value={p.clubId ? fmtMoney(askingPrice(g!, p)) : 'Free'} />
            </div>
            <div className="panel grid grid-cols-4 text-center">
              <Stat label="Apps" value={p.stats.apps} /><Stat label="Goals" value={p.stats.goals} /><Stat label="Assists" value={p.stats.assists} /><Stat label="Avg" value={avg} />
            </div>
            {p.injuredWeeks > 0 && <div className="text-bad text-xs">{p.injury} - out for {p.injuredWeeks} match(es)</div>}
            {!mine && !window && p.clubId && <div className="text-[11px] text-warn">Transfer window closed.</div>}
          </div>
        </div>
      </Modal>
      {dlg === 'bid' && <BidDialog player={p} onClose={() => setDlg(null)} />}
      {dlg === 'sell' && <SaleDialog player={p} onClose={() => setDlg(null)} />}
      {dlg === 'renew' && <RenewDialog player={p} onClose={() => setDlg(null)} />}
    </>
  );
}
