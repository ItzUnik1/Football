// Core domain types for Touchline. Pure data - no UI or DB imports.

export type Pos = 'GK' | 'DF' | 'MF' | 'FW';
export type Formation = '4-3-3' | '4-4-2' | '4-2-3-1';
export type Mentality = 'defensive' | 'balanced' | 'attacking';
export type Style = 'possession' | 'direct' | 'counter';

export interface Slot {
  label: string;
  pos: Pos;
  x: number; // 0..100 left -> right
  y: number; // 0..100 attack (top) -> goal (bottom)
}

export interface Tech { passing: number; dribbling: number; shooting: number; finishing: number; tackling: number; handling: number }
export interface Phys { pace: number; stamina: number; strength: number; jumping: number }
export interface Mental { vision: number; composure: number; positioning: number; workrate: number }

export interface PlayerStats {
  apps: number; starts: number; goals: number; assists: number;
  yellow: number; red: number; minutes: number; ratingSum: number; cleanSheets: number;
}

export interface Player {
  id: string;
  clubId: string | null; // null = free agent
  parentClubId?: string; // set while on loan (owner club)
  name: string;
  age: number;
  nat: string;
  pos: Pos;
  ovr: number;
  pot: number;
  value: number; // market value, GBP
  wage: number; // GBP per week
  contractYears: number;
  fitness: number; // 0..100
  morale: number; // 0..100
  tech: Tech;
  phys: Phys;
  mental: Mental;
  injuredWeeks: number;
  injury?: string;
  suspended: number; // matches remaining
  yellowCount: number;
  benchStreak: number;
  lastComplaint: number;
  promisedStart?: boolean;
  listed?: boolean; // transfer listed by user
  loanListed?: boolean;
  stats: PlayerStats;
}

export interface Manager { name: string; age: number; nat: string; style: string }

export interface Club {
  id: string;
  name: string;
  short: string;
  city: string;
  colors: [string, string];
  badge: number; // badge shape variant
  stadium: string;
  capacity: number;
  manager: Manager;
  reputation: number; // 1..100
  balance: number;
  transferBudget: number;
  wageBudget: number; // weekly
  weeklyIncome: number; // TV + sponsorship + commercial
  ticketPrice: number;
  formation: Formation;
  mentality: Mentality;
  style: Style;
  lineup: string[]; // slot-ordered player ids ('' = empty)
  bench: string[];
  captainId: string;
}

export interface Fixture {
  id: string;
  week: number;
  home: string;
  away: string;
  played: boolean;
  hg: number;
  ag: number;
}

export type Category = 'Transfers' | 'Contracts' | 'Medical' | 'Board' | 'Players' | 'Fixtures' | 'Competitions' | 'Finances';
export const CATEGORIES: Category[] = ['Transfers', 'Contracts', 'Medical', 'Board', 'Players', 'Fixtures', 'Competitions', 'Finances'];

export type MsgAction =
  | { kind: 'transfer_offer'; playerId: string; clubId: string; fee: number; expires: number }
  | { kind: 'loan_offer'; playerId: string; clubId: string; fee: number; expires: number }
  | { kind: 'contract'; playerId: string; wage: number; years: number; expires: number }
  | { kind: 'complaint'; playerId: string }
  | { kind: 'goto'; screen: string; playerId?: string };

export interface Message {
  id: string;
  week: number;
  createdAt: number;
  category: Category;
  from: string;
  subject: string;
  body: string;
  read: boolean;
  important: boolean;
  action?: MsgAction;
  resolved?: string; // outcome text once the action is handled / expired
}

export interface Tx {
  id: string;
  week: number;
  clubId: string;
  type: 'transfer_in' | 'transfer_out' | 'loan_in' | 'loan_out' | 'wages' | 'tv' | 'matchday' | 'bonus' | 'contract';
  amount: number; // + income / - expense
  desc: string;
}

export interface Meta {
  userClubId: string;
  week: number; // next matchday to play, 1..38; 39 = season finished
  season: number;
  startDate: number; // epoch ms of matchday 1
  nextMsg: number;
  nextTx: number;
  seed: number;
  version: number;
}

export interface MatchEvent {
  min: number;
  type: 'goal' | 'yellow' | 'red' | 'injury' | 'sub' | 'pen_miss';
  team: 'home' | 'away';
  playerId: string;
  player: string;
  assistId?: string;
  assist?: string;
  detail?: string;
}

export interface TeamStats {
  possession: number;
  shots: number;
  onTarget: number;
  blocked: number;
  xg: number;
  passes: number;
  passAcc: number;
  fouls: number;
  corners: number;
  yellow: number;
  red: number;
  saves: number;
}

export interface PlayerMatch {
  id: string;
  name: string;
  pos: Pos;
  team: 'home' | 'away';
  started: boolean;
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  yellow: number;
  red: number;
}

export interface MatchReport {
  fixtureId: string;
  week: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  hg: number;
  ag: number;
  events: MatchEvent[];
  stats: { home: TeamStats; away: TeamStats };
  players: PlayerMatch[];
  motm: string;
  analysis: string[];
  injuries: { playerId: string; weeks: number; injury: string }[];
  bans: { playerId: string; matches: number }[];
}

export interface Game {
  meta: Meta;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Fixture[];
  messages: Message[];
  reports: Record<string, MatchReport>;
  tx: Tx[];
  lastReportId?: string;
}

export interface StandingRow {
  clubId: string;
  played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; points: number;
  form: ('W' | 'D' | 'L')[];
}
