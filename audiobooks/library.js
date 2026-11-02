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
 * Media Dropbox (ADMIN > Settings): Scan Dropbox finds files nobody links to; Play / Download / MP3
 *   in each book come from short-lived links made by the audiobooks edge function.
 * New books: Add Book (paste an Audible link; details come from the audiobooks edge function)
 *            and Import (an OpenAudible CSV/Excel export; only fills empty fields on existing books).
 * ============================================================ */
(function () {
  const { el, toast, modal } = BH.ui;
  const LIST_COLS = 'id, audible_key, asin, title, authors, narrators, series_name, series_seq, genre, publisher, release_date, purchase_date, duration_seconds, rating, rating_count, cover_url, m4b_file, mp3_file, read_status, notes, dropbox_path, file_size, pdf_path';
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
  const S = { user: null, media: { connected: false }, books: [], rotation: [], q: '', status: 'all', genre: '', sort: 'author', view: 'grid', limit: 120 };
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
  /* Dropbox web link for a file in Chris's Dropbox (opens Dropbox's own player / viewer) */
  const dbxUrl = (path) => 'https://www.dropbox.com/preview' + String(path).split('/').map(encodeURIComponent).join('/');
  const fileSize = (n) => (n == null ? '' : n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : Math.round(n / 1048576) + ' MB');
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
    const add = el('button', { class: 'bh-btn primary', type: 'button', title: 'Add one book from its Audible link', onclick: openAddBook }, ico('plus'), 'Add Book');
    const imp = el('button', { class: 'bh-btn', type: 'button', title: 'Bring in new books from an OpenAudible export', onclick: openImport }, ico('file-import'), 'Import');
    const scan = S.media.connected && S.media.is_admin ? el('button', { class: 'bh-btn', type: 'button', title: 'Find files in your Dropbox Library folder that no book links to', onclick: openScan }, ico('folder-search'), 'Scan Dropbox') : null;
    acts.append(add, scan, imp, search, sort, view);
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
      el('div', { class: 'lb-row-end' }, statusBadge(b),
        b.dropbox_path ? el('a', { class: 'bh-ib lb-dbx', href: dbxUrl(b.dropbox_path), target: '_blank', rel: 'noopener', title: 'Open in Dropbox', onclick: (e) => e.stopPropagation() }, ico('brand-dropbox')) : null));
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
              b.dropbox_path ? el('a', { class: 'bh-btn sm' + (S.media.connected ? '' : ' primary'), href: dbxUrl(b.dropbox_path), target: '_blank', rel: 'noopener', title: b.dropbox_path }, ico('brand-dropbox'), 'Open in Dropbox') : null,
              b.pdf_path ? el('a', { class: 'bh-btn sm', href: dbxUrl(b.pdf_path), target: '_blank', rel: 'noopener', title: b.pdf_path }, ico('file-type-pdf'), 'Companion PDF') : null,
              b.asin ? el('a', { class: 'bh-btn sm', href: 'https://www.audible.com/pd/' + b.asin, target: '_blank', rel: 'noopener' }, ico('external-link'), 'Audible') : null,
              twice))),
        S.media.connected ? mediaButtons(b) : null,
        summary,
        el('dl', { class: 'bh-kv lb-kv' },
          kv('Series', seriesText(b)), kv('Length', b.duration_seconds != null ? hm(b.duration_seconds) : ''),
          kv('Genre', b.genre ? b.genre.split(':').join(' › ') : ''), kv('Publisher', b.publisher),
          kv('Released', b.release_date ? fmtDate(b.release_date) : ''), kv('Purchased', b.purchase_date ? fmtDate(b.purchase_date) : ''),
          kv('File', (b.m4b_file || b.mp3_file) ? (b.m4b_file || b.mp3_file) + (b.file_size ? ' (' + fileSize(b.file_size) + ')' : '') : '')),
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

  /* ---------- adding books: Add Book (one Audible link) and Import (OpenAudible export) ---------- */
  const BOOKS_DEFAULT = '/_Media/Audiobooks/Audible_m4b/books/';
  const booksDir = () => ((S.media.settings && S.media.settings.library_folder) ? S.media.settings.library_folder.replace(/\/?$/, '/') : BOOKS_DEFAULT);
  const stem = (n) => String(n || '').replace(/\.[^.]+$/, '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const baseName = (p) => String(p || '').split(/[\\/]/).pop().trim();
  const blank = (v) => v == null || v === '';
  /* "https://www.audible.com/pd/Some-Title-Audiobook/B0BLACKCRW?ref=..." or a bare ASIN -> "B0BLACKCRW" */
  function asinFrom(text) {
    const s = String(text || '').trim();
    if (/^[A-Z0-9]{10}$/i.test(s)) return s.toUpperCase();
    let path = s, q = null;
    try { const u = new URL(s); path = u.pathname; q = u.searchParams.get('asin'); } catch (e) { /* not a URL */ }
    if (q && /^[A-Z0-9]{10}$/i.test(q)) return q.toUpperCase();
    const segs = path.split('/').filter((p) => /^[A-Z0-9]{10}$/i.test(p) && /\d/.test(p));
    return segs.length ? segs[segs.length - 1].toUpperCase() : null;
  }
  /* file name in Dropbox -> the m4b/mp3 columns + the Dropbox path the page links to */
  function fileFields(name) {
    let f = baseName(name);
    if (!f) return { m4b_file: null, mp3_file: null, dropbox_path: null };
    if (!/\.(m4b|mp3|m4a|aax)$/i.test(f)) f += '.m4b';
    const mp3 = /\.mp3$/i.test(f);
    return { m4b_file: mp3 ? null : f, mp3_file: mp3 ? f : null, dropbox_path: booksDir() + f };
  }
  function insertBooks(rows) {
    return BH.sb.from('audiobooks').insert(rows).select(LIST_COLS);
  }

  /* ---- Add Book: paste an Audible link, details fill in from the audiobooks edge function ---- */
  function openAddBook(preset) {
    if (!preset || preset instanceof Event) preset = null;
    let book = null;
    const input = el('input', { type: 'text', placeholder: 'Paste an Audible link or ASIN (e.g. B0FXY6DVJS)' });
    const go = el('button', { class: 'bh-btn primary', type: 'button' }, ico('search'), 'Look up');
    const out = el('div', { class: 'lb-add-out' });
    const err = el('div', { class: 'bh-err' });
    const f = {};
    async function lookup() {
      err.textContent = ''; out.innerHTML = ''; book = null;
      const asin = asinFrom(input.value);
      if (!asin) { err.textContent = 'Paste the book\'s Audible page link, or its 10-character ASIN.'; return; }
      const have = S.books.find((b) => String(b.asin || '').toUpperCase() === asin);
      if (have) {
        out.append(el('div', { class: 'bh-info' }, ico('info-circle'),
          el('div', null, 'Already in your Library: ', el('b', null, short(have.title)), '. ',
            el('button', { type: 'button', class: 'bh-link', onclick: () => { m.close(); details(have); } }, 'Open it'))));
        return;
      }
      go.disabled = true; out.append(el('div', { class: 'ty-sub' }, 'Looking up ' + asin + '…'));
      try {
        const res = await BH.callFunction('audiobooks', { action: 'lookup', asin });
        book = res.book;
      } catch (e) { out.innerHTML = ''; err.textContent = e.message || String(e); return; }
      finally { go.disabled = false; }
      out.innerHTML = '';
      out.append(addForm(book));
    }
    function addForm(b) {
      const inp = (k, v, attrs) => (f[k] = el('input', Object.assign({ type: 'text', value: v == null ? '' : v }, attrs || {})));
      const field = (label, node) => el('label', { class: 'bh-field' }, el('span', null, label), node);
      f.status = el('select', null, STATUS.map((s) => el('option', { value: s.id, selected: s.id === 'Unread' }, s.label)));
      const check = el('a', { class: 'bh-btn sm', target: '_blank', rel: 'noopener', title: 'Opens the file in Dropbox if the name is right' }, ico('brand-dropbox'), 'Check in Dropbox');
      inp('file', preset ? preset.file : b.file_guess, { oninput: () => sync() });
      const sync = () => { const p = fileFields(f.file.value).dropbox_path; if (p) check.href = dbxUrl(p); else check.removeAttribute('href'); };
      sync();
      const facts = [b.duration_seconds ? hm(b.duration_seconds) : '', b.release_date ? 'Released ' + fmtDate(b.release_date) : '', genreTop(b.genre), b.publisher].filter(Boolean).join(' · ');
      return el('div', null,
        el('div', { class: 'lb-detail lb-add-head' }, cover(b, 'lb-detail-cover'),
          el('div', null, el('div', { class: 'ty-info-title' }, b.title), el('div', { class: 'lb-by' }, 'by ', el('b', null, b.authors || 'Unknown')),
            b.narrators ? el('div', { class: 'ty-sub lb-wrap' }, 'Narrated by ' + b.narrators) : null,
            el('div', { class: 'ty-sub lb-wrap' }, facts))),
        field('Title', inp('title', b.title)),
        el('div', { class: 'bh-grid2' }, field('Author', inp('authors', b.authors)), field('Narrator', inp('narrators', b.narrators))),
        el('div', { class: 'bh-grid2' }, field('Series', inp('series_name', b.series_name)), field('Book # in series', inp('series_seq', b.series_seq))),
        el('div', { class: 'bh-grid2' }, field('Purchased', inp('purchase_date', today(), { type: 'date' })), field('Status', f.status)),
        field('Dropbox file name (in ' + booksDir().replace(/\/$/, '') + ')', f.file),
        el('div', { class: 'lb-add-check' }, check, el('span', { class: 'ty-sub' }, 'Make sure the name matches before you save.')));
    }
    async function save(close) {
      err.textContent = '';
      if (!book) { err.textContent = 'Look up a book first.'; return; }
      const v = (k) => f[k].value.trim() || null;
      const row = Object.assign({
        owner_id: S.user.id, audible_key: 'ASIN_' + book.asin, asin: book.asin,
        title: v('title') || book.title, authors: v('authors'), narrators: v('narrators'),
        series_name: v('series_name'), series_seq: v('series_seq'),
        genre: book.genre, publisher: book.publisher, release_date: book.release_date, purchase_date: v('purchase_date'),
        duration_seconds: book.duration_seconds, rating: book.rating, language: book.language, abridged: book.abridged,
        cover_url: book.cover_url, summary: book.summary, read_status: f.status.value,
      }, fileFields(f.file.value));
      if (preset && f.file.value.trim() === preset.file) { row.dropbox_path = preset.path; row.file_size = preset.size || null; }
      const { data, error } = await insertBooks([row]);
      if (error) { err.textContent = error.message; return; }
      S.books.push(data[0]);
      close(); toast('Added ' + short(row.title), 'ok'); renderStats(); renderBody();
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(); });
    go.addEventListener('click', lookup);
    const m = modal({
      title: 'Add Book', wide: true,
      body: [preset ? el('div', { class: 'bh-info lb-add-for' }, ico('file-music'), el('div', null, 'For ', el('b', null, preset.file), '. Paste the book\'s Audible link to fill in its details.')) : null,
        el('div', { class: 'lb-lookup' }, input, go), out, err],
      buttons: [{ label: 'Close' }, { label: 'Add to Library', primary: true, onClick: save }],
    });
  }

  /* ---- Import: an OpenAudible export (CSV / Excel) or the Twice-Yearly workbook ---- */
  const COLS = {
    key: ['key', 'audiblekey', 'bookkey', 'productid'],
    asin: ['asin'],
    title: ['title', 'fulltitle', 'booktitle'],
    authors: ['author', 'authors'],
    narrators: ['narratedby', 'narrator', 'narrators'],
    series_name: ['seriesname', 'series'],
    series_seq: ['seriessequence', 'seriesseq', 'seriesnumber', 'seriesnum', '#'],
    genre: ['genre', 'genres'],
    publisher: ['publisher'],
    release_date: ['releasedate', 'released', 'releasedon'],
    purchase_date: ['purchasedate', 'purchased', 'datepurchased', 'dateadded'],
    duration: ['duration', 'length', 'runtime'],
    rating: ['averating', 'averagerating', 'avgrating', 'rating'],
    rating_count: ['ratingcount', 'ratings', 'numratings', 'numberofratings'],
    abridged: ['abridged'],
    language: ['language'],
    summary: ['summary'],
    description: ['description'],
    cover_url: ['imageurl', 'coverurl', 'cover', 'image'],
    file: ['filename', 'file', 'm4bfile', 'm4b', 'filepath'],
    finished: ['readstatus', 'finished', 'isfinished', 'listeningstatus', 'status'],
  };
  const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9#]/g, '');
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => ok(window.XLSX);
      s.onerror = () => bad(new Error('Could not load the spreadsheet reader. Check your connection and try again.'));
      document.head.appendChild(s);
    });
  }
  /* find the header row (first 15 rows) that has a title plus a key or ASIN column */
  function findTable(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const hs = (rows[i] || []).map(norm);
      const idx = {};
      Object.keys(COLS).forEach((k) => { for (const a of COLS[k]) { const j = hs.indexOf(a); if (j >= 0) { idx[k] = j; break; } } });
      if (idx.title != null && (idx.key != null || idx.asin != null)) return { at: i, idx, names: rows[i] };
    }
    return null;
  }
  function isoDate(v) {
    if (blank(v)) return null;
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 43200000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[1]) + '-' + pad(m[2]);
    const t = Date.parse(s);
    return isNaN(t) ? null : isoDate(new Date(t));
  }
  function seconds(v) {
    if (blank(v)) return null;
    if (v instanceof Date && !isNaN(v)) return Math.round((v.getTime() - Date.UTC(1899, 11, 30)) / 1000);
    if (typeof v === 'number') return v < 5 ? Math.round(v * 86400) : v < 5000 ? Math.round(v * 60) : Math.round(v);
    const s = String(v).trim();
    if (/^\d+(:\d{1,2}){1,2}$/.test(s)) { const p = s.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 3600 + p[1] * 60; }
    const h = s.match(/(\d+)\s*h/i), mi = s.match(/(\d+)\s*m/i);
    if (h || mi) return (h ? +h[1] * 3600 : 0) + (mi ? +mi[1] * 60 : 0);
    const n = parseFloat(s); return isNaN(n) ? null : seconds(n);
  }
  const numOr = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const text = (v) => (blank(v) ? null : String(v instanceof Date ? isoDate(v) : v).trim() || null);
  function rowToBook(r, idx) {
    const g = (k) => (idx[k] == null ? null : r[idx[k]]);
    const cov = text(g('cover_url'));
    const fin = text(g('finished'));
    const rating = numOr(g('rating')), count = numOr(g('rating_count'));
    return {
      key: text(g('key')), asin: text(g('asin')) ? text(g('asin')).toUpperCase() : null,
      title: text(g('title')), authors: text(g('authors')), narrators: text(g('narrators')),
      series_name: text(g('series_name')), series_seq: text(g('series_seq')), genre: text(g('genre')), publisher: text(g('publisher')),
      release_date: isoDate(g('release_date')), purchase_date: isoDate(g('purchase_date')), duration_seconds: seconds(g('duration')),
      rating: rating != null && rating > 0 && rating <= 5 ? Math.round(rating * 100) / 100 : null,
      rating_count: count != null ? Math.round(count) : null,
      abridged: blank(g('abridged')) ? null : /^(true|yes|y|1|abridged)$/i.test(String(g('abridged')).trim()),
      language: text(g('language')), summary: text(g('summary')), description: text(g('description')),
      cover_url: cov && /^https?:\/\//i.test(cov) ? cov : null,
      file: text(g('file')),
      finished: !!fin && /^(finished|true|yes|y|1|read|complete|completed|done)$/i.test(fin),
    };
  }
  const FILL = ['asin', 'title', 'authors', 'narrators', 'series_name', 'series_seq', 'genre', 'publisher', 'release_date', 'purchase_date', 'duration_seconds', 'cover_url'];

  /* compare the file with the Library: what is new, what gets filled in, what is left alone */
  async function planImport(rows, idx) {
    const byKey = new Map(), byAsin = new Map();
    S.books.forEach((b) => { if (b.audible_key) byKey.set(b.audible_key.toLowerCase(), b); if (b.asin) byAsin.set(String(b.asin).toUpperCase(), b); });
    const { data: noText, error } = await BH.sb.from('audiobooks').select('id').eq('owner_id', S.user.id).is('summary', null).is('description', null);
    if (error) throw error;
    const needsText = new Set((noText || []).map((r) => r.id));
    const plan = { add: [], update: [], ratings: 0, same: 0, skipped: 0 };
    const seen = new Set();
    rows.forEach((r) => {
      const x = rowToBook(r, idx);
      if (!x.title || (!x.key && !x.asin)) { if (r.some((c) => !blank(c))) plan.skipped++; return; }
      const id = (x.key || '').toLowerCase() + '|' + (x.asin || '');
      if (seen.has(id)) return; seen.add(id);
      const have = (x.key && byKey.get(x.key.toLowerCase())) || (x.asin && byAsin.get(x.asin));
      if (!have) {
        const ff = fileFields(x.file);
        plan.add.push(Object.assign({
          owner_id: S.user.id, audible_key: x.key || 'ASIN_' + x.asin, asin: x.asin, title: x.title, authors: x.authors, narrators: x.narrators,
          series_name: x.series_name, series_seq: x.series_seq, genre: x.genre, publisher: x.publisher,
          release_date: x.release_date, purchase_date: x.purchase_date, duration_seconds: x.duration_seconds,
          rating: x.rating, rating_count: x.rating_count, abridged: x.abridged, language: x.language,
          summary: x.summary, description: x.description, cover_url: x.cover_url,
          read_status: x.finished ? 'Finished' : 'Unread',
        }, ff));
        return;
      }
      /* existing book: only fill what is empty, never undo edits made on the site */
      const patch = {}, why = [];
      FILL.forEach((k) => { if (blank(have[k]) && !blank(x[k])) patch[k] = x[k]; });
      if (x.key && /^ASIN_/.test(have.audible_key || '')) patch.audible_key = x.key;
      if (needsText.has(have.id)) { if (x.summary) patch.summary = x.summary; if (x.description) patch.description = x.description; }
      if (!have.m4b_file && !have.mp3_file && x.file) { const ff = fileFields(x.file); patch.m4b_file = ff.m4b_file; patch.mp3_file = ff.mp3_file; }
      if (!have.dropbox_path) { const p = fileFields(patch.m4b_file || patch.mp3_file || have.m4b_file || have.mp3_file).dropbox_path; if (p) patch.dropbox_path = p; }
      if (Object.keys(patch).length) why.push('details filled in');
      if (x.finished && have.read_status !== 'Finished') { patch.read_status = 'Finished'; why.push('marked Finished'); }
      let rated = false;
      if (x.rating != null && Number(have.rating) !== x.rating) { patch.rating = x.rating; rated = true; }
      if (x.rating_count != null && have.rating_count !== x.rating_count) { patch.rating_count = x.rating_count; rated = true; }
      if (why.length) plan.update.push({ book: have, patch, why });
      else if (rated) { plan.ratings++; plan.update.push({ book: have, patch, why: ['rating'] }); }
      else plan.same++;
    });
    return plan;
  }

  function openImport() {
    let plan = null;
    const pick = el('input', { type: 'file', accept: '.csv,.xlsx,.xlsm,.xls,.tsv' });
    const out = el('div', { class: 'lb-imp-out' });
    const err = el('div', { class: 'bh-err' });
    pick.addEventListener('change', async () => {
      err.textContent = ''; out.innerHTML = ''; plan = null;
      const file = pick.files[0];
      if (!file) return;
      out.append(el('div', { class: 'ty-sub' }, 'Reading ' + file.name + '…'));
      try {
        const X = await loadSheetJS();
        const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const names = wb.SheetNames.slice().sort((a, b) => (b.toLowerCase() === 'books') - (a.toLowerCase() === 'books'));
        let table = null, rows = null, sheet = null;
        for (const n of names) {
          const r = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
          const t = findTable(r);
          if (t) { table = t; rows = r; sheet = n; break; }
        }
        if (!table) throw new Error('Could not find a list of books in ' + file.name + '. It needs a Title column and a Key or ASIN column.');
        plan = await planImport(rows.slice(table.at + 1), table.idx);
        out.innerHTML = '';
        out.append(planView(plan, file.name, wb.SheetNames.length > 1 ? sheet : null));
      } catch (e) { out.innerHTML = ''; err.textContent = e.message || String(e); }
    });
    function planView(p, fname, sheet) {
      const filled = p.update.filter((u) => u.why[0] !== 'rating');
      const finished = filled.filter((u) => u.why.includes('marked Finished')).length;
      const line = (n, label) => el('li', null, el('b', null, String(n)), ' ' + label);
      return el('div', null,
        el('div', { class: 'ty-sub' }, 'From ' + fname + (sheet ? ' (sheet "' + sheet + '")' : '') + ':'),
        el('ul', { class: 'lb-imp-sum' },
          line(p.add.length, p.add.length === 1 ? 'new book to add' : 'new books to add'),
          line(filled.length, 'existing books get empty details filled in' + (finished ? ' (' + finished + ' marked Finished)' : '')),
          line(p.ratings, 'just get a fresh Audible rating'),
          line(p.same, 'already up to date'),
          p.skipped ? line(p.skipped, (p.skipped === 1 ? 'row' : 'rows') + ' skipped (no title, key or ASIN)') : null),
        p.add.length ? el('div', { class: 'lb-imp-new' }, el('div', { class: 'lb-imp-h' }, 'New books'),
          p.add.slice(0, 40).map((b) => el('div', { class: 'ty-sub' }, short(b.title) + (b.authors ? ' · ' + b.authors.split(',')[0] : ''))),
          p.add.length > 40 ? el('div', { class: 'ty-sub' }, '…and ' + (p.add.length - 40) + ' more') : null) : null,
        el('div', { class: 'bh-info lb-imp-note' }, ico('shield-check'),
          el('div', null, 'Statuses, notes, titles you edited, Dropbox links and your Twice Yearly list are never changed by an import.')));
    }
    async function apply(close) {
      err.textContent = '';
      if (!plan) { err.textContent = 'Choose a file first.'; return; }
      if (!plan.add.length && !plan.update.length) { close(); toast('Nothing to import - your Library is up to date', 'ok'); return; }
      const btn = m.overlay.querySelector('.bh-mfoot .primary');
      btn.disabled = true; btn.textContent = 'Importing…';
      try {
        for (let i = 0; i < plan.add.length; i += 100) {
          const { error } = await insertBooks(plan.add.slice(i, i + 100));
          if (error) throw error;
        }
        for (let i = 0; i < plan.update.length; i += 10) {
          const res = await Promise.all(plan.update.slice(i, i + 10).map((u) => BH.sb.from('audiobooks').update(u.patch).eq('id', u.book.id)));
          const bad = res.find((r) => r.error); if (bad) throw bad.error;
        }
        await load();
      } catch (e) { btn.disabled = false; btn.textContent = 'Import'; err.textContent = e.message || String(e); return; }
      close();
      toast('Imported: ' + plan.add.length + ' new, ' + plan.update.length + ' updated', 'ok');
      renderStats(); renderBody();
    }
    const m = modal({
      title: 'Import from OpenAudible', wide: true,
      body: [el('div', { class: 'ty-sub lb-imp-intro' }, 'Choose an OpenAudible export (CSV or Excel), or your Twice-Yearly workbook. You see what will change before anything is saved.'),
        el('label', { class: 'bh-field' }, el('span', null, 'Export file'), pick), out, err],
      buttons: [{ label: 'Close' }, { label: 'Import', primary: true, onClick: apply }],
    });
  }

  /* ---------- Media Dropbox: play / download links and Scan Dropbox ---------- */
  const callMedia = (action, payload) => BH.callFunction('audiobooks', Object.assign({ action }, payload));
  /* Play + download buttons in a book's details window (short-lived links from the server) */
  function mediaButtons(b) {
    const wrap = el('div', { class: 'lb-media' }, el('span', { class: 'ty-sub' }, ico('loader-2'), ' Getting play links…'));
    callMedia('media_links', { id: b.id }).then((r) => {
      wrap.innerHTML = '';
      if (!r.play && !r.mp3) { wrap.append(el('span', { class: 'ty-sub' }, 'No audio file found in Dropbox for this book.')); return; }
      const player = el('div', { class: 'lb-player bh-gone' });
      const acts = el('div', { class: 'lb-media-acts' });
      if (r.play) {
        acts.append(el('button', { class: 'bh-btn sm primary', type: 'button', onclick: (e) => {
          if (!player.firstChild) player.append(el('audio', { controls: true, autoplay: true, preload: 'none', src: r.play.url }));
          player.classList.remove('bh-gone'); e.currentTarget.remove();
        } }, ico('player-play'), 'Play'));
        acts.append(el('a', { class: 'bh-btn sm', href: r.play.url, rel: 'noopener', title: r.play.name }, ico('download'), 'Download' + (r.play.size ? ' (' + fileSize(r.play.size) + ')' : '')));
      }
      if (r.mp3 && (!r.play || r.mp3.url !== r.play.url)) acts.append(el('a', { class: 'bh-btn sm', href: r.mp3.url, rel: 'noopener', title: r.mp3.name }, ico('file-music'), 'MP3' + (r.mp3.size ? ' (' + fileSize(r.mp3.size) + ')' : '')));
      wrap.append(acts, player);
    }, (e) => { wrap.innerHTML = ''; wrap.append(el('span', { class: 'ty-sub' }, 'Play links unavailable: ' + (e.message || e))); });
    return wrap;
  }

  /* Scan Dropbox: files in the Library folder that no book links to */
  async function openScan() {
    const out = el('div', { class: 'lb-scan' }, el('div', { class: 'ty-sub' }, 'Scanning your Library folder in Dropbox…'));
    const err = el('div', { class: 'bh-err' });
    const picks = new Map();   // file path -> plan entry
    const m = modal({ title: 'Scan Dropbox', wide: true, body: [out, err],
      buttons: [{ label: 'Close' }, { label: 'Add Selected', primary: true, onClick: apply }] });
    const btn = m.overlay.querySelector('.bh-mfoot .primary');
    btn.disabled = true;
    let res;
    try { res = await callMedia('media_scan'); } catch (e) { out.innerHTML = ''; err.textContent = e.message || String(e); return; }
    out.innerHTML = '';
    const byKey = new Map(), byAsin = new Map();
    S.books.forEach((b) => { if (b.audible_key) byKey.set(b.audible_key.toLowerCase(), b); if (b.asin) byAsin.set(String(b.asin).toUpperCase(), b); });
    out.append(el('div', { class: 'ty-sub lb-wrap' }, res.total + ' audio files in ', el('code', null, res.folder), ' · ' + res.linked + ' already in your Library · ',
      el('b', null, res.items.length + ' not linked')));
    if (!res.items.length) { out.append(el('div', { class: 'bh-info lb-scan-done' }, ico('circle-check'), el('div', null, 'Every file in the folder is linked to a book. Nothing to add.'))); return; }
    const list = el('div', { class: 'lb-scan-list' });
    const count = () => { const n = Array.from(picks.values()).filter((p) => p.on).length; btn.disabled = !n; btn.textContent = n ? 'Add Selected (' + n + ')' : 'Add Selected'; };
    res.items.sort((a, b) => cmp(a.name, b.name)).forEach((it) => {
      const bk = it.book;
      const have = bk && ((bk.key && byKey.get(String(bk.key).toLowerCase())) || (bk.asin && byAsin.get(String(bk.asin).toUpperCase())));
      const p = { it, have, on: !!bk };
      const tag = !bk ? el('span', { class: 'lb-scan-tag none' }, 'No details')
        : have ? el('span', { class: 'lb-scan-tag link' }, 'Link to existing') : el('span', { class: 'lb-scan-tag new' }, 'New');
      const box = el('input', { type: 'checkbox', checked: p.on, disabled: !bk, onchange: (e) => { p.on = e.target.checked; count(); } });
      const what = !bk
        ? el('div', { class: 'ty-sub lb-wrap' }, 'Not in OpenAudible\'s books.json. ',
          el('button', { type: 'button', class: 'bh-link', onclick: () => { m.close(); openAddBook({ file: it.name, path: it.path, size: it.size }); } }, 'Add it with an Audible link'),
          ' · ', el('a', { class: 'bh-link', href: 'https://www.audible.com/search?keywords=' + encodeURIComponent(short(stem(it.name))), target: '_blank', rel: 'noopener' }, 'search Audible'))
        : have ? el('div', { class: 'ty-sub lb-wrap' }, 'Same book as "' + short(have.title) + '" - its Dropbox link will point to this file.')
          : el('div', { class: 'ty-sub lb-wrap' }, [bk.authors, bk.series_name ? bk.series_name + (bk.series_seq ? ' #' + bk.series_seq : '') : '', bk.duration_seconds ? hm(bk.duration_seconds) : '', bk.finished ? 'Finished' : ''].filter(Boolean).join(' · '));
      list.append(el('label', { class: 'lb-scan-row' + (bk ? '' : ' off') }, box,
        bk && bk.cover_url ? el('img', { class: 'ty-cover', src: bk.cover_url, alt: '', loading: 'lazy' }) : el('div', { class: 'ty-cover none' }, ico('headphones')),
        el('div', { class: 'lb-scan-main' },
          el('div', { class: 'ty-name' }, bk ? short(bk.title) : stem(it.name), ' ', tag),
          what,
          el('div', { class: 'ty-sub' }, it.name + (it.size ? ' · ' + fileSize(it.size) : '')))));
      picks.set(it.path, p);
    });
    out.append(list);
    count();

    async function apply(close) {
      err.textContent = '';
      const chosen = Array.from(picks.values()).filter((p) => p.on && p.it.book);
      if (!chosen.length) return;
      btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const adds = [], links = [];
        chosen.forEach(({ it, have }) => {
          const ff = fileFields(it.name); ff.dropbox_path = it.path;
          if (have) { links.push({ id: have.id, patch: Object.assign(ff, { file_size: it.size || null }) }); return; }
          const bk = it.book;
          adds.push(Object.assign({
            owner_id: S.user.id, audible_key: bk.key || (bk.asin ? 'ASIN_' + bk.asin : 'FILE_' + stem(it.name)), asin: bk.asin,
            title: bk.title, authors: bk.authors, narrators: bk.narrators, series_name: bk.series_name, series_seq: bk.series_seq,
            genre: bk.genre, publisher: bk.publisher, release_date: bk.release_date, purchase_date: bk.purchase_date,
            duration_seconds: bk.duration_seconds, rating: bk.rating, rating_count: bk.rating_count, abridged: bk.abridged,
            language: bk.language, description: bk.description, summary: bk.summary, cover_url: bk.cover_url,
            read_status: bk.finished ? 'Finished' : 'Unread', file_size: it.size || null,
          }, ff));
        });
        if (adds.length) { const { error } = await insertBooks(adds); if (error) throw error; }
        for (const l of links) { const { error } = await BH.sb.from('audiobooks').update(l.patch).eq('id', l.id); if (error) throw error; }
        await load();
        close();
        toast((adds.length ? adds.length + ' added' : '') + (adds.length && links.length ? ', ' : '') + (links.length ? links.length + ' linked' : ''), 'ok');
        renderStats(); renderBody();
      } catch (e) { err.textContent = e.message || String(e); btn.disabled = false; count(); }
    }
  }

  /* ---------- boot ---------- */
  (async function () {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
      S.user = user;
      if (BH.track) BH.track('audiobooks-library');
      await load();
      try { S.media = await BH.callFunction('audiobooks', { action: 'media_status' }); } catch (e) { /* no Media connection - Dropbox links only */ }
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
