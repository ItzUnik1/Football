import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, FormChips, Panel } from '../common';
import { computeTable } from '../../engine/fixtures';
import type { Player } from '../../engine/types';

export function LeagueScreen() {
  const { g, v } = useStore();
  const me = g!.meta.userClubId;
  const [lid, setLid] = useState(g!.clubs[g!.meta.userClubId].leagueId ?? 'L1');
  const lg = g!.leagues[lid];
  const table = useMemo(() => computeTable(g!, lid), [v, lid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<'goals' | 'assists' | 'rating'>('goals');
  const ids = new Set(lg.clubIds);
  const players = Object.values(g!.players).filter((p) => p.clubId && ids.has(p.parentClubId ?? p.clubId));
  const leaders: Player[] = (tab === 'goals'
    ? players.filter((p) => p.stats.goals > 0).sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists)
    : tab === 'assists'
      ? players.filter((p) => p.stats.assists > 0).sort((a, b) => b.stats.assists - a.stats.assists || b.stats.goals - a.stats.goals)
      : players.filter((p) => p.stats.apps >= 5).sort((a, b) => b.stats.ratingSum / b.stats.apps - a.stats.ratingSum / a.stats.apps)).slice(0, 12);
  const done = table.every((r) => r.played >= 38);
  return (
    <div className="h-full flex gap-2 fade-in">
      <Panel className="flex-1 min-w-0" title={`${lg.name}${done ? ' - final' : ''}`} right={<div className="flex gap-1">{Object.values(g!.leagues).map((l) => <button key={l.id} className={`btn btn-sm ${lid === l.id ? 'btn-primary' : ''}`} onClick={() => setLid(l.id)}>{l.short}</button>)}</div>}>
        <div className="scroll-y h-full">
          <table className="w-full">
            <thead><tr><th className="th">#</th><th className="th">Club</th>{['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map((h) => <th key={h} className="th text-right">{h}</th>)}<th className="th">Form</th></tr></thead>
            <tbody>
              {table.map((r, i) => {
                const c = g!.clubs[r.clubId];
                return (
                  <tr key={r.clubId} className={`border-t border-line/40 ${r.clubId === me ? 'bg-accent/15 font-semibold' : ''}`}>
                    <td className="td w-6" style={{ borderLeft: `3px solid ${(lg.tier === 1 ? i < 4 : i < lg.promote) ? 'rgb(var(--accent))' : lg.relegate && i >= table.length - lg.relegate ? 'rgb(var(--bad))' : 'transparent'}` }}>{i + 1}</td>
                    <td className="td"><span className="inline-flex items-center gap-1.5"><Badge club={c} size={18} />{c.name}</span></td>
                    <td className="td text-right">{r.played}</td><td className="td text-right">{r.won}</td><td className="td text-right">{r.drawn}</td><td className="td text-right">{r.lost}</td>
                    <td className="td text-right">{r.gf}</td><td className="td text-right">{r.ga}</td><td className="td text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                    <td className="td text-right font-bold">{r.points}</td>
                    <td className="td"><FormChips form={r.form} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel className="w-[30%] min-w-[190px]" title="Leaders" right={<div className="flex gap-1">{(['goals', 'assists', 'rating'] as const).map((t) => <button key={t} className={`btn btn-sm capitalize ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t === 'rating' ? 'Avg' : t}</button>)}</div>}>
        <div className="scroll-y h-full">
          {leaders.length === 0 ? <div className="p-3 text-slate-500 text-center">No data yet.</div> : leaders.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1 border-b border-line/40">
              <span className="w-4 text-slate-500">{i + 1}</span>
              {p.clubId && <Badge club={g!.clubs[p.clubId]} size={16} />}
              <div className="flex-1 min-w-0"><div className="truncate font-semibold">{p.name}</div><div className="text-[10px] text-slate-400">{p.clubId ? g!.clubs[p.clubId].short : ''} - {p.stats.apps} apps</div></div>
              <b>{tab === 'goals' ? p.stats.goals : tab === 'assists' ? p.stats.assists : (p.stats.ratingSum / p.stats.apps).toFixed(2)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
