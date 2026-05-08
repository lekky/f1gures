// f1gures — 2026 season data (speculative / illustrative)
// Note: this is fan-made fictional data for design purposes.

export function buildFallback() {

  const teams = [
    { id: 'mclaren',  name: 'McLaren',          short: 'MCL', color: '#FF8000' },
    { id: 'ferrari',  name: 'Ferrari',          short: 'FER', color: '#E80020' },
    { id: 'mercedes', name: 'Mercedes',         short: 'MER', color: '#27F4D2' },
    { id: 'redbull',  name: 'Red Bull Racing',  short: 'RBR', color: '#3671C6' },
    { id: 'aston',    name: 'Aston Martin',     short: 'AST', color: '#229971' },
    { id: 'alpine',   name: 'Alpine',           short: 'ALP', color: '#0093CC' },
    { id: 'williams', name: 'Williams',         short: 'WIL', color: '#64C4FF' },
    { id: 'rb',       name: 'Racing Bulls',     short: 'RBL', color: '#6692FF' },
    { id: 'sauber',   name: 'Kick Sauber',      short: 'SAU', color: '#52E252' },
    { id: 'haas',     name: 'Haas',             short: 'HAA', color: '#B6BABD' },
  ];

  // Drivers — 2026 speculative grid. Names/numbers are illustrative.
  // jolpicaId matches Jolpica/Ergast's driverId — used by api.js to fetch live
  // career stats. Keep in sync if a driver is added/replaced.
  const drivers = [
    { id: 'NOR', num: 4,  first: 'Lando',     last: 'Norris',     code: 'NOR', country: 'GB',  flag: '🇬🇧', team: 'mclaren',  jolpicaId: 'norris'         },
    { id: 'PIA', num: 81, first: 'Oscar',     last: 'Piastri',    code: 'PIA', country: 'AU',  flag: '🇦🇺', team: 'mclaren',  jolpicaId: 'piastri'        },
    { id: 'LEC', num: 16, first: 'Charles',   last: 'Leclerc',    code: 'LEC', country: 'MC',  flag: '🇲🇨', team: 'ferrari',  jolpicaId: 'leclerc'        },
    { id: 'HAM', num: 44, first: 'Lewis',     last: 'Hamilton',   code: 'HAM', country: 'GB',  flag: '🇬🇧', team: 'ferrari',  jolpicaId: 'hamilton'       },
    { id: 'RUS', num: 63, first: 'George',    last: 'Russell',    code: 'RUS', country: 'GB',  flag: '🇬🇧', team: 'mercedes', jolpicaId: 'russell'        },
    { id: 'ANT', num: 12, first: 'Andrea K.', last: 'Antonelli',  code: 'ANT', country: 'IT',  flag: '🇮🇹', team: 'mercedes', jolpicaId: 'antonelli'      },
    { id: 'VER', num: 1,  first: 'Max',       last: 'Verstappen', code: 'VER', country: 'NL',  flag: '🇳🇱', team: 'redbull',  jolpicaId: 'max_verstappen' },
    { id: 'TSU', num: 22, first: 'Yuki',      last: 'Tsunoda',    code: 'TSU', country: 'JP',  flag: '🇯🇵', team: 'redbull',  jolpicaId: 'tsunoda'        },
    { id: 'ALO', num: 14, first: 'Fernando',  last: 'Alonso',     code: 'ALO', country: 'ES',  flag: '🇪🇸', team: 'aston',    jolpicaId: 'alonso'         },
    { id: 'STR', num: 18, first: 'Lance',     last: 'Stroll',     code: 'STR', country: 'CA',  flag: '🇨🇦', team: 'aston',    jolpicaId: 'stroll'         },
    { id: 'GAS', num: 10, first: 'Pierre',    last: 'Gasly',      code: 'GAS', country: 'FR',  flag: '🇫🇷', team: 'alpine',   jolpicaId: 'gasly'          },
    { id: 'DOO', num: 7,  first: 'Jack',      last: 'Doohan',     code: 'DOO', country: 'AU',  flag: '🇦🇺', team: 'alpine',   jolpicaId: 'doohan'         },
    { id: 'ALB', num: 23, first: 'Alex',      last: 'Albon',      code: 'ALB', country: 'TH',  flag: '🇹🇭', team: 'williams', jolpicaId: 'albon'          },
    { id: 'SAI', num: 55, first: 'Carlos',    last: 'Sainz',      code: 'SAI', country: 'ES',  flag: '🇪🇸', team: 'williams', jolpicaId: 'sainz'          },
    { id: 'LAW', num: 30, first: 'Liam',      last: 'Lawson',     code: 'LAW', country: 'NZ',  flag: '🇳🇿', team: 'rb',       jolpicaId: 'lawson'         },
    { id: 'HAD', num: 6,  first: 'Isack',     last: 'Hadjar',     code: 'HAD', country: 'FR',  flag: '🇫🇷', team: 'rb',       jolpicaId: 'hadjar'         },
    { id: 'HUL', num: 27, first: 'Nico',      last: 'Hülkenberg', code: 'HUL', country: 'DE',  flag: '🇩🇪', team: 'sauber',   jolpicaId: 'hulkenberg'     },
    { id: 'BOR', num: 5,  first: 'Gabriel',   last: 'Bortoleto',  code: 'BOR', country: 'BR',  flag: '🇧🇷', team: 'sauber',   jolpicaId: 'bortoleto'      },
    { id: 'OCO', num: 31, first: 'Esteban',   last: 'Ocon',       code: 'OCO', country: 'FR',  flag: '🇫🇷', team: 'haas',     jolpicaId: 'ocon'           },
    { id: 'BEA', num: 87, first: 'Oliver',    last: 'Bearman',    code: 'BEA', country: 'GB',  flag: '🇬🇧', team: 'haas',     jolpicaId: 'bearman'        },
  ];

  // 2026 calendar — partial set, 24 rounds. First 6 completed.
  const calendar = [
    { round: 1,  name: 'Bahrain Grand Prix',        circuit: 'bahrain',   country: 'BH', flag: '🇧🇭', date: '2026-03-08', sprint: false, status: 'completed' },
    { round: 2,  name: 'Saudi Arabian Grand Prix',  circuit: 'jeddah',    country: 'SA', flag: '🇸🇦', date: '2026-03-15', sprint: false, status: 'completed' },
    { round: 3,  name: 'Australian Grand Prix',     circuit: 'albert',    country: 'AU', flag: '🇦🇺', date: '2026-03-29', sprint: false, status: 'completed' },
    { round: 4,  name: 'Japanese Grand Prix',       circuit: 'suzuka',    country: 'JP', flag: '🇯🇵', date: '2026-04-12', sprint: false, status: 'completed' },
    { round: 5,  name: 'Chinese Grand Prix',        circuit: 'shanghai',  country: 'CN', flag: '🇨🇳', date: '2026-04-19', sprint: true,  status: 'completed' },
    { round: 6,  name: 'Miami Grand Prix',          circuit: 'miami',     country: 'US', flag: '🇺🇸', date: '2026-05-03', sprint: true,  status: 'completed' },
    { round: 7,  name: 'Emilia Romagna Grand Prix', circuit: 'imola',     country: 'IT', flag: '🇮🇹', date: '2026-05-17', sprint: false, status: 'next' },
    { round: 8,  name: 'Monaco Grand Prix',         circuit: 'monaco',    country: 'MC', flag: '🇲🇨', date: '2026-05-24', sprint: false, status: 'upcoming' },
    { round: 9,  name: 'Spanish Grand Prix',        circuit: 'catalunya', country: 'ES', flag: '🇪🇸', date: '2026-06-07', sprint: false, status: 'upcoming' },
    { round: 10, name: 'Canadian Grand Prix',       circuit: 'montreal',  country: 'CA', flag: '🇨🇦', date: '2026-06-14', sprint: false, status: 'upcoming' },
    { round: 11, name: 'Austrian Grand Prix',       circuit: 'spielberg', country: 'AT', flag: '🇦🇹', date: '2026-06-28', sprint: true,  status: 'upcoming' },
    { round: 12, name: 'British Grand Prix',        circuit: 'silverstone', country: 'GB', flag: '🇬🇧', date: '2026-07-05', sprint: false, status: 'upcoming' },
    { round: 13, name: 'Belgian Grand Prix',        circuit: 'spa',       country: 'BE', flag: '🇧🇪', date: '2026-07-26', sprint: true,  status: 'upcoming' },
    { round: 14, name: 'Hungarian Grand Prix',      circuit: 'hungaroring', country: 'HU', flag: '🇭🇺', date: '2026-08-02', sprint: false, status: 'upcoming' },
    { round: 15, name: 'Dutch Grand Prix',          circuit: 'zandvoort', country: 'NL', flag: '🇳🇱', date: '2026-08-23', sprint: false, status: 'upcoming' },
    { round: 16, name: 'Italian Grand Prix',        circuit: 'monza',     country: 'IT', flag: '🇮🇹', date: '2026-09-06', sprint: false, status: 'upcoming' },
    { round: 17, name: 'Azerbaijan Grand Prix',     circuit: 'baku',      country: 'AZ', flag: '🇦🇿', date: '2026-09-20', sprint: false, status: 'upcoming' },
    { round: 18, name: 'Singapore Grand Prix',      circuit: 'marina',    country: 'SG', flag: '🇸🇬', date: '2026-10-04', sprint: false, status: 'upcoming' },
    { round: 19, name: 'United States Grand Prix',  circuit: 'cota',      country: 'US', flag: '🇺🇸', date: '2026-10-25', sprint: true,  status: 'upcoming' },
    { round: 20, name: 'Mexico City Grand Prix',    circuit: 'rodriguez', country: 'MX', flag: '🇲🇽', date: '2026-11-01', sprint: false, status: 'upcoming' },
    { round: 21, name: 'São Paulo Grand Prix',      circuit: 'interlagos', country: 'BR', flag: '🇧🇷', date: '2026-11-08', sprint: true,  status: 'upcoming' },
    { round: 22, name: 'Las Vegas Grand Prix',      circuit: 'lasvegas',  country: 'US', flag: '🇺🇸', date: '2026-11-21', sprint: false, status: 'upcoming' },
    { round: 23, name: 'Qatar Grand Prix',          circuit: 'losail',    country: 'QA', flag: '🇶🇦', date: '2026-11-29', sprint: true,  status: 'upcoming' },
    { round: 24, name: 'Abu Dhabi Grand Prix',      circuit: 'yas',       country: 'AE', flag: '🇦🇪', date: '2026-12-06', sprint: false, status: 'upcoming' },
  ];

  // Circuit details
  const circuits = {
    bahrain:    { name: 'Bahrain International Circuit', city: 'Sakhir',         country: 'Bahrain',         firstYear: 2004, races: 21, length: 5.412, laps: 57, corners: 15, longestStraight: 1090, drsZones: 3, tyreDeg: 'High',   overtaking: 'High',   type: 'Permanent', weather: 'Hot & Dry',     lapRecord: { driver: 'Pedro de la Rosa', time: '1:31.447', year: 2005 }, blurb: 'Desert circuit with abrasive surface and heavy tyre wear. Long straights into heavy braking zones reward strong traction and rear-tyre management.' },
    jeddah:     { name: 'Jeddah Corniche Circuit',       city: 'Jeddah',         country: 'Saudi Arabia',    firstYear: 2021, races: 6,  length: 6.174, laps: 50, corners: 27, longestStraight: 1250, drsZones: 3, tyreDeg: 'Low',    overtaking: 'Medium', type: 'Street',    weather: 'Hot & Dry',     lapRecord: { driver: 'Lewis Hamilton', time: '1:30.734', year: 2021 }, blurb: 'Fastest street circuit on the calendar. Walls hug the racing line through long, blind, high-commitment kinks — qualifying is the gamble of the year.' },
    albert:     { name: 'Albert Park Circuit',           city: 'Melbourne',      country: 'Australia',       firstYear: 1996, races: 28, length: 5.278, laps: 58, corners: 14, longestStraight: 870,  drsZones: 4, tyreDeg: 'Medium', overtaking: 'Medium', type: 'Street',    weather: 'Changeable',    lapRecord: { driver: 'Charles Leclerc', time: '1:19.813', year: 2024 }, blurb: 'Semi-permanent parkland circuit. Recent reprofiling added flat-out sections and four DRS zones, transforming a processional race into a strategic battle.' },
    suzuka:     { name: 'Suzuka International Racing Course', city: 'Suzuka',     country: 'Japan',           firstYear: 1987, races: 37, length: 5.807, laps: 53, corners: 18, longestStraight: 1200, drsZones: 2, tyreDeg: 'High',   overtaking: 'Medium', type: 'Permanent', weather: 'Changeable',    lapRecord: { driver: 'Lewis Hamilton', time: '1:30.983', year: 2019 }, blurb: 'Drivers\' favourite. Figure-of-eight layout with the iconic Esses, 130R and Spoon — flowing high-speed corners that punish error and reward commitment.' },
    shanghai:   { name: 'Shanghai International Circuit', city: 'Shanghai',      country: 'China',           firstYear: 2004, races: 18, length: 5.451, laps: 56, corners: 16, longestStraight: 1170, drsZones: 2, tyreDeg: 'Medium', overtaking: 'High',   type: 'Permanent', weather: 'Changeable',    lapRecord: { driver: 'Michael Schumacher', time: '1:32.238', year: 2004 }, blurb: 'Hermann Tilke design dominated by the spiralling Turn 1–3 complex and a kilometre-long back straight feeding the calendar\'s heaviest braking zone.' },
    miami:      { name: 'Miami International Autodrome', city: 'Miami Gardens',  country: 'United States',   firstYear: 2022, races: 5,  length: 5.412, laps: 57, corners: 19, longestStraight: 1280, drsZones: 3, tyreDeg: 'Medium', overtaking: 'Medium', type: 'Street',    weather: 'Hot & Humid',   lapRecord: { driver: 'Max Verstappen', time: '1:29.708', year: 2023 }, blurb: 'Temporary circuit threading the Hard Rock Stadium complex. Three distinct sectors — slow infield, flat-out flow, twisty technical — make set-up a compromise.' },
    imola:      { name: 'Autodromo Enzo e Dino Ferrari', city: 'Imola',          country: 'Italy',           firstYear: 1980, races: 30, length: 4.909, laps: 63, corners: 19, longestStraight: 640,  drsZones: 1, tyreDeg: 'Medium', overtaking: 'Low',    type: 'Permanent', weather: 'Changeable',    lapRecord: { driver: 'Lewis Hamilton', time: '1:15.484', year: 2020 }, blurb: 'Old-school Italian circuit with kerbs that bite. Narrow, undulating and starved of overtaking spots — Saturday is everything.' },
    monaco:     { name: 'Circuit de Monaco',             city: 'Monte Carlo',    country: 'Monaco',          firstYear: 1950, races: 71, length: 3.337, laps: 78, corners: 19, longestStraight: 670,  drsZones: 1, tyreDeg: 'Low',    overtaking: 'Low',    type: 'Street',    weather: 'Mild',          lapRecord: { driver: 'Lewis Hamilton', time: '1:12.909', year: 2021 }, blurb: 'The crown jewel. Barriers six inches off the racing line, no run-off, and an overtake almost a luxury — pole position is half the win.' },
    catalunya:  { name: 'Circuit de Barcelona-Catalunya', city: 'Montmeló',      country: 'Spain',           firstYear: 1991, races: 34, length: 4.657, laps: 66, corners: 14, longestStraight: 1047, drsZones: 2, tyreDeg: 'High',   overtaking: 'Medium', type: 'Permanent', weather: 'Mild & Dry',    lapRecord: { driver: 'Max Verstappen', time: '1:16.330', year: 2023 }, blurb: 'The aerodynamic benchmark. Every type of corner, abrasive tarmac, and prevailing wind that exposes weak rear-end downforce.' },
    montreal:   { name: 'Circuit Gilles Villeneuve',     city: 'Montréal',       country: 'Canada',          firstYear: 1978, races: 43, length: 4.361, laps: 70, corners: 14, longestStraight: 850,  drsZones: 3, tyreDeg: 'Medium', overtaking: 'High',   type: 'Permanent', weather: 'Changeable',    lapRecord: { driver: 'Valtteri Bottas', time: '1:13.078', year: 2019 }, blurb: 'Île Notre-Dame park circuit. Long straights, heavy braking and the infamous Wall of Champions make engine and brake management the priority.' },
    spielberg:  { name: 'Red Bull Ring',                 city: 'Spielberg',      country: 'Austria',         firstYear: 1970, races: 36, length: 4.318, laps: 71, corners: 10, longestStraight: 770,  drsZones: 3, tyreDeg: 'Medium', overtaking: 'High',   type: 'Permanent', weather: 'Changeable',    lapRecord: { driver: 'Carlos Sainz', time: '1:05.619', year: 2020 }, blurb: 'Short, fast and dramatic. Three uphill straights into heavy braking zones make for a lap that\'s done in barely over a minute — and three DRS zones that keep the field honest.' },
    silverstone:{ name: 'Silverstone Circuit',           city: 'Silverstone',    country: 'United Kingdom',  firstYear: 1950, races: 60, length: 5.891, laps: 52, corners: 18, longestStraight: 770,  drsZones: 2, tyreDeg: 'High',   overtaking: 'High',   type: 'Permanent', weather: 'Changeable',    lapRecord: { driver: 'Max Verstappen', time: '1:27.097', year: 2020 }, blurb: 'Home of British motorsport. Maggotts–Becketts–Chapel is the most demanding sequence in the sport — high-speed, high-load, and unforgiving.' },
    spa:        { name: 'Circuit de Spa-Francorchamps',  city: 'Stavelot',       country: 'Belgium',         firstYear: 1950, races: 56, length: 7.004, laps: 44, corners: 19, longestStraight: 1900, drsZones: 2, tyreDeg: 'High',   overtaking: 'High',   type: 'Permanent', weather: 'Wet & Variable',lapRecord: { driver: 'Valtteri Bottas', time: '1:46.286', year: 2018 }, blurb: 'The longest lap of the year. Eau Rouge–Raidillon climbs blind into the Kemmel straight; weather can flip the race in a single sector.' },
    hungaroring:{ name: 'Hungaroring',                   city: 'Mogyoród',       country: 'Hungary',         firstYear: 1986, races: 39, length: 4.381, laps: 70, corners: 14, longestStraight: 700,  drsZones: 1, tyreDeg: 'Medium', overtaking: 'Low',    type: 'Permanent', weather: 'Hot & Dry',     lapRecord: { driver: 'Lewis Hamilton', time: '1:16.627', year: 2020 }, blurb: '"Monaco without the walls." Tight, twisting and hot — track position is everything and the strategy variance is among the highest of the year.' },
    zandvoort:  { name: 'Circuit Zandvoort',             city: 'Zandvoort',      country: 'Netherlands',     firstYear: 1952, races: 36, length: 4.259, laps: 72, corners: 14, longestStraight: 660,  drsZones: 2, tyreDeg: 'High',   overtaking: 'Low',    type: 'Permanent', weather: 'Coastal',       lapRecord: { driver: 'Lewis Hamilton', time: '1:11.097', year: 2021 }, blurb: 'Banked seaside circuit. Two banked corners (Hugenholtz and Arie Luyendyk) let drivers carry full throttle where physics says they shouldn\'t.' },
    monza:      { name: 'Autodromo Nazionale di Monza',  city: 'Monza',          country: 'Italy',           firstYear: 1950, races: 74, length: 5.793, laps: 53, corners: 11, longestStraight: 1130, drsZones: 2, tyreDeg: 'Low',    overtaking: 'High',   type: 'Permanent', weather: 'Mild & Dry',    lapRecord: { driver: 'Rubens Barrichello', time: '1:21.046', year: 2004 }, blurb: 'The Temple of Speed. Lowest-downforce setup of the year, four heavy-braking chicanes, and slipstream battles that decide qualifying by hundredths.' },
    baku:       { name: 'Baku City Circuit',             city: 'Baku',           country: 'Azerbaijan',      firstYear: 2016, races: 9,  length: 6.003, laps: 51, corners: 20, longestStraight: 2200, drsZones: 2, tyreDeg: 'Low',    overtaking: 'High',   type: 'Street',    weather: 'Mild',          lapRecord: { driver: 'Charles Leclerc', time: '1:43.009', year: 2019 }, blurb: 'Two-kilometre flat-out blast meets the medieval old-town squeeze. High-speed slipstream chess with chaos never more than a lap away.' },
    marina:     { name: 'Marina Bay Street Circuit',     city: 'Singapore',      country: 'Singapore',       firstYear: 2008, races: 16, length: 4.940, laps: 62, corners: 19, longestStraight: 830,  drsZones: 3, tyreDeg: 'Medium', overtaking: 'Low',    type: 'Street',    weather: 'Hot & Humid',   lapRecord: { driver: 'Lewis Hamilton', time: '1:35.867', year: 2023 }, blurb: 'The hardest physical race of the year. Two hours under the lights, 100% humidity, and a layout where a brush of the wall ends the night.' },
    cota:       { name: 'Circuit of the Americas',       city: 'Austin',         country: 'United States',   firstYear: 2012, races: 13, length: 5.513, laps: 56, corners: 20, longestStraight: 1010, drsZones: 2, tyreDeg: 'Medium', overtaking: 'High',   type: 'Permanent', weather: 'Mild',          lapRecord: { driver: 'Charles Leclerc', time: '1:36.169', year: 2019 }, blurb: 'Steeply uphill Turn 1, the Maggotts-inspired esses, and a layout that borrows the best corners from circuits all over the world.' },
    rodriguez:  { name: 'Autódromo Hermanos Rodríguez',  city: 'Mexico City',    country: 'Mexico',          firstYear: 1963, races: 23, length: 4.304, laps: 71, corners: 17, longestStraight: 1200, drsZones: 3, tyreDeg: 'Low',    overtaking: 'High',   type: 'Permanent', weather: 'High Altitude', lapRecord: { driver: 'Valtteri Bottas', time: '1:17.774', year: 2021 }, blurb: 'Highest-altitude circuit on the calendar. Thin air punishes cooling, slashes downforce, and turns the start straight into the longest of the year.' },
    interlagos: { name: 'Autódromo José Carlos Pace',    city: 'São Paulo',      country: 'Brazil',          firstYear: 1973, races: 41, length: 4.309, laps: 71, corners: 15, longestStraight: 800,  drsZones: 2, tyreDeg: 'Medium', overtaking: 'High',   type: 'Permanent', weather: 'Wet & Variable',lapRecord: { driver: 'Valtteri Bottas', time: '1:10.540', year: 2018 }, blurb: 'Anti-clockwise, undulating, weather-tossed. Short lap, big championship moments — Interlagos has decided more titles than any modern circuit.' },
    lasvegas:   { name: 'Las Vegas Strip Circuit',       city: 'Las Vegas',      country: 'United States',   firstYear: 2023, races: 3,  length: 6.201, laps: 50, corners: 17, longestStraight: 1900, drsZones: 2, tyreDeg: 'Low',    overtaking: 'Medium', type: 'Street',    weather: 'Cold Night',    lapRecord: { driver: 'Oscar Piastri', time: '1:34.876', year: 2024 }, blurb: 'Night race down the Strip. Long straights, cold ambient temperatures and a constantly evolving surface that punishes set-up assumptions.' },
    losail:     { name: 'Lusail International Circuit',  city: 'Lusail',         country: 'Qatar',           firstYear: 2021, races: 4,  length: 5.419, laps: 57, corners: 16, longestStraight: 1068, drsZones: 1, tyreDeg: 'High',   overtaking: 'Medium', type: 'Permanent', weather: 'Hot Night',     lapRecord: { driver: 'Lando Norris', time: '1:24.319', year: 2024 }, blurb: 'Fast, flowing and brutal on the body. High-speed corners barely off-throttle make it the highest sustained G-loading on the calendar.' },
    madring:    { name: 'Madrid Street Circuit',         city: 'Madrid',          country: 'Spain',           firstYear: 2026, races: 1,  length: 5.476, laps: 52, corners: 21, longestStraight: 1230, drsZones: 3, tyreDeg: 'Medium', overtaking: 'Medium', type: 'Street',    weather: 'Mild & Dry',    lapRecord: { driver: '—', time: '—', year: 2026 }, blurb: 'New street circuit threading the IFEMA exhibition centre and surrounding roads. Long straights feed heavy braking zones, with a mix of tight technical sections and fast sweepers.' },
    yas:        { name: 'Yas Marina Circuit',            city: 'Abu Dhabi',      country: 'United Arab Emirates', firstYear: 2009, races: 17, length: 5.281, laps: 58, corners: 16, longestStraight: 1190, drsZones: 2, tyreDeg: 'Low',    overtaking: 'Medium', type: 'Permanent', weather: 'Mild Night',    lapRecord: { driver: 'Max Verstappen', time: '1:26.103', year: 2021 }, blurb: 'Twilight finale circuit. Reprofiled in 2021 for more flow, the season closer threads marina hotels and yacht-lined harbours under the lights.' },
  };

  // Helper for points: 25/18/15/12/10/8/6/4/2/1
  const POINTS = [25,18,15,12,10,8,6,4,2,1];

  // Race results — completed rounds only.
  // Each entry: round, polesitter (driver code), fastestLap (driver), winner (driver), order (driver codes p1..p20), grid (driver codes start order), dnfs ['XYZ'], q (qualifying times), sprintWinner
  const results = {
    1: { // Bahrain
      pole: 'NOR', fastest: 'PIA',
      order: ['NOR','PIA','VER','LEC','RUS','HAM','ANT','ALO','SAI','TSU','ALB','HAD','GAS','BEA','HUL','OCO','LAW','BOR','STR','DOO'],
      grid:  ['NOR','PIA','VER','LEC','RUS','HAM','ANT','SAI','ALO','TSU','HAD','ALB','GAS','HUL','BEA','OCO','LAW','BOR','DOO','STR'],
      dnfs: [],
    },
    2: { // Jeddah
      pole: 'PIA', fastest: 'NOR',
      order: ['PIA','NOR','LEC','VER','HAM','RUS','ANT','SAI','ALB','TSU','ALO','GAS','HAD','LAW','HUL','BEA','BOR','OCO','DOO','STR'],
      grid:  ['PIA','VER','LEC','NOR','HAM','RUS','SAI','ALB','ANT','ALO','TSU','GAS','HAD','BEA','HUL','LAW','OCO','BOR','STR','DOO'],
      dnfs: [],
    },
    3: { // Australia
      pole: 'NOR', fastest: 'VER',
      order: ['VER','NOR','PIA','LEC','HAM','RUS','ANT','ALO','SAI','GAS','TSU','ALB','HUL','HAD','BEA','LAW','BOR','OCO','DOO','STR'],
      grid:  ['NOR','PIA','VER','LEC','HAM','RUS','ANT','ALO','SAI','GAS','TSU','ALB','HAD','HUL','BEA','LAW','OCO','BOR','DOO','STR'],
      dnfs: [],
    },
    4: { // Japan
      pole: 'VER', fastest: 'LEC',
      order: ['VER','PIA','NOR','LEC','HAM','RUS','ANT','TSU','ALB','SAI','ALO','GAS','HAD','BEA','LAW','HUL','BOR','OCO','DOO','STR'],
      grid:  ['VER','NOR','PIA','LEC','HAM','RUS','ANT','TSU','SAI','ALB','GAS','ALO','HAD','BEA','HUL','LAW','BOR','OCO','DOO','STR'],
      dnfs: [],
    },
    5: { // China — Sprint weekend
      pole: 'PIA', fastest: 'NOR',
      sprintWinner: 'NOR',
      order: ['PIA','NOR','LEC','HAM','VER','RUS','ANT','ALO','SAI','ALB','TSU','GAS','HAD','BEA','HUL','LAW','BOR','OCO','DOO','STR'],
      grid:  ['PIA','NOR','LEC','HAM','VER','RUS','ANT','ALO','SAI','ALB','TSU','GAS','HAD','BEA','HUL','LAW','BOR','OCO','STR','DOO'],
      dnfs: [],
    },
    6: { // Miami — Sprint weekend
      pole: 'NOR', fastest: 'PIA',
      sprintWinner: 'PIA',
      order: ['NOR','PIA','VER','LEC','RUS','HAM','ANT','SAI','ALB','ALO','TSU','GAS','HAD','BEA','HUL','LAW','BOR','OCO','STR','DOO'],
      grid:  ['NOR','VER','PIA','LEC','HAM','RUS','ANT','SAI','ALO','ALB','TSU','GAS','HAD','BEA','HUL','OCO','LAW','BOR','DOO','STR'],
      dnfs: [],
    },
  };

  // Generate qualifying times (illustrative). q3 has top 10, q2 top 15, q1 all 20.
  function genQuali(round) {
    const r = results[round];
    if (!r) return null;
    // Pole base time per circuit (rough)
    const baseByRound = { 1: 89.5, 2: 87.2, 3: 75.8, 4: 86.5, 5: 89.9, 6: 87.0 };
    const base = baseByRound[round] || 88.0;
    const grid = r.grid;
    const out = {};
    grid.forEach((code, i) => {
      const q1 = base + 0.6 + i * 0.06 + (Math.random() * 0.05);
      const q2 = i < 15 ? base + 0.25 + i * 0.045 : null;
      const q3 = i < 10 ? base + i * 0.058 : null;
      out[code] = {
        q1: fmtLap(q1),
        q2: q2 != null ? fmtLap(q2) : null,
        q3: q3 != null ? fmtLap(q3) : null,
      };
    });
    return out;
  }

  function fmtLap(secs) {
    const m = Math.floor(secs / 60);
    const s = (secs - m * 60).toFixed(3);
    return `${m}:${s.padStart(6, '0')}`;
  }

  function fmtGap(idx, baseSecs) {
    if (idx === 0) {
      // race time, ~ baseSecs * laps but we'll synthesise
      return `1:32:${(baseSecs % 60).toFixed(3).padStart(6,'0')}`;
    }
    const gap = idx * 1.85 + Math.random() * 1.5 + (idx > 6 ? idx * 0.3 : 0);
    return `+${gap.toFixed(3)}s`;
  }

  // Expose helpers — always return an object so screens don't crash on
  // unknown ids (historic data, transient API states, etc.).
  function driverById(code) {
    return drivers.find(d => d.id === code) ||
      { id: code, code: code || '—', first: '', last: code || 'Unknown', num: 0, flag: '🏳', team: '' };
  }
  function teamById(id) {
    return teams.find(t => t.id === id) ||
      { id: id || 'unknown', name: '—', short: '—', color: '#888888' };
  }

  // Compute season standings from results
  function computeStandings() {
    const driverPts = {};
    const driverWins = {};
    const driverPodiums = {};
    const driverFastest = {};
    const driverPoles = {};
    const driverDnfs = {};
    const lastRoundPos = {}; // for change indicator: position after round N-1

    drivers.forEach(d => {
      driverPts[d.id] = 0;
      driverWins[d.id] = 0;
      driverPodiums[d.id] = 0;
      driverFastest[d.id] = 0;
      driverPoles[d.id] = 0;
      driverDnfs[d.id] = 0;
    });

    const completedRounds = Object.keys(results).map(Number).sort((a,b)=>a-b);
    const lastRound = completedRounds[completedRounds.length - 1];
    const prevRound = completedRounds[completedRounds.length - 2];

    // Snapshots after each round
    const snapshots = {}; // round -> {code: cumPoints}

    completedRounds.forEach(r => {
      const res = results[r];
      res.order.forEach((code, i) => {
        if (i < 10) driverPts[code] += POINTS[i];
        if (i === 0) driverWins[code] += 1;
        if (i < 3) driverPodiums[code] += 1;
      });
      if (res.fastest && res.order.indexOf(res.fastest) < 10) driverPts[res.fastest] += 1;
      driverFastest[res.fastest] = (driverFastest[res.fastest] || 0) + 1;
      driverPoles[res.pole] = (driverPoles[res.pole] || 0) + 1;
      // Sprint points (1-8 -> 8,7,6,5,4,3,2,1) — for simplicity approximate top 4 from race order
      if (res.sprintWinner) {
        const sp = [res.sprintWinner];
        // Add sprint points to winner only for now, and a couple of others
        const sprintPoints = { [res.sprintWinner]: 8 };
        // Take next two from order excluding winner
        const others = res.order.filter(c => c !== res.sprintWinner).slice(0,7);
        others.forEach((c, i) => sprintPoints[c] = 7 - i);
        Object.entries(sprintPoints).forEach(([c, p]) => driverPts[c] += p);
      }
      (res.dnfs || []).forEach(c => driverDnfs[c] += 1);
      snapshots[r] = { ...driverPts };
    });

    // Compute current rankings
    const ranked = drivers.map(d => ({
      driver: d,
      points: driverPts[d.id],
      wins: driverWins[d.id],
      podiums: driverPodiums[d.id],
      fastestLaps: driverFastest[d.id],
      poles: driverPoles[d.id],
      dnfs: driverDnfs[d.id],
    })).sort((a,b) => b.points - a.points || b.wins - a.wins);

    // Compute prev round rankings for change indicator
    const prevPts = prevRound ? snapshots[prevRound] : null;
    const prevRanked = prevPts ? drivers.map(d => ({ id: d.id, points: prevPts[d.id] })).sort((a,b)=>b.points - a.points) : null;
    const prevRankMap = {};
    if (prevRanked) prevRanked.forEach((r, i) => prevRankMap[r.id] = i + 1);

    ranked.forEach((row, i) => {
      row.position = i + 1;
      const prevP = prevRankMap[row.driver.id];
      row.change = prevP ? prevP - row.position : 0;
    });

    // Constructor standings
    const teamPts = {}; const teamWins = {}; const teamPodiums = {};
    teams.forEach(t => { teamPts[t.id] = 0; teamWins[t.id] = 0; teamPodiums[t.id] = 0; });
    ranked.forEach(r => {
      teamPts[r.driver.team] += r.points;
      teamWins[r.driver.team] += r.wins;
      teamPodiums[r.driver.team] += r.podiums;
    });
    const teamRanked = teams.map(t => ({
      team: t,
      points: teamPts[t.id],
      wins: teamWins[t.id],
      podiums: teamPodiums[t.id],
      drivers: drivers.filter(d => d.team === t.id),
    })).sort((a,b)=> b.points - a.points || b.wins - a.wins);
    teamRanked.forEach((t,i) => t.position = i+1);

    // Per-round driver points progression
    const progression = {};
    drivers.forEach(d => progression[d.id] = []);
    completedRounds.forEach(r => {
      drivers.forEach(d => {
        progression[d.id].push({ round: r, points: snapshots[r][d.id] });
      });
    });

    // Per-round team progression
    const teamProgression = {};
    teams.forEach(t => teamProgression[t.id] = []);
    completedRounds.forEach(r => {
      const snap = snapshots[r];
      teams.forEach(t => {
        const pts = drivers.filter(d => d.team === t.id).reduce((sum, d) => sum + (snap[d.id] || 0), 0);
        teamProgression[t.id].push({ round: r, points: pts });
      });
    });

    return { drivers: ranked, teams: teamRanked, progression, teamProgression, completedRounds, lastRound };
  }

  return {
    teams, drivers, calendar, circuits, results, POINTS,
    driverById, teamById, computeStandings, genQuali, fmtLap, fmtGap,
    // Marker so screens can tell live data from bundled fallback.
    _source: 'fallback',
    // Static lookups & helpers that api.js re-uses.
    __statics: {
      circuits,        // hand-curated track characteristics (length, corners, lapRecord, blurb)
      teams,           // for color/short-code mapping when API doesn't have this team
      POINTS,
      fmtLap,
      fmtGap,
    },
    // Raw season payload for the fallback path — same shape api.js produces
    // from Jolpica responses.
    __rawSeason: { teams, drivers, calendar, results },
  };
}

// Build a data object from a /data/<year>.json bundle (same shape as
// scripts/fetch-season.mjs writes). Only the home page's historic view
// (SeasonAtGlance) consumes this currently — other listing pages still
// use buildFallback's 2026 data. PR 2 wires year-aware data more broadly.
//
// Helper closures (driverById/teamById/computeStandings) are duplicated
// from buildFallback above rather than shared, to keep this change low-risk
// to the (working) fallback path. Worth deduplicating in PR 2 / 3.
export function buildFromYearJson(json) {
  const teams = (json && json.teams) || [];
  const drivers = (json && json.drivers) || [];
  const calendar = (json && json.calendar) || [];
  const results = (json && json.results) || {};
  const seasonYear = (json && json.seasonYear) || '';
  const POINTS = [25,18,15,12,10,8,6,4,2,1];

  function driverById(code) {
    return drivers.find(d => d.id === code) ||
      { id: code, code: code || '—', first: '', last: code || 'Unknown', num: 0, flag: '🏳', team: '' };
  }
  function teamById(id) {
    return teams.find(t => t.id === id) ||
      { id: id || 'unknown', name: '—', short: '—', color: '#888888' };
  }

  function computeStandings() {
    const driverPts = {}, driverWins = {}, driverPodiums = {}, driverFastest = {}, driverPoles = {}, driverDnfs = {};
    drivers.forEach(d => {
      driverPts[d.id] = 0; driverWins[d.id] = 0; driverPodiums[d.id] = 0;
      driverFastest[d.id] = 0; driverPoles[d.id] = 0; driverDnfs[d.id] = 0;
    });
    const completedRounds = Object.keys(results).map(Number).sort((a,b)=>a-b);
    const lastRound = completedRounds[completedRounds.length - 1];
    const prevRound = completedRounds[completedRounds.length - 2];
    const snapshots = {};

    completedRounds.forEach(r => {
      const res = results[r];
      (res.order || []).forEach((code, i) => {
        if (driverPts[code] === undefined) { driverPts[code] = 0; driverWins[code] = 0; driverPodiums[code] = 0; driverFastest[code] = 0; driverPoles[code] = 0; driverDnfs[code] = 0; }
        if (i < 10) driverPts[code] += POINTS[i];
        if (i === 0) driverWins[code] += 1;
        if (i < 3) driverPodiums[code] += 1;
      });
      if (res.fastest && (res.order || []).indexOf(res.fastest) < 10) driverPts[res.fastest] = (driverPts[res.fastest] || 0) + 1;
      if (res.fastest) driverFastest[res.fastest] = (driverFastest[res.fastest] || 0) + 1;
      if (res.pole) driverPoles[res.pole] = (driverPoles[res.pole] || 0) + 1;
      if (res.sprintWinner) {
        const sprintPoints = { [res.sprintWinner]: 8 };
        const others = (res.order || []).filter(c => c !== res.sprintWinner).slice(0, 7);
        others.forEach((c, i) => sprintPoints[c] = 7 - i);
        Object.entries(sprintPoints).forEach(([c, p]) => driverPts[c] = (driverPts[c] || 0) + p);
      }
      (res.dnfs || []).forEach(c => driverDnfs[c] = (driverDnfs[c] || 0) + 1);
      snapshots[r] = { ...driverPts };
    });

    const ranked = drivers.map(d => ({
      driver: d,
      points: driverPts[d.id] || 0,
      wins: driverWins[d.id] || 0,
      podiums: driverPodiums[d.id] || 0,
      fastestLaps: driverFastest[d.id] || 0,
      poles: driverPoles[d.id] || 0,
      dnfs: driverDnfs[d.id] || 0,
    })).sort((a,b) => b.points - a.points || b.wins - a.wins);

    const prevPts = prevRound ? snapshots[prevRound] : null;
    const prevRanked = prevPts ? drivers.map(d => ({ id: d.id, points: prevPts[d.id] || 0 })).sort((a,b)=> b.points - a.points) : null;
    const prevRankMap = {};
    if (prevRanked) prevRanked.forEach((r, i) => prevRankMap[r.id] = i + 1);
    ranked.forEach((row, i) => {
      row.position = i + 1;
      const prevP = prevRankMap[row.driver.id];
      row.change = prevP ? prevP - row.position : 0;
    });

    const teamPts = {}, teamWins = {}, teamPodiums = {};
    teams.forEach(t => { teamPts[t.id] = 0; teamWins[t.id] = 0; teamPodiums[t.id] = 0; });
    ranked.forEach(r => {
      teamPts[r.driver.team] = (teamPts[r.driver.team] || 0) + r.points;
      teamWins[r.driver.team] = (teamWins[r.driver.team] || 0) + r.wins;
      teamPodiums[r.driver.team] = (teamPodiums[r.driver.team] || 0) + r.podiums;
    });
    const teamRanked = teams.map(t => ({
      team: t,
      points: teamPts[t.id] || 0,
      wins: teamWins[t.id] || 0,
      podiums: teamPodiums[t.id] || 0,
      drivers: drivers.filter(d => d.team === t.id),
    })).sort((a,b)=> b.points - a.points || b.wins - a.wins);
    teamRanked.forEach((t,i) => t.position = i+1);

    const progression = {};
    drivers.forEach(d => progression[d.id] = []);
    completedRounds.forEach(r => {
      drivers.forEach(d => {
        progression[d.id].push({ round: r, points: (snapshots[r] && snapshots[r][d.id]) || 0 });
      });
    });
    const teamProgression = {};
    teams.forEach(t => teamProgression[t.id] = []);
    completedRounds.forEach(r => {
      const snap = snapshots[r] || {};
      teams.forEach(t => {
        const pts = drivers.filter(d => d.team === t.id).reduce((sum, d) => sum + (snap[d.id] || 0), 0);
        teamProgression[t.id].push({ round: r, points: pts });
      });
    });

    return { drivers: ranked, teams: teamRanked, progression, teamProgression, completedRounds, lastRound };
  }

  return {
    teams, drivers, calendar, circuits: {}, results, POINTS, seasonYear,
    driverById, teamById, computeStandings,
    _source: 'year-json',
    __rawSeason: { teams, drivers, calendar, results },
  };
}
