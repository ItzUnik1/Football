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

// ---- Phase 2 player extras ----
export interface Personality { professionalism: number; ambition: number; loyalty: number; leadership: number; adaptability: number } // 1..20
export interface Agent { name: string; greed: number } // greed 0..1
export type SquadRole = 'key' | 'first' | 'rotation' | 'prospect';
export interface InjuryRecord { date: number; type: string; days: number }
export interface SeasonStat { season: number; clubId: string; leagueId: string; apps: number; goals: number; assists: number; cleanSheets: number; avgRating: number; minutes: number }
export interface CareerStats { apps: number; goals: number; assists: number; cleanSheets: number; seasons: SeasonStat[] }
export type TrainingFocus = 'auto' | 'technical' | 'physical' | 'mental' | 'attack' | 'defence';

export interface Player {
  id: string;
  clubId: string | null; // null = free agent / unattached prospect
  parentClubId?: string; // set while on loan (owner club)
  name: string;
  age: number;
  nat: string;
  pos: Pos;
  ovr: number;
  pot: number;
  value: number; // market value, GBP
  wage: number; // GBP per week
  contractYears: number; // years remaining (derived from contractEnd)
  contractEnd?: number; // epoch ms, 30 June
  fitness: number; // 0..100
  morale: number; // 0..100
  tech: Tech;
  phys: Phys;
  mental: Mental;
  injuredDays: number; // days of injury remaining
  injury?: string;
  injuries?: InjuryRecord[];
  returnDays?: number; // return-to-training phase after an injury
  suspended: number; // matches remaining
  yellowCount: number;
  benchStreak: number;
  lastComplaint: number; // epoch ms of last interaction (0 = never)
  promisedStart?: boolean;
  listed?: boolean; // transfer listed by user
  loanListed?: boolean;
  stats: PlayerStats;
  // Phase 2
  personality?: Personality;
  agent?: Agent;
  role?: SquadRole;
  releaseClause?: number;
  sellOn?: { clubId: string; pct: number };
  loanOption?: { fee: number; obligatory: boolean };
  academy?: boolean; // member of a club youth academy (not in the senior squad)
  prospect?: boolean; // unattached youth available to be signed
  recentMinutes?: number;
  form?: number; // rolling match rating
  focus?: TrainingFocus;
  trainWithFirst?: boolean;
  career?: CareerStats;
  wantsMove?: boolean;
  joined?: number;
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
  // Phase 2
  leagueId?: string;
  medicalLevel?: number; // 1..5
  youthLevel?: number; // 1..5
  trainingLevel?: number; // 1..5
}

export interface Fixture {
  id: string;
  week: number; // round number within the league (kept from Phase 1)
  home: string;
  away: string;
  played: boolean;
  hg: number;
  ag: number;
  // Phase 2
  leagueId?: string;
  date?: number; // epoch ms (UTC midnight)
}

export interface League {
  id: string;
  name: string;
  short: string;
  tier: number; // 1 = top
  clubIds: string[];
  promote: number; // automatic promotion places
  relegate: number; // relegation places
  startDate: number; // first round, this season
  midweekEvery: number; // 0 = never; otherwise every Nth round is played midweek
}

export type Category =
  | 'Transfers' | 'Contracts' | 'Medical' | 'Board' | 'Players' | 'Fixtures' | 'Competitions' | 'Finances'
  | 'Scouting' | 'Youth' | 'Training';
export const CATEGORIES: Category[] = ['Transfers', 'Contracts', 'Medical', 'Board', 'Players', 'Fixtures', 'Competitions', 'Finances', 'Scouting', 'Youth', 'Training'];

export type MsgAction =
  | { kind: 'transfer_offer'; playerId: string; clubId: string; fee: number; expires: number }
  | { kind: 'loan_offer'; playerId: string; clubId: string; fee: number; expires: number }
  | { kind: 'contract'; playerId: string; wage: number; years: number; expires: number }
  | { kind: 'complaint'; playerId: string }
  | { kind: 'goto'; screen: string; playerId?: string }
  | { kind: 'scout_report'; playerId: string; reportId: string }
  | { kind: 'youth_contract'; playerId: string; expires: number }
  | { kind: 'wants_move'; playerId: string; expires: number }
  | { kind: 'loan_option'; playerId: string; fee: number; obligatory: boolean; expires: number }
  | { kind: 'board_funds'; amount: number; expires: number };

export interface Message {
  id: string;
  week: number; // legacy (Phase 1) round number
  date?: number; // in-game date (epoch ms)
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
  date?: number;
  clubId: string;
  type: 'transfer_in' | 'transfer_out' | 'loan_in' | 'loan_out' | 'wages' | 'tv' | 'matchday' | 'bonus' | 'contract' | 'agent' | 'prize' | 'staff' | 'installment';
  amount: number; // + income / - expense
  desc: string;
}

export interface Meta {
  userClubId: string;
  week: number; // legacy: next league round for the user's league
  season: number; // start year of the current season (2026 = 2026/27)
  startDate: number; // legacy
  date?: number; // current in-game date
  nextMsg: number;
  nextTx: number;
  seed: number;
  version: number;
  nextId?: number; // generic id counter (events, reports, fixtures)
  sacked?: boolean;
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
  date?: number;
  leagueId?: string;
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
  injuries: { playerId: string; weeks: number; days?: number; injury: string }[];
  bans: { playerId: string; matches: number }[];
}

// ---------- Scouting ----------
export interface Scout { id: string; name: string; ability: number; judgement: number; nat: string; wage: number; hired: boolean }
export interface Assignment {
  id: string; scoutId: string;
  kind: 'position' | 'youth' | 'league' | 'club' | 'free' | 'player';
  pos?: Pos; leagueId?: string; clubId?: string; playerId?: string; ageMax?: number;
  startDate: number; endDate: number; done: boolean;
}
export interface ScoutReport {
  id: string; date: number; scoutId: string; playerId: string; assignmentId: string;
  accuracy: number; // 0..100
  estOvr: [number, number]; estPot: [number, number]; estValue: [number, number];
  stars: number; // 1..5 recommendation
  summary: string;
}
export interface ScoutingState {
  scouts: Scout[];
  assignments: Assignment[];
  reports: ScoutReport[];
  knowledge: Record<string, number>; // playerId -> 0..100
  shortlist: string[];
  nextId: number;
}

// ---------- Board ----------
export interface Objective {
  id: string;
  kind: 'league' | 'finance' | 'transfer' | 'youth';
  title: string;
  desc: string;
  target: number;
  status: 'active' | 'ontrack' | 'offtrack' | 'met' | 'failed';
  weight: number;
}
export interface BoardState {
  confidence: number; // 0..100
  objectives: Objective[];
  season: number;
  fundsRequested: boolean;
  seasonStartBalance: number;
  netSpend: number;
  youthPromoted: number;
  warned: number;
}

// ---------- Training ----------
export type SessionType = 'Rest' | 'Recovery' | 'Fitness' | 'Technical' | 'Tactical' | 'Attacking' | 'Defending' | 'Set pieces';
export type Intensity = 'low' | 'medium' | 'high';
export interface TrainingState {
  plan: SessionType[]; // Mon..Sun
  intensity: Intensity;
  familiarity: number; // 0..100 tactical familiarity
  formation: Formation;
  youthProgram: 'balanced' | 'technical' | 'physical' | 'mental';
  log: { date: number; session: SessionType; note: string }[];
}

// ---------- History ----------
export interface LeagueSeason {
  leagueId: string; leagueName: string; tier: number;
  table: StandingRow[];
  champion: string;
  promoted: string[]; relegated: string[];
  topScorers: { playerId: string; name: string; clubId: string; goals: number }[];
  topAssists: { playerId: string; name: string; clubId: string; assists: number }[];
  cleanSheets: { playerId: string; name: string; clubId: string; n: number }[];
}
export interface SeasonAward { award: string; playerId: string; name: string; clubId: string; detail: string }
export interface SeasonRecord {
  season: number;
  leagues: LeagueSeason[];
  awards: SeasonAward[];
  userClubId: string;
  userLeagueId: string;
  userPos: number;
  userPoints: number;
  objective: string;
  objectiveMet: boolean;
}
export interface ClubRecords {
  titles: number[];
  bestFinish: { season: number; pos: number; tier: number } | null;
  biggestWin: { season: number; score: string; opp: string } | null;
  heaviestDefeat: { season: number; score: string; opp: string } | null;
  recordSigning: { name: string; fee: number; season: number } | null;
  recordSale: { name: string; fee: number; season: number } | null;
  topScorerAllTime: { name: string; goals: number } | null;
  highestPoints: { season: number; points: number } | null;
}
export interface HistoryState {
  seasons: SeasonRecord[];
  clubs: Record<string, ClubRecords>;
}

export interface CalendarEventStored {
  id: string; date: number;
  cat: 'board' | 'club' | 'youth' | 'scouting' | 'medical' | 'training' | 'contract' | 'transfer';
  title: string; detail: string; done?: boolean;
  ref?: { screen?: string; playerId?: string };
}

export interface Installment { id: string; date: number; fromClubId: string; toClubId: string | null; amount: number; playerId: string; desc: string }

export interface Game {
  meta: Meta;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Fixture[];
  messages: Message[];
  reports: Record<string, MatchReport>;
  tx: Tx[];
  lastReportId?: string;
  // Phase 2
  leagues: Record<string, League>;
  history: HistoryState;
  scouting: ScoutingState;
  board: BoardState;
  training: TrainingState;
  events: CalendarEventStored[];
  installments: Installment[];
  idx?: Map<string, Player[]>; // runtime index (not persisted)
}

export interface StandingRow {
  clubId: string;
  played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; points: number;
  form: ('W' | 'D' | 'L')[];
}
