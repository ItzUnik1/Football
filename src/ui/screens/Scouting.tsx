import { useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Ovr, Panel, PosTag } from '../common';
import type { Pos } from '../../engine/types';
import { assignScout, cancelAssignment, hireScout, scoutBusy, toggleShortlist, type AssignSpec } from '../../engine/scouting';
import { fmtMoney } from '../../engine/valuation';
import { fmtDate } from '../../engine/calendar';

type Tab = 'scouts' | 'reports' | 'shortlist';
const sel = 'bg-black/40 border border-line rounded px-1.5 py-1 text-[11px]';
const Stars = ({ n }: { n: number }) => <span className="text-warn">{'★'.repeat(n)}<span className="text-slate-600">{'★'.repeat(5 - n)}</span></span>;

export function ScoutingScreen() {
  const { g } = useStore();
  const sc = g!.scouting;
  const [tab, setTab] = useState<Tab>('scouts');
  const [scoutId, setScoutId] = useState(sc.scouts.find((s) => s.hired)?.id ?? '');
  const [kind, setKind] = useState<AssignSpec['kind']>('position');
  const [pos, setPos] = useState<Pos>('MF');
  const [leagueId, setLeagueId] = useState('L1');
  const [clubId, setClubId] = useState(Object.keys(g!.clubs)[0]);
  const [ageMax, setAgeMax] = useState(21);
  const hired = sc.scouts.filter((s) => s.hired);
  const avail = sc.scouts.filter((s) => !s.hired);
  const toast = (e: string | null, ok = 'Assignment started') => store.toast(e ?? ok, e ? 'bad' : 'ok');
  const assign = () => store.mutate((gg) => assignScout(gg, scoutId, { kind, pos: kind === 'position' ? pos : undefined, leagueId: kind === 'league' ? leagueId : undefined, clubId: kind === 'club' ? clubId : undefined, ageMax: kind === 'youth' ? ageMax : undefined })).then((e) => toast(e));
  const clubs = Object.values(g!.clubs).filter((c) => c.id !== g!.meta.userClubId).sort((a, b) => a.name.localeCompare(b.name));
  const PlayerRow = ({ pid, extra }: { pid: string; extra?: React.ReactNode }) => {
    const p = g!.players[pid];
    if (!p) return null;
    const r = sc.reports.find((x) => x.playerId === pid);
    return (
      <tr className="border-t border-line/40 active:bg-panel2" onClick={() => store.openProfile(pid)}>
        <td className="td"><PosTag pos={p.pos} /></td><td className="td font-semibold">{p.name}</td><td className="td">{p.age}</td>
        <td className="td">{r ? `${r.estOvr[0]}-${r.estOvr[1]}` : <Ovr v={p.ovr} />}</td><td className="td">{r ? `${r.estPot[0]}-${r.estPot[1]}` : '?'}</td>
        <td className="td">{r ? <Stars n={r.stars} /> : '-'}</td>
        <td className="td">{p.clubId ? <span className="inline-flex items-center gap-1"><Badge club={g!.clubs[p.clubId]} size={14} />{g!.clubs[p.clubId].short}</span> : <span className="text-warn">Free</span>}</td>
        <td className="td text-right">{r ? `${fmtMoney(r.estValue[0])}-${fmtMoney(r.estValue[1])}` : fmtMoney(p.value)}</td>
        <td className="td" onClick={(e) => e.stopPropagation()}>{extra}</td>
      </tr>
    );
  };
  const head = <thead><tr><th className="th">Pos</th><th className="th">Name</th><th className="th">Age</th><th className="th">Ovr</th><th className="th">Pot</th><th className="th">Rec.</th><th className="th">Club</th><th className="th text-right">Value</th><th className="th"></th></tr></thead>;
  const star = (pid: string) => <button className={`btn btn-sm ${sc.shortlist.includes(pid) ? 'btn-primary' : ''}`} onClick={() => store.mutate((gg) => toggleShortlist(gg, pid))}>{sc.shortlist.includes(pid) ? '★' : '☆'}</button>;

  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <div className="flex gap-1 shrink-0">
        {([['scouts', 'Scouts and assignments'], ['reports', `Reports (${sc.reports.length})`], ['shortlist', `Shortlist (${sc.shortlist.length})`]] as [Tab, string][]).map(([k, l]) => <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'scouts' && (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">
          <Panel title="Your scouts">
            <div className="scroll-y h-full">
              {hired.map((s) => {
                const a = sc.assignments.find((x) => x.scoutId === s.id && !x.done);
                return (
                  <div key={s.id} className={`px-2 py-1.5 border-b border-line/40 ${scoutId === s.id ? 'bg-accent/10' : ''}`} onClick={() => setScoutId(s.id)}>
                    <div className="flex items-center gap-2"><b className="flex-1 truncate">{s.name}</b><span className="text-[10px] text-slate-400">Ability {s.ability} - Judgement {s.judgement} - {fmtMoney(s.wage)}/wk</span></div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">{a ? <>Scouting ({a.kind}) - report due {fmtDate(a.endDate)}<button className="btn btn-sm ml-auto" onClick={() => store.mutate((gg) => cancelAssignment(gg, a.id))}>Cancel</button></> : <>Available<button className="btn btn-sm btn-danger ml-auto" onClick={() => store.mutate((gg) => hireScout(gg, s.id, false)).then((e) => toast(e, 'Scout released'))}>Release</button></>}</div>
                  </div>
                );
              })}
              {avail.length > 0 && <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400 bg-black/20">Available to hire</div>}
              {avail.map((s) => (
                <div key={s.id} className="px-2 py-1.5 border-b border-line/40 flex items-center gap-2">
                  <div className="flex-1 min-w-0"><div className="truncate font-semibold">{s.name}</div><div className="text-[10px] text-slate-400">Ability {s.ability} - Judgement {s.judgement} - {s.nat} - {fmtMoney(s.wage)}/wk</div></div>
                  <button className="btn btn-sm btn-primary" onClick={() => store.mutate((gg) => hireScout(gg, s.id, true)).then((e) => toast(e, 'Scout hired'))}>Hire</button>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="New assignment">
            <div className="p-2 space-y-2">
              <label className="block text-[11px]"><span className="text-slate-400">Scout</span>
                <select className={`${sel} w-full`} value={scoutId} onChange={(e) => setScoutId(e.target.value)}>{hired.map((s) => <option key={s.id} value={s.id}>{s.name}{scoutBusy(g!, s.id) ? ' (busy)' : ''}</option>)}</select></label>
              <label className="block text-[11px]"><span className="text-slate-400">Look for</span>
                <select className={`${sel} w-full`} value={kind} onChange={(e) => setKind(e.target.value as AssignSpec['kind'])}>
                  <option value="position">Players by position</option><option value="youth">Young talents</option><option value="league">A whole league</option><option value="club">A specific club</option><option value="free">Free agents and unattached youth</option></select></label>
              {kind === 'position' && <select className={`${sel} w-full`} value={pos} onChange={(e) => setPos(e.target.value as Pos)}>{['GK', 'DF', 'MF', 'FW'].map((p) => <option key={p}>{p}</option>)}</select>}
              {kind === 'league' && <select className={`${sel} w-full`} value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>{Object.values(g!.leagues).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
              {kind === 'club' && <select className={`${sel} w-full`} value={clubId} onChange={(e) => setClubId(e.target.value)}>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              {kind === 'youth' && <label className="text-[11px] text-slate-400 flex items-center gap-2">Maximum age <input type="number" className={`${sel} w-14`} min={16} max={23} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value) || 21)} /></label>}
              <button className="btn btn-primary w-full" disabled={!scoutId || scoutBusy(g!, scoutId)} onClick={assign}>Send scout</button>
              <div className="text-[10px] text-slate-500">Reports arrive in your inbox after 1-3 weeks. Better scouts give more accurate estimates and find better players. Unscouted players show only their current overall.</div>
            </div>
          </Panel>
        </div>
      )}
      {tab === 'reports' && (
        <Panel className="flex-1"><div className="scroll-y h-full"><table className="w-full">{head}<tbody>{sc.reports.slice(0, 60).map((r) => <PlayerRow key={r.id} pid={r.playerId} extra={star(r.playerId)} />)}</tbody></table>
          {sc.reports.length === 0 && <div className="p-4 text-center text-slate-500">No reports yet. Send a scout out.</div>}</div></Panel>
      )}
      {tab === 'shortlist' && (
        <Panel className="flex-1"><div className="scroll-y h-full"><table className="w-full">{head}<tbody>{sc.shortlist.map((pid) => <PlayerRow key={pid} pid={pid} extra={star(pid)} />)}</tbody></table>
          {sc.shortlist.length === 0 && <div className="p-4 text-center text-slate-500">Star players from reports or the transfer market to follow them here.</div>}</div></Panel>
      )}
    </div>
  );
}
