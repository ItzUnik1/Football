// Phase 3 domain types: cups, international football, managers, news and media, staff, stadium and economy.
import type { Formation, Instructions, Manager, Mentality, Style, Pos } from './types';

// ---------- Domestic cup ----------
export interface CupRound { n: number; name: string; date: number; drawn: boolean; done: boolean }
export interface Cup {
  id: string; name: string; season: number;
  rounds: CupRound[];
  entrants: string[];
  byes: string[]; // clubs that skip round 1
  alive: string[]; // clubs still in the competition (after the last completed round)
  eliminated: Record<string, number>; // clubId -> round index they went out in
  winner?: string; runnerUp?: string;
  prize: number[]; // prize per round reached (index = round won)
}

// ---------- International ----------
export interface Nation {
  id: string; name: string; code: string;
  pts: number; // ranking points (Elo-like)
  rank: number;
  managerName: string;
  managerRep: number; // 1..100
  managerSince: number; // date
  philosophy: string;
  userManaged?: boolean;
  formation: Formation; mentality: Mentality; style: Style; instr: Instructions; roles: string[];
  lineup: string[]; bench: string[]; captainId: string;
  squad: string[]; // called-up players
  familiarity: number; sig?: string;
  w: number; d: number; l: number; gf: number; ga: number; // current-season record
  titles: { world: number; continental: number };
  best: { world: number; continental: number }; // best finish stage index (0 = never)
}
export type IntlComp = 'friendly' | 'qual' | 'world' | 'continental';
export interface IntlFixture {
  id: string; comp: IntlComp; compId: string; stage: string; // group name / round name
  date: number; home: string; away: string; // nation ids
  played: boolean; hg: number; ag: number;
  et?: boolean; pens?: [number, number]; winner?: string; neutral?: boolean;
}
export interface Tournament {
  id: string; kind: 'world' | 'continental'; year: number; name: string;
  nations: string[];
  groups: { name: string; nations: string[] }[];
  stage: 'group' | 'qf' | 'sf' | 'final' | 'done';
  alive: string[];
  winner?: string; runnerUp?: string; topScorer?: { name: string; nat: string; goals: number };
  stageDates: Partial<Record<'qf' | 'sf' | 'final', number>>;
  scorers: Record<string, { name: string; nat: string; goals: number }>;
}
export interface QualCampaign { id: string; season: number; kind: 'world' | 'continental'; year: number; table: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }>; done: boolean; qualified: string[] }
export interface IntlRecord { year: number; kind: 'world' | 'continental'; name: string; winner: string; runnerUp: string; topScorer?: { name: string; nat: string; goals: number } }
export interface IntlState {
  nations: Record<string, Nation>;
  fixtures: IntlFixture[]; // current + previous season only
  tournaments: Tournament[]; // current only; finished ones go to records
  qual?: QualCampaign;
  records: IntlRecord[];
  nextId: number;
  userNation?: string; // nation the user manages (if any)
  rankHistory: { date: number; ranks: Record<string, number> }[]; // sampled once per season
}

// ---------- Managers ----------
export type Mgr = Manager & { id: string; rep: number; tactical: number; motivation: number; youth: number; exp: number; wage: number };
export interface CareerEntry {
  kind: 'club' | 'nation'; id: string; name: string;
  from: number; to?: number; // dates
  p: number; w: number; d: number; l: number; gf: number; ga: number;
  trophies: string[]; best?: string; reason?: string; // how it ended
}
export interface ManagerCareer {
  name: string; age: number; nat: string;
  rep: number; // 1..100 (club reputation as a manager)
  intlRep: number; // 1..100 (international job reputation)
  exp: number; // seasons managed
  tactical: number; // tactical identity measure evolves with choices (1..20)
  history: CareerEntry[];
  trophies: { season: number; name: string; club: string }[];
  achievements: { id: string; date: number; title: string; detail: string }[];
  milestones: { date: number; text: string }[];
  totals: { p: number; w: number; d: number; l: number; gf: number; ga: number };
  contract: { clubId: string; wage: number; end: number; releaseClause?: number } | null;
  nationContract: { nationId: string; end: number; wage: number } | null;
  identity: { possession: number; pressing: number; counter: number; direct: number; defensive: number; attacking: number; matches: number }; // usage counters
  offers: { id: string; clubId?: string; nationId?: string; date: number; expires: number; wage: number; years: number; declined?: boolean }[];
  interviewsDone: number;
  resigned?: boolean;
  unemployedSince?: number;
}
export interface ManagerWorld { pool: Mgr[]; vacancies: { clubId?: string; nationId?: string; since: number; fillOn: number }[]; nextId: number; log: { date: number; text: string }[] }

// ---------- News ----------
export type NewsCat = 'league' | 'transfer' | 'manager' | 'injury' | 'development' | 'finance' | 'competition' | 'intl' | 'record' | 'media' | 'club';
export interface NewsItem { id: string; date: number; cat: NewsCat; headline: string; body?: string; imp: 0 | 1 | 2; clubId?: string; playerId?: string }

// ---------- Media ----------
export interface MediaState {
  relationship: number; // 0..100 with the press
  lastPressDay: number; lastPreMatch: number; lastPostMatch: number;
  promises: { playerId: string; kind: 'start' | 'minutes'; date: number; until: number; kept?: boolean }[];
  statements: { playerId: string; clubId?: string; date: number; kind: 'target' | 'praise' | 'criticism' }[];
  history: { date: number; topic: string; choice: string; effect: string }[];
  pending?: { kind: 'pre'; stance: string; fixtureId: string }[];
  leader?: Record<string, string>; streaks?: Record<string, number>; seasonBest?: { season: number; margin: number };
}

// ---------- Staff ----------
export type StaffRole = 'assistant' | 'coach' | 'fitness' | 'goalkeeping' | 'scout' | 'head_scout' | 'physio' | 'analyst' | 'youth_coach';
export const STAFF_ROLES: StaffRole[] = ['assistant', 'coach', 'fitness', 'goalkeeping', 'physio', 'analyst', 'youth_coach', 'scout', 'head_scout'];
export interface StaffMember {
  id: string; name: string; age: number; nat: string; role: StaffRole;
  ability: number; // 1..20 relevant skill
  secondary: number; // 1..20 (judging ability for scouts, motivation for assistant, etc.)
  exp: number; // seasons
  wage: number; // weekly
  contractEnd: number;
  clubId: string | null;
  focus?: 'attack' | 'defence' | 'technical' | 'mental'; // coaches
  region?: string; // scouts
}
export interface StaffWorld { pool: StaffMember[]; nextId: number }

// ---------- Stadium and economy ----------
export interface Construction { kind: 'stand' | 'roof' | 'facility'; label: string; cost: number; start: number; ready: number; addCapacity?: number; facility?: 'training' | 'youth' | 'medical' | 'scouting'; level?: number; paid: number }
export interface Sponsor { name: string; weekly: number; end: number; bonusWin?: number }
export interface ClubEcon {
  sponsor: Sponsor; kitDeal: { name: string; weekly: number; end: number };
  merchIndex: number; // 0..100 brand strength -> merchandising
  merchBase: number; tvBase: number; sponsorBase: number; tier: number;
  stSeason: number; // season in which season tickets were sold (0 = none)
  maxCapacity: number;
  penaltySeason?: number;
  seasonTickets: number; seasonTicketPrice: number;
  debt: number; interestRate: number; // annual
  construction?: Construction;
  stadiumLevel: number; // 1..5 (comfort/atmosphere)
  scoutingLevel: number; // 1..5
  maintenanceWeek: number;
  profile: 'rich' | 'big' | 'balanced' | 'frugal' | 'youth' | 'trader'; // AI recruitment & finance profile
  ambition: number; // 1..20
  lastWeek?: { tv: number; matchday: number; sponsor: number; merch: number; wages: number; staff: number; stadium: number; interest: number; net: number };
  tvDeal?: number;
  rev: { matchday: number; tickets: number; sponsor: number; merch: number; tv: number; prize: number; other: number };
  exp: { wages: number; staff: number; stadium: number; interest: number; transfers: number; bonuses: number };
  warning?: number; // financial warnings issued
}

export interface Facility { kind: 'training' | 'youth' | 'medical' | 'scouting'; level: number }
export const posGroups: Pos[] = ['GK', 'DF', 'MF', 'FW'];
