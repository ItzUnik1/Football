// Name pools and club definitions. Every club, player and manager is fictional.

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
const PALETTE: [string, string][] = [
  ['#b45309', '#fef3c7'], ['#0f766e', '#f0fdfa'], ['#9d174d', '#fdf2f8'], ['#1e40af', '#dbeafe'], ['#4d7c0f', '#ecfccb'], ['#7f1d1d', '#fecaca'],
  ['#155e75', '#cffafe'], ['#6b21a8', '#f3e8ff'], ['#c2410c', '#ffedd5'], ['#1f2937', '#fde047'], ['#064e3b', '#a7f3d0'], ['#3730a3', '#e0e7ff'],
];
const SUFFIX = ['Road', 'Park', 'Lane', 'Ground', 'Field', 'Stadium'];

export function lowerClubDefs(): { def: ClubDef; tier: number }[] {
  const out: { def: ClubDef; tier: number }[] = [];
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
