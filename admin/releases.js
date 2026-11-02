/* bellhive99.com - ADMIN > Release Notes
 * Same page as HHB Project Exchange's Release Notes: every version, newest first, grouped
 * by month (newest month open, click a month to open or close it).
 *
 * Rows live in the release_notes table (supabase/release-notes.sql). Adding a release is
 * a single INSERT there; this file never needs to change. Order and the date shown both
 * come from each row's own ver (YYMMDD.NN), not created_at. */
(function () {
  const { el } = BH.ui;
  const mc = document.getElementById('mc');
  const open = new Set();   // month labels currently expanded
  let entries = [];

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); return; }
    if (!BH.isAdmin()) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'Access restricted - admins only.')); return; }

    const { data, error } = await BH.sb.from('release_notes').select('ver, items, created_at');
    if (error) {
      const missing = /release_notes/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message);
      mc.replaceChildren(el('div', { class: 'bh-alert' }, missing
        ? 'The release notes table has not been created yet - run supabase/release-notes.sql in the Supabase SQL Editor.'
        : 'Could not load release notes: ' + error.message));
      return;
    }

    entries = (data || []).slice().sort((a, b) => {
      const c = BH.compareVer(a.ver, b.ver);
      return c || (new Date(b.created_at) - new Date(a.created_at));
    }).map((row, i) => {
      const p = BH.parseVer(row.ver);
      const d = p ? p.date : new Date(row.created_at);
      return {
        ver: row.ver,
        current: i === 0,
        date: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        month: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        items: Array.isArray(row.items) ? row.items : [],
      };
    });
    if (!entries.length) { mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, 'No release notes yet.')); return; }

    open.add(entries[0].month);
    render();
  }

  function groups() {
    const out = [];
    entries.forEach((e) => {
      let g = out[out.length - 1];
      if (!g || g.label !== e.month) { g = { label: e.month, entries: [] }; out.push(g); }
      g.entries.push(e);
    });
    return out;
  }

  function entryEl(e) {
    return el('div', { class: 'rn-entry' },
      el('div', { class: 'rn-entry-head' },
        el('span', { class: 'rn-ver' }, e.ver),
        el('span', { class: 'rn-date' }, e.date),
        e.current ? el('span', { class: 'bh-badge on' }, 'Current') : null),
      el('ul', { class: 'rn-items' }, e.items.map((t) => el('li', null, String(t)))));
  }

  function render() {
    const gs = groups();
    const card = el('div', { class: 'bh-card rn-card' },
      el('div', { class: 'rn-top' },
        el('div', null,
          el('div', { class: 'rn-title' }, 'bellhive99 - Release Notes'),
          el('div', { class: 'rn-sub' }, entries.length + ' version' + (entries.length !== 1 ? 's' : '') + ' across ' + gs.length + ' month' + (gs.length !== 1 ? 's' : '') + ' - click a month to expand it')),
        el('span', { class: 'rn-mono' }, 'Current: ' + entries[0].ver)),
      gs.map((g) => {
        const isOpen = open.has(g.label);
        return el('div', { class: 'rn-month' + (isOpen ? ' open' : '') },
          el('button', { class: 'rn-month-head', type: 'button', 'aria-expanded': String(isOpen), onclick: () => { if (isOpen) open.delete(g.label); else open.add(g.label); render(); } },
            el('span', { class: 'rn-month-label' }, el('span', { class: 'rn-car', 'aria-hidden': 'true' }, isOpen ? '▴' : '▾'), g.label),
            el('span', { class: 'rn-count' }, g.entries.length + ' update' + (g.entries.length !== 1 ? 's' : ''))),
          isOpen ? el('div', { class: 'rn-month-body' }, g.entries.map(entryEl)) : null);
      }));
    mc.replaceChildren(card);
  }

  start();
})();
