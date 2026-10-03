// Drawing only. Every number comes from TradesSignals.segmentRows() and segmentSentence().
(function () {
  'use strict';

  const S = globalThis.TradesSignals;
  const D = globalThis.TRADES_DATA;
  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const analysis = S.analyze(D, S.DEFAULT_WEIGHTS);
  const state = { groupBy: 'trade-metro', includeAdjacent: true };

  const share = (n, d) => (d ? `${n} of ${d} (${S.pct(n / d)})` : '0');
  const money = (v) => (v === null ? 'none posted' : S.fmtMoney(v));
  const techs = (v) => (v === null ? 'unknown' : S.fmtPoints(v));

  function render() {
    const opts = { groupBy: state.groupBy, includeAdjacent: state.includeAdjacent };
    const rows = S.segmentRows(analysis, D, opts);
    $('data-date').textContent = `Data date: ${S.fmtDate(D.dataDate)}, ${D.dataDate.slice(0, 4)}`;
    $('result').textContent = S.segmentSentence(analysis, D, { includeAdjacent: state.includeAdjacent });

    $('angles').replaceChildren(...rows.filter((r) => r.angle).map((r) => h('article', { class: 'card pad angle-card' },
      h('div', { class: 'rank-no', text: `Number ${r.rank}` }),
      h('h3', { text: r.label }),
      h('p', { class: 'small muted', text: r.reason }),
      h('p', { text: r.angle }),
      h('span', { class: 'shop-names', text: `Shops: ${S.listWords(r.shopNames)}` }))));

    $('segment-body').replaceChildren(...rows.map((r) => h('tr', {},
      h('td', { class: 'num', 'data-label': 'Rank', text: String(r.rank) }),
      h('td', { class: 'lead', 'data-label': 'Segment' }, h('b', { text: r.label }), h('span', { class: 'shop-names', text: S.listWords(r.shopNames) })),
      h('td', { class: 'num', 'data-label': 'Shops', text: String(r.shops) }),
      h('td', { class: 'num', 'data-label': 'Pass fit gates', text: share(r.qualified, r.shops) }),
      h('td', { class: 'num', 'data-label': 'Name ServiceTitan', text: share(r.serviceTitan, r.shops) }),
      h('td', { class: 'num', 'data-label': 'Hiring follow-up', text: share(r.followUp, r.shops) }),
      h('td', { class: 'num', 'data-label': 'Median follow-up pay', text: money(r.medianFollowUpPay) }),
      h('td', { class: 'num', 'data-label': 'Median techs', text: techs(r.medianTechs) }),
      h('td', { class: 'num', 'data-label': 'Qualified in Call this week', text: share(r.call, r.qualified) }),
      h('td', { class: 'wide', 'data-label': 'Why it ranks here', text: r.reason }))));
  }

  $('group-by').addEventListener('change', (e) => {
    if (e.target && e.target.name === 'group') { state.groupBy = e.target.value; render(); }
  });
  $('adjacent').addEventListener('change', (e) => { state.includeAdjacent = e.target.checked; render(); });

  render();
})();
