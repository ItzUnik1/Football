import Dexie, { type Table } from 'dexie';
import type { Club, Fixture, Game, MatchReport, Message, Meta, Player, Tx } from '../engine/types';
import { syncPlayerCounter } from '../engine/generator';

interface MetaRow extends Meta { key: 'meta' }
interface ReportRow { fixtureId: string; report: MatchReport }

class TouchlineDB extends Dexie {
  meta!: Table<MetaRow, string>;
  clubs!: Table<Club, string>;
  players!: Table<Player, string>;
  fixtures!: Table<Fixture, string>;
  messages!: Table<Message, string>;
  reports!: Table<ReportRow, string>;
  tx!: Table<Tx, string>;

  constructor() {
    super('touchline');
    this.version(1).stores({
      meta: 'key',
      clubs: 'id',
      players: 'id, clubId, pos',
      fixtures: 'id, week',
      messages: 'id, week, category, read',
      reports: 'fixtureId',
      tx: 'id, week',
    });
  }
}

export const db = new TouchlineDB();

// Snapshot of what is already persisted, so each save only writes rows that changed.
let snap: { players: Map<string, string>; clubs: Map<string, string>; fixtures: Map<string, string>; messages: Map<string, string>; reports: Set<string>; tx: Set<string>; meta: string } | null = null;

const emptySnap = () => ({ players: new Map<string, string>(), clubs: new Map<string, string>(), fixtures: new Map<string, string>(), messages: new Map<string, string>(), reports: new Set<string>(), tx: new Set<string>(), meta: '' });

function diff<T extends { id: string }>(rows: T[], known: Map<string, string>): { changed: T[]; keys: Map<string, string> } {
  const keys = new Map<string, string>();
  const changed: T[] = [];
  for (const r of rows) {
    const s = JSON.stringify(r);
    keys.set(r.id, s);
    if (known.get(r.id) !== s) changed.push(r);
  }
  return { changed, keys };
}

export async function saveGame(g: Game): Promise<void> {
  if (!snap) snap = emptySnap();
  const pl = diff(Object.values(g.players), snap.players);
  const cl = diff(Object.values(g.clubs), snap.clubs);
  const fx = diff(g.fixtures, snap.fixtures);
  const ms = diff(g.messages, snap.messages);
  const newReports = Object.keys(g.reports).filter((k) => !snap!.reports.has(k));
  const newTx = g.tx.filter((t) => !snap!.tx.has(t.id));
  const metaStr = JSON.stringify(g.meta);
  await db.transaction('rw', [db.meta, db.clubs, db.players, db.fixtures, db.messages, db.reports, db.tx], async () => {
    if (pl.changed.length) await db.players.bulkPut(pl.changed);
    if (cl.changed.length) await db.clubs.bulkPut(cl.changed);
    if (fx.changed.length) await db.fixtures.bulkPut(fx.changed);
    if (ms.changed.length) await db.messages.bulkPut(ms.changed);
    if (newReports.length) await db.reports.bulkPut(newReports.map((k) => ({ fixtureId: k, report: g.reports[k] })));
    if (newTx.length) await db.tx.bulkPut(newTx);
    if (metaStr !== snap!.meta) await db.meta.put({ key: 'meta', ...g.meta });
  });
  snap.players = pl.keys; snap.clubs = cl.keys; snap.fixtures = fx.keys; snap.messages = ms.keys;
  newReports.forEach((k) => snap!.reports.add(k));
  newTx.forEach((t) => snap!.tx.add(t.id));
  snap.meta = metaStr;
}

export async function hasSave(): Promise<boolean> {
  try { return (await db.meta.get('meta')) !== undefined; } catch { return false; }
}

export async function loadGame(): Promise<Game | null> {
  const m = await db.meta.get('meta');
  if (!m) return null;
  const { key: _k, ...meta } = m;
  void _k;
  const [clubs, players, fixtures, messages, reports, tx] = await Promise.all([
    db.clubs.toArray(), db.players.toArray(), db.fixtures.toArray(), db.messages.toArray(), db.reports.toArray(), db.tx.toArray(),
  ]);
  const g: Game = {
    meta: meta as Meta,
    clubs: Object.fromEntries(clubs.map((c) => [c.id, c])),
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    fixtures: fixtures.sort((a, b) => a.id.localeCompare(b.id)),
    messages: messages.sort((a, b) => a.id.localeCompare(b.id)),
    reports: Object.fromEntries(reports.map((r) => [r.fixtureId, r.report])),
    tx: tx.sort((a, b) => a.id.localeCompare(b.id)),
  };
  const maxId = players.reduce((mx, p) => Math.max(mx, parseInt(p.id.slice(1), 10) || 0), 0);
  syncPlayerCounter(maxId);
  // Prime the snapshot so the next save only writes real changes.
  snap = emptySnap();
  snap.players = diff(players, new Map()).keys;
  snap.clubs = diff(clubs, new Map()).keys;
  snap.fixtures = diff(fixtures, new Map()).keys;
  snap.messages = diff(messages, new Map()).keys;
  reports.forEach((r) => snap!.reports.add(r.fixtureId));
  tx.forEach((t) => snap!.tx.add(t.id));
  snap.meta = JSON.stringify(g.meta);
  return g;
}

export async function deleteSave(): Promise<void> {
  await db.transaction('rw', [db.meta, db.clubs, db.players, db.fixtures, db.messages, db.reports, db.tx], async () => {
    await Promise.all([db.meta.clear(), db.clubs.clear(), db.players.clear(), db.fixtures.clear(), db.messages.clear(), db.reports.clear(), db.tx.clear()]);
  });
  snap = null;
}
