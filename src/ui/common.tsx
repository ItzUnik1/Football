import { memo, type ReactNode } from 'react';
import type { Club, Player, Pos } from '../engine/types';

export const POS_COLOR: Record<Pos, string> = { GK: '#f59e0b', DF: '#38bdf8', MF: '#22c55e', FW: '#ef4444' };

export const Badge = memo(function Badge({ club, size = 28 }: { club: Club; size?: number }) {
  const [c1, c2] = club.colors;
  const v = club.badge;
  const shield = 'M4 4h24v14c0 7-6 10-12 12C10 28 4 25 4 18z';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      {v === 0 && <path d={shield} fill={c1} stroke={c2} strokeWidth="1.5" />}
      {v === 1 && <circle cx="16" cy="16" r="13" fill={c1} stroke={c2} strokeWidth="2" />}
      {v === 2 && <path d="M16 2l12 7v14l-12 7L4 23V9z" fill={c1} stroke={c2} strokeWidth="1.5" />}
      {v === 3 && <path d="M16 2l13 14-13 14L3 16z" fill={c1} stroke={c2} strokeWidth="1.5" />}
      {v === 4 && (<><path d={shield} fill={c1} stroke={c2} strokeWidth="1.5" /><path d="M4 12h24v5H4z" fill={c2} opacity=".85" /></>)}
      {v === 5 && (<><circle cx="16" cy="16" r="13" fill={c1} stroke={c2} strokeWidth="2" /><path d="M16 3a13 13 0 0 1 0 26z" fill={c2} opacity=".5" /></>)}
      <text x="16" y="19.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={c2} style={{ paintOrder: 'stroke' }} stroke={c1} strokeWidth="0.6">{club.short.slice(0, 3)}</text>
    </svg>
  );
});

export function PosTag({ pos }: { pos: Pos }) {
  return <span className="inline-block w-7 text-center text-[10px] font-bold rounded py-px text-black" style={{ background: POS_COLOR[pos] }}>{pos}</span>;
}

export function ovrColor(v: number): string {
  if (v >= 80) return '#22c55e';
  if (v >= 72) return '#84cc16';
  if (v >= 65) return '#eab308';
  if (v >= 58) return '#f59e0b';
  return '#94a3b8';
}
export function Ovr({ v }: { v: number }) {
  return <span className="inline-block min-w-[24px] text-center font-bold rounded px-1 text-black" style={{ background: ovrColor(v) }}>{v}</span>;
}

export function Bar({ value, max = 100, color, h = 5 }: { value: number; max?: number; color?: string; h?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color ?? (pct > 70 ? '#22c55e' : pct > 45 ? '#eab308' : '#ef4444');
  return <div className="w-full bg-black/40 rounded" style={{ height: h }}><div className="rounded h-full" style={{ width: `${pct}%`, background: c }} /></div>;
}

export function Panel({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`panel flex flex-col min-h-0 ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-2 py-1 border-b border-line shrink-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{title}</span>
          {right}
        </div>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-2 fade-in" onClick={onClose}>
      <div className={`panel flex flex-col max-h-full ${wide ? 'w-[min(96vw,900px)]' : 'w-[min(92vw,560px)]'} bg-panel shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-line shrink-0">
          <div className="font-bold text-[13px] truncate">{title}</div>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="scroll-y flex-1 min-h-0 p-3">{children}</div>
        {footer && <div className="px-3 py-2 border-t border-line shrink-0 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  const c = tone === 'good' ? 'text-accent' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-white';
  return (
    <div className="px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

export function FormChips({ form }: { form: ('W' | 'D' | 'L')[] }) {
  return (
    <span className="inline-flex gap-[2px]">
      {form.slice(-5).map((f, i) => (
        <span key={i} className="w-4 h-4 text-[9px] font-bold flex items-center justify-center rounded-sm text-black" style={{ background: f === 'W' ? '#22c55e' : f === 'D' ? '#eab308' : '#ef4444' }}>{f}</span>
      ))}
    </span>
  );
}

export function statusOf(p: Player): { text: string; color: string } | null {
  if (p.injuredWeeks > 0) return { text: `Inj ${p.injuredWeeks}w`, color: '#ef4444' };
  if (p.suspended > 0) return { text: `Ban ${p.suspended}`, color: '#f59e0b' };
  if (p.parentClubId) return { text: 'Loan', color: '#38bdf8' };
  return null;
}

export const moraleLabel = (m: number) => (m >= 80 ? 'Superb' : m >= 65 ? 'Good' : m >= 50 ? 'Okay' : m >= 35 ? 'Poor' : 'Unhappy');

export function CatIcon({ cat }: { cat: string }) {
  const map: Record<string, string> = { Transfers: '#38bdf8', Contracts: '#a78bfa', Medical: '#ef4444', Board: '#f59e0b', Players: '#22c55e', Fixtures: '#94a3b8', Competitions: '#eab308', Finances: '#14b8a6' };
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: map[cat] ?? '#94a3b8' }} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-4 text-center text-slate-500 text-xs">{children}</div>;
}
