import { useMemo, useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Bar, Empty, Ovr, Panel, PosTag, Stat, statusOf } from '../common';
import { currentCup, cupProgress, CUP_NAME } from '../../engine/cups';
import { nationRanking, nationAvailable, selectNationSquad, autoNationTeam, setNationSquad, STAGE_LABEL, tournamentGroupTable, validateNationTeam, nationSummary } from '../../engine/intl';
import { acceptNationJob } from '../../engine/mgr';
import { fmtDate, fmtDateShort, seasonLabel } from '../../engine/calendar';
import { fmtMoney } from '../../engine/valuation';
import { computeTable } from '../../engine/fixtures';
import type { NewsCat } from '../../engine/types3';

const Tabs = ({ id, tabs, def }: { id: string; tabs: [string, string][]; def: string }) => {
  const { ui } = useStore();
  const cur = ui.tab?.[id] ?? def;
  return <div className="flex gap-1 shrink-0 mb-1.5">{tabs.map(([k, l]) => <button key={k} className={`btn btn-sm ${cur === k ? 'btn-primary' : ''}`} onClick={() => store.setUi({ tab: { ...(ui.tab ?? {}), [id]: k } })}>{l}</button>)}</div>;
};
const useTab = (id: string, def: string) => { const { ui } = useStore(); return ui.tab?.[id] ?? def; };

// ---------- Domestic cup ----------
export function CupsScreen() {
  const { g } = useStore();
  const me = g!.clubs[g!.meta.userClubId];
  const cup = currentCup(g!);
  const [round, setRound] = useState<number | null>(null);
  if (!cup) return <Empty>No cup competition this season.</Empty>;
  const prog = cupProgress(g!, me.id);
  const cur = round ?? Math.max(0, cup.rounds.findIndex((r) => !r.done) === -1 ? cup.rounds.length - 1 : cup.rounds.findIndex((r) => !r.done));
  const fx = g!.fixtures.filter((f) => f.cupId === cup.id && f.round === cur).sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const r = cup.rounds[cur];
  return (
    <div className="h-full flex gap-2 fade-in">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Panel>
          <div className="grid grid-cols-4">
            <Stat label="Competition" value={CUP_NAME} sub={seasonLabel(cup.season)} />
            <Stat label="Your status" value={prog.status === 'won' ? 'Winners' : prog.status === 'out' ? 'Eliminated' : prog.status === 'in' ? 'Still in' : 'Not entered'} tone={prog.status === 'in' || prog.status === 'won' ? 'good' : 'bad'} sub={prog.text} />
            <Stat label="Clubs left" value={cup.winner ? 1 : cup.alive.length} />
            <Stat label="Winner prize" value={fmtMoney(cup.prize[cup.prize.length - 1] ?? 0)} sub={cup.winner ? `Won by ${g!.clubs[cup.winner].short}` : ''} />
          </div>
        </Panel>
        <div className="flex gap-1 shrink-0 flex-wrap">{cup.rounds.map((x, i) => <button key={i} className={`btn btn-sm ${cur === i ? 'btn-primary' : ''}`} onClick={() => setRound(i)}>{x.name}{x.done ? ' ✓' : ''}</button>)}</div>
        <Panel className="flex-1" title={`${r.name} - ${fmtDate(r.date)}${r.drawn ? '' : ' (not drawn yet)'}`}>
          <div className="scroll-y h-full">
            {!r.drawn && <Empty>The draw is made three days before the round. {cur === 0 ? '' : 'Winners of the previous round advance.'}</Empty>}
            {fx.map((f) => {
              const h = g!.clubs[f.home], a = g!.clubs[f.away]; const mine = f.home === me.id || f.away === me.id;
              return (
                <button key={f.id} className={`w-full flex items-center gap-2 px-2 py-1 border-b border-line/40 text-left ${mine ? 'bg-accent/10' : ''}`} onClick={() => g!.reports[f.id] && store.openReport(f.id)}>
                  <span className="w-12 text-[10px] text-slate-400">{fmtDateShort(f.date!)}</span>
                  <span className="flex-1 flex items-center gap-1 justify-end truncate">{h.short}<Badge club={h} size={14} /></span>
                  <b className="w-16 text-center">{f.played ? `${f.hg}-${f.ag}` : 'v'}</b>
                  <span className="flex-1 flex items-center gap-1 truncate"><Badge club={a} size={14} />{a.short}</span>
                  <span className="w-20 text-[10px] text-slate-400 text-right">{f.played && f.pens ? `pens ${f.pens[0]}-${f.pens[1]}` : f.played && f.et ? 'a.e.t.' : ''}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
      <Panel className="w-[28%] min-w-[170px]" title="Previous winners">
        <div className="scroll-y h-full">
          {(g!.history.cups ?? []).slice().reverse().map((c) => <div key={c.season} className="px-2 py-1 border-b border-line/40 text-[11px]"><div className="font-semibold">{seasonLabel(c.season)} - {c.winner}</div><div className="text-slate-400">beat {c.runnerUp} {c.score}</div></div>)}
          {!(g!.history.cups ?? []).length && <Empty>No finals played yet.</Empty>}
        </div>
      </Panel>
    </div>
  );
}

// ---------- International ----------
export function InternationalScreen() {
  const { g } = useStore();
  const intl = g!.intl;
  const tab = useTab('intl', intl.userNation ? 'team' : 'rank');
  const un = intl.userNation ? intl.nations[intl.userNation] : undefined;
  const tabs: [string, string][] = [...(un ? [['team', 'My nation'] as [string, string]] : []), ['rank', 'Rankings'], ['comp', 'Tournament'], ['fix', 'Fixtures'], ['hist', 'Honours']];
  return (
    <div className="h-full flex flex-col fade-in">
      <Tabs id="intl" tabs={tabs} def={intl.userNation ? 'team' : 'rank'} />
      <div className="flex-1 min-h-0">
        {tab === 'team' && un && <NationTeam />}
        {tab === 'rank' && <Rankings />}
        {tab === 'comp' && <Competition />}
        {tab === 'fix' && <IntlFixtures />}
        {tab === 'hist' && <IntlHonours />}
      </div>
    </div>
  );
}

function Rankings() {
  const { g } = useStore();
  const list = nationRanking(g!);
  const mgr = g!.career;
  return (
    <div className="h-full flex gap-2">
      <Panel className="flex-1" title="World ranking">
        <div className="scroll-y h-full"><table className="w-full"><thead><tr><th className="th w-6">#</th><th className="th">Nation</th><th className="th">Manager</th><th className="th text-right">W-D-L</th><th className="th text-right">Pts</th></tr></thead><tbody>
          {list.map((n) => <tr key={n.id} className={`border-t border-line/40 ${n.userManaged ? 'bg-accent/15 font-bold' : ''}`}><td className="td">{n.rank}</td><td className="td">{n.name}</td><td className="td text-slate-400">{n.userManaged ? mgr.name : n.managerName}</td><td className="td text-right">{n.w}-{n.d}-{n.l}</td><td className="td text-right">{Math.round(n.pts)}</td></tr>)}
        </tbody></table></div>
      </Panel>
      <Panel className="w-[30%] min-w-[180px]" title="National jobs">
        <div className="p-2 text-[11px] space-y-1.5">
          <div>Your international reputation: <b>{Math.round(mgr.intlRep)}</b></div>
          {g!.intl.userNation ? <div>You manage <b>{g!.intl.nations[g!.intl.userNation].name}</b>.</div> : <div className="text-slate-400">You do not manage a national team. Vacancies appear in your Manager screen when a nation is looking for a coach.</div>}
          <button className="btn btn-sm" onClick={() => store.go('manager')}>Manager career</button>
        </div>
      </Panel>
    </div>
  );
}

function NationTeam() {
  const { g } = useStore();
  const n = g!.intl.nations[g!.intl.userNation!];
  const pool = useMemo(() => nationAvailable(g!, n.id), [g, n.id, n.squad.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = Object.values(g!.players).filter((p) => p.nat === n.name && p.clubId && !p.academy).sort((a, b) => b.ovr - a.ovr);
  const errs = validateNationTeam(g!, n);
  const { next, last } = nationSummary(g!, n.id);
  const toggle = (pid: string) => store.mutate(() => {
    const has = n.squad.includes(pid);
    const r = setNationSquad(g!, n, has ? n.squad.filter((x) => x !== pid) : [...n.squad, pid]);
    if (!r.ok) store.toast(r.error!, 'bad');
  });
  return (
    <div className="h-full flex gap-2">
      <div className="w-[34%] min-w-[200px] flex flex-col gap-2">
        <Panel title={n.name}>
          <div className="p-2 text-[11px] space-y-1">
            <div>World rank <b>{n.rank}</b> - {Math.round(n.pts)} pts</div>
            <div>Squad {n.squad.length}/26 - eligible pool {all.length}</div>
            <div>Record this season {n.w}-{n.d}-{n.l}</div>
            <div>Honours: {n.titles.world} World Cup, {n.titles.continental} Continental</div>
            {next && <div className="text-accent2">Next: {g!.intl.nations[next.home === n.id ? next.away : next.home]?.name} ({next.comp}), {fmtDateShort(next.date)}</div>}
            {last && <div className="text-slate-400">Last: {g!.intl.nations[last.home].code} {last.hg}-{last.ag} {g!.intl.nations[last.away].code}</div>}
          </div>
        </Panel>
        <div className="flex gap-1 flex-wrap">
          <button className="btn btn-sm" onClick={() => store.mutate(() => { selectNationSquad(g!, n); autoNationTeam(g!, n); })}>Auto call-ups</button>
          <button className="btn btn-sm" onClick={() => { store.setUi({ tacticsFor: 'nation' }); store.go('tactics'); }}>Tactics and XI</button>
        </div>
        {errs.length > 0 ? <div className="border border-bad/60 bg-bad/10 rounded px-2 py-1 text-[11px] text-bad">{errs.slice(0, 3).join(' ')}</div> : <div className="text-[11px] text-accent">Lineup is valid.</div>}
        <div className="text-[10px] text-slate-500">Call-ups are made from players of your nationality at any club. Clubs release them for internationals; they return a day after the match.</div>
      </div>
      <Panel className="flex-1" title="Eligible players - tap to call up / drop">
        <div className="scroll-y h-full"><table className="w-full"><tbody>
          {all.map((p) => { const st = statusOf(p); const ing = n.squad.includes(p.id); return (
            <tr key={p.id} className={`border-t border-line/40 active:bg-panel2 ${st ? 'opacity-60' : ''}`} onClick={() => toggle(p.id)}>
              <td className="td"><PosTag pos={p.pos} /></td><td className="td font-semibold">{p.name}</td><td className="td"><Ovr v={p.ovr} /></td>
              <td className="td text-slate-400">{g!.clubs[p.clubId!]?.short}</td><td className="td text-slate-400">{p.intl?.caps ?? 0} caps</td>
              <td className="td text-right">{st ? <span style={{ color: st.color }}>{st.text}</span> : ing ? <span className="text-accent font-semibold">CALLED UP</span> : ''}</td>
            </tr>); })}
        </tbody></table>{pool.length === 0 && <Empty>No eligible players.</Empty>}</div>
      </Panel>
    </div>
  );
}

function Competition() {
  const { g } = useStore();
  const intl = g!.intl;
  const t = intl.tournaments[0];
  const q = intl.qual;
  const nm = (id: string) => intl.nations[id]?.name ?? id;
  return (
    <div className="h-full flex gap-2">
      {q && !q.done && (
        <Panel className="flex-1" title={`Qualification - ${q.kind === 'world' ? 'World Cup' : 'Continental Championship'} ${q.year}`}>
          <div className="scroll-y h-full"><table className="w-full"><thead><tr><th className="th">Nation</th><th className="th text-right">P</th><th className="th text-right">W</th><th className="th text-right">D</th><th className="th text-right">L</th><th className="th text-right">Pts</th></tr></thead><tbody>
            {Object.entries(q.table).sort((a, b) => b[1].pts - a[1].pts || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga)).map(([id, r], i) => <tr key={id} className={`border-t border-line/40 ${id === intl.userNation ? 'bg-accent/15 font-bold' : ''} ${i === 11 ? 'border-b-2 border-b-bad/60' : ''}`}><td className="td">{i + 1}. {nm(id)}</td><td className="td text-right">{r.p}</td><td className="td text-right">{r.w}</td><td className="td text-right">{r.d}</td><td className="td text-right">{r.l}</td><td className="td text-right">{r.pts}</td></tr>)}
          </tbody></table><div className="p-2 text-[10px] text-slate-500">The top 12 of 14 nations qualify.</div></div>
        </Panel>
      )}
      {t ? (
        <Panel className="flex-1" title={`${t.name} ${t.year} - ${t.stage === 'done' ? 'finished' : t.stage}`}>
          <div className="scroll-y h-full p-1.5 grid grid-cols-3 gap-1.5">
            {t.groups.map((gr) => (
              <div key={gr.name} className="border border-line/60 rounded">
                <div className="text-[10px] font-bold px-1.5 py-0.5 bg-panel2">{gr.name}</div>
                <table className="w-full"><tbody>{tournamentGroupTable(g!, t, gr.name).map((r, i) => <tr key={r.id} className={`border-t border-line/30 ${r.id === intl.userNation ? 'bg-accent/15 font-bold' : ''}`}><td className="td">{i + 1}</td><td className="td">{intl.nations[r.id].code}</td><td className="td text-right">{r.p}</td><td className="td text-right">{r.gf - r.ga}</td><td className="td text-right">{r.pts}</td></tr>)}</tbody></table>
              </div>))}
            <div className="col-span-3 text-[11px] space-y-0.5">
              {intl.fixtures.filter((f) => f.compId === t.id && !/Group/.test(f.stage)).map((f) => <div key={f.id}>{f.stage}: {nm(f.home)} {f.played ? `${f.hg}-${f.ag}${f.pens ? ` (${f.pens[0]}-${f.pens[1]}p)` : f.et ? ' aet' : ''}` : 'v'} {nm(f.away)} <span className="text-slate-500">{fmtDateShort(f.date)}</span></div>)}
              {t.winner && <div className="text-accent font-bold pt-1">Champions: {nm(t.winner)}</div>}
              {Object.values(t.scorers).sort((a, b) => b.goals - a.goals).slice(0, 5).map((s) => <div key={s.name} className="text-slate-400">{s.name} ({s.nat}) {s.goals}</div>)}
            </div>
          </div>
        </Panel>
      ) : !q || q.done ? <Panel className="flex-1" title="Competition"><Empty>No major tournament or qualification this season. Friendlies are played on international dates.</Empty></Panel> : null}
    </div>
  );
}

function IntlFixtures() {
  const { g } = useStore();
  const intl = g!.intl;
  const mine = intl.userNation;
  const list = intl.fixtures.filter((f) => !mine || f.home === mine || f.away === mine).sort((a, b) => a.date - b.date);
  const shown = (mine ? list : intl.fixtures.slice().sort((a, b) => a.date - b.date)).slice(-60);
  return (
    <Panel className="h-full" title={mine ? `${intl.nations[mine].name} fixtures` : 'All international fixtures (latest)'}>
      <div className="scroll-y h-full">{shown.map((f) => (
        <div key={f.id} className="flex items-center gap-2 px-2 py-1 border-b border-line/40 text-[11px]">
          <span className="w-14 text-slate-400">{fmtDateShort(f.date)}</span><span className="w-20 text-[10px] text-accent2 capitalize">{f.comp === 'qual' ? 'Qualifier' : f.comp === 'world' ? 'World Cup' : f.comp === 'continental' ? 'Continental' : 'Friendly'}</span>
          <span className="flex-1 text-right truncate">{intl.nations[f.home].name}</span><b className="w-14 text-center">{f.played ? `${f.hg}-${f.ag}` : 'v'}</b><span className="flex-1 truncate">{intl.nations[f.away].name}</span>
          <span className="w-16 text-[10px] text-slate-500 truncate">{f.stage}</span>
        </div>))}{shown.length === 0 && <Empty>No fixtures scheduled.</Empty>}</div>
    </Panel>
  );
}

function IntlHonours() {
  const { g } = useStore();
  const recs = g!.intl.records.slice().reverse();
  return (
    <Panel className="h-full" title="International honours">
      <div className="scroll-y h-full">{recs.map((r, i) => <div key={i} className="px-2 py-1 border-b border-line/40 text-[11px]"><b>{r.name} {r.year}</b>: {r.winner} <span className="text-slate-400">beat {r.runnerUp}{r.topScorer ? ` - top scorer ${r.topScorer.name} (${r.topScorer.goals})` : ''}</span></div>)}
        {!recs.length && <Empty>No tournament has been completed yet. {STAGE_LABEL[0]}</Empty>}</div>
    </Panel>
  );
}
void acceptNationJob;

// ---------- News ----------
const NEWS_CAT: Record<NewsCat, string> = { league: 'rgb(var(--accent))', transfer: 'rgb(var(--info))', manager: 'rgb(var(--warn))', injury: 'rgb(var(--bad))', development: '#a78bfa', finance: '#14b8a6', competition: 'rgb(var(--mid))', intl: '#06b6d4', record: '#ec4899', media: '#94a3b8', club: '#cbd5e1' };
export function NewsScreen() {
  const { g } = useStore();
  const [cat, setCat] = useState<NewsCat | 'all' | 'mine'>('all');
  const me = g!.meta.userClubId;
  const items = g!.news.filter((n) => cat === 'all' ? true : cat === 'mine' ? n.clubId === me : n.cat === cat).slice().reverse().slice(0, 120);
  const cats: (NewsCat | 'all' | 'mine')[] = ['all', 'mine', 'league', 'transfer', 'manager', 'injury', 'finance', 'competition', 'intl', 'record', 'media'];
  return (
    <div className="h-full flex flex-col gap-1.5 fade-in">
      <div className="flex gap-1 flex-wrap shrink-0">{cats.map((c) => <button key={c} className={`btn btn-sm capitalize ${cat === c ? 'btn-primary' : ''}`} onClick={() => setCat(c)}>{c === 'mine' ? 'My club' : c}</button>)}</div>
      <Panel className="flex-1" title="World news">
        <div className="scroll-y h-full">
          {items.map((n) => (
            <div key={n.id} className="px-2 py-1 border-b border-line/40 flex gap-2 items-start">
              <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: NEWS_CAT[n.cat] }} /><span className="w-12 shrink-0 text-[10px] text-slate-400">{fmtDateShort(n.date)}</span>
              <div className="min-w-0"><div className={`${n.imp ? 'font-bold' : ''}`}>{n.headline}</div>{n.body && <div className="text-[10px] text-slate-400">{n.body}</div>}</div>
            </div>))}
          {!items.length && <Empty>Nothing to report.</Empty>}
        </div>
      </Panel>
    </div>
  );
}

// ---------- Records ----------
export function RecordsScreen() {
  const { g } = useStore();
  const h = g!.history;
  const tab = useTab('rec', 'champ');
  const l1 = (s: (typeof h.seasons)[number]) => s.leagues.find((l) => l.leagueId === 'L1');
  const table = useMemo(() => computeTable(g!, 'L1'), [g]); // eslint-disable-line react-hooks/exhaustive-deps
  void table;
  return (
    <div className="h-full flex flex-col fade-in">
      <Tabs id="rec" def="champ" tabs={[['champ', 'Champions'], ['players', 'Players'], ['club', 'Club and transfers'], ['mgr', 'Managers']]} />
      <div className="flex-1 min-h-0 flex gap-2">
        {tab === 'champ' && (<>
          <Panel className="flex-1" title="League champions and awards"><div className="scroll-y h-full">{h.seasons.slice().reverse().map((s) => { const L = l1(s); const champ = L?.table[0]; return (
            <div key={s.season} className="px-2 py-1 border-b border-line/40 text-[11px]"><b>{seasonLabel(s.season)}</b> {champ ? g!.clubs[champ.clubId]?.name : '-'} <span className="text-slate-400">({champ?.points} pts)</span>
              <div className="text-slate-400">{s.awards.map((a) => `${a.award}: ${a.name}`).join(' - ')}</div></div>); })}{!h.seasons.length && <Empty>History begins when the first season ends.</Empty>}</div></Panel>
          <Panel className="w-[34%] min-w-[180px]" title="Cup winners"><div className="scroll-y h-full">{(h.cups ?? []).slice().reverse().map((c) => <div key={c.season} className="px-2 py-1 border-b border-line/40 text-[11px]"><b>{seasonLabel(c.season)}</b> {c.winner}<div className="text-slate-400">{c.score} v {c.runnerUp}</div></div>)}{g!.intl.records.slice().reverse().map((r, i) => <div key={i} className="px-2 py-1 border-b border-line/40 text-[11px]"><b>{r.name} {r.year}</b> {r.winner}</div>)}</div></Panel>
        </>)}
        {tab === 'players' && (<>
          <Panel className="flex-1" title="All-time league top scorers"><div className="scroll-y h-full"><table className="w-full"><tbody>{(h.scorers ?? []).map((s, i) => <tr key={s.playerId} className="border-t border-line/40"><td className="td w-6">{i + 1}</td><td className="td font-semibold">{s.name}</td><td className="td text-slate-400">{s.clubs.join(', ')}</td><td className="td text-right">{s.apps} apps</td><td className="td text-right font-bold">{s.goals}</td></tr>)}</tbody></table>{!(h.scorers ?? []).length && <Empty>No goals recorded yet.</Empty>}</div></Panel>
          <Panel className="w-[38%] min-w-[200px]" title="Records"><div className="scroll-y h-full">{(h.records ?? []).map((r) => <div key={r.id} className="px-2 py-1 border-b border-line/40 text-[11px]"><div className="text-slate-400">{r.label}</div><b>{r.value}</b> - {r.holder} <span className="text-slate-500">({seasonLabel(r.season)})</span></div>)}</div></Panel>
        </>)}
        {tab === 'club' && (<>
          <Panel className="flex-1" title="Record transfer fees"><div className="scroll-y h-full">{(h.transferRecords ?? []).map((t, i) => <div key={i} className="px-2 py-1 border-b border-line/40 text-[11px] flex justify-between"><span><b>{t.player}</b> {t.from} to {t.to} <span className="text-slate-500">({seasonLabel(t.season)})</span></span><b>{fmtMoney(t.fee)}</b></div>)}{!(h.transferRecords ?? []).length && <Empty>No big transfers yet.</Empty>}</div></Panel>
          <Panel className="w-[38%] min-w-[200px]" title="Your club"><div className="p-2 text-[11px] space-y-1">{(() => { const r = h.clubs[g!.meta.userClubId]; return r ? (<><div>Titles: {r.titles.length ? r.titles.map(seasonLabel).join(', ') : 'none'}</div>{r.biggestWin && <div>Biggest win {r.biggestWin.score} v {r.biggestWin.opp} ({seasonLabel(r.biggestWin.season)})</div>}{r.heaviestDefeat && <div>Heaviest defeat {r.heaviestDefeat.score} v {r.heaviestDefeat.opp}</div>}{r.highestPoints && <div>Most points {r.highestPoints.points} ({seasonLabel(r.highestPoints.season)})</div>}{r.topScorerAllTime && <div>Top scorer {r.topScorerAllTime.name} ({r.topScorerAllTime.goals})</div>}</>) : <Empty>Nothing recorded yet.</Empty>; })()}</div></Panel>
        </>)}
        {tab === 'mgr' && (
          <Panel className="flex-1" title="Most successful managers"><div className="scroll-y h-full"><table className="w-full"><tbody>{(h.managerRecords ?? []).map((m, i) => <tr key={m.name} className="border-t border-line/40"><td className="td w-6">{i + 1}</td><td className="td font-semibold">{m.name}</td><td className="td text-slate-400">{g!.clubs[m.clubId]?.short}</td><td className="td text-right">{m.wins}/{m.matches}</td><td className="td text-right font-bold">{m.titles} titles</td></tr>)}</tbody></table>{!(h.managerRecords ?? []).length && <Empty>No champions yet.</Empty>}</div></Panel>
        )}
      </div>
    </div>
  );
}
void Bar; void acceptNationJob; void seasonLabel;
