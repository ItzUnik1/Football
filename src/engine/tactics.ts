import type { Club, Formation, Game, Instructions, Mentality, Player, Pos, RoleId, Slot, Style } from './types';
import { FORMATIONS } from './team';

// ---------- Mentality ----------
export const MENTALITIES: Mentality[] = ['very_defensive', 'defensive', 'balanced', 'attacking', 'very_attacking'];
export const MENTALITY_LABEL: Record<Mentality, string> = {
  very_defensive: 'Ultra-defensive', defensive: 'Defensive', balanced: 'Balanced', attacking: 'Attacking', very_attacking: 'All-out attack',
};
/** -2 .. +2 */
export const mentalityLevel = (m: Mentality): number => MENTALITIES.indexOf(m) - 2;

// ---------- Instructions ----------
export const DEFAULT_INSTR: Instructions = { press: 3, line: 3, tempo: 3, width: 3, passing: 'mixed', counter: false, setPieces: 'mixed', corners: 'near' };

/** Instructions for clubs saved before Phase 3 (derived from the old Style) */
export function instrOf(club: Club): Instructions {
  if (club.instr) return club.instr;
  const st = club.style;
  if (st === 'possession') return { ...DEFAULT_INSTR, passing: 'short', tempo: 2, press: 3, line: 3 };
  if (st === 'direct') return { ...DEFAULT_INSTR, passing: 'long', tempo: 4, width: 4 };
  return { ...DEFAULT_INSTR, counter: true, line: 2, tempo: 4, passing: 'mixed' };
}

export function styleFromInstr(i: Instructions): Style {
  if (i.counter) return 'counter';
  if (i.passing === 'short') return 'possession';
  if (i.passing === 'long') return 'direct';
  return i.tempo >= 4 ? 'direct' : 'possession';
}

export const INSTR_LABEL = {
  press: ['', 'Stand off', 'Low press', 'Standard', 'High press', 'Gegenpress'],
  line: ['', 'Deep', 'Low', 'Standard', 'High', 'Very high'],
  tempo: ['', 'Very slow', 'Slow', 'Standard', 'Fast', 'Very fast'],
  width: ['', 'Very narrow', 'Narrow', 'Standard', 'Wide', 'Very wide'],
} as const;

// ---------- Roles ----------
export interface RoleDef {
  id: RoleId; label: string; pos: Pos; wide?: boolean | 'any'; desc: string;
  mul: { att: number; cre: number; def: number };
  weights: [string, number][]; // attribute weights used for suitability
  press?: number; resist?: number; air?: number; sweep?: number; wideplay?: number; central?: number; tire?: number; shield?: number;
}

const R = (r: RoleDef): RoleDef => r;
export const ROLES: RoleDef[] = [
  R({ id: 'gk', label: 'Goalkeeper', pos: 'GK', desc: 'Stays on his line and concentrates on shot-stopping.', mul: { att: 1, cre: 1, def: 1 }, weights: [['handling', 0.7], ['positioning', 0.3]] }),
  R({ id: 'sweeper_keeper', label: 'Sweeper Keeper', pos: 'GK', desc: 'Sweeps up behind a high line and starts attacks, but is a little less secure on shots.', mul: { att: 1, cre: 1.05, def: 1 }, weights: [['handling', 0.4], ['pace', 0.2], ['passing', 0.2], ['vision', 0.2]], sweep: 1, resist: 0.04 }),
  R({ id: 'cd', label: 'Central Defender', pos: 'DF', wide: false, desc: 'A solid all-round defender.', mul: { att: 1, cre: 1, def: 1 }, weights: [['tackling', 0.35], ['positioning', 0.35], ['strength', 0.2], ['jumping', 0.1]] }),
  R({ id: 'bpd', label: 'Ball-Playing Defender', pos: 'DF', wide: false, desc: 'Steps out and plays through the lines. Helps beat the press.', mul: { att: 1, cre: 1.2, def: 0.96 }, weights: [['passing', 0.35], ['vision', 0.25], ['tackling', 0.2], ['positioning', 0.2]], resist: 0.05 }),
  R({ id: 'stopper', label: 'Stopper', pos: 'DF', wide: false, desc: 'Aggressive, wins the ball high and in the air. Weaker in recovery.', mul: { att: 0.95, cre: 0.85, def: 1.08 }, weights: [['tackling', 0.4], ['strength', 0.3], ['jumping', 0.15], ['workrate', 0.15]], air: 0.4, press: 1.1 }),
  R({ id: 'full_back', label: 'Full Back', pos: 'DF', wide: true, desc: 'Balanced fullback who supports the wing.', mul: { att: 1, cre: 1, def: 1 }, weights: [['tackling', 0.3], ['pace', 0.2], ['stamina', 0.2], ['positioning', 0.2], ['passing', 0.1]], wideplay: 0.5 }),
  R({ id: 'wing_back', label: 'Attacking Wing Back', pos: 'DF', wide: true, desc: 'Bombs forward to provide width. Leaves space behind.', mul: { att: 1.25, cre: 1.12, def: 0.88 }, weights: [['stamina', 0.3], ['pace', 0.25], ['passing', 0.2], ['dribbling', 0.15], ['tackling', 0.1]], wideplay: 1, tire: 1.1 }),
  R({ id: 'defensive_fb', label: 'Defensive Full Back', pos: 'DF', wide: true, desc: 'Stays back and protects the flank.', mul: { att: 0.8, cre: 0.9, def: 1.1 }, weights: [['tackling', 0.4], ['positioning', 0.3], ['strength', 0.2], ['workrate', 0.1]], wideplay: 0.1, shield: 1 }),
  R({ id: 'cm', label: 'Central Midfielder', pos: 'MF', wide: false, desc: 'Does a bit of everything.', mul: { att: 1, cre: 1, def: 1 }, weights: [['passing', 0.3], ['tackling', 0.2], ['workrate', 0.2], ['vision', 0.15], ['stamina', 0.15]] }),
  R({ id: 'b2b', label: 'Box-to-Box Midfielder', pos: 'MF', wide: false, desc: 'Covers the pitch, joins attacks and tracks back. Tiring.', mul: { att: 1.05, cre: 1.03, def: 1.05 }, weights: [['stamina', 0.3], ['workrate', 0.25], ['passing', 0.2], ['tackling', 0.15], ['shooting', 0.1]], tire: 1.2 }),
  R({ id: 'dlp', label: 'Deep-Lying Playmaker', pos: 'MF', wide: false, desc: 'Dictates play from deep and recycles possession against pressure.', mul: { att: 0.88, cre: 1.16, def: 0.96 }, weights: [['passing', 0.4], ['vision', 0.35], ['composure', 0.15], ['positioning', 0.1]], resist: 0.07 }),
  R({ id: 'app', label: 'Advanced Playmaker', pos: 'MF', wide: false, desc: 'Finds space between the lines and creates chances. Does not defend much.', mul: { att: 1.02, cre: 1.2, def: 0.8 }, weights: [['vision', 0.35], ['passing', 0.3], ['dribbling', 0.25], ['composure', 0.1]], central: 1 }),
  R({ id: 'ball_winner', label: 'Ball-Winning Midfielder', pos: 'MF', wide: false, desc: 'Harries opponents and wins the ball back. Drives the press.', mul: { att: 0.8, cre: 0.88, def: 1.16 }, weights: [['tackling', 0.35], ['workrate', 0.25], ['strength', 0.2], ['stamina', 0.2]], press: 1.3 }),
  R({ id: 'anchor', label: 'Anchor', pos: 'MF', wide: false, desc: 'Sits in front of the defence and shields it.', mul: { att: 0.7, cre: 0.9, def: 1.15 }, weights: [['positioning', 0.35], ['tackling', 0.3], ['strength', 0.2], ['composure', 0.15]], shield: 1 }),
  R({ id: 'wide_mid', label: 'Wide Midfielder', pos: 'MF', wide: true, desc: 'Works the flank in both phases.', mul: { att: 1, cre: 1, def: 1 }, weights: [['pace', 0.25], ['stamina', 0.25], ['passing', 0.25], ['workrate', 0.25]], wideplay: 0.7 }),
  R({ id: 'winger', label: 'Winger', pos: 'MF', wide: 'any', desc: 'Hugs the touchline, beats the full back and crosses.', mul: { att: 1.05, cre: 1.12, def: 0.85 }, weights: [['pace', 0.35], ['dribbling', 0.35], ['passing', 0.15], ['stamina', 0.15]], wideplay: 1 }),
  R({ id: 'inverted_winger', label: 'Inverted Winger', pos: 'MF', wide: 'any', desc: 'Cuts inside onto his stronger foot to create or shoot. Narrows the attack.', mul: { att: 1.08, cre: 1.12, def: 0.85 }, weights: [['dribbling', 0.3], ['passing', 0.25], ['pace', 0.2], ['vision', 0.15], ['shooting', 0.1]], central: 0.7 }),
  R({ id: 'cf', label: 'Complete Forward', pos: 'FW', wide: false, desc: 'Scores, creates and holds the ball up.', mul: { att: 1.05, cre: 1.12, def: 1 }, weights: [['finishing', 0.25], ['passing', 0.15], ['dribbling', 0.2], ['strength', 0.15], ['vision', 0.15], ['pace', 0.1]] }),
  R({ id: 'tf', label: 'Target Forward', pos: 'FW', wide: false, desc: 'Physical focal point who wins aerial duels. Thrives on crosses and long balls.', mul: { att: 1.04, cre: 0.95, def: 1 }, weights: [['strength', 0.3], ['jumping', 0.3], ['finishing', 0.25], ['composure', 0.15]], air: 1 }),
  R({ id: 'poacher', label: 'Poacher', pos: 'FW', wide: false, desc: 'Lives in the box. Little involvement outside it.', mul: { att: 1.14, cre: 0.8, def: 0.55 }, weights: [['finishing', 0.45], ['positioning', 0.3], ['composure', 0.15], ['pace', 0.1]] }),
  R({ id: 'pressing_forward', label: 'Pressing Forward', pos: 'FW', wide: false, desc: 'Leads the press and harasses defenders.', mul: { att: 0.97, cre: 0.95, def: 1.6 }, weights: [['workrate', 0.35], ['stamina', 0.25], ['pace', 0.2], ['finishing', 0.2]], press: 1.35, tire: 1.1 }),
  R({ id: 'inside_forward', label: 'Inside Forward', pos: 'FW', wide: true, desc: 'Starts wide, drifts inside and goes for goal.', mul: { att: 1.14, cre: 0.95, def: 0.8 }, weights: [['finishing', 0.3], ['dribbling', 0.25], ['pace', 0.25], ['shooting', 0.2]], central: 0.7 }),
  R({ id: 'fwinger', label: 'Winger (forward)', pos: 'FW', wide: true, desc: 'Stays wide and delivers crosses.', mul: { att: 1, cre: 1.12, def: 0.85 }, weights: [['pace', 0.35], ['dribbling', 0.3], ['passing', 0.2], ['stamina', 0.15]], wideplay: 1 }),
  R({ id: 'finverted', label: 'Inverted Winger (forward)', pos: 'FW', wide: true, desc: 'Cuts inside from the wing.', mul: { att: 1.08, cre: 1.08, def: 0.85 }, weights: [['dribbling', 0.3], ['passing', 0.25], ['pace', 0.2], ['finishing', 0.25]], central: 0.7 }),
];
const ROLE_MAP: Record<string, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.id, r]));
export const roleDef = (id: RoleId | string | undefined): RoleDef | undefined => (id ? ROLE_MAP[id] : undefined);

export const isWideSlot = (s: Slot): boolean => s.x <= 24 || s.x >= 76;

export function rolesForSlot(slot: Slot): RoleDef[] {
  const wide = isWideSlot(slot);
  return ROLES.filter((r) => {
    if (r.pos !== slot.pos) return false;
    if (r.wide === undefined) return true;
    if (r.wide === 'any') return wide;
    return r.wide === wide;
  });
}
export function defaultRoleFor(slot: Slot): RoleId {
  if (slot.pos === 'GK') return 'gk';
  if (slot.pos === 'DF') return isWideSlot(slot) ? 'full_back' : 'cd';
  if (slot.pos === 'MF') return isWideSlot(slot) ? 'wide_mid' : 'cm';
  return isWideSlot(slot) ? 'fwinger' : 'cf';
}
/** Role assigned to a lineup slot (falls back to the default if unset or invalid) */
export function roleAt(club: Club, i: number, formation: Formation = club.formation): RoleDef {
  const slot = FORMATIONS[formation][i];
  const set = club.roles?.[i];
  const def = roleDef(set);
  if (def && rolesForSlot(slot).some((r) => r.id === def.id)) return def;
  return roleDef(defaultRoleFor(slot))!;
}

const ATTR = (p: Player, k: string): number => (
  (p.tech as unknown as Record<string, number>)[k] ?? (p.phys as unknown as Record<string, number>)[k] ?? (p.mental as unknown as Record<string, number>)[k] ?? 50
);
/** 0..100: how well a player's attributes suit a role */
export function roleSuitability(p: Player, role: RoleDef): number {
  let s = 0, w = 0;
  for (const [k, wt] of role.weights) { s += ATTR(p, k) * wt; w += wt; }
  return w ? s / w : 50;
}
export const suitabilityLabel = (v: number): string => (v >= 72 ? 'Excellent' : v >= 62 ? 'Good' : v >= 52 ? 'Adequate' : v >= 42 ? 'Poor' : 'Unsuited');

/** Best role among the options for a player in a slot (used by AI and 'auto roles') */
export function bestRoleFor(p: Player, slot: Slot): RoleDef {
  const options = rolesForSlot(slot);
  return options.reduce((b, r) => (roleSuitability(p, r) + (r.id === defaultRoleFor(slot) ? 2 : 0) > roleSuitability(p, b) + (b.id === defaultRoleFor(slot) ? 2 : 0) ? r : b), options[0]);
}
export function autoRoles(g: Game, club: Club): void {
  const slots = FORMATIONS[club.formation];
  club.roles = club.lineup.map((id, i) => { const p = g.players[id]; return p ? bestRoleFor(p, slots[i]).id : defaultRoleFor(slots[i]); });
}

// ---------- Tactical familiarity ----------
export function tacticSignature(club: Club): string {
  const i = instrOf(club);
  const roles = club.lineup.map((_, i2) => roleAt(club, i2).id).join(',');
  return [club.formation, club.mentality, i.press, i.line, i.tempo, i.width, i.passing, i.counter ? 1 : 0, i.setPieces, i.corners, roles].join('|');
}
/** How much familiarity is lost for moving from signature a to b (0..) */
export function signatureChangeCost(a: string, b: string): number {
  if (a === b) return 0;
  const x = a.split('|'), y = b.split('|');
  let cost = 0;
  if (x[0] !== y[0]) cost += 25; // formation
  if (x[1] !== y[1]) cost += 3;
  for (let k = 2; k <= 9; k++) if (x[k] !== y[k]) cost += k === 8 || k === 9 ? 2 : 3.5;
  const ra = (x[10] ?? '').split(','), rb = (y[10] ?? '').split(',');
  for (let k = 0; k < Math.max(ra.length, rb.length); k++) if (ra[k] !== rb[k]) cost += 1.6;
  return Math.min(40, cost);
}

// ---------- Presets (for the UI and the AI) ----------
export interface Preset { id: string; name: string; mentality: Mentality; instr: Instructions }
export const PRESETS: Preset[] = [
  { id: 'balanced', name: 'Balanced', mentality: 'balanced', instr: { ...DEFAULT_INSTR } },
  { id: 'tiki', name: 'Possession', mentality: 'balanced', instr: { ...DEFAULT_INSTR, passing: 'short', tempo: 2, press: 4, line: 4, width: 3 } },
  { id: 'gegen', name: 'Gegenpress', mentality: 'attacking', instr: { ...DEFAULT_INSTR, passing: 'mixed', tempo: 5, press: 5, line: 4, counter: true } },
  { id: 'counter', name: 'Counter-attack', mentality: 'defensive', instr: { ...DEFAULT_INSTR, passing: 'long', tempo: 4, press: 2, line: 2, counter: true, width: 3 } },
  { id: 'long', name: 'Route one', mentality: 'balanced', instr: { ...DEFAULT_INSTR, passing: 'long', tempo: 4, width: 4, press: 2 } },
  { id: 'park', name: 'Park the bus', mentality: 'very_defensive', instr: { ...DEFAULT_INSTR, passing: 'long', tempo: 2, press: 1, line: 1, width: 2, counter: true, setPieces: 'man' } },
  { id: 'wings', name: 'Wing play', mentality: 'attacking', instr: { ...DEFAULT_INSTR, width: 5, passing: 'mixed', tempo: 3, corners: 'far' } },
];

export function applyPreset(club: Club, id: string): void {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  club.mentality = p.mentality;
  club.instr = { ...p.instr };
  club.style = styleFromInstr(club.instr);
}

/** AI tactical identity from the manager's philosophy */
export function managerPreset(philosophy: string): string {
  switch (philosophy) {
    case 'Attacking football': return 'wings';
    case 'Disciplined defence': return 'park';
    case 'Counter-attacking': return 'counter';
    case 'Possession-based': return 'tiki';
    default: return 'balanced';
  }
}

/** AI chooses mentality and instructions from its manager's identity, adapted to the opponent. Roles follow the personnel. */
export function aiTactics(g: Game, club: Club, diff: number, isHome: boolean): void {
  const preset = PRESETS.find((x) => x.id === managerPreset(club.manager.style)) ?? PRESETS[0];
  let lvl = mentalityLevel(preset.mentality);
  if (diff > 3 && isHome) lvl += 1; else if (diff < -5) lvl -= 1; else if (diff < -9) lvl -= 2;
  club.mentality = MENTALITIES[clampI(lvl + 2, 0, 4)];
  const i = { ...preset.instr };
  if (diff < -3 && !i.counter) { i.counter = true; i.line = Math.min(i.line, 2); }
  if (diff > 4 && i.passing === 'long') i.passing = 'mixed';
  club.instr = i;
  club.style = styleFromInstr(i);
  autoRoles(g, club);
}
const clampI = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
