import { useState } from 'react';
import { store, useStore } from './store';
import { Badge, Modal, Ovr, PosTag } from './common';
import type { Player } from '../engine/types';
import { fmtMoney } from '../engine/valuation';
import { askingPrice, contractDemand, interestedClubs, isWindowOpen, loanFeeFor, maxYears, negotiateBid, negotiateRenewal, proposeSale } from '../engine/transfers';
import { wageBill } from '../engine/team';

function MoneyInput({ label, value, onChange, step, min = 0 }: { label: string; value: number; onChange: (n: number) => void; step: number; min?: number }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
      <div className="flex items-center gap-1">
        <button className="btn btn-sm w-8" onClick={() => onChange(Math.max(min, value - step))}>-</button>
        <input className="flex-1 min-w-0 bg-black/40 border border-line rounded px-2 py-1 text-center font-semibold" inputMode="numeric" value={value}
          onChange={(e) => onChange(Math.max(min, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))} />
        <button className="btn btn-sm w-8" onClick={() => onChange(value + step)}>+</button>
      </div>
      <div className="text-[10px] text-slate-400 text-right">{fmtMoney(value)}</div>
    </label>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'bad' | 'info'; children: React.ReactNode }) {
  const c = tone === 'ok' ? 'border-accent/60 bg-accent/10 text-accent' : tone === 'bad' ? 'border-bad/60 bg-bad/10 text-bad' : 'border-line bg-panel2 text-slate-200';
  return <div className={`border rounded px-2 py-1.5 text-xs ${c}`}>{children}</div>;
}

// ---------- Buying a player ----------
export function BidDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const free = !player.clubId;
  const ask = free ? 0 : askingPrice(g!, player);
  const [kind, setKind] = useState<'permanent' | 'loan'>('permanent');
  const demand = contractDemand(player, me);
  const [fee, setFee] = useState(ask);
  const [wage, setWage] = useState(demand);
  const [years, setYears] = useState(Math.min(3, maxYears(player)));
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [counter, setCounter] = useState<{ fee?: number; wage?: number } | null>(null);
  const loanFee = loanFeeFor(player);
  const open = isWindowOpen(g!.meta.week);

  const submit = async () => {
    const res = await store.mutate((gg) => negotiateBid(gg, { playerId: player.id, buyerId: me.id, fee, wage, years, kind }));
    if (res.done) { store.toast(res.message); onClose(); return; }
    setMsg({ text: res.message || res.errors[0] || 'No deal.', tone: res.errors.length || res.feeStatus === 'rejected' || res.wageStatus === 'rejected' ? 'bad' : 'info' });
    setCounter(res.feeStatus === 'countered' || res.wageStatus === 'countered' ? { fee: res.counterFee, wage: res.counterWage } : null);
  };

  return (
    <Modal title={<span>Make an offer - {player.name}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!open} onClick={submit}>{kind === 'loan' ? 'Propose loan' : 'Submit offer'}</button></>}>
      <div className="flex items-center gap-2 mb-2">
        <PosTag pos={player.pos} /><Ovr v={player.ovr} />
        <div className="flex-1 min-w-0"><div className="font-semibold truncate">{player.name}</div>
          <div className="text-[11px] text-slate-400">{player.age}y - {player.nat} - {free ? 'Free agent' : g!.clubs[player.clubId!].name}</div></div>
      </div>
      {!open && <Banner tone="bad">The transfer window is closed.</Banner>}
      <div className="grid grid-cols-3 gap-2 text-[11px] my-2">
        <div className="panel p-1.5"><div className="text-slate-400">Market value</div><b>{fmtMoney(player.value)}</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">{free ? 'Fee' : 'Asking price'}</div><b>{free ? 'Free' : fmtMoney(ask)}</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">Wage demand</div><b>{fmtMoney(demand)}/wk</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">Transfer budget</div><b>{fmtMoney(me.transferBudget)}</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">Wage room</div><b>{fmtMoney(Math.max(0, me.wageBudget - wageBill(g!, me.id)))}/wk</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">Current wage</div><b>{fmtMoney(player.wage)}/wk</b></div>
      </div>
      {!free && (
        <div className="flex gap-1 mb-2">
          <button className={`btn btn-sm flex-1 ${kind === 'permanent' ? 'btn-primary' : ''}`} onClick={() => { setKind('permanent'); setFee(ask); }}>Permanent transfer</button>
          <button className={`btn btn-sm flex-1 ${kind === 'loan' ? 'btn-primary' : ''}`} onClick={() => { setKind('loan'); setFee(loanFee); }}>Loan until end of season</button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {free ? <div className="text-xs text-slate-400 self-center">No fee - free agent.</div> : <MoneyInput label={kind === 'loan' ? 'Loan fee' : 'Transfer fee'} value={fee} onChange={setFee} step={kind === 'loan' ? 25000 : 250000} />}
        {kind === 'permanent' ? <MoneyInput label="Wage per week" value={wage} onChange={setWage} step={500} /> : <div className="text-xs text-slate-400 self-center">You pay his current wage ({fmtMoney(player.wage)}/wk).</div>}
        {kind === 'permanent' && (
          <label className="block"><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Contract</div>
            <select className="w-full bg-black/40 border border-line rounded px-2 py-1.5" value={years} onChange={(e) => setYears(parseInt(e.target.value, 10))}>
              {Array.from({ length: maxYears(player) }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
            </select></label>
        )}
      </div>
      {msg && <div className="mt-2"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      {counter && (
        <div className="mt-2 flex gap-2">
          {counter.fee !== undefined && <button className="btn btn-sm" onClick={() => { setFee(counter.fee!); setCounter((c) => ({ ...c, fee: undefined })); }}>Accept fee {fmtMoney(counter.fee)}</button>}
          {counter.wage !== undefined && <button className="btn btn-sm" onClick={() => { setWage(counter.wage!); setCounter((c) => ({ ...c, wage: undefined })); }}>Accept wage {fmtMoney(counter.wage)}/wk</button>}
        </div>
      )}
    </Modal>
  );
}

// ---------- Selling / loaning out ----------
export function SaleDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const { g } = useStore();
  const interested = interestedClubs(g!, player);
  const [clubId, setClubId] = useState(interested[0]?.clubId ?? '');
  const sel = interested.find((i) => i.clubId === clubId);
  const [kind, setKind] = useState<'permanent' | 'loan'>('permanent');
  const [fee, setFee] = useState(sel?.estimate ?? player.value);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [counter, setCounter] = useState<number | null>(null);
  const open = isWindowOpen(g!.meta.week);

  const pick = (id: string) => { setClubId(id); const i = interested.find((x) => x.clubId === id); if (i) setFee(kind === 'loan' ? loanFeeFor(player) : i.estimate); setMsg(null); setCounter(null); };
  const submit = async () => {
    const r = await store.mutate((gg) => proposeSale(gg, player.id, clubId, fee, kind));
    if (r.done) { store.toast(r.message); onClose(); return; }
    setMsg({ text: r.message, tone: r.status === 'countered' ? 'info' : 'bad' });
    setCounter(r.status === 'countered' ? r.counterFee ?? null : null);
  };

  return (
    <Modal title={`Sell or loan out - ${player.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!open || !clubId} onClick={submit}>Offer to club</button></>}>
      {!open && <Banner tone="bad">The transfer window is closed.</Banner>}
      <div className="text-[11px] text-slate-400 mb-1">Market value {fmtMoney(player.value)} - wage {fmtMoney(player.wage)}/wk</div>
      <div className="flex gap-1 mb-2">
        <button className={`btn btn-sm flex-1 ${kind === 'permanent' ? 'btn-primary' : ''}`} onClick={() => { setKind('permanent'); const i = interested.find((x) => x.clubId === clubId); if (i) setFee(i.estimate); }}>Sell</button>
        <button className={`btn btn-sm flex-1 ${kind === 'loan' ? 'btn-primary' : ''}`} onClick={() => { setKind('loan'); setFee(loanFeeFor(player)); }}>Loan out</button>
      </div>
      {interested.length === 0 ? <Banner tone="info">No club is currently able to take this player (budgets, squad size or wage limits).</Banner> : (
        <div className="grid grid-cols-2 gap-2">
          <div className="scroll-y max-h-44 panel">
            {interested.map((i) => {
              const c = g!.clubs[i.clubId];
              return (
                <button key={i.clubId} onClick={() => pick(i.clubId)} className={`w-full flex items-center gap-2 px-2 py-1 text-left border-b border-line/50 ${clubId === i.clubId ? 'bg-accent/15' : ''}`}>
                  <Badge club={c} size={20} /><span className="flex-1 truncate">{c.name}</span><span className="text-slate-400">~{fmtMoney(i.estimate)}</span>
                </button>
              );
            })}
          </div>
          <div>
            <MoneyInput label={kind === 'loan' ? 'Loan fee' : 'Asking fee'} value={fee} onChange={setFee} step={kind === 'loan' ? 25000 : 250000} />
            {msg && <div className="mt-2"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
            {counter !== null && <button className="btn btn-sm mt-2" onClick={() => { setFee(counter); setCounter(null); }}>Take their {fmtMoney(counter)}</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Contract renewal ----------
export function RenewDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const demand = contractDemand(player, me);
  const [wage, setWage] = useState(Math.max(player.wage, demand));
  const [years, setYears] = useState(Math.min(3, maxYears(player)));
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [counter, setCounter] = useState<number | null>(null);
  const submit = async () => {
    const r = await store.mutate((gg) => negotiateRenewal(gg, player.id, wage, years));
    if (r.done) { store.toast(r.message); onClose(); return; }
    setMsg({ text: r.message, tone: r.status === 'countered' ? 'info' : 'bad' });
    setCounter(r.status === 'countered' ? r.counterWage ?? null : null);
  };
  return (
    <Modal title={`Contract renewal - ${player.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Offer contract</button></>}>
      <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
        <div className="panel p-1.5"><div className="text-slate-400">Current wage</div><b>{fmtMoney(player.wage)}/wk</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">Contract left</div><b>{player.contractYears} yr</b></div>
        <div className="panel p-1.5"><div className="text-slate-400">Morale</div><b>{Math.round(player.morale)}</b></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MoneyInput label="Wage per week" value={wage} onChange={setWage} step={500} />
        <label className="block"><div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">New length</div>
          <select className="w-full bg-black/40 border border-line rounded px-2 py-1.5" value={years} onChange={(e) => setYears(parseInt(e.target.value, 10))}>
            {Array.from({ length: maxYears(player) }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
          </select></label>
      </div>
      {msg && <div className="mt-2"><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      {counter !== null && <button className="btn btn-sm mt-2" onClick={() => { setWage(counter); setCounter(null); }}>Accept {fmtMoney(counter)}/wk</button>}
    </Modal>
  );
}
