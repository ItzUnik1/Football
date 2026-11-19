import { useStore } from '../store';
import { Bar, Panel, Stat } from '../common';
import { fmtMoney } from '../../engine/valuation';
import { squadOf, wageBill } from '../../engine/team';
import { projectedWeekly } from '../../engine/finance';

export function FinancesScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const bill = wageBill(g!, me.id);
  const sum = (types: string[]) => g!.tx.filter((t) => types.includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const tvIncome = sum(['tv']), gate = sum(['matchday']), wages = sum(['wages']);
  const spent = -g!.tx.filter((t) => t.type === 'transfer_in' || t.type === 'loan_in').reduce((s, t) => s + t.amount, 0);
  const earned = g!.tx.filter((t) => t.type === 'transfer_out' || t.type === 'loan_out').reduce((s, t) => s + t.amount, 0);
  const proj = projectedWeekly(g!, me.id);
  const room = me.wageBudget - bill;
  const top = squadOf(g!, me.id).sort((a, b) => b.wage - a.wage).slice(0, 8);
  const ledger = g!.tx.slice().reverse().slice(0, 60);
  const net = tvIncome + gate + wages;
  return (
    <div className="h-full flex gap-2 fade-in">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Panel>
          <div className="grid grid-cols-4">
            <Stat label="Club balance" value={fmtMoney(me.balance)} tone={me.balance < 0 ? 'bad' : undefined} />
            <Stat label="Transfer budget" value={fmtMoney(me.transferBudget)} sub="25% of weekly profit added" />
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
        <Panel title="Season totals" className="shrink-0">
          <div className="grid grid-cols-3">
            <Stat label="TV & commercial" value={fmtMoney(tvIncome)} tone="good" />
            <Stat label="Matchday" value={fmtMoney(gate)} tone="good" />
            <Stat label="Wages paid" value={fmtMoney(wages)} tone="bad" />
            <Stat label="Transfer spend" value={fmtMoney(-spent)} tone="bad" />
            <Stat label="Transfer income" value={fmtMoney(earned)} tone="good" />
            <Stat label="Operating net" value={fmtMoney(net)} tone={net >= 0 ? 'good' : 'bad'} />
          </div>
        </Panel>
        <Panel title="Top earners" className="flex-1">
          <div className="scroll-y h-full">
            {top.map((p) => <div key={p.id} className="flex justify-between px-2 py-0.5 border-b border-line/40"><span>{p.name} <span className="text-slate-500">{p.contractYears}y</span></span><b>{fmtMoney(p.wage)}/wk</b></div>)}
          </div>
        </Panel>
      </div>
      <Panel className="w-[38%] min-w-[220px]" title="Transaction ledger">
        <div className="scroll-y h-full">
          {ledger.length === 0 ? <div className="p-3 text-center text-slate-500">No transactions yet.</div> : ledger.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1 border-b border-line/40">
              <span className="text-[10px] text-slate-500 w-8 shrink-0">MD{t.week}</span>
              <span className="flex-1 truncate text-slate-300">{t.desc}</span>
              <b className={t.amount > 0 ? 'text-accent' : t.amount < 0 ? 'text-bad' : 'text-slate-400'}>{t.amount === 0 ? '-' : fmtMoney(t.amount)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
