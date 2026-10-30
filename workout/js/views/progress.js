/* Progress view: weekly totals per exercise over time, plus daily tracker trends. */
window.WL = window.WL || {};
WL.views = WL.views || {};

WL.views.progress = (function () {
  const u = WL.u, h = u.h, C = WL.catalog;
  const RANGES = [{ id: '3m', label: '3 mo', weeks: 13 }, { id: '6m', label: '6 mo', weeks: 26 }, { id: '1y', label: '1 yr', weeks: 52 }, { id: 'all', label: 'All', weeks: null }];
  let state = { range: '6m', stat: {} };

  async function render(container, args, app) {
    const store = app.store;
    const allSets = await store.listSets();
    const daily = await store.listDaily();
    const counts = {};
    allSets.forEach((s) => { counts[s.exerciseId] = (counts[s.exerciseId] || 0) + 1; });
    const exList = app.exercises.filter((e) => counts[e.id] || !e.archived).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || (a.sort || 0) - (b.sort || 0));
    const exId = args[0] && app.exercise(args[0]) ? args[0] : (exList[0] && exList[0].id);
    const ex = app.exercise(exId);

    /* one filter row above everything */
    const filters = h('div.filters',
      h('div.seg', RANGES.map((r) => h('button' + (state.range === r.id ? '.on' : ''), { onclick: () => { state.range = r.id; app.render(); } }, r.label))));
    container.appendChild(filters);

    const today = u.today();
    const lastWeek = u.weekStart(today);
    const rng = RANGES.find((r) => r.id === state.range);
    const firstDate = allSets.length ? allSets[0].date : today;
    const firstWeek = rng.weeks ? u.addDays(lastWeek, -7 * (rng.weeks - 1)) : u.weekStart(firstDate);
    const weeks = [];
    for (let w = firstWeek; w <= lastWeek; w = u.addDays(w, 7)) weeks.push(w);

    if (!ex) { container.appendChild(h('div.empty', 'No exercises yet.')); return; }

    container.appendChild(h('div.ex-pills', exList.map((e) => h('a.pill' + (e.id === exId ? '.on' : ''), { href: '#progress/' + e.id }, e.name, counts[e.id] ? h('em', String(counts[e.id])) : null))));

    const mine = allSets.filter((s) => s.exerciseId === exId);
    const stats = C.statsFor(ex);
    const statKey = state.stat[exId] || C.headline(ex).key;
    const stat = stats.find((s) => s.key === statKey) || stats[0];

    const byWeek = {};
    mine.forEach((s) => { const w = u.weekStart(s.date); (byWeek[w] = byWeek[w] || []).push(s); });
    const pts = weeks.map((w) => ({ x: w, v: byWeek[w] ? stat.calc(byWeek[w]) : null, label: 'Week of ' + u.fmtDate(w, { year: true }) }));

    /* headline tiles */
    const tiles = h('div.tiles');
    const last = mine[mine.length - 1];
    tiles.appendChild(tile(last ? u.fmtDate(last.date, { year: true }) : '—', 'Last done'));
    tiles.appendChild(tile(u.fmtNum(mine.length), 'Sets all time'));
    if ((ex.fields || []).includes('weight')) {
      const top = mine.reduce((a, s) => Math.max(a, s.weight || 0), 0);
      tiles.appendChild(tile(top ? u.fmtNum(top) + ' lb' : '—', 'Heaviest'));
    }
    const bestWeek = Object.keys(byWeek).reduce((best, w) => { const v = stat.calc(byWeek[w]); return v > (best ? best.v : -1) ? { w, v } : best; }, null);
    tiles.appendChild(tile(bestWeek ? u.fmtNum(bestWeek.v) + (stat.unit ? ' ' + stat.unit : '') : '—', 'Best week · ' + stat.label.toLowerCase()));

    const card = h('section.card',
      h('div.card-head', h('h2', ex.name), h('div.seg.small', stats.map((s) => h('button' + (s.key === stat.key ? '.on' : ''), { onclick: () => { state.stat[exId] = s.key; app.render(); } }, s.label)))),
      h('p.card-sub', stat.label + ' per week'),
      mine.length ? WL.chart.bars(pts, { title: ex.name + ' ' + stat.label.toLowerCase(), unit: stat.unit, xLabel: 'Week' }) : h('div.empty.small', 'Nothing logged for ' + ex.name + ' yet.'));
    container.append(tiles, card);

    /* daily trackers: averages as a line of daily values, totals as weekly bars */
    app.activeMetrics().forEach((m) => {
      let chart;
      if (m.agg === 'avg') {
        const pts2 = Object.keys(daily).filter((d) => d >= firstWeek && daily[d][m.id] != null).sort().map((d) => ({ x: d, v: daily[d][m.id], label: u.fmtDate(d, { weekday: true }) + ', ' + u.parse(d).getFullYear() }));
        chart = pts2.length ? WL.chart.line(pts2, { title: m.name, unit: m.unit }) : h('div.empty.small', 'No ' + m.name.toLowerCase() + ' entries in this range.');
      } else {
        const wk = {};
        Object.keys(daily).forEach((d) => { const v = daily[d][m.id]; if (v != null) { const w = u.weekStart(d); wk[w] = (wk[w] || 0) + v; } });
        const pts3 = weeks.map((w) => ({ x: w, v: wk[w] != null ? wk[w] : null, label: 'Week of ' + u.fmtDate(w, { year: true }) }));
        chart = pts3.some((p) => p.v) ? WL.chart.bars(pts3, { title: m.name, unit: m.unit, xLabel: 'Week' }) : h('div.empty.small', 'No ' + m.name.toLowerCase() + ' entries in this range.');
      }
      container.appendChild(h('section.card', h('div.card-head', h('h2', m.name)), h('p.card-sub', m.agg === 'avg' ? 'Daily entries' : 'Total per week'), chart));
    });
  }

  function tile(v, label) { return h('div.tile', h('b', v), h('span', label)); }

  return { render };
})();
