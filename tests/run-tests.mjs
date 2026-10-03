// Plain Node test runner: node tests/run-tests.mjs
// No dependencies. Expected numbers were worked out from data.js by hand; the
// arithmetic is written next to each one.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(projectDir, 'data.js')).href);
await import(pathToFileURL(path.join(projectDir, 'signals.mjs')).href);

const S = globalThis.TradesSignals;
const DATA = globalThis.TRADES_DATA;
const fresh = () => structuredClone(DATA);

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`);
  }
}

const base = S.analyze(DATA);
const shop = (id, a = base) => a.results.find((r) => r.id === id);
const sig = (r, key) => r.signals.find((s) => s.key === key) || null;

// A tiny hand-built dataset for rule tests.
function miniData(postings, shopOverrides = {}) {
  return {
    dataDate: '2026-09-30',
    cityMetro: { Tampa: 'Tampa', Clearwater: 'Tampa', Dallas: 'Dallas' },
    regions: { Tampa: 'Sun Belt', Dallas: 'Sun Belt' },
    metros: ['Tampa', 'Dallas'],
    shops: [{ id: 'm1', name: 'Test Air', domain: 'testair.example', trades: ['HVAC'], serviceMix: 'residential', metro: 'Tampa', locations: ['Tampa'], techs: 20, techNote: null, franchise: null, ...shopOverrides }],
    postings: postings.map((p, i) => ({
      id: `q${i + 1}`, shopId: 'm1', city: 'Tampa', board: 'company careers page', pay: null,
      description: 'Run residential service calls.', sourceUrl: `https://testair.example/careers/${i + 1}`, ...p,
    })),
  };
}

// ------------------------------------------------------------------ data

test('data: 61 shop records merge into 60 shops, about 220 listings, dated Jul 20 to Sep 28', () => {
  assert.equal(DATA.shops.length, 61);
  assert.equal(base.results.length, 60);
  assert.ok(DATA.postings.length >= 200 && DATA.postings.length <= 240, `listings: ${DATA.postings.length}`);
  const dates = DATA.postings.map((p) => p.posted).sort();
  assert.ok(dates[0] >= '2026-07-20' && dates[dates.length - 1] <= '2026-09-28', `${dates[0]} to ${dates[dates.length - 1]}`);
  assert.equal(DATA.dataDate, '2026-09-30');
});

test('data: trade mix after the merge is 28 HVAC, 14 plumbing, 8 both, 5 electrical, 3 roofing, 2 pest', () => {
  const mix = {};
  for (const r of base.results) { const k = r.shop.trades.join('+'); mix[k] = (mix[k] || 0) + 1; }
  assert.deepEqual(mix, { HVAC: 28, Plumbing: 14, 'HVAC+Plumbing': 8, Electrical: 5, Roofing: 3, Pest: 2 });
});

test('data: software is only in posting text, never a shop field', () => {
  for (const s of DATA.shops) assert.equal('software' in s, false, s.id);
  assert.ok(DATA.postings.some((p) => /ServiceTitan/.test(p.description)));
});

// ------------------------------------------------------------------ planted cases

test('case 1: one job posted in 3 cities on 2 boards counts once', () => {
  const r = shop('s16');
  const job = r.jobs.find((j) => j.family === 'followup');
  assert.equal(job.listingCount, 4);
  assert.deepEqual(job.cities, ['Tampa', 'Clearwater', 'St. Petersburg']);
  assert.deepEqual(job.boards, ['company careers page', 'job board']);
  assert.equal(sig(r, 'followup').jobsFound, 1);
  assert.ok(r.dedupeNotes.some((n) => n.includes('also posted in Clearwater and St. Petersburg') && n.includes('counted once')));
});

test('case 2: a large shop with 12 technician jobs ranks below a mid-size shop hiring its first follow-up coordinator', () => {
  const big = shop('s17');
  const mid = shop('s16');
  const tech = sig(big, 'tech');
  assert.equal(big.shop.techs, 64);
  assert.equal(tech.jobsFound, 12);
  assert.equal(tech.points, 9); // 3 jobs x 3, capped
  assert.equal(tech.uncapped, 36); // 12 x 3
  assert.equal(sig(big, 'sales').points, 16); // 2 comfort advisors x 8
  assert.equal(sig(big, 'followup'), null);
  assert.equal(big.score, 55); // 10 trade + 20 ServiceTitan + 16 sales + 9 tech
  assert.equal(mid.score, 63); // 10 trade + 20 ServiceTitan + 30 follow-up + 3 tech
  assert.equal(big.tier, 'watch');
  assert.equal(mid.tier, 'call');
  assert.ok(mid.rank < big.rank);
  const uncappedBig = big.signals.reduce((s, x) => s + (x.uncapped !== undefined ? x.uncapped : x.points), 0);
  assert.equal(uncappedBig, 82); // 10 + 20 + 16 + 36: without caps it would win
});

test('case 3: a commercial-only contractor naming ServiceTitan is excluded', () => {
  const r = shop('s08');
  assert.equal(r.software, 'ServiceTitan');
  assert.equal(r.tier, 'excluded');
  assert.equal(r.exclusion.code, 'commercial');
  assert.equal(r.rank, null);
});

test('case 4: a 3-location franchise posting from the brand head-office site is held', () => {
  const r = shop('s15');
  assert.equal(r.shop.locations.length, 3);
  assert.equal(r.tier, 'held');
  assert.equal(r.scoreTier, 'call');
  const hold = r.holds.find((x) => x.code === 'franchise');
  assert.equal(hold.label, 'Franchise: confirm who buys');
  assert.ok(hold.detail.includes('careers.polarpeakbrand.example'));
});

test('case 5: strong signals but no software named is held; weak ones without software are not', () => {
  const r = shop('s23');
  assert.equal(r.software, null);
  assert.equal(r.score, 65); // 10 + 30 follow-up + 16 sales + 9 tech
  assert.equal(r.tier, 'held');
  assert.deepEqual(r.holds.map((x) => x.code), ['software']);
  const weak = shop('s14');
  assert.equal(weak.software, null);
  assert.equal(weak.tier, 'notyet');
});

test('case 6a: "Ridgeline Heating & Air" and "Ridgeline Heating and Air LLC" on the same domain merge', () => {
  const r = shop('s01');
  assert.equal(shop('s02'), undefined);
  assert.deepEqual(r.shop.aliases.map((a) => a.id), ['s02']);
  assert.equal(r.shop.techs, 26);
  const llcListing = DATA.postings.find((p) => p.shopId === 's02');
  assert.ok(r.jobs.some((j) => j.listingIds.includes(llcListing.id)));
  assert.equal(S.normalizeName('Ridgeline Heating & Air'), S.normalizeName('Ridgeline Heating and Air LLC'));
});

test('case 6b: two same-name shops in different metros with different domains are both held', () => {
  const a = shop('s24');
  const b = shop('s29');
  assert.equal(a.shop.name, b.shop.name);
  assert.notEqual(a.shop.metro, b.shop.metro);
  assert.notEqual(a.shop.domain, b.shop.domain);
  for (const r of [a, b]) {
    assert.equal(r.tier, 'held');
    assert.ok(r.holds.some((x) => x.code === 'identity'));
  }
});

test('case 7: a shop whose only listings are job-board reposts with no shop source is excluded', () => {
  const r = shop('s45');
  const listings = DATA.postings.filter((p) => p.shopId === 's45');
  assert.ok(listings.length > 0);
  assert.ok(listings.every((p) => p.board === 'job board' && p.sourceUrl === null));
  assert.equal(r.exclusion.code, 'nosource');
});

test('case 8: 31 to 60 days old counts half; older is ignored', () => {
  const W = S.DEFAULT_WEIGHTS;
  assert.equal(S.recencyWeight(0, W), 1);
  assert.equal(S.recencyWeight(30, W), 1);
  assert.equal(S.recencyWeight(31, W), 0.5);
  assert.equal(S.recencyWeight(60, W), 0.5);
  assert.equal(S.recencyWeight(61, W), 0);
  const windy = shop('s37');
  assert.equal(sig(windy, 'followup').points, 15); // 55 days old: 30 x 0.5
  assert.equal(sig(windy, 'sales').points, 4); // 56 days old: 8 x 0.5
  assert.equal(shop('s36').exclusion.code, 'stale');
  const mesquite = shop('s53');
  assert.equal(sig(mesquite, 'tech'), null); // its two technician jobs are past 60 days
  assert.equal(mesquite.notCounted.length, 2);
});

test('case 9: a 4-technician shop is too small for now', () => {
  const r = shop('s13');
  assert.equal(r.shop.techs, 4);
  assert.equal(r.exclusion.code, 'small');
  assert.equal(r.exclusion.label, 'Too small for now');
});

test('case 10: a generic CSR post that calls customers back on open estimates counts as a follow-up hire', () => {
  const r = shop('s18');
  const fu = sig(r, 'followup');
  assert.equal(fu.points, 30);
  assert.equal(fu.evidence[0].title, 'Customer Service Representative');
  assert.equal(fu.evidence[0].via, 'description');
  assert.ok(/call customers back on open estimates/.test(fu.evidence[0].line));
  assert.equal(S.classifyJob('Customer Service Representative', 'Answer inbound calls and book service appointments.').family, 'office');
});

test('case 11: posted pay on a follow-up seat shows as a yearly cost but is not scored', () => {
  const r = shop('s16');
  assert.equal(r.seatCost.text, 'This seat costs $37,440 to $45,760 a year.'); // $18 to $22 an hour x 2,080
  const noPay = fresh();
  for (const p of noPay.postings) p.pay = null;
  const r2 = shop('s16', S.analyze(noPay));
  assert.equal(r2.seatCost, null);
  assert.equal(r2.score, r.score);
});

test('case 12: a membership or maintenance club mention adds a small bonus', () => {
  const r = shop('s01');
  assert.equal(sig(r, 'membership').points, 5);
  const stripped = fresh();
  for (const p of stripped.postings) p.description = p.description.replace(/[^.]*(maintenance club|membership)[^.]*\./gi, '');
  assert.equal(shop('s01', S.analyze(stripped)).score, r.score - 5);
});

// ------------------------------------------------------------------ rules

test('dedupe: same title within 7 days is one job; 8 days apart is two; title variants match', () => {
  const seven = S.analyze(miniData([
    { title: 'Estimate Follow-Up Coordinator', posted: '2026-09-10' },
    { title: 'Estimate Follow-up Coordinator (Clearwater)', posted: '2026-09-17', city: 'Clearwater', board: 'job board' },
  ]));
  assert.equal(seven.results[0].jobs.length, 1);
  const eight = S.analyze(miniData([
    { title: 'Estimate Follow-Up Coordinator', posted: '2026-09-10' },
    { title: 'Estimate Follow-Up Coordinator', posted: '2026-09-18' },
  ]));
  assert.equal(eight.results[0].jobs.length, 2);
  assert.equal(sig(eight.results[0], 'followup').points, 30); // still capped at one job
});

test('caps: sales stop at 16 and technicians at 9 however many are posted', () => {
  const posts = [];
  for (let i = 0; i < 4; i += 1) posts.push({ title: `Comfort Advisor ${i}`, posted: '2026-09-20' });
  for (let i = 0; i < 5; i += 1) posts.push({ title: `HVAC Service Technician ${i}`, posted: '2026-09-20' });
  const r = S.analyze(miniData(posts)).results[0];
  assert.equal(sig(r, 'sales').points, 16);
  assert.equal(sig(r, 'sales').uncapped, 32);
  assert.equal(sig(r, 'tech').points, 9);
  assert.equal(sig(r, 'tech').capped, true);
});

test('tiers: 34 is Not yet, 35 and 59 are Watch, 60 is Call this week', () => {
  const W = S.DEFAULT_WEIGHTS;
  assert.equal(S.tierFor(34, W), 'notyet');
  assert.equal(S.tierFor(34.5, W), 'notyet');
  assert.equal(S.tierFor(35, W), 'watch');
  assert.equal(S.tierFor(59, W), 'watch');
  assert.equal(S.tierFor(59.5, W), 'watch');
  assert.equal(S.tierFor(60, W), 'call');
  assert.equal(shop('s09').score, 59); // 10 + 20 + 15 half-credit follow-up + 8 sales + 6 tech
  assert.equal(shop('s09').tier, 'watch');
  assert.equal(shop('s03').score, 34); // 10 + 10 Housecall Pro + 8 sales + 6 tech
  assert.equal(shop('s03').tier, 'notyet');
});

test('holds override tiers: a held shop never shows a score tier', () => {
  const held = base.results.filter((r) => r.holds.length);
  assert.equal(held.length, 7);
  for (const r of held) assert.equal(r.tier, 'held');
  assert.equal(shop('s21').holds[0].code, 'mix');
  assert.equal(shop('s21').scoreTier, 'call');
});

test('software points: ServiceTitan 20, Housecall Pro 10, other named 5, none 0', () => {
  assert.equal(sig(shop('s16'), 'software').points, 20);
  assert.equal(sig(shop('s18'), 'software').points, 10);
  assert.equal(sig(shop('s25'), 'software').software, 'Successware');
  assert.equal(sig(shop('s25'), 'software').points, 5);
  assert.equal(sig(shop('s14'), 'software'), null);
});

test('new location: a posting in a metro with no listed location adds 5', () => {
  const r = shop('s06');
  assert.equal(sig(r, 'newlocation').points, 5);
  assert.equal(sig(r, 'newlocation').city, 'Tucson');
  assert.equal(r.score, 71); // 10 + 20 + 30 + 6 tech + 5
});

test('result sentence is computed from the data and adds up to every shop', () => {
  const t = base.totals;
  assert.equal(t.call + t.watch + t.held + t.notyet + t.excluded, 60);
  assert.equal(t.listings, DATA.postings.length);
  assert.equal(base.sentence, `Of 60 shops posting ${DATA.postings.length} listings (${t.jobs} distinct jobs), ${t.call} are worth a call this week, ${t.watch} are worth watching, ${t.held} are held for a person, and ${t.notyet + t.excluded} don't fit yet.`);
  assert.equal(base.sentence, 'Of 60 shops posting 231 listings (173 distinct jobs), 13 are worth a call this week, 17 are worth watching, 7 are held for a person, and 23 don\'t fit yet.');
  const html = readFileSync(path.join(projectDir, 'index.html'), 'utf8');
  assert.equal(html.includes(base.sentence), false, 'the sentence must not be hardcoded in the page');
});

test('weights edits re-rank: with no follow-up points the big shop passes the mid-size one', () => {
  const noFollow = S.analyze(DATA, { ...S.DEFAULT_WEIGHTS, followUp: 0 });
  assert.ok(shop('s17', noFollow).rank < shop('s16', noFollow).rank);
  const noCap = S.analyze(DATA, { ...S.DEFAULT_WEIGHTS, techMaxJobs: 12 });
  assert.equal(shop('s17', noCap).score, 82);
  assert.equal(shop('s17', noCap).tier, 'call');
  const strict = S.analyze(DATA, { ...S.DEFAULT_WEIGHTS, callAt: 80 });
  assert.ok(strict.totals.call < base.totals.call);
});

test('weights: blank, broken and negative values fall back safely', () => {
  const W = S.sanitizeWeights({ followUp: '', sales: 'abc', tech: -4, halfCredit: 3, techMaxJobs: 2.7 });
  assert.equal(W.followUp, 30);
  assert.equal(W.sales, 8);
  assert.equal(W.tech, 0);
  assert.equal(W.halfCredit, 1);
  assert.equal(W.techMaxJobs, 2);
});

test('rule counts: each gate and hold reports how many shops it touched', () => {
  const c = base.ruleCounts;
  assert.deepEqual(c.gate, { commercial: 2, small: 2, nosource: 1, stale: 1 });
  assert.deepEqual(c.hold, { franchise: 2, identity: 2, mix: 2, software: 1 });
  assert.equal(c.merged, 1);
  assert.equal(c.followUpFromText, 1);
  assert.equal(c.techCapped, 2);
  assert.equal(S.rulesInPlainWords(base.weights, c).length, 16);
});

test('detail view: draft first line and two first-call questions come from the shop\'s own signals', () => {
  const r = shop('s16');
  assert.equal(r.opener, 'Saw you\'re hiring an estimate follow-up coordinator in Tampa, and the post mentions ServiceTitan.');
  assert.deepEqual(r.questions, [
    'Who follows up on estimates that don\'t close today, and how many days after the visit?',
    'Which estimate statuses do you track in ServiceTitan, and who looks at the open ones each week?',
  ]);
  assert.ok(shop('s18').opener.includes('calling customers back on open estimates'));
  assert.ok(shop('s18').opener.includes('Housecall Pro'));
  assert.equal(shop('s23').opener, 'Saw you\'re hiring an estimate follow-up coordinator in Alpharetta.');
  assert.equal(shop('s08').opener, null);
  for (const x of base.results.filter((y) => y.tier !== 'excluded')) assert.equal(x.questions.length, 2, x.id);
});

test('detail view: every scored signal past trade fit points at a posting line', () => {
  for (const r of base.results.filter((y) => y.tier !== 'excluded')) {
    for (const s of r.signals.filter((x) => x.key !== 'trade')) {
      assert.ok(s.evidence.length > 0 && s.evidence.every((e) => e.line && e.board && e.posted), `${r.id} ${s.key}`);
    }
  }
});

// ------------------------------------------------------------------ segments page

test('segments: top segment, toggle and live sentence', () => {
  const rows = S.segmentRows(base, DATA);
  assert.equal(rows[0].label, 'HVAC, Tampa');
  assert.equal(rows[0].stFollow, 3);
  assert.equal(rows[0].medianFollowUpPay, 40040); // middles of three posted ranges: $40,040 is the median
  assert.equal(rows.filter((r) => r.angle).length, 3);
  assert.equal(rows.reduce((s, r) => s + r.shops, 0), 60);
  const core = S.segmentRows(base, DATA, { includeAdjacent: false });
  assert.equal(core.reduce((s, r) => s + r.shops, 0), 50); // 60 minus 5 electrical, 3 roofing, 2 pest
  assert.ok(core.every((r) => !/Electrical|Roofing|Pest/.test(r.label)));
  assert.equal(S.segmentSentence(base, DATA), 'HVAC shops in the Sun Belt metros (Phoenix, Dallas, Tampa and Atlanta) have the most ServiceTitan shops hiring for follow-up work: 7 of 16.');
  assert.equal(S.median([3, 1, 2]), 2);
  assert.equal(S.median([4, 1, 2, 3]), 2.5);
  assert.equal(S.median([]), null);
});

// ------------------------------------------------------------------ the repo itself

const REPO_FILES = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(html|js|mjs|css|md)$/.test(name)) REPO_FILES.push(full);
  }
})(projectDir);
const read = (f) => readFileSync(f, 'utf8');
const rel = (f) => path.relative(projectDir, f);

// One-way hashes of names and words that must never appear (the target
// company and its customers, people, personal and job-hunt terms). Only the
// hashes live here, so this file doesn't name them either.
const BANNED = new Set(['dbb890aaa5f37bcb', 'c374953f2a85101f', '6ca52f4b15504d42', '73c5584b28b25e04', '015839f381ab18ba', '63089a309567b419', '034220a8b6bd25cb', 'c489b54d6314ebda', 'e2168a7a995c1228', 'e4c87e27a1865086', 'ea66f06bd8d37bbf', '5a468dab0c23e11a', '08b53a6aef5ccfec', 'e759968ca9278b8d', '9ecfc652f6b09c9f', '600ccd5e0c3fee79', 'a68e36f1cde694e7', '82244417f956ac7c', 'e83c0a7332a6ccfd', '42aef2f386567bd5', '9b39fac9d311477c', '8fb58a4ac0ac96ec', '84308bea454057aa', '5cabdc1ad34c2367', '752272b825e35e55', '8efdf55724c97710', '469d59c353ce9c3a']);
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

test('no banned names or words anywhere in the repo', () => {
  const hits = [];
  for (const f of REPO_FILES) {
    if (f === fileURLToPath(import.meta.url)) continue;
    const words = read(f).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
    for (let n = 1; n <= 4; n += 1) {
      for (let i = 0; i + n <= words.length; i += 1) {
        if (BANNED.has(hash(words.slice(i, i + n).join(' ')))) hits.push(`${rel(f)}: word ${i}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

test('no dashes in copy, no local paths, no private file names, no network calls', () => {
  for (const f of REPO_FILES) {
    const text = read(f);
    assert.equal(DASHES.test(text), false, `${rel(f)} has an en or em dash`);
    assert.equal(/\/Users\//.test(text), false, `${rel(f)} has a local path`);
    assert.equal(/\b(CLAUDE|AGENTS)\.md\b/.test(text), false, `${rel(f)} names a private file`);
    if (/\.(html|js|mjs)$/.test(f) && !f.includes(`${path.sep}tests${path.sep}`)) {
      assert.equal(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(text), false, `${rel(f)} makes a network call`);
      assert.equal(/(src|href)="https?:/.test(text), false, `${rel(f)} loads something external`);
    }
  }
  assert.equal(/^\s*(import|export)\b/m.test(read(path.join(projectDir, 'signals.mjs'))), false, 'signals.mjs must stay a plain script');
});

test('both pages: synthetic data badge, footer, and the closing questions word for word', () => {
  const footer = 'Built by Dakshit Raj with AI coding tools (Claude Code, Codex). All shops and postings are synthetic.';
  const index = read(path.join(projectDir, 'index.html'));
  const segments = read(path.join(projectDir, 'segments.html'));
  for (const page of [index, segments]) {
    assert.ok(page.includes('>Synthetic data<'));
    assert.ok(page.includes(footer));
    assert.ok(page.includes('href="styles.css"') && page.includes('src="signals.mjs"'));
  }
  assert.ok(index.includes('href="segments.html"'));
  for (const q of [
    'When a shop names ServiceTitan in a job post, is that enough to call it a fit, or do you confirm the software another way first?',
    'Is a shop hiring an estimate follow-up or inside-sales person a buyer for you, or a sign they\'ve already solved follow-up with people?',
    'Which predicts a good account better: technician count, or how many estimates a shop writes a month?',
    'Do franchise locations buy on their own, or does it go through head office?',
    'Should commercial work count at all, or only residential repair and replacement?',
  ]) assert.ok(index.includes(q), q);
  for (const q of [
    'Which trades and metros are you selling into now, and which have you tried and dropped?',
    'Do you price per technician, per location, or on revenue recovered?',
  ]) assert.ok(segments.includes(q), q);
});

test('README: quotes the live sentences and the cap example exactly as computed', () => {
  const readme = read(path.join(projectDir, 'README.md'));
  assert.ok(readme.includes(base.sentence), 'main result sentence');
  assert.ok(readme.includes(S.segmentSentence(base, DATA)), 'segments sentence');
  const big = shop('s17');
  const mid = shop('s16');
  assert.ok(readme.includes(`= **${S.fmtPoints(big.score)}**`) && readme.includes(`= **${S.fmtPoints(mid.score)}**`), 'cap example scores');
  assert.ok(readme.includes(mid.seatCost.text.replace(/\.$/, '')), 'seat cost line');
  for (const [key, value] of Object.entries({ minTechs: 8, dedupeDays: 7, followUp: 30, callAt: 60, watchAt: 35 })) {
    assert.equal(S.DEFAULT_WEIGHTS[key], value, `README describes ${key} as ${value}`);
  }
  assert.ok(readme.includes('node tests/run-tests.mjs'));
  assert.ok(readme.includes(`It runs ${passed + 1} checks`), 'README test count matches the suite');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
