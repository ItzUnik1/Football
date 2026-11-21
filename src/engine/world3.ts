import type { Game } from './types';
import { createCup, cupDaily } from './cups';
import { initIntl, intlDaily, playIntlDay, rolloverIntl } from './intl';
import { gameNow } from './messages';
import { initManagers, rolloverManagers } from './mgr';
import { initSocial, bonusRollover } from './social';
import { initMedia } from './media';
import { initStaff, staffRollover } from './staff';
import { econDaily, econRollover, initEcon } from './econ';

/** Idempotent initialiser for all Phase 3 state. Used for new careers and when upgrading a Phase 2 save. */
export function initPhase3(g: Game): void {
  g.news ??= [];
  g.cups ??= [];
  if (!g.cups.some((c) => c.season === g.meta.season)) g.cups.push(createCup(g, g.meta.season));
  initIntl(g);
  initManagers(g);
  initMedia(g);
  initSocial(g);
  initStaff(g);
  initEcon(g);
}

/** Daily Phase 3 processing, in a fixed order. */
export function phase3Daily(g: Game): void {
  cupDaily(g);
  playIntlDay(g, gameNow(g), false);
  intlDaily(g);
  econDaily(g);
}

/** Called from the season rollover once fixtures for the new season exist. */
export function rolloverPhase3(g: Game): void {
  g.cups = g.cups.filter((c) => c.season >= g.meta.season - 1);
  if (!g.cups.some((c) => c.season === g.meta.season)) g.cups.push(createCup(g, g.meta.season));
  for (const p of Object.values(g.players)) p.cup = undefined;
  rolloverIntl(g);
  rolloverManagers(g);
  bonusRollover(g);
  staffRollover(g);
  econRollover(g);
  for (const l of Object.values(g.leagues)) l.penalties = {};
}
