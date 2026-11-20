import { useMemo, useState } from 'react';
import { store, useStore } from '../store';
import { Modal, Panel } from '../common';
import { CAL_COLORS, eventsBetween, type CalCat, type CalEvent } from '../../engine/calendarEvents';
import { addDays, addMonths, dowName, fmtDateLong, monthName, sameDay, startOfMonth, startOfWeek, weekday, parts } from '../../engine/calendar';

type View = 'month' | 'week' | 'day';
const CATS: CalCat[] = ['match', 'transfer', 'training', 'medical', 'contract', 'board', 'club', 'scouting', 'youth', 'league'];
const LABEL: Record<CalCat, string> = { match: 'Matches', transfer: 'Transfers', training: 'Training', medical: 'Medical', contract: 'Contracts', board: 'Board', club: 'Club', scouting: 'Scouting', youth: 'Youth', league: 'League' };

export function CalendarScreen() {
  const { g, v } = useStore();
  const today = g!.meta.date!;
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(today);
  const [hidden, setHidden] = useState<Set<CalCat>>(new Set(['training']));
  const [detail, setDetail] = useState<CalEvent | null>(null);

  const range = useMemo(() => {
    if (view === 'month') { const s = startOfWeek(startOfMonth(cursor)); return { from: s, to: addDays(s, 41) }; }
    if (view === 'week') { const s = startOfWeek(cursor); return { from: s, to: addDays(s, 6) }; }
    return { from: cursor, to: cursor };
  }, [view, cursor]);
  const events = useMemo(() => eventsBetween(g!, range.from, range.to).filter((e) => !hidden.has(e.cat)), [range, hidden, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => { const m = new Map<number, CalEvent[]>(); events.forEach((e) => { const k = Math.round(e.date / 86400000); (m.get(k) ?? m.set(k, []).get(k)!).push(e); }); return m; }, [events]);
  const evOn = (t: number) => byDay.get(Math.round(t / 86400000)) ?? [];

  const step = (n: number) => setCursor(view === 'month' ? addMonths(cursor, n) : addDays(cursor, n * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? monthName(cursor) : view === 'week' ? `Week of ${fmtDateLong(startOfWeek(cursor))}` : fmtDateLong(cursor);
  const toggle = (c: CalCat) => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const setV = (nv: View) => { setView(nv); setHidden((h) => { const n = new Set(h); if (nv === 'month') n.add('training'); else n.delete('training'); return n; }); };

  const Chip = ({ e }: { e: CalEvent }) => (
    <button onClick={(ev) => { ev.stopPropagation(); setDetail(e); }} className="w-full flex items-center gap-1 text-left rounded px-1 truncate leading-[14px]" style={{ background: CAL_COLORS[e.cat] + '33' }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAL_COLORS[e.cat] }} /><span className="truncate text-[9px]">{e.title}</span>
    </button>
  );

  return (
    <div className="h-full flex flex-col gap-1.5 fade-in">
      <div className="flex items-center gap-1 shrink-0">
        <button className="btn btn-sm" onClick={() => step(-1)}>‹</button>
        <button className="btn btn-sm" onClick={() => setCursor(today)}>Today</button>
        <button className="btn btn-sm" onClick={() => step(1)}>›</button>
        <div className="font-bold text-[13px] ml-2 flex-1 truncate">{title}</div>
        {(['month', 'week', 'day'] as View[]).map((x) => <button key={x} className={`btn btn-sm capitalize ${view === x ? 'btn-primary' : ''}`} onClick={() => setV(x)}>{x}</button>)}
      </div>
      <div className="flex gap-1 flex-wrap shrink-0">
        {CATS.map((c) => (
          <button key={c} onClick={() => toggle(c)} className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${hidden.has(c) ? 'opacity-40 border-line' : 'border-transparent bg-white/5'}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: CAL_COLORS[c] }} />{LABEL[c]}
          </button>
        ))}
      </div>
      <Panel className="flex-1">
        {view === 'month' && (
          <div className="h-full flex flex-col">
            <div className="grid grid-cols-7 shrink-0 border-b border-line">{[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="text-center text-[9px] uppercase text-slate-400 py-0.5">{dowName(addDays(range.from, i))}</div>)}</div>
            <div className="flex-1 min-h-0 grid grid-cols-7 grid-rows-6">
              {Array.from({ length: 42 }, (_, i) => {
                const t = addDays(range.from, i);
                const inMonth = parts(t).m === parts(cursor).m;
                const es = evOn(t);
                return (
                  <div key={i} onClick={() => { setCursor(t); setV('day'); }} className={`border-b border-r border-line/40 p-0.5 overflow-hidden ${inMonth ? '' : 'opacity-40'} ${sameDay(t, today) ? 'bg-accent/10' : ''}`}>
                    <div className={`text-[10px] leading-3 ${sameDay(t, today) ? 'text-accent font-bold' : 'text-slate-400'}`}>{parts(t).d}</div>
                    <div className="space-y-px">{es.slice(0, 2).map((e) => <Chip key={e.id} e={e} />)}{es.length > 2 && <div className="text-[8px] text-slate-500 pl-1">+{es.length - 2} more</div>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {view === 'week' && (
          <div className="h-full grid grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => {
              const t = addDays(range.from, i);
              return (
                <div key={i} className={`border-r border-line/40 p-1 min-h-0 scroll-y ${sameDay(t, today) ? 'bg-accent/10' : ''}`} onClick={() => { setCursor(t); setV('day'); }}>
                  <div className="text-[10px] text-slate-400 mb-1">{dowName(t)} {parts(t).d}</div>
                  <div className="space-y-0.5">{evOn(t).map((e) => <Chip key={e.id} e={e} />)}</div>
                </div>
              );
            })}
          </div>
        )}
        {view === 'day' && (
          <div className="scroll-y h-full">
            {evOn(cursor).length === 0 && <div className="p-4 text-center text-slate-500">Nothing scheduled for this day.</div>}
            {evOn(cursor).map((e) => (
              <button key={e.id} onClick={() => setDetail(e)} className="w-full text-left flex items-start gap-2 px-3 py-2 border-b border-line/40 active:bg-panel2">
                <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: CAL_COLORS[e.cat] }} />
                <div className="min-w-0"><div className="font-semibold">{e.title}</div><div className="text-[11px] text-slate-400">{e.detail}</div></div>
                <span className="ml-auto text-[10px] uppercase text-slate-500">{LABEL[e.cat]}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>
      {detail && (
        <Modal title={<span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CAL_COLORS[detail.cat] }} />{detail.title}</span>} onClose={() => setDetail(null)}
          footer={detail.ref?.screen && detail.ref.screen !== 'match' ? <button className="btn btn-primary" onClick={() => { const r = detail.ref!; setDetail(null); store.go(r.screen!, r.playerId); if (r.playerId) store.openProfile(r.playerId); }}>Open</button> : undefined}>
          <div className="text-xs space-y-1"><div className="text-slate-400">{fmtDateLong(detail.date)} - {LABEL[detail.cat]}</div><div>{detail.detail}</div>
            {detail.ref?.fixtureId && g!.reports[detail.ref.fixtureId] && <button className="btn btn-sm mt-1" onClick={() => { setDetail(null); store.openReport(detail.ref!.fixtureId); }}>Match report</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
void weekday;
