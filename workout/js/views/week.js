/* Week view: exercises down the side, Mon-Sun across - the spreadsheet layout, done for you. */
window.WL = window.WL || {};
WL.views = WL.views || {};

WL.views.week = (function () {
  const u = WL.u, h = u.h, C = WL.catalog;

  async function render(container, args, app) {
    const store = app.store;
    const anchor = args[0] && /^\d{4}-\d{2}-\d{2}$/.test(args[0]) ? args[0] : u.today();
    const start = u.weekStart(anchor);
    const days = u.weekDays(start);
    const end = days[6];
    const thisWeek = u.weekStart(u.today());
    const [sets, daily] = await Promise.all([store.listSets({ from: start, to: end }), store.listDaily({ from: start, to: end })]);

    const nav = h('div.datebar',
      h('button.icon-btn', { onclick: () => app.go('week/' + u.addDays(start, -7)), 'aria-label': 'Previous week' }, '‹'),
      h('div.datebar-mid',
        h('div.datebar-day', 'Week of ' + u.fmtDate(start)),
        h('div.datebar-sub', u.fmtDate(start) + ' – ' + u.fmtDate(end, { year: true }),
          start !== thisWeek ? [' · ', h('a', { href: '#week' }, 'This week')] : null),
        h('input.date-pick', { type: 'date', value: start, 'aria-label': 'Pick a week', onchange: (e) => e.target.value && app.go('week/' + e.target.value) })),
      h('button.icon-btn', { onclick: () => app.go('week/' + u.addDays(start, 7)), 'aria-label': 'Next week' }, '›'));

    /* summary chips */
    const activeDays = new Set(sets.map((s) => s.date)).size;
    const totalReps = sets.reduce((a, s) => a + (s.reps || 0), 0);
    const chips = h('div.chips',
      chip(activeDays, activeDays === 1 ? 'day trained' : 'days trained'),
      chip(sets.length, 'sets'),
      chip(u.fmtNum(totalReps), 'reps'));

    /* rows: active exercises, plus archived ones that have sets this week */
    const used = new Set(sets.map((s) => s.exerciseId));
    const rows = app.exercises.filter((e) => !e.archived || used.has(e.id));
    const table = h('table.week-grid');
    table.appendChild(h('thead', h('tr',
      h('th.sticky', ''),
      days.map((d) => h('th' + (d === u.today() ? '.today' : ''), h('a', { href: '#log/' + d }, h('span.dow', u.dayShort(d)), h('span.dom', String(u.parse(d).getDate()))))),
      h('th.total', 'Week'))));
    const tb = h('tbody');
    rows.forEach((ex) => {
      const mine = sets.filter((s) => s.exerciseId === ex.id);
      const hl = C.headline(ex);
      tb.appendChild(h('tr' + (mine.length ? '' : '.idle'),
        h('th.sticky', h('span.ex-name', ex.name)),
        days.map((d) => {
          const ds = mine.filter((s) => s.date === d);
          return h('td' + (ds.length ? '.hit' : '') + (d === u.today() ? '.today' : ''),
            h('a.cell', { href: '#log/' + d + '/' + ex.id, title: ds.length ? C.summarize(ex, ds) : 'Log ' + ex.name + ' on ' + u.fmtDate(d) },
              ds.length ? [h('b', String(ds.length)), h('small', C.summarize(ex, ds))] : h('span.plus', '+')));
        }),
        h('td.total', mine.length ? [h('b', u.fmtNum(hl.calc(mine)) + (hl.unit ? ' ' + hl.unit : '')), h('small', hl.key === 'sets' ? 'sets' : hl.label.toLowerCase() + ' · ' + mine.length + ' sets')] : '')));
    });

    /* daily trackers */
    const ms = app.metrics.filter((m) => !m.archived);
    if (ms.length) {
      tb.appendChild(h('tr.divider', h('th.sticky', 'Daily'), h('td', { colSpan: 8 })));
      ms.forEach((m) => {
        const vals = days.map((d) => (daily[d] || {})[m.id]).filter((v) => v != null);
        const agg = !vals.length ? null : m.agg === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0);
        tb.appendChild(h('tr.metric',
          h('th.sticky', h('span.ex-name', m.name)),
          days.map((d) => {
            const v = (daily[d] || {})[m.id];
            return h('td' + (v != null ? '.hit' : '') + (d === u.today() ? '.today' : ''), h('a.cell', { href: '#log/' + d }, v != null ? h('b', u.fmtNum(v, 1)) : h('span.plus', '+')));
          }),
          h('td.total', agg != null ? [h('b', u.fmtNum(agg, 1) + (m.unit ? ' ' + m.unit : '')), h('small', m.agg === 'avg' ? 'average' : 'total')] : '')));
      });
    }
    table.appendChild(tb);

    container.append(nav, chips, h('div.grid-wrap', table),
      h('p.hint', sets.length ? '' : 'Nothing logged this week yet. Tap any cell to log that day.'));
  }

  function chip(n, label) { return h('div.chip', h('b', String(n)), h('span', label)); }

  return { render };
})();
