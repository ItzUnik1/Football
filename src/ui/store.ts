import { useSyncExternalStore } from 'react';
import type { Club, Game, League, Player } from '../engine/types';
import { deleteSave, hasSave, loadGame, saveGame } from '../db/database';
import { newCareer } from '../engine/game';

export type Screen =
  | 'inbox' | 'home' | 'calendar'
  | 'squad' | 'tactics' | 'training' | 'medical' | 'academy'
  | 'league' | 'fixtures' | 'stats'
  | 'transfers' | 'scouting'
  | 'club' | 'board' | 'finances' | 'history';

/** Maps ids used by messages / older code onto real screens. */
export const normalizeScreen = (s: string): Screen => {
  const m: Record<string, Screen> = { dashboard: 'home', match: 'home', negotiations: 'transfers' };
  return (m[s] ?? s) as Screen;
};

export interface UiState {
  phase: 'loading' | 'start' | 'select' | 'game';
  screen: Screen;
  profileId?: string;
  selectedMessageId?: string;
  advanceMenu?: boolean;
  newSeason?: boolean;
  calMonth?: number;
  reportId?: string;
  toast?: { text: string; kind: 'ok' | 'bad'; id: number };
  hasSave: boolean;
  saving: boolean;
}

class Store {
  game: Game | null = null;
  ui: UiState = { phase: 'loading', screen: 'inbox', hasSave: false, saving: false };
  private v = 0;
  private listeners = new Set<() => void>();
  private toastId = 0;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.v;
  private emit() { this.v++; this.listeners.forEach((l) => l()); }

  async init() {
    try {
      const has = await hasSave();
      this.ui = { ...this.ui, phase: 'start', hasSave: has };
    } catch {
      this.ui = { ...this.ui, phase: 'start', hasSave: false };
    }
    this.emit();
  }

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

  async continueCareer() {
    this.setUi({ phase: 'loading' });
    const g = await loadGame();
    if (!g) { this.setUi({ phase: 'start', hasSave: false }); return; }
    this.game = g;
    this.ui = { ...this.ui, phase: 'game', screen: 'inbox', hasSave: true };
    this.emit();
  }

  async startCareer(clubId: string, world?: { clubs: Record<string, Club>; players: Record<string, Player>; leagues?: Record<string, League> }) {
    this.setUi({ phase: 'loading' });
    await deleteSave();
    this.game = newCareer(clubId, undefined, world);
    await saveGame(this.game);
    this.ui = { ...this.ui, phase: 'game', screen: 'inbox', hasSave: true };
    this.emit();
  }

  async deleteCareer() {
    await deleteSave();
    await this.quitToMenu();
  }

  async quitToMenu() {
    this.game = null;
    this.ui = { ...this.ui, phase: 'start', hasSave: await hasSave(), screen: 'inbox' };
    this.emit();
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
