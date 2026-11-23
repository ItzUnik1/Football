import { useSyncExternalStore } from 'react';
import type { Club, Game, League, Player } from '../engine/types';
import { deleteSlot, getSlot, loadGame, saveGame, setSlot, slotSummaries, type SlotInfo } from '../db/database';
import type { ManagerProfile } from '../engine/types3';
import { newCareer } from '../engine/game';

export type Screen =
  | 'inbox' | 'home' | 'calendar'
  | 'squad' | 'tactics' | 'training' | 'medical' | 'academy'
  | 'league' | 'fixtures' | 'stats'
  | 'transfers' | 'scouting'
  | 'club' | 'board' | 'finances' | 'history'
  | 'cups' | 'international' | 'news' | 'records' | 'stadium' | 'facilities' | 'staff' | 'manager' | 'media' | 'editor';

/** Maps ids used by messages / older code onto real screens. */
export const normalizeScreen = (s: string): Screen => {
  const m: Record<string, Screen> = { dashboard: 'home', match: 'home', negotiations: 'transfers' };
  return (m[s] ?? s) as Screen;
};

export interface UiState {
  phase: 'loading' | 'start' | 'slots' | 'profile' | 'select' | 'game';
  slots: SlotInfo[];
  draft?: { profile: ManagerProfile; slot: number; realNames: boolean };
  screen: Screen;
  profileId?: string;
  selectedMessageId?: string;
  advanceMenu?: boolean;
  modal?: 'menu' | 'settings' | 'quick' | 'import';
  newSeason?: boolean;
  calMonth?: number;
  reportId?: string;
  tacticsFor?: 'club' | 'nation';
  tab?: Record<string, string>;
  toast?: { text: string; kind: 'ok' | 'bad'; id: number };
  hasSave: boolean;
  saving: boolean;
}

class Store {
  game: Game | null = null;
  ui: UiState = { phase: 'loading', screen: 'inbox', hasSave: false, saving: false, slots: [] };
  private v = 0;
  private listeners = new Set<() => void>();
  private toastId = 0;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.v;
  private emit() { this.v++; this.listeners.forEach((l) => l()); }

  async init() {
    try {
      const slots = await slotSummaries();
      this.ui = { ...this.ui, phase: 'start', slots, hasSave: slots.some((x) => x.used) };
    } catch {
      this.ui = { ...this.ui, phase: 'start', hasSave: false };
    }
    this.emit();
  }

  async refreshSlots() {
    try { const slots = await slotSummaries(); this.ui = { ...this.ui, slots, hasSave: slots.some((x) => x.used) }; } catch { /* storage unavailable */ }
    this.emit();
  }

  /** Slot used most recently (remembered on this device), else the newest used slot. */
  lastSlot(): number | undefined {
    let n: number | undefined;
    try { n = parseInt(localStorage.getItem('touchline.slot') ?? '', 10) || undefined; } catch { /* ignore */ }
    const used = this.ui.slots.filter((x) => x.used);
    return used.find((x) => x.slot === n)?.slot ?? used.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0]?.slot;
  }
  private remember(n: number) { try { localStorage.setItem('touchline.slot', String(n)); } catch { /* ignore */ } }

  setUi(p: Partial<UiState>) { this.ui = { ...this.ui, ...p }; this.emit(); }
  go(screen: Screen | string, profileId?: string) { this.ui = { ...this.ui, screen: normalizeScreen(screen), profileId }; this.emit(); }
  selectMessage(id?: string) { this.ui = { ...this.ui, selectedMessageId: id }; this.emit(); }
  openProfile(id?: string) { this.ui = { ...this.ui, profileId: id }; this.emit(); }
  openReport(id?: string) { this.ui = { ...this.ui, reportId: id }; this.emit(); }
  toast(text: string, kind: 'ok' | 'bad' = 'ok') {
    const id = ++this.toastId;
    this.ui = { ...this.ui, toast: { text, kind, id } };
    this.emit();
    setTimeout(() => { if (this.ui.toast?.id === id) { this.ui = { ...this.ui, toast: undefined }; this.emit(); } }, 3200);
  }

  async continueCareer(slot?: number) {
    const n = slot ?? this.lastSlot() ?? 1;
    this.setUi({ phase: 'loading' });
    setSlot(n);
    const g = await loadGame();
    if (!g) { await this.refreshSlots(); this.setUi({ phase: 'start' }); return; }
    this.remember(n);
    this.game = g;
    this.ui = { ...this.ui, phase: 'game', screen: 'inbox', hasSave: true };
    this.emit();
  }

  async startCareer(clubId: string, world?: { clubs: Record<string, Club>; players: Record<string, Player>; leagues?: Record<string, League> }) {
    const d = this.ui.draft;
    this.setUi({ phase: 'loading' });
    const n = d?.slot ?? getSlot();
    setSlot(n);
    await deleteSlot(n);
    this.game = newCareer(clubId, undefined, world, d?.profile);
    this.remember(n);
    await saveGame(this.game);
    this.ui = { ...this.ui, phase: 'game', screen: 'inbox', hasSave: true };
    this.emit();
  }

  async deleteCareer() {
    await deleteSlot(getSlot());
    await this.quitToMenu();
  }

  async deleteSlotSave(n: number) {
    await deleteSlot(n);
    await this.refreshSlots();
  }

  async quitToMenu() {
    this.game = null;
    this.ui = { ...this.ui, phase: 'start', screen: 'inbox', draft: undefined };
    await this.refreshSlots();
  }

  /** Writes the current career to its slot now (every action already saves; this is the explicit "Save game"). */
  async saveNow(): Promise<boolean> {
    if (!this.game) return true;
    this.ui = { ...this.ui, saving: true }; this.emit();
    try { await saveGame(this.game); return true; } catch (e) { console.error('save failed', e); return false; } finally { this.ui = { ...this.ui, saving: false }; this.emit(); }
  }
  async saveAndQuit(): Promise<void> {
    if (!(await this.saveNow())) { this.toast('Save failed - storage unavailable', 'bad'); return; }
    this.ui = { ...this.ui, modal: undefined };
    await this.quitToMenu();
  }

  /** Like mutate but does not write to the database; the caller saves once at the end (used by quick-sim chunks). */
  quiet<T>(fn: (g: Game) => T): T {
    const r = fn(this.game!);
    this.emit();
    return r;
  }

  // Run a synchronous mutation on the game, then persist and re-render.
  async mutate<T>(fn: (g: Game) => T): Promise<T> {
    const g = this.game!;
    const r = fn(g);
    this.emit();
    this.ui = { ...this.ui, saving: true };
    try { await saveGame(g); } catch (e) { console.error('save failed', e); this.toast('Save failed - storage unavailable', 'bad'); }
    this.ui = { ...this.ui, saving: false };
    this.emit();
    return r;
  }
}

export const store = new Store();

export function useStore(): { g: Game | null; ui: UiState; v: number } {
  const v = useSyncExternalStore(store.subscribe, store.getVersion);
  return { g: store.game, ui: store.ui, v };
}
