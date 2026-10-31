/* bellhive99.com - Pictures: every SmugMug gallery (public and private) for signed-in users.
 * Data comes from the `smugmug` edge function, which holds the SmugMug keys. */
(function () {
  const { el, toast, modal } = BH.ui;
  const head = document.getElementById('pic-head');
  const mc = document.getElementById('mc');
  const call = (action, payload) => BH.callFunction('smugmug', Object.assign({ action }, payload));
  const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>';

  let status = null;
  let albums = null;               // cached album list
  const view = { q: '', sort: 'updated', folder: '' };

  const fmtMonth = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');
  const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const folderOf = (a) => { const p = (a.path || '').split('/').filter(Boolean); p.pop(); return p.join(' / '); };
  const title = (crumb, h1, sub) => head.replaceChildren(el('div', { class: 'bh-page-head' },
    el('div', null, el('div', { class: 'crumb' }, crumb), el('h1', null, h1), sub ? el('div', { class: 'pic-sub' }, sub) : null)));
  const fail = (e) => mc.replaceChildren(el('div', { class: 'bh-alert' }, e.message || String(e)));

  async function start() {
    try {
      const { user } = await BH.init();
      if (!user) return BH.requireLogin();
    } catch (e) { return fail(e); }
    BH.track('pictures');
    try { status = await call('status'); }
    catch (e) { title('bellhive99', 'Pictures'); return fail(e); }
    window.addEventListener('hashchange', route);
    route();
  }

  function route() {
    if (!status.connected) return showConnect();
    const m = location.hash.match(/^#album\/([A-Za-z0-9]+)/);
    if (m) showAlbum(m[1]); else showAlbums();
  }

  /* ================= albums ================= */
  async function showAlbums() {
    title('bellhive99', 'Pictures', status.nickname ? ['From SmugMug · ', el('a', { href: 'https://' + status.nickname + '.smugmug.com', target: '_blank', rel: 'noopener' }, status.nickname + '.smugmug.com')] : null);
    if (!albums) {
      mc.replaceChildren(el('div', { class: 'bh-empty' }, 'Loading galleries from SmugMug…'));
      try { albums = (await call('albums')).albums || []; } catch (e) { return fail(e); }
    }
    const folders = [...new Set(albums.map(folderOf).filter(Boolean))].sort();
    const search = el('input', { type: 'search', placeholder: 'Search galleries…', value: view.q, 'aria-label': 'Search galleries' });
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { view.q = search.value; drawGrid(); }, 150); });
    const sortSel = el('select', { 'aria-label': 'Sort', onchange: (e) => { view.sort = e.target.value; drawGrid(); } },
      [['updated', 'Recently updated'], ['date', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'A–Z']].map(([v, l]) => el('option', { value: v, selected: view.sort === v }, l)));
    const folderSel = folders.length ? el('select', { 'aria-label': 'Folder', onchange: (e) => { view.folder = e.target.value; drawGrid(); } },
      [el('option', { value: '' }, 'All folders')].concat(folders.map((f) => el('option', { value: f, selected: view.folder === f }, f)))) : null;
    const tools = el('div', { class: 'pic-tools' }, search, folderSel, sortSel,
      el('button', { class: 'bh-btn', type: 'button', title: 'Reload from SmugMug', onclick: async () => {
        mc.replaceChildren(el('div', { class: 'bh-empty' }, 'Refreshing…'));
        try { albums = (await call('albums', { refresh: true })).albums || []; showAlbums(); } catch (e) { fail(e); }
      } }, 'Refresh'));
    const gridHost = el('div');
    mc.replaceChildren(tools, gridHost, footer());

    function drawGrid() {
      const q = view.q.trim().toLowerCase();
      let list = albums.filter((a) => (!view.folder || folderOf(a) === view.folder) &&
        (!q || (a.name + ' ' + a.description + ' ' + a.path).toLowerCase().includes(q)));
      const by = {
        updated: (a, b) => String(b.updated || '').localeCompare(String(a.updated || '')),
        date: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
        oldest: (a, b) => String(a.date || '').localeCompare(String(b.date || '')),
        name: (a, b) => a.name.localeCompare(b.name),
      }[view.sort];
      list = list.slice().sort(by);
      gridHost.replaceChildren(list.length
        ? el('div', { class: 'pic-albums' }, list.map(card))
        : el('div', { class: 'bh-card bh-empty' }, albums.length ? 'No galleries match.' : 'No galleries found on SmugMug.'));
      gridHost.prepend(el('div', { class: 'pic-sub', style: 'margin:-4px 2px 10px' }, list.length + ' of ' + albums.length + ' galleries'));
    }
    drawGrid();
  }

  function card(a) {
    const img = a.cover ? el('img', { src: a.cover, alt: '', loading: 'lazy', onerror: (e) => { if (a.cover_small && e.target.src !== a.cover_small) e.target.src = a.cover_small; else e.target.remove(); } }) : null;
    const folder = folderOf(a);
    return el('a', { class: 'pic-album', href: '#album/' + a.key },
      el('div', { class: 'pic-cover' }, img || el('div', { class: 'pic-none' }, 'No cover'),
        a.privacy && a.privacy !== 'Public' ? el('span', { class: 'pic-lock', html: LOCK + ' ' + a.privacy }) : null),
      el('div', { class: 'pic-meta' },
        folder ? el('div', { class: 'pic-folder' }, folder) : null,
        el('div', { class: 'pic-name' }, a.name),
        el('div', { class: 'pic-info' }, [a.count != null ? a.count + (a.count === 1 ? ' photo' : ' photos') : null, fmtMonth(a.date || a.updated)].filter(Boolean).join(' · '))));
  }

  /* ================= one album ================= */
  async function showAlbum(key) {
    const known = albums && albums.find((a) => a.key === key);
    title('Pictures', known ? known.name : 'Gallery');
    mc.replaceChildren(el('div', { class: 'bh-empty' }, 'Loading photos…'));
    window.scrollTo(0, 0);
    let images = [], next = 1, album = known || null, loading = false;
    const grid = el('div', { class: 'pic-grid' });
    const more = el('div', { class: 'pic-more' });

    async function loadPage() {
      if (loading || !next) return;
      loading = true;
      more.replaceChildren(el('span', { class: 'pic-sub' }, 'Loading…'));
      try {
        const r = await call('images', { album_key: key, start: next });
        if (r.album) album = Object.assign({}, album, r.album);
        const from = images.length;
        images = images.concat(r.images || []);
        next = r.next;
        r.images.forEach((im, i) => grid.appendChild(thumb(im, from + i)));
        if (from === 0) drawHeader(r.total);
      } catch (e) { more.replaceChildren(el('div', { class: 'bh-alert' }, e.message)); loading = false; return; }
      loading = false;
      more.replaceChildren(next ? el('button', { class: 'bh-btn', type: 'button', onclick: loadPage }, 'Load more photos') : null);
    }
    function drawHeader(total) {
      title('Pictures', (album && album.name) || 'Gallery',
        [((total ?? (album && album.count)) != null ? (total ?? album.count) + ' photos' : ''),
          album && album.privacy && album.privacy !== 'Public' ? ' · ' + album.privacy : '',
          album && album.url ? [' · ', el('a', { href: album.url, target: '_blank', rel: 'noopener' }, 'Open on SmugMug ↗')] : null]);
      mc.replaceChildren(
        el('a', { class: 'pic-back', href: '#', onclick: (e) => { e.preventDefault(); location.hash = ''; } }, '← All galleries'),
        album && album.description ? el('p', { class: 'pic-desc' }, album.description) : null,
        images.length ? grid : el('div', { class: 'bh-card bh-empty' }, 'This gallery has no photos.'),
        more);
    }
    function thumb(im, i) {
      return el('button', { class: 'pic-thumb', type: 'button', title: im.title || im.caption || im.file, onclick: () => lightbox(images, i, () => next && loadPage()) },
        el('img', { src: im.thumb, alt: im.title || im.caption || '', loading: 'lazy' }),
        im.video ? el('span', { class: 'pic-play', html: '<span>' + PLAY + '</span>' }) : null);
    }
    // load more automatically when the bottom comes into view
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) loadPage(); }, { rootMargin: '600px' }).observe(more);
    }
    await loadPage();
  }

  /* ================= lightbox ================= */
  function lightbox(list, index, needMore) {
    let i = index;
    const img = el('img', { alt: '' });
    const counter = el('span');
    const cap = el('div', { class: 'pic-lb-cap' });
    const link = el('a', { target: '_blank', rel: 'noopener' }, 'View on SmugMug ↗');
    const videoBtn = el('a', { class: 'bh-btn primary pic-lb-video', target: '_blank', rel: 'noopener' }, '▶ Play video on SmugMug');
    const close = () => { document.removeEventListener('keydown', onKey); lb.remove(); };
    const go = (d) => {
      i = Math.max(0, Math.min(list.length - 1, i + d));
      if (i >= list.length - 3 && needMore) needMore();
      show();
    };
    const lb = el('div', { class: 'pic-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo viewer' },
      el('div', { class: 'pic-lb-top' }, counter, el('span', { class: 'grow' }), link,
        el('button', { class: 'pic-lb-btn', type: 'button', 'aria-label': 'Close', onclick: close }, '×')),
      el('div', { class: 'pic-lb-stage', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
        img, videoBtn,
        el('button', { class: 'pic-lb-btn pic-lb-prev', type: 'button', 'aria-label': 'Previous photo', onclick: () => go(-1) }, '‹'),
        el('button', { class: 'pic-lb-btn pic-lb-next', type: 'button', 'aria-label': 'Next photo', onclick: () => go(1) }, '›')),
      cap);
    function show() {
      const im = list[i];
      img.src = im.medium;                       // quick first paint
      const big = new Image();
      big.onload = () => { if (list[i] === im) img.src = im.large; };
      big.src = im.large;
      [list[i + 1], list[i - 1]].forEach((n) => { if (n) new Image().src = n.large; });   // preload neighbours
      img.alt = im.title || im.caption || im.file || '';
      counter.textContent = (i + 1) + ' / ' + list.length;
      link.href = im.url || '#';
      videoBtn.style.display = im.video ? '' : 'none';
      videoBtn.href = im.url || '#';
      cap.replaceChildren(el('span', null, im.title || im.caption || im.file || ''), el('small', null, [fmtDay(im.date), im.title && im.caption ? im.caption : ''].filter(Boolean).join(' · ')));
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }
    let x0 = null;
    lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(lb);
    show();
  }

  /* ================= connect (admins) ================= */
  function showConnect() {
    title('bellhive99', 'Pictures');
    if (!status.is_admin) {
      mc.replaceChildren(el('div', { class: 'bh-card bh-empty' }, "Pictures aren't connected to SmugMug yet. An admin needs to connect it."));
      return;
    }
    const key = el('input', { placeholder: 'API Key', autocomplete: 'off', spellcheck: false });
    const secret = el('input', { type: 'password', placeholder: 'API Secret', autocomplete: 'off' });
    const code = el('input', { class: 'pic-code', inputMode: 'numeric', maxLength: 10, placeholder: '000000', autocomplete: 'one-time-code' });
    const err1 = el('div', { class: 'bh-err', style: 'text-align:left' });
    const err2 = el('div', { class: 'bh-err', style: 'text-align:left' });
    const step2 = el('div', { class: 'pic-step', style: 'opacity:.45' });
    const goBtn = el('button', { class: 'bh-btn primary', type: 'button' }, 'Continue to SmugMug →');
    const finishBtn = el('button', { class: 'bh-btn primary', type: 'button', disabled: true }, 'Finish');

    goBtn.addEventListener('click', async () => {
      err1.textContent = '';
      if (!status.has_key && (!key.value.trim() || !secret.value.trim())) { err1.textContent = 'Paste both the API Key and the API Secret.'; return; }
      const win = window.open('about:blank', '_blank');   // open now so pop-up blockers allow it
      goBtn.disabled = true; goBtn.textContent = 'Contacting SmugMug…';
      try {
        const r = await call('connect_start', { api_key: key.value.trim() || undefined, api_secret: secret.value.trim() || undefined });
        if (win) win.location.href = r.authorize_url; else window.open(r.authorize_url, '_blank');
        step2.style.opacity = '1'; finishBtn.disabled = false; code.focus();
        goBtn.textContent = 'Open the SmugMug approval page again';
        goBtn.onclick = () => window.open(r.authorize_url, '_blank');
      } catch (e) { if (win) win.close(); err1.textContent = e.message; goBtn.textContent = 'Continue to SmugMug →'; }
      finally { goBtn.disabled = false; }
    });
    finishBtn.addEventListener('click', async () => {
      err2.textContent = '';
      if (!code.value.trim()) { err2.textContent = 'Type the code SmugMug showed you.'; return; }
      finishBtn.disabled = true; finishBtn.textContent = 'Connecting…';
      try {
        const r = await call('connect_finish', { verifier: code.value.trim() });
        BH.audit('smugmug_connect', 'connected SmugMug account ' + (r.nickname || ''), null, 'admin');
        toast('Connected to SmugMug as ' + r.nickname, 'ok');
        status = await call('status'); albums = null; route();
      } catch (e) { err2.textContent = e.message; finishBtn.disabled = false; finishBtn.textContent = 'Finish'; }
    });

    step2.append(el('span', { class: 'pic-step-n' }, '2'), el('div', { class: 'pic-step-body' },
      el('b', null, 'Approve on SmugMug'),
      el('p', null, 'A SmugMug tab opens asking to let bellhive99 view your photos (read-only). Approve it, then type the 6-digit code it shows.'),
      el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, code, finishBtn), err2));

    mc.replaceChildren(el('div', { class: 'bh-card bh-card-pad pic-connect' },
      el('h2', null, 'Connect SmugMug'),
      el('p', { class: 'bh-note' }, 'One-time setup. Once connected, everyone signed in to bellhive99 sees all of your galleries here, public and private. Only the site can read your SmugMug keys.'),
      el('div', { class: 'pic-step' }, el('span', { class: 'pic-step-n' }, '1'), el('div', { class: 'pic-step-body' },
        el('b', null, 'Get an API key'),
        status.has_key
          ? el('p', null, 'An API key is already saved. Just continue.')
          : el('p', null, 'Open ', el('a', { href: 'https://api.smugmug.com/api/developer/apply', target: '_blank', rel: 'noopener', class: 'bh-link' }, 'SmugMug API key application ↗'),
            ', sign in, and apply for a key (name it "bellhive99", type: Application, for personal use). Then copy the Key and Secret here.'),
        status.has_key ? null : el('div', { class: 'bh-grid2' }, el('label', { class: 'bh-field' }, el('span', null, 'API Key'), key), el('label', { class: 'bh-field' }, el('span', null, 'API Secret'), secret)),
        goBtn, err1)),
      step2));
  }

  function footer() {
    if (!status.is_admin) return null;
    return el('div', { class: 'pic-foot' }, 'SmugMug connected as ' + (status.nickname || '?') + ' · ',
      el('button', { class: 'bh-btn sm', type: 'button', onclick: () => modal({
        title: 'Disconnect SmugMug',
        body: el('p', { class: 'bh-note' }, 'The Pictures page will stop showing galleries until an admin connects again. Nothing on SmugMug is changed.'),
        buttons: [{ label: 'Cancel' }, { label: 'Disconnect', primary: true, onClick: async (close) => {
          try { await call('disconnect'); BH.audit('smugmug_disconnect', 'disconnected SmugMug', null, 'admin'); close(); status = await call('status'); albums = null; route(); }
          catch (e) { toast(e.message, 'error'); }
        } }],
      }) }, 'Disconnect'));
  }

  start();
})();
