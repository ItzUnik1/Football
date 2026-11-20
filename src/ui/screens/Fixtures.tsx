import { useState } from 'react';
import { store, useStore } from '../store';
import { Badge, FormChips, Modal, Panel } from '../common';
import type { MatchEvent, MatchReport, PlayerMatch, TeamStats } from '../../engine/types';
import { TOTAL_WEEKS } from '../../engine/fixtures';
import { fmtDate, fmtDateShort } from '../../engine/calendar';
import { nextFixture, userRound } from '../../engine/game';

export function FixturesScreen() {
  const { g } = useStore();
  const me = g!.meta.userClubId;
  const [tab, setTab] = useState<'mine' | 'week'>('mine');
  const [week, setWeek] = useState(Math.min(Math.max(1, userRound(g!) - 1), TOTAL_WEEKS));
  const myLeague = g!.clubs[me].leagueId ?? 'L1';
  const [lid, setLid] = useState(myLeague);
  const nextFx = nextFixture(g!);
  const mine = g!.fixtures.filter((f) => f.home === me || f.away === me).sort((a, b) => a.week - b.week);
  const weekFx = g!.fixtures.filter((f) => f.week === week && (f.leagueId ?? 'L1') === lid);

  const row = (f: (typeof mine)[number]) => {
    const home = f.home === me;
    const opp = g!.clubs[home ? f.away : f.home];
    const gf = home ? f.hg : f.ag, ga = home ? f.ag : f.hg;
    const res = !f.played ? null : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    const has = !!g!.reports[f.id];
    return (
      <tr key={f.id} className={`border-t border-line/40 ${nextFx?.id === f.id ? 'bg-accent/10' : ''} ${has ? 'active:bg-panel2' : ''}`} onClick={() => has && store.openReport(f.id)}>
        <td className="td text-slate-400">R{f.week}</td>
        <td className="td text-slate-400">{f.date ? fmtDate(f.date) : ''}</td>
        <td className="td w-6 text-center text-slate-400">{home ? 'H' : 'A'}</td>
        <td className="td"><span className="inline-flex items-center gap-1.5"><Badge club={opp} size={18} />{opp.name}</span></td>
        <td className="td text-center font-bold">
          {f.played ? (<span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm text-[9px] text-black flex items-center justify-center" style={{ background: res === 'W' ? '#22c55e' : res === 'D' ? '#eab308' : '#ef4444' }}>{res}</span>{f.hg}-{f.ag}</span>) : <span className="text-slate-500">vs</span>}
        </td>
        <td className="td text-right text-[10px] text-accent2">{has ? 'Report >' : nextFx?.id === f.id ? 'Next match' : ''}</td>
      </tr>
    );
  };

  return (
    <div className="h-full flex flex-col gap-2 fade-in">
      <div className="flex gap-1 items-center shrink-0">
        <button className={`btn btn-sm ${tab === 'mine' ? 'btn-primary' : ''}`} onClick={() => setTab('mine')}>My fixtures</button>
        <button className={`btn btn-sm ${tab === 'week' ? 'btn-primary' : ''}`} onClick={() => setTab('week')}>League results</button>
        {tab === 'week' && (
          <div className="flex items-center gap-1 ml-2">
            <button className="btn btn-sm" disabled={week <= 1} onClick={() => setWeek(week - 1)}>&lt;</button>
            <span className="font-semibold w-20 text-center">Round {week}</span>
            {Object.values(g!.leagues).map((l) => <button key={l.id} className={`btn btn-sm ${lid === l.id ? 'btn-primary' : ''}`} onClick={() => setLid(l.id)}>{l.short}</button>)}
            <button className="btn btn-sm" disabled={week >= TOTAL_WEEKS} onClick={() => setWeek(week + 1)}>&gt;</button>
          </div>
        )}
      </div>
      <Panel className="flex-1">
        <div className="scroll-y h-full">
          {tab === 'mine' ? (
            <table className="w-full"><tbody>{mine.map(row)}</tbody></table>
          ) : (
            <table className="w-full"><tbody>
              {weekFx.map((f) => {
                const h = g!.clubs[f.home], a = g!.clubs[f.away];
                const has = !!g!.reports[f.id];
                return (
                  <tr key={f.id} className={`border-t border-line/40 ${f.home === me || f.away === me ? 'bg-accent/10' : ''}`} onClick={() => has && store.openReport(f.id)}>
                    <td className="td text-right w-[38%]"><span className="inline-flex items-center gap-1.5">{h.name}<Badge club={h} size={18} /></span></td>
                    <td className="td text-center font-bold w-16">{f.played ? `${f.hg} - ${f.ag}` : 'vs'}</td>
                    <td className="td w-[38%]"><span className="inline-flex items-center gap-1.5"><Badge club={a} size={18} />{a.name}</span></td>
                    <td className="td text-[10px] text-accent2">{has ? 'Report >' : ''}</td>
                  </tr>
                );
              })}
            </tbody></table>
          )}
        </div>
      </Panel>
    </div>
  );
}

// ---------------- Match report ----------------
function StatRow({ label, h, a, fmt }: { label: string; h: number; a: number; fmt?: (n: number) => string }) {
  const f = fmt ?? ((n: number) => String(n));
  const tot = h + a || 1;
  return (
    <div className="my-1">
      <div className="flex justify-between text-[11px]"><b>{f(h)}</b><span className="text-slate-400">{label}</span><b>{f(a)}</b></div>
      <div className="flex h-1.5 gap-0.5"><div className="flex-1 flex justify-end bg-black/40 rounded"><div className="bg-accent rounded" style={{ width: `${(h / tot) * 100}%` }} /></div><div className="flex-1 bg-black/40 rounded"><div className="bg-accent2 rounded" style={{ width: `${(a / tot) * 100}%` }} /></div></div>
    </div>
  );
}

function eventIcon(e: MatchEvent): string {
  switch (e.type) {
    case 'goal': return e.detail === 'penalty' ? 'GOAL (pen)' : 'GOAL';
    case 'yellow': return 'YELLOW';
    case 'red': return 'RED';
    case 'injury': return 'INJURY';
    case 'sub': return 'SUB';
    case 'pen_miss': return 'PEN MISS';
  }
}

export function MatchReportModal({ report, onClose }: { report: MatchReport; onClose: () => void }) {
  const { g } = useStore();
  const [tab, setTab] = useState<'summary' | 'stats' | 'ratings'>('summary');
  const h = g!.clubs[report.homeId], a = g!.clubs[report.awayId];
  const s = report.stats;
  const pct = (n: number) => `${n}%`;
  const ratings = (team: 'home' | 'away') => report.players.filter((p) => p.team === team).sort((x, y) => Number(y.started) - Number(x.started) || y.rating - x.rating);
  const pRow = (p: PlayerMatch) => (
    <tr key={p.id} className="border-t border-line/40">
      <td className="td w-8 text-slate-400">{p.pos}</td>
      <td className="td">{p.name}{p.id === report.motm && <span className="ml-1 text-[9px] bg-warn text-black rounded px-1">MOTM</span>}</td>
      <td className="td text-slate-400">{p.goals ? `G${p.goals} ` : ''}{p.assists ? `A${p.assists}` : ''}</td>
      <td className="td text-right font-bold" style={{ color: p.rating >= 7.5 ? '#22c55e' : p.rating < 6 ? '#ef4444' : '#e5e9f0' }}>{p.rating.toFixed(1)}</td>
    </tr>
  );
  const goals = report.events.filter((e) => e.type === 'goal');
  const sc = (team: 'home' | 'away') => goals.filter((e) => e.team === team).map((e) => `${e.player.split(' ').slice(-1)[0]} ${e.min}'${e.detail === 'penalty' ? ' (p)' : ''}`).join(', ');
  const statSet = (k: keyof TeamStats) => [s.home[k], s.away[k]] as [number, number];
  const [hx, ax] = statSet('xg');
  return (
    <Modal wide onClose={onClose} title={`${report.date ? fmtDate(report.date) : ''} - ${g!.leagues[report.leagueId ?? 'L1']?.short ?? ''} round ${report.week} - Full time`} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <div className="flex items-center justify-center gap-4 mb-2">
        <div className="flex items-center gap-2 w-1/3 justify-end"><span className="font-bold truncate">{h.name}</span><Badge club={h} size={36} /></div>
        <div className="text-3xl font-extrabold tabular-nums">{report.hg} - {report.ag}</div>
        <div className="flex items-center gap-2 w-1/3"><Badge club={a} size={36} /><span className="font-bold truncate">{a.name}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-300 mb-2 text-center">
        <div>{sc('home') || '-'}</div><div>{sc('away') || '-'}</div>
      </div>
      <div className="flex gap-1 mb-2 justify-center">
        {(['summary', 'stats', 'ratings'] as const).map((t) => <button key={t} className={`btn btn-sm capitalize ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'summary' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Match events</div>
            {report.events.length === 0 ? <div className="text-slate-500">No notable events.</div> : report.events.map((e, i) => (
              <div key={i} className={`flex gap-2 py-0.5 border-b border-line/30 ${e.team === 'away' ? 'flex-row-reverse text-right' : ''}`}>
                <span className="w-7 text-slate-400 tabular-nums">{e.min}'</span>
                <span className="text-[10px] font-bold w-16" style={{ color: e.type === 'goal' ? '#22c55e' : e.type === 'red' ? '#ef4444' : e.type === 'yellow' ? '#eab308' : e.type === 'injury' ? '#f97316' : '#94a3b8' }}>{eventIcon(e)}</span>
                <span className="flex-1 truncate">{e.type === 'sub' ? `${e.player} on, ${e.assist} off` : e.type === 'goal' ? `${e.player}${e.assist ? ` (${e.assist})` : ''}` : `${e.player}${e.detail && e.type !== 'yellow' ? ` - ${e.detail}` : ''}`}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Match analysis</div>
            <ul className="space-y-1.5 list-disc pl-4 text-slate-200">{report.analysis.map((t, i) => <li key={i}>{t}</li>)}</ul>
            {report.injuries.length > 0 && (
              <div className="mt-2"><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Injuries</div>
                {report.injuries.map((i) => <div key={i.playerId} className="text-bad">{g!.players[i.playerId]?.name}: {i.injury} ({i.days ?? i.weeks * 7} days)</div>)}</div>
            )}
          </div>
        </div>
      )}
      {tab === 'stats' && (
        <div className="max-w-md mx-auto">
          <StatRow label="Possession" h={s.home.possession} a={s.away.possession} fmt={pct} />
          <StatRow label="Expected goals (xG)" h={hx} a={ax} fmt={(n) => n.toFixed(2)} />
          <StatRow label="Total shots" h={s.home.shots} a={s.away.shots} />
          <StatRow label="Shots on target" h={s.home.onTarget} a={s.away.onTarget} />
          <StatRow label="Passes" h={s.home.passes} a={s.away.passes} />
          <StatRow label="Pass accuracy" h={s.home.passAcc} a={s.away.passAcc} fmt={pct} />
          <StatRow label="Fouls" h={s.home.fouls} a={s.away.fouls} />
          <StatRow label="Corners" h={s.home.corners} a={s.away.corners} />
          <StatRow label="Yellow cards" h={s.home.yellow} a={s.away.yellow} />
          <StatRow label="Red cards" h={s.home.red} a={s.away.red} />
          <StatRow label="Saves" h={s.home.saves} a={s.away.saves} />
        </div>
      )}
      {tab === 'ratings' && (
        <div className="grid grid-cols-2 gap-3">
          <div><div className="font-bold mb-1">{h.name}</div><table className="w-full"><tbody>{ratings('home').map(pRow)}</tbody></table></div>
          <div><div className="font-bold mb-1">{a.name}</div><table className="w-full"><tbody>{ratings('away').map(pRow)}</tbody></table></div>
        </div>
      )}
    </Modal>
  );
}

export { FormChips };
