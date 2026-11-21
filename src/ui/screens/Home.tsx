import { useMemo } from 'react';
import { store, useStore } from '../store';
import { Badge, FormChips, Panel } from '../common';
import { computeTable } from '../../engine/fixtures';
import { nextFixture, seasonComplete, userFixtureToday } from '../../engine/game';
import { eventsBetween, CAL_COLORS } from '../../engine/calendarEvents';
import { addDays, dayDiff, fmtDate, fmtDateLong, fmtDateShort } from '../../engine/calendar';
import { squadOf } from '../../engine/team';
import { fmtMoney } from '../../engine/valuation';
import { unreadCount } from '../../engine/messages';
import { ordinal } from '../../engine/board';
import { cupProgress } from '../../engine/cups';
import { nationSummary } from '../../engine/intl';
import { tacticalIdentity } from '../../engine/mgr';
import { harmony } from '../../engine/social';

export function HomeScreen() {
  const { g, v } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const date = g!.meta.date!;
  const table = useMemo(() => computeTable(g!), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = table.findIndex((r) => r.clubId === me.id);
  const lo = Math.max(0, Math.min(idx - 3, table.length - 7));
  const mini = table.slice(lo, lo + 7);
  const lg = g!.leagues[me.leagueId ?? 'L1'];
  const today = userFixtureToday(g!);
  const next = today && !today.played ? today : nextFixture(g!);
  const opp = next ? g!.clubs[next.home === me.id ? next.away : next.home] : null;
  const last = g!.fixtures.filter((f) => f.played && (f.home === me.id || f.away === me.id)).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  const row = table[idx];
  const squad = squadOf(g!, me.id);
  const injured = squad.filter((p) => p.injuredDays > 0);
  const banned = squad.filter((p) => p.suspended > 0);
  const upcoming = useMemo(() => eventsBetween(g!, date, addDays(date, 14)).filter((e) => e.cat !== 'training').slice(0, 6), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = unreadCount(g!);
  const days = next?.date !== undefined ? dayDiff(date, next.date) : null;
  const matchToday = !!today && !today.played;
  const board = g!.board;
  const cup = cupProgress(g!, me.id);
  const nat = g!.intl?.userNation ? g!.intl.nations[g!.intl.userNation] : undefined;
  const natNext = nat ? nationSummary(g!, nat.id).next : undefined;
  const wages = squad.reduce((s2, p) => s2 + p.wage, 0);

  return (
    <div className="h-full grid grid-cols-[1.2fr_1fr_1fr] gap-2 fade-in">
      <div className="flex flex-col gap-2 min-h-0">
        <Panel title={matchToday ? 'Match day' : 'Next match'} className="flex-1">
          <div className="p-3 h-full flex flex-col">
            {!next || seasonComplete(g!) ? (
              <div className="text-slate-400 text-xs my-auto text-center">The season is complete. The next season begins on 1 July - plan transfers and contracts in the meantime.</div>
            ) : (
              <>
                <div className="flex items-center justify-around gap-2">
                  <div className="text-center"><Badge club={next.home === me.id ? me : opp!} size={46} /><div className="text-[11px] mt-1 font-semibold">{(next.home === me.id ? me : opp!).short}</div></div>
                  <div className="text-center"><div className="text-slate-400 text-[10px]">{lg.short} - round {next.week}</div><div className="text-lg font-extrabold">{matchToday ? 'TODAY' : `in ${days} day${days === 1 ? '' : 's'}`}</div><div className="text-[11px] text-slate-400">{fmtDateLong(next.date!)}</div></div>
                  <div className="text-center"><Badge club={next.home === me.id ? opp! : me} size={46} /><div className="text-[11px] mt-1 font-semibold">{(next.home === me.id ? opp! : me).short}</div></div>
                </div>
                <div className="text-[11px] text-slate-400 text-center mt-2">{next.home === me.id ? me.stadium : opp!.stadium} - {opp!.name} are {ordinal(table.findIndex((r) => r.clubId === opp!.id) + 1)}</div>
                <div className="mt-auto flex gap-2 justify-center pt-2">
                  <button className="btn" onClick={() => store.go('tactics')}>Prepare lineup</button>
                  <button className="btn" onClick={() => store.go('fixtures')}>Fixtures</button>
                </div>
              </>
            )}
          </div>
        </Panel>
        <Panel title="Last result">
          <div className="px-3 py-2 flex items-center gap-2 text-xs">
            {last ? (<><span className="text-slate-400 w-14">{fmtDateShort(last.date!)}</span><span className="flex-1 truncate">{g!.clubs[last.home].short} <b>{last.hg}-{last.ag}</b> {g!.clubs[last.away].short}</span><button className="btn btn-sm" onClick={() => g!.reports[last.id] && store.openReport(last.id)}>Report</button></>) : <span className="text-slate-500">No matches played yet.</span>}
            {row && <FormChips form={row.form} />}
          </div>
        </Panel>
        <Panel title="Latest news" className="flex-1" right={<button className="text-[10px] text-accent2 underline" onClick={() => store.go('news')}>All news</button>}>
          <div className="scroll-y h-full">{g!.news.slice(-6).reverse().map((n) => <div key={n.id} className="px-2 py-0.5 border-b border-line/40 text-[11px] flex gap-1.5"><span className="text-slate-500 w-10 shrink-0">{fmtDateShort(n.date)}</span><span className={`truncate ${n.imp ? 'font-bold' : ''}`}>{n.headline}</span></div>)}</div>
        </Panel>
      </div>

      <div className="flex flex-col gap-2 min-h-0">
      <Panel title={`${lg.name}`} className="flex-1" right={<button className="text-[10px] text-accent2 underline" onClick={() => store.go('league')}>Full table</button>}>
        <table className="w-full">
          <thead><tr><th className="th w-6">#</th><th className="th">Club</th><th className="th text-right">P</th><th className="th text-right">GD</th><th className="th text-right">Pts</th></tr></thead>
          <tbody>
            {mini.map((r) => (
              <tr key={r.clubId} className={`border-t border-line/40 ${r.clubId === me.id ? 'bg-accent/15 font-bold' : ''}`}>
                <td className="td">{table.indexOf(r) + 1}</td>
                <td className="td"><span className="inline-flex items-center gap-1"><Badge club={g!.clubs[r.clubId]} size={14} />{g!.clubs[r.clubId].short}</span></td>
                <td className="td text-right">{r.played}</td><td className="td text-right">{r.gd > 0 ? '+' : ''}{r.gd}</td><td className="td text-right">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Competitions">
        <div className="p-2 text-[11px] space-y-1">
          <button className="w-full flex justify-between" onClick={() => store.go('cups')}><span>Cup</span><b className={cup.status === 'out' ? 'text-slate-400' : 'text-accent'}>{cup.text}</b></button>
          {nat && <button className="w-full flex justify-between" onClick={() => store.go('international')}><span>{nat.name}</span><b className="text-accent2">{natNext ? `next ${fmtDateShort(natNext.date)}` : `rank ${nat.rank}`}</b></button>}
          <div className="flex justify-between text-slate-400"><span>Objective</span><span className="text-right truncate ml-2">{board.objectives[0]?.title ?? board.objectives[0]?.desc}</span></div>
        </div>
      </Panel>
      </div>

      <div className="flex flex-col gap-2 min-h-0">
        <Panel title="Coming up" className="flex-1" right={<button className="text-[10px] text-accent2 underline" onClick={() => store.go('calendar')}>Calendar</button>}>
          <div className="scroll-y h-full">
            {upcoming.length === 0 && <div className="p-3 text-slate-500 text-center">Nothing scheduled.</div>}
            {upcoming.map((e) => (
              <button key={e.id} className="w-full flex items-center gap-2 px-2 py-1 border-b border-line/40 text-left active:bg-panel2" onClick={() => e.ref?.screen && e.ref.screen !== 'match' && store.go(e.ref.screen, e.ref.playerId)}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAL_COLORS[e.cat] }} />
                <span className="w-12 text-[10px] text-slate-400 shrink-0">{fmtDateShort(e.date)}</span><span className="flex-1 truncate">{e.title}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Attention">
          <div className="p-2 text-[11px] space-y-1">
            <button className="w-full flex justify-between" onClick={() => store.go('inbox')}><span>Unread messages</span><b className={unread ? 'text-accent' : 'text-slate-500'}>{unread}</b></button>
            <button className="w-full flex justify-between" onClick={() => store.go('medical')}><span>Injured / suspended</span><b className={injured.length + banned.length ? 'text-bad' : 'text-slate-500'}>{injured.length} / {banned.length}</b></button>
            <button className="w-full flex justify-between" onClick={() => store.go('board')}><span>Board confidence</span><b className={board.confidence < 35 ? 'text-bad' : board.confidence > 65 ? 'text-accent' : ''}>{Math.round(board.confidence)}%</b></button>
            <button className="w-full flex justify-between" onClick={() => store.go('finances')}><span>Balance</span><b className={me.balance < 0 ? 'text-bad' : ''}>{fmtMoney(me.balance)}</b></button>
            <button className="w-full flex justify-between" onClick={() => store.go('manager')}><span>Manager</span><b className="text-slate-300 truncate ml-2">{g!.career.name} - {tacticalIdentity(g!).label}</b></button>
            <button className="w-full flex justify-between" onClick={() => store.go('squad')}><span>Dressing room</span><b>{harmony(g!, me.id)}% harmony</b></button>
            <div className="text-[10px] text-slate-500 pt-0.5">{fmtDate(date)} - budget {fmtMoney(me.transferBudget)} - wages {fmtMoney(wages)}/wk</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
