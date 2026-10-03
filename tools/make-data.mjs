// Writes data.js: the synthetic export of home-service job postings.
// Run from the project folder: node tools/make-data.mjs
// The page never runs this file. It exists so the data can be rebuilt and
// checked. Every shop, domain and posting is invented; domains use the
// reserved .example ending so no real business is named.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DATE = '2026-09-30';

// ------------------------------------------------------------------ seeded random

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260930);
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function dayBetween(lo, hi) {
  const span = (Date.parse(hi) - Date.parse(lo)) / 86400000;
  return addDays(lo, randInt(0, span));
}
const WINDOW = {
  fresh: ['2026-09-01', '2026-09-24'],
  half: ['2026-08-03', '2026-08-24'],
  stale: ['2026-07-20', '2026-07-27'],
};

// ------------------------------------------------------------------ geography

const CITY_METRO = {
  Phoenix: 'Phoenix', Mesa: 'Phoenix', Chandler: 'Phoenix', Scottsdale: 'Phoenix', Tempe: 'Phoenix', Glendale: 'Phoenix',
  Dallas: 'Dallas', Plano: 'Dallas', 'Fort Worth': 'Dallas', Arlington: 'Dallas', Frisco: 'Dallas', Irving: 'Dallas',
  Tampa: 'Tampa', Clearwater: 'Tampa', 'St. Petersburg': 'Tampa', Brandon: 'Tampa',
  Atlanta: 'Atlanta', Marietta: 'Atlanta', Alpharetta: 'Atlanta', Decatur: 'Atlanta',
  Columbus: 'Columbus', Dublin: 'Columbus', Westerville: 'Columbus', 'Grove City': 'Columbus',
  Chicago: 'Chicago', Naperville: 'Chicago', Schaumburg: 'Chicago', Evanston: 'Chicago',
  Philadelphia: 'Philadelphia', 'King of Prussia': 'Philadelphia', Media: 'Philadelphia', 'Cherry Hill': 'Philadelphia',
  Newark: 'Northern New Jersey', Paterson: 'Northern New Jersey', Morristown: 'Northern New Jersey', Hackensack: 'Northern New Jersey',
  Tucson: 'Tucson',
  Wilmington: 'Wilmington',
};
const METROS = ['Phoenix', 'Dallas', 'Tampa', 'Atlanta', 'Columbus', 'Chicago', 'Philadelphia', 'Northern New Jersey'];
const REGIONS = {
  Phoenix: 'Sun Belt', Dallas: 'Sun Belt', Tampa: 'Sun Belt', Atlanta: 'Sun Belt',
  Columbus: 'Midwest', Chicago: 'Midwest',
  Philadelphia: 'Northeast', 'Northern New Jersey': 'Northeast',
};
const citiesIn = (metro) => Object.keys(CITY_METRO).filter((c) => CITY_METRO[c] === metro);

// ------------------------------------------------------------------ wording

const TECH_TITLES = {
  HVAC: ['HVAC Service Technician', 'HVAC Install Technician', 'HVAC Apprentice', 'Lead HVAC Installer', 'HVAC Maintenance Technician', 'Senior HVAC Service Technician'],
  Plumbing: ['Service Plumber', 'Plumbing Apprentice', 'Drain Cleaning Technician', 'Journeyman Plumber', 'Water Heater Install Technician'],
  Electrical: ['Residential Electrician', 'Electrician Apprentice', 'Service Electrician'],
  Roofing: ['Roof Repair Technician', 'Roofing Crew Lead'],
  Pest: ['Pest Control Technician', 'Termite Inspector'],
};
const SALES_TITLES = {
  HVAC: ['Comfort Advisor', 'HVAC Sales Technician', 'In-Home Sales Consultant'],
  Plumbing: ['Plumbing Sales Technician', 'In-Home Sales Consultant'],
  Electrical: ['Electrical Sales Technician'],
  Roofing: ['Roofing Sales Consultant', 'Storm Damage Sales Representative'],
  Pest: ['Residential Sales Consultant'],
};
const FOLLOW_TITLES = ['Estimate Follow-Up Coordinator', 'Inside Sales Representative', 'Sales Support Coordinator'];
const OFFICE_TITLES = ['Customer Service Representative', 'Dispatcher', 'Office Manager', 'Call Center Representative'];

const WORDS = {
  HVAC: { noun: 'heating and cooling', gear: 'furnaces, heat pumps and AC systems' },
  Plumbing: { noun: 'plumbing', gear: 'water heaters, drains and fixtures' },
  Mixed: { noun: 'heating, cooling and plumbing', gear: 'AC systems, furnaces and water heaters' },
  Electrical: { noun: 'electrical', gear: 'panels, circuits and lighting' },
  Roofing: { noun: 'roofing', gear: 'shingle and flat roofs' },
  Pest: { noun: 'pest control', gear: 'treatment plans and inspections' },
};
const wordsFor = (trades) => (trades.length > 1 ? WORDS.Mixed : WORDS[trades[0]]);

const TECH_DESC = [
  (w, c) => `Run residential ${w.noun} service calls across ${c} and nearby towns. You'll diagnose problems, explain repair and replacement options, and leave every home clean.`,
  (w, c) => `Work on ${w.gear} in homes around ${c}. Paid training, a take-home vehicle and steady year-round work.`,
  (w, c) => `We're growing our field team in ${c}. You'll handle maintenance visits, repairs and the occasional install, with a lead technician nearby when you need one.`,
];
const APPRENTICE_DESC = (w, c) => `No experience needed: we'll train you on ${w.gear} and pay for your certification. You'll ride along with a senior technician in ${c} from day one.`;
const COMMERCIAL_DESC = [
  (w, c) => `Service commercial rooftop units, chillers and building controls for property managers across ${c}. Day shift with an on-call rotation.`,
  (w, c) => `Install and repair piping in office buildings, warehouses and new construction around ${c}. Commercial and industrial work only.`,
];
const SALES_DESC = [
  (w, c) => `Meet homeowners in ${c} who asked about replacing their ${w.gear}, walk them through options and write the proposal on site. Leads are company generated, so there's no cold calling.`,
  (w, c) => `Run pre-scheduled in-home consultations around ${c}. Base pay plus commission, a company vehicle and a steady flow of booked appointments.`,
];
const FOLLOW_DESC = {
  'Estimate Follow-Up Coordinator': (w, c, first) => (first
    ? `This is a new role: our first estimate follow-up coordinator in ${c}. You'll call and text homeowners who received a repair or replacement estimate and haven't decided yet, answer their questions and book the next visit.`
    : `Call and text homeowners around ${c} who received a ${w.noun} estimate and haven't decided yet. You'll answer questions, book return visits and keep notes on every conversation.`),
  'Inside Sales Representative': (w, c) => `Work the open estimates our in-home team leaves behind, by phone and text, for homeowners around ${c}. You'll book return visits and log what each homeowner decides.`,
  'Sales Support Coordinator': () => 'Support our sales team by calling homeowners back on estimates from the last two weeks and scheduling second visits. Organized, friendly and comfortable on the phone all day.',
};
const OFFICE_DESC = {
  'Customer Service Representative': (w, c) => `Answer inbound calls, book service appointments and keep the schedule full for our ${c} team. You'll be the first voice our customers hear.`,
  Dispatcher: (w, c) => `Keep our technicians routed and on time across ${c}. You'll balance the board, update customers on arrival times and fit in same-day calls.`,
  'Office Manager': (w, c) => `Run the front office in ${c}: payroll support, permits, vendor bills and the phones. You'll keep the field team supplied and the paperwork current.`,
  'Call Center Representative': () => 'Take inbound calls from homeowners, book appointments and answer billing questions. Full training provided.',
};
const CSR_FOLLOW_UP_DESC = (w, c) => `Answer inbound calls and book service appointments for our ${c} team. You'll also call customers back on open estimates and note what they decide.`;

const SOFTWARE_LINES = {
  ST: ['ServiceTitan experience a plus.', "We run the business on ServiceTitan, and we'll train you on it.", 'Comfortable in ServiceTitan or willing to learn.'],
  HCP: ['We use Housecall Pro for scheduling and invoicing.', 'Housecall Pro experience helps.'],
  FE: ['FieldEdge experience a plus.'],
  SW: ['Successware experience preferred.'],
  JB: ['We schedule everything in Jobber.'],
};
const MEMBERSHIP_FIELD = ['Bonus for every maintenance club sign-up.', "You'll also offer our membership plan on every visit."];
const MEMBERSHIP_OFFICE = 'You\'ll also remind members when their maintenance club visit is due.';

function payFor(family, title) {
  if (family === 'tech') {
    if (/apprentice/i.test(title)) { const lo = randInt(16, 18); return { min: lo, max: lo + randInt(2, 4), per: 'hour' }; }
    const lo = randInt(22, 27); return { min: lo, max: lo + randInt(6, 10), per: 'hour' };
  }
  if (family === 'sales') { const lo = randInt(6, 8) * 10000; return { min: lo, max: lo + randInt(4, 7) * 10000, per: 'year' }; }
  if (family === 'followup') {
    if (chance(0.5)) { const lo = randInt(17, 20); return { min: lo, max: lo + randInt(3, 5), per: 'hour' }; }
    const lo = randInt(40, 46) * 1000; return { min: lo, max: lo + randInt(8, 12) * 1000, per: 'year' };
  }
  const lo = randInt(17, 20); return { min: lo, max: lo + randInt(3, 5), per: 'hour' };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ------------------------------------------------------------------ shops
// gen: generator-only settings, stripped before writing.
//   sw: software named in the posts (never stored on the shop itself)
//   jobs: f follow-up, s sales, t technician, o office, c CSR whose text describes estimate follow-up
//   age: per-family age class (fresh, half, stale); all: one class for every job
//   mem: a membership line in one post; newLoc: one extra technician job in a city outside its metros
//   board: 'unsourced' (job-board reposts only) or 'brand' (posts come from a franchise brand site)
//   staleExtra: extra listings older than 60 days; cross: allow random cross-posts (default true)

const NOTE = [
  (n) => `join our team of ${n} techs`,
  (n) => `${n} certified technicians and counting`,
  (n) => `a team of ${n} field technicians`,
  (n) => `${n} technicians on the road every day`,
];

function S(id, name, domain, trades, serviceMix, metro, locations, techs, gen = {}) {
  return { id, name, domain, trades, serviceMix, metro, locations, techs, franchise: gen.franchise || null, gen };
}
const NNJ = 'Northern New Jersey';
const SHOPS = [
  // Phoenix
  S('s01', 'Ridgeline Heating & Air', 'ridgelineair.example', ['HVAC'], 'residential', 'Phoenix', ['Phoenix', 'Mesa'], 26, { sw: 'ST', jobs: 'f1 t2 s1', mem: true, fCity: 'Mesa' }),
  S('s02', 'Ridgeline Heating and Air LLC', 'www.ridgelineair.example', ['HVAC'], 'residential', 'Phoenix', ['Chandler'], null, { sw: 'ST', planted: 'ridgelineLlc', cross: false }),
  S('s03', 'Saguaro Plumbing Co', 'saguaroplumbing.example', ['Plumbing'], 'residential', 'Phoenix', ['Phoenix', 'Tempe'], 18, { sw: 'HCP', jobs: 't2 s1 o1' }),
  S('s04', 'Copper Canyon Air', 'coppercanyonair.example', ['HVAC'], 'residential', 'Phoenix', ['Scottsdale', 'Phoenix'], 42, { sw: 'ST', jobs: 't5 s2' }),
  S('s05', 'Desert Bloom Electric', 'desertbloomelectric.example', ['Electrical'], 'residential', 'Phoenix', ['Phoenix'], 15, { sw: 'JB', jobs: 't2' }),
  S('s06', 'Sonoran Home Services', 'sonoranhome.example', ['HVAC', 'Plumbing'], 'mixed', 'Phoenix', ['Phoenix', 'Chandler'], 31, { sw: 'ST', jobs: 'f1 t1', newLoc: 'Tucson' }),
  S('s07', 'Mesa Verde Pest Control', 'mesaverdepest.example', ['Pest'], 'residential', 'Phoenix', ['Mesa'], 9, { sw: null, jobs: 't2' }),
  S('s08', 'Palo Verde Mechanical', 'paloverdemech.example', ['HVAC'], 'commercial-only', 'Phoenix', ['Phoenix', 'Tempe'], 60, { sw: 'ST', planted: 'commercial', titles: ['Commercial HVAC Technician', 'Controls Technician'], jobs: 'o1' }),
  // Dallas
  S('s09', 'Lone Oak Air Conditioning', 'loneoakair.example', ['HVAC'], 'residential', 'Dallas', ['Dallas', 'Plano'], 22, { sw: 'ST', jobs: 'f1 t2 s1', fDate: '2026-08-16', fTitle: 'Inside Sales Representative' }),
  S('s10', 'Trinity Plumbing & Drain', 'trinityplumbingdrain.example', ['Plumbing'], 'residential', 'Dallas', ['Dallas', 'Irving'], 16, { sw: 'ST', jobs: 'f1 t1', fTitle: 'Estimate Follow-Up Coordinator', payF: { min: 19, max: 23, per: 'hour' } }),
  S('s11', 'Bluebonnet Comfort Systems', 'bluebonnetcomfort.example', ['HVAC'], 'residential', 'Dallas', ['Frisco', 'Plano'], 35, { sw: 'ST', jobs: 's1 t3 o1', mem: true }),
  S('s12', 'Prairie Star Electric', 'prairiestarelectric.example', ['Electrical'], 'residential', 'Dallas', ['Fort Worth'], 12, { sw: 'HCP', jobs: 't1 s1' }),
  S('s13', 'Cedar Ridge Heating & Cooling', 'cedarridgehvac.example', ['HVAC'], 'residential', 'Dallas', ['Arlington'], 4, { sw: 'HCP', jobs: 't1' }),
  S('s14', 'North Texas Roofing Pros', 'ntxroofingpros.example', ['Roofing'], 'residential', 'Dallas', ['Dallas'], 14, { sw: null, jobs: 's1 t1' }),
  S('s15', 'Polar Peak Heating & Cooling of Dallas', 'polarpeakdallas.example', ['HVAC'], 'residential', 'Dallas', ['Dallas', 'Plano', 'Fort Worth'], 38, { franchise: 'Polar Peak', sw: 'ST', jobs: 'f1 s2 t2', board: 'brand', brandHost: 'careers.polarpeakbrand.example' }),
  S('s53', 'Mesquite Air & Heat', 'mesquiteair.example', ['HVAC'], 'residential', 'Dallas', ['Dallas'], 13, { sw: 'ST', jobs: 'o1', staleExtra: 2 }),
  // Tampa
  S('s16', 'Gulfside Air & Heat', 'gulfsideair.example', ['HVAC'], 'residential', 'Tampa', ['Tampa', 'Brandon'], 20, { sw: 'ST', planted: 'crossPost', cross: false }),
  S('s17', 'Bayshore Comfort Co', 'bayshorecomfort.example', ['HVAC'], 'residential', 'Tampa', ['Tampa', 'Clearwater', 'St. Petersburg'], 64, { sw: 'ST', planted: 'bigShop', cross: false }),
  S('s18', 'Suncoast Plumbing Services', 'suncoastplumbing.example', ['Plumbing'], 'residential', 'Tampa', ['Tampa', 'Clearwater'], 14, { sw: 'HCP', jobs: 'c1 t1 s1', mem: true }),
  S('s19', 'Pinellas Pest Defense', 'pinellaspest.example', ['Pest'], 'residential', 'Tampa', ['St. Petersburg'], 11, { sw: null, jobs: 't1 o1' }),
  S('s20', 'Brightwater Home Comfort', 'brightwatercomfort.example', ['HVAC'], 'residential', 'Tampa', ['Brandon'], 9, { sw: 'FE', jobs: 't1 s1' }),
  S('s21', 'Tampa Bay Climate Pros', 'tbclimatepros.example', ['HVAC'], 'unclear', 'Tampa', ['Tampa'], 30, { sw: 'ST', jobs: 'f1 t1' }),
  S('s55', 'Clearwater Cooling Co', 'clearwatercooling.example', ['HVAC'], 'residential', 'Tampa', ['Clearwater'], 15, { sw: 'ST', jobs: 'f1', mem: true, fTitle: 'Sales Support Coordinator', payF: { min: 17, max: 20, per: 'hour' } }),
  // Atlanta
  S('s22', 'Peachtree Air Experts', 'peachtreeair.example', ['HVAC'], 'residential', 'Atlanta', ['Atlanta', 'Marietta'], 28, { sw: 'ST', jobs: 'f1 s1', mem: true, fTitle: 'Sales Support Coordinator' }),
  S('s23', 'Chattahoochee Plumbing', 'chattahoocheeplumbing.example', ['Plumbing'], 'residential', 'Atlanta', ['Alpharetta'], 12, { sw: null, jobs: 'f1 s2 t3', fTitle: 'Estimate Follow-Up Coordinator' }),
  S('s24', 'Summit Plumbing Co', 'summitplumbingatl.example', ['Plumbing'], 'residential', 'Atlanta', ['Decatur'], 10, { sw: 'HCP', jobs: 't1 s1' }),
  S('s25', 'Red Clay Heating & Air', 'redclayair.example', ['HVAC'], 'residential', 'Atlanta', ['Atlanta'], 19, { sw: 'SW', jobs: 'f1 t1' }),
  S('s26', 'Magnolia Electric', 'magnoliaelectric.example', ['Electrical'], 'residential', 'Atlanta', ['Marietta'], 6, { sw: 'HCP', jobs: 't1 s1' }),
  S('s27', 'Southern Breeze HVAC', 'southernbreezehvac.example', ['HVAC'], 'residential', 'Atlanta', ['Marietta'], 21, { sw: 'HCP', jobs: 't2 o1' }),
  S('s28', 'Georgia Roof Works', 'georgiaroofworks.example', ['Roofing'], 'residential', 'Atlanta', ['Atlanta'], 18, { sw: 'JB', jobs: 's2 t1' }),
  S('s56', 'Alpharetta Plumbing Pros', 'alpharettaplumbing.example', ['Plumbing'], 'residential', 'Atlanta', ['Alpharetta'], 11, { sw: 'ST', jobs: 't1' }),
  // Columbus
  S('s29', 'Summit Plumbing Co', 'summitplumbingohio.example', ['Plumbing'], 'residential', 'Columbus', ['Columbus', 'Dublin'], 13, { sw: 'ST', jobs: 'f1 t1' }),
  S('s30', 'Buckeye Heating & Cooling', 'buckeyehvac.example', ['HVAC'], 'residential', 'Columbus', ['Columbus', 'Westerville'], 33, { sw: 'ST', jobs: 'f1 s1 t2', fTitle: 'Inside Sales Representative', payF: { min: 45000, max: 55000, per: 'year' } }),
  S('s31', 'Scioto Home Services', 'sciotohome.example', ['HVAC', 'Plumbing'], 'residential', 'Columbus', ['Grove City'], 17, { sw: 'HCP', jobs: 's1 t2', mem: true }),
  S('s32', 'Olentangy Electric', 'olentangyelectric.example', ['Electrical'], 'mixed', 'Columbus', ['Columbus'], 20, { sw: 'ST', jobs: 'f1 t1' }),
  S('s33', 'Arch City Air', 'archcityair.example', ['HVAC'], 'residential', 'Columbus', ['Columbus'], 8, { sw: 'HCP', jobs: 'f1 t1' }),
  S('s34', 'Heartland Mechanical Contractors', 'heartlandmech.example', ['HVAC', 'Plumbing'], 'commercial-only', 'Columbus', ['Columbus'], 45, { sw: 'FE', planted: 'commercial', titles: ['Commercial Plumber', 'Pipefitter'] }),
  S('s57', 'Short North Heating', 'shortnorthheating.example', ['HVAC'], 'residential', 'Columbus', ['Columbus'], 9, { sw: 'FE', jobs: 's1' }),
  // Chicago
  S('s35', 'Lakeshore Heating & Cooling', 'lakeshorehvac.example', ['HVAC'], 'residential', 'Chicago', ['Chicago', 'Evanston'], 40, { sw: 'ST', jobs: 'f1 t3 s1', mem: true, fTitle: 'Estimate Follow-Up Coordinator', payF: { min: 20, max: 24, per: 'hour' } }),
  S('s36', 'Prairie Path Plumbing', 'prairiepathplumbing.example', ['Plumbing'], 'residential', 'Chicago', ['Naperville'], 15, { sw: 'ST', jobs: 't1 s1', age: { all: 'stale' } }),
  S('s37', 'Windy City Comfort', 'windycitycomfort.example', ['HVAC'], 'residential', 'Chicago', ['Chicago'], 25, { sw: 'ST', jobs: 'f1 s1 t2', age: { f: 'half', s: 'half' } }),
  S('s38', 'North Shore Plumbing', 'northshoreplumbing.example', ['Plumbing'], 'residential', 'Chicago', ['Evanston'], 9, { sw: null, jobs: 't1' }),
  S('s39', 'Midway Plumbing & Sewer', 'midwayplumbing.example', ['Plumbing'], 'residential', 'Chicago', ['Schaumburg'], 22, { sw: 'HCP', jobs: 'f1 s1 t1' }),
  S('s40', 'Evergreen Comfort Pros of Naperville', 'evergreennaperville.example', ['HVAC'], 'residential', 'Chicago', ['Naperville'], 18, { franchise: 'Evergreen Comfort Pros', sw: 'ST', jobs: 't2 s1' }),
  S('s58', 'Naperville Heating & Plumbing', 'napervilleheatplumb.example', ['HVAC', 'Plumbing'], 'residential', 'Chicago', ['Naperville'], 24, { sw: 'ST', jobs: 'f1 t2', age: { f: 'half' } }),
  // Philadelphia
  S('s41', 'Liberty Bell Heating & Air', 'libertybellair.example', ['HVAC'], 'residential', 'Philadelphia', ['Philadelphia', 'Media'], 27, { sw: 'ST', jobs: 'f1 t1', newLoc: 'Wilmington', fTitle: 'Estimate Follow-Up Coordinator' }),
  S('s42', 'Schuylkill Plumbing', 'schuylkillplumbing.example', ['Plumbing'], 'residential', 'Philadelphia', ['Philadelphia'], 11, { sw: 'SW', jobs: 't1 o1' }),
  S('s43', 'Main Line Home Comfort', 'mainlinecomfort.example', ['HVAC', 'Plumbing'], 'residential', 'Philadelphia', ['King of Prussia'], 36, { sw: 'ST', jobs: 's1 t3', mem: true }),
  S('s44', 'Delaware Valley Roofing', 'dvroofing.example', ['Roofing'], 'residential', 'Philadelphia', ['Media'], 12, { sw: null, jobs: 't1' }),
  S('s45', 'Keystone Climate Control', 'keystoneclimate.example', ['HVAC'], 'residential', 'Philadelphia', ['Philadelphia'], 14, { sw: 'ST', jobs: 'f1 t1', board: 'unsourced', cross: false }),
  S('s46', 'Penn Air Solutions', 'pennairsolutions.example', ['HVAC'], 'residential', 'Philadelphia', ['Philadelphia'], 23, { sw: 'HCP', jobs: 'f1 t1', age: { f: 'half' } }),
  S('s59', 'Wissahickon Heating & Plumbing', 'wissahickonhp.example', ['HVAC', 'Plumbing'], 'residential', 'Philadelphia', ['Philadelphia'], 20, { sw: 'ST', jobs: 's1 t1', mem: true }),
  // Northern New Jersey
  S('s47', 'Garden State Heating & Cooling', 'gardenstatehvac.example', ['HVAC'], 'residential', NNJ, ['Paterson', 'Hackensack'], 29, { sw: 'ST', jobs: 'f1 s1 t1', fTitle: 'Inside Sales Representative', payF: { min: 48000, max: 58000, per: 'year' } }),
  S('s48', 'Passaic Plumbing & Heating', 'passaicph.example', ['HVAC', 'Plumbing'], 'residential', NNJ, ['Newark'], 19, { sw: 'ST', jobs: 's1 t2' }),
  S('s49', 'Ironbound Electric', 'ironboundelectric.example', ['Electrical'], 'mixed', NNJ, ['Newark'], 10, { sw: 'HCP', jobs: 't1' }),
  S('s50', 'Highlands Home Services', 'highlandshome.example', ['HVAC', 'Plumbing'], 'unclear', NNJ, ['Morristown'], 16, { sw: 'FE', jobs: 's1 t1' }),
  S('s51', 'Meadowlands Air', 'meadowlandsair.example', ['HVAC'], 'residential', NNJ, ['Hackensack'], 17, { sw: null, jobs: 't1 o1' }),
  S('s52', 'Hudson Ridge Plumbing', 'hudsonridgeplumbing.example', ['Plumbing'], 'residential', NNJ, ['Hackensack'], 26, { sw: 'ST', jobs: 't2 s1' }),
  S('s60', 'Bergen County Comfort', 'bergencomfort.example', ['HVAC'], 'residential', NNJ, ['Hackensack', 'Paterson'], 34, { sw: 'HCP', jobs: 'f1 s1 t2', age: { f: 'half' } }),
  // Phoenix (continued)
  S('s54', 'Cactus Wren Plumbing', 'cactuswrenplumbing.example', ['Plumbing'], 'residential', 'Phoenix', ['Phoenix'], 10, { sw: 'HCP', jobs: 'f1 t1', fTitle: 'Inside Sales Representative' }),
  S('s61', 'Tempe Plumbing & Rooter', 'tempeplumbingrooter.example', ['Plumbing'], 'residential', 'Phoenix', ['Tempe'], 21, { sw: 'ST', jobs: 'f1 s1 t2', mem: true, fDate: '2026-08-11', fTitle: 'Estimate Follow-Up Coordinator' }),
];

// ------------------------------------------------------------------ postings

const listings = [];
function careersUrl(shop, title, n) {
  const host = shop.gen.brandHost || shop.domain;
  return `https://${host}/careers/${slug(title)}-${n}`;
}
let urlCounter = 100;

function push(shop, spec) {
  urlCounter += 1;
  const board = spec.board || 'company careers page';
  const sourced = spec.sourced !== false;
  const listing = {
    shopId: shop.id,
    title: spec.title,
    city: spec.city,
    board,
    posted: spec.posted,
    pay: spec.pay || null,
    description: spec.description,
    sourceUrl: sourced ? careersUrl(shop, spec.title, urlCounter) : null,
  };
  listings.push(listing);
  return listing;
}

function crossPosts(shop, base) {
  if (shop.gen.cross === false || !chance(0.2)) return;
  const metroCities = citiesIn(CITY_METRO[base.city] || shop.metro);
  const copies = randInt(1, 2);
  for (let i = 0; i < copies; i += 1) {
    const city = chance(0.5) ? pick(metroCities) : base.city;
    const title = city !== base.city && chance(0.5) ? `${base.title} (${city})` : base.title;
    const unsourced = chance(0.3);
    const copy = {
      shopId: shop.id,
      title,
      city,
      board: 'job board',
      posted: addDays(base.posted, randInt(0, 3)),
      pay: base.pay,
      description: base.description,
      sourceUrl: unsourced ? null : base.sourceUrl,
    };
    listings.push(copy);
  }
}

function describe(shop, family, title, city, opts = {}) {
  const w = wordsFor(shop.trades);
  if (family === 'tech') {
    if (shop.serviceMix === 'commercial-only') return pick(COMMERCIAL_DESC)(w, city);
    if (/apprentice/i.test(title)) return APPRENTICE_DESC(w, city);
    return pick(TECH_DESC)(w, city);
  }
  if (family === 'sales') return pick(SALES_DESC)(w, city);
  if (family === 'followup') return FOLLOW_DESC[title](w, city, opts.first);
  if (family === 'csrFollowUp') return CSR_FOLLOW_UP_DESC(w, city);
  return OFFICE_DESC[title](w, city);
}

function buildShop(shop) {
  const g = shop.gen;
  const trades = shop.trades;
  const techTitles = trades.length > 1 ? [...TECH_TITLES.HVAC.slice(0, 3), ...TECH_TITLES.Plumbing.slice(0, 3)] : TECH_TITLES[trades[0]];
  const salesTitles = trades.length > 1 ? SALES_TITLES.HVAC : SALES_TITLES[trades[0]];
  const counts = { f: 0, s: 0, t: 0, o: 0, c: 0 };
  for (const part of (g.jobs || '').split(/\s+/).filter(Boolean)) counts[part[0]] = Number(part.slice(1));
  const ageOf = (k) => (g.age && (g.age.all || g.age[k])) || 'fresh';
  const plan = [];
  const nextIndex = { tech: randInt(0, 5), sales: randInt(0, 3), office: randInt(0, 3) };
  const take = (list, key) => { const t = list[nextIndex[key] % list.length]; nextIndex[key] += 1; return t; };

  for (let i = 0; i < counts.f; i += 1) plan.push({ family: 'followup', title: g.fTitle || pick(FOLLOW_TITLES), age: ageOf('f'), date: g.fDate, city: g.fCity, pay: g.payF });
  for (let i = 0; i < counts.c; i += 1) plan.push({ family: 'csrFollowUp', title: 'Customer Service Representative', age: ageOf('c') });
  for (let i = 0; i < counts.s; i += 1) plan.push({ family: 'sales', title: take(salesTitles, 'sales'), age: ageOf('s') });
  const tTitles = g.titles || null;
  for (let i = 0; i < counts.t; i += 1) plan.push({ family: 'tech', title: tTitles ? tTitles[i % tTitles.length] : take(techTitles, 'tech'), age: ageOf('t') });
  if (g.planted === 'commercial') {
    for (const title of g.titles) plan.push({ family: 'tech', title, age: 'fresh' });
  }
  for (let i = 0; i < counts.o; i += 1) plan.push({ family: 'office', title: take(OFFICE_TITLES, 'office'), age: ageOf('o') });
  if (g.newLoc) plan.push({ family: 'tech', title: take(techTitles, 'tech'), age: 'fresh', city: g.newLoc });

  // The first counted job always names the software, so a shop with software is never "unknown".
  let softwareNamed = false;
  let membershipPlaced = false;
  plan.forEach((job, index) => {
    const city = job.city || pick(shop.locations);
    const posted = job.date || dayBetween(...WINDOW[job.age]);
    let description = describe(shop, job.family, job.title, city, { first: index === 0 });
    const counted = job.age !== 'stale';
    if (g.sw && ((counted && !softwareNamed) || chance(0.35))) {
      description += ` ${pick(SOFTWARE_LINES[g.sw])}`;
      if (counted) softwareNamed = true;
    }
    if (g.mem && !membershipPlaced && counted && (job.family === 'tech' || job.family === 'sales' || plan.every((p) => p.family !== 'tech' && p.family !== 'sales'))) {
      description += ` ${job.family === 'tech' || job.family === 'sales' ? pick(MEMBERSHIP_FIELD) : MEMBERSHIP_OFFICE}`;
      membershipPlaced = true;
    }
    const family = job.family === 'csrFollowUp' ? 'office' : job.family;
    const pay = job.pay || (chance(0.35) ? payFor(family, job.title) : null);
    let spec = { title: job.title, city, posted, pay, description };
    if (g.board === 'unsourced') spec = { ...spec, board: 'job board', sourced: false };
    const base = push(shop, spec);
    crossPosts(shop, base);
  });

  for (let i = 0; i < (g.staleExtra || 0); i += 1) {
    const title = take(techTitles, 'tech');
    const city = pick(shop.locations);
    let description = describe(shop, 'tech', title, city);
    if (g.sw) description += ` ${pick(SOFTWARE_LINES[g.sw])}`;
    push(shop, { title, city, posted: dayBetween(...WINDOW.stale), description });
  }
}

const SHOP = Object.fromEntries(SHOPS.map((s) => [s.id, s]));

// Planted case: one job posted in three cities on two boards (counts once).
function plantCrossPost() {
  const shop = SHOP.s16;
  const title = 'Estimate Follow-Up Coordinator';
  const description = `${FOLLOW_DESC[title](WORDS.HVAC, 'Tampa', true)} ServiceTitan experience a plus.`;
  const pay = { min: 18, max: 22, per: 'hour' };
  const base = push(shop, { title, city: 'Tampa', posted: '2026-09-15', pay, description });
  listings.push({ ...base, board: 'job board' });
  listings.push({ ...base, title: `${title} (Clearwater)`, city: 'Clearwater', board: 'job board', posted: '2026-09-16' });
  listings.push({ ...base, title: 'Estimate Follow-up Coordinator', city: 'St. Petersburg', board: 'job board', posted: '2026-09-18', sourceUrl: null });
  push(shop, {
    title: 'HVAC Service Technician', city: 'Brandon', posted: '2026-09-10', pay: { min: 24, max: 32, per: 'hour' },
    description: `${TECH_DESC[0](WORDS.HVAC, 'Brandon')} ServiceTitan experience a plus.`,
  });
}

// Planted case: a large shop with 12 technician jobs and 2 sales jobs, no follow-up hire.
function plantBigShop() {
  const shop = SHOP.s17;
  const techs = ['HVAC Service Technician', 'HVAC Install Technician', 'HVAC Apprentice', 'Lead HVAC Installer', 'HVAC Maintenance Technician', 'Senior HVAC Service Technician', 'Duct Installer', 'Second Year HVAC Apprentice', 'Warranty Service Technician', 'Indoor Air Quality Technician', 'Install Crew Lead', 'HVAC Startup Technician'];
  techs.forEach((title, i) => {
    const city = shop.locations[i % 3];
    let description = describe(shop, 'tech', title, city);
    if (i === 0 || chance(0.3)) description += ` ${pick(SOFTWARE_LINES.ST)}`;
    push(shop, { title, city, posted: addDays('2026-09-02', i * 2), pay: chance(0.4) ? payFor('tech', title) : null, description });
  });
  push(shop, { title: 'Comfort Advisor', city: 'Tampa', posted: '2026-09-08', pay: { min: 70000, max: 130000, per: 'year' }, description: SALES_DESC[0](WORDS.HVAC, 'Tampa') });
  push(shop, { title: 'Comfort Advisor', city: 'Clearwater', posted: '2026-09-19', pay: null, description: `${SALES_DESC[1](WORDS.HVAC, 'Clearwater')} ServiceTitan experience a plus.` });
}

// Planted case: the same shop listed under its LLC name on a job board.
function plantRidgelineLlc() {
  const shop = SHOP.s02;
  push(shop, {
    title: 'HVAC Maintenance Technician', city: 'Chandler', board: 'job board', posted: '2026-09-20', pay: { min: 23, max: 30, per: 'hour' },
    description: `${TECH_DESC[2](WORDS.HVAC, 'Chandler')} Comfortable in ServiceTitan or willing to learn.`,
  });
}

for (const shop of SHOPS) {
  if (shop.gen.planted === 'crossPost') plantCrossPost();
  else if (shop.gen.planted === 'bigShop') plantBigShop();
  else if (shop.gen.planted === 'ridgelineLlc') plantRidgelineLlc();
  else buildShop(shop);
}

// ------------------------------------------------------------------ write

listings.sort((a, b) => (a.posted < b.posted ? -1 : a.posted > b.posted ? 1 : a.shopId < b.shopId ? -1 : a.shopId > b.shopId ? 1 : 0));
const postings = listings.map((l, i) => ({ id: `p${String(i + 1).padStart(3, '0')}`, ...l }));

const shops = SHOPS.map((s) => {
  const techNote = Number.isFinite(s.techs) ? NOTE[Number(s.id.slice(1)) % NOTE.length](s.techs) : null;
  return {
    id: s.id, name: s.name, domain: s.domain, trades: s.trades, serviceMix: s.serviceMix,
    metro: s.metro, locations: s.locations, techs: s.techs, techNote, franchise: s.franchise,
  };
});

const line = (o) => `    ${JSON.stringify(o)},`;
const out = `// Synthetic data: every shop, domain and posting below is invented.
// Domains end in .example, a reserved test ending, so no real business is named.
// Software names appear only inside posting descriptions, never as a shop field:
// the page has to read the text to find them. Rebuild with: node tools/make-data.mjs
globalThis.TRADES_DATA = {
  dataDate: '${DATA_DATE}',
  metros: ${JSON.stringify(METROS)},
  regions: ${JSON.stringify(REGIONS)},
  cityMetro: ${JSON.stringify(CITY_METRO)},
  callouts: { capLarge: 's17', capMid: 's16' },
  shops: [
${shops.map(line).join('\n')}
  ],
  postings: [
${postings.map(line).join('\n')}
  ],
};
`;
writeFileSync(path.join(projectDir, 'data.js'), out);
console.log(`wrote data.js: ${shops.length} shop records, ${postings.length} postings`);
