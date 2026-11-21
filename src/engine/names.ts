// Name pools and club definitions. Players and managers are fictional; club names can be real (names only, no badges or licences).

export interface NationPool { nat: string; weight: number; first: string[]; last: string[] }

export const NATIONS: NationPool[] = [
  { nat: 'England', weight: 24, first: ['Jack', 'Harry', 'Oliver', 'Callum', 'Ryan', 'Connor', 'Mason', 'Declan', 'Tyler', 'Luke', 'Jordan', 'Kieran', 'Reece', 'Owen'], last: ['Whitaker', 'Hollis', 'Prescott', 'Barlow', 'Garrick', 'Thornley', 'Ashby', 'Fenwick', 'Merrick', 'Calloway', 'Dunmore', 'Hartley', 'Penrose', 'Stanton'] },
  { nat: 'Spain', weight: 10, first: ['Alvaro', 'Diego', 'Sergio', 'Iker', 'Marcos', 'Pablo', 'Adrian', 'Hugo', 'Ruben', 'Nacho'], last: ['Montero', 'Villalba', 'Quintana', 'Arroyo', 'Cordero', 'Maldonado', 'Ibarra', 'Salcedo', 'Beltran', 'Ferrer'] },
  { nat: 'Brazil', weight: 9, first: ['Lucas', 'Thiago', 'Rafael', 'Caio', 'Matheus', 'Gabriel', 'Vitor', 'Bruno', 'Leandro', 'Felipe'], last: ['Albuquerque', 'Teixeira', 'Barbosa', 'Nogueira', 'Carvalho', 'Moreira', 'Figueira', 'Siqueira', 'Pacheco', 'Rezende'] },
  { nat: 'France', weight: 9, first: ['Mathis', 'Antoine', 'Theo', 'Baptiste', 'Quentin', 'Lucien', 'Remy', 'Yann', 'Corentin', 'Jules'], last: ['Delacroix', 'Marchand', 'Fontaine', 'Lefevre', 'Garnier', 'Rousseau', 'Beaumont', 'Duval', 'Perrot', 'Vasseur'] },
  { nat: 'Germany', weight: 7, first: ['Jonas', 'Felix', 'Lukas', 'Niklas', 'Maximilian', 'Tobias', 'Florian', 'Leon', 'Moritz', 'Jannik'], last: ['Brandt', 'Keller', 'Vogel', 'Hartmann', 'Lindner', 'Kruger', 'Seidel', 'Wendt', 'Baumann', 'Roth'] },
  { nat: 'Italy', weight: 7, first: ['Matteo', 'Luca', 'Marco', 'Federico', 'Davide', 'Nicolo', 'Andrea', 'Simone', 'Giorgio', 'Emilio'], last: ['Rinaldi', 'Moretti', 'Caruso', 'Bellini', 'Sorrentino', 'Fabbri', 'Mancini', 'Orsini', 'Valenti', 'Greco'] },
  { nat: 'Portugal', weight: 6, first: ['Tiago', 'Joao', 'Ricardo', 'Nuno', 'Goncalo', 'Rui', 'Diogo', 'Andre'], last: ['Pereira', 'Cardoso', 'Sampaio', 'Tavares', 'Branco', 'Magalhaes', 'Lacerda', 'Duarte'] },
  { nat: 'Netherlands', weight: 5, first: ['Daan', 'Sven', 'Bram', 'Joost', 'Lars', 'Thijs', 'Milan', 'Ruud'], last: ['van Dijk', 'de Wit', 'Hendriks', 'Bakker', 'Visser', 'Smit', 'Kuiper', 'Brouwer'] },
  { nat: 'Argentina', weight: 5, first: ['Matias', 'Nicolas', 'Facundo', 'Santiago', 'Tomas', 'Emiliano', 'Ezequiel', 'Franco'], last: ['Gimenez', 'Acosta', 'Sandoval', 'Ledesma', 'Paredes', 'Benitez', 'Roldan', 'Escobar'] },
  { nat: 'Nigeria', weight: 5, first: ['Emeka', 'Chidi', 'Tunde', 'Kelechi', 'Ayo', 'Obinna', 'Sunday', 'Femi'], last: ['Okafor', 'Adeyemi', 'Balogun', 'Nwosu', 'Eze', 'Olawale', 'Ibrahim', 'Chukwu'] },
  { nat: 'Japan', weight: 3, first: ['Haruto', 'Ren', 'Kaito', 'Sora', 'Daiki', 'Yuto'], last: ['Takahashi', 'Matsuda', 'Hayashi', 'Kobayashi', 'Fujimoto', 'Aoki'] },
  { nat: 'Croatia', weight: 4, first: ['Luka', 'Ivan', 'Marko', 'Domagoj', 'Filip', 'Josip'], last: ['Kovacic', 'Babic', 'Matic', 'Pavlic', 'Vukovic', 'Juric'] },
  { nat: 'Ghana', weight: 3, first: ['Kwame', 'Kofi', 'Yaw', 'Kwesi', 'Nii'], last: ['Mensah', 'Boateng', 'Asante', 'Owusu', 'Appiah'] },
  { nat: 'Denmark', weight: 3, first: ['Mikkel', 'Rasmus', 'Kasper', 'Jesper'], last: ['Andersen', 'Holm', 'Nygaard', 'Lund'] },
];

export interface ClubDef {
  name: string; short: string; city: string; stadium: string; colors: [string, string]; rep: number; capacity: number;
}

export const CLUB_DEFS: ClubDef[] = [
  { name: 'Northgate United', short: 'NGU', city: 'Northgate', stadium: 'Northgate Park', colors: ['#d62839', '#f5f5f5'], rep: 86, capacity: 58000 },
  { name: 'Riverside Athletic', short: 'RSA', city: 'Riverside', stadium: 'Waterside Arena', colors: ['#1d4ed8', '#fbbf24'], rep: 82, capacity: 52000 },
  { name: 'Kingsbridge City', short: 'KBC', city: 'Kingsbridge', stadium: 'Crown Stadium', colors: ['#38bdf8', '#0f172a'], rep: 79, capacity: 49000 },
  { name: 'Falconridge United', short: 'FAL', city: 'Falconridge', stadium: 'The Aerie', colors: ['#7c2d12', '#fde68a'], rep: 74, capacity: 41000 },
  { name: 'Harbourview FC', short: 'HVW', city: 'Harbourview', stadium: 'Dockside Ground', colors: ['#0e7490', '#f1f5f9'], rep: 71, capacity: 38000 },
  { name: 'Redcliffe Rangers', short: 'RCR', city: 'Redcliffe', stadium: 'Cliff Road', colors: ['#b91c1c', '#111827'], rep: 68, capacity: 36000 },
  { name: 'Ashford Rovers', short: 'ASH', city: 'Ashford', stadium: 'Elm Lane Stadium', colors: ['#15803d', '#fef3c7'], rep: 65, capacity: 33000 },
  { name: 'Lakemont Dynamos', short: 'LKD', city: 'Lakemont', stadium: 'Lakeshore Bowl', colors: ['#7e22ce', '#e9d5ff'], rep: 63, capacity: 31000 },
  { name: 'Westmoor Wanderers', short: 'WMW', city: 'Westmoor', stadium: 'Moorland Park', colors: ['#166534', '#ffffff'], rep: 60, capacity: 29000 },
  { name: 'Thornbury City', short: 'THB', city: 'Thornbury', stadium: 'Bramble Field', colors: ['#be185d', '#fce7f3'], rep: 58, capacity: 27500 },
  { name: 'Stonebridge Albion', short: 'STA', city: 'Stonebridge', stadium: 'The Quarry', colors: ['#475569', '#f8fafc'], rep: 56, capacity: 26000 },
  { name: 'Eastvale Town', short: 'EVT', city: 'Eastvale', stadium: 'Vale Road', colors: ['#ea580c', '#1c1917'], rep: 54, capacity: 24500 },
  { name: 'Ironvale FC', short: 'IRV', city: 'Ironvale', stadium: 'Foundry Park', colors: ['#334155', '#f97316'], rep: 52, capacity: 23000 },
  { name: 'Oakhaven Borough', short: 'OKH', city: 'Oakhaven', stadium: 'Acorn Ground', colors: ['#365314', '#d9f99d'], rep: 50, capacity: 21500 },
  { name: 'Brightwater Athletic', short: 'BWA', city: 'Brightwater', stadium: 'Springfield Road', colors: ['#0369a1', '#e0f2fe'], rep: 48, capacity: 20000 },
  { name: 'Crestfield Albion', short: 'CFA', city: 'Crestfield', stadium: 'Summit Ground', colors: ['#a16207', '#1e293b'], rep: 46, capacity: 18500 },
  { name: 'Silverdale Town', short: 'SVT', city: 'Silverdale', stadium: 'Mill Lane', colors: ['#94a3b8', '#1e3a8a'], rep: 44, capacity: 17000 },
  { name: 'Dunmore County', short: 'DMC', city: 'Dunmore', stadium: 'County Ground', colors: ['#9f1239', '#fde047'], rep: 42, capacity: 16000 },
  { name: 'Marlowe FC', short: 'MAR', city: 'Marlowe', stadium: 'Parkview', colors: ['#0f766e', '#ccfbf1'], rep: 40, capacity: 15000 },
  { name: 'Valemouth Rovers', short: 'VMR', city: 'Valemouth', stadium: 'Estuary Park', colors: ['#6d28d9', '#fef08a'], rep: 38, capacity: 14000 },
];


/** Real English club names (names only: badges, kits and players are all generated and unofficial). */
export const REAL_CLUB_DEFS: ClubDef[] = [
  { name: 'Manchester City', short: 'MCI', city: 'Manchester', stadium: 'Etihad Stadium', colors: ['#6cabdd', '#ffffff'], rep: 86, capacity: 53400 },
  { name: 'Arsenal', short: 'ARS', city: 'London', stadium: 'Emirates Stadium', colors: ['#d62839', '#ffffff'], rep: 84, capacity: 60700 },
  { name: 'Liverpool', short: 'LIV', city: 'Liverpool', stadium: 'Anfield', colors: ['#c8102e', '#f6eb61'], rep: 83, capacity: 61000 },
  { name: 'Chelsea', short: 'CHE', city: 'London', stadium: 'Stamford Bridge', colors: ['#034694', '#ffffff'], rep: 79, capacity: 40000 },
  { name: 'Manchester United', short: 'MUN', city: 'Manchester', stadium: 'Old Trafford', colors: ['#da291c', '#fbe122'], rep: 78, capacity: 74000 },
  { name: 'Tottenham Hotspur', short: 'TOT', city: 'London', stadium: 'Tottenham Hotspur Stadium', colors: ['#132257', '#ffffff'], rep: 75, capacity: 62000 },
  { name: 'Newcastle United', short: 'NEW', city: 'Newcastle', stadium: "St James' Park", colors: ['#241f20', '#ffffff'], rep: 72, capacity: 52000 },
  { name: 'Aston Villa', short: 'AVL', city: 'Birmingham', stadium: 'Villa Park', colors: ['#670e36', '#95bfe5'], rep: 70, capacity: 42700 },
  { name: 'West Ham United', short: 'WHU', city: 'London', stadium: 'London Stadium', colors: ['#7a263a', '#1bb1e7'], rep: 66, capacity: 62500 },
  { name: 'Brighton & Hove Albion', short: 'BHA', city: 'Brighton', stadium: 'Amex Stadium', colors: ['#0057b8', '#ffffff'], rep: 64, capacity: 31800 },
  { name: 'Crystal Palace', short: 'CRY', city: 'London', stadium: 'Selhurst Park', colors: ['#1b458f', '#c4122e'], rep: 61, capacity: 25400 },
  { name: 'Brentford', short: 'BRE', city: 'London', stadium: 'Gtech Community Stadium', colors: ['#e30613', '#ffffff'], rep: 59, capacity: 17250 },
  { name: 'Fulham', short: 'FUL', city: 'London', stadium: 'Craven Cottage', colors: ['#111111', '#ffffff'], rep: 57, capacity: 29600 },
  { name: 'Everton', short: 'EVE', city: 'Liverpool', stadium: 'Goodison Park', colors: ['#003399', '#ffffff'], rep: 56, capacity: 39400 },
  { name: 'Wolverhampton Wanderers', short: 'WOL', city: 'Wolverhampton', stadium: 'Molineux Stadium', colors: ['#fdb913', '#231f20'], rep: 54, capacity: 31750 },
  { name: 'Nottingham Forest', short: 'NFO', city: 'Nottingham', stadium: 'City Ground', colors: ['#dd0000', '#ffffff'], rep: 52, capacity: 30400 },
  { name: 'AFC Bournemouth', short: 'BOU', city: 'Bournemouth', stadium: 'Vitality Stadium', colors: ['#da291c', '#111111'], rep: 49, capacity: 11300 },
  { name: 'Leeds United', short: 'LEE', city: 'Leeds', stadium: 'Elland Road', colors: ['#ffffff', '#1d428a'], rep: 47, capacity: 37600 },
  { name: 'Leicester City', short: 'LEI', city: 'Leicester', stadium: 'King Power Stadium', colors: ['#003090', '#fdbe11'], rep: 44, capacity: 32300 },
  { name: 'Southampton', short: 'SOU', city: 'Southampton', stadium: "St Mary's Stadium", colors: ['#d71920', '#ffffff'], rep: 40, capacity: 32000 },
];

export const MANAGER_FIRST = ['Gareth', 'Marco', 'Stefan', 'Andre', 'Pedro', 'Ian', 'Rafael', 'Martin', 'Colin', 'Jorge', 'Dieter', 'Paolo', 'Neil', 'Hugo', 'Tomas', 'Alan', 'Viktor', 'Sean', 'Mateo', 'Frank'];
export const MANAGER_LAST = ['Hollande', 'Brennan', 'Keller', 'Santoro', 'Whitmore', 'Duarte', 'Lindqvist', 'Mercer', 'Okonkwo', 'Bergmann', 'Castellan', 'Doyle', 'Varga', 'Ellison', 'Navarro', 'Pryce', 'Haldane', 'Morrow', 'Ferreira', 'Stroud'];
export const MANAGER_STYLES = ['Attacking football', 'Disciplined defence', 'Counter-attacking', 'Possession-based', 'Pragmatic'];

// ---- Phase 2: lower divisions (all fictional) ----
const TIER2: [string, string, string][] = [
  ['Granton Wanderers', 'GRW', 'Granton'], ['Penhallow Town', 'PEN', 'Penhallow'], ['Cobham United', 'CBU', 'Cobham'], ['Westford Athletic', 'WFA', 'Westford'],
  ['Holmfirth Rovers', 'HFR', 'Holmfirth'], ['Aldenmoor FC', 'ALD', 'Aldenmoor'], ['Baxterley City', 'BXC', 'Baxterley'], ['Corrington Town', 'CRT', 'Corrington'],
  ['Daleford United', 'DFU', 'Daleford'], ['Elmstead Albion', 'ELA', 'Elmstead'], ['Fairhaven FC', 'FHV', 'Fairhaven'], ['Greywater Rovers', 'GWR', 'Greywater'],
  ['Hartland Athletic', 'HLA', 'Hartland'], ['Ingleby Town', 'ING', 'Ingleby'], ['Kestrel City', 'KSC', 'Kestrel'], ['Langmere United', 'LGM', 'Langmere'],
  ['Millbrook Albion', 'MLB', 'Millbrook'], ['Nethercombe Town', 'NTC', 'Nethercombe'], ['Oldcastle Rangers', 'OCR', 'Oldcastle'], ['Pendleton Athletic', 'PDA', 'Pendleton'],
];
const TIER3: [string, string, string][] = [
  ['Quarryfield FC', 'QFF', 'Quarryfield'], ['Ravensmoor Town', 'RVM', 'Ravensmoor'], ['Saltmarsh Town', 'SMT', 'Saltmarsh'], ['Tidemouth Rovers', 'TMR', 'Tidemouth'],
  ['Uplands United', 'UPU', 'Uplands'], ['Vauxley Athletic', 'VXA', 'Vauxley'], ['Wrenfield Town', 'WFT', 'Wrenfield'], ['Yarnton FC', 'YRN', 'Yarnton'],
  ['Ashgrove Albion', 'AGA', 'Ashgrove'], ['Brackenfield FC', 'BKF', 'Brackenfield'], ['Coldharbour City', 'CHC', 'Coldharbour'], ['Duskwood United', 'DWU', 'Duskwood'],
  ['Eastmoor Town', 'EMT', 'Eastmoor'], ['Fernley Rovers', 'FNR', 'Fernley'], ['Glenmoor Athletic', 'GMA', 'Glenmoor'], ['Hollowbrook FC', 'HBK', 'Hollowbrook'],
  ['Ironhill Town', 'IHT', 'Ironhill'], ['Juniper Rangers', 'JNR', 'Juniper'], ['Kingsmoor United', 'KMU', 'Kingsmoor'], ['Larkfield Albion', 'LKA', 'Larkfield'],
];
const REAL_TIER2: [string, string, string, string, string, string][] = [
  ['Sheffield United', 'SHU', 'Sheffield', 'Bramall Lane', '#ee2737', '#111111'], ['Burnley', 'BUR', 'Burnley', 'Turf Moor', '#6c1d45', '#99d6ea'],
  ['West Bromwich Albion', 'WBA', 'West Bromwich', 'The Hawthorns', '#122f67', '#ffffff'], ['Norwich City', 'NOR', 'Norwich', 'Carrow Road', '#00a650', '#fff200'],
  ['Middlesbrough', 'MID', 'Middlesbrough', 'Riverside Stadium', '#e0162b', '#ffffff'], ['Sunderland', 'SUN', 'Sunderland', 'Stadium of Light', '#eb172b', '#ffffff'],
  ['Coventry City', 'COV', 'Coventry', 'Coventry Building Society Arena', '#59cbe8', '#ffffff'], ['Watford', 'WAT', 'Watford', 'Vicarage Road', '#fbee23', '#ed2127'],
  ['Stoke City', 'STK', 'Stoke-on-Trent', 'bet365 Stadium', '#e03a3e', '#ffffff'], ['Swansea City', 'SWA', 'Swansea', 'Swansea.com Stadium', '#ffffff', '#111111'],
  ['Blackburn Rovers', 'BLB', 'Blackburn', 'Ewood Park', '#009ee0', '#ffffff'], ['Hull City', 'HUL', 'Hull', 'MKM Stadium', '#f5a12d', '#111111'],
  ['Millwall', 'MIL', 'London', 'The Den', '#001d5e', '#ffffff'], ['Preston North End', 'PNE', 'Preston', 'Deepdale', '#ffffff', '#1c2c5b'],
  ['Bristol City', 'BRC', 'Bristol', 'Ashton Gate', '#e21a23', '#ffffff'], ['Cardiff City', 'CAR', 'Cardiff', 'Cardiff City Stadium', '#0070b5', '#ffffff'],
  ['Queens Park Rangers', 'QPR', 'London', 'Loftus Road', '#1d5ba4', '#ffffff'], ['Sheffield Wednesday', 'SHW', 'Sheffield', 'Hillsborough', '#0e4e9e', '#ffffff'],
  ['Plymouth Argyle', 'PLY', 'Plymouth', 'Home Park', '#00482b', '#ffffff'], ['Derby County', 'DER', 'Derby', 'Pride Park', '#ffffff', '#111111'],
];
const REAL_TIER3: [string, string, string, string, string, string][] = [
  ['Birmingham City', 'BIR', 'Birmingham', "St Andrew's", '#0000ff', '#ffffff'], ['Leyton Orient', 'LEO', 'London', 'Brisbane Road', '#e2001a', '#ffffff'],
  ['Huddersfield Town', 'HUD', 'Huddersfield', 'John Smith\'s Stadium', '#0e63ad', '#ffffff'], ['Wrexham', 'WRE', 'Wrexham', 'Racecourse Ground', '#d71920', '#ffffff'],
  ['Bolton Wanderers', 'BOL', 'Bolton', 'Toughsheet Community Stadium', '#ffffff', '#1c2e5a'], ['Stockport County', 'STO', 'Stockport', 'Edgeley Park', '#005da4', '#ffffff'],
  ['Reading', 'REA', 'Reading', 'Select Car Leasing Stadium', '#004494', '#ffffff'], ['Wigan Athletic', 'WIG', 'Wigan', 'Brick Community Stadium', '#1d59af', '#ffffff'],
  ['Peterborough United', 'PET', 'Peterborough', 'London Road', '#005ca9', '#ffffff'], ['Luton Town', 'LUT', 'Luton', 'Kenilworth Road', '#f78f1e', '#1c2c5b'],
  ['Portsmouth', 'POR', 'Portsmouth', 'Fratton Park', '#001489', '#ffffff'], ['Charlton Athletic', 'CHA', 'London', 'The Valley', '#d4021d', '#ffffff'],
  ['Barnsley', 'BAR', 'Barnsley', 'Oakwell', '#d71920', '#ffffff'], ['Lincoln City', 'LIN', 'Lincoln', 'LNER Stadium', '#d2232a', '#ffffff'],
  ['Blackpool', 'BLP', 'Blackpool', 'Bloomfield Road', '#f68712', '#ffffff'], ['Rotherham United', 'ROT', 'Rotherham', 'New York Stadium', '#d71920', '#ffffff'],
  ['Exeter City', 'EXE', 'Exeter', 'St James Park', '#e2001a', '#ffffff'], ['Cambridge United', 'CAM', 'Cambridge', 'Abbey Stadium', '#ffc20e', '#111111'],
  ['Mansfield Town', 'MAN', 'Mansfield', 'Field Mill', '#fdb913', '#0c3b7a'], ['Northampton Town', 'NTH', 'Northampton', 'Sixfields', '#8b1a1a', '#ffffff'],
];
const PALETTE: [string, string][] = [
  ['#b45309', '#fef3c7'], ['#0f766e', '#f0fdfa'], ['#9d174d', '#fdf2f8'], ['#1e40af', '#dbeafe'], ['#4d7c0f', '#ecfccb'], ['#7f1d1d', '#fecaca'],
  ['#155e75', '#cffafe'], ['#6b21a8', '#f3e8ff'], ['#c2410c', '#ffedd5'], ['#1f2937', '#fde047'], ['#064e3b', '#a7f3d0'], ['#3730a3', '#e0e7ff'],
];
const SUFFIX = ['Road', 'Park', 'Lane', 'Ground', 'Field', 'Stadium'];

let realNames = true;
/** Chooses between real club names (default) and the original fictional clubs for newly created worlds. */
export const setRealNames = (v: boolean): void => { realNames = v; };
export const useRealNames = (): boolean => realNames;
export const premierDefs = (): ClubDef[] => (realNames ? REAL_CLUB_DEFS : CLUB_DEFS);

export function lowerClubDefs(): { def: ClubDef; tier: number }[] {
  const out: { def: ClubDef; tier: number }[] = [];
  if (realNames) {
    const addReal = (list: typeof REAL_TIER2, tier: number, repHi: number, repLo: number, capHi: number, capLo: number) => list.forEach(([name, short, city, stadium, c1, c2], i) => {
      const f = i / (list.length - 1);
      out.push({ tier, def: { name, short, city, stadium, colors: [c1, c2], rep: Math.round(repHi - (repHi - repLo) * f), capacity: Math.round((capHi - (capHi - capLo) * f) / 100) * 100 } });
    });
    addReal(REAL_TIER2, 2, 37, 22, 26000, 12000);
    addReal(REAL_TIER3, 3, 21, 8, 16000, 6000);
    return out;
  }
  const add = (list: [string, string, string][], tier: number, repHi: number, repLo: number, capHi: number, capLo: number) => {
    list.forEach(([name, short, city], i) => {
      const f = i / (list.length - 1);
      const pal = PALETTE[(i * 5 + tier * 3) % PALETTE.length];
      out.push({
        tier,
        def: {
          name, short, city, stadium: `${city} ${SUFFIX[(i + tier) % SUFFIX.length]}`, colors: [pal[0], pal[1]],
          rep: Math.round(repHi - (repHi - repLo) * f), capacity: Math.round((capHi - (capHi - capLo) * f) / 100) * 100,
        },
      });
    });
  };
  add(TIER2, 2, 37, 22, 14500, 8500);
  add(TIER3, 3, 21, 8, 8500, 3500);
  return out;
}

export const LEAGUE_DEFS = [
  { id: 'L1', name: 'Touchline Premier Division', short: 'Premier', tier: 1, promote: 0, relegate: 3, startMonthDay: [7, 15] as [number, number], midweekEvery: 0 },
  { id: 'L2', name: 'Touchline Championship', short: 'Champ.', tier: 2, promote: 3, relegate: 3, startMonthDay: [7, 8] as [number, number], midweekEvery: 6 },
  { id: 'L3', name: 'Touchline League One', short: 'League 1', tier: 3, promote: 3, relegate: 0, startMonthDay: [7, 22] as [number, number], midweekEvery: 5 },
];
