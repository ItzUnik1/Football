import { useEffect, useState } from 'react';
import { store, useStore, type Screen } from './store';
import { Badge, Modal } from './common';
import { ClubSelect, StartScreen } from './screens/Start';
import { DashboardScreen } from './screens/Dashboard';
import { PlayerProfile, SquadScreen } from './screens/Squad';
import { TacticsScreen } from './screens/Tactics';
import { FixturesScreen, MatchReportModal } from './screens/Fixtures';
import { LeagueScreen } from './screens/League';
import { TransfersScreen } from './screens/Transfers';
import { FinancesScreen } from './screens/Finances';
import { InboxScreen } from './screens/Inbox';
import { ClubScreen } from './screens/ClubInfo';
import { playWeek, nextFixture, seasonComplete, ordinal } from '../engine/game';
import { repairLineup, validateLineup } from '../engine/team';
import { positionOf } from '../engine/fixtures';
import { gameDate } from '../engine/messages';
import { isWindowOpen } from '../engine/transfers';

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { id: 'squad', label: 'Squad', icon: 'M16 11a4 4 0 1 0-8 0M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2' },
  { id: 'tactics', label: 'Tactics', icon: 'M3 5h18v14H3zM12 5v14M3 12h18' },
  { id: 'fixtures', label: 'Fixtures', icon: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4' },
  { id: 'league', label: 'League', icon: 'M5 20V10M12 20V4M19 20v-7' },
  { id: 'transfers', label: 'Transfers', icon: 'M4 8h13l-3-3M20 16H7l3 3' },
  { id: 'finances', label: 'Finances', icon: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { id: 'inbox', label: 'Inbox', icon: 'M3 6h18v12H3zM3 7l9 7 9-7' },
  { id: 'club', label: 'Club Info', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' },
];

function Icon({ d }: { d: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function Toast() {
  const { ui } = useStore();
  if (!ui.toast) return null;
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 fade-in pointer-events-none">
      <div className={`px-3 py-1.5 rounded shadow-lg text-xs font-semibold border ${ui.toast.kind === 'ok' ? 'bg-panel2 border-accent text-accent' : 'bg-panel2 border-bad text-bad'}`}>{ui.toast.text}</div>
    </div>
  );
}

function RotateNotice() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const f = () => setPortrait(window.innerHeight > window.innerWidth * 1.05);
    f(); window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  if (!portrait) return null;
  return <div className="fixed inset-0 z-[60] bg-bg flex flex-col items-center justify-center text-center p-6"><div className="text-3xl mb-2">⟳</div><div className="font-bold">Please rotate your device</div><div className="text-slate-400 text-xs">Touchline is designed for landscape.</div></div>;
}

function GameShell() {
  const { g, ui } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const [busy, setBusy] = useState(false);
  const [lineupErrs, setLineupErrs] = useState<string[] | null>(null);
  const next = nextFixture(g!);
  const done = seasonComplete(g!);
  const unread = g!.messages.filter((m) => !m.read).length;
  const opp = next ? g!.clubs[next.home === me.id ? next.away : next.home] : null;

  const sim = async (autoFix = false) => {
    if (busy) return;
    if (autoFix) await store.mutate((gg) => repairLineup(gg, gg.clubs[gg.meta.userClubId]));
    const errs = validateLineup(g!, me);
    if (errs.length) { setLineupErrs(errs); return; }
    setLineupErrs(null);
    setBusy(true);
    try {
      const res = await store.mutate((gg) => playWeek(gg));
      if (!res.ok) { store.toast(res.error ?? 'Could not simulate', 'bad'); return; }
      if (res.report) store.openReport(res.report.fixtureId);
    } finally { setBusy(false); }
  };

  const Screen = { dashboard: DashboardScreen, squad: SquadScreen, tactics: TacticsScreen, fixtures: FixturesScreen, league: LeagueScreen, transfers: TransfersScreen, finances: FinancesScreen, inbox: InboxScreen, club: ClubScreen }[ui.screen];
  const report = ui.reportId ? g!.reports[ui.reportId] : null;

  return (
    <div className="h-full flex bg-bg">
      <nav className="w-[116px] shrink-0 bg-panel border-r border-line flex flex-col">
        <div className="px-2 py-1.5 border-b border-line flex items-center gap-1.5"><Badge club={me} size={22} /><div className="font-extrabold text-[13px]">Touch<span className="text-accent">line</span></div></div>
        <div className="flex-1 scroll-y py-1">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => store.go(n.id)} className={`w-full flex items-center gap-2 px-2.5 h-8 text-[11px] font-semibold text-left border-l-2 ${ui.screen === n.id ? 'bg-accent/15 text-white border-accent' : 'text-slate-400 border-transparent active:bg-panel2'}`}>
              <Icon d={n.icon} /><span className="flex-1">{n.label}</span>
              {n.id === 'inbox' && unread > 0 && <span className="bg-accent text-black text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-11 shrink-0 bg-panel border-b border-line flex items-center gap-3 px-3">
          <div className="min-w-0">
            <div className="font-bold text-[13px] truncate">{me.name}</div>
            <div className="text-[10px] text-slate-400">{done ? 'Season complete' : `Matchday ${g!.meta.week}/38 - ${gameDate(g!, g!.meta.week)}`} - {ordinal(positionOf(g!, me.id))}</div>
          </div>
          <div className="flex-1" />
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isWindowOpen(g!.meta.week) && !done ? 'bg-accent/15 text-accent' : 'bg-white/5 text-slate-500'}`}>{isWindowOpen(g!.meta.week) && !done ? 'Window open' : 'Window closed'}</span>
          {ui.saving && <span className="text-[10px] text-slate-500">saving...</span>}
          {done ? (
            <button className="btn btn-primary" onClick={() => store.go('league')}>Final table</button>
          ) : (
            <button className="btn btn-primary min-h-[34px] px-4 tracking-wide" disabled={busy} onClick={() => sim()}>
              {busy ? 'Simulating...' : `SIMULATE MATCH${opp ? ` - ${next!.home === me.id ? 'vs' : '@'} ${opp.short}` : ''}`}
            </button>
          )}
        </header>
        <main className="flex-1 min-h-0 p-2"><Screen /></main>
      </div>

      {ui.profileId && <PlayerProfile playerId={ui.profileId} onClose={() => store.openProfile(undefined)} />}
      {report && <MatchReportModal report={report} onClose={() => store.openReport(undefined)} />}
      {lineupErrs && (
        <Modal title="Lineup is not valid" onClose={() => setLineupErrs(null)}
          footer={<><button className="btn" onClick={() => { setLineupErrs(null); store.go('tactics'); }}>Open tactics</button><button className="btn btn-primary" onClick={() => sim(true)}>Auto-fix and play</button></>}>
          <ul className="list-disc pl-4 space-y-1 text-bad">{lineupErrs.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  const { ui } = useStore();
  useEffect(() => { store.init(); }, []);
  return (
    <>
      <RotateNotice />
      <Toast />
      {ui.phase === 'loading' && <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>}
      {ui.phase === 'start' && <StartScreen />}
      {ui.phase === 'select' && <ClubSelect />}
      {ui.phase === 'game' && <GameShell />}
    </>
  );
}
