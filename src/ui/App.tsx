import { useEffect, useState, type ReactElement } from 'react';
import { store, useStore, type Screen } from './store';
import { Badge, Modal } from './common';
import { ClubSelect, ProfileScreen, SlotsScreen, StartScreen } from './screens/Start';
import { HomeScreen } from './screens/Home';
import { CalendarScreen } from './screens/Calendar';
import { PlayerProfile, SquadScreen } from './screens/Squad';
import { TacticsScreen } from './screens/Tactics';
import { FixturesScreen, MatchReportModal } from './screens/Fixtures';
import { LeagueScreen } from './screens/League';
import { TransfersScreen } from './screens/Transfers';
import { FinancesScreen } from './screens/Finances';
import { InboxScreen } from './screens/Inbox';
import { ClubScreen } from './screens/ClubInfo';
import { TrainingScreen, MedicalScreen, AcademyScreen } from './screens/Squad2';
import { ScoutingScreen } from './screens/Scouting';
import { CupsScreen, InternationalScreen, NewsScreen, RecordsScreen } from './screens/World';
import { FacilitiesScreen, ManagerScreen, MediaScreen, StadiumScreen, StaffScreen } from './screens/Club3';
import { BoardScreen, HistoryScreen, StatsScreen } from './screens/Club2';
import { advance, nextFixture, playTodayMatches, seasonComplete, userFixtureToday } from '../engine/game';
import { repairLineup, validateLineup } from '../engine/team';
import { autoNationTeam, selectNationSquad, userIntlFixtureToday, validateNationTeam } from '../engine/intl';
import { positionOf } from '../engine/fixtures';
import { fmtDate, fmtDateLong, seasonLabel, windowInfo, dayDiff } from '../engine/calendar';
import { markRead } from '../engine/inbox';
import { nextUnread, unreadCount } from '../engine/messages';
import { isWindowOpen } from '../engine/transfers';
import { jobOffers, ordinal, takeNewJob } from '../engine/board';

interface Group { id: string; label: string; icon: string; tabs: [Screen, string][] }
const GROUPS: Group[] = [
  { id: 'inbox', label: 'Inbox', icon: 'M3 6h18v12H3zM3 7l9 7 9-7', tabs: [['inbox', 'Inbox']] },
  { id: 'home', label: 'Home', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10', tabs: [['home', 'Home']] },
  { id: 'calendar', label: 'Calendar', icon: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4', tabs: [['calendar', 'Calendar']] },
  { id: 'squad', label: 'Squad', icon: 'M16 11a4 4 0 1 0-8 0M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2', tabs: [['squad', 'Players'], ['tactics', 'Tactics'], ['training', 'Training'], ['medical', 'Medical'], ['academy', 'Academy']] },
  { id: 'league', label: 'Leagues', icon: 'M5 20V10M12 20V4M19 20v-7', tabs: [['league', 'League'], ['fixtures', 'Fixtures'], ['cups', 'Cup'], ['stats', 'Stats']] },
  { id: 'world', label: 'World', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', tabs: [['international', 'International'], ['news', 'News'], ['records', 'Records']] },
  { id: 'transfers', label: 'Transfers', icon: 'M4 8h13l-3-3M20 16H7l3 3', tabs: [['transfers', 'Market'], ['scouting', 'Scouting']] },
  { id: 'club', label: 'Club', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', tabs: [['club', 'Overview'], ['board', 'Board'], ['finances', 'Finances'], ['stadium', 'Stadium'], ['facilities', 'Facilities'], ['staff', 'Staff'], ['history', 'History']] },
  { id: 'manager', label: 'Manager', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21l2-6h10l2 6', tabs: [['manager', 'Career'], ['media', 'Media']] },
];
const groupOf = (s: Screen) => GROUPS.find((gr) => gr.tabs.some((t) => t[0] === s)) ?? GROUPS[1];

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

const SCREENS: Record<Screen, () => ReactElement> = {
  inbox: InboxScreen, home: HomeScreen, calendar: CalendarScreen, squad: SquadScreen, tactics: TacticsScreen, training: TrainingScreen, medical: MedicalScreen, academy: AcademyScreen,
  league: LeagueScreen, fixtures: FixturesScreen, stats: StatsScreen, transfers: TransfersScreen, scouting: ScoutingScreen, club: ClubScreen, board: BoardScreen, finances: FinancesScreen, history: HistoryScreen,
  cups: CupsScreen, international: InternationalScreen, news: NewsScreen, records: RecordsScreen, stadium: StadiumScreen, facilities: FacilitiesScreen, staff: StaffScreen, manager: ManagerScreen, media: MediaScreen,
};

function GameShell() {
  const { g, ui } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const [busy, setBusy] = useState(false);
  const [lineupErrs, setLineupErrs] = useState<string[] | null>(null);
  const date = g!.meta.date ?? g!.meta.startDate;
  const today = userFixtureToday(g!);
  const matchToday = !!today && !today.played;
  const intlFx = !matchToday ? userIntlFixtureToday(g!) : undefined;
  const intlToday = !!intlFx && !intlFx.played;
  const intlOpp = intlToday ? g!.intl.nations[intlFx!.home === g!.intl.userNation ? intlFx!.away : intlFx!.home] : null;
  const next = nextFixture(g!);
  const nextMsg = nextUnread(g!);
  const unread = unreadCount(g!);
  const onInbox = ui.screen === 'inbox';
  const sacked = !!g!.meta.sacked;
  const matchFx = matchToday ? today! : null;
  const opp = matchFx ? g!.clubs[matchFx.home === me.id ? matchFx.away : matchFx.home] : null;
  const grp = groupOf(ui.screen);
  const win = windowInfo(date);
  const lg = g!.leagues[me.leagueId ?? 'L1'];

  const simulate = async (autoFix = false) => {
    if (busy) return;
    const nat = g!.intl.userNation ? g!.intl.nations[g!.intl.userNation] : undefined;
    const forNat = !matchToday && intlToday && !!nat;
    if (autoFix) await store.mutate((gg) => { if (forNat) { const n = gg.intl.nations[gg.intl.userNation!]; if (n.squad.length < 14) selectNationSquad(gg, n); autoNationTeam(gg, n); } else repairLineup(gg, gg.clubs[gg.meta.userClubId]); });
    const errs = forNat ? validateNationTeam(g!, g!.intl.nations[g!.intl.userNation!]) : validateLineup(g!, me);
    if (errs.length) { setLineupErrs(errs); return; }
    setLineupErrs(null);
    setBusy(true);
    try {
      const res = await store.mutate((gg) => playTodayMatches(gg));
      if (!res.ok) { store.toast(res.error ?? 'Could not simulate', 'bad'); return; }
      if (res.report) store.openReport(res.report.fixtureId);
    } finally { setBusy(false); }
  };

  const go = async (mode: 'day' | 'days' | 'week' | 'match' | 'event', n = 1) => {
    if (busy) return;
    setBusy(true);
    store.setUi({ advanceMenu: false });
    try {
      const r = await store.mutate((gg) => advance(gg, mode, n));
      if (r.stop === 'season') store.setUi({ newSeason: true });
      else if (r.stop === 'sacked') store.go('board');
      else if (r.stop === 'match') store.toast('Match day');
      else if (r.stop === 'event' && r.reason) store.toast(r.reason);
    } finally { setBusy(false); }
  };

  const nextMessage = async () => {
    if (!nextMsg) return;
    store.selectMessage(nextMsg.id);
    await store.mutate((gg) => markRead(gg, nextMsg.id));
  };

  // Primary button: on the Inbox it reads the next unread message; otherwise it plays or advances time.
  let primary: { label: string; onClick: () => void; kind?: string };
  if (sacked) primary = { label: 'DISMISSED', onClick: () => store.go('board') };
  else if (onInbox && nextMsg) primary = { label: `NEXT MESSAGE (${unread})`, onClick: nextMessage };
  else if (intlToday && !matchToday) primary = { label: `INTERNATIONAL - vs ${intlOpp!.code}`, onClick: () => simulate() };
  else if (matchToday) primary = { label: `SIMULATE MATCH - ${matchFx!.home === me.id ? 'vs' : '@'} ${opp!.short}`, onClick: () => simulate() };
  else primary = { label: 'CONTINUE', onClick: () => go('event') };

  const Screen = SCREENS[ui.screen];
  const report = ui.reportId ? g!.reports[ui.reportId] : null;
  const toMatch = next?.date !== undefined ? dayDiff(date, next.date) : null;

  return (
    <div className="h-full flex bg-bg">
      <nav className="w-[112px] shrink-0 bg-panel border-r border-line flex flex-col">
        <div className="px-2 py-1.5 border-b border-line flex items-center gap-1.5"><Badge club={me} size={22} /><div className="font-extrabold text-[13px]">Touch<span className="text-accent">line</span></div></div>
        <div className="flex-1 scroll-y py-1">
          {GROUPS.map((n) => (
            <button key={n.id} onClick={() => store.go(n.tabs[0][0])} className={`w-full flex items-center gap-2 px-2.5 h-8 text-[11px] font-semibold text-left border-l-2 ${grp.id === n.id ? 'bg-accent/15 text-white border-accent' : 'text-slate-400 border-transparent active:bg-panel2'}`}>
              <Icon d={n.icon} /><span className="flex-1 truncate">{n.label}</span>
              {n.id === 'inbox' && unread > 0 && <span className="bg-accent text-black text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-11 shrink-0 bg-panel border-b border-line flex items-center gap-2 px-3">
          <div className="min-w-0">
            <div className="font-bold text-[13px] truncate">{fmtDateLong(date)}</div>
            <div className="text-[10px] text-slate-400 truncate">{me.short} - {ordinal(positionOf(g!, me.id))} in {lg.short} - {seasonLabel(g!.meta.season)}{!matchToday && toMatch !== null && !seasonComplete(g!) ? ` - next match in ${toMatch}d` : ''}</div>
          </div>
          <div className="flex-1" />
          <span className={`text-[10px] px-1.5 py-0.5 rounded hidden sm:inline ${win.open ? 'bg-accent/15 text-accent' : 'bg-white/5 text-slate-500'}`}>{win.open ? `Window - ${fmtDate(win.closesOn!).slice(0, -5)}` : 'Window closed'}</span>
          {ui.saving && <span className="text-[10px] text-slate-500">saving...</span>}
          <div className="relative flex">
            <button className="btn btn-primary min-h-[34px] px-3 tracking-wide rounded-r-none" disabled={busy} onClick={primary.onClick}>{busy ? 'Working...' : primary.label}</button>
            <button className="btn btn-primary min-h-[34px] px-2 rounded-l-none border-l border-black/30" disabled={busy || sacked} aria-label="More time options" onClick={() => store.setUi({ advanceMenu: !ui.advanceMenu })}>▾</button>
            {ui.advanceMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 panel bg-panel2 w-44 py-1 shadow-xl fade-in">
                {[
                  { l: 'Continue (to next event)', f: () => go('event'), off: matchToday },
                  { l: 'Advance 1 day', f: () => go('day'), off: matchToday || intlToday },
                  { l: 'Advance 3 days', f: () => go('days', 3), off: matchToday },
                  { l: 'Advance 1 week', f: () => go('week'), off: matchToday },
                  { l: 'Advance to next match', f: () => go('match'), off: matchToday || !next },
                  { l: 'Read next message', f: nextMessage, off: !nextMsg },
                ].map((o) => <button key={o.l} disabled={o.off} className="w-full text-left px-3 py-1.5 text-[11px] disabled:opacity-40 active:bg-panel" onClick={o.f}>{o.l}</button>)}
              </div>
            )}
          </div>
        </header>
        {grp.tabs.length > 1 && (
          <div className="shrink-0 flex gap-1 px-2 pt-1.5">
            {grp.tabs.map(([id, label]) => <button key={id} className={`btn btn-sm ${ui.screen === id ? 'btn-primary' : ''}`} onClick={() => store.go(id)}>{label}</button>)}
          </div>
        )}
        <main className="flex-1 min-h-0 p-2" onClick={() => ui.advanceMenu && store.setUi({ advanceMenu: false })}><Screen /></main>
      </div>

      {ui.profileId && <PlayerProfile playerId={ui.profileId} onClose={() => store.openProfile(undefined)} />}
      {report && <MatchReportModal report={report} onClose={() => store.openReport(undefined)} />}
      {lineupErrs && (
        <Modal title="Lineup is not valid" onClose={() => setLineupErrs(null)}
          footer={<><button className="btn" onClick={() => { setLineupErrs(null); store.setUi({ tacticsFor: intlToday && !matchToday ? 'nation' : 'club' }); store.go('tactics'); }}>Open tactics</button><button className="btn btn-primary" onClick={() => simulate(true)}>Auto-fix and play</button></>}>
          <ul className="list-disc pl-4 space-y-1 text-bad">{lineupErrs.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Modal>
      )}
      {ui.newSeason && (
        <Modal title={`Welcome to ${seasonLabel(g!.meta.season)}`} onClose={() => store.setUi({ newSeason: false })}
          footer={<><button className="btn" onClick={() => { store.setUi({ newSeason: false }); store.go('history'); }}>Season review</button><button className="btn btn-primary" onClick={() => { store.setUi({ newSeason: false }); store.go('inbox'); }}>Open inbox</button></>}>
          <div className="text-xs space-y-1.5"><p>The new season has begun. Contracts have expired, players have aged, promotion and relegation are settled and new fixtures are out.</p><p>You are in the <b>{lg.name}</b>. Check your inbox for the season review and the new board objectives.</p></div>
        </Modal>
      )}
      {sacked && <SackedDialog />}
    </div>
  );
}

function SackedDialog() {
  const { g } = useStore();
  const offers = jobOffers(g!);
  return (
    <Modal title="You have been dismissed" onClose={() => store.go('board')} wide
      footer={<button className="btn btn-danger" onClick={() => store.quitToMenu()}>Quit to menu</button>}>
      <p className="text-xs mb-2">The board has lost faith in your management. Your career is not over: these clubs are willing to give you a job.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {offers.map((id) => { const c = g!.clubs[id]; const l = g!.leagues[c.leagueId ?? 'L1']; return (
          <button key={id} className="panel p-2 flex items-center gap-2 text-left active:bg-panel2" onClick={() => store.mutate((gg) => takeNewJob(gg, id)).then(() => store.go('inbox'))}>
            <Badge club={c} size={30} /><div className="min-w-0"><div className="font-semibold truncate">{c.name}</div><div className="text-[10px] text-slate-400">{l.name} - reputation {c.reputation}</div></div>
          </button>
        ); })}
      </div>
    </Modal>
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
      {ui.phase === 'slots' && <SlotsScreen />}
      {ui.phase === 'profile' && <ProfileScreen />}
      {ui.phase === 'select' && <ClubSelect />}
      {ui.phase === 'game' && <GameShell />}
    </>
  );
}
void isWindowOpen;
