import { useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Bar, Panel, Stat } from '../common';
import { requestFunds, ordinal } from '../../engine/board';
import { clubRecords } from '../../engine/history';
import { seasonLabel } from '../../engine/calendar';
import { fmtMoney } from '../../engine/valuation';
import { topScorers } from '../../engine/game';

const STATUS: Record<string, { t: string; c: string }> = {
  active: { t: 'Not started', c: '#94a3b8' }, ontrack: { t: 'On track', c: '#22c55e' }, offtrack: { t: 'Off track', c: '#ef4444' }, met: { t: 'Achieved', c: '#22c55e' }, failed: { t: 'Failed', c: '#ef4444' },
};

export function BoardScreen() {
  const { g } = useStore();
  const b = g!.board;
  const me = g!.clubs[g!.meta.userClubId];
  const conf = b.confidence;
  const mood = conf >= 75 ? 'Delighted' : conf >= 55 ? 'Satisfied' : conf >= 35 ? 'Concerned' : conf >= 20 ? 'Worried' : 'Ready to sack you';
  const rec = clubRecords(g!, me.id);
  const lg = g!.leagues[me.leagueId ?? 'L1'];
  return (
    <div className="h-full grid grid-cols-[1.3fr_1fr] gap-2 fade-in">
      <Panel title={`Objectives ${seasonLabel(g!.meta.season)} - ${lg.name}`}>
        <div className="scroll-y h-full">
          {b.objectives.map((o) => { const s = STATUS[o.status]; return (
            <div key={o.id} className="px-3 py-2 border-b border-line/40 flex items-center gap-2">
              <div className="flex-1 min-w-0"><div className="font-semibold">{o.title}{o.weight >= 3 ? ' (primary)' : ''}</div><div className="text-[11px] text-slate-400">{o.desc}</div></div>
              <span className="text-[10px] font-bold rounded px-1.5 py-0.5 text-black" style={{ background: s.c }}>{s.t}</span>
            </div>); })}
          <div className="p-3 text-[11px] text-slate-400">Objectives are scored on 1 July. Missing the primary objective costs board confidence; repeated failure ends in dismissal.</div>
        </div>
      </Panel>
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title="Board confidence">
          <div className="p-3 space-y-2">
            <div className="flex items-baseline justify-between"><span className="text-lg font-extrabold">{Math.round(conf)}%</span><span className="text-slate-300">{mood}</span></div>
            <Bar value={conf} h={8} />
            <div className="text-[11px] text-slate-400">Job security: {conf >= 50 ? 'safe' : conf >= 30 ? 'under pressure' : 'at risk'}. Warnings issued: {b.warned}.</div>
            <button className="btn btn-primary w-full" disabled={b.fundsRequested} onClick={() => store.mutate((gg) => requestFunds(gg)).then((r) => store.toast(r.message, r.ok ? 'ok' : 'bad'))}>{b.fundsRequested ? 'Funds already requested this season' : 'Request transfer funds'}</button>
          </div>
        </Panel>
        <Panel title="Club" className="flex-1">
          <div className="grid grid-cols-2">
            <Stat label="Reputation" value={me.reputation} />
            <Stat label="Net transfer spend" value={fmtMoney(b.netSpend)} tone={b.netSpend > 0 ? 'warn' : 'good'} />
            <Stat label="Titles" value={rec.titles.length} sub={rec.titles.map((t) => seasonLabel(t)).join(', ') || undefined} />
            <Stat label="Youth promoted" value={b.youthPromoted} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function StatsScreen() {
  const { g } = useStore();
  const [lid, setLid] = useState(g!.clubs[g!.meta.userClubId].leagueId ?? 'L1');
  const ids = new Set(g!.leagues[lid].clubIds);
  const ps = Object.values(g!.players).filter((p) => ids.has(p.parentClubId ?? p.clubId ?? ''));
  const top = (f: (p: typeof ps[0]) => number, min = 0) => ps.filter((p) => f(p) > min).sort((a, b) => f(b) - f(a)).slice(0, 8);
  const avg = (p: typeof ps[0]) => (p.stats.apps ? p.stats.ratingSum / p.stats.apps : 0);
  const lists: [string, typeof ps, (p: typeof ps[0]) => string][] = [
    ['Top scorers', topScorers(g!, 8, lid), (p) => String(p.stats.goals)],
    ['Most assists', top((p) => p.stats.assists), (p) => String(p.stats.assists)],
    ['Clean sheets', top((p) => p.stats.cleanSheets), (p) => String(p.stats.cleanSheets)],
    ['Best average rating (5+ apps)', ps.filter((p) => p.stats.apps >= 5).sort((a, b) => avg(b) - avg(a)).slice(0, 8), (p) => avg(p).toFixed(2)],
  ];
  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <div className="flex gap-1 shrink-0">{Object.values(g!.leagues).map((l) => <button key={l.id} className={`btn btn-sm ${lid === l.id ? 'btn-primary' : ''}`} onClick={() => setLid(l.id)}>{l.name}</button>)}</div>
      <div className="flex-1 min-h-0 grid grid-cols-4 gap-2">
        {lists.map(([title, list, val]) => (
          <Panel key={title} title={title}>
            <div className="scroll-y h-full">
              {list.length === 0 && <div className="p-3 text-center text-slate-500">No data yet.</div>}
              {list.map((p, i) => (
                <button key={p.id} className="w-full flex items-center gap-1.5 px-2 py-1 border-b border-line/40 text-left active:bg-panel2" onClick={() => store.openProfile(p.id)}>
                  <span className="w-4 text-slate-500">{i + 1}</span>{p.clubId && <Badge club={g!.clubs[p.parentClubId ?? p.clubId]} size={14} />}<span className="flex-1 truncate">{p.name}</span><b>{val(p)}</b>
                </button>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function HistoryScreen() {
  const { g } = useStore();
  const hist = g!.history;
  const me = g!.clubs[g!.meta.userClubId];
  const rec = clubRecords(g!, me.id);
  const [idx, setIdx] = useState(hist.seasons.length - 1);
  const [lid, setLid] = useState('L1');
  const s = hist.seasons[idx];
  const ls = s?.leagues.find((l) => l.leagueId === lid);
  return (
    <div className="h-full grid grid-cols-[1fr_1.6fr] gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title="Club records">
          <div className="grid grid-cols-2 text-[11px]">
            <Stat label="Titles" value={rec.titles.length} sub={rec.titles.map(seasonLabel).join(', ') || '-'} />
            <Stat label="Best finish" value={rec.bestFinish ? `${ordinal(rec.bestFinish.pos)} (tier ${rec.bestFinish.tier})` : '-'} sub={rec.bestFinish ? seasonLabel(rec.bestFinish.season) : undefined} />
            <Stat label="Biggest win" value={rec.biggestWin?.score ?? '-'} sub={rec.biggestWin ? `v ${rec.biggestWin.opp}` : undefined} />
            <Stat label="Heaviest defeat" value={rec.heaviestDefeat?.score ?? '-'} sub={rec.heaviestDefeat ? `v ${rec.heaviestDefeat.opp}` : undefined} />
            <Stat label="Record signing" value={rec.recordSigning ? fmtMoney(rec.recordSigning.fee) : '-'} sub={rec.recordSigning?.name} />
            <Stat label="Record sale" value={rec.recordSale ? fmtMoney(rec.recordSale.fee) : '-'} sub={rec.recordSale?.name} />
            <Stat label="Most points" value={rec.highestPoints?.points ?? '-'} sub={rec.highestPoints ? seasonLabel(rec.highestPoints.season) : undefined} />
            <Stat label="All-time top scorer" value={rec.topScorerAllTime?.goals ?? '-'} sub={rec.topScorerAllTime?.name} />
          </div>
        </Panel>
        <Panel title="Seasons" className="flex-1">
          <div className="scroll-y h-full">
            {hist.seasons.length === 0 && <div className="p-3 text-center text-slate-500">History builds up after each season ends on 1 July.</div>}
            {hist.seasons.slice().reverse().map((x, i) => { const real = hist.seasons.length - 1 - i; return (
              <button key={x.season} onClick={() => setIdx(real)} className={`w-full text-left px-2 py-1.5 border-b border-line/40 ${real === idx ? 'bg-accent/15' : ''}`}>
                <div className="font-semibold">{seasonLabel(x.season)}: {ordinal(x.userPos)} in {g!.leagues[x.userLeagueId]?.short ?? x.userLeagueId} ({x.userPoints} pts)</div>
                <div className="text-[10px] text-slate-400">{x.objectiveMet ? 'Objective met' : 'Objective missed'} - champions {g!.clubs[x.leagues.find((l) => l.leagueId === 'L1')!.champion]?.name}</div>
              </button>); })}
          </div>
        </Panel>
      </div>
      <Panel title={s ? `${seasonLabel(s.season)} review` : 'Season review'}>
        {!s ? <div className="p-4 text-center text-slate-500">No completed seasons yet.</div> : (
          <div className="h-full flex flex-col">
            <div className="flex gap-1 p-1 shrink-0">{s.leagues.map((l) => <button key={l.leagueId} className={`btn btn-sm ${lid === l.leagueId ? 'btn-primary' : ''}`} onClick={() => setLid(l.leagueId)}>{l.leagueName}</button>)}</div>
            <div className="flex-1 min-h-0 scroll-y px-2 pb-2 text-[11px]">
              {ls && (<>
                <div className="mb-1">Champions: <b>{g!.clubs[ls.champion]?.name}</b>. Promoted: {ls.promoted.map((id) => g!.clubs[id]?.short).join(', ') || '-'}. Relegated: {ls.relegated.map((id) => g!.clubs[id]?.short).join(', ') || '-'}.</div>
                <table className="w-full mb-2"><thead><tr><th className="th">#</th><th className="th">Club</th><th className="th text-right">P</th><th className="th text-right">GD</th><th className="th text-right">Pts</th></tr></thead>
                  <tbody>{ls.table.map((r, i) => <tr key={r.clubId} className={`border-t border-line/40 ${r.clubId === g!.meta.userClubId ? 'bg-accent/15 font-bold' : ''}`}><td className="td">{i + 1}</td><td className="td">{g!.clubs[r.clubId]?.short}</td><td className="td text-right">{r.played}</td><td className="td text-right">{r.gd}</td><td className="td text-right">{r.points}</td></tr>)}</tbody></table>
                <div className="text-slate-400">Top scorers: {ls.topScorers.map((t) => `${t.name} ${t.goals}`).join(', ') || '-'}</div>
              </>)}
              {lid === 'L1' && s.awards.length > 0 && (<div className="mt-2"><div className="text-[10px] uppercase tracking-wider text-slate-400">Awards</div>{s.awards.map((a) => <div key={a.award}><b>{a.award}</b>: {a.name} ({g!.clubs[a.clubId]?.short}) - {a.detail}</div>)}</div>)}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
