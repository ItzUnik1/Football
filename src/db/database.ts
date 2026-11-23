import Dexie, { type Table } from 'dexie';
import type { Club, Fixture, Game, MatchReport, Message, Meta, Player, Tx } from '../engine/types';
import { syncPlayerCounter } from '../engine/generator';
import { migrateToV2, migrateToV3, DB_VERSION } from '../engine/migrate';
import { invalidateIndex } from '../engine/team';

interface MetaRow extends Meta { key: 'meta' }
interface ReportRow { fixtureId: string; report: MatchReport }
interface KvRow { key: string; value: unknown }

class TouchlineDB extends Dexie {
  meta!: Table<MetaRow, string>;
  clubs!: Table<Club, string>;
  players!: Table<Player, string>;
  fixtures!: Table<Fixture, string>;
  messages!: Table<Message, string>;
  reports!: Table<ReportRow, string>;
  tx!: Table<Tx, string>;
  kv!: Table<KvRow, string>;

  constructor(name = 'touchline') {
    super(name);
    // Phase 1 schema - kept so existing saves upgrade in place.
    this.version(1).stores({
      meta: 'key', clubs: 'id', players: 'id, clubId, pos', fixtures: 'id, week', messages: 'id, week, category, read', reports: 'fixtureId', tx: 'id, week',
    });
    // Phase 2: adds a key/value table for leagues, history, scouting, board, training, calendar events and instalments.
    this.version(2).stores({
      meta: 'key', clubs: 'id', players: 'id, clubId, pos', fixtures: 'id, week', messages: 'id, week, category, read', reports: 'fixtureId', tx: 'id, week', kv: 'key',
    });
  }
}

// ---- Save slots: one IndexedDB database per slot. Slot 1 keeps the original name so older saves are found. ----
export const SLOT_COUNT = 6;
const slotName = (n: number): string => (n === 1 ? 'touchline' : `touchline_s${n}`);
const dbs = new Map<number, TouchlineDB>();
let slot = 1;
export let db = new TouchlineDB(slotName(1));
dbs.set(1, db);
const dbFor = (n: number): TouchlineDB => { let d = dbs.get(n); if (!d) { d = new TouchlineDB(slotName(n)); dbs.set(n, d); } return d; };
/** Switches the active save slot. The diff snapshot belongs to one slot, so it is reset. */
export function setSlot(n: number): void {
  if (n < 1 || n > SLOT_COUNT) throw new Error('Invalid save slot');
  slot = n; db = dbFor(n); snap = null;
}
export const getSlot = (): number => slot;

export interface SlotInfo { slot: number; used: boolean; manager?: string; club?: string; season?: number; date?: number; league?: string; version?: number }
/** Reads a short description of every slot without loading a whole career. */
export async function slotSummaries(): Promise<SlotInfo[]> {
  const out: SlotInfo[] = [];
  for (let n = 1; n <= SLOT_COUNT; n++) {
    try {
      if (n !== 1 && !(await Dexie.exists(slotName(n)))) { out.push({ slot: n, used: false }); continue; }
      const d = dbFor(n);
      const m = await d.meta.get('meta');
      if (!m) { out.push({ slot: n, used: false }); continue; }
      const club = await d.clubs.get(m.userClubId);
      const car = (await d.kv.get('career'))?.value as { name?: string } | undefined;
      const lg = (await d.kv.get('leagues'))?.value as Record<string, { name: string }> | undefined;
      out.push({ slot: n, used: true, manager: car?.name ?? club?.manager?.name, club: club?.name, season: m.season, date: m.date, league: lg?.[club?.leagueId ?? 'L1']?.name, version: m.version });
    } catch { out.push({ slot: n, used: false }); }
  }
  return out;
}
export async function deleteSlot(n: number): Promise<void> {
  const d = dbFor(n);
  await d.transaction('rw', [d.meta, d.clubs, d.players, d.fixtures, d.messages, d.reports, d.tx, d.kv], async () => { await Promise.all([d.meta, d.clubs, d.players, d.fixtures, d.messages, d.reports, d.tx, d.kv].map((t) => (t as Table).clear())); });
  if (n === slot) snap = null;
}
// ---- Backup: a whole slot as one portable object (optionally gzip-compressed by the UI layer). ----
export const SAVE_FORMAT = 'touchline-save';
export interface SaveFile {
  format: typeof SAVE_FORMAT; formatVersion: 1; exportedAt: number; appDb: number;
  meta: MetaRow; clubs: Club[]; players: Player[]; fixtures: Fixture[]; messages: Message[]; reports: ReportRow[]; tx: Tx[]; kv: KvRow[];
}
/** Reads one slot's rows straight from IndexedDB (everything is already persisted after each action). */
export async function exportSlot(n: number): Promise<SaveFile> {
  const d = dbFor(n);
  const meta = await d.meta.get('meta');
  if (!meta) throw new Error('That slot is empty');
  const [clubs, players, fixtures, messages, reports, tx, kv] = await Promise.all([d.clubs.toArray(), d.players.toArray(), d.fixtures.toArray(), d.messages.toArray(), d.reports.toArray(), d.tx.toArray(), d.kv.toArray()]);
  return { format: SAVE_FORMAT, formatVersion: 1, exportedAt: Date.now(), appDb: DB_VERSION, meta, clubs, players, fixtures, messages, reports, tx, kv };
}
/** Checks a parsed file before anything is written; returns an error message or null. */
export function validateSaveFile(x: unknown): string | null {
  const f = x as Partial<SaveFile> | null;
  if (!f || typeof f !== 'object' || f.format !== SAVE_FORMAT) return 'This is not a Touchline save file.';
  if (f.formatVersion !== 1) return 'This save file was made by an unsupported version.';
  if (!f.meta || !Array.isArray(f.clubs) || !Array.isArray(f.players) || !Array.isArray(f.fixtures) || !Array.isArray(f.messages) || !Array.isArray(f.reports) || !Array.isArray(f.tx) || !Array.isArray(f.kv)) return 'The save file is incomplete or damaged.';
  if ((f.appDb ?? 0) > DB_VERSION) return 'This save is from a newer version of Touchline. Please update the game first.';
  if (!f.clubs.some((c) => c.id === f.meta!.userClubId)) return 'The save file is damaged (your club is missing).';
  return null;
}
/** Replaces a slot with the contents of a validated save file. Older saves are upgraded when loaded. */
export async function importSlot(n: number, f: SaveFile): Promise<void> {
  const err = validateSaveFile(f);
  if (err) throw new Error(err);
  const d = dbFor(n);
  await d.transaction('rw', [d.meta, d.clubs, d.players, d.fixtures, d.messages, d.reports, d.tx, d.kv], async () => {
    await Promise.all([d.meta, d.clubs, d.players, d.fixtures, d.messages, d.reports, d.tx, d.kv].map((t) => (t as Table).clear()));
    await d.meta.put(f.meta); await d.clubs.bulkPut(f.clubs); await d.players.bulkPut(f.players); await d.fixtures.bulkPut(f.fixtures);
    await d.messages.bulkPut(f.messages); await d.reports.bulkPut(f.reports); await d.tx.bulkPut(f.tx); await d.kv.bulkPut(f.kv);
  });
  if (n === slot) snap = null;
}

export const TABLES = () => [db.meta, db.clubs, db.players, db.fixtures, db.messages, db.reports, db.tx, db.kv];

const KV_KEYS = ['leagues', 'history', 'scouting', 'board', 'training', 'events', 'installments', 'cups', 'intl', 'career', 'mgrs', 'news', 'media', 'staffWorld'] as const;

interface Snap {
  players: Map<string, string>; clubs: Map<string, string>; fixtures: Map<string, string>; messages: Map<string, string>;
  reports: Set<string>; tx: Set<string>; meta: string; kv: Map<string, string>;
}
let snap: Snap | null = null;
const emptySnap = (): Snap => ({ players: new Map(), clubs: new Map(), fixtures: new Map(), messages: new Map(), reports: new Set(), tx: new Set(), meta: '', kv: new Map() });

function diff<T extends { id: string }>(rows: T[], known: Map<string, string>): { changed: T[]; keys: Map<string, string>; removed: string[] } {
  const keys = new Map<string, string>();
  const changed: T[] = [];
  for (const r of rows) {
    const s = JSON.stringify(r);
    keys.set(r.id, s);
    if (known.get(r.id) !== s) changed.push(r);
  }
  const removed: string[] = [];
  known.forEach((_v, k) => { if (!keys.has(k)) removed.push(k); });
  return { changed, keys, removed };
}

/** Persists only what changed since the previous save (including rows that were deleted). */
export async function saveGame(g: Game): Promise<void> {
  if (!snap) snap = emptySnap();
  const s = snap;
  const pl = diff(Object.values(g.players), s.players);
  const cl = diff(Object.values(g.clubs), s.clubs);
  const fx = diff(g.fixtures, s.fixtures);
  const ms = diff(g.messages, s.messages);
  const repKeys = Object.keys(g.reports);
  const newReports = repKeys.filter((k) => !s.reports.has(k));
  const goneReports = [...s.reports].filter((k) => !(k in g.reports));
  const newTx = g.tx.filter((t) => !s.tx.has(t.id));
  const txIds = new Set(g.tx.map((t) => t.id));
  const goneTx = [...s.tx].filter((id) => !txIds.has(id));
  const metaStr = JSON.stringify(g.meta);
  const kvNow = new Map<string, string>();
  const kvChanged: KvRow[] = [];
  for (const k of KV_KEYS) {
    const str = JSON.stringify((g as unknown as Record<string, unknown>)[k]);
    kvNow.set(k, str);
    if (s.kv.get(k) !== str) kvChanged.push({ key: k, value: (g as unknown as Record<string, unknown>)[k] });
  }
  await db.transaction('rw', TABLES(), async () => {
    if (pl.removed.length) await db.players.bulkDelete(pl.removed);
    if (fx.removed.length) await db.fixtures.bulkDelete(fx.removed);
    if (goneReports.length) await db.reports.bulkDelete(goneReports);
    if (goneTx.length) await db.tx.bulkDelete(goneTx);
    if (pl.changed.length) await db.players.bulkPut(pl.changed);
    if (cl.changed.length) await db.clubs.bulkPut(cl.changed);
    if (fx.changed.length) await db.fixtures.bulkPut(fx.changed);
    if (ms.changed.length) await db.messages.bulkPut(ms.changed);
    if (newReports.length) await db.reports.bulkPut(newReports.map((k) => ({ fixtureId: k, report: g.reports[k] })));
    if (newTx.length) await db.tx.bulkPut(newTx);
    if (kvChanged.length) await db.kv.bulkPut(kvChanged);
    if (metaStr !== s.meta) await db.meta.put({ key: 'meta', ...g.meta });
  });
  s.players = pl.keys; s.clubs = cl.keys; s.fixtures = fx.keys; s.messages = ms.keys;
  goneReports.forEach((k) => s.reports.delete(k));
  newReports.forEach((k) => s.reports.add(k));
  goneTx.forEach((k) => s.tx.delete(k));
  newTx.forEach((t) => s.tx.add(t.id));
  s.kv = kvNow;
  s.meta = metaStr;
}

export async function hasSave(): Promise<boolean> {
  try { return (await db.meta.get('meta')) !== undefined; } catch { return false; }
}

function primeSnapshot(g: Game): void {
  snap = emptySnap();
  snap.players = diff(Object.values(g.players), new Map()).keys;
  snap.clubs = diff(Object.values(g.clubs), new Map()).keys;
  snap.fixtures = diff(g.fixtures, new Map()).keys;
  snap.messages = diff(g.messages, new Map()).keys;
  Object.keys(g.reports).forEach((k) => snap!.reports.add(k));
  g.tx.forEach((t) => snap!.tx.add(t.id));
  snap.meta = JSON.stringify(g.meta);
  for (const k of KV_KEYS) snap.kv.set(k, JSON.stringify((g as unknown as Record<string, unknown>)[k]));
}

export async function loadGame(): Promise<Game | null> {
  const m = await db.meta.get('meta');
  if (!m) return null;
  const { key: _k, ...meta } = m;
  void _k;
  const [clubs, players, fixtures, messages, reports, tx, kv] = await Promise.all([
    db.clubs.toArray(), db.players.toArray(), db.fixtures.toArray(), db.messages.toArray(), db.reports.toArray(), db.tx.toArray(), db.kv.toArray(),
  ]);
  const kvm = Object.fromEntries(kv.map((r) => [r.key, r.value]));
  const g = {
    meta: meta as Meta,
    clubs: Object.fromEntries(clubs.map((c) => [c.id, c])),
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    fixtures: fixtures.sort((a, b) => a.id.localeCompare(b.id)),
    messages: messages.sort((a, b) => a.id.localeCompare(b.id)),
    reports: Object.fromEntries(reports.map((r) => [r.fixtureId, r.report])),
    tx: tx.sort((a, b) => a.id.localeCompare(b.id)),
    leagues: kvm.leagues, history: kvm.history, scouting: kvm.scouting, board: kvm.board, training: kvm.training,
    events: kvm.events ?? [], installments: kvm.installments ?? [],
    cups: kvm.cups, intl: kvm.intl, career: kvm.career, mgrs: kvm.mgrs, news: kvm.news, media: kvm.media, staffWorld: kvm.staffWorld,
  } as unknown as Game;
  const maxId = players.reduce((mx, p) => Math.max(mx, parseInt(p.id.slice(1), 10) || 0), 0);
  syncPlayerCounter(maxId);
  invalidateIndex(g);
  if ((g.meta.version ?? 1) < DB_VERSION || !g.leagues) {
    if ((g.meta.version ?? 1) < 2 || !g.leagues) migrateToV2(g);
    if ((g.meta.version ?? 1) < 3) migrateToV3(g);
    snap = emptySnap(); // everything is new to the newer tables: write it all
    await saveGame(g);
    return g;
  }
  primeSnapshot(g);
  return g;
}

export async function deleteSave(): Promise<void> {
  await db.transaction('rw', TABLES(), async () => { await Promise.all(TABLES().map((t) => (t as Table).clear())); });
  snap = null;
}
