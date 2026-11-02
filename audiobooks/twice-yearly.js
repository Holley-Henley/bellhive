/* ============================================================
 * Chrisware / bellhive99.com - audiobooks/twice-yearly.js
 * AUDIOBOOKS > Twice Yearly: the books re-listened twice a year.
 * Replaces the BOOKS - BI-ANNUAL sheet of Twice-Yearly_Book_Listening.xlsm.
 *
 * Data (supabase/audiobooks.sql):
 *   audiobook_rotation  one row per book on the list (author, series, #, title, year, length)
 *   audiobook_listens   start / finish per book per pass   (period '2026-1' = 1st pass of 2026)
 *   audiobooks          the Library row a list entry is linked to (cover, narrators, summary)
 * Each person keeps their own list: this page shows the rows owned by whoever is signed in.
 * ============================================================ */
(function () {
  const { el, toast, modal } = BH.ui;
  const S = { user: null, rows: [], period: null, periods: [], books: null, filter: 'all' };
  const root = document.getElementById('ty');
  const acts = document.getElementById('ty-acts');

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
  const fmtDateY = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const hm = (s) => { if (s == null) return '—'; const m = Math.round(s / 60); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; };
  const hrs = (s) => (s / 3600).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const periodLabel = (p) => { const [y, n] = p.split('-'); return y + ' · ' + (n === '1' ? '1st' : '2nd') + ' pass'; };
  const nextPeriod = (p) => { const [y, n] = p.split('-').map(Number); return n === 1 ? y + '-2' : (y + 1) + '-1'; };
  const ico = (name) => el('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  const listen = (r, p) => (r.listens || []).find((l) => l.period === (p || S.period)) || null;
  const status = (r) => { const l = listen(r); return !l || !l.start_date ? 'todo' : l.finish_date ? 'done' : 'now'; };
  const shortTitle = (t) => String(t || '').split(' - ')[0].replace(/\s*\[.*?\]\s*/g, ' ').trim();

  function fail(e) { console.error(e); toast(e.message || String(e), 'error'); }

  /* ---------- data ---------- */
  async function load() {
    const { data, error } = await BH.sb.from('audiobook_rotation')
      .select('*, book:audiobooks(id, asin, title, narrators, cover_url, duration_seconds, summary, read_status), listens:audiobook_listens(*)')
      .eq('owner_id', S.user.id).eq('active', true).order('sort_order').order('created_at');
    if (error) throw error;
    S.rows = data || [];
    const seen = new Set();
    S.rows.forEach((r) => (r.listens || []).forEach((l) => seen.add(l.period)));
    let list = Array.from(seen).sort();
    if (!list.length) { const d = new Date(); list = [d.getFullYear() + '-' + (d.getMonth() < 6 ? 1 : 2)]; }
    list.push(nextPeriod(list[list.length - 1]));
    S.periods = list;
    if (!S.period || !S.periods.includes(S.period)) S.period = defaultPeriod();
  }
  /* The pass with the most recent activity (latest start or finish date). */
  function defaultPeriod() {
    let best = null, bestDate = '';
    S.rows.forEach((r) => (r.listens || []).forEach((l) => {
      const d = [l.start_date, l.finish_date].filter(Boolean).sort().pop() || '';
      if (d > bestDate || (d === bestDate && best && l.period < best)) { bestDate = d; best = l.period; }
    }));
    return best || S.periods[0];
  }
  async function saveListen(r, patch) {
    const cur = listen(r) || {};
    const row = { rotation_id: r.id, period: S.period, start_date: cur.start_date || null, finish_date: cur.finish_date || null, ...patch };
    if (!row.start_date && !row.finish_date) {
      if (cur.id) { const { error } = await BH.sb.from('audiobook_listens').delete().eq('id', cur.id); if (error) throw error; }
    } else {
      const { error } = await BH.sb.from('audiobook_listens').upsert(row, { onConflict: 'rotation_id,period' });
      if (error) throw error;
    }
  }
  async function refresh() { try { await load(); render(); } catch (e) { fail(e); } }

  /* ---------- stats for the selected pass ---------- */
  function stats() {
    const total = S.rows.length;
    const totalSec = S.rows.reduce((a, r) => a + (r.length_seconds || 0), 0);
    const done = S.rows.filter((r) => status(r) === 'done');
    const now = S.rows.filter((r) => status(r) === 'now');
    const doneSec = done.reduce((a, r) => a + (r.length_seconds || 0), 0);
    const starts = S.rows.map((r) => (listen(r) || {}).start_date).filter(Boolean).sort();
    const finishes = done.map((r) => listen(r).finish_date).filter(Boolean).sort();
    const began = starts[0] || null;
    const lastFinish = finishes[finishes.length - 1] || null;
    let pace = null, eta = null;
    if (began && doneSec > 0) {
      const days = Math.max(1, daysBetween(began, today()) + 1);
      pace = doneSec / days; // seconds of book per calendar day
      const left = totalSec - doneSec;
      eta = left > 0 ? addDays(today(), Math.ceil(left / pace)) : lastFinish;
    }
    /* up next: the first not-started book after the one started most recently (wrapping round) */
    let lastIdx = -1, lastStart = '';
    S.rows.forEach((r, i) => { const s0 = (listen(r) || {}).start_date || ''; if (s0 && s0 >= lastStart) { lastStart = s0; lastIdx = i; } });
    const order = S.rows.slice(lastIdx + 1).concat(S.rows.slice(0, lastIdx + 1));
    const next = order.find((r) => status(r) === 'todo');
    return { total, totalSec, done: done.length, doneSec, now, began, lastFinish, pace, eta, next };
  }

  /* ---------- render ---------- */
  function render() {
    acts.innerHTML = '';
    const sel = el('select', { class: 'ty-select', 'aria-label': 'Pass', onchange: (e) => { S.period = e.target.value; render(); } },
      S.periods.map((p) => el('option', { value: p, selected: p === S.period }, periodLabel(p) + (p === S.periods[S.periods.length - 1] && !S.rows.some((r) => listen(r, p)) ? ' (new)' : ''))));
    acts.append(sel, el('button', { class: 'bh-btn primary', type: 'button', onclick: addBook }, ico('plus'), 'Add Book'));

    root.innerHTML = '';
    if (!S.rows.length) {
      root.append(el('div', { class: 'bh-card' }, el('div', { class: 'bh-empty' }, 'Your twice-yearly list is empty. Use Add Book to start it.')));
      return;
    }
    const st = stats();
    const pct = st.totalSec ? Math.round((st.doneSec / st.totalSec) * 100) : 0;

    /* summary tiles */
    root.append(el('div', { class: 'ty-tiles' },
      tile('Books finished', st.done + ' of ' + st.total, st.total - st.done ? (st.total - st.done) + ' to go' : 'Pass complete'),
      tile('Hours finished', hrs(st.doneSec) + ' of ' + hrs(st.totalSec), pct + '% of listening time'),
      tile('Pace', st.pace ? (st.pace / 3600).toFixed(1) + ' h/day' : '—', st.began ? 'since ' + fmtDateY(st.began) : 'not started'),
      tile(st.doneSec >= st.totalSec ? 'Finished' : 'Projected finish', st.eta ? fmtDateY(st.eta) : '—', st.eta && st.doneSec < st.totalSec ? 'at the current pace' : '')));
    root.append(el('div', { class: 'ty-bar', title: pct + '% of listening time finished' }, el('span', { style: 'width:' + pct + '%' })));

    /* now listening / up next */
    const spot = st.now.length ? st.now : st.next ? [st.next] : [];
    if (spot.length) {
      root.append(el('div', { class: 'ty-spot' },
        el('div', { class: 'ty-spot-label' }, st.now.length ? 'Now listening' : 'Up next'),
        el('div', { class: 'ty-spot-list' }, spot.map((r) => el('div', { class: 'ty-spot-item' },
          cover(r, 'lg'),
          el('div', { class: 'ty-spot-text' },
            el('div', { class: 'ty-spot-title' }, r.title),
            el('div', { class: 'ty-sub' }, r.author + (r.series && r.series !== 'Standalone' ? ' · ' + r.series + (r.series_num ? ' #' + r.series_num : '') : '')),
            el('div', { class: 'ty-sub' }, hm(r.length_seconds) + (listen(r) && listen(r).start_date ? ' · started ' + fmtDate(listen(r).start_date) : '')),
            el('div', { class: 'ty-spot-acts' }, status(r) === 'now'
              ? el('button', { class: 'bh-btn sm primary', type: 'button', onclick: () => quick(r, 'finish') }, ico('check'), 'Finished today')
              : el('button', { class: 'bh-btn sm primary', type: 'button', onclick: () => quick(r, 'start') }, ico('player-play'), 'Start today'))))))));
    }

    /* filter chips */
    const counts = { all: S.rows.length, todo: 0, now: 0, done: 0 };
    S.rows.forEach((r) => counts[status(r)]++);
    const chip = (k, label) => el('button', { class: 'ty-chip' + (S.filter === k ? ' on' : ''), type: 'button', onclick: () => { S.filter = k; render(); } }, label + ' ', el('b', null, String(counts[k])));
    root.append(el('div', { class: 'ty-chips' }, chip('all', 'All'), chip('now', 'Listening'), chip('todo', 'Not started'), chip('done', 'Done')));

    /* the list, grouped by author like the workbook */
    const card = el('div', { class: 'bh-card ty-list' });
    card.append(el('div', { class: 'ty-row head' }, el('span'), el('span', null, 'Title'), el('span', { class: 'r' }, 'Length'), el('span', null, 'Start'), el('span', null, 'Finish'), el('span')));
    let author = null, shown = 0;
    S.rows.forEach((r, i) => {
      if (S.filter !== 'all' && status(r) !== S.filter) return;
      if (r.author !== author) { author = r.author; card.append(el('div', { class: 'ty-group' }, author)); }
      card.append(row(r, i));
      shown++;
    });
    if (!shown) card.append(el('div', { class: 'bh-empty' }, 'Nothing here for this pass.'));
    root.append(card);
  }

  function tile(label, value, sub) {
    return el('div', { class: 'ty-tile' }, el('div', { class: 'ty-tile-label' }, label), el('div', { class: 'ty-tile-val' }, value), el('div', { class: 'ty-tile-sub' }, sub || ' '));
  }
  function cover(r, size) {
    const url = r.book && r.book.cover_url;
    return url ? el('img', { class: 'ty-cover ' + (size || ''), src: url, alt: '', loading: 'lazy' })
      : el('div', { class: 'ty-cover none ' + (size || '') }, ico('headphones'));
  }

  function row(r, i) {
    const l = listen(r) || {};
    const s = status(r);
    const series = r.series && r.series !== 'Standalone' ? r.series + (r.series_num != null ? ' #' + r.series_num : '') : 'Standalone';
    const dateCell = (field) => {
      const v = l[field];
      const input = el('input', { type: 'date', class: 'ty-date' + (v ? '' : ' empty'), value: v || '', title: field === 'start_date' ? 'Start date' : 'Finish date',
        onchange: async (e) => {
          const val = e.target.value || null;
          const patch = { [field]: val };
          if (field === 'finish_date' && val && !l.start_date) patch.start_date = val;
          if (field === 'start_date' && !val) patch.finish_date = null;
          const next = { ...l, ...patch };
          if (next.start_date && next.finish_date && next.finish_date < next.start_date) { toast('Finish is before start', 'error'); e.target.value = v || ''; return; }
          try { await saveListen(r, patch); await refresh(); } catch (err) { fail(err); }
        } });
      return input;
    };
    let action;
    if (s === 'todo') action = el('button', { class: 'bh-ib', type: 'button', title: 'Start today', onclick: () => quick(r, 'start') }, ico('player-play'));
    else if (s === 'now') action = el('button', { class: 'bh-ib go', type: 'button', title: 'Finished today', onclick: () => quick(r, 'finish') }, ico('check'));
    else action = el('span', { class: 'bh-ib ok', title: 'Done' }, ico('circle-check'));
    return el('div', { class: 'ty-row s-' + s },
      cover(r),
      el('div', { class: 'ty-title' },
        el('div', { class: 'ty-name' }, el('span', { class: 'ty-dot', title: { todo: 'Not started', now: 'Listening', done: 'Done' }[s] }), r.title,
          r.pub_year ? el('span', { class: 'ty-year' }, String(r.pub_year)) : null),
        el('div', { class: 'ty-sub' }, series)),
      el('span', { class: 'r ty-len' }, hm(r.length_seconds)),
      dateCell('start_date'),
      dateCell('finish_date'),
      el('div', { class: 'ty-acts' }, action,
        el('button', { class: 'bh-ib', type: 'button', title: 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, ico('chevron-up')),
        el('button', { class: 'bh-ib', type: 'button', title: 'Move down', disabled: i === S.rows.length - 1, onclick: () => move(i, 1) }, ico('chevron-down')),
        el('button', { class: 'bh-ib', type: 'button', title: 'Details', onclick: () => editBook(r) }, ico('pencil'))));
  }

  /* ---------- actions ---------- */
  async function quick(r, what) {
    const t = today();
    try {
      if (what === 'start') await saveListen(r, { start_date: t, finish_date: null });
      else await saveListen(r, { finish_date: t, start_date: (listen(r) || {}).start_date || t });
      toast(what === 'start' ? 'Started ' + r.title : 'Finished ' + r.title, 'ok');
      await refresh();
    } catch (e) { fail(e); }
  }

  async function move(i, dir) {
    const a = S.rows[i], b = S.rows[i + dir];
    if (!a || !b) return;
    let ao = a.sort_order, bo = b.sort_order;
    if (ao === bo) { ao = i * 10; bo = (i + dir) * 10; }
    try {
      const r1 = await BH.sb.from('audiobook_rotation').update({ sort_order: bo }).eq('id', a.id);
      if (r1.error) throw r1.error;
      const r2 = await BH.sb.from('audiobook_rotation').update({ sort_order: ao }).eq('id', b.id);
      if (r2.error) throw r2.error;
      await refresh();
    } catch (e) { fail(e); }
  }

  /* Library rows for the picker (loaded once). */
  async function libraryBooks() {
    if (S.books) return S.books;
    const { data, error } = await BH.sb.from('audiobooks')
      .select('id, title, authors, series_name, series_seq, duration_seconds, cover_url, release_date')
      .eq('owner_id', S.user.id).order('authors').order('series_name').order('title');
    if (error) throw error;
    S.books = data || [];
    return S.books;
  }

  function field(label, input, cls) { return el('label', { class: 'bh-field' + (cls ? ' ' + cls : '') }, el('span', null, label), input); }
  const hmsToSec = (v) => { const p = String(v || '').trim().split(':').map(Number); if (!p.length || p.some(isNaN) || !String(v).trim()) return null; while (p.length < 3) p.push(0); return p[0] * 3600 + p[1] * 60 + p[2]; };
  const secToHms = (s) => (s == null ? '' : Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60));

  /* Add a book: pick one from the Library (fills everything in) or type it in. */
  async function addBook() {
    let books;
    try { books = await libraryBooks(); } catch (e) { return fail(e); }
    const onList = new Set(S.rows.map((r) => r.audiobook_id).filter(Boolean));
    const f = {
      search: el('input', { type: 'search', placeholder: 'Search your Library by title or author…' }),
      author: el('input', { type: 'text' }), series: el('input', { type: 'text', placeholder: 'Standalone' }),
      num: el('input', { type: 'number', step: 'any', min: '0' }), title: el('input', { type: 'text' }),
      year: el('input', { type: 'number', min: '1800', max: '2100' }), len: el('input', { type: 'text', placeholder: 'h:mm:ss' }),
    };
    let picked = null;
    const results = el('div', { class: 'ty-pick' });
    const err = el('div', { class: 'bh-err' });
    function showResults() {
      const q = f.search.value.trim().toLowerCase();
      results.innerHTML = '';
      if (!q) return;
      const hits = books.filter((b) => (b.title + ' ' + (b.authors || '') + ' ' + (b.series_name || '')).toLowerCase().includes(q)).slice(0, 8);
      if (!hits.length) { results.append(el('div', { class: 'ty-pick-none' }, 'No match in your Library. Fill in the fields below instead.')); return; }
      hits.forEach((b) => results.append(el('button', { type: 'button', class: 'ty-pick-item' + (onList.has(b.id) ? ' on' : ''), onclick: () => choose(b) },
        b.cover_url ? el('img', { src: b.cover_url, alt: '' }) : el('span', { class: 'ty-cover none sm' }, ico('headphones')),
        el('span', null, el('b', null, shortTitle(b.title)), el('small', null, (b.authors || '') + (onList.has(b.id) ? ' · already on your list' : ''))))));
    }
    function choose(b) {
      picked = b;
      f.author.value = (b.authors || '').split(',')[0].trim();
      f.series.value = b.series_name || '';
      f.num.value = b.series_seq && !isNaN(Number(b.series_seq)) ? Number(b.series_seq) : '';
      f.title.value = shortTitle(b.title);
      f.len.value = secToHms(b.duration_seconds);
      results.innerHTML = '';
      f.search.value = shortTitle(b.title);
    }
    f.search.addEventListener('input', () => { picked = null; showResults(); });
    modal({
      title: 'Add Book to Twice Yearly', wide: true,
      body: [field('From your Library', f.search), results,
        el('div', { class: 'bh-grid2' }, field('Author', f.author), field('Series', f.series)),
        el('div', { class: 'bh-grid2' }, field('Title', f.title), el('div', { class: 'ty-3' }, field('#', f.num), field('Year', f.year), field('Length', f.len))),
        err],
      buttons: [{ label: 'Cancel' }, { label: 'Add Book', primary: true, onClick: async (close) => {
        err.textContent = '';
        const author = f.author.value.trim(), title = f.title.value.trim();
        if (!author || !title) { err.textContent = 'Author and title are required.'; return; }
        const len = f.len.value.trim() ? hmsToSec(f.len.value) : null;
        if (f.len.value.trim() && len == null) { err.textContent = 'Length should look like 10:25:00.'; return; }
        /* goes after the last book by the same author, else at the end */
        const same = S.rows.filter((r) => r.author.toLowerCase() === author.toLowerCase());
        const after = same.length ? same[same.length - 1] : S.rows[S.rows.length - 1];
        const idx = after ? S.rows.indexOf(after) : -1;
        const nextRow = S.rows[idx + 1];
        const order = after ? after.sort_order + 5 : 10;
        const ins = { author, title, series: f.series.value.trim() || 'Standalone', series_num: f.num.value === '' ? null : Number(f.num.value),
          pub_year: f.year.value ? Number(f.year.value) : null, length_seconds: len, audiobook_id: picked ? picked.id : null, sort_order: order };
        try {
          if (nextRow && nextRow.sort_order <= order) await renumber(idx + 1, 10); // no gap left: push the rest down
          const { error } = await BH.sb.from('audiobook_rotation').insert(ins);
          if (error) throw error;
          close(); toast('Added ' + title, 'ok'); await refresh();
        } catch (e) { err.textContent = e.message; }
      } }],
    });
  }
  /* Shift every row from index i down by `by` (rarely needed: only when two rows have adjacent orders). */
  async function renumber(i, by) {
    for (let k = S.rows.length - 1; k >= i; k--) {
      const r = S.rows[k];
      const { error } = await BH.sb.from('audiobook_rotation').update({ sort_order: r.sort_order + by }).eq('id', r.id);
      if (error) throw error;
      r.sort_order += by;
    }
  }

  /* Details: edit the entry, see the Library info, remove it from the list. */
  function editBook(r) {
    const f = {
      author: el('input', { type: 'text', value: r.author || '' }), series: el('input', { type: 'text', value: r.series || '' }),
      num: el('input', { type: 'number', step: 'any', min: '0', value: r.series_num == null ? '' : r.series_num }),
      title: el('input', { type: 'text', value: r.title || '' }),
      year: el('input', { type: 'number', min: '1800', max: '2100', value: r.pub_year || '' }),
      len: el('input', { type: 'text', value: secToHms(r.length_seconds), placeholder: 'h:mm:ss' }),
      notes: el('textarea', { rows: 2, class: 'ty-notes' }),
    };
    f.notes.value = r.notes || '';
    const err = el('div', { class: 'bh-err' });
    const b = r.book;
    const history = (r.listens || []).slice().sort((x, y) => (x.period < y.period ? 1 : -1));
    const info = b ? el('div', { class: 'ty-info' }, b.cover_url ? el('img', { src: b.cover_url, alt: '' }) : null,
      el('div', null,
        el('div', { class: 'ty-info-title' }, b.title),
        b.narrators ? el('div', { class: 'ty-sub' }, 'Narrated by ' + b.narrators) : null,
        b.summary ? el('p', { class: 'ty-summary' }, b.summary.length > 420 ? b.summary.slice(0, 420).replace(/\s+\S*$/, '') + '…' : b.summary) : null,
        b.asin ? el('a', { class: 'bh-link', href: 'https://www.audible.com/pd/' + b.asin, target: '_blank', rel: 'noopener' }, 'Open in Audible ', ico('external-link')) : null))
      : el('div', { class: 'bh-info' }, 'Not linked to a book in your Library.');
    const hist = history.length ? el('div', { class: 'bh-section' }, el('div', { class: 'bh-section-title' }, 'History'),
      history.map((l) => el('div', { class: 'ty-hist' }, el('b', null, periodLabel(l.period)),
        el('span', null, (l.start_date ? fmtDateY(l.start_date) : '—') + ' → ' + (l.finish_date ? fmtDateY(l.finish_date) : 'not finished'))))) : null;
    modal({
      title: 'Book Details', wide: true,
      body: [info,
        el('div', { class: 'bh-grid2 ty-gap' }, field('Author', f.author), field('Series', f.series)),
        el('div', { class: 'bh-grid2' }, field('Title', f.title), el('div', { class: 'ty-3' }, field('#', f.num), field('Year', f.year), field('Length', f.len))),
        field('Notes', f.notes), hist, err],
      buttons: [
        { label: 'Remove from List', danger: true, onClick: (close) => removeBook(r, close) },
        { label: 'Cancel' },
        { label: 'Save', primary: true, onClick: async (close) => {
          err.textContent = '';
          const author = f.author.value.trim(), title = f.title.value.trim();
          if (!author || !title) { err.textContent = 'Author and title are required.'; return; }
          const len = f.len.value.trim() ? hmsToSec(f.len.value) : null;
          if (f.len.value.trim() && len == null) { err.textContent = 'Length should look like 10:25:00.'; return; }
          const { error } = await BH.sb.from('audiobook_rotation').update({ author, title, series: f.series.value.trim() || 'Standalone',
            series_num: f.num.value === '' ? null : Number(f.num.value), pub_year: f.year.value ? Number(f.year.value) : null,
            length_seconds: len, notes: f.notes.value.trim() || null }).eq('id', r.id);
          if (error) { err.textContent = error.message; return; }
          close(); toast('Saved', 'ok'); await refresh();
        } }],
    });
  }
  function removeBook(r, closeParent) {
    modal({
      title: 'Remove Book?',
      body: el('p', { class: 'bh-note' }, 'Take “' + r.title + '” off your twice-yearly list? Its listening history is kept and it stays in your Library.'),
      buttons: [{ label: 'Cancel' }, { label: 'Remove', primary: true, onClick: async (close) => {
        const { error } = await BH.sb.from('audiobook_rotation').update({ active: false }).eq('id', r.id);
        if (error) return fail(error);
        close(); closeParent(); toast('Removed ' + r.title, 'ok'); await refresh();
      } }],
    });
  }

  /* ---------- boot ---------- */
  (async function () {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
      S.user = user;
      if (BH.track) BH.track('audiobooks-twice-yearly');
      await load();
      render();
    } catch (e) {
      root.innerHTML = '';
      root.append(el('div', { class: 'bh-alert' }, e.message || String(e)));
    }
  })();
})();
