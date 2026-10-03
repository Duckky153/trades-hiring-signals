/*
 * Trades Hiring Signals: every rule and every score, as pure functions.
 * No DOM, no network, no clock: the data date comes from the data file.
 *
 * This file has no imports or exports on purpose. A page opened straight from
 * disk can't load ES modules, so the page loads it as a plain script, and Node
 * imports it for the tests. Either way it registers one object:
 * globalThis.TradesSignals.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ weights

  const DEFAULT_WEIGHTS = Object.freeze({
    minTechs: 8,
    dedupeDays: 7,
    fullCreditDays: 30,
    halfCreditDays: 60,
    halfCredit: 0.5,
    tradeCore: 10,
    tradeOther: 3,
    softwareServiceTitan: 20,
    softwareHousecallPro: 10,
    softwareOther: 5,
    followUp: 30,
    followUpMaxJobs: 1,
    sales: 8,
    salesMaxJobs: 2,
    tech: 3,
    techMaxJobs: 3,
    membership: 5,
    newLocation: 5,
    callAt: 60,
    watchAt: 35,
  });

  // Labels for the weights editor on the page.
  const WEIGHT_FIELDS = Object.freeze([
    { key: 'minTechs', group: 'Fit gate', label: 'Minimum technicians', step: 1, max: 200 },
    { key: 'dedupeDays', group: 'Counting', label: 'Same job if reposted within (days)', step: 1, max: 60 },
    { key: 'fullCreditDays', group: 'Counting', label: 'Full credit up to (days old)', step: 1, max: 365 },
    { key: 'halfCreditDays', group: 'Counting', label: 'Partial credit up to (days old)', step: 1, max: 365 },
    { key: 'halfCredit', group: 'Counting', label: 'Partial credit share (0 to 1)', step: 0.1, max: 1 },
    { key: 'tradeCore', group: 'Points', label: 'HVAC or plumbing shop', step: 1, max: 100 },
    { key: 'tradeOther', group: 'Points', label: 'Electrical, roofing or pest shop', step: 1, max: 100 },
    { key: 'softwareServiceTitan', group: 'Points', label: 'ServiceTitan named', step: 1, max: 100 },
    { key: 'softwareHousecallPro', group: 'Points', label: 'Housecall Pro named', step: 1, max: 100 },
    { key: 'softwareOther', group: 'Points', label: 'Other software named', step: 1, max: 100 },
    { key: 'followUp', group: 'Points', label: 'Follow-up hire, per job', step: 1, max: 100 },
    { key: 'followUpMaxJobs', group: 'Points', label: 'Follow-up jobs counted, at most', step: 1, max: 20 },
    { key: 'sales', group: 'Points', label: 'Sales hire, per job', step: 1, max: 100 },
    { key: 'salesMaxJobs', group: 'Points', label: 'Sales jobs counted, at most', step: 1, max: 20 },
    { key: 'tech', group: 'Points', label: 'Technician hire, per job', step: 1, max: 100 },
    { key: 'techMaxJobs', group: 'Points', label: 'Technician jobs counted, at most', step: 1, max: 20 },
    { key: 'membership', group: 'Points', label: 'Membership or maintenance club mention', step: 1, max: 100 },
    { key: 'newLocation', group: 'Points', label: 'Hiring in a new metro', step: 1, max: 100 },
    { key: 'callAt', group: 'Tiers', label: 'Call this week at (points)', step: 1, max: 500 },
    { key: 'watchAt', group: 'Tiers', label: 'Watch at (points)', step: 1, max: 500 },
  ]);
  const INTEGER_KEYS = new Set(['minTechs', 'dedupeDays', 'fullCreditDays', 'halfCreditDays', 'followUpMaxJobs', 'salesMaxJobs', 'techMaxJobs']);

  // Any missing, blank or broken value falls back to its default; negatives become 0.
  function sanitizeWeights(input) {
    const out = {};
    for (const field of WEIGHT_FIELDS) {
      const raw = input && input[field.key];
      let value = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
      if (raw === undefined || raw === null || !Number.isFinite(value)) value = DEFAULT_WEIGHTS[field.key];
      value = Math.min(Math.max(value, 0), field.max);
      if (INTEGER_KEYS.has(field.key)) value = Math.floor(value);
      out[field.key] = value;
    }
    return out;
  }

  // ------------------------------------------------------------------ text helpers

  const round1 = (n) => Math.round(n * 10) / 10;

  function fmtPoints(n) {
    const r = round1(n);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  function fmtMoney(n) {
    return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    const [, m, d] = String(iso).split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
  }
  function listWords(items) {
    const list = items.filter(Boolean);
    if (list.length <= 1) return list.join('');
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }
  const plural = (n, one, many) => (n === 1 ? one : many);
  const article = (phrase) => (/^[aeiou]/i.test(phrase) ? 'an' : 'a');
  const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  // "a sales role", "two sales roles", "12 technicians"
  function countOf(n, one, many) {
    if (n === 1) return `${article(one)} ${one}`;
    return `${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n} ${many}`;
  }
  const unique = (items) => [...new Set(items)];

  function sentences(text) {
    // Split after . ! or ?, but not after "St." as in "St. Petersburg".
    return String(text || '').split(/(?<=[.!?])(?<!\bSt\.)\s+/).map((s) => s.trim()).filter(Boolean);
  }
  function findSentence(text, pattern) {
    return sentences(text).find((s) => pattern.test(s)) || null;
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
  }

  // ------------------------------------------------------------------ normalizing

  function normalizeDomain(domain) {
    return String(domain || '').trim().toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[/?#].*$/, '');
  }

  function normalizeName(name) {
    return String(name || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(llc|inc|co|company|corp|ltd)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // "Estimate Follow-up Coordinator (Clearwater)" and "Estimate Follow-Up Coordinator"
  // are the same job title.
  function normalizeTitle(title) {
    return String(title || '').toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s[|/]\s.*$/, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hostOf(url) {
    if (!url) return null;
    return normalizeDomain(String(url));
  }

  // ------------------------------------------------------------------ reading the text

  const SOFTWARE = Object.freeze([
    { key: 'servicetitan', name: 'ServiceTitan', pattern: /\bservice\s?titan\b/i, weight: 'softwareServiceTitan' },
    { key: 'housecallpro', name: 'Housecall Pro', pattern: /\bhousecall\s?pro\b/i, weight: 'softwareHousecallPro' },
    { key: 'fieldedge', name: 'FieldEdge', pattern: /\bfield\s?edge\b/i, weight: 'softwareOther' },
    { key: 'successware', name: 'Successware', pattern: /\bsuccessware\b/i, weight: 'softwareOther' },
    { key: 'jobber', name: 'Jobber', pattern: /\bjobber\b/i, weight: 'softwareOther' },
  ]);

  const FOLLOW_UP_TITLE = /\b(inside sales|estimate follow ?up|follow ?up coordinator|sales support coordinator)\b/i;
  const SALES_TITLE = /\b(comfort advisor|sales technician|in home sales|sales consultant|sales representative|sales rep)\b/i;
  const TECH_TITLE = /\b(technician|tech|apprentice|installer|plumber|electrician|pipefitter|crew lead|inspector)\b/i;
  // Front-office text that describes estimate follow-up work.
  const FOLLOW_UP_TEXT = /\b(?:call|calling|text|texting)\b[^.]*\bback on\b[^.]*\bestimates?\b|\bopen estimates?\b|\bfollow(?:ing)? ?up on (?:open )?estimates?\b/i;
  const MEMBERSHIP_TEXT = /\bmaintenance (?:club|plan|agreement)s?\b|\bmembership\b/i;

  // Title first. A front-office title only becomes a follow-up hire when its
  // description says the person calls customers back on open estimates.
  function classifyJob(title, description) {
    const t = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    if (FOLLOW_UP_TITLE.test(t)) return { family: 'followup', via: 'title', line: sentences(description)[0] || null };
    if (SALES_TITLE.test(t)) return { family: 'sales', via: 'title', line: sentences(description)[0] || null };
    if (TECH_TITLE.test(t)) return { family: 'tech', via: 'title', line: sentences(description)[0] || null };
    const line = findSentence(description, FOLLOW_UP_TEXT);
    if (line) return { family: 'followup', via: 'description', line };
    return { family: 'office', via: 'title', line: sentences(description)[0] || null };
  }

  function softwareIn(text) {
    const found = [];
    for (const s of SOFTWARE) {
      const line = findSentence(text, s.pattern);
      if (line) found.push({ key: s.key, name: s.name, weight: s.weight, line });
    }
    return found;
  }

  function recencyWeight(ageDays, W) {
    if (ageDays <= W.fullCreditDays) return 1;
    if (ageDays <= W.halfCreditDays) return W.halfCredit;
    return 0;
  }

  function annualPay(pay) {
    if (!pay || !Number.isFinite(pay.min) || !Number.isFinite(pay.max)) return null;
    const factor = pay.per === 'hour' ? 2080 : 1;
    return { min: pay.min * factor, max: pay.max * factor, per: pay.per };
  }

  // ------------------------------------------------------------------ shops

  // Same website = same shop: records merge. Same name with a different website
  // = an identity conflict: both are held for a person.
  function resolveShops(rawShops) {
    const byDomain = new Map();
    const canonicalOf = {};
    const shops = [];
    for (const raw of rawShops) {
      const key = normalizeDomain(raw.domain);
      const existing = byDomain.get(key);
      if (existing) {
        existing.aliases.push({ id: raw.id, name: raw.name, domain: raw.domain });
        existing.locations = unique([...existing.locations, ...raw.locations]);
        if (!Number.isFinite(existing.techs) && Number.isFinite(raw.techs)) {
          existing.techs = raw.techs;
          existing.techNote = raw.techNote;
        }
        canonicalOf[raw.id] = existing.id;
        continue;
      }
      const shop = {
        ...raw,
        trades: [...raw.trades],
        locations: [...raw.locations],
        domainKey: key,
        aliases: [],
        conflicts: [],
      };
      byDomain.set(key, shop);
      shops.push(shop);
      canonicalOf[raw.id] = raw.id;
    }
    const byName = new Map();
    for (const shop of shops) {
      const key = normalizeName(shop.name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(shop);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      for (const shop of group) {
        shop.conflicts = group.filter((o) => o !== shop).map((o) => ({ id: o.id, name: o.name, metro: o.metro, domain: o.domain }));
      }
    }
    return { shops, canonicalOf };
  }

  // Listings with the same shop and normalized title, posted within dedupeDays of
  // the first one, are one job. A job is as fresh as its newest listing.
  function groupJobs(postings, W, dataDate, cityMetro) {
    const sorted = [...postings].sort((a, b) => a.posted.localeCompare(b.posted) || a.id.localeCompare(b.id));
    const open = new Map();
    const groups = [];
    for (const p of sorted) {
      const key = normalizeTitle(p.title);
      const current = open.get(key);
      if (current && daysBetween(current.firstPosted, p.posted) <= W.dedupeDays) {
        current.listings.push(p);
        continue;
      }
      const group = { key, firstPosted: p.posted, listings: [p] };
      open.set(key, group);
      groups.push(group);
    }
    return groups.map((g) => finishJob(g, W, dataDate, cityMetro));
  }

  function finishJob(group, W, dataDate, cityMetro) {
    const listings = group.listings;
    const primary = listings.find((l) => l.sourceUrl && l.board === 'company careers page')
      || listings.find((l) => l.sourceUrl) || listings[0];
    const lastPosted = listings.reduce((m, l) => (l.posted > m ? l.posted : m), listings[0].posted);
    const ageDays = daysBetween(lastPosted, dataDate);
    const kind = classifyJob(primary.title, primary.description);
    const pay = (listings.find((l) => l.pay) || {}).pay || null;
    const sourceUrl = (listings.find((l) => l.sourceUrl) || {}).sourceUrl || null;
    const cities = unique(listings.map((l) => l.city));
    return {
      key: group.key,
      title: primary.title.replace(/\s*\([^)]*\)\s*$/, ''),
      city: primary.city,
      cities,
      boards: unique(listings.map((l) => l.board)),
      board: primary.board,
      listingIds: listings.map((l) => l.id),
      listingCount: listings.length,
      firstPosted: group.firstPosted,
      posted: lastPosted,
      ageDays,
      weight: recencyWeight(ageDays, W),
      sourced: Boolean(sourceUrl),
      sourceUrl,
      sourceHost: hostOf(sourceUrl),
      description: primary.description,
      family: kind.family,
      via: kind.via,
      line: kind.line,
      pay,
      software: softwareIn(primary.description),
      membershipLine: findSentence(primary.description, MEMBERSHIP_TEXT),
      metros: unique(cities.map((c) => (cityMetro && cityMetro[c]) || null)),
    };
  }

  function dedupeNote(job) {
    if (job.listingCount < 2) return null;
    const others = job.cities.filter((c) => c !== job.city);
    const where = others.length ? `also posted in ${listWords(others)}` : `posted ${job.listingCount} times in ${job.city}`;
    const boards = job.boards.length > 1 ? `, on ${job.boards.length} boards` : `, on the ${job.boards[0]}`;
    return `${job.title}: ${where}${boards} (${job.listingCount} listings), counted once.`;
  }

  // ------------------------------------------------------------------ gates, signals, holds

  const GATES = Object.freeze([
    { code: 'commercial', label: 'Commercial only' },
    { code: 'small', label: 'Too small for now' },
    { code: 'nosource', label: 'No shop source' },
    { code: 'stale', label: 'All postings stale' },
  ]);

  function gateFor(shop, jobs, W) {
    if (shop.serviceMix === 'commercial-only') {
      return { code: 'commercial', label: 'Commercial only', why: 'Its postings are for commercial and industrial work, not residential repair and replacement.' };
    }
    if (Number.isFinite(shop.techs) && shop.techs < W.minTechs) {
      return { code: 'small', label: 'Too small for now', why: `About ${shop.techs} technicians, under the ${W.minTechs} minimum.` };
    }
    if (!jobs.some((j) => j.sourced)) {
      return { code: 'nosource', label: 'No shop source', why: 'Every listing is a job-board repost with no link back to the shop\'s own careers page.' };
    }
    if (!jobs.some((j) => j.sourced && j.weight > 0)) {
      return { code: 'stale', label: 'All postings stale', why: `Every listing is more than ${W.halfCreditDays} days old.` };
    }
    return null;
  }

  const evidenceOf = (job, line) => ({
    title: job.title, city: job.city, board: job.board, posted: job.posted, ageDays: job.ageDays, weight: job.weight,
    line: line === undefined ? job.line : line, via: job.via, cities: job.cities,
  });

  // Freshest first, then the one with posted pay, then the newest.
  function byStrength(a, b) {
    return (b.weight - a.weight) || ((b.pay ? 1 : 0) - (a.pay ? 1 : 0)) || b.posted.localeCompare(a.posted);
  }

  function hiringSignal(key, label, jobs, perJob, maxJobs) {
    const found = jobs.filter((j) => j.weight > 0).sort(byStrength);
    if (!found.length) return null;
    const used = found.slice(0, maxJobs);
    const points = round1(used.reduce((s, j) => s + j.weight, 0) * perJob);
    const uncapped = round1(found.reduce((s, j) => s + j.weight, 0) * perJob);
    return {
      key, label, points, uncapped,
      capped: found.length > used.length,
      jobsFound: found.length,
      jobsCounted: used.length,
      perJob,
      maxJobs,
      evidence: used.map((j) => evidenceOf(j)),
      jobs: used,
    };
  }

  function scoreShop(shop, jobs, W, cityMetro) {
    const counted = jobs.filter((j) => j.sourced && j.weight > 0);
    const signals = [];

    const core = shop.trades.some((t) => t === 'HVAC' || t === 'Plumbing');
    signals.push({
      key: 'trade', label: core ? 'Core trade' : 'Adjacent trade',
      points: core ? W.tradeCore : W.tradeOther,
      detail: listWords(shop.trades.map((t) => (t === 'HVAC' ? 'HVAC' : t.toLowerCase()))),
      evidence: [],
    });

    // Prefer the software line from the strongest job, so the evidence and the
    // draft opener point at the same posting.
    const FAMILY_ORDER = { followup: 0, sales: 1, office: 2, tech: 3 };
    const ordered = [...counted].sort((a, b) => (FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family]) || byStrength(a, b));
    let best = null;
    for (const job of ordered) {
      for (const s of job.software) {
        const points = W[s.weight];
        if (!best || points > best.points) best = { name: s.name, key: s.key, points, job, line: s.line };
      }
    }
    if (best) {
      signals.push({ key: 'software', label: `Names ${best.name}`, points: best.points, software: best.name, evidence: [evidenceOf(best.job, best.line)] });
    }

    const followUp = hiringSignal('followup', 'Follow-up hire', counted.filter((j) => j.family === 'followup'), W.followUp, W.followUpMaxJobs);
    if (followUp) signals.push(followUp);
    const sales = hiringSignal('sales', 'Sales hires', counted.filter((j) => j.family === 'sales'), W.sales, W.salesMaxJobs);
    if (sales) signals.push(sales);
    const tech = hiringSignal('tech', 'Technician hires', counted.filter((j) => j.family === 'tech'), W.tech, W.techMaxJobs);
    if (tech) signals.push(tech);

    const memberJob = counted.find((j) => j.membershipLine);
    if (memberJob) {
      signals.push({ key: 'membership', label: 'Membership plan mentioned', points: W.membership, evidence: [evidenceOf(memberJob, memberJob.membershipLine)] });
    }

    const shopMetros = new Set(shop.locations.map((c) => cityMetro[c] || c));
    let newLoc = null;
    for (const job of counted) {
      const city = job.cities.find((c) => cityMetro[c] && !shopMetros.has(cityMetro[c]));
      if (city) { newLoc = { job, city, metro: cityMetro[city] }; break; }
    }
    if (newLoc) {
      signals.push({
        key: 'newlocation', label: 'Hiring in a new metro', points: W.newLocation, metro: newLoc.metro, city: newLoc.city,
        evidence: [evidenceOf(newLoc.job, `Posted in ${newLoc.city}, outside the shop's listed locations (${listWords(shop.locations)}).`)],
      });
    }

    const score = round1(signals.reduce((s, x) => s + x.points, 0));
    return { signals, score, software: best ? best.name : null };
  }

  function tierFor(score, W) {
    if (score >= W.callAt) return 'call';
    if (score >= W.watchAt) return 'watch';
    return 'notyet';
  }

  const TIER_LABEL = Object.freeze({
    call: 'Call this week', watch: 'Watch', notyet: 'Not yet', held: 'Held for a person', excluded: 'Excluded',
  });

  function holdsFor(shop, jobs, scored, W) {
    const holds = [];
    if (shop.franchise) {
      const brandJob = jobs.find((j) => j.sourceHost && j.sourceHost !== shop.domainKey);
      holds.push({
        code: 'franchise', label: 'Franchise: confirm who buys', short: 'franchise, confirm who buys',
        detail: brandJob
          ? `Part of the ${shop.franchise} brand. Its postings come from the brand's head-office careers site (${brandJob.sourceHost}), not the location's own site.`
          : `Part of the ${shop.franchise} brand, with ${shop.locations.length} listed ${plural(shop.locations.length, 'location', 'locations')}.`,
        next: 'Find out whether this location buys on its own or through head office before anyone calls.',
      });
    }
    if (shop.conflicts.length) {
      const other = shop.conflicts.map((o) => `${o.name} in ${o.metro} (${o.domain})`);
      holds.push({
        code: 'identity', label: 'Identity conflict', short: 'identity conflict',
        detail: `Same name as ${listWords(other)}, with a different website.`,
        next: 'Confirm which website and metro each record belongs to, then rescore both.',
      });
    }
    if (shop.serviceMix === 'unclear') {
      holds.push({
        code: 'mix', label: 'Service mix unclear', short: 'service mix unclear',
        detail: 'The postings don\'t say whether the work is residential, commercial or both.',
        next: 'Check the website for residential repair and replacement work, then rescore.',
      });
    }
    if (!scored.software && scored.score >= W.callAt) {
      holds.push({
        code: 'software', label: 'Software unknown', short: 'software unknown',
        detail: `Strong hiring signals (${fmtPoints(scored.score)} points) but no field-service software named in any posting.`,
        next: 'Find out which field-service software they run before calling it a fit.',
      });
    }
    return holds;
  }

  const HOLD_CODES = Object.freeze([
    { code: 'franchise', label: 'Franchise: confirm who buys' },
    { code: 'identity', label: 'Identity conflict' },
    { code: 'mix', label: 'Service mix unclear' },
    { code: 'software', label: 'Software unknown' },
  ]);

  // ------------------------------------------------------------------ plain words for one shop

  const signalOf = (r, key) => r.signals.find((s) => s.key === key) || null;

  function topReason(r) {
    if (r.tier === 'excluded') return r.exclusion.label;
    if (r.tier === 'held') return `Held: ${r.holds.map((h) => h.short).join('; ')}`;
    const fu = signalOf(r, 'followup');
    const sales = signalOf(r, 'sales');
    const tech = signalOf(r, 'tech');
    const sw = signalOf(r, 'software');
    const loc = signalOf(r, 'newlocation');
    let lead = null;
    if (fu) {
      const e = fu.evidence[0];
      lead = e.via === 'description'
        ? `Front-office opening in ${e.city} includes estimate follow-up`
        : `Hiring ${article(e.title)} ${e.title.toLowerCase()} in ${e.city}`;
    } else if (sales) {
      lead = `Hiring ${countOf(sales.jobsFound, 'sales role', 'sales roles')}`;
    } else if (loc) {
      lead = `Hiring in ${loc.city}, a new metro`;
    } else if (tech) {
      lead = `Hiring ${countOf(tech.jobsFound, 'technician', 'technicians')} only`;
    } else {
      lead = 'No hiring signal';
    }
    return sw ? `${lead}; names ${sw.software}` : lead;
  }

  function seatCost(r) {
    const fu = signalOf(r, 'followup');
    if (!fu) return null;
    const job = fu.jobs.find((j) => j.pay);
    if (!job) return null;
    const a = annualPay(job.pay);
    const text = `This seat costs ${fmtMoney(a.min)} to ${fmtMoney(a.max)} a year.`;
    const basis = job.pay.per === 'hour'
      ? `Posted as ${fmtMoney(job.pay.min)} to ${fmtMoney(job.pay.max)} an hour, figured at 2,080 hours a year. Shown for context, not scored.`
      : 'Posted pay range. Shown for context, not scored.';
    return { min: a.min, max: a.max, text, basis, title: job.title, city: job.city };
  }

  function draftOpener(r) {
    if (r.tier === 'excluded') return null;
    const fu = signalOf(r, 'followup');
    const sales = signalOf(r, 'sales');
    const tech = signalOf(r, 'tech');
    const loc = signalOf(r, 'newlocation');
    const sw = signalOf(r, 'software');
    let base;
    let job = null;
    if (fu) {
      const e = fu.evidence[0];
      job = fu.jobs[0];
      base = e.via === 'description'
        ? `Saw your ${e.city} ${e.title.toLowerCase()} opening includes calling customers back on open estimates`
        : `Saw you're hiring ${article(e.title)} ${e.title.toLowerCase()} in ${e.city}`;
    } else if (sales) {
      const cities = unique(sales.jobs.map((j) => j.city));
      base = `Saw you're adding ${countOf(sales.jobsFound, 'in-home sales role', 'in-home sales roles')} in ${listWords(cities)}`;
      if (sales.jobs.length === 1) job = sales.jobs[0];
    } else if (loc) {
      base = `Saw you're hiring in ${loc.city}, outside your current locations`;
    } else if (tech) {
      const cities = unique(tech.jobs.map((j) => j.city));
      base = `Saw you're hiring ${countOf(tech.jobsFound, 'technician', 'technicians')} in ${listWords(cities)}`;
    } else {
      return null;
    }
    if (sw) {
      const same = job && job.software.some((s) => s.name === sw.software);
      base += same ? `, and the post mentions ${sw.software}` : `, and your posts mention ${sw.software}`;
    }
    return `${base}.`;
  }

  function firstCallQuestions(r) {
    if (r.tier === 'excluded') return [];
    const out = [];
    const fu = signalOf(r, 'followup');
    const sw = signalOf(r, 'software');
    const sales = signalOf(r, 'sales');
    const mem = signalOf(r, 'membership');
    const loc = signalOf(r, 'newlocation');
    const tech = signalOf(r, 'tech');
    if (fu) {
      out.push(fu.evidence[0].via === 'description'
        ? 'How many open estimates does the front desk call back in a week, and how many book a second visit?'
        : 'Who follows up on estimates that don\'t close today, and how many days after the visit?');
    }
    if (sw) {
      out.push(sw.software === 'ServiceTitan'
        ? 'Which estimate statuses do you track in ServiceTitan, and who looks at the open ones each week?'
        : `Do open estimates live in ${sw.software}, or somewhere else, like a spreadsheet?`);
    }
    if (sales) out.push('When an in-home visit ends without a yes, who owns the next call?');
    if (mem) out.push('Do maintenance club visits turn into replacement estimates, and who tracks those?');
    if (loc) out.push(`Will the ${loc.metro} team follow up on its own estimates, or will the main office?`);
    if (tech) out.push('With more technicians writing estimates, who makes sure each one gets a second call?');
    // Shops with thin signals still get two questions that size the problem.
    out.push('Who follows up on estimates that don\'t close today, and how many days after the visit?');
    out.push('How many estimates does the shop write in a typical week, and how many close the same day?');
    return unique(out).slice(0, 2);
  }

  // ------------------------------------------------------------------ the whole run

  function analyze(data, weightsInput) {
    const W = sanitizeWeights(weightsInput || {});
    const cityMetro = data.cityMetro || {};
    const { shops, canonicalOf } = resolveShops(data.shops);
    const byShop = new Map(shops.map((s) => [s.id, []]));
    for (const p of data.postings) {
      const id = canonicalOf[p.shopId];
      if (id && byShop.has(id)) byShop.get(id).push(p);
    }

    const results = shops.map((shop) => {
      const jobs = groupJobs(byShop.get(shop.id), W, data.dataDate, cityMetro);
      const exclusion = gateFor(shop, jobs, W);
      const scored = scoreShop(shop, jobs, W, cityMetro);
      const holds = exclusion ? [] : holdsFor(shop, jobs, scored, W);
      const scoreTier = tierFor(scored.score, W);
      const tier = exclusion ? 'excluded' : holds.length ? 'held' : scoreTier;
      const r = {
        id: shop.id,
        shop,
        jobs,
        listingCount: jobs.reduce((s, j) => s + j.listingCount, 0),
        signals: scored.signals,
        score: scored.score,
        software: scored.software,
        scoreTier,
        exclusion,
        holds,
        tier,
        dedupeNotes: jobs.map(dedupeNote).filter(Boolean),
        notCounted: jobs.filter((j) => !j.sourced || j.weight === 0).map((j) => ({
          title: j.title, city: j.city, posted: j.posted,
          why: !j.sourced ? 'job-board repost with no link back to the shop' : `${j.ageDays} days old, past the ${W.halfCreditDays}-day limit`,
        })),
        partialCredit: jobs.filter((j) => j.sourced && j.weight > 0 && j.weight < 1).map((j) => ({ title: j.title, city: j.city, posted: j.posted, ageDays: j.ageDays })),
      };
      r.topReason = topReason(r);
      r.seatCost = seatCost(r);
      r.opener = draftOpener(r);
      r.questions = firstCallQuestions(r);
      return r;
    });

    const tierRank = { call: 0, watch: 0, notyet: 0, held: 0, excluded: 1 };
    results.sort((a, b) => (tierRank[a.tier] - tierRank[b.tier]) || (b.score - a.score) || a.shop.name.localeCompare(b.shop.name) || a.id.localeCompare(b.id));
    let rank = 0;
    for (const r of results) r.rank = r.tier === 'excluded' ? null : (rank += 1);

    const counts = { call: 0, watch: 0, notyet: 0, held: 0, excluded: 0 };
    for (const r of results) counts[r.tier] += 1;
    const totals = {
      shops: results.length,
      listings: data.postings.length,
      jobs: results.reduce((s, r) => s + r.jobs.length, 0),
      ...counts,
    };
    const analysis = { weights: W, dataDate: data.dataDate, results, totals };
    analysis.sentence = resultSentence(totals);
    analysis.ruleCounts = ruleCounts(results);
    return analysis;
  }

  function resultSentence(t) {
    const is = (n) => (n === 1 ? 'is' : 'are');
    const doesnt = (n) => (n === 1 ? 'doesn\'t' : 'don\'t');
    const out = t.notyet + t.excluded;
    return `Of ${t.shops} shops posting ${t.listings} listings (${t.jobs} distinct jobs), `
      + `${t.call} ${is(t.call)} worth a call this week, ${t.watch} ${is(t.watch)} worth watching, `
      + `${t.held} ${is(t.held)} held for a person, and ${out} ${doesnt(out)} fit yet.`;
  }

  // How many shops each rule touched.
  function ruleCounts(results) {
    const c = {
      merged: 0, conflicts: 0,
      gate: { commercial: 0, small: 0, nosource: 0, stale: 0 },
      deduped: 0, listingsMerged: 0,
      partial: 0, ignored: 0,
      tradeCore: 0, tradeOther: 0,
      software: { ServiceTitan: 0, 'Housecall Pro': 0, other: 0, none: 0 },
      followUp: 0, followUpFromText: 0, followUpCapped: 0,
      sales: 0, salesCapped: 0, tech: 0, techCapped: 0,
      membership: 0, newLocation: 0,
      hold: { franchise: 0, identity: 0, mix: 0, software: 0 },
    };
    for (const r of results) {
      if (r.shop.aliases.length) c.merged += 1;
      if (r.shop.conflicts.length) c.conflicts += 1;
      if (r.exclusion) { c.gate[r.exclusion.code] += 1; }
      const merged = r.jobs.filter((j) => j.listingCount > 1);
      if (merged.length) c.deduped += 1;
      c.listingsMerged += merged.reduce((s, j) => s + j.listingCount - 1, 0);
      if (r.jobs.some((j) => j.sourced && j.weight > 0 && j.weight < 1)) c.partial += 1;
      if (r.jobs.some((j) => j.sourced && j.weight === 0)) c.ignored += 1;
      for (const h of r.holds) c.hold[h.code] += 1;
      if (r.exclusion) continue;
      const core = r.shop.trades.some((t) => t === 'HVAC' || t === 'Plumbing');
      if (core) c.tradeCore += 1; else c.tradeOther += 1;
      if (!r.software) c.software.none += 1;
      else if (c.software[r.software] !== undefined) c.software[r.software] += 1;
      else c.software.other += 1;
      const fu = signalOf(r, 'followup');
      if (fu) {
        c.followUp += 1;
        if (fu.evidence[0].via === 'description') c.followUpFromText += 1;
        if (fu.capped) c.followUpCapped += 1;
      }
      const sales = signalOf(r, 'sales');
      if (sales) { c.sales += 1; if (sales.capped) c.salesCapped += 1; }
      const tech = signalOf(r, 'tech');
      if (tech) { c.tech += 1; if (tech.capped) c.techCapped += 1; }
      if (signalOf(r, 'membership')) c.membership += 1;
      if (signalOf(r, 'newlocation')) c.newLocation += 1;
    }
    return c;
  }

  // Each rule in one sentence, using the weights in force.
  function rulesInPlainWords(W, c) {
    const s = (n) => `${n} ${plural(n, 'shop', 'shops')}`;
    return [
      { step: 'Same shop', text: 'Two records with the same website are one shop. Same name with a different website is held for a person.', count: `${s(c.merged)} merged, ${s(c.conflicts)} held` },
      { step: 'Gate', text: 'Commercial-only shops are out: the buyer here is residential repair and replacement.', count: s(c.gate.commercial) },
      { step: 'Gate', text: `Shops with fewer than ${W.minTechs} technicians are too small for now.`, count: s(c.gate.small) },
      { step: 'Gate', text: 'A shop whose only listings are job-board reposts with no link back to the shop is out.', count: s(c.gate.nosource) },
      { step: 'Gate', text: `A shop whose listings are all more than ${W.halfCreditDays} days old is out.`, count: s(c.gate.stale) },
      { step: 'Count jobs', text: `Listings with the same title from the same shop within ${W.dedupeDays} days are one job, wherever and however often it was posted.`, count: `${s(c.deduped)}, ${c.listingsMerged} extra ${plural(c.listingsMerged, 'listing', 'listings')} folded in` },
      { step: 'Recency', text: `A job counts in full up to ${W.fullCreditDays} days old, at ${fmtPoints(W.halfCredit * 100)}% up to ${W.halfCreditDays} days, and not at all after that.`, count: `${s(c.partial)} with partial credit, ${s(c.ignored)} with ignored jobs` },
      { step: 'Points', text: `HVAC or plumbing shops get ${fmtPoints(W.tradeCore)}; electrical, roofing and pest get ${fmtPoints(W.tradeOther)}.`, count: `${c.tradeCore} core, ${c.tradeOther} adjacent` },
      { step: 'Points', text: `Software is read from the posting text: ServiceTitan ${fmtPoints(W.softwareServiceTitan)}, Housecall Pro ${fmtPoints(W.softwareHousecallPro)}, any other named ${fmtPoints(W.softwareOther)}, none 0.`, count: `${c.software.ServiceTitan} ServiceTitan, ${c.software['Housecall Pro']} Housecall Pro, ${c.software.other} other, ${c.software.none} none` },
      { step: 'Points', text: `A follow-up hire (inside sales, estimate follow-up, sales support, or a front-office post whose text says it calls back on open estimates) gets ${fmtPoints(W.followUp)}, counting at most ${W.followUpMaxJobs} ${plural(W.followUpMaxJobs, 'job', 'jobs')}.`, count: `${s(c.followUp)}, ${c.followUpFromText} found only in the description` },
      { step: 'Points', text: `Each sales hire gets ${fmtPoints(W.sales)}, counting at most ${W.salesMaxJobs} ${plural(W.salesMaxJobs, 'job', 'jobs')} (${fmtPoints(W.sales * W.salesMaxJobs)} max).`, count: `${s(c.sales)}, ${c.salesCapped} capped` },
      { step: 'Points', text: `Each technician hire gets ${fmtPoints(W.tech)}, counting at most ${W.techMaxJobs} ${plural(W.techMaxJobs, 'job', 'jobs')} (${fmtPoints(W.tech * W.techMaxJobs)} max).`, count: `${s(c.tech)}, ${c.techCapped} capped` },
      { step: 'Points', text: `A membership plan or maintenance club in the text adds ${fmtPoints(W.membership)}.`, count: s(c.membership) },
      { step: 'Points', text: `A posting in a metro where the shop has no listed location adds ${fmtPoints(W.newLocation)}.`, count: s(c.newLocation) },
      { step: 'Tiers', text: `Call this week at ${fmtPoints(W.callAt)} points or more, Watch from ${fmtPoints(W.watchAt)}, Not yet below that.`, count: '' },
      { step: 'Holds', text: 'Franchise locations, identity conflicts, an unclear service mix, and Call-level shops with no software named go to a person instead of a tier.', count: `${c.hold.franchise} franchise, ${c.hold.identity} identity, ${c.hold.mix} mix, ${c.hold.software} software` },
    ];
  }

  // ------------------------------------------------------------------ segments (second page)

  const ADJACENT = new Set(['Electrical', 'Roofing', 'Pest']);
  function tradeGroup(trades) {
    if (trades.includes('HVAC') && trades.includes('Plumbing')) return 'HVAC and plumbing';
    const t = trades[0];
    return t === 'Pest' ? 'Pest control' : t;
  }
  const isAdjacent = (trades) => trades.every((t) => ADJACENT.has(t));

  function median(values) {
    const v = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  function shopFacts(r) {
    const counted = r.jobs.filter((j) => j.sourced && j.weight > 0);
    const followUpJobs = counted.filter((j) => j.family === 'followup');
    return {
      qualified: r.tier !== 'excluded',
      namesServiceTitan: counted.some((j) => j.software.some((s) => s.name === 'ServiceTitan')),
      hiringFollowUp: followUpJobs.length > 0,
      hiringSales: counted.some((j) => j.family === 'sales'),
      followUpPay: followUpJobs.filter((j) => j.pay).map((j) => { const a = annualPay(j.pay); return (a.min + a.max) / 2; }),
      call: r.tier === 'call',
    };
  }

  function segmentKey(r, groupBy, regions) {
    const trade = tradeGroup(r.shop.trades);
    const metro = r.shop.metro;
    if (groupBy === 'trade') return { key: trade, trade, metro: null, label: trade };
    if (groupBy === 'metro') return { key: metro, trade: null, metro, label: metro };
    if (groupBy === 'trade-region') {
      const region = regions[metro] || metro;
      return { key: `${trade}|${region}`, trade, metro: null, region, label: `${trade}, ${region}` };
    }
    return { key: `${trade}|${metro}`, trade, metro, label: `${trade}, ${metro}` };
  }

  function segmentRows(analysis, data, opts) {
    const options = { groupBy: 'trade-metro', includeAdjacent: true, ...(opts || {}) };
    const regions = data.regions || {};
    const groups = new Map();
    for (const r of analysis.results) {
      if (!options.includeAdjacent && isAdjacent(r.shop.trades)) continue;
      const k = segmentKey(r, options.groupBy, regions);
      if (!groups.has(k.key)) groups.set(k.key, { ...k, members: [] });
      groups.get(k.key).members.push(r);
    }
    const rows = [...groups.values()].map((g) => {
      const facts = g.members.map(shopFacts);
      const n = g.members.length;
      const qualified = facts.filter((f) => f.qualified).length;
      const st = facts.filter((f) => f.namesServiceTitan).length;
      const fu = facts.filter((f) => f.hiringFollowUp).length;
      const stFollow = facts.filter((f) => f.qualified && f.namesServiceTitan && f.hiringFollowUp).length;
      const qualifiedFollow = facts.filter((f) => f.qualified && f.hiringFollowUp).length;
      const sales = facts.filter((f) => f.qualified && f.hiringSales).length;
      const call = facts.filter((f) => f.call).length;
      return {
        key: g.key, label: g.label, trade: g.trade, metro: g.metro, region: g.region || null,
        shops: n,
        qualified,
        qualifiedShare: qualified / n,
        serviceTitan: st,
        serviceTitanShare: st / n,
        followUp: fu,
        followUpShare: fu / n,
        stFollow,
        qualifiedFollow,
        salesHiring: sales,
        medianFollowUpPay: median(facts.flatMap((f) => f.followUpPay)),
        medianTechs: median(g.members.map((r) => r.shop.techs)),
        call,
        callShare: qualified ? call / qualified : 0,
        shopNames: g.members.map((r) => r.shop.name),
      };
    });
    rows.sort((a, b) => (b.stFollow - a.stFollow) || (b.call - a.call) || (b.callShare - a.callShare)
      || (b.qualified - a.qualified) || a.label.localeCompare(b.label));
    rows.forEach((row, i) => {
      row.rank = i + 1;
      row.reason = segmentReason(row);
      row.angle = i < 3 ? openingAngle(row) : null;
    });
    return rows;
  }

  const pct = (x) => `${Math.round(x * 100)}%`;

  function segmentReason(row) {
    if (!row.qualified) return `None of its ${row.shops} ${plural(row.shops, 'shop', 'shops')} pass the fit gates.`;
    const lead = row.stFollow
      ? `ServiceTitan plus a follow-up hire at ${row.stFollow} of ${row.qualified} qualified ${plural(row.qualified, 'shop', 'shops')}`
      : row.qualifiedFollow
        ? `A follow-up hire at ${row.qualifiedFollow} of ${row.qualified} qualified ${plural(row.qualified, 'shop', 'shops')}, none naming ServiceTitan`
        : `No follow-up hires among ${row.qualified} qualified ${plural(row.qualified, 'shop', 'shops')}`;
    return `${lead}; ${row.call} in Call this week.`;
  }

  function openingAngle(row) {
    if (row.qualifiedFollow > 0) {
      const pay = row.medianFollowUpPay ? `, a seat posted at a median of ${fmtMoney(row.medianFollowUpPay)} a year` : '';
      const st = row.stFollow ? ` ${row.stFollow} of them ${plural(row.stFollow, 'names', 'name')} ServiceTitan in the posting, where the estimate data already lives.` : '';
      return `Lead with the follow-up seat: ${row.qualifiedFollow} qualified ${plural(row.qualifiedFollow, 'shop is', 'shops are')} hiring someone to call back on open estimates${pay}.${st}`;
    }
    if (row.salesHiring > 0) {
      return `Lead with in-home sales growth: ${row.salesHiring} ${plural(row.salesHiring, 'shop is', 'shops are')} adding sales roles, so more estimates will need a second call soon.`;
    }
    return 'Lead with technician growth: more technicians on the road means more estimates written, and someone has to call each one back.';
  }

  // "HVAC shops in the Sun Belt metros have the most ServiceTitan shops hiring
  // for follow-up work: X of Y."
  function segmentSentence(analysis, data, opts) {
    const rows = segmentRows(analysis, data, { ...(opts || {}), groupBy: 'trade-region' });
    const best = [...rows].sort((a, b) => (b.stFollow - a.stFollow) || (b.shops - a.shops) || a.label.localeCompare(b.label))[0];
    if (!best || best.stFollow === 0) return 'No segment has a qualified ServiceTitan shop hiring for follow-up work yet.';
    const metros = (data.metros || []).filter((m) => (data.regions || {})[m] === best.region);
    return `${best.trade} shops in the ${best.region} metros (${listWords(metros)}) have the most ServiceTitan shops hiring for follow-up work: ${best.stFollow} of ${best.shops}.`;
  }

  root.TradesSignals = Object.freeze({
    DEFAULT_WEIGHTS, WEIGHT_FIELDS, SOFTWARE, GATES, HOLD_CODES, TIER_LABEL,
    sanitizeWeights,
    normalizeDomain, normalizeName, normalizeTitle, daysBetween, recencyWeight,
    classifyJob, softwareIn, annualPay,
    resolveShops, groupJobs, dedupeNote, gateFor, scoreShop, tierFor, holdsFor,
    topReason, seatCost, draftOpener, firstCallQuestions,
    analyze, resultSentence, ruleCounts, rulesInPlainWords,
    tradeGroup, isAdjacent, median, segmentRows, segmentSentence,
    fmtPoints, fmtMoney, fmtDate, listWords, plural, countOf, pct, sentences,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
