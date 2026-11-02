/* ============================================================
 * Chrisware / bellhive99.com - audiobooks/library.js
 * AUDIOBOOKS > Library: the complete audiobook collection.
 * Replaces the Books sheet (and the one-book-per-sheet tabs) of Twice-Yearly_Book_Listening.xlsm.
 *
 * Data (supabase/audiobooks.sql):
 *   audiobooks          one row per book (Audible export: title, authors, narrators, series, cover...)
 *   audiobook_rotation  read here only to badge books that are on the Twice Yearly list,
 *                       and written when a book is added to that list from here
 * Each person keeps their own library: this page shows the rows owned by whoever is signed in.
 * ============================================================ */
(function () {
  const { el, toast, modal } = BH.ui;
  const LIST_COLS = 'id, audible_key, asin, title, authors, narrators, series_name, series_seq, genre, publisher, release_date, purchase_date, duration_seconds, rating, rating_count, cover_url, m4b_file, mp3_file, read_status, notes';
  const STATUS = [
    { id: 'Unread', label: 'Unread', icon: 'book-2' },
    { id: 'Reading', label: 'Listening', icon: 'headphones' },
    { id: 'Finished', label: 'Finished', icon: 'circle-check' },
  ];
  const SORTS = {
    author: { label: 'Author', fn: (a, b) => cmp(surname(a.authors), surname(b.authors)) || cmp(a.authors, b.authors) || cmp(a.series_name, b.series_name) || num(a.series_seq) - num(b.series_seq) || cmp(a.title, b.title) },
    title: { label: 'Title', fn: (a, b) => cmp(short(a.title), short(b.title)) },
    purchased: { label: 'Recently purchased', fn: (a, b) => cmp(b.purchase_date, a.purchase_date) },
    released: { label: 'Release date', fn: (a, b) => cmp(b.release_date, a.release_date) },
    length: { label: 'Longest', fn: (a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0) },
    rating: { label: 'Audible rating', fn: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.rating_count || 0) - (a.rating_count || 0) },
  };
  const S = { user: null, books: [], rotation: [], q: '', status: 'all', genre: '', sort: 'author', view: 'grid', limit: 120 };
  const root = document.getElementById('lb');
  const acts = document.getElementById('lb-acts');
  try { const p = JSON.parse(localStorage.getItem('bh-ab-library') || '{}'); if (SORTS[p.sort]) S.sort = p.sort; if (p.view === 'list' || p.view === 'grid') S.view = p.view; } catch (e) { /* ignore */ }
  const remember = () => { try { localStorage.setItem('bh-ab-library', JSON.stringify({ sort: S.sort, view: S.view })); } catch (e) { /* ignore */ } };

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const cmp = (a, b) => String(a || '￿').localeCompare(String(b || '￿'), 'en', { sensitivity: 'base', numeric: true });
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 9999 : n; };
  /* "Dan Simmons, Someone Else" -> "Simmons Dan" so Author sorts by last name */
  const surname = (a) => { const n = String(a || '').split(',')[0].replace(/\s+-\s+.*$/, '').trim().split(/\s+/); return n.length > 1 ? n[n.length - 1] + ' ' + n.slice(0, -1).join(' ') : n[0]; };
  const short = (t) => String(t || '').split(' - ')[0].replace(/\s*\[.*?\]\s*/g, ' ').trim();
  const hm = (s) => { if (s == null) return '—'; const m = Math.round(s / 60); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; };
  const hrs = (s) => Math.round(s / 3600).toLocaleString('en-US');
  const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const genreTop = (g) => (g ? String(g).split(':')[0] : '');
  const ico = (name) => el('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  const statusOf = (b) => STATUS.find((s) => s.id === b.read_status) || null;
  const onList = (b) => S.rotation.some((r) => r.audiobook_id === b.id && r.active);
  function fail(e) { console.error(e); toast(e.message || String(e), 'error'); }

  /* ---------- data ---------- */
  async function load() {
    const [books, rot] = await Promise.all([
      BH.sb.from('audiobooks').select(LIST_COLS).eq('owner_id', S.user.id).order('authors'),
      BH.sb.from('audiobook_rotation').select('id, audiobook_id, author, sort_order, active').eq('owner_id', S.user.id).order('sort_order'),
    ]);
    if (books.error) throw books.error;
    if (rot.error) throw rot.error;
    S.books = books.data || [];
    S.rotation = rot.data || [];
  }

  function filtered() {
    const words = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.books.filter((b) => {
      if (S.status === 'twice') { if (!onList(b)) return false; }
      else if (S.status === 'none') { if (b.read_status) return false; }
      else if (S.status !== 'all' && b.read_status !== S.status) return false;
      if (S.genre && genreTop(b.genre) !== S.genre) return false;
      if (words.length) {
        const hay = [b.title, b.authors, b.narrators, b.series_name, b.genre, b.publisher].join(' ').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    }).sort(SORTS[S.sort].fn);
  }

  /* ---------- render ---------- */
  function renderHead() {
    acts.innerHTML = '';
    const search = el('input', { type: 'search', class: 'lb-search', placeholder: 'Search title, author, narrator, series…', value: S.q });
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.q = search.value; S.limit = 120; renderBody(); }, 150); });
    const sort = el('select', { class: 'ty-select', 'aria-label': 'Sort', onchange: (e) => { S.sort = e.target.value; remember(); renderBody(); } },
      Object.keys(SORTS).map((k) => el('option', { value: k, selected: k === S.sort }, 'Sort: ' + SORTS[k].label)));
    const view = el('div', { class: 'lb-toggle' },
      el('button', { type: 'button', class: S.view === 'grid' ? 'on' : '', title: 'Covers', onclick: () => { S.view = 'grid'; remember(); renderHead(); renderBody(); } }, ico('layout-grid')),
      el('button', { type: 'button', class: S.view === 'list' ? 'on' : '', title: 'List', onclick: () => { S.view = 'list'; remember(); renderHead(); renderBody(); } }, ico('list')));
    acts.append(search, sort, view);
  }

  function renderStats() {
    const box = document.getElementById('lb-stats');
    box.innerHTML = '';
    const all = S.books, sec = (arr) => arr.reduce((a, b) => a + (b.duration_seconds || 0), 0);
    const fin = all.filter((b) => b.read_status === 'Finished'), unread = all.filter((b) => b.read_status === 'Unread');
    const listening = all.filter((b) => b.read_status === 'Reading');
    box.append(el('div', { class: 'ty-tiles' },
      tile('Books', all.length.toLocaleString('en-US'), hrs(sec(all)) + ' hours of listening'),
      tile('Finished', fin.length + '', hrs(sec(fin)) + ' hours'),
      tile('Unread', unread.length + '', hrs(sec(unread)) + ' hours waiting'),
      tile('Listening', listening.length + '', listening.length ? short(listening[0].title) + (listening.length > 1 ? ' + ' + (listening.length - 1) + ' more' : '') : 'nothing right now')));
  }
  function tile(label, value, sub) {
    return el('div', { class: 'ty-tile' }, el('div', { class: 'ty-tile-label' }, label), el('div', { class: 'ty-tile-val' }, value), el('div', { class: 'ty-tile-sub' }, sub || ' '));
  }

  function renderBody() {
    const body = document.getElementById('lb-body');
    body.innerHTML = '';
    /* filter row: status chips + genre */
    const count = (fn) => S.books.filter(fn).length;
    const chip = (k, label, n) => el('button', { class: 'ty-chip' + (S.status === k ? ' on' : ''), type: 'button', onclick: () => { S.status = k; S.limit = 120; renderBody(); } }, label + ' ', el('b', null, String(n)));
    const genres = Array.from(new Set(S.books.map((b) => genreTop(b.genre)).filter(Boolean))).sort(cmp);
    const genre = el('select', { class: 'ty-select lb-genre', 'aria-label': 'Genre', onchange: (e) => { S.genre = e.target.value; S.limit = 120; renderBody(); } },
      el('option', { value: '' }, 'All genres'),
      genres.map((g) => el('option', { value: g, selected: g === S.genre }, g + ' (' + count((b) => genreTop(b.genre) === g) + ')')));
    body.append(el('div', { class: 'lb-filters' },
      el('div', { class: 'ty-chips' },
        chip('all', 'All', S.books.length), chip('Reading', 'Listening', count((b) => b.read_status === 'Reading')),
        chip('Unread', 'Unread', count((b) => b.read_status === 'Unread')), chip('Finished', 'Finished', count((b) => b.read_status === 'Finished')),
        chip('twice', 'On Twice Yearly', count(onList)),
        count((b) => !b.read_status) ? chip('none', 'No status', count((b) => !b.read_status)) : null),
      genre));

    const list = filtered();
    const totalSec = list.reduce((a, b) => a + (b.duration_seconds || 0), 0);
    body.append(el('div', { class: 'lb-count' }, list.length === S.books.length ? list.length + ' books' : list.length + ' of ' + S.books.length + ' books', ' · ', hrs(totalSec) + ' hours'));
    if (!list.length) { body.append(el('div', { class: 'bh-card' }, el('div', { class: 'bh-empty' }, S.books.length ? 'No books match.' : 'Your library is empty.'))); return; }

    const shown = list.slice(0, S.limit);
    if (S.view === 'grid') body.append(el('div', { class: 'lb-grid' }, shown.map(card)));
    else {
      const c = el('div', { class: 'bh-card' }, el('div', { class: 'lb-row head' }, el('span'), el('span', null, 'Title'), el('span', null, 'Narrator'), el('span', { class: 'r' }, 'Length'), el('span', null, 'Purchased'), el('span', null, 'Status')));
      shown.forEach((b) => c.append(listRow(b)));
      body.append(c);
    }
    if (list.length > S.limit) body.append(el('div', { class: 'lb-more' }, el('button', { class: 'bh-btn', type: 'button', onclick: () => { S.limit += 120; renderBody(); } }, 'Show more (' + (list.length - S.limit) + ' left)')));
  }

  function cover(b, cls) {
    return b.cover_url ? el('img', { class: cls, src: b.cover_url, alt: '', loading: 'lazy' }) : el('div', { class: cls + ' none' }, ico('headphones'));
  }
  function seriesText(b) { return b.series_name ? b.series_name + (b.series_seq ? ' #' + b.series_seq : '') : ''; }
  function statusBadge(b) {
    const s = statusOf(b);
    return s ? el('span', { class: 'lb-badge st-' + s.id.toLowerCase() }, ico(s.icon), s.label) : null;
  }
  function card(b) {
    return el('button', { type: 'button', class: 'lb-card', onclick: () => details(b), title: b.title },
      el('div', { class: 'lb-cover-wrap' }, cover(b, 'lb-cover'),
        onList(b) ? el('span', { class: 'lb-twice', title: 'On your Twice Yearly list' }, ico('repeat')) : null,
        statusBadge(b)),
      el('div', { class: 'lb-card-title' }, short(b.title)),
      el('div', { class: 'ty-sub' }, (b.authors || '').split(',')[0]),
      el('div', { class: 'ty-sub' }, [seriesText(b), hm(b.duration_seconds)].filter(Boolean).join(' · ')));
  }
  function listRow(b) {
    return el('div', { class: 'lb-row', role: 'button', tabindex: '0', onclick: () => details(b), onkeydown: (e) => { if (e.key === 'Enter') details(b); } },
      cover(b, 'ty-cover'),
      el('div', { class: 'ty-title' },
        el('div', { class: 'ty-name' }, short(b.title), onList(b) ? el('span', { class: 'lb-twice-sm', title: 'On your Twice Yearly list' }, ico('repeat')) : null),
        el('div', { class: 'ty-sub' }, [b.authors, seriesText(b)].filter(Boolean).join(' · '))),
      el('div', { class: 'ty-sub' }, b.narrators || ''),
      el('span', { class: 'r ty-len' }, hm(b.duration_seconds)),
      el('span', { class: 'ty-len' }, b.purchase_date ? fmtDate(b.purchase_date) : '—'),
      el('div', null, statusBadge(b)));
  }

  /* ---------- details ---------- */
  async function details(b) {
    const statusSel = el('select', { class: 'ty-select' },
      el('option', { value: '' }, 'No status'), STATUS.map((s) => el('option', { value: s.id, selected: b.read_status === s.id }, s.label)));
    const notes = el('textarea', { rows: 2, class: 'ty-notes', placeholder: 'Your notes…' });
    notes.value = b.notes || '';
    const summary = el('div', { class: 'lb-summary' }, el('span', { class: 'ty-sub' }, 'Loading summary…'));
    const err = el('div', { class: 'bh-err' });
    const kv = (k, v) => (v ? [el('dt', null, k), el('dd', null, v)] : []);
    const stars = b.rating ? el('span', { class: 'lb-stars', title: b.rating + ' average' }, '★'.repeat(Math.round(b.rating)) + '☆'.repeat(5 - Math.round(b.rating)), ' ', Number(b.rating).toFixed(1), b.rating_count ? el('small', null, ' (' + b.rating_count.toLocaleString('en-US') + ' ratings)') : null) : null;
    const twice = onList(b)
      ? el('a', { class: 'bh-btn sm', href: 'twice-yearly.html' }, ico('repeat'), 'On Twice Yearly')
      : el('button', { class: 'bh-btn sm', type: 'button', onclick: (e) => addToTwice(b, e.currentTarget) }, ico('plus'), 'Add to Twice Yearly');
    modal({
      title: 'Book Details', wide: true,
      body: [
        el('div', { class: 'lb-detail' }, cover(b, 'lb-detail-cover'),
          el('div', null,
            el('div', { class: 'ty-info-title' }, b.title),
            el('div', { class: 'lb-by' }, 'by ', el('b', null, b.authors || 'Unknown')),
            b.narrators ? el('div', { class: 'ty-sub lb-wrap' }, 'Narrated by ' + b.narrators) : null,
            stars,
            el('div', { class: 'lb-detail-acts' },
              b.asin ? el('a', { class: 'bh-btn sm', href: 'https://www.audible.com/pd/' + b.asin, target: '_blank', rel: 'noopener' }, ico('external-link'), 'Audible') : null,
              twice))),
        summary,
        el('dl', { class: 'bh-kv lb-kv' },
          kv('Series', seriesText(b)), kv('Length', b.duration_seconds != null ? hm(b.duration_seconds) : ''),
          kv('Genre', b.genre ? b.genre.split(':').join(' › ') : ''), kv('Publisher', b.publisher),
          kv('Released', b.release_date ? fmtDate(b.release_date) : ''), kv('Purchased', b.purchase_date ? fmtDate(b.purchase_date) : ''),
          kv('File', b.m4b_file || b.mp3_file)),
        el('div', { class: 'bh-grid2 ty-gap' }, el('label', { class: 'bh-field' }, el('span', null, 'Status'), statusSel), el('span')),
        el('label', { class: 'bh-field' }, el('span', null, 'Notes'), notes), err],
      buttons: [{ label: 'Close' }, { label: 'Save', primary: true, onClick: async (close) => {
        err.textContent = '';
        const patch = { read_status: statusSel.value || null, notes: notes.value.trim() || null };
        const { error } = await BH.sb.from('audiobooks').update(patch).eq('id', b.id);
        if (error) { err.textContent = error.message; return; }
        Object.assign(b, patch);
        close(); toast('Saved', 'ok'); renderStats(); renderBody();
      } }],
    });
    /* the long summary is only loaded when a book is opened */
    const { data, error } = await BH.sb.from('audiobooks').select('summary, description').eq('id', b.id).maybeSingle();
    summary.innerHTML = '';
    const text = !error && data ? data.summary || data.description : null;
    if (!text) { summary.append(el('span', { class: 'ty-sub' }, 'No summary.')); return; }
    const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const full = el('div', null, paras.map((p) => el('p', null, p)));
    if (text.length > 600) {
      full.classList.add('clamped');
      summary.append(full, el('button', { type: 'button', class: 'bh-link lb-more-link', onclick: (e) => { full.classList.toggle('clamped'); e.currentTarget.textContent = full.classList.contains('clamped') ? 'Read more' : 'Show less'; } }, 'Read more'));
    } else summary.append(full);
  }

  /* Put a Library book on the Twice Yearly list: after the last book by the same author, else at the end. */
  async function addToTwice(b, btn) {
    const active = S.rotation.filter((r) => r.active);
    const author = (b.authors || 'Unknown').split(',')[0].trim();
    const same = active.filter((r) => r.author.toLowerCase() === author.toLowerCase());
    const after = same.length ? same[same.length - 1] : active[active.length - 1];
    const next = after ? active[active.indexOf(after) + 1] : null;
    let order = after ? after.sort_order + 5 : 10;
    if (next && next.sort_order <= order) order = (active[active.length - 1].sort_order || 0) + 10; // no room: go to the end
    const seq = parseFloat(b.series_seq);
    btn.disabled = true;
    const { error } = await BH.sb.from('audiobook_rotation').insert({
      author, title: short(b.title), series: b.series_name || 'Standalone', series_num: isNaN(seq) ? null : seq,
      length_seconds: b.duration_seconds, audiobook_id: b.id, sort_order: order,
      file_path: b.m4b_file ? 'Audible_m4b\\books\\' + b.m4b_file : null,
    });
    if (error) { btn.disabled = false; return fail(error); }
    toast('Added to Twice Yearly', 'ok');
    try { await load(); } catch (e) { return fail(e); }
    btn.replaceWith(el('a', { class: 'bh-btn sm', href: 'twice-yearly.html' }, ico('repeat'), 'On Twice Yearly'));
    renderBody();
  }

  /* ---------- boot ---------- */
  (async function () {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
      S.user = user;
      if (BH.track) BH.track('audiobooks-library');
      await load();
      renderHead();
      root.innerHTML = '';
      root.append(el('div', { id: 'lb-stats' }), el('div', { id: 'lb-body' }));
      renderStats();
      renderBody();
    } catch (e) {
      root.innerHTML = '';
      root.append(el('div', { class: 'bh-alert' }, e.message || String(e)));
    }
  })();
})();
