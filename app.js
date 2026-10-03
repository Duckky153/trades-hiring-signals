// Drawing only. Every number on the page comes from TradesSignals.analyze().
(function () {
  'use strict';

  const S = globalThis.TradesSignals;
  const D = globalThis.TRADES_DATA;
  const $ = (id) => document.getElementById(id);

  // Small DOM builder. Text always goes in through textContent.
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'call', label: 'Call this week' },
    { key: 'watch', label: 'Watch' },
    { key: 'held', label: 'Held for a person' },
    { key: 'notyet', label: 'Not yet' },
    { key: 'excluded', label: 'Excluded' },
  ];

  const state = { weights: { ...S.DEFAULT_WEIGHTS }, filter: 'all', showAll: false, analysis: null };

  const tradeText = (shop) => S.listWords(shop.trades.map((t) => (t === 'HVAC' ? 'HVAC' : t === 'Pest' ? 'Pest control' : t)));
  const techText = (shop) => (Number.isFinite(shop.techs) ? String(shop.techs) : 'unknown');
  const tierBadge = (tier) => h('span', { class: `tier tier-${tier}`, text: S.TIER_LABEL[tier] });
  const ageText = (e) => (e.weight < 1 ? `${e.ageDays} days old, ${S.fmtPoints(e.weight * 100)}% credit` : `${e.ageDays} days old`);

  // ------------------------------------------------------------------ result + filters + table

  function renderResult() {
    $('result').textContent = state.analysis.sentence;
    $('data-date').textContent = `Data date: ${S.fmtDate(D.dataDate)}, ${D.dataDate.slice(0, 4)}`;
  }

  function renderFilters() {
    const t = state.analysis.totals;
    const counts = { all: t.shops, call: t.call, watch: t.watch, held: t.held, notyet: t.notyet, excluded: t.excluded };
    const box = $('filters');
    box.replaceChildren(...FILTERS.map((f) => h('button', {
      type: 'button',
      'aria-pressed': String(state.filter === f.key),
      onclick: () => { state.filter = f.key; renderFilters(); renderTable(); },
    }, f.label, h('span', { class: 'count', text: `(${counts[f.key]})` }))));
  }

  const FIRST_ROWS = 20;

  function renderTable() {
    const all = state.analysis.results.filter((r) => state.filter === 'all' || r.tier === state.filter);
    const rows = state.filter === 'all' && !state.showAll ? all.slice(0, FIRST_ROWS) : all;
    const body = $('rank-body');
    const more = $('show-more');
    more.hidden = rows.length === all.length;
    more.textContent = `Show all ${all.length} shops`;
    if (!rows.length) {
      body.replaceChildren(h('tr', {}, h('td', { colspan: '9', class: 'muted', text: 'No shops in this tier with the current weights.' })));
      return;
    }
    body.replaceChildren(...rows.map((r) => {
      const open = () => openDetail(r.id);
      return h('tr', { class: 'clickable', onclick: open },
        h('td', { class: 'num', 'data-label': 'Rank', text: r.rank === null ? '' : String(r.rank) }),
        h('td', { class: 'lead', 'data-label': 'Shop' },
          h('button', { type: 'button', class: 'linkish', onclick: (e) => { e.stopPropagation(); open(); }, text: r.shop.name }),
          h('span', { class: 'domain', text: r.shop.domain })),
        h('td', { 'data-label': 'Trade', text: tradeText(r.shop) }),
        h('td', { 'data-label': 'Metro', text: r.shop.metro }),
        h('td', { class: 'num', 'data-label': 'Techs', text: techText(r.shop) }),
        h('td', { 'data-label': 'Software', text: r.software || 'none named' }),
        h('td', { class: 'num', 'data-label': 'Score', text: r.tier === 'excluded' ? 'not scored' : S.fmtPoints(r.score) }),
        h('td', { 'data-label': 'Tier' }, tierBadge(r.tier)),
        h('td', { class: 'wide', 'data-label': 'Top reason', text: r.topReason }));
    }));
  }

  // ------------------------------------------------------------------ held + excluded

  function renderHeld() {
    const held = state.analysis.results.filter((r) => r.tier === 'held');
    const box = $('held-list');
    if (!held.length) { box.replaceChildren(h('p', { class: 'muted', text: 'Nothing is held with the current weights.' })); return; }
    box.replaceChildren(...held.map((r) => h('article', { class: 'card pad hold-card' },
      h('h3', {}, h('button', { type: 'button', class: 'linkish', onclick: () => openDetail(r.id), text: r.shop.name })),
      h('div', { class: 'muted small', text: `${tradeText(r.shop)}, ${r.shop.metro}. Would score ${S.fmtPoints(r.score)} (${S.TIER_LABEL[r.scoreTier]}).` }),
      r.holds.map((hold) => [
        h('p', { class: 'reason', text: hold.label }),
        h('p', { class: 'small', text: hold.detail }),
        h('p', { class: 'next small' }, h('b', { text: 'Next step: ' }), hold.next),
      ]))));
  }

  function renderExcluded() {
    const out = state.analysis.results.filter((r) => r.tier === 'excluded');
    const box = $('excluded-list');
    if (!out.length) { box.replaceChildren(h('li', { class: 'muted', text: 'No shop fails a gate with the current weights.' })); return; }
    box.replaceChildren(...out.map((r) => h('li', {},
      h('button', { type: 'button', class: 'linkish', onclick: () => openDetail(r.id), text: r.shop.name }),
      ` (${tradeText(r.shop)}, ${r.shop.metro}). `,
      h('b', { text: `${r.exclusion.label}: ` }), r.exclusion.why)));
  }

  // ------------------------------------------------------------------ cap callout

  function calcRows(r) {
    const rows = [];
    for (const s of r.signals) {
      if (s.key === 'followup' || s.key === 'sales' || s.key === 'tech') {
        const jobs = `${s.jobsFound} ${S.plural(s.jobsFound, 'job', 'jobs')}`;
        const label = `${s.label}: ${jobs} at ${S.fmtPoints(s.perJob)} each`;
        const capNote = s.capped ? `would be ${S.fmtPoints(s.uncapped)}, capped at ${s.maxJobs} ${S.plural(s.maxJobs, 'job', 'jobs')}` : null;
        rows.push({ label, note: capNote, points: s.points, capped: s.capped });
      } else if (s.key === 'trade') {
        rows.push({ label: `${s.label} (${s.detail})`, points: s.points });
      } else {
        rows.push({ label: s.label, points: s.points });
      }
    }
    return rows;
  }

  function renderCaps() {
    const ids = D.callouts || {};
    const large = state.analysis.results.find((r) => r.id === ids.capLarge);
    const mid = state.analysis.results.find((r) => r.id === ids.capMid);
    if (!large || !mid) { $('caps').hidden = true; return; }
    const uncapped = (r) => S.fmtPoints(r.signals.reduce((sum, s) => sum + (s.uncapped !== undefined ? s.uncapped : s.points), 0));
    const techSignal = large.signals.find((s) => s.key === 'tech');
    const techJobs = techSignal ? techSignal.jobsFound : 0;
    const firstFollowUp = mid.signals.find((s) => s.key === 'followup');
    const above = large.score > mid.score ? `${large.shop.name} still ranks above ${mid.shop.name}` : `${mid.shop.name} ranks above ${large.shop.name}`;
    $('cap-summary').textContent = `${large.shop.name} has about ${large.shop.techs} technicians and posts ${large.listingCount} listings, ${techJobs} of them technician jobs, but no follow-up hire. `
      + `${mid.shop.name} has about ${mid.shop.techs} technicians and ${firstFollowUp ? `is hiring ${/\bfirst\b/i.test(firstFollowUp.evidence[0].line || '') ? 'its first' : 'an'} ${firstFollowUp.evidence[0].title.toLowerCase()}` : 'has no follow-up hire counted'}. `
      + `Without caps, ${large.shop.name} would score ${uncapped(large)}. With the current caps it scores ${S.fmtPoints(large.score)} against ${S.fmtPoints(mid.score)}, so ${above}. A shop that is only growing its crew shouldn't outrank one paying for the exact work being sold.`;
    $('cap-grid').replaceChildren(...[large, mid].map((r) => h('article', { class: 'card pad cap-card' },
      h('h3', {}, h('button', { type: 'button', class: 'linkish', onclick: () => openDetail(r.id), text: r.shop.name })),
      h('div', { class: 'muted small', text: `About ${r.shop.techs} technicians, ${r.listingCount} listings, ${r.jobs.length} distinct jobs` }),
      h('table', { class: 'calc' }, h('tbody', {},
        calcRows(r).map((row) => h('tr', {},
          h('td', {}, row.label, row.note ? h('div', { class: 'small capped', text: row.note }) : null),
          h('td', { text: S.fmtPoints(row.points) }))),
        h('tr', { class: 'total' }, h('td', {}, 'Total ', tierBadge(r.tier)), h('td', { text: S.fmtPoints(r.score) })))))));
  }

  // ------------------------------------------------------------------ rules + weights

  function renderRules() {
    const rules = S.rulesInPlainWords(state.analysis.weights, state.analysis.ruleCounts);
    $('rules-list').replaceChildren(...rules.map((rule) => h('li', {},
      h('span', { class: 'step', text: rule.step }),
      h('span', { text: rule.text }),
      h('span', { class: 'affected', text: rule.count }))));
  }

  function buildWeightsForm() {
    const groups = [...new Set(S.WEIGHT_FIELDS.map((f) => f.group))];
    $('weights-form').replaceChildren(...groups.map((g) => h('div', { class: 'weight-group' },
      h('h4', { text: g }),
      h('div', { class: 'weight-grid' }, S.WEIGHT_FIELDS.filter((f) => f.group === g).map((f) => h('label', {},
        h('span', {}, f.label, h('code', { text: f.key })),
        h('input', {
          type: 'number', inputmode: 'decimal', min: '0', max: String(f.max), step: String(f.step),
          value: String(state.weights[f.key]), 'data-key': f.key,
          oninput: (e) => {
            state.weights[f.key] = e.target.value;
            renderAll();
          },
        })))))));
  }

  function renderWeightsState() {
    const W = state.analysis.weights;
    const changed = S.WEIGHT_FIELDS.filter((f) => W[f.key] !== S.DEFAULT_WEIGHTS[f.key]).map((f) => f.label.toLowerCase());
    $('weights-state').textContent = changed.length ? `Changed: ${changed.join(', ')}.` : 'Default weights.';
  }

  // ------------------------------------------------------------------ detail view

  function evidenceBlock(e) {
    const where = `${e.title}, ${e.city}. ${e.board[0].toUpperCase()}${e.board.slice(1)}, posted ${S.fmtDate(e.posted)} (${ageText(e)}).`;
    return h('div', { class: 'evidence' },
      h('span', { class: 'where', text: where }),
      e.line ? h('blockquote', { class: 'quote', text: `"${e.line}"` }) : null);
  }

  function signalExplain(s) {
    if (s.key === 'trade') return s.detail;
    if (s.key === 'followup' || s.key === 'sales' || s.key === 'tech') {
      const base = `${s.jobsFound} ${S.plural(s.jobsFound, 'job', 'jobs')} found, ${S.fmtPoints(s.perJob)} each, counting at most ${s.maxJobs}.`;
      return s.capped ? `${base} Capped: would be ${S.fmtPoints(s.uncapped)}.` : base;
    }
    if (s.key === 'software') return 'Read from the posting text.';
    if (s.key === 'newlocation') return `${s.city} is in the ${s.metro} metro.`;
    return '';
  }

  function openDetail(id) {
    const r = state.analysis.results.find((x) => x.id === id);
    if (!r) return;
    const shop = r.shop;
    $('detail-title').textContent = shop.name;
    // replaceChildren() would print a null as the word "null", so drop empty facts first.
    $('detail-facts').replaceChildren(...[
      h('span', { text: shop.domain }),
      h('span', { text: tradeText(shop) }),
      h('span', { text: `${shop.metro} (${S.listWords(shop.locations)})` }),
      h('span', { text: `${techText(shop)} technicians` }),
      shop.franchise ? h('span', { text: `${shop.franchise} franchise` }) : null,
    ].filter(Boolean));

    const body = [];
    let status;
    if (r.tier === 'excluded') {
      status = h('div', { class: 'status' }, tierBadge('excluded'), ` ${r.exclusion.label}. ${r.exclusion.why}`);
    } else if (r.tier === 'held') {
      status = h('div', { class: 'status' }, tierBadge('held'),
        ` Would score ${S.fmtPoints(r.score)} (${S.TIER_LABEL[r.scoreTier]}).`,
        r.holds.map((hold) => h('p', { class: 'small' },h('b', { text: `${hold.label}. ` }), `${hold.detail} Next step: ${hold.next}`)));
    } else {
      status = h('div', { class: 'status' }, tierBadge(r.tier), ` ${S.fmtPoints(r.score)} points, rank ${r.rank} of ${state.analysis.results.filter((x) => x.rank !== null).length}.`);
    }
    body.push(status);

    if (shop.techNote) body.push(h('p', { class: 'small muted', text: `Technician count from careers-page text: "${shop.techNote}".` }));
    if (shop.aliases.length) {
      body.push(h('p', { class: 'small', text: `Also listed as ${S.listWords(shop.aliases.map((a) => `"${a.name}" (${a.domain})`))}. Same website, so the records were merged into one shop.` }));
    }

    if (r.tier !== 'excluded') {
      body.push(h('h3', { text: 'Signals and points' }));
      body.push(h('div', { class: 'table-wrap' }, h('table', { class: 'signal-table stack' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Signal' }), h('th', { class: 'num', scope: 'col', text: 'Points' }), h('th', { scope: 'col', text: 'Behind it' }))),
        h('tbody', {},
          r.signals.map((s) => h('tr', {},
            h('td', { class: 'lead', 'data-label': 'Signal', text: s.label }),
            h('td', { 'data-label': 'Points', text: S.fmtPoints(s.points) }),
            h('td', { class: 'wide', 'data-label': 'Behind it' },
              h('div', { class: 'small muted', text: signalExplain(s) }),
              (s.evidence || []).map(evidenceBlock)))),
          h('tr', {}, h('td', { class: 'lead', 'data-label': 'Total' }, h('b', { text: 'Total' })), h('td', { 'data-label': 'Points', text: S.fmtPoints(r.score) }), h('td', { class: 'wide', 'data-label': '' }))))));
    }

    if (r.dedupeNotes.length) {
      body.push(h('h3', { text: 'Counted once' }));
      body.push(h('ul', { class: 'small' }, r.dedupeNotes.map((n) => h('li', { text: n }))));
    }
    if (r.notCounted.length) {
      body.push(h('h3', { text: 'Not counted' }));
      body.push(h('ul', { class: 'small' }, r.notCounted.map((n) => h('li', { text: `${n.title}, ${n.city}, posted ${S.fmtDate(n.posted)}: ${n.why}.` }))));
    }
    if (r.seatCost) {
      body.push(h('h3', { text: 'What the follow-up seat costs' }));
      body.push(h('p', {}, h('b', { text: r.seatCost.text }), ' ', h('span', { class: 'muted small', text: r.seatCost.basis })));
    }
    if (r.opener) {
      body.push(h('h3', { text: 'Draft first line' }));
      body.push(h('blockquote', { class: 'quote opener', text: r.opener }));
      body.push(h('p', { class: 'small muted', text: r.tier === 'held' ? 'Built only from this shop\'s own postings. Use it after the hold is cleared.' : 'Built only from this shop\'s own postings.' }));
    }
    if (r.questions.length) {
      body.push(h('h3', { text: 'First-call questions' }));
      body.push(h('ol', {}, r.questions.map((q) => h('li', { text: q }))));
    }

    const listings = D.postings.filter((p) => r.jobs.some((j) => j.listingIds.includes(p.id)));
    body.push(h('details', {},
      h('summary', { text: `All ${listings.length} listings behind this shop` }),
      h('div', { class: 'table-wrap' }, h('table', { class: 'listing-table stack' },
        h('thead', {}, h('tr', {}, ['Posted', 'Title', 'City', 'Board', 'Source'].map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, listings.map((p) => h('tr', {},
          h('td', { 'data-label': 'Posted', text: S.fmtDate(p.posted) }),
          h('td', { 'data-label': 'Title', text: p.title }),
          h('td', { 'data-label': 'City', text: p.city }),
          h('td', { 'data-label': 'Board', text: p.board }),
          h('td', { 'data-label': 'Source', text: p.sourceUrl ? p.sourceUrl.replace(/^https?:\/\//, '') : 'none' }))))))));

    $('detail-body').replaceChildren(...body);
    const dialog = $('detail');
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    $('detail-body').scrollTop = 0;
  }

  function closeDetail() {
    const dialog = $('detail');
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  }

  // ------------------------------------------------------------------ wiring

  function renderAll() {
    state.analysis = S.analyze(D, state.weights);
    renderResult();
    renderFilters();
    renderTable();
    renderHeld();
    renderExcluded();
    renderCaps();
    renderRules();
    renderWeightsState();
  }

  $('show-more').addEventListener('click', () => { state.showAll = true; renderTable(); });
  $('detail-close').addEventListener('click', closeDetail);
  $('detail').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDetail(); });
  $('weights-reset').addEventListener('click', () => {
    state.weights = { ...S.DEFAULT_WEIGHTS };
    buildWeightsForm();
    renderAll();
  });

  buildWeightsForm();
  renderAll();
})();
