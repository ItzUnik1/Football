import { useStore } from '../store';
import { Bar, Panel, Stat } from '../common';
import { fmtMoney } from '../../engine/valuation';
import { squadOf, wageBill } from '../../engine/team';
import { projectedWeekly } from '../../engine/finance';
import { fmtDateShort, seasonStart } from '../../engine/calendar';
import { costsWeekly, incomeWeekly, projection } from '../../engine/econ';

export function FinancesScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const bill = wageBill(g!, me.id);
  const sStart = seasonStart(g!.meta.season);
  const cur = g!.tx.filter((t) => (t.date ?? 0) >= sStart);
  const sum = (types: string[]) => cur.filter((t) => types.includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const tvIncome = sum(['tv']), gate = sum(['matchday']), wages = sum(['wages']);
  const spent = -cur.filter((t) => t.type === 'transfer_in' || t.type === 'loan_in').reduce((s, t) => s + t.amount, 0);
  const earned = cur.filter((t) => t.type === 'transfer_out' || t.type === 'loan_out').reduce((s, t) => s + t.amount, 0);
  const proj = projectedWeekly(g!, me.id);
  const room = me.wageBudget - bill;
  const top = squadOf(g!, me.id).sort((a, b) => b.wage - a.wage).slice(0, 8);
  const ledger = g!.tx.filter((t) => t.amount !== 0 || t.type === 'contract').slice().reverse().slice(0, 80);
  const staff = sum(['staff', 'agent']);
  const net = tvIncome + gate + wages + staff;
  const inc = incomeWeekly(me), cost = costsWeekly(g!, me), pr = projection(g!, me.id, 26);
  const pts = pr.points; const lo = Math.min(...pts.map((p) => p.balance)), hi = Math.max(...pts.map((p) => p.balance));
  const xy = pts.map((p, i) => `${(i / Math.max(1, pts.length - 1)) * 200},${40 - ((p.balance - lo) / Math.max(1, hi - lo)) * 36}`).join(' ');
  const due = g!.installments.filter((i) => i.fromClubId === me.id);
  return (
    <div className="h-full flex gap-2 fade-in">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Panel>
          <div className="grid grid-cols-4">
            <Stat label="Club balance" value={fmtMoney(me.balance)} tone={me.balance < 0 ? 'bad' : undefined} />
            <Stat label="Transfer budget" value={fmtMoney(me.transferBudget)} sub="30% of weekly profit added" />
            <Stat label="Wage budget" value={`${fmtMoney(me.wageBudget)}/wk`} />
            <Stat label="Wage room" value={`${fmtMoney(room)}/wk`} tone={room < me.wageBudget * 0.03 ? 'warn' : 'good'} />
          </div>
        </Panel>
        <Panel title="Wage bill">
          <div className="p-2">
            <div className="flex justify-between text-[11px] mb-1"><span>{fmtMoney(bill)}/wk of {fmtMoney(me.wageBudget)}/wk</span><span>{Math.round((bill / me.wageBudget) * 100)}%</span></div>
            <Bar value={bill} max={me.wageBudget} color={bill > me.wageBudget * 0.95 ? '#f59e0b' : '#22c55e'} h={8} />
            <div className="text-[10px] text-slate-400 mt-1">Projected weekly income ~{fmtMoney(proj.income)} (TV {fmtMoney(me.weeklyIncome)} + gate)</div>
          </div>
        </Panel>
        <Panel title="Weekly income and costs" className="shrink-0">
          <div className="grid grid-cols-4">
            <Stat label="TV" value={fmtMoney(inc.tv)} tone="good" /><Stat label="Sponsors" value={fmtMoney(inc.sponsor + inc.kit)} tone="good" sub={me.econ?.sponsor.name} /><Stat label="Merch + other" value={fmtMoney(inc.merch + inc.other)} tone="good" /><Stat label="Net before gate" value={fmtMoney(inc.total - cost.wages - cost.staff - cost.stadium)} tone={inc.total - cost.wages - cost.staff - cost.stadium >= 0 ? 'good' : 'warn'} />
            <Stat label="Wages" value={fmtMoney(cost.wages)} tone="bad" /><Stat label="Staff + manager" value={fmtMoney(cost.staff)} tone="bad" /><Stat label="Stadium" value={fmtMoney(cost.stadium)} tone="bad" /><Stat label="Debt" value={me.balance < 0 ? fmtMoney(-me.balance) : '-'} tone={me.balance < 0 ? 'bad' : undefined} />
          </div>
        </Panel>
        <Panel title={`Projection: 26 weeks (${fmtMoney(pr.start)} to ${fmtMoney(pr.end)})`} className="shrink-0">
          <div className="p-2 flex gap-3 items-center"><svg viewBox="0 0 200 44" className="w-40 h-10 shrink-0"><polyline points={xy} fill="none" stroke={pr.end >= pr.start ? '#22c55e' : '#ef4444'} strokeWidth="2" /></svg><div className="text-[10px] text-slate-400 space-y-0.5">{pr.notes.length ? pr.notes.slice(0, 3).map((n, i) => <div key={i}>{n}</div>) : <div>Stable outlook.</div>}</div></div>
        </Panel>
        <Panel title="This season" className="shrink-0">
          <div className="grid grid-cols-3">
            <Stat label="TV & commercial" value={fmtMoney(tvIncome)} tone="good" />
            <Stat label="Matchday" value={fmtMoney(gate)} tone="good" />
            <Stat label="Wages paid" value={fmtMoney(wages)} tone="bad" />
            <Stat label="Transfer spend" value={fmtMoney(-spent)} tone="bad" />
            <Stat label="Transfer income" value={fmtMoney(earned)} tone="good" />
            <Stat label="Staff & agents" value={fmtMoney(staff)} tone="bad" />
            <Stat label="Operating net" value={fmtMoney(net)} tone={net >= 0 ? 'good' : 'bad'} />
          </div>
        </Panel>
        <Panel title={`Top earners${due.length ? ` - ${due.length} instalment${due.length > 1 ? 's' : ''} due` : ''}`} className="flex-1">
          <div className="scroll-y h-full">
            {due.map((i) => <div key={i.id} className="flex justify-between px-2 py-0.5 border-b border-line/40 text-warn"><span>{i.desc} - {fmtDateShort(i.date)}</span><b>{fmtMoney(-i.amount)}</b></div>)}
            {top.map((p) => <div key={p.id} className="flex justify-between px-2 py-0.5 border-b border-line/40"><span>{p.name} <span className="text-slate-500">{p.contractEnd ? new Date(p.contractEnd).getUTCFullYear() : ''}</span></span><b>{fmtMoney(p.wage)}/wk</b></div>)}
          </div>
        </Panel>
      </div>
      <Panel className="w-[38%] min-w-[220px]" title="Transaction ledger">
        <div className="scroll-y h-full">
          {ledger.length === 0 ? <div className="p-3 text-center text-slate-500">No transactions yet.</div> : ledger.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1 border-b border-line/40">
              <span className="text-[10px] text-slate-500 w-12 shrink-0">{t.date ? fmtDateShort(t.date) : `MD${t.week}`}</span>
              <span className="flex-1 truncate text-slate-300">{t.desc}</span>
              <b className={t.amount > 0 ? 'text-accent' : t.amount < 0 ? 'text-bad' : 'text-slate-400'}>{t.amount === 0 ? '-' : fmtMoney(t.amount)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
