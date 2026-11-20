import { useEffect, useState } from 'react';
import { store, useStore } from '../store';
import { CatIcon, Panel } from '../common';
import { CATEGORIES, type Category, type Message } from '../../engine/types';
import { fmtDate, fmtDateLong } from '../../engine/calendar';
const msgDate = (m: Message) => fmtDate(m.date ?? m.createdAt);
import { markAllRead, markRead, performAction, type InboxChoice } from '../../engine/inbox';
import { fmtMoney } from '../../engine/valuation';
import type { Screen } from '../store';

export function InboxScreen() {
  const { g, ui } = useStore();
  const [cat, setCat] = useState<'All' | Category>('All');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [impOnly, setImpOnly] = useState(false);
  const selId = ui.selectedMessageId ?? null;
  const setSelId = (id: string | null) => store.selectMessage(id ?? undefined);
  useEffect(() => { if (selId) document.getElementById('msg-' + selId)?.scrollIntoView({ block: 'nearest' }); }, [selId]);

  let list = g!.messages.slice().reverse();
  if (cat !== 'All') list = list.filter((m) => m.category === cat);
  if (unreadOnly) list = list.filter((m) => !m.read);
  if (impOnly) list = list.filter((m) => m.important);
  const unread = g!.messages.filter((m) => !m.read).length;
  const sel = g!.messages.find((m) => m.id === selId) ?? null;

  const open = (m: Message) => {
    setSelId(m.id);
    if (!m.read) store.mutate((gg) => markRead(gg, m.id));
  };

  const act = async (m: Message, choice: InboxChoice) => {
    const r = await store.mutate((gg) => performAction(gg, m.id, choice));
    if (r.goto) { store.go(r.goto.screen as Screen, undefined); if (r.goto.playerId) store.openProfile(r.goto.playerId); return; }
    store.toast(r.message, r.ok ? 'ok' : 'bad');
  };

  const catCount = (c: Category) => g!.messages.filter((m) => m.category === c && !m.read).length;

  return (
    <div className="h-full flex gap-2 fade-in">
      <div className="w-[40%] min-w-[230px] flex flex-col gap-1.5">
        <div className="flex gap-1 shrink-0 overflow-x-auto pb-1">
          <button className={`btn btn-sm shrink-0 ${cat === 'All' ? 'btn-primary' : ''}`} onClick={() => setCat('All')}>All{unread ? ` (${unread})` : ''}</button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`btn btn-sm shrink-0 ${cat === c ? 'btn-primary' : ''}`} onClick={() => setCat(c)}>{c}{catCount(c) ? ` ${catCount(c)}` : ''}</button>
          ))}
        </div>
        <div className="flex gap-1 items-center shrink-0">
          <button className={`btn btn-sm ${unreadOnly ? 'btn-primary' : ''}`} onClick={() => setUnreadOnly(!unreadOnly)}>Unread</button>
          <button className={`btn btn-sm ${impOnly ? 'btn-primary' : ''}`} onClick={() => setImpOnly(!impOnly)}>Important</button>
          <div className="flex-1" />
          <button className="btn btn-sm" disabled={!unread} onClick={() => store.mutate((gg) => markAllRead(gg))}>Mark all read</button>
        </div>
        <Panel className="flex-1">
          <div className="scroll-y h-full">
            {list.length === 0 && <div className="p-4 text-center text-slate-500">No messages.</div>}
            {list.map((m) => (
              <button key={m.id} id={'msg-' + m.id} onClick={() => open(m)} className={`w-full text-left px-2 py-1.5 border-b border-line/40 flex gap-2 items-start ${selId === m.id ? 'bg-accent/15' : 'active:bg-panel2'}`}>
                <span className="pt-1"><CatIcon cat={m.category} /></span>
                <div className="flex-1 min-w-0">
                  <div className={`truncate ${m.read ? 'text-slate-300' : 'font-bold text-white'}`}>{m.important && <span className="text-warn mr-1">!</span>}{m.subject}</div>
                  <div className="text-[10px] text-slate-500 truncate">{m.from} - {msgDate(m)}{m.action && !m.resolved && m.action.kind !== 'goto' ? ' - ACTION' : ''}</div>
                </div>
                {!m.read && <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />}
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel className="flex-1 min-w-0">
        {!sel ? <div className="h-full flex items-center justify-center text-slate-500">Select a message</div> : (
          <div className="h-full flex flex-col fade-in" key={sel.id}>
            <div className="px-3 py-2 border-b border-line shrink-0">
              <div className="flex items-center gap-2"><CatIcon cat={sel.category} /><span className="text-[10px] uppercase tracking-wider text-slate-400">{sel.category}</span>{sel.important && <span className="text-[10px] bg-warn text-black rounded px-1 font-bold">IMPORTANT</span>}</div>
              <div className="font-bold text-sm mt-0.5">{sel.subject}</div>
              <div className="text-[11px] text-slate-400">From {sel.from} - {fmtDateLong(sel.date ?? sel.createdAt)}</div>
            </div>
            <div className="flex-1 min-h-0 scroll-y px-3 py-2 whitespace-pre-line text-[12px] text-slate-200">{sel.body}</div>
            <div className="px-3 py-2 border-t border-line shrink-0 flex flex-wrap gap-2 items-center">
              <MessageActions m={sel} act={act} />
              <button className="btn btn-sm ml-auto" onClick={() => store.mutate((gg) => markRead(gg, sel.id, !sel.read))}>{sel.read ? 'Mark unread' : 'Mark read'}</button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function MessageActions({ m, act }: { m: Message; act: (m: Message, c: InboxChoice) => void }) {
  const a = m.action;
  if (m.resolved) return <span className="text-[11px] text-slate-300 border border-line rounded px-2 py-1">{m.resolved}</span>;
  if (!a) return null;
  if (a.kind === 'goto') return <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>{a.screen === 'squad' ? 'View player' : `Go to ${a.screen === 'home' ? 'Home' : a.screen}`}</button>;
  if (a.kind === 'transfer_offer') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>Accept {fmtMoney(a.fee)}</button>
      <button className="btn btn-sm" onClick={() => act(m, 'counter')}>Ask for more</button>
      <button className="btn btn-sm btn-danger" onClick={() => act(m, 'reject')}>Reject</button>
      <span className="text-[10px] text-slate-500">Valid until {fmtDate(a.expires)}</span>
    </>
  );
  if (a.kind === 'loan_offer') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>Accept loan ({fmtMoney(a.fee)})</button>
      <button className="btn btn-sm btn-danger" onClick={() => act(m, 'reject')}>Reject</button>
    </>
  );
  if (a.kind === 'contract') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>Agree {fmtMoney(a.wage)}/wk x {a.years}y</button>
      <button className="btn btn-sm" onClick={() => { store.go('squad'); store.openProfile(a.playerId); }}>Negotiate</button>
      <button className="btn btn-sm btn-danger" onClick={() => act(m, 'reject')}>Reject</button>
    </>
  );
  if (a.kind === 'complaint') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'promise')}>Promise more minutes</button>
      <button className="btn btn-sm" onClick={() => act(m, 'ignore')}>Tell him to fight for his place</button>
    </>
  );
  if (a.kind === 'wants_move') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'promise')}>Persuade to stay</button>
      <button className="btn btn-sm" onClick={() => act(m, 'accept')}>Transfer list him</button>
      <button className="btn btn-sm btn-danger" onClick={() => act(m, 'reject')}>Refuse</button>
    </>
  );
  if (a.kind === 'youth_contract') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>Offer pro contract</button>
      <button className="btn btn-sm btn-danger" onClick={() => act(m, 'reject')}>Release</button>
      <span className="text-[10px] text-slate-500">Decide by {fmtDate(a.expires)}</span>
    </>
  );
  if (a.kind === 'loan_option') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>Buy for {fmtMoney(a.fee)}</button>
      <button className="btn btn-sm btn-danger" onClick={() => act(m, 'reject')}>Decline</button>
    </>
  );
  if (a.kind === 'board_funds') return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => act(m, 'accept')}>Accept {fmtMoney(a.amount)}</button>
      <button className="btn btn-sm" onClick={() => act(m, 'reject')}>Decline</button>
    </>
  );
  if (a.kind === 'scout_report') return <button className="btn btn-sm btn-primary" onClick={() => { store.go('scouting'); store.openProfile(a.playerId); }}>View player and report</button>;
  return null;
}
