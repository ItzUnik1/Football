import { useMemo, useRef, useState } from 'react';
import { store, useStore } from '../store';
import { Badge, Modal, Panel } from '../common';
import { exportSlot, getSlot, importSlot, SLOT_COUNT, validateSaveFile, type SaveFile } from '../../db/database';
import { deliverFile, exitApp, isNative, packText, pickFile, readPickedFile } from '../files';
import { applySettings, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../settings';
import { quickSim, type QuickTarget } from '../../engine/quicksim';
import { gameNow } from '../../engine/messages';
import { DAY, fmtDate, fmtDateLong, seasonStart } from '../../engine/calendar';
import type { Club } from '../../engine/types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'save';

// ---------------------------------------------------------------- settings
export function SettingsModal() {
  const [s, setS] = useState<Settings>(() => loadSettings());
  const set = (p: Partial<Settings>) => { const n = { ...s, ...p }; setS(n); saveSettings(n); applySettings(n); };
  const Seg = <T extends string>({ value, opts, on }: { value: T; opts: [T, string][]; on: (v: T) => void }) => (
    <div className="flex gap-1">{opts.map(([v, l]) => <button key={v} className={`btn btn-sm ${value === v ? 'btn-primary' : ''}`} onClick={() => on(v)}>{l}</button>)}</div>
  );
  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0"><div className="min-w-0"><div className="font-semibold">{label}</div>{hint && <div className="text-[10px] text-slate-400">{hint}</div>}</div>{children}</div>
  );
  return (
    <Modal title="Settings" onClose={() => store.setUi({ modal: undefined })} footer={<button className="btn" onClick={() => { setS({ ...DEFAULT_SETTINGS }); saveSettings(DEFAULT_SETTINGS); applySettings(DEFAULT_SETTINGS); }}>Reset to defaults</button>}>
      <Row label="Text size" hint="Scales the whole interface"><Seg value={s.text} on={(v) => set({ text: v })} opts={[['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']]} /></Row>
      <Row label="Theme"><Seg value={s.theme} on={(v) => set({ theme: v })} opts={[['dark', 'Dark'], ['light', 'Light']]} /></Row>
      <Row label="Colour-blind friendly colours" hint="Blue / orange instead of green / red for good and bad"><Seg value={s.colorblind ? 'on' : 'off'} on={(v) => set({ colorblind: v === 'on' })} opts={[['off', 'Off'], ['on', 'On']]} /></Row>
      <Row label="Reduce motion" hint="Turns off interface transitions"><Seg value={s.reduceMotion ? 'on' : 'off'} on={(v) => set({ reduceMotion: v === 'on' })} opts={[['off', 'Off'], ['on', 'On']]} /></Row>
      <div className="text-[10px] text-slate-500 mt-2">Settings belong to this device, not to a career.</div>
    </Modal>
  );
}

// ---------------------------------------------------------------- backup helpers
export async function exportSlotFile(n: number): Promise<void> {
  try {
    const data = await exportSlot(n);
    const club = data.clubs.find((c) => c.id === data.meta.userClubId);
    const { bytes } = await packText(JSON.stringify(data));
    const how = await deliverFile(`touchline-${slug(club?.name ?? 'career')}-${data.meta.season}.tlsave`, bytes);
    store.toast(how === 'shared' ? 'Save file ready to send or store' : 'Save file downloaded');
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/cancel|abort|dismiss/i.test(msg)) return;
    store.toast(`Export failed: ${msg || 'unknown error'}`, 'bad');
  }
}

/** Must be called straight from a click so the file chooser is allowed to open. */
export async function importIntoSlot(n: number): Promise<boolean> {
  const f = await pickFile();
  if (!f) return false;
  try {
    const data = (await readPickedFile(f)) as SaveFile;
    const err = validateSaveFile(data);
    if (err) { store.toast(err, 'bad'); return false; }
    await importSlot(n, data);
    await store.refreshSlots();
    store.toast(`Imported into slot ${n}`);
    return true;
  } catch (e) { store.toast((e as Error).message || 'Import failed', 'bad'); return false; }
}

export function ImportModal() {
  const { ui } = useStore();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Import a save file" onClose={() => store.setUi({ modal: undefined })}>
      <div className="text-xs text-slate-400 mb-2">Choose the slot to import into. A used slot is replaced.</div>
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).map((n) => {
          const sl = ui.slots.find((x) => x.slot === n);
          return (
            <button key={n} disabled={busy} className="panel p-2 text-left flex items-center gap-2 active:bg-panel2" onClick={async () => { setBusy(true); const ok = await importIntoSlot(n); setBusy(false); if (ok) store.setUi({ modal: undefined }); }}>
              <span className="w-7 h-7 rounded bg-panel2 flex items-center justify-center font-extrabold text-accent shrink-0">{n}</span>
              <span className="min-w-0 text-[11px]">{sl?.used ? <><b className="block truncate">{sl.club}</b><span className="text-bad">Will be replaced</span></> : <span className="text-slate-400">Empty</span>}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- game menu (Save & Close lives here)
export function GameMenu() {
  const { g, ui } = useStore();
  const [busy, setBusy] = useState(false);
  const club = g!.clubs[g!.meta.userClubId];
  const act = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } finally { setBusy(false); } };
  const exit = async () => {
    if (!(await store.saveNow())) { store.toast('Save failed - storage unavailable', 'bad'); return; }
    if (isNative()) await exitApp();
    else { store.toast('Saved. You can close this tab now.'); store.setUi({ modal: undefined }); }
  };
  return (
    <Modal title={`Menu - slot ${getSlot()}`} onClose={() => store.setUi({ modal: undefined })}>
      <div className="flex items-center gap-2 mb-3"><Badge club={club} size={32} /><div className="min-w-0"><div className="font-bold truncate">{club.name}</div><div className="text-[10px] text-slate-400">{fmtDateLong(gameNow(g!))} - progress is saved automatically after every action</div></div></div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn min-h-[38px]" disabled={busy} onClick={() => act(async () => { const ok = await store.saveNow(); store.toast(ok ? 'Game saved' : 'Save failed', ok ? 'ok' : 'bad'); })}>Save game</button>
        <button className="btn btn-primary min-h-[38px]" disabled={busy} onClick={() => act(() => store.saveAndQuit())}>Save and quit to menu</button>
        <button className="btn btn-primary min-h-[38px]" disabled={busy} onClick={() => act(exit)}>{isNative() ? 'Save and close the game' : 'Save and finish'}</button>
        <button className="btn min-h-[38px]" disabled={busy} onClick={() => act(async () => { if (await store.saveNow()) await exportSlotFile(getSlot()); })}>Back up to file</button>
        <button className="btn min-h-[38px]" onClick={() => { store.setUi({ modal: 'settings' }); }}>Settings</button>
        <button className="btn min-h-[38px]" onClick={() => { store.setUi({ modal: undefined }); store.go('editor'); }}>Club editor</button>
      </div>
      <div className="text-[10px] text-slate-500 mt-3">The Android back button opens this menu. Backups can be restored from Load / Manage Saves on the title screen.</div>
      {ui.saving && <div className="text-[10px] text-slate-500 mt-1">Saving...</div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- quick-sim
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function QuickSimModal() {
  const { g } = useStore();
  const now = gameNow(g!);
  const [date, setDate] = useState(iso(now + 30 * DAY));
  const [prog, setProg] = useState<{ label: string; days: number; played: number } | null>(null);
  const cancel = useRef(false);
  const seasonEndLimit = useMemo(() => seasonStart(g!.meta.season + 1) - DAY, [g]);

  const run = async (target: QuickTarget, label: string) => {
    cancel.current = false;
    let days = 0, played = 0, note: string | undefined;
    setProg({ label, days, played });
    try {
      for (;;) {
        const r = store.quiet((gg) => quickSim(gg, target, 7));
        days += r.days; played += r.played; note = r.note;
        setProg({ label, days, played });
        if (r.done || cancel.current) break;
        await new Promise((res) => setTimeout(res, 0));
      }
    } catch (e) { console.error(e); note = 'Stopped by an error'; }
    await store.saveNow();
    setProg(null);
    store.setUi({ modal: undefined });
    store.toast(`Simulated ${days} days, ${played} of your matches${note ? ` - ${note}` : ''}`);
    if (store.game?.meta.sacked) store.go('board');
  };

  const d = Date.parse(`${date}T00:00:00Z`);
  const dateOk = Number.isFinite(d) && d > now && d <= seasonEndLimit;
  const sc = store.game!;
  return (
    <Modal title="Quick-sim" onClose={() => !prog && store.setUi({ modal: undefined })}>
      {prog ? (
        <div className="text-center py-3"><div className="font-bold mb-1">{prog.label}</div><div className="text-slate-400 text-xs">{prog.days} days simulated - {prog.played} of your matches played</div>
          <button className="btn btn-danger mt-3" onClick={() => { cancel.current = true; }}>Stop</button></div>
      ) : (
        <>
          <div className="text-xs text-slate-400 mb-2">Plays time forward without stopping on your match days. Your chosen XI is used when valid, otherwise it is repaired automatically. Offers in the inbox are not answered while quick-simming, so they may expire. It stops if you are dismissed or a new season begins.</div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <button className="btn min-h-[34px]" onClick={() => run({ kind: 'date', date: now + 7 * DAY }, 'Simulating 1 week')}>1 week</button>
            <button className="btn min-h-[34px]" onClick={() => run({ kind: 'date', date: now + 30 * DAY }, 'Simulating 1 month')}>1 month</button>
            <button className="btn min-h-[34px]" onClick={() => run({ kind: 'date', date: now + 90 * DAY }, 'Simulating 3 months')}>3 months</button>
          </div>
          <div className="flex items-center gap-2 mb-2"><span className="text-xs">Until date</span>
            <input type="date" className="bg-panel2 border border-line rounded px-2 py-1" value={date} min={iso(now + DAY)} max={iso(seasonEndLimit)} onChange={(e) => setDate(e.target.value)} />
            <button className="btn btn-primary" disabled={!dateOk} onClick={() => run({ kind: 'date', date: d }, `Simulating to ${fmtDate(d)}`)}>Go</button></div>
          <button className="btn btn-primary w-full min-h-[38px]" onClick={() => run({ kind: 'seasonEnd' }, 'Simulating to the end of the season')}>Simulate to end of season</button>
          <div className="text-[10px] text-slate-500 mt-2">Today: {fmtDateLong(now)}{sc.meta.sacked ? ' - you have been dismissed' : ''}</div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- club editor
type Edit = Pick<Club, 'name' | 'short' | 'city' | 'stadium' | 'colors' | 'badge'>;
const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = (c: Club): Edit => ({ name: c.name, short: c.short, city: c.city, stadium: c.stadium, colors: [...c.colors] as [string, string], badge: c.badge });

export function EditorScreen() {
  const { g } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string>(g!.meta.userClubId);
  const clubs = useMemo(() => Object.values(g!.clubs).sort((a, b) => (a.leagueId ?? '').localeCompare(b.leagueId ?? '') || a.name.localeCompare(b.name)), [g!.clubs]);
  const shown = clubs.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const club = g!.clubs[sel];
  const [f, setF] = useState<Edit>(() => pick(club));
  const [busy, setBusy] = useState(false);
  const choose = (id: string) => { setSel(id); setF(pick(g!.clubs[id])); };
  const dup = Object.values(g!.clubs).some((c) => c.id !== sel && c.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const errs: string[] = [];
  if (f.name.trim().length < 3 || f.name.trim().length > 32) errs.push('Name must be 3-32 characters');
  if (dup) errs.push('Another club already has that name');
  if (!/^[A-Za-z]{2,4}$/.test(f.short.trim())) errs.push('Short name must be 2-4 letters');
  if (f.stadium.trim().length < 3) errs.push('Stadium name is too short');
  if (!HEX.test(f.colors[0]) || !HEX.test(f.colors[1])) errs.push('Colours must be valid');
  const changed = JSON.stringify(f) !== JSON.stringify(pick(club));
  const preview = { ...club, ...f, short: f.short.toUpperCase() } as Club;

  const save = async () => {
    if (errs.length) return;
    await store.mutate((gg) => { const c = gg.clubs[sel]; c.name = f.name.trim(); c.short = f.short.trim().toUpperCase(); c.city = f.city.trim(); c.stadium = f.stadium.trim(); c.colors = [f.colors[0], f.colors[1]]; c.badge = f.badge; });
    store.toast(`${f.name.trim()} updated`);
  };
  const sharePack = async () => {
    setBusy(true);
    try {
      const pack = { format: 'touchline-clubpack', formatVersion: 1, clubs: Object.values(g!.clubs).map((c) => ({ id: c.id, ...pick(c) })) };
      const { bytes } = await packText(JSON.stringify(pack));
      const how = await deliverFile(`touchline-club-database-${slug(g!.clubs[g!.meta.userClubId].short)}.tlclubs`, bytes);
      store.toast(how === 'shared' ? 'Club database ready to share' : 'Club database downloaded');
    } catch (e) { if (!/cancel|abort|dismiss/i.test((e as Error).message ?? '')) store.toast('Export failed', 'bad'); }
    setBusy(false);
  };
  const importPack = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const pack = (await readPickedFile(file)) as { format?: string; clubs?: ({ id: string } & Edit)[] };
      if (pack.format !== 'touchline-clubpack' || !Array.isArray(pack.clubs)) { store.toast('This is not a Touchline club database file.', 'bad'); return; }
      let n = 0;
      await store.mutate((gg) => {
        for (const e of pack.clubs!) {
          const c = gg.clubs[e.id];
          if (!c || typeof e.name !== 'string' || !HEX.test(e.colors?.[0] ?? '') || !HEX.test(e.colors?.[1] ?? '')) continue;
          c.name = e.name.slice(0, 32); c.short = String(e.short ?? c.short).slice(0, 4).toUpperCase(); c.city = String(e.city ?? c.city).slice(0, 32);
          c.stadium = String(e.stadium ?? c.stadium).slice(0, 40); c.colors = [e.colors[0], e.colors[1]];
          if (Number.isInteger(e.badge) && e.badge >= 0 && e.badge <= 5) c.badge = e.badge;
          n++;
        }
      });
      setF(pick(store.game!.clubs[sel]));
      store.toast(n ? `Updated ${n} clubs from the file` : 'No matching clubs in that file', n ? 'ok' : 'bad');
    } catch (e) { store.toast((e as Error).message || 'Import failed', 'bad'); }
  };
  const inp = 'bg-panel2 border border-line rounded px-2 py-1 w-full';
  return (
    <div className="h-full flex gap-2 min-h-0">
      <Panel title="Clubs" className="w-52 shrink-0" right={<span className="text-[10px] text-slate-500">{shown.length}</span>}>
        <div className="p-1.5"><input className={inp} placeholder="Search clubs" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="scroll-y" style={{ height: 'calc(100% - 40px)' }}>
          {shown.map((c) => (
            <button key={c.id} className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] border-l-2 ${c.id === sel ? 'bg-accent/15 border-accent' : 'border-transparent active:bg-panel2'}`} onClick={() => choose(c.id)}>
              <Badge club={c} size={18} /><span className="truncate flex-1">{c.name}</span><span className="text-[9px] text-slate-500">{g!.leagues[c.leagueId ?? 'L1']?.short}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Edit club" className="flex-1 min-w-0" right={<div className="flex gap-1"><button className="btn btn-sm" disabled={busy} onClick={sharePack}>Share club database</button><button className="btn btn-sm" onClick={importPack}>Import club database</button></div>}>
        <div className="p-2 grid grid-cols-[1fr_auto] gap-3 scroll-y h-full content-start">
          <div className="space-y-1.5 min-w-0">
            <label className="block"><span className="text-[10px] uppercase text-slate-400">Name</span><input className={inp} maxLength={32} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-[10px] uppercase text-slate-400">Short name (2-4 letters)</span><input className={inp} maxLength={4} value={f.short} onChange={(e) => setF({ ...f, short: e.target.value.replace(/[^A-Za-z]/g, '') })} /></label>
              <label className="block"><span className="text-[10px] uppercase text-slate-400">City</span><input className={inp} maxLength={32} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
            </div>
            <label className="block"><span className="text-[10px] uppercase text-slate-400">Stadium</span><input className={inp} maxLength={40} value={f.stadium} onChange={(e) => setF({ ...f, stadium: e.target.value })} /></label>
            <div className="flex gap-3 items-end">
              {[0, 1].map((i) => (
                <label key={i} className="block"><span className="text-[10px] uppercase text-slate-400">{i === 0 ? 'Main colour' : 'Trim colour'}</span>
                  <input type="color" className="block h-8 w-14 bg-transparent border border-line rounded" value={HEX.test(f.colors[i]) ? f.colors[i] : '#000000'} onChange={(e) => { const c: [string, string] = [f.colors[0], f.colors[1]]; c[i] = e.target.value; setF({ ...f, colors: c }); }} /></label>
              ))}
              <div><span className="text-[10px] uppercase text-slate-400 block">Badge shape</span>
                <div className="flex gap-1">{[0, 1, 2, 3, 4, 5].map((b) => <button key={b} className={`p-0.5 rounded border ${f.badge === b ? 'border-accent bg-accent/15' : 'border-line'}`} onClick={() => setF({ ...f, badge: b })}><Badge club={{ ...preview, badge: b }} size={26} /></button>)}</div></div>
            </div>
            {errs.length > 0 && <ul className="text-bad text-[11px] list-disc pl-4">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
            <div className="flex gap-2 pt-1"><button className="btn btn-primary" disabled={!changed || errs.length > 0} onClick={save}>Save changes</button><button className="btn" disabled={!changed} onClick={() => setF(pick(club))}>Discard</button></div>
          </div>
          <div className="w-28 text-center"><div className="text-[10px] uppercase text-slate-400 mb-1">Preview</div><div className="flex justify-center"><Badge club={preview} size={72} /></div>
            <div className="mt-2 mx-auto w-14 h-16 rounded" style={{ background: `linear-gradient(90deg, ${f.colors[0]} 50%, ${f.colors[1]} 50%)` }} />
            <div className="text-[10px] text-slate-400 mt-1">Kit colours</div></div>
        </div>
      </Panel>
    </div>
  );
}
